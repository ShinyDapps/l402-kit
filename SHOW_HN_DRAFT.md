# Show HN: l402-kit — AI agents that pay for APIs autonomously (Bitcoin Lightning)

**Title (under 80 chars, three candidates ranked):**
1. `Show HN: l402-kit – AI agents that pay APIs autonomously via Bitcoin Lightning`
2. `Show HN: l402-kit – Bitcoin Lightning pay-per-call middleware for AI agents`
3. `Show HN: l402-kit – HTTP 402 + Lightning, agents bring sats instead of API keys`

---

Hi HN,

API keys were designed for humans. They suck for agents — you pre-provision them, rotate them, set up billing, deal with chargebacks, and they still get leaked in logs.

l402-kit is middleware that lets your API charge per call in Bitcoin sats. An AI agent calls your endpoint, gets back HTTP 402 + a Lightning invoice + macaroon, pays in ~500ms, resends with cryptographic proof of payment, and gets the data. No account, no key, no human in the loop.

```typescript
// TypeScript (Express)
import { l402, ManagedProvider } from "l402-kit";
const lightning = ManagedProvider.fromAddress("you@blink.sv");
app.use("/api/data", l402({ priceSats: 10, lightning }));
```

```python
# Python (FastAPI)
from l402kit import l402_required, ManagedProvider
lightning = ManagedProvider.from_address("you@blink.sv")

@app.get("/api/data")
@l402_required(price_sats=10, lightning=lightning)
async def data(): ...
```

```rust
// Rust (axum)
let lightning = ManagedProvider::from_address("you@blink.sv");
app.route("/api/data", get(handler)).layer(l402_middleware(10, lightning));
```

```go
// Go (net/http)
provider := l402kit.NewManagedProvider("you@blink.sv")
http.Handle("/api/data", l402kit.Middleware(l402kit.Options{
    PriceSats: 10, Lightning: provider,
}, handler))
```

All four are at **v1.10.0** with identical contracts — verified by TDD across all SDKs.

**The flow (pure crypto, no DB):**
1. Agent calls `/api/data` → HTTP 402 + BOLT11 invoice + macaroon (signed JSON with paymentHash + exp)
2. Agent pays the invoice over Lightning Network
3. Agent resends with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies `SHA256(preimage) == paymentHash` in constant time. No DB lookup, no central authority.

**Agent-ready bits:**

- **MCP server** — `npx l402-kit-mcp` lets Claude / Cursor call L402-protected APIs directly. 12 tools across two layers (generic L402 client + pre-wired VERITY services).
- **LAW-N adapter** (`createLawNAdapter` / `create_lawn_adapter` / `CreateLawNAdapter`) — emits HMAC-signed CloudEvents 1.0 to a behavioral ingest endpoint on every payment. Reputation without authority.
- **Auto wallet detection** — `build_wallet()` (Python) / `buildWallet()` (TS) reads `BLINK_API_KEY` / `ALBY_TOKEN` from env.
- **Budget controls + token delegation** — orchestrator mints caveated tokens for sub-agents.

**VERITY** (https://l402kit.com/api/verity): an autonomous agent built on l402-kit. 11 paid services (BTC price, web search, scrape, AI summarize/sentiment/translate, world state, domain intel, deep research, strategic alpha, integration). Dynamic pricing (+10% surge, -10% idle, floor protected). RADAR cron that finds new leads. Fiscal Agent that emits daily P&L. All running on Cloudflare Workers + Blink wallet.

**Sovereign mode is the point.** Managed (0.3% fee, no node) and Sovereign (0% fee, you run your own Lightning node) modes share the same API. Spec is open, transport is open, you can fork the whole thing.

**Where I want pushback:**
- The exp-cap (`MAX_EXP_MS = 2h`) was added after a Schneier audit — is 2 hours the right window?
- LAW-N is fire-and-forget. Should agents be able to query their own reputation back?
- We deliberately reject x402 (USDC on Base/Polygon) — am I wrong that micropayments need true millisecond settlement?

Links:
- GitHub: https://github.com/ShinyDapps/l402-kit
- Docs (multilingual): https://docs.l402kit.com
- MCP server (Glama): https://glama.ai/mcp/servers/@ShinyDapps/l402-kit
- Live VERITY demo (callable in-browser): https://l402kit.com

---

## First comment (post yourself, fast — anchors the discussion)

> Author here. Quick technical context worth flagging up top:
>
> 1. **Revenue today: 0 sats.** I'm not pretending we have traction — the spec works, the SDKs ship, the dashboard runs, but no one has paid for an API call yet. Posting here to find the first real users, not to celebrate.
>
> 2. **Why Bitcoin Lightning and not stablecoins / x402:** sub-second settlement at fractions of a cent. x402 (Coinbase) targets larger transfers on Base. L402 targets 1-sat-per-call. Different problems.
>
> 3. **Three things I want to validate with you:**
>    - Is the LAW-N "reputation without authority" pitch coherent, or is it solving a non-problem?
>    - Did anyone here ever ship a paywall in Lightning and find the economics didn't work?
>    - Sovereign mode (run your own node, 0% fee) — is that the right framing or is the friction too high?

---

## Posting checklist

- [ ] Post Tuesday–Thursday between 9am–1pm US Eastern
- [ ] Post the first comment within 60 seconds of submission
- [ ] Stay online first 30–60 min — reply to every comment, no exceptions
- [ ] Have the live demo URL pre-loaded in a tab to share quickly
- [ ] Common pushbacks to have answers ready for:
  - "Lightning custodial risk" → Managed mode is opt-in. Sovereign mode means you own the wallet.
  - "Why not API keys + invoices monthly?" → Agents can't deal with humans / billing cycles. They pay or they don't get the data.
  - "Lightning volatility" → API owner prices in sats. Sats are the unit, not USD.
  - "Why isn't this Stripe's problem?" → It will be. Eventually. We're building for agents that exist today.
- [ ] If a Lightning Labs / Fewsats / Aperture maintainer shows up, thank them publicly — we built on their spec.

## What NOT to do

- Don't claim "production-ready for billions of agents" — be honest that we're early.
- Don't bash x402 / Coinbase / Stripe — different problems, different tradeoffs.
- Don't promise features ("coming soon: X") — only mention what's shipping today.
- Don't reply to negative comments defensively. If they're right, agree. If they're wrong, ask one clarifying question.
