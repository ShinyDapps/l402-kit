# Contributing to l402-kit

Welcome. If you're reading this, you want to help build the payment infrastructure for the internet of value. Let's make it simple.

## Setup in 3 minutes

```bash
git clone https://github.com/shinydapps/l402-kit
cd l402-kit
npm install
cp .env.example .env   # fill in your Blink/OpenNode key
npm run lint           # must pass before any PR
```

## Project structure

```
src/                   # TypeScript — the npm package
  middleware.ts        # the Express middleware (heart of the kit)
  verify.ts            # SHA256 cryptographic verification
  replay.ts            # anti-replay protection
  providers/           # Lightning backends (Blink, OpenNode, LNbits)
  types.ts             # TypeScript interfaces

python/l402kit/        # Python — FastAPI/Flask SDK
  middleware.py        # decorator @l402_required
  providers/           # same providers, Python

go/                    # Go — net/http / Chi / Gin SDK
  l402kit.go           # middleware
  middleware.go        # handler wrapper
  verify.go            # SHA256 verification

rust/src/              # Rust — axum SDK
  middleware.rs        # tower Layer
  verify.rs            # SHA256 verification
  types.rs             # shared types

examples/              # runnable examples (keep them minimal)
supabase/schema.sql    # payment logging schema
vscode-extension/      # VS Code dashboard — real-time sats
```

## Rules (short)

1. **Tests must pass** — `npm run lint` green before PR
2. **No credentials in code** — ever
3. **New provider?** — implement `LightningProvider` interface, add to `providers/`
4. **New language SDK?** — create `[language]/` folder, same structure

## Adding a new Lightning provider

```typescript
// src/providers/myprovider.ts
import type { Invoice, LightningProvider } from "../types";

export class MyProvider implements LightningProvider {
  async createInvoice(amountSats: number): Promise<Invoice> { ... }
  async checkPayment(paymentHash: string): Promise<boolean> { ... }
}
```

Export it in `src/providers/index.ts` and you're done.

## Questions?

Open an issue or find us on Twitter/X — we respond fast.
