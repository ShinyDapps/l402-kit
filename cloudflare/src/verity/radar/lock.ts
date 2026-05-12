import type { Env } from "../../worker";

const LOCK_KEY = "verity_radar:running";

export async function acquireRadarLock(env: Env): Promise<string | null> {
  const existing = await env.demo_preimages.get(LOCK_KEY);
  if (existing) return null;
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await env.demo_preimages.put(LOCK_KEY, token, { expirationTtl: 60 });
  const check = await env.demo_preimages.get(LOCK_KEY);
  return check === token ? token : null;
}

export async function releaseRadarLock(token: string, env: Env): Promise<void> {
  const current = await env.demo_preimages.get(LOCK_KEY);
  if (current === token) await env.demo_preimages.delete(LOCK_KEY);
}
