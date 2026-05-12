import type { Env } from "../../worker";
import { isCompetitorRelevant, competitorHash } from "../radar/competitors";

const COMPETITOR_QUERIES = [
  '"l402" OR "x402" new project github',
  '"lightning micropayment" api tool launch',
  '"pay-per-call api" OR "pay per request api" github',
];

interface CompetitorEntry {
  title: string;
  link: string;
  snippet: string;
  foundAt: string;
}

async function serperSearch(query: string, apiKey: string): Promise<{ title: string; link: string; snippet: string }[]> {
  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return [];
    const data = await r.json() as { organic?: { title: string; link: string; snippet: string }[] };
    return data.organic ?? [];
  } catch { return []; }
}

async function isNewCompetitor(link: string, env: Env): Promise<boolean> {
  const key = `verity_radar:seen:competitor:${competitorHash(link)}`;
  return (await env.demo_preimages.get(key)) === null;
}

async function markCompetitorSeen(link: string, env: Env): Promise<void> {
  await env.demo_preimages.put(
    `verity_radar:seen:competitor:${competitorHash(link)}`,
    "1",
    { expirationTtl: 30 * 86_400 }, // 30 days
  );
}

async function appendToList(entry: CompetitorEntry, env: Env): Promise<void> {
  const raw = await env.demo_preimages.get("verity_radar:competitors:list");
  const list: CompetitorEntry[] = raw ? JSON.parse(raw) : [];
  list.push(entry);
  await env.demo_preimages.put(
    "verity_radar:competitors:list",
    JSON.stringify(list),
    { expirationTtl: 90 * 86_400 }, // 90 days
  );
}

async function sendNewCompetitorEmail(entry: CompetitorEntry, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Novo concorrente detectado: ${entry.title.slice(0, 50)}`,
        text: [
          `VERITY RADAR — Anel 4 · Concorrentes`,
          ``,
          `Título:  ${entry.title}`,
          `Link:    ${entry.link}`,
          `Snippet: ${entry.snippet.slice(0, 200)}`,
          ``,
          `Análise: GET /api/verity/admin/radar/synthesis`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

export async function runCompetitorsRadar(env: Env): Promise<void> {
  if (!env.SERPER_API_KEY) {
    console.log("[RADAR] competitors: no SERPER_API_KEY — skipping");
    return;
  }

  let newCount = 0;

  try {
    const results = await Promise.allSettled(
      COMPETITOR_QUERIES.map(q => serperSearch(q, env.SERPER_API_KEY)),
    );

    const all = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

    for (const item of all) {
      const text = `${item.title} ${item.snippet}`;
      if (!isCompetitorRelevant(text)) continue;
      if (!(await isNewCompetitor(item.link, env))) continue;

      const entry: CompetitorEntry = { ...item, foundAt: new Date().toISOString() };
      await appendToList(entry, env);
      await markCompetitorSeen(item.link, env);
      await sendNewCompetitorEmail(entry, env);
      newCount++;
    }

    console.log("[RADAR] competitors:", { found: all.length, new: newCount });
  } catch (e) {
    console.error("[RADAR] competitors error:", String(e));
  }
}
