# l402-kit — Flow of Value

## How money moves through the protocol

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   AI AGENT / DEV / APP                                         │
│   "I need premium data"                                        │
│                                                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ GET /api/premium
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              API WITH l402-kit MIDDLEWARE                       │
│                                                                 │
│   app.use('/api', l402({ priceSats: 100, lightning }))         │
│                                                                 │
│   → HTTP 402 + BOLT11 invoice                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 100 sats (~$0.10)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              LIGHTNING NETWORK                                  │
│              settles in < 1 second                             │
│              no intermediary, no chargeback                    │
└──────────┬──────────────────────────────────────────────────────┘
           │                         │
     99.7 sats                    0.3 sats
     to API owner              to l402-kit
           │                         │
           ▼                         ▼
  shinydapps@blink.sv        Thiago's wallet
```

---

## The scale math — why this changes everything

```
SCENARIO 1 — Small API developer
  1,000 calls/day × 100 sats = 100,000 sats/day
  × 0.3% fee = 300 sats/day to l402-kit (~$0.30)
  × 1,000 developers = $300/day = $9,000/month

SCENARIO 2 — Mid-size AI platform
  100,000 calls/day × 50 sats = 5,000,000 sats/day
  × 0.3% fee = 15,000 sats/day to l402-kit (~$15)
  × 100 platforms = $1,500/day = $45,000/month

SCENARIO 3 — Renato 38 moves $100M through Bitcoin
  imagine APIs charging 0.01% per routing/signing call
  $100,000,000 × 0.0001 = $10,000 per transaction
  × 0.3% to l402-kit = $30 per transaction
  × 1,000 transactions = $30,000
```

---

## Why l402 beats Stripe for this

```
                    STRIPE          LIGHTNING L402
Minimum fee:        $0.30           0.001 sats (~$0.000001)
Settlement:         2-3 days        < 1 second
Chargebacks:        yes             impossible
Requires account:   yes             no
Works for AI agents: no             YES — native
Countries blocked:  ~50             0
```

---

## The infrastructure play

```
l402-kit is to Lightning
what Stripe.js is to Visa/Mastercard

Every dollar that moves through APIs
using l402-kit generates a fee.

Today:   100 devs,    $500/month
Month 6: 1,000 devs,  $15,000/month
Year 2:  10,000 devs, $150,000/month
Year 3:  100,000 devs → acquisition target
```
