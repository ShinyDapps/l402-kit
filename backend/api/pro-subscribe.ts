import type { VercelRequest, VercelResponse } from "@vercel/node";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const TIER_PRICE_USD: Record<string, number> = { pro: 9, business: 99, lifetime: 999 };
const TIER_DAYS: Record<string, number> = { pro: 30, business: 30, lifetime: 36500 };

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { lightningAddress, tier = "pro" } = req.body ?? {};
  if (!lightningAddress) return res.status(400).json({ error: "Missing lightningAddress" });
  if (!TIER_PRICE_USD[tier]) return res.status(400).json({ error: "Invalid tier" });

  // Get current BTC price to calculate sats
  let btcUsd = 90000;
  try {
    const priceRes = await fetch("https://mempool.space/api/v1/prices");
    const priceData = await priceRes.json() as { USD: number };
    btcUsd = priceData.USD || btcUsd;
  } catch { /* use fallback */ }

  const amountSats = Math.ceil((TIER_PRICE_USD[tier] / btcUsd) * 100_000_000);

  try {
    const invoice = await withRetry(async () => {
      const gql = await fetch("https://api.blink.sv/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
        body: JSON.stringify({
          query: `mutation CreateInvoice($input: LnInvoiceCreateInput!) {
            lnInvoiceCreate(input: $input) {
              invoice { paymentRequest paymentHash }
              errors { message }
            }
          }`,
          variables: {
            input: {
              walletId: BLINK_WALLET_ID,
              amount: amountSats,
              memo: `l402-kit ${tier} subscription \u2014 ${lightningAddress}`,
            },
          },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!gql.ok) throw new Error(`Blink HTTP ${gql.status}`);
      const json = await gql.json() as {
        data: { lnInvoiceCreate: { invoice: { paymentRequest: string; paymentHash: string }; errors: { message: string }[] } };
      };
      const { invoice, errors } = json.data.lnInvoiceCreate;
      if (errors?.length) throw new Error(errors[0].message);
      return invoice;
    });

    // Save pending record. expires_at = null means unpaid.
    // pro-poll (or blink-webhook) will set a real date on confirmation.
    await fetch(`${SUPABASE_URL}/rest/v1/pro_access`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        address: lightningAddress,
        payment_hash: invoice.paymentHash,
        expires_at: null,
        tier,
      }),
    });

    res.json({ paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash, amountSats, btcUsd, tier });
  } catch (err) {
    console.error("[pro-subscribe] all retries failed:", String(err));
    res.status(503).json({ error: "Lightning provider temporarily unavailable. Retry in a moment." });
  }
}
