# Show HN: l402-kit – AI agents can now pay for APIs autonomously (no API keys, no OAuth)

**Title (under 80 chars):**
Show HN: l402-kit – Let AI agents pay for API calls autonomously via Lightning

---

Hi HN,

The problem: AI agents need to call paid APIs, but API keys are terrible for agents — you have to pre-provision them, rotate them, set up billing, deal with chargebacks. OAuth is even worse.

L402 (HTTP 402 + Bitcoin Lightning) solves this. The agent gets an invoice, pays it in milliseconds, and gets cryptographic proof of payment. No account, no API key, no human approval needed.

I built l402-kit to make this dead simple for API developers:

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

```go
// Go
provider := l402kit.NewManagedProvider("you@blink.sv")
http.Handle("/api/data", l402kit.Middleware(l402kit.Options{
    PriceSats: 10, Lightning: provider,
}, handler))
```

The flow:
1. Agent calls `/api/data` → gets HTTP 402 + BOLT11 invoice + macaroon
2. Agent pays the invoice via Lightning (~500ms)
3. Agent resends with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies SHA256(preimage) == paymentHash — no DB lookup, pure crypto

**What makes it agent-ready:**

- **MCP server** — `npx l402-kit-mcp` lets Claude/Cursor call L402-protected APIs directly from the IDE
- **LangChain tool** — auto-pay middleware inside any LangChain agent chain
- **Budget controls** — cap agent spend at N sats/session, N sats/day
- **Token delegation** — orchestrator agent mints caveated tokens for sub-agents with lower spending limits

**Languages:** TypeScript, Python, Go, Rust (same API surface, all published)

**vs. x402 (Coinbase's USDC version):** x402 uses stablecoins on Base — good for larger amounts. L402+Lightning works for micropayments (0.001¢ per call) with sub-second finality. Different tradeoffs.

**vs. rolling your own:** L402 is an IETF draft spec. Using the standard means your API is compatible with any future L402 client, not just yours.

**Status:** v1.8.2, live on npm/pip/crates.io/pkg.go.dev. Demo endpoint at l402kit.com/api/demo (costs 1 sat).

Would love to hear from anyone building agents that call paid APIs — what does your auth/billing look like today?

- GitHub: https://github.com/ShinyDapps/l402-kit
- Docs: https://docs.l402kit.com
- MCP: https://glama.ai/mcp/servers/@ShinyDapps/l402-kit

---

## Posting checklist
- [ ] Post between 9am–1pm US Eastern (best window for Show HN)
- [ ] Today is Tuesday 2026-05-05 — good day
- [ ] Watch first 30 min for comments — respond fast to get momentum
- [ ] If asked about Lightning volatility: "API calls settle in sats, API owner decides price in sats — stable pricing is the provider's layer, not the protocol's"
- [ ] If asked about node requirement: "Managed mode — zero node, just a Lightning Address. Sovereign mode for those who want full control."
