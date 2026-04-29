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

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SPLIT_SECRET: string;
  DASHBOARD_SECRET: string;
  RESEND_API_KEY: string;
  BLINK_API_KEY: string;
  BLINK_WALLET_ID: string;
  BLINK_WEBHOOK_SECRET: string;
  demo_preimages: KVNamespace;
}

const DOCS = "https://docs.l402kit.com";

function handleDocsRedirect(request: Request): Response {
  const url = new URL(request.url);
  const mintPath = url.pathname.replace(/^\/docs/, "") || "/introduction";
  const target = `${DOCS}${mintPath}${url.search}`;
  return Response.redirect(target, 302);
}

function handleAgentJson(): Response {
  return new Response(JSON.stringify({
    name: "l402-kit",
    description: "Middleware to monetize any API with Bitcoin Lightning in 3 lines. TypeScript, Python, Go, Rust.",
    version: "1.8.1",
    protocols: ["l402", "x402"],
    install: {
      npm: "npm install l402-kit",
      pip: "pip install l402kit",
      cargo: "cargo add l402kit",
      go: "go get github.com/shinydapps/l402-kit/go"
    },
    docs: "https://docs.l402kit.com/introduction",
    llms_txt: "https://l402kit.com/llms.txt",
    agent_sdk: "https://docs.l402kit.com/agent/quickstart",
    mcp_server: "https://docs.l402kit.com/agent/mcp",
    fee: "0.3% managed, 0% soberano",
    contact: "shinydapps@blink.sv"
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
    demo_endpoint: "https://api.l402kit.com/api/demo",
    price_sats: 1,
    docs: "https://docs.l402kit.com/introduction",
    sdk: "https://npmjs.com/package/l402-kit"
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

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
      else if (path === "/.well-known/agent.json")  res = handleAgentJson();
      else if (path === "/.well-known/l402.json")   res = handleL402Json();
      else if (path.startsWith("/.well-known/lnurlp/")) res = await handleLnurlp(request, env);
      else if (path === "/api/blink-webhook") res = await handleBlinkHook(request, env);
      else if (path === "/api/delete-data")   res = await handleDeleteData(request, env);
      else if (path === "/api/dev-stats")       res = await handleDevStats(request, env);
      else if (path === "/api/badges/tests")   res = handleBadgeTests();
      else if (path === "/api/pro-check")      res = await handleProCheck(request, env);
      else if (path === "/api/pro-poll")       res = await handleProPoll(request, env);
      else if (path === "/api/global-stats")   res = await handleGlobalStats(request, env);
      else if (path === "/api/pro-subscribe")  res = await handleProSubscribe(request, env);
      else if (path === "/api/register")       res = await handleRegister(request, env);
      else if (path === "/api/apis.json")      res = await handleApis(request, env);
      else if (path.startsWith("/docs"))       return handleDocsRedirect(request);
      else res = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    } catch (err) {
      res = new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }

    return cors(res);
  },
};
