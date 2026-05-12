import type { Env } from "../worker";
import { MARGIN_FLOOR, getServiceConfig } from "./pricing";
import { recordAlert, checkBudgetAlert } from "./alerts";

const BLINK_API = "https://api.blink.sv/graphql";

const BUDGET_DEFAULTS = { internal: 5_000, external: 2_000 };
const REINVESTMENT_DEFAULT = 0.10;

// ─── Budget ──────────────────────────────────────────────────────────────────

export type BudgetRail = "internal" | "external";

// ─── Optimistic spend lock (reduces KV race window) ──────────────────────────

export async function acquireSpendLock(rail: BudgetRail, env: Env): Promise<string | null> {
  const lockKey = `verity_spend_lock:${rail}:${todayKey()}`;
  const existing = await env.demo_preimages.get(lockKey);
  if (existing) return null;
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await env.demo_preimages.put(lockKey, token, { expirationTtl: 5 });
  const check = await env.demo_preimages.get(lockKey);
  return check === token ? token : null;
}

export async function releaseSpendLock(rail: BudgetRail, token: string, env: Env): Promise<void> {
  const lockKey = `verity_spend_lock:${rail}:${todayKey()}`;
  const current = await env.demo_preimages.get(lockKey);
  if (current === token) await env.demo_preimages.delete(lockKey);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekKey(): string {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getDailyBudget(rail: BudgetRail, env: Env): Promise<number> {
  const [floorRaw, bonusRaw] = await Promise.all([
    env.demo_preimages.get(`verity_budget:${rail}:floor`),
    env.demo_preimages.get(`verity_budget:${rail}:bonus`),
  ]);
  const floor = floorRaw ? parseInt(floorRaw, 10) : BUDGET_DEFAULTS[rail];
  const bonus = bonusRaw ? parseInt(bonusRaw, 10) : 0;
  return floor + bonus;
}

export async function getDailySpend(rail: BudgetRail, env: Env): Promise<number> {
  const raw = await env.demo_preimages.get(`verity_spend:${rail}:${todayKey()}`);
  return raw ? parseInt(raw, 10) : 0;
}

export async function recordSpend(rail: BudgetRail, amountSats: number, service: string, env: Env): Promise<void> {
  const day    = todayKey();
  const total  = `verity_spend:${rail}:${day}`;
  const svcKey = `verity_spend:${rail}:${service}:${day}`;
  const [tr, sr] = await Promise.all([env.demo_preimages.get(total), env.demo_preimages.get(svcKey)]);
  await Promise.all([
    env.demo_preimages.put(total,  String((tr ? parseInt(tr, 10) : 0) + amountSats), { expirationTtl: 172800 }),
    env.demo_preimages.put(svcKey, String((sr ? parseInt(sr, 10) : 0) + amountSats), { expirationTtl: 172800 }),
  ]);
}

export async function calculateBonusBudget(env: Env): Promise<{ internal: number; external: number }> {
  const [revenueRaw, rateRaw] = await Promise.all([
    env.demo_preimages.get(`verity_revenue:${weekKey()}`),
    env.demo_preimages.get("verity_budget:reinvestment_rate"),
  ]);
  const revenue = revenueRaw ? parseInt(revenueRaw, 10) : 0;
  const rate    = rateRaw ? parseFloat(rateRaw) : REINVESTMENT_DEFAULT;
  const total   = Math.round(revenue * rate);
  return { external: Math.round(total * 0.7), internal: Math.round(total * 0.3) };
}

export async function applyBonusBudget(env: Env): Promise<void> {
  const { internal, external } = await calculateBonusBudget(env);
  await Promise.all([
    env.demo_preimages.put("verity_budget:internal:bonus", String(internal)),
    env.demo_preimages.put("verity_budget:external:bonus", String(external)),
  ]);
}

// ─── Canonical buy decision ───────────────────────────────────────────────────

export interface BuyContext {
  type?: 'direct' | 'scout' | 'partner_internal' | 'partner_external' | 'invoice';
  signal?: { strength?: 'cold' | 'warm' | 'hot'; priorPurchases?: number };
  partner?: { known?: boolean; reliability?: number };
  invoice?: { expiresAt?: number };
}

export function shouldBuy(costSats: number, resalePriceSats: number, ctx?: BuyContext): boolean {
  if (ctx?.invoice?.expiresAt !== undefined) {
    if (Math.floor(Date.now() / 1000) > ctx.invoice.expiresAt) return false;
  }

  let floorMultiplier = 1;

  switch (ctx?.type) {
    case 'partner_internal':
      floorMultiplier = 0;
      break;
    case 'partner_external':
      if (ctx.partner?.known && (ctx.partner.reliability ?? 0) >= 0.9) floorMultiplier = 0.8;
      else if (ctx.partner?.known) floorMultiplier = 1;
      else floorMultiplier = 2;
      break;
    case 'scout':
      if (ctx.signal?.strength === 'hot')  floorMultiplier = 0.7;
      else if (ctx.signal?.strength === 'warm') floorMultiplier = 0.85;
      else floorMultiplier = 1.2;
      break;
    default:
      floorMultiplier = 1;
  }

  const effectiveFloor = Math.round(MARGIN_FLOOR * floorMultiplier);
  return (resalePriceSats - costSats) >= effectiveFloor;
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

  const budget = await getDailyBudget("internal", env);
  const spent  = await getDailySpend("internal", env);
  if (spent + cogsSats > budget) {
    await checkBudgetAlert("internal", spent, budget, env, cogsSats);
    return { ok: false, cogsSats };
  }

  try {
    const data = await executor();
    if (cogsSats > 0) await recordSpend("internal", cogsSats, `self:${service}`, env);
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

  // Steps 5-6 — budget check + payment under optimistic lock (prevents race condition)
  const lock = await acquireSpendLock("external", env);
  if (!lock) return { ok: false };

  let preimage: string | null = null;
  try {
    const budget = await getDailyBudget("external", env);
    const spent  = await getDailySpend("external", env);
    if (spent + costSats > budget) {
      await checkBudgetAlert("external", spent, budget, env, costSats);
      return { ok: false };
    }

    preimage = await payInvoice(invoice402.invoice, env);
    if (!preimage) {
      await recordAlert("payment_failed", "external", { url, costSats, invoice: invoice402.invoice.slice(0, 30) }, env);
      return { ok: false };
    }

    await recordSpend("external", costSats, url, env);
  } finally {
    await releaseSpendLock("external", lock, env);
  }

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
