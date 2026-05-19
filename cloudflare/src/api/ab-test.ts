import type { Env } from "../worker";

const ALLOWED_VARIANTS = new Set(["A", "B", "C"]);
const ALLOWED_EVENTS = new Set(["view", "click_install", "click_docs", "click_demo"]);
const KV_PREFIX = "ab:hero";
const KV_TTL_DAYS = 90;

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * POST /api/ab-event
 * Body: { variant: "A"|"B"|"C", event: "view"|"click_install"|"click_docs"|"click_demo", meta?: string }
 * Increments KV counter `ab:hero:YYYY-MM-DD:{variant}:{event}`.
 * Best-effort, swallows errors.
 */
export async function handleAbEvent(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return jsonResp({ error: "POST required" }, 405);

  const body = await req.json().catch(() => ({})) as {
    variant?: string;
    event?: string;
    meta?: string;
  };

  const variant = body.variant ?? "";
  const event = body.event ?? "";

  if (!ALLOWED_VARIANTS.has(variant)) return jsonResp({ error: "invalid variant" }, 400);
  if (!ALLOWED_EVENTS.has(event))     return jsonResp({ error: "invalid event" }, 400);

  const date = today();
  const key = `${KV_PREFIX}:${date}:${variant}:${event}`;

  try {
    const current = parseInt(await env.demo_preimages.get(key) ?? "0", 10);
    await env.demo_preimages.put(
      key,
      String(current + 1),
      { expirationTtl: KV_TTL_DAYS * 86400 },
    );
  } catch {
    // best-effort, never let analytics break the page
  }

  return jsonResp({ ok: true });
}

/**
 * GET /api/ab-stats?date=YYYY-MM-DD  (defaults to today)
 * Requires x-dashboard-secret header.
 * Returns counts per variant + simple CTR ratios.
 */
export async function handleAbStats(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("x-dashboard-secret") ?? "";
  if (!env.DASHBOARD_SECRET || secret !== env.DASHBOARD_SECRET) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || today();

  const variants = ["A", "B", "C"] as const;
  const events = ["view", "click_install", "click_docs", "click_demo"] as const;
  const out: Record<string, Record<string, number>> = {};

  for (const v of variants) {
    out[v] = {};
    for (const e of events) {
      const raw = await env.demo_preimages.get(`${KV_PREFIX}:${date}:${v}:${e}`);
      out[v][e] = parseInt(raw ?? "0", 10);
    }
  }

  const ratios: Record<string, { ctr_install: string; ctr_docs: string; ctr_demo: string }> = {};
  for (const v of variants) {
    const views = out[v].view || 1;
    ratios[v] = {
      ctr_install: ((out[v].click_install / views) * 100).toFixed(2) + "%",
      ctr_docs:    ((out[v].click_docs    / views) * 100).toFixed(2) + "%",
      ctr_demo:    ((out[v].click_demo    / views) * 100).toFixed(2) + "%",
    };
  }

  return jsonResp({ date, counts: out, ratios });
}
