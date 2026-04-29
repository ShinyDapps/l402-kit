# Show HN: L402-Kit – Monetize any API with Bitcoin Lightning in 3 lines

**Title for HN:** Show HN: L402-Kit – Monetize any API with Bitcoin Lightning in 3 lines (TS/Python/Go/Rust)

---

Hi HN,

I built l402-kit to solve a problem I kept hitting: I wanted to charge per-API-call using Bitcoin Lightning, but the existing tools were either too low-level (raw BOLT11 handling) or required running a full node + custom auth system.

**What it does in 3 lines (Express example):**

```typescript
import { l402 } from "l402-kit";
app.use("/premium", l402({ priceSats: 10, provider: "blink" }));
```

That's it. The middleware:
1. Returns HTTP 402 with a BOLT11 invoice and a macaroon
2. Client pays the invoice via Lightning
3. Client resends request with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies SHA256(preimage) == paymentHash — cryptographic proof, no trust needed

**Why L402 over API keys or subscriptions?**
- No accounts required — works instantly for any client
- Per-call granularity — charge $0.001 per request if you want
- AI-native — agents can pay autonomously without human approval
- Global — Lightning works in any country, no Stripe required
- Chargeback-proof — Lightning payments are final

**Language support:** TypeScript, Python, Go, Rust (same API surface)

**AI agent features:**
- MCP server (`npx l402-kit-mcp`) — Claude/Cursor can call L402-protected APIs directly
- LangChain tool with auto-pay
- Budget controls — cap agent spending at $X/session
- Token delegation — orchestrator agent delegates caveated tokens to sub-agents

**Sovereign mode:** You run your own Lightning node (LND/CLN), zero fees, zero intermediaries. Managed mode uses Blink/Alby for zero-config setup.

**Current status:** v1.8.1, published on npm/pip/crates.io/go. Demo API at https://l402kit.com/api/demo (costs 1 sat to call).

Would love feedback especially from people who've tried x402 (Coinbase's USDC equivalent) — curious how the Lightning vs USDC tradeoffs land for real use cases.

Links:
- GitHub: https://github.com/ShinyDapps/l402-kit
- Docs: https://docs.l402kit.com
- Demo: https://l402kit.com/api/demo
