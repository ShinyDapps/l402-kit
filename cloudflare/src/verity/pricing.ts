import type { Env } from "../worker";

interface ServiceConfig {
  floor: number;
  base: number;
  surgeThreshold: number; // calls/hour to trigger +10%
}

export const SERVICES: Record<string, ServiceConfig> = {
  search:      { floor: 80,   base: 100,   surgeThreshold: 50  },
  scrape:      { floor: 150,  base: 200,   surgeThreshold: 20  },
  btcprice:    { floor: 8,    base: 10,    surgeThreshold: 200 },
  summarize:   { floor: 40,   base: 50,    surgeThreshold: 30  },
  sentiment:   { floor: 25,   base: 30,    surgeThreshold: 40  },
  domainIntel: { floor: 400,  base: 500,   surgeThreshold: 10  },
  integration: { floor: 8000, base: 10000, surgeThreshold: 3   },
  worldstate:  { floor: 60,   base: 80,    surgeThreshold: 100 },
};

export async function getPrice(service: string, env: Env): Promise<number> {
  const config = SERVICES[service];
  if (!config) return 100;
  const stored = await env.demo_preimages.get(`verity_price:${service}`);
  if (stored) return parseInt(stored, 10);
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

  for (const [service, config] of Object.entries(SERVICES)) {
    const callsRaw = await env.demo_preimages.get(`verity_calls:${service}:${hour}`);
    const calls = callsRaw ? parseInt(callsRaw, 10) : 0;
    const currentPrice = await getPrice(service, env);

    let newPrice = currentPrice;

    if (calls >= config.surgeThreshold) {
      newPrice = Math.round(currentPrice * 1.1);
    } else if (calls === 0) {
      const prevRaw = await env.demo_preimages.get(`verity_calls:${service}:${hour - 1}`);
      const prevCalls = prevRaw ? parseInt(prevRaw, 10) : 0;
      if (prevCalls === 0) {
        newPrice = Math.max(config.floor, Math.round(currentPrice * 0.9));
      }
    }

    if (newPrice !== currentPrice) {
      await env.demo_preimages.put(`verity_price:${service}`, String(newPrice));
      changes[service] = newPrice;
    }
  }

  return changes;
}

export async function getAllPrices(env: Env): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const service of Object.keys(SERVICES)) {
    result[service] = await getPrice(service, env);
  }
  return result;
}
