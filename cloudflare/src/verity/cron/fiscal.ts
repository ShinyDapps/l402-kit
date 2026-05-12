import type { Env } from "../../worker";
import { DEFAULTS, getPrice, adjustPrice } from "../pricing";
import { getDailySpend, getDailyBudget } from "../consumer";

const ALERT_THRESHOLD_SATS = 1_000; // notify when daily revenue crosses 1000 sats

async function sendRevenueAlert(report: Record<string, unknown>, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const body = JSON.stringify({
    from: "VERITY <verity@l402kit.com>",
    to: ["thiagoyoshiaki@gmail.com"],
    subject: `⚡ VERITY: ${report.revenue_sats} sats hoje`,
    text: [
      `VERITY fiscal report — ${report.date}`,
      `Revenue:  ${report.revenue_sats} sats`,
      `Net:      ${report.net_sats} sats`,
      `Margin:   ${report.margin_pct}%`,
      `BRL:      R$ ${report.brl_equivalent}`,
      ``,
      JSON.stringify(report.breakdown, null, 2),
    ].join("\n"),
  });
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

async function updateReputation(
  service: string,
  hour: number,
  env: Env,
): Promise<{ successRate: number }> {
  let successes = 0;
  let errors = 0;
  for (let h = 0; h < 24; h++) {
    const s = await env.demo_preimages.get(`verity_success:${service}:${hour - h}`);
    const e = await env.demo_preimages.get(`verity_error:${service}:${hour - h}`);
    if (s) successes += parseInt(s, 10);
    if (e) errors += parseInt(e, 10);
  }
  const total = successes + errors;
  const successRate = total > 0 ? successes / total : 1;

  // Adjust price based on reputation: >95% success → +5%, <80% → -10%
  if (total >= 10) {
    if (successRate >= 0.95) {
      await adjustPrice(service, "up", env);
    } else if (successRate < 0.80) {
      await adjustPrice(service, "down", env);
    }
  }

  return { successRate };
}

export async function runFiscalAgent(env: Env): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const hour = Math.floor(Date.now() / 3_600_000);

    let totalSats = 0;
    const breakdown: Record<string, { calls: number; price: number; revenue: number; success_rate?: number }> = {};

    for (const service of Object.keys(DEFAULTS)) {
      let dailyCalls = 0;
      for (let h = 0; h < 24; h++) {
        const raw = await env.demo_preimages.get(`verity_calls:${service}:${hour - h}`);
        if (raw) dailyCalls += parseInt(raw, 10);
      }
      const price = await getPrice(service, env);
      const revenue = dailyCalls * price;
      totalSats += revenue;

      const { successRate } = await updateReputation(service, hour, env);
      breakdown[service] = { calls: dailyCalls, price, revenue, success_rate: Math.round(successRate * 100) };
    }

    // BTC/BRL rate
    let btcBrl = 0;
    try {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl",
        { signal: AbortSignal.timeout(5_000) },
      );
      if (r.ok) {
        const d = await r.json() as { bitcoin: { brl: number } };
        btcBrl = d.bitcoin.brl;
      }
    } catch { /* use 0 if unavailable */ }

    const brlEquivalent = btcBrl > 0 ? ((totalSats / 100_000_000) * btcBrl).toFixed(2) : "unavailable";

    const [consumerSpent, consumerBudget] = await Promise.all([
      getDailySpend("external", env),
      getDailyBudget("external", env),
    ]);
    const netSats = totalSats - consumerSpent;

    const report = {
      date: today,
      agent: "VERITY",
      revenue_sats: totalSats,
      consumer_spent_sats: consumerSpent,
      consumer_budget_sats: consumerBudget,
      net_sats: netSats,
      margin_pct: totalSats > 0 ? ((netSats / totalSats) * 100).toFixed(2) : "0.00",
      brl_equivalent: brlEquivalent,
      btc_brl_rate: btcBrl,
      breakdown,
      generated_at: new Date().toISOString(),
    };

    await env.demo_preimages.put(
      `verity_fiscal:${today}`,
      JSON.stringify(report),
      { expirationTtl: 7 * 86400 },
    );

    // Alert when daily revenue crosses threshold
    if (totalSats >= ALERT_THRESHOLD_SATS) {
      await sendRevenueAlert(report as Record<string, unknown>, env);
    }

    console.log("[VERITY] fiscal report:", JSON.stringify(report));
  } catch (e) {
    console.error("[VERITY] fiscal agent error:", String(e));
  }
}
