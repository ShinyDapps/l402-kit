import type { Env } from "../worker";
import { MARGIN_FLOOR, getServiceConfig } from "./pricing";

const DAILY_BUDGET_SATS = 1_000; // starts at $1 — configurable via KV verity_consumer_budget
const KV_BUDGET_KEY     = "verity_consumer_budget";
const BLINK_API         = "https://api.blink.sv/graphql";

// ─── Budget ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getDailyBudget(env: Env): Promise<number> {
  const raw = await env.demo_preimages.get(KV_BUDGET_KEY);
  return raw ? parseInt(raw, 10) : DAILY_BUDGET_SATS;
}

export async function getDailySpend(env: Env): Promise<number> {
  const raw = await env.demo_preimages.get(`verity_consumer_spent:${todayKey()}`);
  return raw ? parseInt(raw, 10) : 0;
}

async function recordSpend(amountSats: number, service: string, env: Env): Promise<void> {
  const day = todayKey();
  const totalKey = `verity_consumer_spent:${day}`;
  const svcKey   = `verity_consumer_spent:${service}:${day}`;

  const [totalRaw, svcRaw] = await Promise.all([
    env.demo_preimages.get(totalKey),
    env.demo_preimages.get(svcKey),
  ]);

  await Promise.all([
    env.demo_preimages.put(totalKey, String((totalRaw ? parseInt(totalRaw, 10) : 0) + amountSats), { expirationTtl: 172800 }),
    env.demo_preimages.put(svcKey,   String((svcRaw   ? parseInt(svcRaw,   10) : 0) + amountSats), { expirationTtl: 172800 }),
  ]);
}

// ─── Canonical buy decision ───────────────────────────────────────────────────

export function shouldBuy(costSats: number, resalePriceSats: number): boolean {
  return (resalePriceSats - costSats) >= MARGIN_FLOOR;
}

// ─── Lightning payment via Blink ─────────────────────────────────────────────

async function payInvoice(bolt11: string, env: Env): Promise<string | null> {
  try {
    const r = await fetch(BLINK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.BLINK_API_KEY,
      },
      body: JSON.stringify({
        query: `mutation Pay($input: LnInvoicePaymentInput!) {
          lnInvoicePaymentSend(input: $input) {
            status
            preimage
            errors { message }
          }
        }`,
        variables: {
          input: {
            walletId:       env.BLINK_WALLET_ID,
            paymentRequest: bolt11,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { data?: { lnInvoicePaymentSend?: { status?: string; preimage?: string } } };
    const result = data?.data?.lnInvoicePaymentSend;
    if (result?.status !== "SUCCESS") return null;
    return result.preimage ?? null;
  } catch {
    return null;
  }
}

// ─── Self-call (bypasses HTTP, no actual payment, records COGS) ──────────────

export async function callSelf(
  service: string,
  env: Env,
  executor: () => Promise<unknown>,
): Promise<{ ok: boolean; data?: unknown; cogsSats: number }> {
  const config  = await getServiceConfig(service, env);
  const cogsSats = config.cogs;

  const budget = await getDailyBudget(env);
  const spent  = await getDailySpend(env);
  if (spent + cogsSats > budget) {
    return { ok: false, cogsSats };
  }

  try {
    const data = await executor();
    if (cogsSats > 0) await recordSpend(cogsSats, `self:${service}`, env);
    return { ok: true, data, cogsSats };
  } catch {
    return { ok: false, cogsSats };
  }
}

// ─── External call (full L402 loop: request → 402 → pay → retry) ─────────────

interface ExternalCallOptions {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  resalePriceSats: number; // what VERITY charges for the containing service
}

export interface ExternalCallResult {
  ok: boolean;
  data?: unknown;
  costSats?: number;
  provider?: string;
}

export async function callExternal(opts: ExternalCallOptions, env: Env): Promise<ExternalCallResult> {
  const { url, method = "GET", body, resalePriceSats } = opts;

  // Step 1 — initial request to discover price
  const init = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!init) return { ok: false };

  // Step 2 — if 200, already free (no payment needed)
  if (init.ok) {
    const data = await init.json().catch(() => null);
    return { ok: true, data, costSats: 0, provider: url };
  }

  // Step 3 — expect 402 with invoice
  if (init.status !== 402) return { ok: false };

  const invoice402 = await init.json().catch(() => null) as {
    invoice?: string;
    macaroon?: string;
    priceSats?: number;
  } | null;

  if (!invoice402?.invoice || !invoice402?.macaroon) return { ok: false };

  const costSats = invoice402.priceSats ?? 0;

  // Step 4 — canonical buy decision
  if (!shouldBuy(costSats, resalePriceSats)) return { ok: false };

  // Step 5 — check daily budget
  const budget = await getDailyBudget(env);
  const spent  = await getDailySpend(env);
  if (spent + costSats > budget) return { ok: false };

  // Step 6 — pay the invoice, get preimage back from Blink
  const preimage = await payInvoice(invoice402.invoice, env);
  if (!preimage) return { ok: false };

  await recordSpend(costSats, url, env);

  // Step 7 — retry with L402 token: Authorization: L402 <macaroon>:<preimage>
  const retryRes = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `L402 ${invoice402.macaroon}:${preimage}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!retryRes?.ok) return { ok: false, costSats };

  const data = await retryRes.json().catch(() => null);
  return { ok: true, data, costSats, provider: url };
}
