# l402-kit — Project Operations Guide

This file is read by Claude Code at the start of every session. It gives full context to manage this project without re-explaining everything.

---

## Owner

**Thiago Yoshiaki** — `thiagoyoshiaki@gmail.com` / `shinydapps@gmail.com`
GitHub: `ThiagoDataEngineer` | Org: `ShinyDapps`
Lightning: `shinydapps@blink.sv`

---

## What this project is

**l402-kit** — open-source L402 protocol middleware. TypeScript, Python, Go, Rust.
**VERITY** — autonomous AI agent built on l402-kit. Lives at `https://l402kit.com/api/verity`.

All credentials are in memory: `~/.claude/projects/c--Users-thiag-l402-kit/memory/credentials.md`

---

## Infrastructure

| Service | What | URL / ID |
|---|---|---|
| Cloudflare Workers | API + VERITY | l402kit-api worker |
| Cloudflare Pages | Landing site | wrangler.jsonc |
| Supabase | Database | urcqtpklpfyvizcgcsia |
| Blink | Lightning wallet (main) | shinydapps@blink.sv |
| Mintlify | Docs | docs.l402kit.com |
| GitHub | Code | ShinyDapps/l402-kit |

---

## Deploy commands

```powershell
# API Worker (VERITY + all endpoints)
# Token in memory: credentials.md → Cloudflare → API Token (Workers)
$env:CLOUDFLARE_API_TOKEN = "<see credentials.md>"
cd cloudflare
npx wrangler deploy --config wrangler.toml

# Landing site (static)
npx wrangler deploy --config ../wrangler.jsonc
```

Docs deploy automatically via Mintlify on git push to main.

---

## Active branches

| Branch | Purpose |
|---|---|
| `main` | Production |
| `feat/lawn-events` | LAW-N behavioral events + VERITY (pending merge after Peace validation) |

---

## VERITY — autonomous agent

**Live:** `https://l402kit.com/api/verity`
**Treasury:** `shinydapps@blink.sv`
**Agent ID:** `agent:shinydapps.verity`

### 11 services (preços dinâmicos — valores base)

| Service | Endpoint | Price | Key needed |
|---|---|---|---|
| Search | `/api/verity/search` | 500 sats | SERPER_API_KEY |
| Scrape | `/api/verity/scrape` | 500 sats | FIRECRAWL_API_KEY |
| BTC Price | `/api/verity/btc-price` | 100 sats | — |
| Summarize | `/api/verity/summarize` | 500 sats | ANTHROPIC_API_KEY |
| Sentiment | `/api/verity/sentiment` | 300 sats | ANTHROPIC_API_KEY |
| Domain Intel | `/api/verity/domain-intel` | 2,000 sats | — |
| Integration | `/api/verity/integration` | 200,000 sats | ANTHROPIC_API_KEY |
| World State | `/api/verity/worldstate` | 300 sats | — |
| Translate | `/api/verity/translate` | 500 sats | ANTHROPIC_API_KEY |
| Research | `/api/verity/research` | 2,000 sats | ANTHROPIC_API_KEY |
| Alpha | `/api/verity/alpha` | 5,000 sats | ANTHROPIC_API_KEY + SERPER_API_KEY |

### Add a new service
1. Create `cloudflare/src/verity/services/myservice.ts` (copy pattern from btcprice.ts)
2. Add to `cloudflare/src/verity/pricing.ts` DEFAULTS map
3. Add route to `cloudflare/src/verity/index.ts`
4. Deploy: `npx wrangler deploy --config wrangler.toml`

### Dynamic pricing
Runs every 30min via cron. +10% when demand > threshold, -10% when idle, never below floor.
Config: `cloudflare/src/verity/pricing.ts` → DEFAULTS map.

### Fiscal Agent
Runs daily at midnight UTC. Report stored in KV: `verity_fiscal:YYYY-MM-DD`.
Read latest: `wrangler kv key get "verity_fiscal:$(date +%Y-%m-%d)" --binding demo_preimages`

### Treasury alerts
`GET /api/verity/admin/alerts` (requer `x-dashboard-secret`)
Tipos: `budget_low` (≥80% do budget), `budget_exhausted`, `payment_failed`.
`DELETE /api/verity/admin/alerts` com `{ key }` para limpar.

### RADAR — inteligência autônoma
4 anéis ativos (buyers, partners, ecosystem, competitors). Cron a cada 30min.
Hot leads chegam com `outreach_draft` em `GET /api/verity/admin/radar`.
Earn-first gate: parceiro só ativa como consumidor L402 após VERITY ter receita.
Partner URL ativo: `verity_config:alpha_partner_url` no KV (aponta para `/api/verity/research`).

---

## Secrets (Cloudflare Worker)

Add/update a secret:
```powershell
$env:CLOUDFLARE_API_TOKEN = "<see credentials.md>"
cd cloudflare
echo "value" | npx wrangler secret put SECRET_NAME --config wrangler.toml
```

Current secrets: BLINK_API_KEY, BLINK_WALLET_ID, BLINK_API_KEY_DEMO, BLINK_WALLET_ID_DEMO,
BLINK_WEBHOOK_SECRET, OWNER_LIGHTNING_ADDRESS, SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_KEY, SPLIT_SECRET, DASHBOARD_SECRET, LAWN_HMAC_SECRET,
SERPER_API_KEY, FIRECRAWL_API_KEY, ANTHROPIC_API_KEY

---

## Publish packages

```powershell
# All tokens in memory: credentials.md

# npm (expires Jul 2026)
$env:NPM_TOKEN = "<npm token from credentials.md>"
npm publish

# PyPI
$env:TWINE_USERNAME = "__token__"
$env:TWINE_PASSWORD = "<pypi token from credentials.md>"
python -m twine upload dist/*

# VS Code extension
npx vsce publish --pat "<vscode PAT from credentials.md>"
```

---

## Docs structure

```
docs/
  introduction.mdx        — landing page
  quickstart.mdx          — 3-line start
  sdk/{ts,python,go,rust} — SDK references
  agent/
    quickstart.mdx        — agent SDK
    verity.mdx            — VERITY service reference ← NEW
    lawn-n.mdx            — LAW-N behavioral events ← NEW
    mcp.mdx               — MCP server
  examples/
    verity.mdx            — VERITY code examples ← NEW
    diagram-forge.mdx     — Diagram Forge example
  whitepaper.mdx          — public whitepaper v1.2
  whitepaper-extended.mdx — paid extended edition (100 sats)
```

Navigation config: `docs/mint.json`

---

## LAW-N / Peace (SAGEWORKS AI)

Ingest endpoint: `https://l402kit.com/api/lawn-events` (POST, HMAC-SHA256)
Secret: `LAWN_HMAC_SECRET` (in Cloudflare secrets)
Status: implemented on `feat/lawn-events`, awaiting Peace validation before merging to main.

---

## Key decisions (don't undo without discussion)

- **LNURL for invoice creation** — VERITY uses public LNURL (shinydapps@blink.sv), not Blink API directly. No extra secrets needed.
- **feat/lawn-events not merged** — waiting Peace to validate schema against real LAW-N ingest before v1.9.0.
- **0.3% fee** — ManagedProvider fee. Sovereign mode is always 0%.
- **Dynamic pricing** — floor protects downside (Saylor), surge captures demand (Ulrich/Uber).
- **Fiscal Agent** — daily KV report in sats + BRL. Compliance from day 1.
