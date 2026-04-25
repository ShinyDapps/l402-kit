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

const MINTLIFY = "https://docs.l402kit.com";

function handleDocsRedirect(request: Request): Response {
  const url = new URL(request.url);
  const mintPath = url.pathname.replace(/^\/docs/, "") || "/introduction";
  const target = `${MINTLIFY}${mintPath}${url.search}`;
  return Response.redirect(target, 302);
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
      else if (path.startsWith("/.well-known/lnurlp/")) res = await handleLnurlp(request, env);
      else if (path === "/api/blink-webhook") res = await handleBlinkHook(request, env);
      else if (path === "/api/delete-data")   res = await handleDeleteData(request, env);
      else if (path === "/api/dev-stats")       res = await handleDevStats(request, env);
      else if (path === "/api/badges/tests")   res = handleBadgeTests();
      else if (path === "/api/pro-check")      res = await handleProCheck(request, env);
      else if (path === "/api/pro-poll")       res = await handleProPoll(request, env);
      else if (path === "/api/global-stats")   res = await handleGlobalStats(request, env);
      else if (path === "/api/pro-subscribe")  res = await handleProSubscribe(request, env);
      else if (path.startsWith("/docs"))       return handleDocsRedirect(request);
      else res = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    } catch (err) {
      res = new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }

    return cors(res);
  },
};
