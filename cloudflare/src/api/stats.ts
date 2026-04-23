import type { Env } from "../worker";

async function authenticate(req: Request, env: Env): Promise<boolean> {
  const secret = req.headers.get("x-dashboard-secret");
  return !!(env.DASHBOARD_SECRET && secret === env.DASHBOARD_SECRET);
}

function sb(path: string, env: Env): Promise<Response> {
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

export async function handleStats(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!(await authenticate(req, env))) return json({ error: "Unauthorized" }, 401);

  try {
    const paymentsRes = await sb("/payments?select=*&order=paid_at.desc", env);
    const payments = await paymentsRes.json() as {
      id: string; endpoint: string; payment_hash: string;
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

    const byDay: Record<string, { count: number; sats: number }> = {};
    for (const p of payments) {
      const day = p.paid_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, sats: 0 };
      byDay[day].count++;
      byDay[day].sats += p.amount_sats;
    }

    const now = Date.now();
    const day7 = 7 * 86_400_000;
    const p7c = payments.filter(p => now - new Date(p.paid_at).getTime() < day7);
    const p7p = payments.filter(p => {
      const age = now - new Date(p.paid_at).getTime();
      return age >= day7 && age < day7 * 2;
    });

    return json({
      totalPayments, totalSats, shinydappsFee, byOwner, byDay,
      trend: {
        payments7d: p7c.length, payments7dPrev: p7p.length,
        sats7d: p7c.reduce((s, p) => s + p.amount_sats, 0),
        sats7dPrev: p7p.reduce((s, p) => s + p.amount_sats, 0),
      },
      recent: payments.slice(0, 20),
    });
  } catch {
    return json({ error: "Failed to fetch stats" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
