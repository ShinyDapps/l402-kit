import type { Env } from "../worker";

const CACHE_TTL: Record<string, number> = {
  "btc-price":   300,   // 5 min
  worldstate:    600,   // 10 min
  search:       3600,   // 1 hour
  scrape:       3600,
  summarize:    7200,   // 2 hours
  sentiment:    7200,
  translate:   86400,   // 24 hours
  "domain-intel": 3600,
};

function hashKey(service: string, params: string): string {
  // Simple deterministic key — no crypto needed
  let h = 0;
  const s = service + ":" + params;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function getCached(service: string, params: string, env: Env): Promise<string | null> {
  const key = `verity_cache:${service}:${hashKey(service, params)}`;
  return env.demo_preimages.get(key);
}

export async function setCached(service: string, params: string, result: string, env: Env): Promise<void> {
  const ttl = CACHE_TTL[service] ?? 3600;
  const key = `verity_cache:${service}:${hashKey(service, params)}`;
  await env.demo_preimages.put(key, result, { expirationTtl: ttl });

  // Track query frequency for pre-warming
  const freqKey = `verity_qfreq:${service}:${hashKey(service, params)}`;
  const raw = await env.demo_preimages.get(freqKey);
  const count = raw ? parseInt(raw, 10) + 1 : 1;
  await env.demo_preimages.put(freqKey, String(count), { expirationTtl: 7 * 86400 });

  // Store params alongside for pre-warm jobs
  const paramsKey = `verity_qparams:${service}:${hashKey(service, params)}`;
  await env.demo_preimages.put(paramsKey, params, { expirationTtl: 7 * 86400 });
}

// Called by cron to pre-warm top queries
export async function getTopQueries(
  service: string,
  env: Env,
  limit = 5,
): Promise<{ params: string; count: number }[]> {
  const prefix = `verity_qfreq:${service}:`;
  const list = await env.demo_preimages.list({ prefix });
  const entries: { params: string; count: number }[] = [];

  for (const key of list.keys) {
    const raw = await env.demo_preimages.get(key.name);
    const paramsRaw = await env.demo_preimages.get(
      key.name.replace("verity_qfreq:", "verity_qparams:"),
    );
    if (raw && paramsRaw) {
      entries.push({ params: paramsRaw, count: parseInt(raw, 10) });
    }
  }

  return entries.sort((a, b) => b.count - a.count).slice(0, limit);
}
