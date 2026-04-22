import type { VercelRequest, VercelResponse } from "@vercel/node";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { paymentHash } = req.query as Record<string, string>;
  if (!paymentHash) return res.status(400).json({ error: "Missing paymentHash" });

  // Check Supabase record
  const dbRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_access?payment_hash=eq.${encodeURIComponent(paymentHash)}&select=address,tier,expires_at,created_at&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await dbRes.json() as { address: string; tier: string; expires_at: string | null; created_at: string }[];

  if (!rows.length) {
    return res.status(404).json({ error: "Payment hash not found" });
  }

  const record = rows[0];

  // Confirm status on Blink (source of truth)
  let onChainStatus = "UNKNOWN";
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
      signal: AbortSignal.timeout(8_000),
    });
    const json = await gql.json() as { data: { lnInvoice: { status: string } } };
    onChainStatus = json.data?.lnInvoice?.status ?? "UNKNOWN";
  } catch { /* non-fatal — Supabase record is the activation truth */ }

  const active = record.expires_at !== null && new Date(record.expires_at) > new Date();

  res.json({
    paymentHash,
    address: record.address,
    tier: record.tier,
    active,
    expires_at: record.expires_at,
    activated_at: record.created_at,
    lightning_status: onChainStatus,
    verify_url: `https://l402kit.vercel.app/api/verify?paymentHash=${encodeURIComponent(paymentHash)}`,
  });
}
