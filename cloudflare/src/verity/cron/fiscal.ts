import type { Env } from "../../worker";
import { SERVICES, getPrice } from "../pricing";

export async function runFiscalAgent(env: Env): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const hour = Math.floor(Date.now() / 3_600_000);

    let totalSats = 0;
    const breakdown: Record<string, { calls: number; price: number; revenue: number }> = {};

    for (const service of Object.keys(SERVICES)) {
      let dailyCalls = 0;
      for (let h = 0; h < 24; h++) {
        const raw = await env.demo_preimages.get(`verity_calls:${service}:${hour - h}`);
        if (raw) dailyCalls += parseInt(raw, 10);
      }
      const price = await getPrice(service, env);
      const revenue = dailyCalls * price;
      totalSats += revenue;
      breakdown[service] = { calls: dailyCalls, price, revenue };
    }

    // Get BTC/BRL rate for fiat equivalent
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

    const report = {
      date: today,
      agent: "VERITY",
      total_sats: totalSats,
      brl_equivalent: brlEquivalent,
      btc_brl_rate: btcBrl,
      breakdown,
      generated_at: new Date().toISOString(),
    };

    // Store in KV (7 day retention)
    await env.demo_preimages.put(
      `verity_fiscal:${today}`,
      JSON.stringify(report),
      { expirationTtl: 7 * 86400 },
    );

    console.log("[VERITY] fiscal report:", JSON.stringify(report));
  } catch (e) {
    console.error("[VERITY] fiscal agent error:", String(e));
  }
}
