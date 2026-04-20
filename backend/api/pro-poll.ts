import type { VercelRequest, VercelResponse } from "@vercel/node";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const TIER_DAYS: Record<string, number> = {
  pro: 30,
  business: 30,
  lifetime: 36500,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { paymentHash, address, tier = "pro" } = req.query as Record<string, string>;
  if (!paymentHash || !address) return res.status(400).json({ error: "Missing paymentHash or address" });

  // Check payment status on Blink
  try {
    const gql = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
      body: JSON.stringify({
        query: `query CheckInvoice($paymentHash: PaymentHash!) {
          lnInvoice(paymentHash: $paymentHash) { status }
        }`,
        variables: { paymentHash },
      }),
    });
    const json = await gql.json() as { data: { lnInvoice: { status: string } } };
    const status = json.data?.lnInvoice?.status;

    if (status !== "PAID") {
      return res.json({ paid: false, status: status ?? "PENDING" });
    }

    // Activate: update expires_at from epoch to now + days
    const days = TIER_DAYS[tier] ?? 30;
    const expires_at = new Date(Date.now() + days * 86400_000).toISOString();

    const update = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_access?payment_hash=eq.${encodeURIComponent(paymentHash)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ expires_at }),
      }
    );

    if (!update.ok) {
      return res.status(500).json({ error: "Failed to activate subscription" });
    }

    res.json({ paid: true, tier, expires_at });
  } catch (err) {
    res.status(500).json({ error: "Failed to check payment" });
  }
}
