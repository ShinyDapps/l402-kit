#!/usr/bin/env node
/**
 * l402-kit MCP Server
 *
 * Exposes L402Client as MCP tools so Claude Desktop and other MCP-compatible
 * agents can pay Lightning-protected APIs automatically.
 *
 * Setup in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "l402": {
 *       "command": "npx",
 *       "args": ["l402-kit-mcp"],
 *       "env": {
 *         "BLINK_API_KEY": "your-blink-key",
 *         "BLINK_WALLET_ID": "your-wallet-id",
 *         "BUDGET_SATS": "1000"
 *       }
 *     }
 *   }
 * }
 *
 * Or with Alby:
 *   "ALBY_TOKEN": "your-alby-token",
 *   "ALBY_HUB_URL": "https://your-hub.getalby.com"  (optional)
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

const budgetSats = process.env.BUDGET_SATS ? parseInt(process.env.BUDGET_SATS, 10) : 1000;

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
  version: "1.8.0",
});

// Tool: l402_fetch
server.tool(
  "l402_fetch",
  "Fetch a URL that may require a Lightning payment (L402 protocol). Handles the full payment flow automatically — pays the invoice and retries. Returns the response body as text.",
  {
    url:     z.string().describe("The URL to fetch"),
    method:  z.string().optional().describe("HTTP method — GET, POST, PUT, DELETE, PATCH. Default: GET"),
    body:    z.string().optional().describe("Request body (for POST/PUT)"),
    headers: z.record(z.string(), z.string()).optional().describe("Additional request headers"),
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
server.tool(
  "l402_balance",
  "Returns the remaining Lightning budget available for this session.",
  {},
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
server.tool(
  "l402_spending_report",
  "Returns a detailed breakdown of Lightning payments made this session — total spent, remaining budget, and per-domain breakdown.",
  {},
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
server.tool(
  "l402_set_budget",
  "Check current budget status. (Budget is set at startup via BUDGET_SATS env var.)",
  {},
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

// ─── start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`l402-kit MCP fatal: ${String(err)}\n`);
  process.exit(1);
});
