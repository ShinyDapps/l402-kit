# l402kit

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

[![PyPI](https://img.shields.io/pypi/v/l402kit)](https://pypi.org/project/l402kit)
[![npm](https://img.shields.io/npm/v/l402-kit)](https://npmjs.com/package/l402-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ShinyDapps/l402-kit/blob/main/LICENSE)

```bash
pip install l402kit
```

📖 **Docs / Documentação / Documentation:**

[🇺🇸 English](https://l402kit.com/docs) · [🇧🇷 Português](https://l402kit.com/docs/pt/introduction) · [🇪🇸 Español](https://l402kit.com/docs/es/introduction) · [🇨🇳 中文](https://l402kit.com/docs/zh/introduction) · [🇮🇳 हिंदी](https://l402kit.com/docs/hi/introduction) · [🇸🇦 العربية](https://l402kit.com/docs/ar/introduction) · [🇫🇷 Français](https://l402kit.com/docs/fr/introduction) · [🇩🇪 Deutsch](https://l402kit.com/docs/de/introduction) · [🇷🇺 Русский](https://l402kit.com/docs/ru/introduction) · [🇯🇵 日本語](https://l402kit.com/docs/ja/introduction) · [🇮🇹 Italiano](https://l402kit.com/docs/it/introduction)

---

## English

Add pay-per-call Bitcoin Lightning payments to any Python API. Works with FastAPI and Flask. No account. No bank. No chargebacks.

### How it works

```
Client calls your API
  → Returns 402 + Lightning invoice
  → Client pays (< 1 second)
  → Client sends cryptographic proof
  → SHA256(preimage) == paymentHash ✓
  → API responds 200 + data

Money flow (managed mode):
  Payment → ShinyDapps → 99.7% to your Lightning Address
                       → 0.3% fee to ShinyDapps
```

### FastAPI quickstart

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Try GET /premium"}

# Costs 100 sats (~$0.10) per call
@app.get("/premium")
@l402_required(
    price_sats=100,
    owner_lightning_address="you@blink.sv",  # your Lightning Address — receives 99.7%
)
async def premium(request: Request):
    return {"data": "Payment confirmed. Here is your data."}
```

### Flask quickstart

```python
from flask import Flask, jsonify
from l402kit import l402_required

app = Flask(__name__)

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="you@blink.sv")
def premium():
    return jsonify({"data": "Payment confirmed."})
```

### Test it

```bash
uvicorn main:app --reload

# First call — payment challenge
curl http://localhost:8000/premium
# → { "error": "Payment Required", "invoice": "lnbc1u...", "macaroon": "eyJ..." }

# Pay invoice with any Lightning wallet, then:
curl http://localhost:8000/premium \
  -H "Authorization: L402 <macaroon>:<preimage>"
# → { "data": "Payment confirmed." }
```

### Why not Stripe?

| | Stripe | l402kit |
|---|---|---|
| Minimum fee | $0.30 | < 1 sat (~$0.001) |
| Settlement | 2–7 days | **< 1 second** |
| Chargebacks | Yes | **Impossible** |
| Requires account | Yes | **No** |
| AI agent support | No | **Yes — native** |
| Countries blocked | ~50 | **0 — global** |

---

## Português

Adicione pagamentos por chamada via Bitcoin Lightning em qualquer API Python. Funciona com FastAPI e Flask. Sem conta. Sem banco. Sem chargeback.

### FastAPI — início rápido

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(
    price_sats=100,
    owner_lightning_address="você@blink.sv",  # recebe 99.7% de cada pagamento
)
async def premium(request: Request):
    return {"data": "Pagamento confirmado."}
```

### Flask — início rápido

```python
from flask import Flask, jsonify
from l402kit import l402_required

app = Flask(__name__)

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="você@blink.sv")
def premium():
    return jsonify({"data": "Pagamento confirmado."})
```

### Por que não Pix / Stripe?

| | Stripe | Pix | l402kit |
|---|---|---|---|
| Taxa mínima | R$1,50 | R$0,01 | **< 1 sat** |
| Liquidação | 2–7 dias | Instante | **< 1 segundo** |
| Chargeback | Sim | Não | **Impossível** |
| Funciona pra IA | Não | Não | **Sim** |
| Global | Não | Só Brasil | **Sim — 0 fronteiras** |

---

## Español

Agrega pagos por llamada en Bitcoin Lightning a cualquier API Python.

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="tu@blink.sv")
async def premium(request: Request):
    return {"data": "Pago confirmado."}
```

---

## Italiano

Aggiungi pagamenti pay-per-call in Bitcoin Lightning a qualsiasi API Python. Funziona con FastAPI e Flask.

### FastAPI — avvio rapido

```python
from fastapi import FastAPI, Request
from l402kit import l402_required

app = FastAPI()

@app.get("/premium")
@l402_required(
    price_sats=100,
    owner_lightning_address="tu@blink.sv",  # riceve il 99.7% di ogni pagamento
)
async def premium(request: Request):
    return {"data": "Pagamento confermato."}
```

### Flask — avvio rapido

```python
from flask import Flask, jsonify
from l402kit import l402_required

app = Flask(__name__)

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="tu@blink.sv")
def premium():
    return jsonify({"data": "Pagamento confermato."})
```

### Perché non Stripe?

| | Stripe | l402kit |
|---|---|---|
| Commissione minima | €0,25 | **< 1 sat** |
| Liquidazione | 2–7 giorni | **< 1 secondo** |
| Chargeback | Sì | **Impossibile** |
| Supporto agenti IA | No | **Sì** |
| Globale | No (~50 paesi bloccati) | **Sì — 0 frontiere** |

---

## Advanced mode — bring your own Lightning wallet

```python
import os
from fastapi import FastAPI, Request
from l402kit import l402_required, BlinkProvider

app = FastAPI()

lightning = BlinkProvider(
    api_key=os.environ["BLINK_API_KEY"],
    wallet_id=os.environ["BLINK_WALLET_ID"],
)

@app.get("/premium")
@l402_required(price_sats=100, lightning=lightning)
async def premium(request: Request):
    return {"data": "Payment confirmed."}
```

---

## Security

Every payment is cryptographically verified — impossible to fake:

```
SHA256(preimage) == paymentHash
```

- Anti-replay: each preimage works exactly once
- Expiry: tokens expire after 1 hour
- Open source: [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit)

---

## Get a free Lightning Address

Sign up at [dashboard.blink.sv](https://dashboard.blink.sv) — free, no credit card.
Your address: `yourname@blink.sv`

---

## Links

| | |
|---|---|
| Docs (11 languages) | [shinydapps.mintlify.app](https://l402kit.com/docs) |
| PyPI | [pypi.org/project/l402kit](https://pypi.org/project/l402kit) |
| npm (TypeScript) | [npmjs.com/package/l402-kit](https://npmjs.com/package/l402-kit) |
| GitHub | [github.com/ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit) |
| Creator | [github.com/ThiagoDataEngineer](https://github.com/ThiagoDataEngineer) |
| Lightning | shinydapps@blink.sv |

---

## License

MIT — use freely, build freely. Bitcoin has no borders.

<p align="center">Built with ⚡ by <a href="https://github.com/ShinyDapps">ShinyDapps</a></p>
