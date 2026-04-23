import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL     = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers["x-dashboard-secret"];
  if (!DASHBOARD_SECRET || token !== DASHBOARD_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const paymentsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?select=*&order=paid_at.desc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );

    const payments = (await paymentsRes.json()) as {
      id: string; endpoint: string; payment_hash: string;
      amount_sats: number; owner_address: string; paid_at: string;
    }[];

    // ── aggregates ───────────────────────────────────────────────────────────
    const totalPayments = payments.length;
    const totalSats     = payments.reduce((s, p) => s + p.amount_sats, 0);
    const shinydappsFee = Math.floor(totalSats * 0.003);

    const byOwner: Record<string, { count: number; sats: number }> = {};
    for (const p of payments) {
      const k = p.owner_address || "anonymous";
      if (!byOwner[k]) byOwner[k] = { count: 0, sats: 0 };
      byOwner[k].count++;
      byOwner[k].sats += p.amount_sats;
    }

    // ── daily volume ─────────────────────────────────────────────────────────
    const byDay: Record<string, { count: number; sats: number }> = {};
    for (const p of payments) {
      const day = p.paid_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, sats: 0 };
      byDay[day].count++;
      byDay[day].sats += p.amount_sats;
    }

    // ── 7d trend (current vs previous period) ────────────────────────────────
    const now  = Date.now();
    const day7 = 7 * 86_400_000;
    const p7c  = payments.filter(p => now - new Date(p.paid_at).getTime() < day7);
    const p7p  = payments.filter(p => {
      const age = now - new Date(p.paid_at).getTime();
      return age >= day7 && age < day7 * 2;
    });
    const trend = {
      payments7d:     p7c.length,
      payments7dPrev: p7p.length,
      sats7d:         p7c.reduce((s, p) => s + p.amount_sats, 0),
      sats7dPrev:     p7p.reduce((s, p) => s + p.amount_sats, 0),
    };

    res.json({ totalPayments, totalSats, shinydappsFee, byOwner, byDay, trend, recent: payments.slice(0, 20) });
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
}
