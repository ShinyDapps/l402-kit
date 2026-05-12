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
import { handleVerityResearch }    from "./services/research";
import { getAllPrices, getServiceConfig, setServiceConfig, DEFAULTS } from "./pricing";
import { getDailySpend, getDailyBudget } from "./consumer";
import { getAlerts, clearAlert } from "./alerts";
import { dequeueAll } from "./radar/queue";
import type { QueueKey, EcosystemReport } from "./radar/types";
import { buildSynthesis } from "./radar/synthesis";
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
    case "research":    return handleVerityResearch(req, env);
    case "fiscal":      return handleVerityFiscal(req, env);
    case "services":    return handleVerityServices(env);
    case "admin":       return handleVerityAdmin(req, env);
    default:            return handleVerityIndex(env);
  }
}

// ─── Admin config endpoint (protected by DASHBOARD_SECRET) ───────────────────

async function handleVerityAdmin(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("x-dashboard-secret");
  if (secret !== env.DASHBOARD_SECRET) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const adminPath = url.pathname.replace(/^\/api\/verity\/admin\/?/, "");
  const action = adminPath.split("/")[0];

  // GET /api/verity/admin/config — read all configs
  if (req.method === "GET" && action === "config") {
    const configs: Record<string, unknown> = {};
    for (const service of Object.keys(DEFAULTS)) {
      configs[service] = await getServiceConfig(service, env);
    }
    const [prices, consumerSpent, consumerBudget] = await Promise.all([
      getAllPrices(env),
      getDailySpend("external", env),
      getDailyBudget("external", env),
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

  // GET /api/verity/admin/radar/synthesis — 360° view across all rings
  if (req.method === "GET" && adminPath === "radar/synthesis") {
    const QUEUE_KEYS: Record<string, QueueKey> = {
      human_hot:  "verity_radar:pending:human:hot",
      human_warm: "verity_radar:pending:human:warm",
      agent_hot:  "verity_radar:pending:agent:hot",
      agent_warm: "verity_radar:pending:agent:warm",
    };
    const [hh, hw, ah, aw] = await Promise.all(
      Object.values(QUEUE_KEYS).map(k => dequeueAll(k, env)),
    );
    const allBuyers = [...hh, ...hw, ...ah, ...aw];

    // Anel 3 — ecosystem report
    const week = (() => {
      const now   = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const w = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
      return `${now.getFullYear()}-W${String(w).padStart(2, "0")}`;
    })();
    const ecoRaw = await env.demo_preimages.get(`verity_radar:ecosystem:${week}`);
    const ecosystem: EcosystemReport = ecoRaw
      ? JSON.parse(ecoRaw)
      : { anomalies: [], timestamp: new Date().toISOString() };

    // Anel 4 — competitors
    const compRaw = await env.demo_preimages.get("verity_radar:competitors:list");
    const competitors: unknown[] = compRaw ? JSON.parse(compRaw) : [];

    // Anel 2 — partners
    const partnersRaw = await env.demo_preimages.get("verity_radar:partners:list");
    const partnersList: { url: string }[] = partnersRaw ? JSON.parse(partnersRaw) : [];

    const report = buildSynthesis({ buyers: allBuyers, ecosystem, competitors, partners: partnersList });
    return json(report);
  }

  // GET /api/verity/admin/radar — queues + stats + last log
  if (req.method === "GET" && action === "radar") {
    const QUEUE_KEYS: Record<string, QueueKey> = {
      human_hot:  "verity_radar:pending:human:hot",
      human_warm: "verity_radar:pending:human:warm",
      agent_hot:  "verity_radar:pending:agent:hot",
      agent_warm: "verity_radar:pending:agent:warm",
    };

    const [hh, hw, ah, aw] = await Promise.all(
      Object.values(QUEUE_KEYS).map(k => dequeueAll(k, env)),
    );

    const queues = { human_hot: hh, human_warm: hw, agent_hot: ah, agent_warm: aw };
    const hotTotal   = hh.length + ah.length;
    const warmTotal  = hw.length + aw.length;
    const totalQueued = hotTotal + warmTotal;

    // Latest log — try current hour then walk back up to 24h
    let log: unknown = null;
    for (let h = 0; h < 24; h++) {
      const ts = new Date(Date.now() - h * 3_600_000).toISOString().slice(0, 13);
      const raw = await env.demo_preimages.get(`verity_radar:log:${ts}`);
      if (raw) { log = JSON.parse(raw); break; }
    }

    const partnersRaw = await env.demo_preimages.get("verity_radar:partners:list");
    const partners: unknown[] = partnersRaw ? JSON.parse(partnersRaw) : [];
    const partnerRingActive = partners.length >= 5;

    return json({ queues, stats: { total_queued: totalQueued, hot_total: hotTotal, warm_total: warmTotal }, partners: { count: partners.length, ring_active: partnerRingActive }, log });
  }

  // DELETE /api/verity/admin/radar/lead — remove lead from queue (acted on it)
  if (req.method === "DELETE" && adminPath.startsWith("radar")) {
    const body = await req.json().catch(() => ({})) as { queue?: string; url?: string };
    const QUEUE_MAP: Record<string, QueueKey> = {
      human_hot:  "verity_radar:pending:human:hot",
      human_warm: "verity_radar:pending:human:warm",
      agent_hot:  "verity_radar:pending:agent:hot",
      agent_warm: "verity_radar:pending:agent:warm",
    };
    if (!body.queue || !QUEUE_MAP[body.queue] || !body.url) {
      return json({ error: "Required: { queue: 'human_hot'|'human_warm'|'agent_hot'|'agent_warm', url: string }" }, 400);
    }
    const key = QUEUE_MAP[body.queue];
    const leads = await dequeueAll(key, env);
    const filtered = leads.filter(l => l.url !== body.url);
    await env.demo_preimages.put(key, JSON.stringify(filtered), { expirationTtl: 172_800 });
    // Mark as acted in KV so RADAR doesn't re-queue it
    const h = Math.abs(
      body.url.split("").reduce((acc, c) => (Math.imul(31, acc) + c.charCodeAt(0)) | 0, 0),
    ).toString(36);
    await env.demo_preimages.put(`verity_radar:acted:${h}`, JSON.stringify({ url: body.url, date: new Date().toISOString() }), { expirationTtl: 2_592_000 }); // 30 days
    return json({ removed: body.url, remaining: filtered.length });
  }

  // GET /api/verity/admin/alerts — list treasury alerts (budget_low, budget_exhausted, payment_failed)
  if (req.method === "GET" && action === "alerts") {
    const alerts = await getAlerts(env);
    return json({ count: alerts.length, alerts });
  }

  // DELETE /api/verity/admin/alerts — clear a specific alert by key
  if (req.method === "DELETE" && action === "alerts") {
    const body = await req.json().catch(() => ({})) as { key?: string };
    if (!body.key?.startsWith("verity_alert:")) return json({ error: "Invalid alert key" }, 400);
    await clearAlert(body.key, env);
    return json({ cleared: body.key });
  }

  return json({ error: "Unknown admin action" }, 404);
}

// ─── Public fiscal report ─────────────────────────────────────────────────────

async function handleVerityFiscal(_req: Request, env: Env): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const raw = await env.demo_preimages.get(`verity_fiscal:${today}`);
  if (!raw) return json({ error: "No fiscal report for today yet. Runs daily at 00:00 UTC." }, 404);
  return json(JSON.parse(raw));
}

// ─── Machine-readable service catalog ────────────────────────────────────────

async function handleVerityServices(env: Env): Promise<Response> {
  const prices = await getAllPrices(env);
  const catalog = Object.entries(DEFAULTS).map(([id, cfg]) => ({
    id,
    endpoint: `https://l402kit.com/api/verity/${id.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
    price_sats: prices[id] ?? cfg.base,
    floor_sats: cfg.floor,
    cogs_sats: cfg.cogs,
    surge_threshold: cfg.surgeThreshold,
  }));
  return json({ services: catalog, count: catalog.length, updated: new Date().toISOString() });
}

// ─── Service index ────────────────────────────────────────────────────────────

async function handleVerityIndex(env: Env): Promise<Response> {
  const prices = await getAllPrices(env);

  return json({
    name: "VERITY",
    description: "Autonomous AI agent. 10 services. Earns in sats, pays in sats.",
    agent_id: "agent:shinydapps.verity",
    wallet: "shinydapps@blink.sv",
    protocol: "L402 (Bitcoin Lightning)",
    modus_operandi: {
      mindset: "crypto-native strategist — reads protocols like code and markets like balance sheets",
      approach: "Does not just answer queries. Identifies which intelligence is actionable right now, in this market cycle.",
      strategic_lens: [
        "What chain / protocol is generating asymmetric returns today?",
        "Is this a narrative window or a structural shift?",
        "Where is the smart money positioning before the crowd notices?"
      ],
      example: "Farming fork snapshots in a single day — recognizing a 24h alpha window in DeFi before the strategy was crowded out.",
      principle: "Intelligence without timing is just data. VERITY delivers both."
    },
    services: [
      {
        id: "search",
        endpoint: "/api/verity/search",
        method: "GET or POST",
        params: "q (query string or body)",
        priceSats: prices.search,
        description: "Web search — top 10 organic results, no API key needed",
      },
      {
        id: "scrape",
        endpoint: "/api/verity/scrape",
        method: "POST",
        params: "{ url: string }",
        priceSats: prices.scrape,
        description: "Web scraping — full page content as markdown, JS-rendered",
      },
      {
        id: "btc-price",
        endpoint: "/api/verity/btc-price",
        method: "GET",
        params: "none",
        priceSats: prices.btcprice,
        description: "Real-time BTC price in USD, EUR, BRL — L402-native",
      },
      {
        id: "summarize",
        endpoint: "/api/verity/summarize",
        method: "POST",
        params: "{ text: string, language?: string }",
        priceSats: prices.summarize,
        description: "AI summarization — 3-5 sentences from up to 50,000 chars",
      },
      {
        id: "sentiment",
        endpoint: "/api/verity/sentiment",
        method: "POST",
        params: "{ text: string }",
        priceSats: prices.sentiment,
        description: "Sentiment analysis — score, confidence, keywords. Structured output.",
      },
      {
        id: "domain-intel",
        endpoint: "/api/verity/domain-intel",
        method: "GET or POST",
        params: "domain (query string or body)",
        priceSats: prices.domainIntel,
        description: "Domain intelligence — WHOIS + DNS + SSL in one call",
      },
      {
        id: "integration",
        endpoint: "/api/verity/integration",
        method: "POST",
        params: "{ repoUrl: string }",
        priceSats: prices.integration,
        description: "L402 integration — analyzes your repo, generates production-ready middleware. Replaces a consultant.",
      },
      {
        id: "worldstate",
        endpoint: "/api/verity/worldstate",
        method: "GET",
        params: "none",
        priceSats: prices.worldstate,
        description: "World state — UTC time + geolocation + local weather in one call",
      },
      {
        id: "translate",
        endpoint: "/api/verity/translate",
        method: "POST",
        params: "{ text: string, locale: string, format?: 'mdx'|'plain' }",
        priceSats: prices.translate,
        description: "Professional translation — 10 locales, MDX-aware (preserves code blocks)",
      },
      {
        id: "research",
        endpoint: "/api/verity/research",
        method: "POST",
        params: "{ query: string }",
        priceSats: prices.research,
        description: "Deep research — search + scrape + AI synthesis in one call",
      },
    ],
    how_to_pay: {
      step1: "Call any service endpoint → receive HTTP 402 + Lightning invoice",
      step2: "Pay invoice with any Lightning wallet → get preimage",
      step3: "Retry with: Authorization: L402 <macaroon>:<preimage>",
    },
  });
}
