#!/usr/bin/env node
/**
 * l402-kit MCP Server
 *
 * Two categories of tools:
 *
 * 1. GENERIC — l402_fetch, l402_balance, l402_spending_report, l402_set_budget
 *    Lets Claude/Cursor call any L402-protected API autonomously.
 *
 * 2. VERITY — verity_btc_price, verity_search, verity_worldstate, verity_summarize,
 *    verity_sentiment, verity_scrape, verity_domain_intel, verity_integration
 *    Named tools for VERITY's 8 paid services (auto-pays sats per call).
 *
 * ## Environment Variables
 *
 * ### Option A — Blink wallet (recommended, free at blink.sv)
 * @env {string} BLINK_API_KEY       - Blink API key
 * @env {string} BLINK_WALLET_ID     - Blink wallet ID
 *
 * ### Option B — Alby wallet
 * @env {string} ALBY_TOKEN          - Alby access token
 * @env {string} ALBY_HUB_URL        - Alby Hub URL (optional)
 *
 * ### Budget control
 * @env {number} BUDGET_SATS         - Max sats per session (default: 2000)
 *
 * ## Setup in claude_desktop_config.json
 *
 * {
 *   "mcpServers": {
 *     "l402": {
 *       "command": "npx",
 *       "args": ["l402-kit-mcp"],
 *       "env": {
 *         "BLINK_API_KEY": "your-blink-key",
 *         "BLINK_WALLET_ID": "your-wallet-id",
 *         "BUDGET_SATS": "2000"
 *       }
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { L402Client } from "../src/client";
import { BlinkWallet } from "../src/agent/wallets/BlinkWallet";
import { AlbyWallet } from "../src/agent/wallets/AlbyWallet";
import type { L402Wallet } from "../src/client";

// ─── wallet config ────────────────────────────────────────────────────────────

function buildWallet(): L402Wallet {
  if (process.env.BLINK_API_KEY && process.env.BLINK_WALLET_ID) {
    return new BlinkWallet(process.env.BLINK_API_KEY, process.env.BLINK_WALLET_ID);
  }
  if (process.env.ALBY_TOKEN) {
    return new AlbyWallet(process.env.ALBY_TOKEN, process.env.ALBY_HUB_URL);
  }
  throw new Error(
    "l402-kit MCP: no wallet configured.\n" +
    "Set BLINK_API_KEY + BLINK_WALLET_ID  or  ALBY_TOKEN in your MCP env config."
  );
}

const budgetSats = process.env.BUDGET_SATS ? parseInt(process.env.BUDGET_SATS, 10) : 2000;

const spendLog: Array<{ sats: number; url: string; ts: string }> = [];

let client: L402Client | null = null;
let walletError: string | null = null;

try {
  client = new L402Client({
    wallet: buildWallet(),
    budgetSats,
    onSpend: (sats, url) => {
      spendLog.push({ sats, url, ts: new Date().toISOString() });
    },
  });
} catch (err) {
  walletError = String(err);
}

function requireClient(): L402Client {
  if (!client) throw new Error(walletError ?? "No wallet configured.");
  return client;
}

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "l402-kit",
  version: "1.8.6",
});

// Tool: l402_fetch
server.registerTool(
  "l402_fetch",
  {
    title: "Fetch L402-protected URL",
    description:
      "Fetch a URL that may require a Bitcoin Lightning payment (L402 protocol). " +
      "Side effect: deducts sats from the session budget when a payment is required — check l402_balance first if budget is limited. " +
      "Flow: sends request → if 402 received, pays the Lightning invoice (1 attempt) → retries once with payment proof → returns response body as text. " +
      "Fails with error if: budget is exhausted, URL is unreachable, or the Lightning payment fails. " +
      "Do NOT use for regular (non-L402) URLs — use a standard fetch tool instead. " +
      "Do NOT use if l402_balance shows 0 sats remaining.",
    inputSchema: {
      url:     z.string().describe("The URL to fetch (http or https)"),
      method:  z.string().optional().describe("HTTP method — GET, POST, PUT, DELETE, PATCH. Default: GET"),
      body:    z.string().optional().describe("Request body as string (for POST/PUT requests)"),
      headers: z.record(z.string(), z.string()).optional().describe("Additional HTTP request headers as key-value pairs"),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ url, method, body, headers }) => {
    const httpMethod = (method ?? "GET").toUpperCase();
    try {
      const res = await requireClient().fetch(url, {
        method: httpMethod,
        body,
        headers: (headers ?? {}) as Record<string, string>,
      });

      const text = await res.text();
      const report = requireClient().spendingReport();
      const spent = report?.transactions.at(-1)?.sats ?? 0;

      return {
        content: [
          {
            type: "text" as const,
            text: spent > 0
              ? `[Paid ${spent} sats] HTTP ${res.status}\n\n${text}`
              : `HTTP ${res.status}\n\n${text}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

// Tool: l402_balance
server.registerTool(
  "l402_balance",
  {
    title: "Check Lightning budget",
    description:
      "Returns the remaining Bitcoin Lightning budget for this MCP session. " +
      "Use this before calling l402_fetch to confirm you have enough sats — avoids wasted attempts when budget is exhausted. " +
      "Returns: '<remaining> sats remaining of <total> total (spent: <spent> sats)'. " +
      "Read-only — does not trigger any payment or side effect. " +
      "Budget is set at server startup via BUDGET_SATS (default: 1000 sats ≈ $0.60); to increase it, restart the MCP server.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async () => {
    const report = requireClient().spendingReport();
    if (!report) {
      return {
        content: [{ type: "text" as const, text: "No budget configured." }],
      };
    }
    return {
      content: [{
        type: "text" as const,
        text: `Budget: ${report.remaining} sats remaining of ${budgetSats} total (spent: ${report.total} sats)`,
      }],
    };
  }
);

// Tool: l402_spending_report
server.registerTool(
  "l402_spending_report",
  {
    title: "Lightning spending report",
    description:
      "Returns a full audit of all Bitcoin Lightning payments made in this MCP session. " +
      "Includes: total sats spent, remaining budget, sats spent per domain, and chronological transaction list (timestamp + sats + URL). " +
      "Use this instead of l402_balance when you need to know *which* APIs were called and *how much* each cost, not just the remaining balance. " +
      "Read-only — does not trigger any payment or side effect. " +
      "Returns '(none yet)' for domains and transactions if no payments have been made this session.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async () => {
    const report = requireClient().spendingReport();
    if (!report) {
      return {
        content: [{ type: "text" as const, text: "No budget configured." }],
      };
    }

    const domainLines = Object.entries(report.byDomain)
      .map(([domain, sats]) => `  ${domain}: ${sats} sats`)
      .join("\n") || "  (none yet)";

    const txLines = report.transactions
      .map(tx => `  ${new Date(tx.ts).toISOString()} — ${tx.sats} sats → ${tx.url}`)
      .join("\n") || "  (none yet)";

    return {
      content: [{
        type: "text" as const,
        text: [
          `=== L402 Spending Report ===`,
          `Total spent:  ${report.total} sats`,
          `Remaining:    ${report.remaining} sats`,
          ``,
          `By domain:`,
          domainLines,
          ``,
          `Transactions:`,
          txLines,
        ].join("\n"),
      }],
    };
  }
);

// Tool: l402_set_budget
server.registerTool(
  "l402_set_budget",
  {
    title: "Check budget status",
    description:
      "Returns the session budget cap configured at startup (via BUDGET_SATS env var). " +
      "Use this to confirm what hard spending limit is in effect — useful at the start of a session before making any API calls. " +
      "Read-only: this tool CANNOT set or change the budget at runtime. " +
      "To raise or lower the cap, stop and restart the MCP server with a different BUDGET_SATS value. " +
      "For remaining balance during a session, use l402_balance instead.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async () => {
    const report = requireClient().spendingReport();
    return {
      content: [{
        type: "text" as const,
        text: report
          ? `Budget: ${budgetSats} sats total, ${report.remaining} remaining.`
          : `No budget configured (BUDGET_SATS not set).`,
      }],
    };
  }
);

// ─── VERITY tools ─────────────────────────────────────────────────────────────

const VERITY = "https://l402kit.com/api/verity";

async function verityCall(path: string, opts?: { method?: string; body?: unknown }) {
  const c = requireClient();
  const url = `${VERITY}${path}`;
  const res = await c.fetch(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : {},
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const report = c.spendingReport();
  const spent = report?.transactions.at(-1)?.sats ?? 0;
  return { text, spent, status: res.status };
}

function verityResult(r: { text: string; spent: number; status: number }) {
  const prefix = r.spent > 0 ? `[Paid ${r.spent} sats] ` : "";
  return { content: [{ type: "text" as const, text: `${prefix}${r.text}` }] };
}

server.registerTool(
  "verity_btc_price",
  {
    title: "BTC Price — 10 sats",
    description:
      "Get real-time Bitcoin price in USD, EUR, and BRL via VERITY. Costs 10 sats per call. " +
      "Returns: { bitcoin: { usd, eur, brl }, timestamp }. " +
      "Use this instead of a free price API when you need a cryptographically billed, auditable data source.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async () => {
    try {
      return verityResult(await verityCall("/btc-price"));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_worldstate",
  {
    title: "World State — 80 sats",
    description:
      "Get UTC time, caller geolocation, and local weather in a single call via VERITY. Costs 80 sats. " +
      "Returns: { time: { utc, unix, hour, minute, weekday }, location: { city, country, timezone }, weather: { temperature_c, feels_like_c, humidity_pct, condition } }. " +
      "Zero external API cost — uses Cloudflare geo headers + Open-Meteo.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async () => {
    try {
      return verityResult(await verityCall("/worldstate"));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_search",
  {
    title: "Web Search — 100 sats",
    description:
      "Search the web and return top 10 organic results via VERITY. Costs 100 sats. " +
      "Returns: { results: [{ title, link, snippet }] }. " +
      "Powered by Serper API. Use for research, fact-checking, or link discovery.",
    inputSchema: {
      q: z.string().describe("Search query"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ q }) => {
    try {
      return verityResult(await verityCall(`/search?q=${encodeURIComponent(q)}`));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_summarize",
  {
    title: "Summarize — 50 sats",
    description:
      "AI summarization of text up to 50,000 characters via VERITY. Costs 50 sats. " +
      "Returns: { summary: string }. Language parameter is optional (default: english). " +
      "Powered by Claude Haiku.",
    inputSchema: {
      text: z.string().describe("Text to summarize (max 50,000 characters)"),
      language: z.string().optional().describe("Output language (e.g. 'english', 'portuguese'). Default: english"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ text, language }) => {
    try {
      return verityResult(await verityCall("/summarize", { method: "POST", body: { text, language } }));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_sentiment",
  {
    title: "Sentiment Analysis — 30 sats",
    description:
      "Analyze text sentiment with score, confidence, and keywords via VERITY. Costs 30 sats. " +
      "Returns: { analysis: { sentiment: 'positive'|'negative'|'neutral', score, confidence, keywords } }. " +
      "Powered by Claude Haiku.",
    inputSchema: {
      text: z.string().describe("Text to analyze"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ text }) => {
    try {
      return verityResult(await verityCall("/sentiment", { method: "POST", body: { text } }));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_scrape",
  {
    title: "Web Scrape — 200 sats",
    description:
      "Scrape a public URL and return its content as clean markdown via VERITY. Costs 200 sats. " +
      "Returns: { content: string, title: string }. " +
      "Powered by Firecrawl. Use for extracting article content, documentation, or structured data.",
    inputSchema: {
      url: z.string().describe("URL to scrape (must be publicly accessible)"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ url }) => {
    try {
      return verityResult(await verityCall("/scrape", { method: "POST", body: { url } }));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_domain_intel",
  {
    title: "Domain Intelligence — 500 sats",
    description:
      "Get WHOIS, DNS records, and SSL certificates for any domain via VERITY. Costs 500 sats. " +
      "Returns: { domain, whois: { registrar, registered, expires }, dns: { a_records }, certificates }. " +
      "Zero external API cost — uses RDAP, Cloudflare DNS, and crt.sh.",
    inputSchema: {
      domain: z.string().describe("Domain name (e.g. 'bitcoin.org', 'example.com')"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ domain }) => {
    try {
      return verityResult(await verityCall(`/domain-intel?domain=${encodeURIComponent(domain)}`));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "verity_integration",
  {
    title: "l402-kit Integration — 10,000 sats",
    description:
      "Send VERITY a public GitHub repo URL and receive complete l402-kit integration code. Costs 10,000 sats (~$6). " +
      "Returns: { integration: string (markdown with exact code), next_steps: string[] }. " +
      "VERITY analyzes the codebase, detects framework (Express, FastAPI, Gin, Axum, etc.), " +
      "and generates middleware code with exact file paths and line numbers. " +
      "WARNING: This tool costs 10,000 sats. Check l402_balance first.",
    inputSchema: {
      repoUrl: z.string().describe("Public GitHub repository URL (e.g. 'https://github.com/owner/repo')"),
    },
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ repoUrl }) => {
    try {
      return verityResult(await verityCall("/integration", { method: "POST", body: { repoUrl } }));
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true };
    }
  }
);

// ─── start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`l402-kit MCP fatal: ${String(err)}\n`);
  process.exit(1);
});
