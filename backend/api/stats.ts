/**
 * Dashboard stats — autenticação via LNURL-auth token (preferido) ou DASHBOARD_SECRET (legado).
 *
 * Auth preferida:
 *   Header x-lnurl-token: <64-char token>
 *   Token emitido pelo wallet do owner após LNURL-auth (?dashboard=1).
 *   Validado contra lnurl_challenges: verified=true, não expirado, pubkey===OWNER_PUBKEY.
 *   Nenhuma senha precisa existir no Vercel — OWNER_PUBKEY é chave pública, segura.
 *
 * Auth legada (remover após configurar OWNER_PUBKEY):
 *   Header x-dashboard-secret: <secret>
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL     = process.env.SUPABASE_URL        ?? "";
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const OWNER_PUBKEY     = process.env.OWNER_PUBKEY         ?? "";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET     ?? ""; // legado

const sb = (path: string) =>
  fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });

async function authenticate(req: VercelRequest): Promise<boolean> {
  const lnurlToken = req.headers["x-lnurl-token"] as string | undefined;

  if (lnurlToken) {
    if (!OWNER_PUBKEY) return false; // OWNER_PUBKEY não configurado — bloqueia
    const r = await sb(
      `/lnurl_challenges?token=eq.${encodeURIComponent(lnurlToken)}&select=verified,token_expires_at,pubkey&limit=1`
    );
    const rows = (await r.json()) as { verified: boolean; token_expires_at: string; pubkey: string }[];
    const row = rows[0];
    if (!row || !row.verified) return false;
    if (row.pubkey !== OWNER_PUBKEY) return false;
    if (new Date(row.token_expires_at) < new Date()) return false;
    return true;
  }

  // Legado: DASHBOARD_SECRET
  const secret = req.headers["x-dashboard-secret"];
  return !!(DASHBOARD_SECRET && secret === DASHBOARD_SECRET);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!(await authenticate(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const paymentsRes = await sb(
      "/payments?select=*&order=paid_at.desc"
    );
    const payments = (await paymentsRes.json()) as {
      id: string; endpoint: string; payment_hash: string;
      amount_sats: number; owner_address: string; paid_at: string;
    }[];

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

    const byDay: Record<string, { count: number; sats: number }> = {};
    for (const p of payments) {
      const day = p.paid_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, sats: 0 };
      byDay[day].count++;
      byDay[day].sats += p.amount_sats;
    }

    const now  = Date.now();
    const day7 = 7 * 86_400_000;
    const p7c  = payments.filter(p => now - new Date(p.paid_at).getTime() < day7);
    const p7p  = payments.filter(p => {
      const age = now - new Date(p.paid_at).getTime();
      return age >= day7 && age < day7 * 2;
    });

    return res.json({
      totalPayments,
      totalSats,
      shinydappsFee,
      byOwner,
      byDay,
      trend: {
        payments7d:     p7c.length,
        payments7dPrev: p7p.length,
        sats7d:         p7c.reduce((s, p) => s + p.amount_sats, 0),
        sats7dPrev:     p7p.reduce((s, p) => s + p.amount_sats, 0),
      },
      recent: payments.slice(0, 20),
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
}
