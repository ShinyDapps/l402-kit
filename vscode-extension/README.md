# ShinyDapps ⚡ Lightning Payments

**Monitor your Bitcoin Lightning API earnings in real-time — right inside VS Code.**

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ShinyDapps.shinydapps-l402)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402)
[![npm](https://img.shields.io/npm/v/l402-kit)](https://npmjs.com/package/l402-kit)
[![PyPI](https://img.shields.io/pypi/v/l402kit)](https://pypi.org/project/l402kit)
[![GitHub Stars](https://img.shields.io/github/stars/ShinyDapps/l402-kit)](https://github.com/ShinyDapps/l402-kit)

---

## What is this?

This extension is part of the **l402-kit** ecosystem — the simplest way to add Bitcoin Lightning pay-per-call to any API.

| | |
|---|---|
| **npm** (TypeScript/Node) | `npm install l402-kit` |
| **PyPI** (Python/FastAPI/Flask) | `pip install l402kit` |
| **Docs** (10 languages) | [shinydapps.mintlify.app](https://shinydapps.mintlify.app) |
| **GitHub** | [ShinyDapps/l402-kit](https://github.com/ShinyDapps/l402-kit) |

---

## Features

⚡ **Live sats counter** in the status bar — see earnings update every 30 seconds

📊 **Payment dashboard** — click the sidebar icon to see full payment history

🌍 **Works with any stack** — TypeScript, Python, FastAPI, Flask, Express

🔐 **Cryptographic verification** — SHA256 proof of payment, no chargebacks

🤖 **AI agent native** — machines paying machines, no human needed

---

## How to use

### 1. Add l402-kit to your API

**TypeScript:**
```bash
npm install l402-kit
```
```typescript
import { l402 } from "l402-kit";

app.get("/premium", l402({
  priceSats: 100,
  ownerLightningAddress: "you@blink.sv",
}), handler);
```

**Python:**
```bash
pip install l402kit
```
```python
from l402kit import l402_required

@app.get("/premium")
@l402_required(price_sats=100, owner_lightning_address="you@blink.sv")
async def premium(request: Request):
    return {"data": "paid!"}
```

### 2. Configure the extension

Open Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

Or set in settings:
```json
{
  "shinydapps.lightningAddress": "you@blink.sv",
  "shinydapps.supabaseUrl": "https://your-project.supabase.co",
  "shinydapps.supabaseKey": "your-anon-key"
}
```

### 3. Watch the sats come in

The **⚡ sidebar icon** shows your payment history.
The **status bar** at the bottom shows total sats received.

---

## The full ecosystem

```
l402-kit (npm + PyPI)     ← add to your API
    │
    ├── TypeScript / Express
    ├── Python / FastAPI / Flask
    │
    └── ShinyDapps backend
            │
            ├── Creates Lightning invoices
            ├── Sends 99.7% to your Lightning Address
            ├── Keeps 0.3% fee
            └── Logs to Supabase
                    │
                    └── This VS Code extension reads here ← YOU ARE HERE
```

---

## Why Bitcoin Lightning?

| | Stripe | **l402-kit** |
|---|---|---|
| Minimum fee | $0.30 | **< 1 sat** |
| Settlement | 2–7 days | **< 1 second** |
| Chargebacks | Yes | **Impossible** |
| AI agents | No | **Yes** |
| Countries | ~50 blocked | **0 blocked** |

---

## Links

🇺🇸 [English Docs](https://shinydapps.mintlify.app) ·
🇧🇷 [Português](https://shinydapps.mintlify.app/pt/introduction) ·
🇪🇸 [Español](https://shinydapps.mintlify.app/es/introduction) ·
🇨🇳 [中文](https://shinydapps.mintlify.app/zh/introduction) ·
🇮🇳 [हिंदी](https://shinydapps.mintlify.app/hi/introduction) ·
🇸🇦 [العربية](https://shinydapps.mintlify.app/ar/introduction) ·
🇫🇷 [Français](https://shinydapps.mintlify.app/fr/introduction) ·
🇩🇪 [Deutsch](https://shinydapps.mintlify.app/de/introduction) ·
🇷🇺 [Русский](https://shinydapps.mintlify.app/ru/introduction) ·
🇯🇵 [日本語](https://shinydapps.mintlify.app/ja/introduction)

---

Built with ⚡ by [ShinyDapps](https://github.com/ShinyDapps) · MIT License · Bitcoin has no borders.
