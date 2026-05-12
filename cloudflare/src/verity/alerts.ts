import type { Env } from "../worker";

export type AlertType = "budget_low" | "budget_exhausted" | "payment_failed";
export type AlertRail = "internal" | "external";

export interface Alert {
  type: AlertType;
  rail: AlertRail;
  ts: string;
  details: Record<string, unknown>;
}

// Key: verity_alert:{type}:{rail}:{minute} — dedupes within same minute
function alertKey(type: AlertType, rail: AlertRail): string {
  const minute = new Date().toISOString().slice(0, 16); // "2026-05-12T14:30"
  return `verity_alert:${type}:${rail}:${minute}`;
}

export async function recordAlert(
  type: AlertType,
  rail: AlertRail,
  details: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const key = alertKey(type, rail);
  const existing = await env.demo_preimages.get(key);
  if (existing) return; // dedupe within same minute
  const payload: Alert = { type, rail, ts: new Date().toISOString(), details };
  await env.demo_preimages.put(key, JSON.stringify(payload), { expirationTtl: 604_800 }); // 7 days
}

export async function getAlerts(env: Env): Promise<Alert[]> {
  const list = await env.demo_preimages.list({ prefix: "verity_alert:" });
  const entries = await Promise.all(
    list.keys.map(async ({ name }) => {
      const raw = await env.demo_preimages.get(name);
      if (!raw) return null;
      return { key: name, ...(JSON.parse(raw) as Alert) };
    }),
  );
  return (entries.filter(Boolean) as (Alert & { key: string })[])
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

export async function clearAlert(key: string, env: Env): Promise<void> {
  await env.demo_preimages.delete(key);
}

// Called after recordSpend — fires budget_low (≥80%) or budget_exhausted (would exceed)
export async function checkBudgetAlert(
  rail: AlertRail,
  spent: number,
  budget: number,
  env: Env,
  incomingCost = 0,
): Promise<void> {
  if (incomingCost > 0 && spent + incomingCost > budget) {
    await recordAlert("budget_exhausted", rail, { spent, cost: incomingCost, budget }, env);
    return;
  }
  if (budget > 0 && spent / budget >= 0.8) {
    await recordAlert("budget_low", rail, { spent, budget, pct: Math.round((spent / budget) * 100) }, env);
  }
}
