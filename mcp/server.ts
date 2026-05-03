#!/usr/bin/env node
/**
 * l402-kit MCP Server
 *
 * Exposes L402Client as MCP tools so Claude Desktop, Cursor, and any
 * MCP-compatible agent can autonomously pay Lightning-protected APIs.
 *
 * ## Environment Variables
 *
 * ### Option A — Blink wallet (recommended, free at blink.sv)
 * @env {string} BLINK_API_KEY       - Blink API key (required for Blink provider)
 * @env {string} BLINK_WALLET_ID     - Blink wallet ID (required for Blink provider)
 *
 * ### Option B — Alby wallet
 * @env {string} ALBY_TOKEN          - Alby access token (required for Alby provider)
 * @env {string} ALBY_HUB_URL        - Alby Hub URL (optional, for self-hosted Alby Hub)
 *
 * ### Budget control
 * @env {number} BUDGET_SATS         - Max sats the agent can spend per session (default: 1000)
 *
 * ## Setup in claude_desktop_config.json
 *
 * With Blink:
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
 * With Alby:
 * {
 *   "mcpServers": {
 *     "l402": {
 *       "command": "npx",
 *       "args": ["l402-kit-mcp"],
 *       "env": {
 *         "ALBY_TOKEN": "your-alby-token",
 *         "BUDGET_SATS": "500"
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
  version: "1.8.1",
});

// Tool: l402_fetch
server.registerTool(
  "l402_fetch",
  {
    title: "Fetch L402-protected URL",
    description:
      "Fetch a URL that may require a Bitcoin Lightning payment (L402 protocol). " +
      "Automatically handles the full payment flow: detects HTTP 402, pays the Lightning invoice, " +
      "and retries the request with the payment proof. Returns the response body as text. " +
      "Use this to call any L402-protected API endpoint autonomously.",
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
      "Returns the remaining Bitcoin Lightning budget available for this session. " +
      "Check this before making expensive API calls to ensure you have enough sats. " +
      "Budget is configured via the BUDGET_SATS environment variable (default: 1000 sats ≈ $0.60).",
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
      "Returns a detailed breakdown of all Bitcoin Lightning payments made this session. " +
      "Includes total sats spent, remaining budget, per-domain spending, and full transaction history with timestamps. " +
      "Use this to audit how much has been spent and which APIs were called.",
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
      "Returns the current session budget configuration. " +
      "Budget is set at startup via the BUDGET_SATS environment variable and cannot be changed at runtime. " +
      "To change the budget, restart the MCP server with a different BUDGET_SATS value.",
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

// ─── start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`l402-kit MCP fatal: ${String(err)}\n`);
  process.exit(1);
});
