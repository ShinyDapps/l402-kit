import type { Env } from "../../worker";
import type { Lead, Persona } from "../radar/types";
import { scoreSignal, detectFramework, queueKey, isBuyerLead } from "../radar/scoring";
import { enqueue, seenBefore, markSeen } from "../radar/queue";
import { acquireRadarLock, releaseRadarLock } from "../radar/lock";
import { draftOutreach, storeDraft } from "../radar/outreach";

// ─── Buyer discovery queries ─────────────────────────────────────────────────

// Notes:
//   - site:github.com/issues does not work in Google — filter via isOpenGitHubIssue() later
//   - Excludes from L402 infra orgs (lightninglabs, l402-protocol, Fewsats) so queries
//     don't return what isBuyerLead() will reject anyway
//   - Diversifies sources beyond GitHub to find real buyers asking on SO/dev.to/Reddit
const HUMAN_QUERIES = [
  '(stackoverflow.com OR dev.to OR hashnode.dev) "how do I charge" OR "monetize my api" OR "pay per call" api',
  'site:github.com "add payments" OR "add billing" express OR fastapi OR axum OR gin -lightninglabs -l402-protocol -Fewsats',
];

const AGENT_QUERIES = [
  '(stackoverflow.com OR reddit.com/r/programming OR dev.to) "micropayments" OR "pay-per-call" OR "API monetization" api',
  'site:github.com "API monetization" OR "pay-per-call" OR "pay per request" -lightninglabs -l402-protocol -Fewsats -awesome',
];

// ─── Search providers ─────────────────────────────────────────────────────────

interface SerperItem { title: string; link: string; snippet: string; date?: string }

async function serperSearch(query: string, apiKey: string): Promise<SerperItem[]> {
  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      console.error("[RADAR] serper error status:", r.status, "query:", query.slice(0, 40));
      return [];
    }
    const data = await r.json() as { organic?: SerperItem[]; error?: string };
    if (data.error) console.error("[RADAR] serper API error:", data.error);
    return (data.organic ?? []).slice(0, 10);
  } catch (e) {
    console.error("[RADAR] serper fetch exception:", String(e));
    return [];
  }
}

// Brave Search — used as fallback when Serper returns < BRAVE_FALLBACK_THRESHOLD results
const BRAVE_FALLBACK_THRESHOLD = 3;

interface BraveResult { title: string; url: string; description: string; page_age?: string }

async function braveSearch(query: string, apiKey: string): Promise<SerperItem[]> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    const r = await fetch(url, {
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      console.error("[RADAR] brave error status:", r.status);
      return [];
    }
    const data = await r.json() as { web?: { results?: BraveResult[] } };
    return (data.web?.results ?? []).map(item => ({
      title:   item.title,
      link:    item.url,
      snippet: item.description ?? "",
      date:    item.page_age,
    }));
  } catch (e) {
    console.error("[RADAR] brave fetch exception:", String(e));
    return [];
  }
}

async function search(query: string, env: Env, persona: "human" | "agent"): Promise<SerperItem[]> {
  const primary = await serperSearch(query, env.SERPER_API_KEY);
  if (primary.length >= BRAVE_FALLBACK_THRESHOLD || !env.BRAVE_API_KEY) return primary;
  console.log(`[RADAR] serper thin (${primary.length}) for ${persona} — falling back to Brave`);
  const fallback = await braveSearch(query, env.BRAVE_API_KEY);
  // Merge, deduplicate by link
  const seen = new Set(primary.map(r => r.link));
  return [...primary, ...fallback.filter(r => !seen.has(r.link))];
}

// ─── GitHub issue validation ──────────────────────────────────────────────────

async function isOpenGitHubIssue(link: string, pat?: string): Promise<boolean> {
  const match = link.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) return true; // not a GitHub issue URL — accept it

  const [, owner, repo, number] = match;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VERITY-RADAR/1.0",
  };
  if (pat) headers.Authorization = `Bearer ${pat}`;

  const r = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
    { headers, signal: AbortSignal.timeout(5_000) },
  ).catch(() => null);

  if (!r?.ok) return false;
  const data = await r.json() as { state?: string };
  return data.state === "open";
}

// Reject abandoned/empty repos: <5 stars AND last push > 180 days ago.
// Plain github.com/owner/repo URLs (no /issues/, no /pull/) hit this path.
async function isLiveRepo(link: string, pat?: string): Promise<boolean> {
  const match = link.match(/github\.com\/([^/]+)\/([^/]+?)(?:[/?#]|$)/);
  if (!match) return true;
  if (link.includes("/issues/") || link.includes("/pull/")) return true;

  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");
  if (!owner || !cleanRepo || owner === "marketplace") return true;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VERITY-RADAR/1.0",
  };
  if (pat) headers.Authorization = `Bearer ${pat}`;

  const r = await fetch(
    `https://api.github.com/repos/${owner}/${cleanRepo}`,
    { headers, signal: AbortSignal.timeout(5_000) },
  ).catch(() => null);

  if (!r?.ok) return true; // 404/rate limit → don't block (avoid false negatives)
  const data = await r.json() as {
    stargazers_count?: number;
    pushed_at?: string;
    archived?: boolean;
    disabled?: boolean;
  };

  if (data.archived || data.disabled) return false;

  const stars = data.stargazers_count ?? 0;
  const pushedAt = data.pushed_at ? new Date(data.pushed_at).getTime() : 0;
  const daysSincePush = pushedAt ? (Date.now() - pushedAt) / 86_400_000 : Infinity;

  // Dead: <5 stars AND no push in >180 days
  if (stars < 5 && daysSincePush > 180) return false;
  return true;
}

// ─── Email notification ───────────────────────────────────────────────────────

async function notifyHotLead(lead: Lead, draft: string | null, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const personaLabel = lead.persona === "human" ? "Integration/Research" : "Volume service";
  const draftSection = draft
    ? [``, `── OUTREACH DRAFT ──`, draft, `── END DRAFT ──`, ``, `POST this draft as a GitHub comment: ${lead.url}`]
    : [``, `(outreach draft unavailable)`];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Hot lead — ${lead.persona} · score ${lead.score} · ${lead.framework ?? "unknown fw"}`,
        text: [
          `VERITY RADAR — Anel 1 · Hot Lead`,
          ``,
          `Persona:   ${lead.persona} → ${personaLabel}`,
          `Signal:    ${lead.signal} (score ${lead.score})`,
          `Framework: ${lead.framework ?? "not detected"}`,
          `URL:       ${lead.url}`,
          `Title:     ${lead.title}`,
          `Snippet:   ${lead.snippet.slice(0, 200)}`,
          `Found at:  ${lead.foundAt}`,
          ...draftSection,
          ``,
          `All leads: GET /api/verity/admin/radar`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

// ─── RADAR v1 — Anel 1 (buyers) ──────────────────────────────────────────────

export async function runRadar(env: Env): Promise<void> {
  if (!env.SERPER_API_KEY) {
    console.log("[RADAR] no SERPER_API_KEY — skipping");
    return;
  }

  const lock = await acquireRadarLock(env);
  if (!lock) {
    console.log("[RADAR] skipped — another run in progress");
    return;
  }

  const log = { ts: new Date().toISOString(), found: 0, queued: 0, skipped: 0, errors: 0, serper: [] as number[] };

  try {
    const [h1, h2, a1, a2] = await Promise.allSettled([
      search(HUMAN_QUERIES[0], env, "human"),
      search(HUMAN_QUERIES[1], env, "human"),
      search(AGENT_QUERIES[0], env, "agent"),
      search(AGENT_QUERIES[1], env, "agent"),
    ]);

    const counts = [h1, h2, a1, a2].map(r => (r.status === "fulfilled" ? r.value.length : -1));
    log.serper = counts;
    console.log("[RADAR] serper counts:", counts);

    type Tagged = SerperItem & { persona: Persona };
    const tag = (items: SerperItem[], persona: Persona): Tagged[] =>
      items.map(i => ({ ...i, persona }));

    const allItems: Tagged[] = [
      ...tag(h1.status === "fulfilled" ? h1.value : [], "human"),
      ...tag(h2.status === "fulfilled" ? h2.value : [], "human"),
      ...tag(a1.status === "fulfilled" ? a1.value : [], "agent"),
      ...tag(a2.status === "fulfilled" ? a2.value : [], "agent"),
    ];

    log.found = allItems.length;

    for (const item of allItems) {
      try {
        if (await seenBefore(item.link, env)) { log.skipped++; continue; }

        // Filter out infra (lightninglabs, l402-protocol, Fewsats) + competitors
        // (DeepBlue/Fynx-style x402 USDC/Solana promos) before any HTTP cost.
        if (!isBuyerLead(item.link, item.title, item.snippet ?? "")) {
          log.skipped++;
          await markSeen(item.link, env);
          continue;
        }

        if (item.link.includes("github.com")) {
          if (item.link.includes("/issues/")) {
            const open = await isOpenGitHubIssue(item.link, env.GITHUB_PAT);
            if (!open) {
              log.skipped++;
              await markSeen(item.link, env);
              continue;
            }
          } else {
            const alive = await isLiveRepo(item.link, env.GITHUB_PAT);
            if (!alive) {
              log.skipped++;
              await markSeen(item.link, env);
              continue;
            }
          }
        }

        const { score, signal } = scoreSignal(item.title, item.snippet ?? "", item.date, true);
        const framework = detectFramework(`${item.title} ${item.snippet ?? ""}`);
        const key = queueKey(item.persona, signal);

        if (!key) {
          log.skipped++;
          await markSeen(item.link, env);
          continue;
        }

        const lead: Lead = {
          url:       item.link,
          title:     item.title,
          snippet:   item.snippet ?? "",
          score,
          signal,
          persona:   item.persona,
          framework,
          foundAt:   new Date().toISOString(),
          expiresAt: Date.now() + 48 * 3_600_000,
        };

        await enqueue(key, lead, env);
        await markSeen(item.link, env);
        log.queued++;

        if (signal === "hot") {
          const draft = await draftOutreach(lead, env);
          if (draft) await storeDraft(lead, draft, env);
          await notifyHotLead(lead, draft, env);
        }
      } catch {
        log.errors++;
      }
    }
  } finally {
    await releaseRadarLock(lock, env);
    const slot = new Date().toISOString().slice(0, 13);
    await env.demo_preimages.put(
      `verity_radar:log:${slot}`,
      JSON.stringify(log),
      { expirationTtl: 604_800 },
    );
    console.log("[RADAR] v1:", JSON.stringify(log));
  }
}
