import type { Env } from "../worker";

const TIER_USD: Record<string, number> = {
  pro: 9,
  business: 99,
  lifetime: 999,
};

export async function handleProSubscribe(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({})) as { lightningAddress?: string; tier?: string };
  const { lightningAddress, tier = "pro" } = body;

  if (!lightningAddress || !lightningAddress.includes("@"))
    return json({ error: "Valid Lightning address required" }, 400);
  if (!TIER_USD[tier]) return json({ error: "Invalid tier" }, 400);

  const btcUsd = await fetchBtcUsd();
  const amountSats = Math.round((TIER_USD[tier] / btcUsd) * 100_000_000);

  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ amountSats, memo: `l402-kit ${tier} — ${lightningAddress}` }),
  });
  if (!r.ok) return json({ error: "Failed to create invoice" }, 503);

  const { paymentRequest, paymentHash } = await r.json() as { paymentRequest: string; paymentHash: string };
  return json({ paymentRequest, paymentHash, amountSats });
}

async function fetchBtcUsd(): Promise<number> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (r.ok) {
      const d = await r.json() as { bitcoin: { usd: number } };
      return d.bitcoin.usd;
    }
  } catch { /* fall through */ }
  return 95_000;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
