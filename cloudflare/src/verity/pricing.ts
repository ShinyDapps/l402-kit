import type { Env } from "../worker";

export const MARGIN_FLOOR = 50; // sats — canonical invariant: never sell below COGS + this

export interface ServiceConfig {
  floor: number;
  base: number;
  surgeThreshold: number;
  cogs: number; // estimated sats cost to serve one request
}

export const DEFAULTS: Record<string, ServiceConfig> = {
  search:      { floor: 100,   base: 100,   surgeThreshold: 50,  cogs: 50  },
  scrape:      { floor: 200,   base: 200,   surgeThreshold: 20,  cogs: 20  }, // Jina grátis reduz COGS
  btcprice:    { floor: 10,    base: 10,    surgeThreshold: 200, cogs: 0   },
  summarize:   { floor: 50,    base: 50,    surgeThreshold: 30,  cogs: 1   },
  sentiment:   { floor: 30,    base: 30,    surgeThreshold: 40,  cogs: 1   },
  domainIntel: { floor: 500,   base: 500,   surgeThreshold: 10,  cogs: 0   },
  integration: { floor: 10000, base: 10000, surgeThreshold: 3,   cogs: 150 },
  worldstate:  { floor: 80,    base: 80,    surgeThreshold: 100, cogs: 0   },
  translate:   { floor: 50,    base: 50,    surgeThreshold: 30,  cogs: 1   },
};

export async function getServiceConfig(service: string, env: Env): Promise<ServiceConfig> {
  try {
    const raw = await env.demo_preimages.get(`verity_config:${service}`);
    if (raw) return JSON.parse(raw) as ServiceConfig;
  } catch { /* fall through to defaults */ }
  return DEFAULTS[service] ?? { floor: 100, base: 100, surgeThreshold: 50, cogs: 0 };
}

export async function setServiceConfig(service: string, patch: Partial<ServiceConfig>, env: Env): Promise<ServiceConfig> {
  const current = await getServiceConfig(service, env);
  const next: ServiceConfig = { ...current, ...patch };
  // Canonical invariant enforced at write time — floor can never be below COGS + MARGIN_FLOOR
  next.floor = Math.max(next.floor, next.cogs + MARGIN_FLOOR);
  next.base = Math.max(next.base, next.floor);
  await env.demo_preimages.put(`verity_config:${service}`, JSON.stringify(next));
  return next;
}

export async function getPrice(service: string, env: Env): Promise<number> {
  const stored = await env.demo_preimages.get(`verity_price:${service}`);
  if (stored) return parseInt(stored, 10);
  const config = await getServiceConfig(service, env);
  return config.base;
}

export async function recordCall(service: string, env: Env): Promise<void> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `verity_calls:${service}:${hour}`;
  const raw = await env.demo_preimages.get(key);
  const count = raw ? parseInt(raw, 10) + 1 : 1;
  await env.demo_preimages.put(key, String(count), { expirationTtl: 7200 });
}

export async function adjustAllPrices(env: Env): Promise<Record<string, number>> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const changes: Record<string, number> = {};

  for (const service of Object.keys(DEFAULTS)) {
    const config = await getServiceConfig(service, env);
    const callsRaw = await env.demo_preimages.get(`verity_calls:${service}:${hour}`);
    const calls = callsRaw ? parseInt(callsRaw, 10) : 0;
    const currentPrice = await getPrice(service, env);

    let newPrice = currentPrice;

    if (calls >= config.surgeThreshold) {
      newPrice = Math.round(currentPrice * 1.1);
    } else if (calls === 0) {
      const prevRaw = await env.demo_preimages.get(`verity_calls:${service}:${hour - 1}`);
      if (!prevRaw || parseInt(prevRaw, 10) === 0) {
        newPrice = Math.round(currentPrice * 0.9);
      }
    }

    // Canonical invariant: never sell below COGS + MARGIN_FLOOR
    const hardFloor = Math.max(config.floor, config.cogs + MARGIN_FLOOR);
    newPrice = Math.max(newPrice, hardFloor);

    if (newPrice !== currentPrice) {
      await env.demo_preimages.put(`verity_price:${service}`, String(newPrice));
      changes[service] = newPrice;
    }
  }

  return changes;
}

export async function getAllPrices(env: Env): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const service of Object.keys(DEFAULTS)) {
    result[service] = await getPrice(service, env);
  }
  return result;
}