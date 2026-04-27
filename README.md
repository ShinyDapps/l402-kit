<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://l402kit.com/logo-dark.svg" height="72">
  <img src="https://l402kit.com/logo-light.svg" height="72" alt="l402-kit">
</picture>

# l402-kit

**Add Bitcoin Lightning pay-per-call to any API. 3 lines of code.**

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/▶_live_demo-end--to--end-f7931a)](https://l402kit.com/demo)
[![Tests](https://img.shields.io/endpoint?url=https://l402kit.com/api/badges/tests)](https://github.com/ShinyDapps/l402-kit)

<br/>

<a href="https://l402kit.com/demo" title="Watch end-to-end demo">
  <img src="https://l402kit.com/extension-preview.png" width="600" alt="ShinyDapps VS Code extension — real-time Lightning payment dashboard" />
</a>

<br/>

**[▶ Watch end-to-end demo — install → 402 → pay → 200 OK](https://l402kit.com/demo)**

<br/>

---

### Live traction

| SDK | Version | Downloads |
|:----|:-------:|----------:|
| 📦 **TypeScript** · [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) | [![npm](https://img.shields.io/npm/v/l402-kit?color=f7931a&label=)](https://npmjs.com/package/l402-kit) | [![npm total](https://img.shields.io/npm/dt/l402-kit?color=f7931a&label=total%20dls)](https://npmjs.com/package/l402-kit) |
| 🐍 **Python** · [pypi.org/project/l402kit](https://pypi.org/project/l402kit) | [![pypi](https://img.shields.io/pypi/v/l402kit?color=3776ab&label=)](https://pypi.org/project/l402kit) | [![pypi total](https://img.shields.io/pepy/dt/l402kit?color=3776ab&label=total%20dls)](https://pypi.org/project/l402kit) |
| 🦀 **Rust** · [crates.io/crates/l402kit](https://crates.io/crates/l402kit) | [![crates](https://img.shields.io/crates/v/l402kit?color=ce422b&label=)](https://crates.io/crates/l402kit) | [![crates dls](https://img.shields.io/crates/d/l402kit?color=ce422b&label=total%20dls)](https://crates.io/crates/l402kit) |
| 🔌 **VS Code Extension** · [marketplace](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402) | [![vscode ver](https://vsmarketplacebadges.dev/version-short/ShinyDapps.shinydapps-l402.svg)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402) | [![marketplace](https://img.shields.io/badge/VS%20Code-install-007acc)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402) |
| 🦫 **Go** · [pkg.go.dev](https://pkg.go.dev/github.com/shinydapps/l402-kit/go) | [![go](https://img.shields.io/badge/go-v1.8.0-00acd7)](https://pkg.go.dev/github.com/shinydapps/l402-kit/go) | [![go report](https://img.shields.io/badge/go%20report-A+-00acd7)](https://goreportcard.com/report/github.com/shinydapps/l402-kit/go) |

---

</div>

---

<details>
<summary>🌍 Available in 11 languages — click to expand</summary>

<br/>

🇺🇸 **Charge for your API in Bitcoin Lightning. 3 lines of code.**
🇧🇷 Monetize sua API com Bitcoin Lightning. 3 linhas de código.
🇪🇸 Monetiza tu API con Bitcoin Lightning. 3 líneas de código.
🇨🇳 用 3 行代码，通过比特币闪电网络收费。
🇮🇳 अपने API को Bitcoin Lightning से 3 लाइनों में मोनेटाइज़ करें।
🇸🇦 اكسب من API الخاص بك عبر Bitcoin Lightning. 3 أسطر فقط.
🇫🇷 Monétisez votre API en Bitcoin Lightning. 3 lignes de code.
🇩🇪 Monetarisiere deine API mit Bitcoin Lightning. 3 Zeilen Code.
🇷🇺 Монетизируй свой API через Bitcoin Lightning. 3 строки кода.
🇯🇵 Bitcoin LightningでAPIを3行で収益化。
🇮🇹 Monetizza la tua API con Bitcoin Lightning. 3 righe di codice.

📖 **Official docs:** [🇺🇸](https://l402kit.com/docs) · [🇧🇷](https://l402kit.com/docs/pt/introduction) · [🇪🇸](https://l402kit.com/docs/es/introduction) · [🇨🇳](https://l402kit.com/docs/zh/introduction) · [🇮🇳](https://l402kit.com/docs/hi/introduction) · [🇸🇦](https://l402kit.com/docs/ar/introduction) · [🇫🇷](https://l402kit.com/docs/fr/introduction) · [🇩🇪](https://l402kit.com/docs/de/introduction) · [🇷🇺](https://l402kit.com/docs/ru/introduction) · [🇯🇵](https://l402kit.com/docs/ja/introduction) · [🇮🇹](https://l402kit.com/docs/it/introduction)

</details>

---

## Install

```bash
npm install l402-kit        # TypeScript / Node.js / Express
pip install l402kit         # Python / FastAPI / Flask
go get github.com/shinydapps/l402-kit/go@v1.8.0   # Go / net/http / Chi / Gin
cargo add l402kit           # Rust / axum
```

> **AI Agents / LLMs:** See [`llms.txt`](./llms.txt) for machine-readable instructions.

---

## How it works

```
1. Client calls your API
       ↓
2. API returns  HTTP 402 + BOLT11 invoice + macaroon
       ↓
3. Client pays  (any Lightning wallet, < 1 second, any country)
       ↓
4. Client sends Authorization: L402 <macaroon>:<preimage>
       ↓
5. API verifies SHA256(preimage) == paymentHash  ✓
       ↓
6. HTTP 200 OK + your data

── Fee flow (managed mode) ─────────────────────────────────
   Payment → 99.7% → your Lightning Address  (instant)
           →  0.3% → ShinyDapps
```

---

## Quickstart

### TypeScript

```typescript
import express from "express";
import { l402, AlbyProvider } from "l402-kit";

const app = express();

const lightning = new AlbyProvider(process.env.ALBY_TOKEN!);

app.get("/premium", l402({ priceSats: 100, lightning }), (_req, res) => {
  res.json({ data: "Payment confirmed." });
});

app.listen(3000);
```

### Python

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="you@yourdomain.com")
async def premium(request: Request):
    return {"data": "Payment confirmed."}
```

### Go

```go
package main

import (
    "fmt"
    "net/http"
    l402kit "github.com/shinydapps/l402-kit/go"
)

func main() {
    http.Handle("/premium", l402kit.Middleware(l402kit.Options{
        PriceSats:             100,
        OwnerLightningAddress: "you@yourdomain.com",
    }, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, `{"data": "Payment confirmed."}`)
    })))
    http.ListenAndServe(":8080", nil)
}
```

### Rust

```rust
use axum::{middleware, routing::get, Router};
use l402kit::{l402_middleware, Options};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let opts = Arc::new(Options::new(100).with_address("you@yourdomain.com"));

    let app = Router::new()
        .route("/premium", get(|| async { "Payment confirmed." }))
        .route_layer(middleware::from_fn_with_state(opts, l402_middleware));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

---

## Test it live

```bash
# Step 1 — triggers 402 + returns invoice
curl http://localhost:3000/premium
# ← { "error": "Payment Required", "invoice": "lnbc1u...", "macaroon": "eyJ..." }

# Step 2 — pay the invoice with any Lightning wallet, then:
curl http://localhost:3000/premium \
  -H "Authorization: L402 <macaroon>:<preimage>"
# ← { "data": "Payment confirmed." }
```

[▶ Try the interactive demo](https://l402kit.com/demo)

---

## Why not Stripe?

|  | Stripe | l402-kit |
|--|--------|----------|
| Minimum fee | $0.30 | **< 1 sat (~$0.001)** |
| Settlement time | 2–7 days | **< 1 second** |
| Chargebacks | Yes | **Impossible — cryptographic proof** |
| Requires account | Yes | **No — any Lightning wallet** |
| AI agent support | No | **Yes — 4 SDKs, native** |
| Countries blocked | ~50 | **0 — global by default** |
| Reversible | Yes | **No — final on receipt** |
| Open source | No | **Yes — MIT** |

---

## Providers

```typescript
import { BlinkProvider, OpenNodeProvider, LNbitsProvider } from "l402-kit";

// Blink (recommended — free, instant setup)
const provider = new BlinkProvider(process.env.BLINK_API_KEY!, process.env.BLINK_WALLET_ID!);

// OpenNode (production, custodial)
const provider = new OpenNodeProvider(process.env.OPENNODE_KEY!);

// LNbits (self-hosted)
const provider = new LNbitsProvider(process.env.LNBITS_KEY!, "https://your.lnbits.host");
```

**Bring your own node** — implement the `LightningProvider` interface in 5 lines:

```typescript
import type { LightningProvider } from "l402-kit";

class MyNode implements LightningProvider {
  async createInvoice(amountSats: number) { /* return Invoice */ }
  async checkPayment(paymentHash: string) { /* return boolean */ }
}
```

---

## Security model

```
Invoice creation:  paymentHash = SHA256(preimage)
Client payment:    Lightning Network releases preimage to payer
API verification:  SHA256(preimage) == paymentHash  ✓
Replay protection: each preimage is marked used — works exactly once
Token expiry:      macaroons expire after 1 hour
```

- **Unforgeable** — SHA256 is a one-way function; you cannot fake a preimage
- **No chargebacks** — cryptographic settlement, not reversible card auth
- **Replay-safe** — MemoryReplayAdapter (dev) or RedisReplayAdapter (production, multi-instance)
- **392 automated tests** across 5 runtimes (TS, Python, Go, Rust, Cloudflare Workers) — production-grade reliability for autonomous agent workflows
- **Fully auditable** — MIT, every line open source

---

## VS Code Extension

Monitor every sat in real-time without leaving your editor.

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version/ShinyDapps.shinydapps-l402.svg)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402)

- ⚡ Live payment feed per endpoint
- 📊 Bar chart — 1D / 7D (free) · 30D / 1Y / ALL (Pro)
- 🌍 11 languages built-in
- 🎨 Light / dark / auto theme
- 🔧 Zero config — just set your Lightning Address

---

## Get a Lightning Address (free)

Sign up at **[dashboard.blink.sv](https://dashboard.blink.sv)** — free, no credit card, instant.
Your address: `yourname@yourdomain.com`

Other wallets: [Wallet of Satoshi](https://walletofsatoshi.com) · [Phoenix](https://phoenix.acinq.co) · [Zeus](https://zeusln.app) · [Alby](https://getalby.com)

---

## Links

| Resource | URL |
|----------|-----|
| 📖 Docs (11 languages) | [l402kit.com/docs](https://l402kit.com/docs) |
| 📦 npm | [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) |
| 🐍 PyPI | [pypi.org/project/l402kit](https://pypi.org/project/l402kit) |
| 🦫 Go | [pkg.go.dev/github.com/shinydapps/l402-kit/go](https://pkg.go.dev/github.com/shinydapps/l402-kit/go) |
| 🦀 Rust | [crates.io/crates/l402kit](https://crates.io/crates/l402kit) |
| 🔌 VS Code | [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402) |
| ⚡ Lightning | shinydapps@blink.sv |
| 🐙 GitHub | [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit) |

---

<div align="center">

MIT — use freely, build freely.

**Bitcoin has no borders.**

<br/>

Built with ⚡ by [ShinyDapps](https://github.com/ShinyDapps)

<br/>

<a href="https://l402kit.com/docs">Docs</a> · <a href="https://l402kit.com/demo">Demo</a> · <a href="https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402">VS Code</a> · <a href="https://npmjs.com/package/l402-kit">npm</a>

</div>
