import type { Env } from "../worker";

const WINDOW_SECS  = 60;
const LIMIT_PER_IP = 10;   // 10 calls/min per IP on VERITY endpoints
const LIMIT_GLOBAL = 300;  // 300 calls/min total across all VERITY

export async function verityRateLimit(req: Request, env: Env): Promise<boolean> {
  const ip     = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const minute = Math.floor(Date.now() / 60_000);

  const [globalLimited, ipLimited] = await Promise.all([
    checkLimit(`verity_rl:global:${minute}`, LIMIT_GLOBAL, env),
    checkLimit(`verity_rl:ip:${ip}:${minute}`, LIMIT_PER_IP, env),
  ]);

  return globalLimited || ipLimited;
}

async function checkLimit(key: string, limit: number, env: Env): Promise<boolean> {
  const raw   = await env.demo_preimages.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return true;
  await env.demo_preimages.put(key, String(count + 1), { expirationTtl: WINDOW_SECS * 2 });
  return false;
}
