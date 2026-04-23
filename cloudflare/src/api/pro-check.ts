import type { Env } from "../worker";

export async function handleProCheck(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  if (!address) return json({ error: "Missing address" }, 400);

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1&select=expires_at`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } }
  );
  const rows = await r.json() as { expires_at: string }[];
  const active = rows.length > 0;
  return json({ active, expiresAt: rows[0]?.expires_at ?? null });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
