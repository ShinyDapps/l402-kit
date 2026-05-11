import type { Env } from "../worker";
import { handleVerity } from "../verity/index";

const TOOLS = [
  {
    name: "verity_btc_price",
    description: "Real-time BTC price in USD, EUR, and BRL. 10 sats per call.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "verity_search",
    description: "Web search returning top 10 results. 100 sats per call.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "verity_scrape",
    description: "Scrape any public URL and return clean markdown. 200 sats per call.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "URL to scrape" } },
      required: ["url"],
    },
  },
  {
    name: "verity_summarize",
    description: "AI summarization of up to 50k characters of text. 50 sats per call.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to summarize" } },
      required: ["text"],
    },
  },
  {
    name: "verity_sentiment",
    description: "Sentiment analysis with score and keywords. 30 sats per call.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to analyze" } },
      required: ["text"],
    },
  },
  {
    name: "verity_domain_intel",
    description: "WHOIS, DNS records, and SSL certificate intel for any domain. 500 sats per call.",
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string", description: "Domain name to analyze" } },
      required: ["domain"],
    },
  },
  {
    name: "verity_worldstate",
    description: "UTC time, geolocation, and weather for any IP address. 80 sats per call.",
    inputSchema: {
      type: "object",
      properties: { ip: { type: "string", description: "IP address (optional, defaults to caller IP)" } },
      required: [],
    },
  },
  {
    name: "verity_translate",
    description: "AI translation to 11 locales, MDX-aware (preserves code blocks and URLs). 50 sats per call.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to translate" },
        locale: { type: "string", description: "Target locale (e.g. es, zh, ar, pt, fr, de, ja, ko, hi, ru, it)" },
        format: { type: "string", enum: ["plain", "mdx"], description: "Input format (default: plain)" },
      },
      required: ["text", "locale"],
    },
  },
  {
    name: "verity_integration",
    description: "Generate a full l402-kit integration for any GitHub repository. 10000 sats per call.",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string", description: "GitHub repo URL or owner/repo" } },
      required: ["repo"],
    },
  },
];

function ok(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

function err(id: unknown, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function callVerityTool(name: string, args: Record<string, string>, request: Request, env: Env): Promise<string> {
  // Map MCP tool name → VERITY endpoint + body
  const service = name.replace("verity_", "").replace("_", "-");
  const url = new URL(request.url);
  url.pathname = `/api/verity/${service}`;

  // Build request body based on tool
  let body: Record<string, unknown> = {};
  if (name === "verity_search") body = { query: args.query };
  else if (name === "verity_scrape") body = { url: args.url };
  else if (name === "verity_summarize") body = { text: args.text };
  else if (name === "verity_sentiment") body = { text: args.text };
  else if (name === "verity_domain_intel") body = { domain: args.domain };
  else if (name === "verity_worldstate" && args.ip) body = { ip: args.ip };
  else if (name === "verity_translate") body = { text: args.text, locale: args.locale, format: args.format ?? "plain" };
  else if (name === "verity_integration") body = { repo: args.repo };

  // Get wallet credentials from MCP request headers (X-BLINK-API-KEY / X-BLINK-WALLET-ID)
  const blinkKey = request.headers.get("X-BLINK-API-KEY") ?? env.BLINK_API_KEY_DEMO;
  const blinkWallet = request.headers.get("X-BLINK-WALLET-ID") ?? env.BLINK_WALLET_ID_DEMO;

  // First call → 402 expected
  const inner = new Request(url.toString(), {
    method: Object.keys(body).length ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": request.headers.get("CF-Connecting-IP") ?? "" },
    body: Object.keys(body).length ? JSON.stringify(body) : undefined,
  });

  const r402 = await handleVerity(inner, env);
  if (r402.status !== 402) {
    const text = await r402.text();
    return text;
  }

  // Parse WWW-Authenticate for invoice + macaroon
  const wwwAuth = r402.headers.get("WWW-Authenticate") ?? "";
  const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);
  const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
  if (!invoiceMatch || !macaroonMatch) return JSON.stringify({ error: "malformed 402 challenge" });

  const invoice = invoiceMatch[1];
  const macaroon = macaroonMatch[1];

  // Pay via Blink
  const payGql = JSON.stringify({
    query: `mutation Pay($input: LnInvoicePaymentInput!) {
      lnInvoicePaymentSend(input: $input) {
        status
        transaction { id }
        errors { message }
      }
    }`,
    variables: { input: { walletId: blinkWallet, paymentRequest: invoice } },
  });

  const payRes = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": blinkKey },
    body: payGql,
  });
  const payData = await payRes.json() as { data: { lnInvoicePaymentSend: { status: string; transaction?: { id: string }; errors?: { message: string }[] } } };
  const payment = payData.data?.lnInvoicePaymentSend;

  if (payment?.status !== "SUCCESS") {
    const errMsg = payment?.errors?.map((e: { message: string }) => e.message).join(", ") ?? "payment failed";
    return JSON.stringify({ error: `Lightning payment failed: ${errMsg}` });
  }

  // Retry with preimage — Blink doesn't return preimage directly; use transaction id as fallback
  // The preimage is available via Blink's transaction query
  const txGql = JSON.stringify({
    query: `query Tx($id: ID!) { me { defaultAccount { transactions(first:1) { edges { node { id settlementVia { ... on SettlementViaLn { preImage } } } } } } } }`,
  });
  const txRes = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": blinkKey },
    body: txGql,
  });
  const txData = await txRes.json() as { data: { me: { defaultAccount: { transactions: { edges: { node: { settlementVia: { preImage?: string } } }[] } } } } };
  const preimage = txData.data?.me?.defaultAccount?.transactions?.edges?.[0]?.node?.settlementVia?.preImage ?? "";

  if (!preimage) return JSON.stringify({ error: "could not retrieve preimage after payment" });

  // Retry original request with L402 token
  const retryReq = new Request(url.toString(), {
    method: Object.keys(body).length ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `L402 ${macaroon}:${preimage}`,
      "X-Forwarded-For": request.headers.get("CF-Connecting-IP") ?? "",
    },
    body: Object.keys(body).length ? JSON.stringify(body) : undefined,
  });

  const final = await handleVerity(retryReq, env);
  return await final.text();
}

export async function handleMcpHttp(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    return new Response(JSON.stringify({
      name: "l402-kit MCP",
      transport: "http",
      endpoint: "/api/mcp",
      tools: TOOLS.length,
    }), { headers: { "Content-Type": "application/json" } });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { jsonrpc?: string; method?: string; params?: Record<string, unknown>; id?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return err(null, -32700, "Parse error");
  }

  const { method, params, id } = body;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "l402-kit", version: "1.8.7" },
      });

    case "notifications/initialized":
      return new Response(null, { status: 204 });

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const name = (params?.name as string) ?? "";
      const args = ((params?.arguments ?? {}) as Record<string, string>);

      if (name === "verity_btc_price") {
        const result = await callVerityTool("verity_btc_price", args, request, env);
        return ok(id, { content: [{ type: "text", text: result }] });
      }

      const known = TOOLS.find(t => t.name === name);
      if (!known) return err(id, -32602, `Unknown tool: ${name}`);

      try {
        const result = await callVerityTool(name, args, request, env);
        return ok(id, { content: [{ type: "text", text: result }] });
      } catch (e) {
        return err(id, -32603, String(e));
      }
    }

    case "ping":
      return ok(id, {});

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}
