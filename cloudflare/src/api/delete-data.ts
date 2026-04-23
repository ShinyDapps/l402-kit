import type { Env } from "../worker";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleDeleteData(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({})) as { lightningAddress?: string; token?: string };
  const { lightningAddress, token } = body;
  if (!lightningAddress || !token) return json({ error: "Missing lightningAddress or token" }, 400);
  if (token.length < 64) return json({ error: "Invalid token" }, 400);

  // Verify token against lnurl_challenges
  const rows = await fetch(
    `${env.SUPABASE_URL}/rest/v1/lnurl_challenges?token=eq.${token}&verified=eq.true&limit=1`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } }
  ).then(r => r.json()) as { lightning_address?: string; token_expires_at: string }[];

  const row = rows[0];
  if (!row) return json({ error: "Invalid or unverified token" }, 401);
  if (new Date(row.token_expires_at) < new Date()) return json({ error: "Token expired" }, 401);

  // Delete payments
  const delPayments = await fetch(
    `${env.SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(lightningAddress)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );

  // Delete pro access
  const delPro = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(lightningAddress)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );

  return json({ ok: true, paymentsDeleted: delPayments.ok, proDeleted: delPro.ok });
}
