import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall, recordSuccess } from "../pricing";

const SERVICE = "btcprice";

export async function handleVerityBtcPrice(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    await recordCall(SERVICE, env);
    await recordSuccess(SERVICE, env);

    const price = await fetchBtcPrice();
    return json({
      agent: "VERITY",
      service: SERVICE,
      bitcoin: price,
      timestamp: new Date().toISOString(),
      paid_with: "⚡ Lightning L402",
    });
  }

  const priceSats = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(priceSats, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, priceSats, inv);
}

async function fetchBtcPrice(): Promise<{ usd: number; eur: number; brl: number; source: string }> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,brl",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (r.ok) {
      const d = await r.json() as { bitcoin: { usd: number; eur: number; brl: number } };
      return { ...d.bitcoin, source: "CoinGecko" };
    }
  } catch { /* fallback */ }

  try {
    const [usd, eur] = await Promise.all([
      fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot").then(r => r.json()) as Promise<{ data: { amount: string } }>,
      fetch("https://api.coinbase.com/v2/prices/BTC-EUR/spot").then(r => r.json()) as Promise<{ data: { amount: string } }>,
    ]);
    return { usd: parseFloat(usd.data.amount), eur: parseFloat(eur.data.amount), brl: 0, source: "Coinbase" };
  } catch { /* ignore */ }

  return { usd: 0, eur: 0, brl: 0, source: "unavailable" };
}
