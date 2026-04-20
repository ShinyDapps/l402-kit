import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const address = String(req.query.address ?? "");
  const sessionToken = String(req.headers["x-session-token"] ?? "");

  if (!address || !sessionToken) return res.status(400).json({ error: "Missing address or token" });

  // Verify session token is valid for this address (must have active pro access)
  const accessRows = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  ).then(r => r.json()) as { payment_hash: string; expires_at: string }[];

  if (!accessRows.length) return res.status(401).json({ error: "No active Pro access" });

  const expected = createHash("sha256").update(`${address}:${accessRows[0].payment_hash}`).digest("hex");
  if (sessionToken !== expected) return res.status(401).json({ error: "Invalid session" });

  // Fetch payments for this address
  const payments = await fetch(
    `${SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(address)}&order=paid_at.desc&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  ).then(r => r.json()) as { endpoint: string; amount_sats: number; paid_at: string; preimage: string }[];

  const totalSats = payments.reduce((s, p) => s + p.amount_sats, 0);
  const byEndpoint: Record<string, { count: number; sats: number }> = {};
  for (const p of payments) {
    if (!byEndpoint[p.endpoint]) byEndpoint[p.endpoint] = { count: 0, sats: 0 };
    byEndpoint[p.endpoint].count++;
    byEndpoint[p.endpoint].sats += p.amount_sats;
  }

  // Daily totals (last 30 days)
  const daily: Record<string, number> = {};
  for (const p of payments) {
    const day = p.paid_at.slice(0, 10);
    daily[day] = (daily[day] ?? 0) + p.amount_sats;
  }

  res.json({
    address,
    totalPayments: payments.length,
    totalSats,
    ownerEarnings: Math.floor(totalSats * 0.997),
    proExpiresAt: accessRows[0].expires_at,
    byEndpoint,
    daily,
    recent: payments.slice(0, 50),
  });
}
