const SERVICE_CATEGORIES: Record<string, string> = {
  search: "search",
  scrape: "tools",
  summarize: "ai/ml",
  sentiment: "ai/ml",
  translate: "ai/ml",
  "domain-intel": "tools",
  worldstate: "data",
};

export interface MarketAlternative {
  url: string;
  priceSats: number;
  name: string;
}

export async function findCheaperAlternative(
  service: string,
  myPriceSats: number,
  marginFloor: number,
): Promise<MarketAlternative | null> {
  const category = SERVICE_CATEGORIES[service];
  if (!category) return null;

  try {
    const r = await fetch(
      `https://satring.com/api/v1/services?category=${encodeURIComponent(category)}&limit=20`,
      { signal: AbortSignal.timeout(2_500) },
    );
    if (!r.ok) return null;

    const data = await r.json() as { services?: { name: string; url: string; pricing_sats: number }[] };
    const services = data.services ?? [];

    for (const svc of services.sort((a, b) => a.pricing_sats - b.pricing_sats)) {
      if (!svc.url || svc.url.includes("l402kit.com")) continue;
      const cost = svc.pricing_sats;
      if (cost > 0 && myPriceSats - cost >= marginFloor) {
        return { url: svc.url, priceSats: cost, name: svc.name };
      }
    }
  } catch { /* network error — fall through */ }

  return null;
}
