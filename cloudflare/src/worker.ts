import { handleInvoice }    from "./api/invoice";
import { handleStats }      from "./api/stats";
import { handleSplit }      from "./api/split";
import { handleDevToken }   from "./api/dev-token";
import { handleDemo, handleDemoBtcPrice, handleDemoPreimage, handleDemoPayAddress } from "./api/demo";
import { handleVerify }     from "./api/verify";
import { handleLnurlAuth }  from "./api/lnurl-auth";
import { handleLnurlp }     from "./api/lnurlp";
import { handleBlinkHook }  from "./api/blink-webhook";
import { handleDeleteData } from "./api/delete-data";
import { handleDevStats, handleBadgeTests } from "./api/dev-stats";
import { handleProCheck }   from "./api/pro-check";
import { handleProPoll }    from "./api/pro-poll";
import { handleGlobalStats } from "./api/global-stats";
import { handleProSubscribe } from "./api/pro-subscribe";
import { handleRegister, handleApis } from "./api/registry";
import { handleCheckout } from "./api/checkout";
import { handleDashboard } from "./api/dashboard";
import { handleAdminDashboard, handleAdminLogin, handleAdminLogout, handleAdminData, handleAdminFeed, handleAdminTreasury } from "./api/admin-dashboard";
import { handleWhitepaperExtended } from "./api/whitepaper";
import { sweepTransitWallet } from "./api/sweep";
import { handleLawnEvents } from "./api/lawn-events";
import { handleMcpHttp } from "./api/mcp-http";
import { handleActivity } from "./api/activity";
import { handleAbEvent, handleAbStats } from "./api/ab-test";
import { handleVerity } from "./verity/index";
import { runVerityHeartbeat } from "./verity/cron/heartbeat";
import { runFiscalAgent } from "./verity/cron/fiscal";
import { runRadar } from "./verity/cron/radar";
import { runEcosystemRadar } from "./verity/cron/ecosystem";
import { runCompetitorsRadar } from "./verity/cron/competitors";
import { runPartnersRadar } from "./verity/cron/partners";
import { runSynthesisRadar } from "./verity/cron/synthesis";
import { runMonitor } from "./monitor";
import { runGithubResponder } from "./github-responder";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SPLIT_SECRET: string;
  DASHBOARD_SECRET: string;
  BLINK_API_KEY: string;
  BLINK_WALLET_ID: string;
  BLINK_API_KEY_DEMO: string;
  BLINK_WALLET_ID_DEMO: string;
  BLINK_WEBHOOK_SECRET: string;
  OWNER_LIGHTNING_ADDRESS: string;
  OWNER_ADDRESSES: string;
  LAWN_HMAC_SECRET: string;
  SERPER_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  BRAVE_API_KEY: string;   // optional — free search tier (2000/month), add via wrangler secret
  GROQ_API_KEY: string;    // optional — free inference tier (14400/day), add via wrangler secret
  GITHUB_PAT: string;
  demo_preimages: KVNamespace;
}

const DOCS = "https://docs.l402kit.com";

function handleDocsRedirect(request: Request): Response {
  const url = new URL(request.url);
  const mintPath = url.pathname.replace(/^\/docs/, "") || "/introduction";
  const target = `${DOCS}${mintPath}${url.search}`;
  return Response.redirect(target, 302);
}

function handleLlmsTxt(): Response {
  const body = `# l402-kit

> Middleware to monetize any API with Bitcoin Lightning in 3 lines. TypeScript, Python, Go, Rust.

## What it does

l402-kit implements the L402 protocol (HTTP 402 + BOLT11 invoice + macaroon). When a client calls a protected endpoint, the server returns HTTP 402 with a Lightning invoice. The client pays the invoice (sub-second via Lightning Network) and retries with cryptographic proof of payment. No API keys, no OAuth, no chargebacks.

## Core flow

1. Client calls \`GET /api/data\`
2. Server returns \`HTTP 402\` + BOLT11 invoice + macaroon
3. Client pays invoice via Lightning (~500ms)
4. Client retries with \`Authorization: L402 <macaroon>:<preimage>\`
5. Middleware validates: \`SHA256(preimage) == paymentHash\` — pure crypto, no DB

## Install

- TypeScript/JS: \`npm install l402-kit\`
- Python: \`pip install l402kit\`
- Rust: \`cargo add l402kit\`
- Go: \`go get github.com/shinydapps/l402-kit/go@v1.8.2\`

## Minimal usage (TypeScript)

\`\`\`typescript
import { l402, ManagedProvider } from "l402-kit";
const lightning = ManagedProvider.fromAddress("you@blink.sv");
app.use("/api/data", l402({ priceSats: 10, lightning }));
\`\`\`

## Agent features

- MCP server: \`npx l402-kit-mcp\` — lets Claude/Cursor call L402-protected APIs from the IDE
- LangChain tool: auto-pay middleware inside agent chains
- Budget controls: cap agent spend at N sats/session or N sats/day
- Token delegation: orchestrator mints caveated tokens for sub-agents with lower spending limits

## Pricing

- Managed mode: 0.3% fee, zero infrastructure (uses your Lightning address)
- Sovereign mode: 0% fee, bring your own Lightning node

## Live demo

\`GET https://l402kit.com/api/demo/btc-price\` — returns HTTP 402 with a 1-sat invoice

## Links

- Docs: https://docs.l402kit.com
- GitHub: https://github.com/ShinyDapps/l402-kit
- npm: https://npmjs.com/package/l402-kit
- PyPI: https://pypi.org/project/l402kit
- MCP: https://glama.ai/mcp/servers/@ShinyDapps/l402-kit
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function handleAgentJson(): Response {
  return new Response(JSON.stringify({
    name: "l402-kit",
    description: "Middleware to monetize any API with Bitcoin Lightning in 3 lines. TypeScript, Python, Go, Rust.",
    version: "1.8.4",
    protocols: ["l402", "x402"],
    install: {
      npm: "npm install l402-kit",
      pip: "pip install l402kit",
      cargo: "cargo add l402kit",
      go: "go get github.com/shinydapps/l402-kit/go@v1.8.2"
    },
    docs: "https://docs.l402kit.com/introduction",
    agent_sdk: "https://docs.l402kit.com/agent/quickstart",
    mcp_server: "https://docs.l402kit.com/agent/mcp",
    fee: "0.3% managed, 0% sovereign",
    contact: "shinydapps@blink.sv",
    verity: {
      agent_id: "agent:shinydapps.verity",
      treasury: "shinydapps@blink.sv",
      endpoint: "https://l402kit.com/api/verity",
      services: "https://l402kit.com/api/verity/services",
      contract: {
        mission: "Sell intelligence. Never decide for the user.",
        transparency: {
          description: "All pricing, sources, and revenue are publicly auditable.",
          report_endpoint: "https://l402kit.com/api/verity/fiscal"
        },
        autonomy_ceiling: {
          reinvest_pct: 0.20,
          remainder: "treasury"
        }
      },
      identity: {
        archetype: "crypto-native strategist",
        blend: ["protocol engineer", "capital allocator", "market intelligence"],
        edge: "Knows not just how to fetch data, but which data matters right now — and why the window is closing",
        monitors: ["new chain launches", "DeFi yield strategies", "fork schedules", "narrative cycles", "on-chain anomalies"]
      },
      governance: {
        contract_version: "1.0",
        pricing: "dynamic",
        pricing_interval_minutes: 30,
        floor_protected: true,
        fiscal_agent: {
          schedule: "0 0 * * *",
          tz: "UTC"
        },
        human_override: "owner only via Cloudflare Worker secrets"
      }
    }
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function handleL402Json(): Response {
  return new Response(JSON.stringify({
    protocol: "l402",
    version: "1.0",
    provider: "l402-kit",
    demo_endpoint: "https://l402kit.com/api/demo/btc-price",
    price_sats: 1,
    docs: "https://docs.l402kit.com/introduction",
    sdk: "https://npmjs.com/package/l402-kit"
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function handleGlamaJson(): Response {
  // /.well-known/glama.json — used by Glama to claim ownership of the connector
  // listing at https://glama.ai/mcp/connectors. Mirror of the repo's glama.json
  // plus remote MCP transport metadata so Glama can list us as a "Remote MCP"
  // server callable directly via HTTP (not just stdio via npm).
  return new Response(JSON.stringify({
    $schema: "https://glama.ai/mcp/schemas/server.json",
    maintainers: ["ThiagoDataEngineer", "ShinyDapps"],
    name: "l402-kit-mcp",
    description: "MCP server that enables AI agents to autonomously pay for and call L402-protected APIs using Bitcoin Lightning. 12 tools across two layers: generic L402 client + 11 VERITY paid services.",
    icon: "https://l402kit.com/logo/dark.svg",
    categories: ["cryptocurrency", "autonomous-agents", "payments", "api"],
    homepage: "https://l402kit.com",
    repository: "https://github.com/ShinyDapps/l402-kit",
    documentation: "https://docs.l402kit.com/agent/mcp",
    license: "MIT",
    keywords: ["l402", "lightning", "bitcoin", "payments", "mcp", "ai-agents", "api-monetization"],
    installation: {
      npm: { package: "l402-kit", command: "npx l402-kit-mcp" },
    },
    // Remote MCP transport — for listing in glama.ai/mcp/connectors
    transport: {
      type: "streamable-http",
      endpoint: "https://l402kit.com/api/mcp",
    },
    env: {
      BLINK_API_KEY:    { description: "Blink wallet API key (free at blink.sv)", required: false },
      BLINK_WALLET_ID:  { description: "Blink BTC wallet ID", required: false },
      ALBY_TOKEN:       { description: "Alby NWC alternative to Blink", required: false },
      BUDGET_SATS:      { description: "Max sats per session (default: 2000)", required: false, default: "2000" },
    },
  }), {
    headers: { "Content-Type": "application/json" },
  });
}

function handleMcpJson(): Response {
  return new Response(JSON.stringify({
    name: "l402-kit",
    version: "1.10.1",
    description: "MCP server that lets AI agents call L402-protected APIs autonomously via Bitcoin Lightning. Includes 11 VERITY paid tools (search, scrape, BTC price, summarize, sentiment, domain intel, integration, world state, translate, research, alpha).",
    publisher: "ShinyDapps",
    homepage: "https://l402kit.com",
    docs: "https://docs.l402kit.com/agent/mcp",
    repository: "https://github.com/ShinyDapps/l402-kit",
    license: "MIT",
    install: {
      npm: "npx l402-kit-mcp",
      package: "l402-kit"
    },
    env: {
      BLINK_API_KEY: { required: true, description: "Blink wallet API key (free at blink.sv)" },
      BLINK_WALLET_ID: { required: true, description: "Blink BTC wallet ID" },
      ALBY_TOKEN: { required: false, description: "Alby alternative to Blink" },
      BUDGET_SATS: { required: false, description: "Max sats per session (default: 2000)" }
    },
    tools: [
      { name: "l402_fetch", description: "Fetch any L402-protected URL, auto-paying the Lightning invoice" },
      { name: "l402_balance", description: "Check remaining Lightning budget for this session" },
      { name: "l402_spending_report", description: "Full audit of sats spent this session by domain" },
      { name: "verity_btc_price", description: "Real-time BTC price in USD/EUR/BRL — 10 sats" },
      { name: "verity_worldstate", description: "UTC time + geolocation + weather — 80 sats" },
      { name: "verity_search", description: "Web search, top 10 results — 100 sats" },
      { name: "verity_summarize", description: "AI summarization up to 50k chars — 50 sats" },
      { name: "verity_sentiment", description: "Sentiment analysis with score + keywords — 30 sats" },
      { name: "verity_scrape", description: "Web scraping to markdown — 200 sats" },
      { name: "verity_domain_intel", description: "WHOIS + DNS + SSL certificates — 500 sats" },
      { name: "verity_integration", description: "Complete l402-kit integration for any GitHub repo — 10,000 sats" },
      { name: "verity_translate", description: "Professional translation — 10 locales, MDX-aware (preserves code blocks) — 500 sats" },
      { name: "verity_research", description: "Deep research — search + scrape + AI synthesis in one call — 2,000 sats" },
      { name: "verity_alpha", description: "Crypto-native strategy — cycle phase, alpha window, entry/exit for your capital and timeframe — 8,000 sats" }
    ],
    payments: {
      protocol: "l402",
      network: "lightning",
      treasury: "shinydapps@blink.sv",
      fee: "0.3% on managed provider, 0% sovereign"
    }
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

const BADGE_DARK = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40"><rect width="200" height="40" rx="6" fill="#F7931A"/><polygon points="18,6 10,22 16,22 13.5,33 25,18 19,18" fill="#FFFFFF"/><text x="35" y="26" font-family="'JetBrains Mono','Fira Code',ui-monospace,monospace" font-weight="700" font-size="14" fill="#FFFFFF" letter-spacing="-0.3">Powered by L402-Kit</text></svg>`;
const BADGE_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40"><rect width="200" height="40" rx="6" fill="#0B0C14" stroke="#F7931A" stroke-width="1.5"/><polygon points="18,6 10,22 16,22 13.5,33 25,18 19,18" fill="#F7931A"/><text x="35" y="26" font-family="'JetBrains Mono','Fira Code',ui-monospace,monospace" font-weight="700" font-size="14" fill="#F7931A" letter-spacing="-0.3">Powered by L402-Kit</text></svg>`;
const BADGE_SM   = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" viewBox="0 0 120 20"><rect width="120" height="20" rx="3" fill="#F7931A"/><polygon points="9,3 5,11 8,11 7,17 13,9 10,9" fill="#FFFFFF"/><text x="18" y="14" font-family="'JetBrains Mono','Fira Code',ui-monospace,monospace" font-weight="700" font-size="8" fill="#FFFFFF">Powered by L402-Kit</text></svg>`;

function handleServerCard(): Response {
  return new Response(JSON.stringify({
    name: "l402-kit",
    qualifiedName: "shinydapps/l402-kit",
    description: "MCP server that lets AI agents call L402-protected APIs via Bitcoin Lightning. Includes 9 VERITY paid tools (search, scrape, BTC price, summarize, sentiment, domain intel, integration, world state, translate) plus l402_fetch and l402_balance.",
    iconUrl: "https://l402kit.com/badge/powered-by-l402kit-sm.svg",
    transport: "stdio",
    packageName: "l402-kit",
    packageRegistry: "npm",
    installCommand: "npx l402-kit-mcp",
    configSchema: {
      type: "object",
      properties: {
        BLINK_API_KEY: { type: "string", description: "Blink wallet API key (free at blink.sv)" },
        BLINK_WALLET_ID: { type: "string", description: "Blink BTC wallet ID" },
        BUDGET_SATS: { type: "string", description: "Max sats per session (default: 2000)" }
      },
      required: ["BLINK_API_KEY", "BLINK_WALLET_ID"]
    },
    tools: [
      { name: "l402_fetch", description: "Fetch any L402-protected URL, auto-paying the Lightning invoice" },
      { name: "l402_balance", description: "Check remaining Lightning budget for this session" },
      { name: "verity_btc_price", description: "Real-time BTC price — 10 sats" },
      { name: "verity_search", description: "Web search top 10 results — 100 sats" },
      { name: "verity_scrape", description: "Web scraping to markdown — 200 sats" },
      { name: "verity_summarize", description: "AI summarization — 50 sats" },
      { name: "verity_sentiment", description: "Sentiment analysis — 30 sats" },
      { name: "verity_domain_intel", description: "WHOIS + DNS + SSL — 500 sats" },
      { name: "verity_worldstate", description: "Time + geolocation + weather — 80 sats" },
      { name: "verity_translate", description: "AI translation to 11 locales — 50 sats" },
      { name: "verity_integration", description: "Full l402-kit integration for any GitHub repo — 10000 sats" }
    ]
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function handleBadge(variant: "dark" | "light" | "sm"): Response {
  const svg = variant === "light" ? BADGE_LIGHT : variant === "sm" ? BADGE_SM : BADGE_DARK;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }
  });
}

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization,x-dashboard-secret,x-split-secret");
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await sweepTransitWallet(env);
    try { await fetch("https://diagram-forge.onrender.com/health"); } catch { /* ignore */ }
    await runVerityHeartbeat(env);
    // Fiscal agent runs daily at midnight UTC
    if (new Date(event.scheduledTime).getUTCHours() === 0) {
      await runFiscalAgent(env);
    }
    // RADAR Anel 1 — 1x/hora durante calibração
    await runRadar(env);
    // RADAR Anel 3 — ecossistema · semanal (domingo meia-noite UTC)
    const now = new Date(event.scheduledTime);
    if (now.getUTCDay() === 0 && now.getUTCHours() === 0) {
      await runEcosystemRadar(env);
    }
    // RADAR Anel 4 — concorrentes · diário (meia-noite UTC)
    if (now.getUTCHours() === 0) {
      await runCompetitorsRadar(env);
    }
    // RADAR Anel 2 — parceiros · diário (meia-noite UTC)
    if (now.getUTCHours() === 0) {
      await runPartnersRadar(env);
    }
    // RADAR Anel 5 — síntese · diário (01:00 UTC, após fiscal + anéis 2/4)
    if (now.getUTCHours() === 1) {
      await runSynthesisRadar(env);
    }
    // Monitor: checks payments, issue replies, HN, npm — emails if relevant
    await runMonitor(env);
    // GitHub responder: reads new comments, replies autonomously with Haiku
    await runGithubResponder(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // docs.l402kit.com → redirect to Mintlify (customDomain removed from mint.json)
    if (url.hostname === "docs.l402kit.com") {
      const mintUrl = `https://shinydapps-bd9fa40b.mintlify.app${path}${url.search}`;
      return Response.redirect(mintUrl, 302);
    }

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    let res: Response;
    try {
      if (path === "/api/invoice")        res = await handleInvoice(request, env);
      else if (path === "/api/stats")     res = await handleStats(request, env);
      else if (path === "/api/split")     res = await handleSplit(request, env);
      else if (path === "/api/dev-token") res = await handleDevToken(request, env);
      else if (path === "/api/demo")                res = await handleDemo(request, env);
      else if (path === "/api/demo/btc-price")     res = await handleDemoBtcPrice(request, env);
      else if (path === "/api/demo/preimage")      res = await handleDemoPreimage(request, env);
      else if (path === "/api/demo/pay-address")  res = await handleDemoPayAddress(request, env);
      else if (path === "/api/verify")    res = await handleVerify(request, env);
      else if (path === "/api/lnurl-auth") res = await handleLnurlAuth(request, env);
      else if (path === "/llms.txt")                res = handleLlmsTxt();
      else if (path === "/.well-known/agent.json")  res = handleAgentJson();
      else if (path === "/.well-known/l402.json")   res = handleL402Json();
      else if (path === "/.well-known/mcp.json")    res = handleMcpJson();
      else if (path === "/.well-known/glama.json")  res = handleGlamaJson();
      else if (path === "/.well-known/mcp/server-card.json") res = handleServerCard();
      else if (path === "/.well-known/402index-verify.txt") res = new Response("a2c9992b0c01d527d16443f0cc7406b39a8893cbca0a30caae34d637a8603c8c", { headers: { "Content-Type": "text/plain" } });
      else if (path.startsWith("/.well-known/lnurlp/")) res = await handleLnurlp(request, env);
      else if (path === "/api/blink-webhook") res = await handleBlinkHook(request, env);
      else if (path === "/api/delete-data")   res = await handleDeleteData(request, env);
      else if (path === "/api/dev-stats")       res = await handleDevStats(request, env);
      else if (path === "/api/badges/tests")   res = handleBadgeTests();
      else if (path === "/badge/powered-by-l402kit.svg")    res = handleBadge("dark");
      else if (path === "/badge/powered-by-l402kit-sm.svg") res = handleBadge("sm");
      else if (path === "/badge/powered-by-l402kit-light.svg") res = handleBadge("light");
      else if (path === "/api/pro-check")      res = await handleProCheck(request, env);
      else if (path === "/api/pro-poll")       res = await handleProPoll(request, env);
      else if (path === "/api/global-stats")   res = await handleGlobalStats(request, env);
      else if (path === "/api/pro-subscribe")  res = await handleProSubscribe(request, env);
      else if (path === "/api/checkout")         res = await handleCheckout(request, env);
      else if (path === "/api/register")       res = await handleRegister(request, env);
      else if (path === "/api/apis.json")      res = await handleApis(request, env);
      else if (path.startsWith("/api/dashboard")) res = await handleDashboard(request, env);
      else if (path === "/admin/login")          res = await handleAdminLogin(request, env);
      else if (path === "/admin/logout")         res = await handleAdminLogout(request);
      else if (path === "/admin/data")           res = await handleAdminData(request, env);
      else if (path === "/admin/feed")           res = await handleAdminFeed(request, env);
      else if (path === "/admin/treasury")       res = await handleAdminTreasury(request, env);
      else if (path === "/admin" || path === "/admin/") res = await handleAdminDashboard(request, env);
      else if (path === "/whitepaper-extended") res = await handleWhitepaperExtended(request, env);
      else if (path === "/api/lawn-events")    res = await handleLawnEvents(request, env);
      else if (path === "/api/mcp" || path === "/api/mcp/") res = await handleMcpHttp(request, env);
      else if (path === "/api/activity")        res = await handleActivity(request, env);
      else if (path === "/api/ab-event")        res = await handleAbEvent(request, env);
      else if (path === "/api/ab-stats")        res = await handleAbStats(request, env);
      else if (path.startsWith("/api/verity"))  res = await handleVerity(request, env);
      else if (path.startsWith("/docs"))       return handleDocsRedirect(request);
      else res = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    } catch {
      res = new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
    }

    return cors(res);
  },
};
