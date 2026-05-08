import type { Env } from "../worker";

export async function handleProCheck(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  if (!address) return json({ error: "Missing address" }, 400);

  // Owner bypass — endereços em OWNER_ADDRESSES têm Pro vitalício
  const owners = (env.OWNER_ADDRESSES ?? "").split(",").map(s => s.trim().toLowerCase());
  if (owners.includes(address.toLowerCase())) {
    return json({ pro: true, active: true, expiresAt: "lifetime" });
  }

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1&select=expires_at`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const rows = await r.json() as { expires_at: string }[];
  const active = rows.length > 0;
  return json({ pro: active, active, expiresAt: rows[0]?.expires_at ?? null });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
