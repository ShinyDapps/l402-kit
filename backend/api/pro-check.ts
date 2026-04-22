import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const address = req.query.address as string;
  if (!address) return res.status(400).json({ error: "Missing address" });

  const now = new Date().toISOString();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${now}&select=tier,expires_at&order=expires_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await r.json() as { tier: string; expires_at: string }[];

  if (rows.length > 0) {
    res.json({ pro: true, tier: rows[0].tier, expires_at: rows[0].expires_at });
  } else {
    res.json({ pro: false });
  }
}
