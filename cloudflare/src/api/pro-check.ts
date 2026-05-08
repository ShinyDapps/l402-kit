import type { Env } from "../worker";

const RATE_LIMIT = 10;   // requests per minute per IP
const RATE_WINDOW = 60;  // seconds

async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  const key = `rl:pro-check:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const raw = await env.demo_preimages.get(key);
  if (raw) {
    const { count, reset } = JSON.parse(raw) as { count: number; reset: number };
    if (now < reset && count >= RATE_LIMIT) return true;
    const newCount = now < reset ? count + 1 : 1;
    const newReset = now < reset ? reset : now + RATE_WINDOW;
    await env.demo_preimages.put(key, JSON.stringify({ count: newCount, reset: newReset }), { expirationTtl: RATE_WINDOW });
  } else {
    await env.demo_preimages.put(key, JSON.stringify({ count: 1, reset: now + RATE_WINDOW }), { expirationTtl: RATE_WINDOW });
  }
  return false;
}

export async function handleProCheck(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  if (!address) return json({ error: "Missing address" }, 400);

  const ip = req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For") ?? "unknown";
  if (await isRateLimited(ip, env)) return json({ error: "Too many requests" }, 429);

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