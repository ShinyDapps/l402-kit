---
title: "Monetize Your API with Bitcoin Lightning in 3 Lines of Code"
published: false
description: "L402-Kit: full-stack HTTP 402 middleware for TypeScript, Python, Go, and Rust. Server guard + agent auto-pay client + MCP server."
tags: bitcoin, api, typescript, ai
cover_image: https://l402kit.com/badge/powered-by-l402kit.svg
canonical_url: https://docs.l402kit.com/introduction
---

## The Problem

You built an API. You want to charge per request. Your options:

1. **API keys + billing system** — weeks of auth code, Stripe integration, chargeback risk
2. **Subscriptions** — friction for new users, overkill for occasional callers
3. **OAuth** — identity, not payment; still need billing on top

What if a client could pay for exactly one call, right now, from anywhere in the world, with cryptographic proof — and your API verified it in 10 lines of code?

## HTTP 402: The Payment Required Protocol

RFC 2616 reserved status code 402 "for future use." That future is now.

The L402 protocol (built on top of HTTP 402) works like this:

```
Client → GET /premium
Server ← 402 Payment Required
         WWW-Authenticate: L402 macaroon="...", invoice="lnbc10n1..."

Client pays Lightning invoice (via wallet or automated agent)
Client → GET /premium
         Authorization: L402 <macaroon>:<preimage>
Server verifies: SHA256(preimage) == paymentHash ✓
Server ← 200 OK  (response)
```

The cryptographic verification is the key insight: **no database lookup needed**. The server checks `SHA256(preimage) == paymentHash` — that's it. If it matches, the payment happened. Period.

## L402-Kit: 3 Lines to Monetize Any API

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();
app.use("/premium", l402({ priceSats: 10, provider: "blink" }));
app.get("/premium", (req, res) => res.json({ data: "paid content" }));
app.listen(3000);
```

That's a fully working pay-per-call API. No accounts, no billing dashboard, no Stripe.

### Same API in 4 Languages

**Python (FastAPI):**
```python
from fastapi import FastAPI
from l402kit import L402Middleware

app = FastAPI()
app.add_middleware(L402Middleware, price_sats=10, provider="blink")

@app.get("/premium")
def premium(): return {"data": "paid content"}
```

**Go (net/http):**
```go
mux := http.NewServeMux()
mux.Handle("/premium", l402kit.Guard(10, "blink", premiumHandler))
http.ListenAndServe(":8080", mux)
```

**Rust (axum):**
```rust
let app = Router::new()
    .route("/premium", get(premium_handler))
    .layer(L402Layer::new(10, "blink"));
```

## For AI Agents: The Real Game-Changer

AI agents need to pay for APIs autonomously. Credit cards require human approval. API keys require pre-registration. L402 solves both.

### MCP Server (Claude/Cursor/etc.)

```json
{
  "mcpServers": {
    "l402": {
      "command": "npx",
      "args": ["l402-kit-mcp"],
      "env": {
        "BLINK_API_KEY": "your-key",
        "BLINK_WALLET_ID": "your-wallet-id"
      }
    }
  }
}
```

Now Claude can call any L402-protected API:

> "Fetch me the latest BTC price" → agent calls `/api/demo` → automatically pays 1 sat → gets response → reports to you

### LangChain Integration

```python
from l402kit import L402Tool

tools = [L402Tool(wallet_config={"provider": "blink", "api_key": "..."})]
agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
agent.run("Call the premium weather API and get tomorrow's forecast")
```

### Budget Controls

```typescript
const wallet = new ManagedWallet({
  provider: "blink",
  apiKey: process.env.BLINK_API_KEY,
  budget: { maxSats: 1000, period: "day" }  // cap at ~$0.60/day
});
```

## Sovereign Mode: Zero Fees, Full Control

Don't want intermediaries? Run your own Lightning node:

```typescript
l402({
  priceSats: 10,
  provider: "lnd",
  lnd: { host: "localhost:10009", macaroon: "...", cert: "..." }
})
```

0% fees. Your node. Your keys. Your revenue.

## Discovery for AI Agents

Agents need to find L402-protected APIs without human help. L402-Kit implements 3 discovery layers:

1. **DNS TXT record:** `l402._payment.yourdomain.com` — works without HTTP
2. **`.well-known/agent.json`** — machine-readable endpoint metadata  
3. **`llms.txt`** — training data for LLMs about your API

## Current Status

- v1.8.1 on [npm](https://npmjs.com/package/l402-kit), [pip](https://pypi.org/project/l402kit), [crates.io](https://crates.io/crates/l402kit), [pkg.go.dev](https://pkg.go.dev/github.com/shinydapps/l402-kit/go)
- 448 tests passing
- MCP server listed in punkpeye/awesome-mcp-servers
- Demo at https://l402kit.com/api/demo (1 sat per call)

## Try It

```bash
# Install
npm install l402-kit

# Try the demo API (will return 402 without payment)
curl https://l402kit.com/api/demo

# Docs
open https://docs.l402kit.com
```

Lightning payments make more sense for APIs than you might think — especially as AI agents proliferate and start autonomously consuming paid services. The cryptographic verification removes an entire trust layer that traditional billing systems require.

Feedback welcome, especially from folks who've tried x402 (Coinbase's USDC equivalent) — curious how the Bitcoin vs stablecoin tradeoffs land in practice.
