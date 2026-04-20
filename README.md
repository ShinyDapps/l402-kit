# l402-kit

**Monetize qualquer API com Bitcoin Lightning em 3 linhas de código.**

[![npm](https://img.shields.io/npm/v/l402-kit)](https://npmjs.com/package/l402-kit)
[![PyPI](https://img.shields.io/pypi/v/l402kit)](https://pypi.org/project/l402kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/ShinyDapps/l402-kit)](https://github.com/ShinyDapps/l402-kit)

```bash
npm install l402-kit    # TypeScript / Node.js / Express
pip install l402kit     # Python / FastAPI / Flask
```

> **Docs:** [shinydapps.mintlify.app](https://shinydapps.mintlify.app) · **npm:** [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) · **PyPI:** [pypi.org/project/l402kit](https://pypi.org/project/l402kit)

---

## O que é isso?

l402-kit é um middleware open-source que implementa o protocolo **L402** — um padrão aberto para pagamentos por chamada de API usando Bitcoin Lightning Network.

Você adiciona 3 linhas de código. Quem chama sua API paga em sats. Você recebe em segundos. Sem banco. Sem intermediário. Sem chargeback.

**Funciona em qualquer país. Funciona para humanos e para agentes de IA.**

---

## Como funciona — o fluxo completo

```
┌─────────────────────────────────────────────────────────────────┐
│                     MODO GERENCIADO (recomendado)               │
│                                                                 │
│  Cliente / Agente IA                                            │
│         │                                                       │
│         │ 1. GET /sua-api                                       │
│         ▼                                                       │
│  Sua API (l402-kit)  ──── 2. Cria invoice ───► ShinyDapps API  │
│         │                                       (Blink wallet)  │
│         │ 3. Retorna: 402 + invoice BOLT11                      │
│         ▼                                                       │
│  Cliente paga ──────────────────────────────► Lightning Network │
│         │                    (< 1 segundo)                      │
│         │ 4. Envia preimage como prova                          │
│         ▼                                                       │
│  Sua API verifica: SHA256(preimage) == hash ✓                   │
│         │                                                       │
│         │ 5. Split automático via ShinyDapps:                   │
│         │    → 99.7% ──────────────────────► Seu Lightning Addr │
│         │    → 0.3%  ──────────────────────► ShinyDapps (taxa)  │
│         │                                                       │
│         │ 6. Sua API responde: 200 OK + dados                   │
│         ▼                                                       │
│  Cliente recebe o conteúdo                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Transparência total:** ShinyDapps recebe o pagamento, envia **99.7%** para seu Lightning Address imediatamente. A taxa de **0.3%** mantém o projeto vivo. Você pode auditar cada linha em `src/split.ts` e `backend/api/split.ts`.

---

## Quickstart — TypeScript (modo gerenciado)

### Sem conta Lightning. Sem configuração. Funciona.

```typescript
import express from "express";
import { l402 } from "l402-kit";

const app = express();

// Rota gratuita
app.get("/", (_req, res) => {
  res.json({ message: "Olá! Tente GET /premium" });
});

// Custa 100 sats (~R$ 0,05) por chamada
app.get("/premium", l402({
  priceSats: 100,
  ownerLightningAddress: "você@blink.sv", // seu endereço Lightning — recebe 99.7%
}), (_req, res) => {
  res.json({ data: "Pagamento confirmado. Aqui está seu conteúdo exclusivo." });
});

app.listen(3000);
```

Isso é tudo. Não precisa de conta Blink, não precisa de carteira — só um Lightning Address.

---

## Quickstart — Python (modo gerenciado)

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Tente GET /premium"}

@app.get("/premium")
@l402_required(
    price_sats=100,
    owner_lightning_address="você@blink.sv",
)
async def premium(request: Request):
    return {"data": "Pagamento confirmado."}
```

---

## Modo avançado — traga sua própria carteira

Se você quiser controle total e gerenciar seus próprios nós Lightning:

```typescript
import { l402, BlinkProvider } from "l402-kit";

const lightning = new BlinkProvider(
  process.env.BLINK_API_KEY!,
  process.env.BLINK_WALLET_ID!,
);

app.get("/premium", l402({ priceSats: 100, lightning }), handler);
```

Providers disponíveis: `BlinkProvider`, `OpenNodeProvider`, `LNbitsProvider`

Ou implemente a interface `LightningProvider` para qualquer backend:

```typescript
import type { LightningProvider } from "l402-kit";

class MeuProvider implements LightningProvider {
  async createInvoice(amountSats: number) { /* ... */ }
  async checkPayment(paymentHash: string) { /* ... */ }
}
```

---

## Fluxo de pagamento (sequência técnica)

```
Cliente                  Sua API               Lightning Network
   │                        │                         │
   │── GET /premium ────────►│                         │
   │                        │── cria invoice ─────────►│
   │◄── 402 + invoice ──────│◄── BOLT11 ──────────────│
   │                        │                         │
   │── paga invoice ──────────────────────────────────►│
   │◄── preimage ────────────────────────────────────── │
   │                        │                         │
   │── GET /premium ────────►│                         │
   │   Authorization:        │── SHA256(preimage)       │
   │   L402 <mac>:<pre>      │   == paymentHash ✓       │
   │                        │                         │
   │◄── 200 OK + dados ─────│                         │
```

---

## Por que não Stripe / PayPal / Pix?

| | Stripe | PayPal | Pix | **l402-kit** |
|---|---|---|---|---|
| Taxa mínima | **$0,30** | **$0,30** | R$ 0,01 | **< 1 sat** |
| Liquidação | 2–7 dias | 3–5 dias | Instante | **< 1 segundo** |
| Chargeback | Sim | Sim | Não | **Impossível** |
| Requer conta | Sim | Sim | Sim | **Não** |
| Funciona pra IA | Não | Não | Não | **Sim, nativamente** |
| Países bloqueados | ~50 | ~60 | Só Brasil | **0 — global** |
| Código auditável | Não | Não | Não | **Sim, open source** |
| Censurável | Sim | Sim | Sim | **Não** |

Bitcoin não pede permissão.

---

## Segurança

Cada pagamento é verificado criptograficamente:

```
1. Sua API cria invoice com paymentHash = SHA256(preimage)
2. Cliente paga — Lightning Network libera o preimage
3. Sua API verifica: SHA256(preimage) == paymentHash
4. Preimage marcado como usado — impossível reutilizar
```

- **SHA256** — prova matemática impossível de forjar
- **Anti-replay** — cada preimage só vale uma vez
- **Expiração** — tokens expiram em 1 hora
- **Open source** — audite tudo em `src/verify.ts` e `src/replay.ts`

---

## Obter um Lightning Address gratuito

Você precisa de um Lightning Address (ex: `você@blink.sv`) para receber.

**Blink (recomendado — gratuito):**
1. Baixe o app Blink ou acesse [dashboard.blink.sv](https://dashboard.blink.sv)
2. Crie conta com email
3. Seu endereço será `seunome@blink.sv`

**Outras opções:** Wallet of Satoshi, Phoenix, Zeus, Alby

---

## Links

| | |
|---|---|
| Docs completa | [shinydapps.mintlify.app](https://shinydapps.mintlify.app) |
| npm | [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) |
| PyPI | [pypi.org/project/l402kit](https://pypi.org/project/l402kit) |
| GitHub | [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit) |
| Criador | [github.com/ThiagoDataEngineer](https://github.com/ThiagoDataEngineer) |
| Backend API | [shinydapps-api.vercel.app](https://shinydapps-api.vercel.app) |
| Lightning | shinydapps@blink.sv |

---

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md). PRs são bem-vindos.

---

## Licença

MIT — use livremente, construa livremente.

---

<p align="center">
  Construído com ⚡ por <a href="https://github.com/ShinyDapps">ShinyDapps</a> · <a href="https://github.com/ThiagoDataEngineer">Thiago Yoshiaki</a>
  <br/>
  Bitcoin tem fronteiras? Não.
</p>
