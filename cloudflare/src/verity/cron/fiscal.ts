import type { Env } from "../../worker";
import { DEFAULTS, getPrice, adjustPrice } from "../pricing";
import { getDailySpend, getDailyBudget, applyBonusBudget } from "../consumer";

const ALERT_THRESHOLD_SATS = 1_000; // notify when daily revenue crosses 1000 sats

async function fetchBtcBrl(): Promise<number> {
  // Primary: CoinGecko (free tier needs a UA — silently 403s without it)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl",
      {
        headers: { Accept: "application/json", "User-Agent": "VERITY/1.0 (+https://l402kit.com)" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (r.ok) {
      const d = await r.json() as { bitcoin?: { brl?: number } };
      if (d.bitcoin?.brl && d.bitcoin.brl > 0) return d.bitcoin.brl;
      console.warn("[fiscal] coingecko BRL empty:", JSON.stringify(d).slice(0, 200));
    } else {
      console.warn("[fiscal] coingecko status", r.status, (await r.text().catch(() => "")).slice(0, 200));
    }
  } catch (e) {
    console.warn("[fiscal] coingecko fetch failed:", String(e));
  }

  // Fallback: Coinbase exchange-rates (no auth, returns rates against BTC including BRL)
  try {
    const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=BTC", {
      headers: { Accept: "application/json", "User-Agent": "VERITY/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) {
      const d = await r.json() as { data?: { rates?: { BRL?: string } } };
      const brl = parseFloat(d.data?.rates?.BRL ?? "0");
      if (brl > 0) {
        console.log("[fiscal] using coinbase fallback for BTC/BRL:", brl);
        return brl;
      }
    } else {
      console.warn("[fiscal] coinbase status", r.status);
    }
  } catch (e) {
    console.warn("[fiscal] coinbase fetch failed:", String(e));
  }

  return 0;
}

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

    // BTC/BRL rate — CoinGecko primary, Coinbase fallback
    const btcBrl = await fetchBtcBrl();

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

    await applyBonusBudget(env);
    console.log("[VERITY] fiscal report:", JSON.stringify(report));
  } catch (e) {
    console.error("[VERITY] fiscal agent error:", String(e));
  }
}
