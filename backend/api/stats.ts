import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers["x-dashboard-secret"];
  if (!DASHBOARD_SECRET || token !== DASHBOARD_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/payments?select=*&order=paid_at.desc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    const payments = (await r.json()) as {
      id: string; endpoint: string; preimage: string;
      amount_sats: number; owner_address: string; paid_at: string;
    }[];

    const totalPayments = payments.length;
    const totalSats = payments.reduce((s, p) => s + p.amount_sats, 0);
    const shinydappsFee = Math.floor(totalSats * 0.003);

    const byOwner: Record<string, { count: number; sats: number }> = {};
    for (const p of payments) {
      const k = p.owner_address || "anonymous";
      if (!byOwner[k]) byOwner[k] = { count: 0, sats: 0 };
      byOwner[k].count++;
      byOwner[k].sats += p.amount_sats;
    }

    res.json({
      totalPayments,
      totalSats,
      shinydappsFee,
      byOwner,
      recent: payments.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
}
