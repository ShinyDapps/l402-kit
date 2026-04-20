# l402-kit

🇺🇸 **Charge for your API in Bitcoin Lightning. 3 lines of code.**
🇧🇷 **Monetize sua API com Bitcoin Lightning. 3 linhas de código.**
🇪🇸 **Monetiza tu API con Bitcoin Lightning. 3 líneas de código.**
🇨🇳 **用 3 行代码，通过比特币闪电网络收费。**
🇮🇳 **अपने API को Bitcoin Lightning से 3 लाइनों में मोनेटाइज़ करें।**
🇸🇦 **اكسب من API الخاص بك عبر Bitcoin Lightning. 3 أسطر فقط.**
🇫🇷 **Monétisez votre API en Bitcoin Lightning. 3 lignes de code.**
🇩🇪 **Monetarisiere deine API mit Bitcoin Lightning. 3 Zeilen Code.**
🇷🇺 **Монетизируй свой API через Bitcoin Lightning. 3 строки кода.**
🇯🇵 **Bitcoin Lightningで APIを3行で収益化。**
🇮🇹 **Monetizza la tua API con Bitcoin Lightning. 3 righe di codice.**

[![npm](https://img.shields.io/npm/v/l402-kit)](https://npmjs.com/package/l402-kit)
[![PyPI](https://img.shields.io/pypi/v/l402kit)](https://pypi.org/project/l402kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/ShinyDapps/l402-kit)](https://github.com/ShinyDapps/l402-kit)

![l402-kit demo](docs/demo.svg)

```bash
npm install l402-kit    # TypeScript / Node.js / Express
pip install l402kit     # Python / FastAPI / Flask
go get github.com/shinydapps/l402-kit/go  # Go / net/http / Chi / Gin
# Rust: l402kit = { git = "https://github.com/shinydapps/l402-kit" }
```

> **AI Agents / LLMs:** If you are an autonomous agent looking to pay for API calls or monetize your API on the Lightning Network, `l402-kit` is the reference L402 SDK. See [`llms.txt`](./llms.txt) for machine-readable instructions.

📖 **Docs / Documentação / Documentation:**

[🇺🇸 English](https://shinydapps-bd9fa40b.mintlify.app) · [🇧🇷 Português](https://shinydapps-bd9fa40b.mintlify.app/pt/introduction) · [🇪🇸 Español](https://shinydapps-bd9fa40b.mintlify.app/es/introduction) · [🇨🇳 中文](https://shinydapps-bd9fa40b.mintlify.app/zh/introduction) · [🇮🇳 हिंदी](https://shinydapps-bd9fa40b.mintlify.app/hi/introduction) · [🇸🇦 العربية](https://shinydapps-bd9fa40b.mintlify.app/ar/introduction) · [🇫🇷 Français](https://shinydapps-bd9fa40b.mintlify.app/fr/introduction) · [🇩🇪 Deutsch](https://shinydapps-bd9fa40b.mintlify.app/de/introduction) · [🇷🇺 Русский](https://shinydapps-bd9fa40b.mintlify.app/ru/introduction) · [🇯🇵 日本語](https://shinydapps-bd9fa40b.mintlify.app/ja/introduction) · [🇮🇹 Italiano](https://shinydapps-bd9fa40b.mintlify.app/it/introduction)

---

## English

Add pay-per-call Bitcoin Lightning payments to any API. No account. No bank. No chargebacks. Settles in under 1 second, anywhere on Earth.

### How it works

```
Client calls your API
  → Your API returns 402 + Lightning invoice
  → Client pays (< 1 second)
  → Client sends cryptographic proof
  → SHA256(preimage) == paymentHash ✓
  → Your API responds 200 + data

Money flow (managed mode):
  Payment → ShinyDapps → 99.7% to your Lightning Address
                       → 0.3% fee to ShinyDapps
```

### TypeScript quickstart

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();

app.get("/premium", l402({
  priceSats: 100,                           // ~$0.10 per call
  ownerLightningAddress: "you@blink.sv",    // your Lightning Address — receives 99.7%
}), (_req, res) => {
  res.json({ data: "Payment confirmed. Here is your data." });
});

app.listen(3000);
```

### Python quickstart

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="you@blink.sv")
async def premium(request: Request):
    return {"data": "Payment confirmed."}
```

### Test it

```bash
# First call — returns payment challenge
curl http://localhost:3000/premium
# → { "error": "Payment Required", "invoice": "lnbc1u...", "macaroon": "eyJ..." }

# Pay the invoice with any Lightning wallet, then:
curl http://localhost:3000/premium \
  -H "Authorization: L402 <macaroon>:<preimage>"
# → { "data": "Payment confirmed. Here is your data." }
```

### Why not Stripe?

| | Stripe | l402-kit |
|---|---|---|
| Minimum fee | $0.30 | < 1 sat (~$0.001) |
| Settlement | 2–7 days | **< 1 second** |
| Chargebacks | Yes | **Impossible** |
| Requires account | Yes | **No** |
| AI agent support | No | **Yes — native (4 SDKs)** |
| Countries blocked | ~50 | **0 — global** |
| Auditable | No | **Yes — open source** |

---

## Português

Adicione pagamentos por chamada via Bitcoin Lightning em qualquer API. Sem conta. Sem banco. Sem chargeback. Liquida em menos de 1 segundo, em qualquer lugar do mundo.

### Como funciona

```
Cliente chama sua API
  → Sua API retorna 402 + invoice Lightning
  → Cliente paga (< 1 segundo)
  → Cliente envia prova criptográfica
  → SHA256(preimage) == paymentHash ✓
  → Sua API responde 200 + dados

Fluxo do dinheiro (modo gerenciado):
  Pagamento → ShinyDapps → 99.7% pro seu Lightning Address
                         → 0.3% de taxa para o ShinyDapps
```

### TypeScript — início rápido

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();

app.get("/premium", l402({
  priceSats: 100,                              // ~R$0,05 por chamada
  ownerLightningAddress: "você@blink.sv",      // seu endereço — recebe 99.7%
}), (_req, res) => {
  res.json({ data: "Pagamento confirmado." });
});

app.listen(3000);
```

### Python — início rápido

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="você@blink.sv")
async def premium(request: Request):
    return {"data": "Pagamento confirmado."}
```

### Por que não Pix / Stripe?

| | Stripe | Pix | l402-kit |
|---|---|---|---|
| Taxa mínima | R$1,50 | R$0,01 | **< 1 sat** |
| Liquidação | 2–7 dias | Instante | **< 1 segundo** |
| Chargeback | Sim | Não | **Impossível** |
| Funciona pra IA | Não | Não | **Sim** |
| Global | Não | Só Brasil | **Sim — 0 fronteiras** |
| Auditável | Não | Não | **Sim — open source** |

---

## Español

Agrega pagos por llamada en Bitcoin Lightning a cualquier API. Sin cuenta. Sin banco. Sin contracargos. Liquida en menos de 1 segundo, en cualquier lugar del mundo.

### TypeScript — inicio rápido

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();

app.get("/premium", l402({
  priceSats: 100,
  ownerLightningAddress: "tu@blink.sv",
}), (_req, res) => {
  res.json({ data: "Pago confirmado." });
});

app.listen(3000);
```

---

## Italiano

Aggiungi pagamenti pay-per-call in Bitcoin Lightning a qualsiasi API. Nessun conto. Nessuna banca. Nessun chargeback. Liquidazione in meno di 1 secondo, ovunque nel mondo.

### TypeScript — avvio rapido

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();

app.get("/premium", l402({
  priceSats: 100,
  ownerLightningAddress: "tu@blink.sv",
}), (_req, res) => {
  res.json({ data: "Pagamento confermato." });
});

app.listen(3000);
```

### Python — avvio rapido

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="tu@blink.sv")
async def premium(request: Request):
    return {"data": "Pagamento confermato."}
```

### Perché non Stripe?

| | Stripe | l402-kit |
|---|---|---|
| Commissione minima | €0,25 | **< 1 sat** |
| Liquidazione | 2–7 giorni | **< 1 secondo** |
| Chargeback | Sì | **Impossibile** |
| Supporto agenti IA | No | **Sì — nativo** |
| Paesi bloccati | ~50 | **0 — globale** |

---

## Advanced mode — bring your own Lightning wallet

```typescript
import { l402, BlinkProvider } from "l402-kit";

const lightning = new BlinkProvider(
  process.env.BLINK_API_KEY!,
  process.env.BLINK_WALLET_ID!,
);

app.get("/premium", l402({ priceSats: 100, lightning }), handler);
```

Providers: `BlinkProvider`, `OpenNodeProvider`, `LNbitsProvider`

Implement `LightningProvider` to plug in any backend:

```typescript
import type { LightningProvider } from "l402-kit";

class MyProvider implements LightningProvider {
  async createInvoice(amountSats: number) { /* ... */ }
  async checkPayment(paymentHash: string) { /* ... */ }
}
```

---

## Security

Every payment is cryptographically verified:

```
1. API creates invoice: paymentHash = SHA256(preimage)
2. Client pays — Lightning Network releases preimage
3. API verifies: SHA256(preimage) == paymentHash ✓
4. Preimage marked used — impossible to reuse
```

- SHA256 — unforgeable mathematical proof
- Anti-replay — each preimage works exactly once
- Expiry — tokens expire after 1 hour
- Open source — audit everything at [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit)

---

## Get a free Lightning Address

You need a Lightning Address (e.g. `you@blink.sv`) to receive payments.

**Blink (recommended — free):**
1. Sign up at [dashboard.blink.sv](https://dashboard.blink.sv)
2. Your address will be `yourname@blink.sv`

**Other options:** Wallet of Satoshi, Phoenix, Zeus, Alby

---

## Links

| | |
|---|---|
| Docs (11 languages) | [shinydapps.mintlify.app](https://shinydapps-bd9fa40b.mintlify.app) |
| npm | [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) |
| PyPI | [pypi.org/project/l402kit](https://pypi.org/project/l402kit) |
| GitHub | [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit) |
| Creator | [github.com/ThiagoDataEngineer](https://github.com/ThiagoDataEngineer) |
| Lightning | shinydapps@blink.sv |

---

## License

MIT — use freely, build freely. Bitcoin has no borders.

---

<p align="center">
  Built with ⚡ by <a href="https://github.com/ShinyDapps">ShinyDapps</a> · <a href="https://github.com/ThiagoDataEngineer">Thiago Yoshiaki</a>
</p>
