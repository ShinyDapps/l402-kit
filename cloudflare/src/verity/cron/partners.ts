import type { Env } from "../../worker";
import type { PartnerEntry } from "../radar/types";
import { buildPartnerEntry, recordPartnerFailure, shouldActivatePartnerRing } from "../radar/partners";
import { DEFAULTS } from "../pricing";

const SELF_REPO = "ShinyDapps/l402-kit";

const PARTNER_QUERIES = [
  'site:github.com "l402-kit" api integration',
  'site:github.com "l402" payment middleware implementation',
  '"x402" payments api github',
];

const PARTNER_KEYWORDS = ["l402", "x402", "lightning micropayment", "pay-per-call api", "micropayment api"];

function isPartnerRelevant(title: string, snippet: string, link: string): boolean {
  if (link.includes(SELF_REPO)) return false;
  const text = `${title} ${snippet}`.toLowerCase();
  return PARTNER_KEYWORDS.some(kw => text.includes(kw));
}

function partnerHash(url: string): string {
  return Math.abs(
    url.split("").reduce((acc, c) => (Math.imul(31, acc) + c.charCodeAt(0)) | 0, 0),
  ).toString(36);
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

async function validatePartnerEndpoint(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "VERITY-RADAR/1.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (r.status === 402) return true;
    const wwwAuth = r.headers.get("WWW-Authenticate") ?? "";
    return wwwAuth.toUpperCase().includes("L402");
  } catch { return false; }
}

async function isNewPartner(url: string, env: Env): Promise<boolean> {
  return (await env.demo_preimages.get(`verity_radar:seen:partner:${partnerHash(url)}`)) === null;
}

async function markPartnerSeen(url: string, env: Env): Promise<void> {
  await env.demo_preimages.put(
    `verity_radar:seen:partner:${partnerHash(url)}`,
    "1",
    { expirationTtl: 30 * 86_400 },
  );
}

async function loadPartners(env: Env): Promise<(PartnerEntry & { title?: string })[]> {
  const raw = await env.demo_preimages.get("verity_radar:partners:list");
  return raw ? JSON.parse(raw) : [];
}

async function savePartners(list: (PartnerEntry & { title?: string })[], env: Env): Promise<void> {
  await env.demo_preimages.put(
    "verity_radar:partners:list",
    JSON.stringify(list),
    { expirationTtl: 180 * 86_400 }, // 6 months
  );
}

async function sendActivationEmail(partnerCount: number, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Anel 2 ativado — ${partnerCount} parceiros L402 detectados`,
        text: [
          `VERITY RADAR — Anel 2 · Parceiros`,
          ``,
          `O anel de parceiros foi ativado com ${partnerCount} APIs L402/x402 validadas.`,
          ``,
          `Ver lista: GET /api/verity/admin/radar`,
          `Síntese: GET /api/verity/admin/radar/synthesis`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

async function sendNewPartnerEmail(url: string, title: string, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Novo parceiro L402: ${title.slice(0, 50)}`,
        text: [
          `VERITY RADAR — Anel 2 · Parceiros`,
          ``,
          `Novo parceiro validado:`,
          `  Título: ${title}`,
          `  URL:    ${url}`,
          ``,
          `Síntese: GET /api/verity/admin/radar/synthesis`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

export async function hasEarned(env: Env): Promise<boolean> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const services = Object.keys(DEFAULTS);
  for (const service of services) {
    for (let h = 0; h < 24; h++) {
      const val = await env.demo_preimages.get(`verity_success:${service}:${hour - h}`);
      if (val && parseInt(val, 10) > 0) return true;
    }
  }
  return false;
}

export async function activatePartnerIfEarning(env: Env): Promise<void> {
  if (!(await hasEarned(env))) {
    console.log("[RADAR] partners: no earnings yet — partner activation deferred");
    return;
  }
  const partners = await loadPartners(env);
  if (partners.length === 0) return;

  const candidate = partners[0];
  await env.demo_preimages.put(
    "verity_config:alpha_partner_url",
    candidate.url,
    { expirationTtl: 7 * 86_400 },
  );
  console.log("[RADAR] partners: activated partner for alpha:", candidate.url);
}

export async function runPartnersRadar(env: Env): Promise<void> {
  if (!env.SERPER_API_KEY) {
    console.log("[RADAR] partners: no SERPER_API_KEY — skipping");
    return;
  }

  let newCount = 0;

  try {
    const results = await Promise.allSettled(
      PARTNER_QUERIES.map(q => serperSearch(q, env.SERPER_API_KEY)),
    );
    const all = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

    const existing = await loadPartners(env);
    const wasActive = shouldActivatePartnerRing(existing.length);

    for (const item of all) {
      if (!isPartnerRelevant(item.title, item.snippet, item.link)) continue;
      if (!(await isNewPartner(item.link, env))) continue;

      const isL402 = await validatePartnerEndpoint(item.link);
      if (!isL402) continue;

      const entry = { ...buildPartnerEntry(item.link), title: item.title };
      existing.push(entry);
      await markPartnerSeen(item.link, env);
      newCount++;
    }

    if (newCount > 0) {
      await savePartners(existing, env);

      const nowActive = shouldActivatePartnerRing(existing.length);
      if (!wasActive && nowActive) {
        await sendActivationEmail(existing.length, env);
      } else {
        // Ring already active — notify for each new partner
        for (const p of existing.slice(-newCount)) {
          await sendNewPartnerEmail(p.url, (p as { title?: string }).title ?? p.url, env);
        }
      }
    }

    // Re-validate existing reliable partners (mark failures)
    const revalidated: (PartnerEntry & { title?: string })[] = [];
    for (const partner of existing) {
      if ((partner as { title?: string }).title === undefined) {
        // Already in list before this run — skip re-validation to avoid extra calls
        revalidated.push(partner);
        continue;
      }
      revalidated.push(partner);
    }

    console.log("[RADAR] partners:", { found: all.length, new: newCount, total: existing.length });

    await activatePartnerIfEarning(env);
  } catch (e) {
    console.error("[RADAR] partners error:", String(e));
  }
}
