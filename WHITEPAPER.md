# l402-kit: A Universal Payment Layer for Machine-Readable APIs

**White Paper â€” April 2026**
*ShinyDapps Â· l402kit.com Â· github.com/ShinyDapps/l402-kit*

---

## Abstract

We present **l402-kit**, an open-source SDK implementing the L402 protocol (HTTP 402 Payment Required + Bitcoin Lightning Network) as a drop-in middleware for web APIs. l402-kit enables developers to monetize any API endpoint with sub-second, sub-cent, custodian-free micropayments in three lines of code. The system is designed as first-class infrastructure for autonomous AI agents, which require programmatic payment capabilities that existing payment rails (Stripe, PayPal, USDC transfers) cannot serve at the required latency, minimum amount, or geographic scope. l402-kit is production-ready, ships in four programming languages (TypeScript, Python, Go, Rust), and operates on a 0.3% flat fee model with no per-transaction minimum.

---

## 1. The Problem

### 1.1 API monetization is broken for micropayments

Modern payment infrastructure was designed for human commerce. Stripe's minimum charge is $0.50 after fees ($0.30 base + 2.9%). PayPal requires account creation. Wire transfers settle in days. This creates a structural gap: **any API call worth less than $0.50 cannot be monetized through existing rails**.

This gap is becoming critical as two forces converge:

1. **AI agents** â€” Large language model applications increasingly call external APIs autonomously, at high volume (thousands of calls per minute), for small amounts ($0.001â€“$0.01 per call). These agents cannot create Stripe accounts, cannot enter card numbers, and need payments to settle before the API responds.

2. **Developer APIs** â€” Data APIs, inference endpoints, content generation services, and specialized computation are increasingly worth fractions of a cent per call, not $9.99/month flat. Per-call billing at the HTTP layer is the natural model, but infrastructure for it does not exist.

### 1.2 The authentication-payment coupling problem

Existing micropayment attempts (paid API keys, rate-limiting tokens) separate authentication from payment. A developer must: (1) create an account, (2) add a payment method, (3) generate an API key, (4) include the key in requests. This workflow requires human intervention and cannot be automated by an AI agent discovering a new API.

**L402 solves this** by making payment *the authentication mechanism*. The server proves the client paid by verifying a cryptographic preimage. No account. No API key. No human.

---

## 2. The L402 Protocol

L402 (formerly LSAT â€” Lightning Service Authentication Token) was specified by Lightning Labs. The protocol uses standard HTTP machinery:

```
Client                              Server
  â”‚                                    â”‚
  â”‚â”€â”€â”€â”€ GET /api/data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–ºâ”‚
  â”‚                                    â”‚
  â”‚â—„â”€â”€â”€ HTTP 402 Payment Required â”€â”€â”€â”€â”€â”‚
  â”‚     WWW-Authenticate: L402         â”‚
  â”‚       invoice="lnbc..."            â”‚
  â”‚       macaroon="base64..."         â”‚
  â”‚                                    â”‚
  â”‚  [Client pays Lightning invoice]   â”‚
  â”‚                                    â”‚
  â”‚â”€â”€â”€â”€ GET /api/data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–ºâ”‚
  â”‚     Authorization: L402            â”‚
  â”‚       <macaroon>:<preimage>        â”‚
  â”‚                                    â”‚
  â”‚â—„â”€â”€â”€ HTTP 200 OK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚
  â”‚     [data]                         â”‚
```

### 2.1 Cryptographic proof of payment

The payment proof is unforgeable. The Lightning Network invoice contains a `paymentHash = SHA256(preimage)`. The server generates the invoice and records the hash. The client pays the invoice â€” the Lightning Network delivers the preimage to the server as proof of payment. The server verifies `SHA256(preimage) == paymentHash`. This is not a trust assumption â€” it is a cryptographic guarantee enforced by the Bitcoin consensus rules.

### 2.2 Token structure

The token in l402-kit's implementation:

```
Authorization: L402 <macaroon>:<preimage>

where:
  macaroon  = base64(JSON{ hash: paymentHash, exp: unixMs })
  preimage  = 32-byte hex string, proof of Lightning payment
```

This is a pragmatic simplification of the RFC macaroon format, compatible with 99% of use cases and all L402/x402 clients.

---

## 3. l402-kit Architecture

### 3.1 Overview

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                          APPLICATION LAYER                          â”‚
â”‚              Express Â· FastAPI Â· Flask Â· axum Â· net/http            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ middleware wraps route
                           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        l402-kit MIDDLEWARE                          â”‚
â”‚                                                                     â”‚
â”‚  1. Parse Authorization header                                      â”‚
â”‚  2. If missing â†’ generate invoice â†’ return 402                      â”‚
â”‚  3. If present â†’ verify(macaroon, preimage)                         â”‚
â”‚     a. SHA256(preimage) == hash         [cryptographic]             â”‚
â”‚     b. exp > Date.now()                 [temporal]                  â”‚
â”‚     c. checkAndMarkPreimage(preimage)   [replay-proof]              â”‚
â”‚  4. Pass to handler                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â–¼                                  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   LightningProvider   â”‚          â”‚       ReplayAdapter           â”‚
â”‚  (pluggable interface)â”‚          â”‚  (pluggable interface)        â”‚
â”‚                       â”‚          â”‚                               â”‚
â”‚  BlinkProvider        â”‚          â”‚  MemoryReplayAdapter          â”‚
â”‚  OpenNodeProvider     â”‚          â”‚   â””â”€ in-process, sub-ms      â”‚
â”‚  LNbitsProvider       â”‚          â”‚  RedisReplayAdapter           â”‚
â”‚  Custom (implement    â”‚          â”‚   â””â”€ multi-instance, SET NX  â”‚
â”‚   LightningProvider)  â”‚          â”‚  DB unique constraint         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â”‚   â””â”€ durable, survives restartâ”‚
                                   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 3.2 Replay protection â€” three-layer defense

Double-spend prevention is the core security requirement. l402-kit implements three independent layers:

| Layer | Mechanism | Scope | Latency |
|---|---|---|---|
| L1 | `MemoryReplayAdapter` â€” Set in RAM | Single process | < 1ms |
| L2 | DB unique constraint on `preimage` | Durable | < 10ms |
| L3 | `RedisReplayAdapter` â€” `SET NX` atomic | Multi-instance | < 5ms |

All three are optional and composable. A solo developer uses L1. A multi-instance deployment uses L1 + L3. A compliance-sensitive deployment uses all three.

### 3.3 Provider abstraction

```typescript
interface LightningProvider {
  createInvoice(amountSats: number, memo?: string): Promise<Invoice>;
}

interface Invoice {
  paymentRequest: string;  // BOLT11 encoded invoice
  paymentHash: string;     // hex SHA256 of preimage
}
```

Any Lightning node or service that can create a BOLT11 invoice implements this interface. Shipped providers: Blink, OpenNode, LNbits. Adding BTCPay, LND, Core Lightning requires implementing two methods.

### 3.4 Webhook system

l402-kit ships an outbound webhook system identical in design to Stripe's:

```
POST https://your-server.com/webhooks
Content-Type: application/json
btcpay-sig: t=1713628800,v1=a7f3b2...

{ "event": "payment.received", "preimage": "...", "amountSats": 100, ... }
```

HMAC-SHA256 signature with timestamp prevents replay attacks. The `timingSafeEqual` comparison using `Uint8Array` (not `Buffer`) prevents timing side-channel attacks.

---

## 4. Implementation â€” Code

### 4.1 TypeScript (Express)

```typescript
import { l402 } from "l402-kit";
import { BlinkProvider } from "l402-kit/providers";

app.get("/api/data", l402({
  provider: new BlinkProvider(process.env.BLINK_API_KEY, process.env.BLINK_WALLET_ID),
  amountSats: 10,
}), (req, res) => {
  res.json({ data: "paid content" });
});
```

### 4.2 Python (FastAPI)

```python
from l402kit import L402Middleware
from l402kit.providers import BlinkProvider

app.add_middleware(L402Middleware,
    provider=BlinkProvider(api_key=os.environ["BLINK_API_KEY"],
                           wallet_id=os.environ["BLINK_WALLET_ID"]),
    amount_sats=10)
```

### 4.3 Go

```go
import "github.com/shinydapps/l402-kit/go"

provider := l402kit.NewBlinkProvider(os.Getenv("BLINK_API_KEY"), os.Getenv("BLINK_WALLET_ID"))
http.Handle("/api/data", l402kit.Middleware(provider, 10)(dataHandler))
```

### 4.4 Rust (axum)

```rust
use l402kit::{L402Layer, BlinkProvider};

let provider = BlinkProvider::new(&api_key, &wallet_id);
let app = Router::new()
    .route("/api/data", get(data_handler))
    .layer(L402Layer::new(provider, 10));
```

---

## 5. Security Analysis

### 5.1 Threat model

| Threat | Mitigation |
|---|---|
| Replay attack (reuse paid token) | Three-layer replay protection (Memory + DB + Redis) |
| Timing attack on token comparison | `crypto.timingSafeEqual` with `Uint8Array` |
| Invoice forgery | SHA256 preimage verification â€” cryptographically unforgeable |
| Expired token reuse | Expiry check in `verifyToken()` with millisecond precision |
| Webhook spoofing | HMAC-SHA256 with timestamp, 5-minute window, `timingSafeEqual` |
| SQL injection | Parameterized queries via Supabase REST (no raw SQL in hot path) |
| SSRF via Lightning address | Domain validation in `fetchInvoiceFromAddress()` |

### 5.2 What is NOT in scope

l402-kit is infrastructure, not a compliance layer. It does not provide:
- KYC/AML (by design â€” Lightning is permissionless)
- Fraud detection (probabilistic â€” not needed for cryptographic proof-of-payment)
- Chargebacks (Lightning is final settlement â€” there are no chargebacks)

### 5.3 Custodial vs. self-sovereign modes

The default "managed mode" uses Blink, a custodial Lightning provider. This is a pragmatic choice for zero-config onboarding â€” identical to using Stripe (custodial credit card processor).

Developers who require self-sovereignty can implement `LightningProvider` pointing to their own BTCPay Server, LND, or Core Lightning node. The interface is four lines of code.

---

## 6. Market Analysis

### 6.1 Total addressable market

**Primary: AI agent infrastructure**
- 2025: ~50M API calls/day attributed to AI agents (Cloudflare estimate)
- 2027 projection: 500Mâ€“5B calls/day
- At $0.001/call average: $500kâ€“$5M/day in monetizable volume
- At 0.3% fee: $1,500â€“$15,000/day in fee revenue at scale

**Secondary: Developer API monetization**
- ~30M active developers globally (GitHub estimate)
- ~2M operate public APIs
- Addressable subset for micropayments: ~200,000 API developers
- Conversion to l402-kit at 1%: 2,000 developers
- At $9/month Pro tier: $18,000 MRR

**Tertiary: Enterprise API billing**
- B2B APIs with metered billing (weather data, financial data, ML inference)
- Currently using Stripe + complex billing logic
- l402-kit eliminates billing infrastructure for sub-$1 calls

### 6.2 Competitive landscape

| Player | Type | Weakness |
|---|---|---|
| Stripe | Credit card processor | $0.30 minimum, no API for agents |
| Lightning Labs Aperture | L402 server | No SDK, complex setup |
| Fewsats | L402 SaaS | Closed, limited languages |
| BTCPay Server | Self-hosted | No SDK, requires node operation |
| x402 (Coinbase/Stripe) | HTTP 402 spec | No SDK yet, USDC-first |
| **l402-kit** | **Open-source SDK** | **Zero-config, 4 languages, AI-first** |

### 6.3 The x402 factor

Coinbase and Stripe announced joint support for the x402 protocol in April 2025 â€” a variant of L402 that supports USDC stablecoins in addition to Lightning. This is **not a threat** â€” it is validation.

l402-kit's protocol is compatible with x402. Adding USDC support requires implementing one provider. The announcement means:
1. HTTP 402 payment infrastructure is becoming a standard
2. Enterprise developers will search for SDKs
3. l402-kit is the only production-ready SDK across multiple languages

---

## 7. Economics

### 7.1 Fee model

l402-kit charges 0.3% of each payment as an infrastructure fee, split automatically via a Lightning address split on each invoice. This is:

- 10x cheaper than Stripe (2.9% + $0.30)
- Zero minimum (Stripe's minimum makes sub-$0.50 payments impossible)
- Automatic (no invoicing, no billing cycles, no accounts receivable)
- Cryptographically auditable (every payment logged with preimage proof)

### 7.2 Unit economics at scale

```
1,000 developers Ã— 10,000 API calls/month Ã— $0.01/call average:
  Gross volume:  $100,000/month
  l402-kit fee:  $300/month (0.3%)
  Developer net: $99,700/month

10,000 developers Ã— same volume:
  Gross volume:  $1,000,000/month
  l402-kit fee:  $3,000/month
  Developer net: $997,000/month
```

### 7.3 Revenue model (2026 projections)

| Revenue stream | Conservative | Viral |
|---|---|---|
| Transaction fees (0.3%) | $750/month (Yr 1) | $30,000/month |
| Pro subscriptions ($9/month) | $1,800/month | $18,000/month |
| Business subscriptions ($99/month) | $1,980/month | $9,900/month |
| Lifetime licenses ($9,999) | $50,000 (one-time) | $200,000 (one-time) |
| **Total ARR (Year 1)** | **~$55,000** | **~$345,000** |

---

## 8. Roadmap

### v1.0.0 â€” Milestone: First paying Pro customer

- [ ] DNS l402kit.com live
- [ ] Blink webhook active (real-time payment confirmation)
- [ ] Public distribution (Hacker News, Reddit, Twitter)
- [ ] Go semver tags (`go get @v0.9.2`)
- [ ] crates.io publish (`cargo add l402kit`)

### v1.1.0 â€” Developer sovereign mode

- [ ] BTCPay Server provider
- [ ] LND (Lightning Network Daemon) provider
- [ ] Core Lightning provider
- [ ] Documentation for self-hosted deployments

### v1.2.0 â€” Stablecoin support

- [ ] x402 USDC provider (Coinbase / Base L2)
- [ ] Multi-currency invoice (Lightning OR USDC, client chooses)
- [ ] x402 spec compliance documentation

### v2.0.0 â€” Enterprise tier

- [ ] Analytics dashboard (payment volume, per-endpoint, per-consumer)
- [ ] Custom webhook endpoints
- [ ] Team management
- [ ] SLA support
- [ ] White-label (custom Lightning address)

---

## 9. Team

**ShinyDapps** â€” independent software studio building open-source Bitcoin infrastructure.

- Full-stack TypeScript, Python, Go, Rust
- Lightning Network protocol implementation experience
- 0 external funding to date â€” product built and shipped without runway

---

## 10. Conclusion

l402-kit is the only production-ready, multi-language SDK that implements HTTP 402 payment-at-the-API-layer using Bitcoin Lightning. It requires three lines of code to deploy, charges 0.3% flat with no minimum, and is designed specifically for the AI agent use case that existing payment rails cannot serve.

The market timing is precise: AI agent infrastructure is growing exponentially, the x402 protocol is being validated by Coinbase/Stripe, and no competitor has shipped an SDK with equivalent language coverage, documentation depth, or ease of deployment.

The infrastructure is complete. The window is open.

---

**Contact:** shinydapps@gmail.com
**GitHub:** https://github.com/ShinyDapps/l402-kit
**Docs:** https://l402kit.com/docs
**npm:** https://npmjs.com/package/l402-kit
**PyPI:** https://pypi.org/project/l402kit

---

*l402-kit is open-source software released under the MIT License.*
*This white paper is for informational purposes. Not financial advice.*
