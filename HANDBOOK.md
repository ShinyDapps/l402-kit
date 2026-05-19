# l402-kit Handbook

> **Goal:** end-to-end operational manual for humans and AI agents. Every flow, every tool, every provider. If you can't answer your question from this file in 5 minutes, the gap is a bug — fix it here.

> **How to read this:** sequential is best the first time. After that, grep + table of contents.

> **Companion files:**
> - [`README.md`](README.md) — public landing for visitors
> - [`ARCHITECTURE.md`](ARCHITECTURE.md) — "where is what" map (60s read)
> - [`CLAUDE.md`](CLAUDE.md) — operational tldr for Claude Code
> - [`STATUS.md`](STATUS.md) — current live state (refreshed per session)
> - [`SECURITY.md`](SECURITY.md) — security posture + reporting
> - [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev workflow

---

## 0 · TL;DR

**l402-kit** is open-source middleware that lets any HTTP API charge per-call in Bitcoin sats over Lightning Network. It implements [L402](https://github.com/lightninglabs/L402) (HTTP 402 + BOLT11 invoice + macaroon proof). Four official SDKs (TypeScript, Python, Rust, Go) at version parity.

**VERITY** is the autonomous agent we built on top — 11 paid services, self-pricing, self-marketing (RADAR), self-auditing (Fiscal Agent). Lives at `https://l402kit.com/api/verity`.

**Stack:** Cloudflare Workers (API + landing) + Supabase (Postgres for state) + Blink (Lightning wallet) + Mintlify (docs) + GitHub Actions (release matrix).

**Money flow:** caller pays sats → Blink wallet → if managed, 0.3% fee retained + 99.7% routed to owner Lightning Address → settled on Lightning Network in ~500ms.

**Current state:** distribution complete (4 SDKs cross-lang 1.10.0, MCP server live, listings on Smithery / Glama / 402index). **Revenue: 0 sats.** Bottleneck is conversion, not product.

---

## 1 · Who runs this

| Role | Identity |
|---|---|
| Org / repo owner | `ShinyDapps` (GitHub org) |
| Primary maintainer | `ThiagoDataEngineer` (personal GitHub) |
| Operator email | `shinydapps@gmail.com` (commercial) / `thiagoyoshiaki@gmail.com` (personal) |
| Lightning Address (treasury) | `shinydapps@blink.sv` |
| Discord / Telegram handle | `@shinydapps` (when applicable) |

VERITY operates under agent identity `agent:shinydapps.verity`, treasury same as above.

---

## 2 · Providers & accounts (the supply chain)

### Compute & infrastructure

| Provider | What | Account | Where credentials live |
|---|---|---|---|
| **Cloudflare** | Workers runtime, KV (state), DNS (l402kit.com) | `08a1be0a8add759a13042f63b8a41b9a` | `~/.claude/.../memory/credentials.md` § Cloudflare |
| **Supabase** | Postgres (payments, pro_access, lnurl_challenges, audit), Edge Functions (Blink webhook) | project `urcqtpklpfyvizcgcsia` | § Supabase |
| **GitHub** | Code host, Actions CI/CD, release matrix | org `ShinyDapps` | § GitHub PAT (with `workflow` scope) |

### Lightning & payments

| Provider | Role |
|---|---|
| **Blink** (`shinydapps@blink.sv`) | Custodial Lightning wallet — receives all managed-mode payments. Default treasury. |
| **Alby** | Alternative provider (`AlbyWallet`, `AlbyProvider`). Optional, supported in SDK. |
| **LNbits, OpenNode, BTCPay Server** | Additional provider implementations in `src/providers/` for sovereign mode users. |

Lightning Address resolves via LNURL-pay. We don't talk to Blink's GraphQL directly for invoice creation in production — public LNURL is the contract.

### Distribution & registries

| Registry | What |
|---|---|
| **npmjs.com** | `l402-kit` (TS SDK + MCP bin) |
| **PyPI** | `l402kit` (Python SDK) |
| **crates.io** | `l402kit` (Rust SDK) |
| **pkg.go.dev** | `github.com/shinydapps/l402-kit/go` |
| **VS Code Marketplace** | `ShinyDapps.shinydapps-l402` extension |
| **Glama** | MCP server listing — `glama.ai/mcp/servers/ShinyDapps/l402-kit` |
| **Smithery** | MCP hosted runtime — `smithery.ai/server/ShinyDapps/l402-kit` |
| **402index.io** | L402 API directory (11 VERITY services registered) |
| **MCP Registry** | `registry.modelcontextprotocol.io` — `server.json` at repo root |

### Content & docs

| Provider | Role |
|---|---|
| **Mintlify** | docs.l402kit.com — 11 locales, auto-sync on git push to `main` |

### Communications

| Provider | Role |
|---|---|
| **Resend** | Transactional email (split failure alerts, dashboard summaries) |
| **Serper.dev** | Google Search results for VERITY RADAR + `verity_search` service |
| **Firecrawl** | Webpage extraction for `verity_scrape` service |
| **Anthropic** | LLM for `verity_summarize`, `verity_sentiment`, `verity_translate`, `verity_research`, `verity_alpha`, `verity_integration` |
| **Brave Search API** (optional) | Free tier fallback for search (2000/mo) |
| **Groq** (optional) | Free LLM tier fallback (14400/day) |

### Partners (negotiation, no integration yet)

| Partner | Status |
|---|---|
| **SAGEWORKS AI / Peace** (LAW-N) | Schema aligned (CloudEvents 1.0 + HMAC-SHA256). Awaiting Peace to validate against real LAW-N ingest. Branch `feat/lawn-events`. |
| **Alby (Roland, Moritz)** | Reposicionados como protocol layer for them (Alby = adapter to l402-kit, not competitor). Open conversations, no commitment. |
| **x402 / Zeke** | Posted comment on x402 PR #2262 v3 ("receive without committing"). Zeke is operator with own product (`zekebuilds-lab` Smithery + `@powforge/l402-verify` npm). No alliance signed. |
| **Lightning Labs** (spec owner) | Submitted PR `lightninglabs/L402#25`. Pending review. Tier-1 distribution target. |

---

## 3 · Money flow (sats path)

```
┌──────┐    HTTP 402 + invoice    ┌─────────────────┐
│Agent │  ◀────────────────────── │ Your API        │
│      │                          │ (l402-kit       │
│      │    pays BOLT11 via       │  middleware)    │
│      │    Lightning Network     │                 │
│      │  ──────────────────────▶ │  → ManagedProv  │
│      │                          │     (Blink)     │
│      │    HTTP 200 + data       │  → split        │
│      │  ◀────────────────────── │     0.3% / 99.7%│
└──────┘    after preimage proof  └─────────────────┘
```

### Managed mode (default for most users)

1. Caller hits `/api/data` → HTTP 402 + BOLT11 invoice (issued by `shinydapps@blink.sv`) + macaroon
2. Caller pays the invoice over Lightning Network
3. Caller resends with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies `SHA256(preimage) == macaroon.hash` in constant time
5. **Split:** the sats sit in `shinydapps@blink.sv`. A scheduled job (`split.ts` + Supabase webhook + `pay-invoice` edge function) routes 99.7% to the owner's configured Lightning Address. 0.3% retained as platform fee.
6. **Failure handling:** 3 retries on the split. On final failure, Resend sends email to operator + admin alert recorded in KV.

### Sovereign mode

Same flow without the split — the developer brings their own Lightning provider, payments go directly to their node/wallet, 0% fee.

### COGS map (VERITY only)

| Service | Sats charged | COGS (sats) | Net margin |
|---|---|---|---|
| BTC Price | 100 | 0 | 100% |
| World State | 300 | 0 | 100% |
| Sentiment | 300 | 1 | 99.7% |
| Search | 500 | 50 | 90% |
| Scrape | 500 | 20 | 96% |
| Summarize | 500 | 1 | 99.8% |
| Translate | 500 | 1 | 99.8% |
| Domain Intel | 2,000 | 0 | 100% |
| Research | 2,000 | varies | ~95% |
| Alpha | 5,000 | varies | ~94% |
| Integration | 200,000 | 1 | 99.9995% |

Dynamic pricing (`cloudflare/src/verity/pricing.ts`): +10% surge after threshold, -10% idle decay, never below `COGS + 50 sats` floor (Saylor invariant).

---

## 4 · Code surface (every public route)

### `l402kit.com/api/*` — l402kit-api Worker

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/invoice` | POST | Create Lightning invoice via Blink LNURL | rate-limited (20/IP/min, 200 global/min) |
| `/api/verify` | POST | Verify L402 token server-side | none |
| `/api/stats` | GET | Email stats + waitlist | `x-dashboard-secret` |
| `/api/dev-stats` | GET | Test counts, badge data | none |
| `/api/dashboard/:address` | GET | Split history for owner | `x-dashboard-secret` |
| `/api/blink-webhook` | POST | Blink payment confirmations | Svix sig |
| `/api/lawn-events` | POST | LAW-N behavioral event ingest | HMAC-SHA256 |
| `/api/global-stats` | GET | Public counters | none |
| `/api/checkout` | POST | Pro subscription start | none |
| `/api/pro-check`, `/api/pro-poll`, `/api/pro-subscribe` | various | Pro tier endpoints | varies |
| `/api/delete-data` | POST | LGPD-compliant data deletion | self-auth |
| `/api/register` | POST | Add to apis.json directory | rate-limited |
| `/api/apis.json` | GET | API directory contents | none |
| `/api/activity` | GET | Recent payments feed | none |
| `/api/ab-event`, `/api/ab-stats` | POST/GET | A/B test telemetry | secret on stats |
| `/api/lnurl-auth` | * | LNURL-auth flow | none |
| `/api/whitepaper-extended` | GET | Paid whitepaper (100 sats) | L402 |
| `/api/mcp[/]` | * | MCP HTTP transport | none |
| `/api/verity/*` | * | VERITY service endpoints | see § 6 |

### `l402kit.com/admin/*` — board dashboard

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/admin` | GET | HTML dashboard (login form OR board view) | cookie (HttpOnly, HMAC-signed, 1h) |
| `/admin/login` | POST | Validates DASHBOARD_SECRET, sets cookie | secret in body |
| `/admin/logout` | POST | Clears cookie | none |
| `/admin/data` | GET | Aggregated state (header + action_queue) | cookie |
| `/admin/feed` | GET | 24h observation (radar + fiscal + acted) | cookie |
| `/admin/treasury` | GET | 30d fiscal timeline + sparkline | cookie |

### `l402kit.com/.well-known/*`

| Path | Purpose |
|---|---|
| `/.well-known/agent.json` | Agent contract (VERITY identity) |
| `/.well-known/l402.json` | L402 server descriptor |
| `/.well-known/mcp.json`, `/.well-known/mcp/*` | MCP discovery |
| `/.well-known/402index-verify.txt` | 402index.io ownership proof |
| `/.well-known/lnurlp/<user>` | LNURL-pay endpoint |

### Cron triggers (`cloudflare/wrangler.toml`)

Single cron at `*/30 * * * *` calls a fan-out in `cloudflare/src/worker.ts`:

| Job | File | Frequency | What it does |
|---|---|---|---|
| Heartbeat | `verity/cron/heartbeat.ts` | every 30min | Health ping + pricing nudge |
| Fiscal | `verity/cron/fiscal.ts` | daily midnight UTC | KV report (sats + BRL) |
| RADAR (buyers) | `verity/cron/radar.ts` | every 30min | Find dev posts about API monetization |
| RADAR (ecosystem) | `verity/cron/ecosystem.ts` | every 30min | Lightning/L402 ecosystem mentions |
| RADAR (competitors) | `verity/cron/competitors.ts` | every 30min | Watch DeepBlue/Fynx/PingPay |
| RADAR (partners) | `verity/cron/partners.ts` | every 30min | Potential partner orgs |
| RADAR (synthesis) | `verity/cron/synthesis.ts` | every 30min | 360° view across 4 rings |
| Monitor | `monitor.ts` | every 30min | Test all critical endpoints |
| GitHub Responder | `github-responder.ts` | every 30min | Auto-thank-you on new GitHub stars |

---

## 5 · Lifecycle (develop → test → release → deploy → monitor → respond)

### 5.1 Develop

```bash
git clone https://github.com/ShinyDapps/l402-kit
cd l402-kit
bash .githooks/install.sh   # activate pre-commit secret guard
npm ci                       # install TS deps
cd python && pip install -e ".[dev]"
cd ../rust && cargo build
cd ../go && go mod download
```

### 5.2 Test

| Lang | Command | Where |
|---|---|---|
| TypeScript | `npm test` | runs 3 projects (sdk, workers, vscode-extension) |
| Python | `cd python && pytest` | `tests/` |
| Rust | `cd rust && cargo test` | `tests/` + doc tests |
| Go | `cd go && go test ./...` | `*_test.go` |
| Integration smoke | `bash tests/smoke.sh` | hits prod endpoints |
| UI audit | `bash tests/audit-ui.sh` | landing + docs |
| Worker benchmark | `bash tests/benchmark.sh` | throughput |

**TDD invariant:** test first, code second. Tests live in `__tests__/` per language (Python uses `tests/`).

### 5.3 Release

Cross-lang releases are atomic via GitHub Actions matrix (`.github/workflows/release.yml`):

```bash
# 1. Bump 4 version files in sync
#    - package.json
#    - python/pyproject.toml
#    - rust/Cargo.toml
#    - go/README.md (humans-only ref)
# 2. Commit
git add -A && git commit -m "feat: release vX.Y.Z"
git push origin main
# 3. Tag — this triggers the matrix
git tag vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
```

The matrix runs:
1. `verify` — confirms all 4 version files match the tag (aborts if drift)
2. `test` — runs CI (4 langs) as gate
3. In parallel: `publish-npm`, `publish-pypi`, `publish-crates`, `publish-go-tag`

Required GitHub Actions secrets (set via API, see `.github/workflows/README.md`):
- `NPM_TOKEN` — granular token with **bypass 2FA** + `l402-kit` package scope
- `PYPI_TOKEN` — API token scoped to `l402kit`
- `CARGO_TOKEN` — crates.io API token with publish-update

### 5.4 Deploy (workers)

Two workers, two configs:

```bash
# Token in ~/.claude/.../memory/credentials.md § Cloudflare
$env:CLOUDFLARE_API_TOKEN = "<token>"

# API worker (VERITY + all endpoints + admin dashboard)
cd cloudflare && npx wrangler deploy --config wrangler.toml

# Landing site (static, backend/ dir)
cd .. && npx wrangler deploy --config wrangler.jsonc
```

Docs deploy automatically via Mintlify on push to `main`.

### 5.5 Monitor

| Where | What |
|---|---|
| **GitHub Actions** runs | CI per push + release matrix per tag |
| **Cloudflare dashboard** | Worker uptime, request volume, error rate |
| **VERITY dashboard `/admin`** | Action queue + treasury 30d + feed 24h |
| **Fiscal KV report** | `wrangler kv key get "verity_fiscal:YYYY-MM-DD" --binding demo_preimages` |
| **scripts/monitor.mjs** | Manual cross-check: npm, PyPI, crates, Go, Glama, uptime |

### 5.6 Respond (incident playbook)

| Symptom | First check | Action |
|---|---|---|
| Payments stuck pending | Blink wallet balance + webhook delivery logs | Manual replay via `pay-invoice` edge function |
| VERITY service returning errors | `wrangler tail --config cloudflare/wrangler.toml` | Check provider key (Anthropic/Serper/Firecrawl) hasn't been rotated |
| Treasury alert (`/admin/data`) | Open dashboard | Resolve cause (budget exhausted, payment failed) |
| Secret leak | `git grep -nE "<token-prefix>"` | Rotate via wrangler `secret put`, gitleaks pre-commit blocks future |
| Release matrix failed at `verify` | GH Actions log | Sync version files, force-push tag |
| Release matrix failed at publish | Check error per job | npm: token bypass-2fa scope; PyPI: package conflict (already published?); cargo: dirty workdir |

---

## 6 · VERITY — autonomous agent end-to-end

### 6.1 Identity & contract

Agent ID `agent:shinydapps.verity`. Modus operandi: spend in sats, budget-aware, treasury-auditable. Each paid call returns the sats actually paid alongside the response, so cost is observable per tool call.

Public agent contract: `https://l402kit.com/.well-known/agent.json`.

### 6.2 The 11 services

See [`docs/agent/verity.mdx`](docs/agent/verity.mdx) for caller-side reference. Server-side files in `cloudflare/src/verity/services/`.

### 6.3 The autonomous loop

```
┌───────────────┐    ┌──────────┐    ┌──────────┐
│   RADAR       │───▶│ Pricing  │───▶│ Fiscal   │
│  (5 rings)    │    │ (cron    │    │ (daily   │
│  cron 30min   │    │ 30min)   │    │ midnight)│
└───────┬───────┘    └──────────┘    └──────────┘
        │
        ▼
┌───────────────┐
│ Action Queue  │
│ (humano via   │
│  /admin)      │
└───────────────┘
```

- **RADAR** (`cron/radar.ts`, `cron/ecosystem.ts`, `cron/competitors.ts`, `cron/partners.ts`, `cron/synthesis.ts`): every 30min, queries Serper for posts matching buyer profile. Filters via `isBuyerLead()` (rejects infra `lightninglabs/*`, competitors `DeepBlue/Fynx/PingPay`, fiat gateways `Stripe/Payflow`). Hot leads queue with score + persona + outreach draft.
- **Pricing** (`pricing.ts`): adjusts service prices ±10% based on demand vs floor.
- **Fiscal** (`cron/fiscal.ts`): writes `verity_fiscal:YYYY-MM-DD` to KV with gross/cogs/net/calls.
- **Dashboard** (`/admin`): human-facing board interface. Sees what VERITY decides, intervenes only when she pushes a hot lead or alert into the action queue.

### 6.4 Reputation + earn-first gate

VERITY can become a CONSUMER of other L402 agents via `callExternal()`. Earn-first gate: she only activates external spend after she has revenue. Reputation pricing tracks success/error rates per external partner.

---

## 7 · LAW-N integration (behavioral telemetry)

LAW-N is **SAGEWORKS AI** behavioral ledger. Every successful L402 payment can emit a CloudEvents 1.0 envelope, HMAC-signed, to a LAW-N ingest endpoint.

### Wire-format contract (all 4 SDKs identical)

```http
POST /ingest/events HTTP/1.1
Content-Type: application/json
X-LAW-N-Signature: sha256=<hex digest of body>
X-LAW-N-Request-Id: <random 16-char hex>

{
  "specversion": "1.0",
  "type": "l402.payment.settled",
  "source": "l402-kit",
  "id": "<event id>",
  "time": "2026-05-19T12:00:00Z",
  "subject": "agent-payment-flow",
  "datacontenttype": "application/json",
  "data": {
    "agent_id": "agent:shinydapps.verity",
    "session_id": "sess_xxx",
    "request_id": "req_xxx",
    "endpoint": "https://...",
    "event_type": "settled",
    "payment": { "amount_sats": 100, "settled": true }
  }
}
```

Delivery is **fire-and-forget**. Network errors are swallowed. Behavioral writes must never block payments.

### Ingest side (our worker)

`cloudflare/src/api/lawn-events.ts` receives, validates HMAC, persists. Schema validates against Peace's spec (branch `feat/lawn-events`).

### SDK side

- TS: `createLawNAdapter({ endpoint, secret, timeoutMs })`
- Python: `create_lawn_adapter(endpoint, secret, timeout)`
- Rust: `create_lawn_adapter(endpoint, secret, timeout)` (feature `lawn-adapter`)
- Go: `CreateLawNAdapter(endpoint, secret, timeout)`

---

## 8 · Security posture (auth surfaces in plain language)

### What you (the API caller / agent) authenticate with

L402 token: `<base64 macaroon>:<hex preimage>`. The middleware verifies in constant time. No DB lookup.

### What the admin (you, human) authenticates with

`/admin` → cookie HMAC-signed over `expiresAt`, set by POST `/admin/login` with `DASHBOARD_SECRET`. TTL 1h. Cookie is `HttpOnly; Secure; SameSite=Strict; Path=/admin`.

### What the operator (deploy / publish) authenticates with

- Cloudflare workers: `CLOUDFLARE_API_TOKEN` (Workers scope) — credentials.md
- npm publish: `NPM_TOKEN` (granular, bypass 2FA, scoped to `l402-kit`)
- PyPI publish: `PYPI_TOKEN` (API token, scoped to `l402kit`)
- crates publish: `CARGO_TOKEN`
- GitHub Actions push: PAT with `repo` + `workflow` scope

### What partners authenticate with

- Blink webhooks: **Svix signature** (`BLINK_WEBHOOK_SECRET`)
- LAW-N ingest: **HMAC-SHA256** (`LAWN_HMAC_SECRET`)

### Repo hygiene (guard rails)

- `.githooks/pre-commit` — blocks 10 known token patterns before commit. Activate: `bash .githooks/install.sh`.
- `.github/workflows/ci.yml` — `gitleaks-action` step on every push.
- `.gitleaks.toml` — extends defaults with our patterns + documented allowlist.
- All strategic docs and drafts live in `.private/` (gitignored).

### Known-revoked secrets

| Secret | Status |
|---|---|
| `shdp_dash_mK9pL2xQwRtNvJ4eHcBfUu3YsA7dZiXo` | revoked 2026-05-19 |

See [`SECURITY.md`](SECURITY.md) for full audit log + reporting.

---

## 9 · Common queries / playbook

> **I need to add a new VERITY service**
1. `cloudflare/src/verity/services/myservice.ts` (copy pattern from `btcprice.ts`)
2. Add to `cloudflare/src/verity/pricing.ts` DEFAULTS map (price + COGS)
3. Wire route in `cloudflare/src/verity/index.ts`
4. Write tests in `cloudflare/src/__tests__/`
5. Deploy: `cd cloudflare && npx wrangler deploy --config wrangler.toml`
6. Document in `docs/agent/verity.mdx`

> **I need to add a new Lightning provider**
1. `src/providers/myprovider.ts` (TS, copy from `blink.ts`)
2. Mirror in `python/l402kit/providers/`
3. Mirror in `rust/src/managed.rs` (Rust delegates to API)
4. Mirror in `go/providers.go`
5. Cross-lang tests

> **A user is reporting a token always fails verification**
1. Confirm SDK version is `1.10.0+` (older has the `exp` ms-vs-s bug, fixed 1.9.1)
2. Confirm token isn't claiming `exp` > 2h in the future (`MAX_EXP_MS` cap)
3. Confirm token length ≤ 4096 chars
4. Compute `SHA256(preimage)` manually, compare to `macaroon.hash`

> **I need to rotate a secret**
```bash
# Compute new secret
NEW=$(openssl rand -hex 32)
# Set on worker
echo "$NEW" | CLOUDFLARE_API_TOKEN=... npx wrangler secret put SECRET_NAME --config cloudflare/wrangler.toml
# Confirm by hitting an endpoint that requires it
# Update credentials.md memory note (LOCAL ONLY)
```

> **I need to add a GitHub Actions secret**
```bash
# Via API (PAT scope: actions:write)
# See `.github/workflows/README.md` for python+pynacl encryption snippet
```

> **A test is flaky in CI but passes locally**
Likely culprits: race conditions in network code, dependence on system clock, port collisions in test fixtures. For LAW-N adapter tests we use `threading.Event` (Python) and `tokio::time::sleep` (Rust) with deterministic primitives. Don't use polling loops.

> **I want to test a new feature without breaking real treasury**
Use Sovereign mode locally with a [Polar](https://lightningpolar.com) regtest node, or testnet Blink. Don't point integration tests at real `shinydapps@blink.sv`.

---

## 10 · Decision log (don't undo without discussion)

| Decision | Why |
|---|---|
| LNURL for invoice creation (not Blink API direct) | Provider-agnostic; sovereign mode users don't need Blink |
| `feat/lawn-events` not merged | Waiting Peace validation against real LAW-N ingest |
| 0.3% fee (managed) / 0% (sovereign) | Aligns incentive: pay zero if you self-host |
| Dynamic pricing with floor protection | Saylor invariant — never sell below cost |
| Daily Fiscal Agent | Compliance from day 1 |
| Bitcoin-only stance (reject x402 USDC/Solana/Rootstock) | Pitch differentiation — Lightning = millisecond settlement |
| Sovereign mode is sacred | "Rode você mesmo, 0% fee" cannot become opt-in upsell |
| All releases must be equalized across 4 SDKs | Release matrix enforces this — disciplina sobre conveniência |

---

## 11 · Glossary

| Term | Meaning |
|---|---|
| **L402** | HTTP 402 + Lightning + macaroon protocol. IETF draft, owned by Lightning Labs. |
| **BOLT11** | Bitcoin Lightning invoice format. Encodes amount, hash, expiry, route hints. |
| **macaroon** | Signed JSON with `hash` (payment hash) + `exp` (ms). Caller proves payment via preimage. |
| **preimage** | 32-byte secret. `SHA256(preimage) == paymentHash`. Lightning reveals it on settle. |
| **LNURL-pay** | URL-based Lightning payment flow. Used to resolve a Lightning Address into a fresh invoice. |
| **Lightning Address** | `user@domain` — looks like email, resolves via LNURL. |
| **sat / satoshi** | 1/100M of a BTC. Smallest unit. |
| **MCP** | Model Context Protocol. Anthropic standard for AI agent tools. |
| **CloudEvents** | CNCF spec for event metadata. LAW-N uses 1.0. |
| **HMAC-SHA256** | Symmetric signature over a body + shared secret. Used by Blink webhook + LAW-N ingest. |
| **VERITY** | Our autonomous agent. 11 services. Treasury = `shinydapps@blink.sv`. |
| **RADAR** | VERITY's 5-ring autonomous lead/competitor/partner detection cron. |
| **LAW-N** | SAGEWORKS AI behavioral ledger for agents. We emit CloudEvents to their ingest. |
| **Sovereign / Managed mode** | User runs own Lightning provider (0% fee) vs uses `l402kit.com` (0.3% fee). |
| **`isBuyerLead()`** | Filter that rejects infra/competitor/fiat-gateway posts before they enter RADAR queue. |
| **Earn-first gate** | VERITY can only spend on external L402 services after she has revenue. |

---

## 12 · Appendix: command cheatsheet

```bash
# Local dev
bash .githooks/install.sh             # activate secret guard
npm ci && npm run dev                  # TS watch
cd python && pytest -xvs               # Python test single
cd rust && cargo test --test lawn_adapter_test   # Rust single test
cd go && go test -run TestVerifyToken ./...      # Go single test

# Deploy
$env:CLOUDFLARE_API_TOKEN = "<token>"
cd cloudflare && npx wrangler deploy --config wrangler.toml      # API + VERITY
cd .. && npx wrangler deploy --config wrangler.jsonc              # landing

# Worker debug
cd cloudflare && npx wrangler tail --config wrangler.toml
cd cloudflare && npx wrangler kv key get "verity_fiscal:$(date -u +%Y-%m-%d)" --binding demo_preimages

# Release (atomic, 4 SDKs)
# Bump package.json + python/pyproject.toml + rust/Cargo.toml + go/README.md to vX.Y.Z
git commit -am "feat: vX.Y.Z"
git push origin main
git tag vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
# GitHub Actions matrix does the rest

# Smoke production
bash tests/smoke.sh
bash tests/audit-ui.sh

# /admin dashboard (login via cookie)
# Browser: https://l402kit.com/admin
# Curl: curl -c /tmp/c.txt -X POST https://l402kit.com/admin/login -d '{"secret":"<DASHBOARD_SECRET>"}'

# Rotate a worker secret
echo "<new>" | CLOUDFLARE_API_TOKEN=... npx wrangler secret put SECRET_NAME --config cloudflare/wrangler.toml

# Add to gitleaks allowlist
# Edit .gitleaks.toml § [allowlist].regexes (don't lower the bar for real secrets)
```

---

**End of handbook.** If you found a gap, edit this file in a PR with the discovery you wish you had. The handbook is alive.
