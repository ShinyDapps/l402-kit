---
title: "AI Agents Can Now Pay for APIs Automatically — No Credit Cards, No OAuth"
published: false
description: "The missing piece for autonomous AI agents: pay-per-call Lightning payments via MCP. One tool call. Zero human approval."
tags: ai, mcp, bitcoin, webdev
cover_image: https://l402kit.com/badge/powered-by-l402kit.svg
canonical_url: https://docs.l402kit.com/introduction
---

## The Friction Nobody Talks About

You're building an AI agent. It needs to call a premium API — weather forecasts, financial data, compute resources, whatever.

How does it pay?

- **Credit card** → requires a human to approve, link a card, and manage billing
- **API key** → requires pre-registration, someone to provision access, a dashboard to manage
- **OAuth** → identity, not payment; you still need billing on top

Every option requires human intervention before the agent can act. That's not autonomous.

## HTTP 402: The Protocol That Was Always Meant for This

RFC 2616 reserved status code `402 Payment Required` back in 1999 — "for future use." That future is now, and it's called the **L402 protocol**.

Here's what it looks like from the agent's perspective:

```
Agent → GET /api/premium-data
Server ← 402 Payment Required
         WWW-Authenticate: L402 invoice="lnbc10n1..."

Agent pays Lightning invoice (1 sat, ~$0.001)
Agent → GET /api/premium-data
         Authorization: L402 <macaroon>:<preimage>
Server verifies: SHA256(preimage) == paymentHash ✓
Server ← 200 OK {"data": "..."}
```

No pre-registration. No API key provisioning. No human in the loop. The agent pays, proves it paid, and gets the data — all in one round trip.

## The MCP Tool That Makes It Work

[l402-kit](https://github.com/ShinyDapps/l402-kit) ships an MCP server with a single power tool: `l402_fetch`.

```json
{
  "mcpServers": {
    "l402": {
      "command": "npx",
      "args": ["l402-kit-mcp"],
      "env": {
        "BLINK_API_KEY": "your-key",
        "BLINK_WALLET_ID": "your-wallet-id",
        "BUDGET_SATS": "100"
      }
    }
  }
}
```

Add this to Claude Desktop (or any MCP-compatible client) and your agent gains the ability to autonomously pay for any L402-protected API — capped at 100 sats per session.

### What it looks like in practice

Once configured, you can tell Claude:

> "Fetch me the current BTC price from l402kit.com/api/demo/btc-price"

Claude calls `l402_fetch` → automatically handles the 402 → pays 1 sat → returns the data. No human approval needed. The whole flow happens in under 2 seconds.

## Try It Right Now — No Install Needed

The Glama MCP Inspector lets you test the server in your browser:

1. Go to [glama.ai/mcp/servers/ShinyDapps/l402-kit](https://glama.ai/mcp/servers/ShinyDapps/l402-kit)
2. Click **Try in Browser**
3. Call `l402_fetch` with `url: "https://l402kit.com/api/demo/btc-price"`

You'll see the 402 handshake live in the request log. (The browser inspector runs without wallet credentials, so the payment step will error — but you can observe the full protocol flow.)

## Budget Controls Keep Agents from Overspending

The wallet supports hard spending caps:

```typescript
const wallet = new ManagedWallet({
  provider: "blink",
  apiKey: process.env.BLINK_API_KEY,
  budget: { maxSats: 500, period: "day" }  // ~$0.30/day hard cap
});
```

The `l402_balance` and `l402_spending_report` MCP tools let the agent check its own remaining budget mid-session — no external monitoring needed.

## For API Builders: 3 Lines to Accept Agent Payments

If you want your API to accept autonomous payments from agents:

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();
app.use("/premium", l402({ priceSats: 10, provider: "blink" }));
app.get("/premium", (req, res) => res.json({ data: "paid content" }));
app.listen(3000);
```

Also available in Python, Go, and Rust. Revenue goes directly to your Lightning wallet — 0.3% platform fee, no chargebacks, no monthly billing overhead.

## Why Lightning and Not Stablecoins?

[Coinbase launched x402](https://github.com/coinbase/x402) — a similar protocol using USDC on Base. Both are valid approaches. The tradeoffs:

| | l402-kit (Lightning) | x402 (USDC/Base) |
|---|---|---|
| Settlement | Instant, final | ~2s, on-chain |
| Min amount | 1 sat (~$0.001) | ~$0.01 |
| Fees | ~0.3% | Gas + protocol fee |
| Custody | Self-custodial options | EVM wallet required |
| Agent support | MCP + LangChain | EVM SDK |

For truly micro transactions (1–100 sats), Lightning is the only option that makes economic sense. For USDC-native workflows, x402 fits better.

## Current Status

- **v1.8.1** on npm, pip, crates.io, pkg.go.dev
- **MCP server** listed on [Glama](https://glama.ai/mcp/servers/ShinyDapps/l402-kit) and [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- **476 tests** passing
- **Live demo** at [l402kit.com/api/demo](https://l402kit.com/api/demo) — 1 sat per call, try it with any Lightning wallet

```bash
npm install l402-kit

# See the 402 flow live
curl -v https://l402kit.com/api/demo/btc-price
```

---

The agent economy is coming. The payment layer needs to be as autonomous as the agents themselves. That's what L402 is for.

*If you've tried x402 or built anything with MCP payments, I'd love to hear how it went — drop a comment.*
