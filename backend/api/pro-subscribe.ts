import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes } from "crypto";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

// Price in USD per tier
const TIER_PRICE_USD: Record<string, number> = {
  pro: 9,
  business: 99,
  lifetime: 2999,
};
// Days of access per tier
const TIER_DAYS: Record<string, number> = {
  pro: 30,
  business: 30,
  lifetime: 36500, // ~100 years
};

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

  // Create invoice via Blink
  try {
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
            memo: `l402-kit ${tier} subscription — ${lightningAddress}`,
          },
        },
      }),
    });

    const json = await gql.json() as {
      data: { lnInvoiceCreate: { invoice: { paymentRequest: string; paymentHash: string }; errors: { message: string }[] } };
    };
    const { invoice, errors } = json.data.lnInvoiceCreate;
    if (errors?.length) return res.status(500).json({ error: errors[0].message });

    // Save pending record (expires_at in the past = not yet active)
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
        expires_at: new Date(0).toISOString(), // epoch = pending
        tier,
      }),
    });

    res.json({
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      amountSats,
      btcUsd,
      tier,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create invoice" });
  }
}
