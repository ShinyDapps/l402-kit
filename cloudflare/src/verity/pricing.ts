import type { Env } from "../worker";

export const MARGIN_FLOOR = 50; // sats — canonical invariant: never sell below COGS + this

export interface ServiceConfig {
  floor: number;
  base: number;
  surgeThreshold: number;
  cogs: number; // estimated sats cost to serve one request
}

export const DEFAULTS: Record<string, ServiceConfig> = {
  search:      { floor: 500,    base: 500,    surgeThreshold: 50,  cogs: 50  },
  scrape:      { floor: 500,    base: 500,    surgeThreshold: 20,  cogs: 20  },
  btcprice:    { floor: 100,    base: 100,    surgeThreshold: 200, cogs: 0   },
  summarize:   { floor: 500,    base: 500,    surgeThreshold: 30,  cogs: 1   },
  sentiment:   { floor: 300,    base: 300,    surgeThreshold: 40,  cogs: 1   },
  domainIntel: { floor: 2000,   base: 2000,   surgeThreshold: 10,  cogs: 0   },
  integration: { floor: 200000, base: 200000, surgeThreshold: 3,   cogs: 150 },
  worldstate:  { floor: 300,    base: 300,    surgeThreshold: 100, cogs: 0   },
  translate:   { floor: 500,    base: 500,    surgeThreshold: 30,  cogs: 1   },
  research:    { floor: 2000,   base: 2000,   surgeThreshold: 15,  cogs: 51  },
  alpha:       { floor: 5000,   base: 5000,   surgeThreshold: 10,  cogs: 100 },
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
  await env.demo_preimages.put(key, String(raw ? parseInt(raw, 10) + 1 : 1), { expirationTtl: 7200 });
}

export async function recordSuccess(service: string, env: Env): Promise<void> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `verity_success:${service}:${hour}`;
  const raw = await env.demo_preimages.get(key);
  await env.demo_preimages.put(key, String(raw ? parseInt(raw, 10) + 1 : 1), { expirationTtl: 86400 });
}

export async function recordError(service: string, env: Env): Promise<void> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `verity_error:${service}:${hour}`;
  const raw = await env.demo_preimages.get(key);
  await env.demo_preimages.put(key, String(raw ? parseInt(raw, 10) + 1 : 1), { expirationTtl: 86400 });
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

export async function adjustPrice(service: string, direction: "up" | "down", env: Env): Promise<void> {
  const config = await getServiceConfig(service, env);
  const current = await getPrice(service, env);
  const factor = direction === "up" ? 1.05 : 0.9;
  const newPrice = Math.max(
    Math.round(current * factor),
    Math.max(config.floor, config.cogs + MARGIN_FLOOR),
  );
  if (newPrice !== current) {
    await env.demo_preimages.put(`verity_price:${service}`, String(newPrice));
  }
}

export async function getAllPrices(env: Env): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const service of Object.keys(DEFAULTS)) {
    result[service] = await getPrice(service, env);
  }
  return result;
}