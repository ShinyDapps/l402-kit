import type { Env } from "../worker";
import { handleVeritySearch }      from "./services/search";
import { handleVerityScrape }      from "./services/scrape";
import { handleVerityBtcPrice }    from "./services/btcprice";
import { handleVeritySummarize }   from "./services/summarize";
import { handleVeritySentiment }   from "./services/sentiment";
import { handleVerityDomainIntel } from "./services/domainIntel";
import { handleVerityIntegration } from "./services/integration";
import { handleVerityWorldState }  from "./services/worldstate";
import { handleVerityTranslate }   from "./services/translate";
import { getAllPrices, getServiceConfig, setServiceConfig, DEFAULTS } from "./pricing";
import { getDailySpend, getDailyBudget } from "./consumer";
import { verityRateLimit } from "./ratelimit";
import { json } from "./l402";

export async function handleVerity(req: Request, env: Env): Promise<Response> {
  // Rate limit all VERITY endpoints
  if (await verityRateLimit(req, env)) {
    return json({ error: "Too many requests. Max 10/min per IP." }, 429);
  }

  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/api\/verity\/?/, "").split("/")[0];

  switch (sub) {
    case "search":      return handleVeritySearch(req, env);
    case "scrape":      return handleVerityScrape(req, env);
    case "btc-price":   return handleVerityBtcPrice(req, env);
    case "summarize":   return handleVeritySummarize(req, env);
    case "sentiment":   return handleVeritySentiment(req, env);
    case "domain-intel": return handleVerityDomainIntel(req, env);
    case "integration": return handleVerityIntegration(req, env);
    case "worldstate":  return handleVerityWorldState(req, env);
    case "translate":   return handleVerityTranslate(req, env);
    case "admin":       return handleVerityAdmin(req, env);
    default:            return handleVerityIndex(env);
  }
}

// ─── Admin config endpoint (protected by DASHBOARD_SECRET) ───────────────────

async function handleVerityAdmin(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("x-dashboard-secret");
  if (secret !== env.DASHBOARD_SECRET) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.pathname.replace(/^\/api\/verity\/admin\/?/, "").split("/")[0];

  // GET /api/verity/admin/config — read all configs
  if (req.method === "GET" && action === "config") {
    const configs: Record<string, unknown> = {};
    for (const service of Object.keys(DEFAULTS)) {
      configs[service] = await getServiceConfig(service, env);
    }
    const [prices, consumerSpent, consumerBudget] = await Promise.all([
      getAllPrices(env),
      getDailySpend(env),
      getDailyBudget(env),
    ]);
    return json({ configs, prices, consumer: { spent_today: consumerSpent, budget: consumerBudget } });
  }

  // POST /api/verity/admin/config — update a service config
  if (req.method === "POST" && action === "config") {
    const body = await req.json().catch(() => ({})) as {
      service?: string;
      base?: number;
      floor?: number;
      surgeThreshold?: number;
      cogs?: number;
    };
    if (!body.service || !DEFAULTS[body.service]) {
      return json({ error: "Invalid service", valid: Object.keys(DEFAULTS) }, 400);
    }
    const updated = await setServiceConfig(body.service, {
      ...(body.base            !== undefined && { base: body.base }),
      ...(body.floor           !== undefined && { floor: body.floor }),
      ...(body.surgeThreshold  !== undefined && { surgeThreshold: body.surgeThreshold }),
      ...(body.cogs            !== undefined && { cogs: body.cogs }),
    }, env);
    return json({ updated, service: body.service });
  }

  // POST /api/verity/admin/budget — set consumer daily budget
  if (req.method === "POST" && action === "budget") {
    const body = await req.json().catch(() => ({})) as { sats?: number };
    if (!body.sats || body.sats < 100) return json({ error: "Minimum budget is 100 sats" }, 400);
    await env.demo_preimages.put("verity_consumer_budget", String(body.sats));
    return json({ consumer_budget_sats: body.sats });
  }

  return json({ error: "Unknown admin action" }, 404);
}

// ─── Service index ────────────────────────────────────────────────────────────

async function handleVerityIndex(env: Env): Promise<Response> {
  const prices = await getAllPrices(env);

  return json({
    name: "VERITY",
    description: "Autonomous AI agent. 9 services. Earns in sats, pays in sats.",
    agent_id: "agent:shinydapps.verity",
    wallet: "shinydapps@blink.sv",
    protocol: "L402 (Bitcoin Lightning)",
    services: [
      {
        id: "search",
        endpoint: "/api/verity/search",
        method: "GET or POST",
        params: "q (query string or body)",
        priceSats: prices.search,
        description: "Web search — returns top 10 organic results",
      },
      {
        id: "scrape",
        endpoint: "/api/verity/scrape",
        method: "POST",
        params: "{ url: string }",
        priceSats: prices.scrape,
        description: "Web scraping — returns page content as markdown",
      },
      {
        id: "btc-price",
        endpoint: "/api/verity/btc-price",
        method: "GET",
        params: "none",
        priceSats: prices.btcprice,
        description: "Real-time BTC price in USD, EUR, BRL",
      },
      {
        id: "summarize",
        endpoint: "/api/verity/summarize",
        method: "POST",
        params: "{ text: string, language?: string }",
        priceSats: prices.summarize,
        description: "Text summarization via AI — up to 50,000 chars",
      },
      {
        id: "sentiment",
        endpoint: "/api/verity/sentiment",
        method: "POST",
        params: "{ text: string }",
        priceSats: prices.sentiment,
        description: "Sentiment analysis — returns score, confidence, keywords",
      },
      {
        id: "domain-intel",
        endpoint: "/api/verity/domain-intel",
        method: "GET or POST",
        params: "domain (query string or body)",
        priceSats: prices.domainIntel,
        description: "Domain intelligence — WHOIS, DNS, SSL certificates",
      },
      {
        id: "integration",
        endpoint: "/api/verity/integration",
        method: "POST",
        params: "{ repoUrl: string }",
        priceSats: prices.integration,
        description: "l402-kit integration — analyzes your repo and generates complete middleware code",
      },
      {
        id: "worldstate",
        endpoint: "/api/verity/worldstate",
        method: "GET",
        params: "none",
        priceSats: prices.worldstate,
        description: "World state — UTC time + caller geolocation + local weather in one call",
      },
      {
        id: "translate",
        endpoint: "/api/verity/translate",
        method: "POST",
        params: "{ text: string, locale: string, format?: 'mdx'|'plain' }",
        priceSats: prices.translate,
        description: "Text translation — 10 locales, MDX-aware (preserves code blocks and components)",
      },
    ],
    how_to_pay: {
      step1: "Call any service endpoint → receive HTTP 402 + Lightning invoice",
      step2: "Pay invoice with any Lightning wallet → get preimage",
      step3: "Retry with: Authorization: L402 <macaroon>:<preimage>",
    },
  });
}
