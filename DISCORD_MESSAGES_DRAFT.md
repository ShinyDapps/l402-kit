# Discord Message Drafts

## Lightning Labs Discord — #dev channel

**Subject: L402-Kit v1.8.1 — full-stack L402 middleware in TypeScript/Python/Go/Rust**

Hey! Built something I think this community will find useful:

**l402-kit** — monetize any API with Bitcoin Lightning in 3 lines of code.

```typescript
import { l402 } from "l402-kit";
app.use("/premium", l402({ priceSats: 10, provider: "blink" }));
```

What it does:
- Server middleware (Express, FastAPI, axum, net/http) — handles 402 + macaroon verification
- Agent client with auto-pay — fetches L402 URLs and pays automatically
- MCP server (`npx l402-kit-mcp`) — Claude/Cursor pay L402 APIs autonomously
- LangChain tool + budget controls
- Sovereign mode (LND/CLN) or Managed mode (Blink/Alby)

The crypto verification is just `SHA256(preimage) == paymentHash` — no database, no trust, cryptographic finality.

4 languages: TypeScript, Python, Go, Rust.

GitHub: https://github.com/ShinyDapps/l402-kit
Docs: https://docs.l402kit.com
Demo: https://l402kit.com/api/demo (1 sat)

Would love feedback especially around the macaroon caveats for token delegation — planning to add expiry caveats next.

---

## Alby Discord — #builders channel

**Subject: Built L402-Kit with Alby wallet support — MCP server for AI agents**

Hi! Wanted to share what I built using Alby:

**l402-kit** — full L402 protocol implementation for API monetization.

Alby is supported as a wallet provider:

```typescript
l402({ priceSats: 10, provider: "alby" })
// or via NWC:
l402({ priceSats: 10, provider: "nwc", nwcUrl: "nostr+walletconnect://..." })
```

The agent client works with Alby too — so AI agents can pay L402-protected APIs using your Alby wallet automatically.

MCP server setup with Alby:
```json
{
  "mcpServers": {
    "l402": {
      "command": "npx",
      "args": ["l402-kit-mcp"],
      "env": { "ALBY_ACCESS_TOKEN": "your-token" }
    }
  }
}
```

GitHub: https://github.com/ShinyDapps/l402-kit
Docs: https://docs.l402kit.com/agent/wallet-quickstart

Thanks for building Alby — the NWC integration made the agent wallet setup really clean!
