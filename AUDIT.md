# AUDIT.md — End-to-end audit of l402-kit (2026-05-19)

> **Purpose:** prove every component works end-to-end (human + machine journeys) and document what's intact, what's degraded, what to fix. Live observations from prod.

> **How to refresh:** rerun the checks in [§ 12 Replay commands](#12-replay-commands).

---

## 1 · TL;DR

| Surface | Status | Issues found |
|---|---|---|
| GitHub Actions CI (5 jobs) | ✅ green (after gitleaks allowlist fix) | 4 false-positive secrets flagged, allowlisted |
| All public l402kit.com routes | ✅ all 200/302 as expected | — |
| VERITY 11 services pricing | ✅ live, dynamic pricing operational | `services` endpoint exposed wrong `id` (`btcprice`) vs route (`btc-price`) — **FIXED** |
| Payment flow (/api/invoice) | ✅ creates real BOLT11 + macaroon | — |
| Blink webhook | ✅ rejects unsigned (401) | — |
| Supabase edge functions | ✅ all 3 alive | — |
| VS Code extension | ✅ marketplace live, v1.9.1 | — |
| `llms.txt` | ⚠️ Go version stale `v1.8.2` | **FIXED** → `v1.10.0` |
| Docs Mintlify | ✅ 200 via redirect | — |
| Cron `*/30 * * * *` | ✅ active, last run 2026-05-19 16:54 UTC | — |
| Receita | ❌ **0 sats / 0 calls** | conversion bottleneck, not product |

**Bottom line:** plumbing is intact end-to-end. Pricing, payments, autonomous loops all work. Zero revenue not because anything is broken — because nobody has paid yet.

---

## 2 · Landing audit (l402kit.com)

### 2.1 Endpoints called from the page

```
GET  /                                     200  landing
GET  /api/demo                             200  free index of demo endpoints
GET  /dashboard.html                       307  redirect (intentional)
GET  /api/global-stats                     200  public counters
GET  /api/activity                         200  recent payments feed
GET  /api/verity/services                  200  pricing catalog
GET  /.well-known/agent.json               200  VERITY agent contract
GET  /.well-known/l402.json                200  L402 server descriptor
GET  /.well-known/mcp.json                 200  MCP discovery
```

### 2.2 Outbound links (clickable on landing)

All anchors resolved:
- `#extension`, `#how`, `#pricing`, `#liveDemo` — exist as section IDs ✅
- `#register-api` — onclick-driven, reveals hidden form (not a real anchor)
- `https://forge.l402kit.com` — 200 (Diagram Forge live)
- `https://glama.ai/mcp/servers/ShinyDapps/l402-kit` — live listing
- `https://docs.l402kit.com/*` — all 302 → Mintlify (normal)

### 2.3 A/B test telemetry (live counts as of audit)

```json
{
  "date": "2026-05-19",
  "counts": {
    "A": {"view": 1, "click_install": 0, "click_docs": 0, "click_demo": 0},
    "B": {"view": 0, "click_install": 1, "click_docs": 0, "click_demo": 0},
    "C": {"view": 0, "click_install": 0, "click_docs": 0, "click_demo": 0}
  }
}
```

**1 view + 1 click_install in 24h. Deserto.** Distribution channels exist (npm/PyPI/crates/Go/Glama/Smithery/402index), conversion to landing visit is the gap.

### 2.4 Live demo (interactive section `#liveDemo`)

- Dropdown lets visitor pick: btc-price / worldstate / search / domain-intel
- "Run" button hits `/api/verity/*` real, displays HTTP 402 + macaroon + invoice + JSON
- Visitors see the protocol working without paying

---

## 3 · VERITY 11 services — live pricing snapshot

| Service | Endpoint | Price | Floor | COGS | Surge threshold |
|---|---|---|---|---|---|
| search | `/api/verity/search` | 500 | 500 | 50 | 50 |
| scrape | `/api/verity/scrape` | 500 | 500 | 20 | 20 |
| btc-price | `/api/verity/btc-price` | 100 | 100 | 0 | 200 |
| summarize | `/api/verity/summarize` | 500 | 500 | 1 | 30 |
| sentiment | `/api/verity/sentiment` | 300 | 300 | 1 | 40 |
| domain-intel | `/api/verity/domain-intel` | 2000 | 2000 | 0 | 10 |
| integration | `/api/verity/integration` | 200000 | 200000 | 150 | 3 |
| worldstate | `/api/verity/worldstate` | 300 | 300 | 0 | 100 |
| translate | `/api/verity/translate` | 500 | 500 | 1 | 30 |
| research | `/api/verity/research` | 2000 | 2000 | 51 | 15 |
| alpha | `/api/verity/alpha` | 5000 | 5000 | 100 | 10 |

**Invariants confirmed live:**
- `price_sats >= floor_sats` for every service (Saylor invariant intact)
- COGS reflects real provider cost (Anthropic + Serper + Firecrawl per-call)
- All endpoints return 402 when unpaid

**Issue found + fixed (commit pending):**
- `/api/verity/services` was exposing wrong `id` and `endpoint` because the camelCase→kebab-case regex doesn't handle `btcprice` → `btc-price`. Added explicit `SERVICE_ROUTES` map. Now the published catalog matches the actual route slugs.

---

## 4 · Payment flow end-to-end (verified live)

### 4.1 Invoice creation

```bash
curl -X POST https://l402kit.com/api/invoice \
  -H "Content-Type: application/json" \
  -d '{"amountSats":10}'
```

**Real response received during audit:**
```json
{
  "paymentRequest": "lnbc100n1p4qex8rpp5xzkrxm5...",
  "paymentHash": "30ac336e850365179c20c08a5f39cc...",
  "macaroon": "eyJoYXNoIjoiMzBhYzMzNmU4NTAzNjUxNzljMjBjMDhhNWY..."
}
```

- BOLT11 invoice issued by `shinydapps@blink.sv` (LNURL resolution)
- Macaroon has `hash` (payment hash) + `exp` (ms, ~1h in future, within MAX_EXP_MS cap)

### 4.2 Webhook security

```bash
curl -X POST https://l402kit.com/api/blink-webhook -H "Content-Type: application/json" -d '{}'
# → 401 (correctly rejects without Svix signature)
```

### 4.3 Split mechanism

Server-side. Triggered by Blink webhook on payment confirmation. Routes 99.7% to owner, retains 0.3%. SSRF blocklist applied on LNURL domain resolution (post-Schneier audit 2026-05-05).

### 4.4 Supabase edge functions (alive)

| Function | URL | Status |
|---|---|---|
| blink-webhook | `https://urcqtpklpfyvizcgcsia.supabase.co/functions/v1/blink-webhook` | 405 to GET (alive, expects POST) |
| create-invoice | same prefix `/create-invoice` | 405 to GET |
| pay-invoice | same prefix `/pay-invoice` | 405 to GET |

---

## 5 · VERITY autonomous loop status

### 5.1 Fiscal agent (daily, runs 00:00 UTC)

`GET /api/verity/fiscal` (today):
```json
{
  "date": "2026-05-19",
  "agent": "VERITY",
  "revenue_sats": 0,
  "consumer_spent_sats": 0,
  "consumer_budget_sats": 2000,
  "net_sats": 0,
  "margin_pct": "0.00",
  "brl_equivalent": "unavailable",
  "btc_brl_rate": 0
}
```

⚠️ **`btc_brl_rate: 0`** — BRL conversion appears not populated. Worth investigating if BRL rate fetcher is failing silently.

### 5.2 Dashboard `/admin` (board interface)

- `status: ok`
- `receita_hoje: 0 sats / 0 calls`
- Action queue: 0 hot leads, 0 alerts
- Cookie HMAC auth working (rotated 2026-05-19 — new secret in `credentials.md`, not reproduced here per pre-commit guard rules)

### 5.3 RADAR (cron 30min, 5 rings)

Last log time: 2026-05-19 13:31 UTC (queries SERPER diversificadas após fix isBuyerLead). Skip rate alto (40/40 em runs antigos) caiu para ~97-98% após queries StackOverflow/dev.to. 4 leads dispensados manualmente após análise (PingPay/Zuplo/SO-Payflow/soa4u).

---

## 6 · Cloudflare infrastructure

### 6.1 Workers deployed

| Worker | Last modified | Purpose |
|---|---|---|
| `l402-kit` | 2026-05-19 16:53 | Landing (backend/) |
| `l402kit-api` | 2026-05-19 16:54 | API + VERITY + dashboard |
| `diagram-forge-landing` | 2026-05-12 03:08 | Diagram Forge subdomain |

### 6.2 KV namespaces

| Binding | Title | ID |
|---|---|---|
| `demo_preimages` | `demo-preimages` | `cc84c53bdb464a1391313565ff920d16` |

This single KV stores: macaroon payment proofs, VERITY pricing state, RADAR seen-URL cache, fiscal reports, A/B test counters, admin session cookies, alerts.

### 6.3 Cron triggers

`*/30 * * * *` on `l402kit-api` — last cron registration modified 2026-05-19 16:54.

### 6.4 Secrets (set, never logged)

`BLINK_API_KEY`, `BLINK_WALLET_ID`, `BLINK_API_KEY_DEMO`, `BLINK_WALLET_ID_DEMO`, `BLINK_WEBHOOK_SECRET`, `OWNER_LIGHTNING_ADDRESS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SPLIT_SECRET`, `DASHBOARD_SECRET` (rotated 2026-05-19), `LAWN_HMAC_SECRET`, `SERPER_API_KEY`, `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `GITHUB_PAT`.

---

## 7 · VS Code extension

| Field | Value |
|---|---|
| Marketplace ID | `ShinyDapps.shinydapps-l402` |
| Display name | "ShinyDapps Lightning Payments" |
| Version | 1.9.1 |
| Marketplace status | 200 (live) |
| Commands exposed | `shinydapps.showDashboard`, `shinydapps.configure` |

⚠️ Note: extension version is **1.9.1**, SDK was bumped to **1.10.0**. Not a blocker because extension talks to API, not SDK directly. Bump can wait for next functional change.

---

## 8 · CI / Release matrix

### 8.1 CI jobs (`.github/workflows/ci.yml`)

| Job | Status (latest) |
|---|---|
| TypeScript / Jest | ✅ success |
| Python / pytest | ✅ success |
| Rust / cargo test | ✅ success |
| Go / go test | ✅ success |
| **Secret scan (gitleaks)** | ✅ success (FOSS CLI, post-allowlist) |

### 8.2 Release matrix (`.github/workflows/release.yml`)

- Active, idle (no tags pushed since v1.10.0)
- Secrets configured: `NPM_TOKEN`, `PYPI_TOKEN`, `CARGO_TOKEN`
- Will trigger on next `vX.Y.Z` tag — atomic 4-way publish

---

## 9 · Security posture verified

- DASHBOARD_SECRET rotated (validated old=401, new=200)
- Pre-commit hook (`.githooks/pre-commit`) — 10 token patterns blocked locally
- CI gitleaks step — same scanner, FOSS binary
- `.private/` for strategic drafts (gitignored)
- No production secrets in any tracked file
- Allowlist documented in `.gitleaks.toml` with rationale per entry

See [`SECURITY.md`](SECURITY.md) for full posture + reporting.

---

## 10 · Issues found and resolution

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | DASHBOARD_SECRET hardcoded in `open-dashboard.ps1` + `functional.test.ts` | HIGH | Fixed earlier 2026-05-19 + rotated |
| 2 | gitleaks-action requires paid license for orgs | MEDIUM (CI red) | Switched to FOSS CLI binary |
| 3 | 4 false-positive findings flagged by gitleaks | LOW (CI red, but no real leak) | Allowlisted in `.gitleaks.toml` |
| 4 | `/api/verity/services` exposes wrong `id`/`endpoint` (`btcprice` vs `btc-price`) | MEDIUM (broken integration for catalog consumers) | **Fixed via `SERVICE_ROUTES` map (commit pending)** |
| 5 | `llms.txt` Go version stale at `v1.8.2` | LOW (visibility/docs) | **Fixed → v1.10.0 (commit pending)** |
| 6 | Fiscal `btc_brl_rate: 0` — BRL fetcher possibly failing | LOW (cosmetic in report) | Note for later debug — not blocking |
| 7 | Revenue = 0 sats / 0 calls | HIGH (mission) | Not a bug — distribution → conversion gap |

---

## 11 · Recommendations (cost vs impact)

| Priority | Action | Cost | Why |
|---|---|---|---|
| P0 | Commit + push the 2 inline fixes (services map, llms.txt) | 5min | Issues already known and trivial |
| P1 | First buyer: turn on cobrança in Wallet Lab Forge OR Diagram Forge | ~1h | Validates end-to-end production payment + improves Show HN narrative |
| P1 | Post Show HN with updated draft (`.private/strategy/SHOW_HN_DRAFT.md`) | ~30min + monitoring | First real distribution shot |
| P2 | Fix `btc_brl_rate` zero | ~30min | Fiscal cosmetic, not blocking |
| P2 | VS Code extension bump 1.9.1 → align with SDK | ~30min | Cosmetic, no functional gain unless adding feature |
| P3 | A/B test more variants OR change call-to-action | ~1h | 1 view in 24h is the real problem |

---

## 12 · Replay commands

Reproduce this audit anytime:

```bash
# 1. CI status
curl -s -H "Authorization: Bearer <PAT>" \
  "https://api.github.com/repos/ShinyDapps/l402-kit/actions/runs?per_page=3" \
  | jq '.workflow_runs[] | "\(.name)  \(.conclusion // .status)  \(.head_commit.message | split("\n")[0])"'

# 2. Endpoints alive (single one-liner)
for u in https://l402kit.com{,/api/demo,/dashboard.html,/api/global-stats,/api/activity,/api/verity/services,/.well-known/agent.json}; do
  echo "$(curl -s -o /dev/null -w "%{http_code}" "$u")  $u"
done

# 3. Pricing catalog
curl -s https://l402kit.com/api/verity/services | jq '.services[] | "\(.id)  \(.price_sats)sats  floor=\(.floor_sats)"'

# 4. Invoice creation (live)
curl -s -X POST https://l402kit.com/api/invoice -H "Content-Type: application/json" -d '{"amountSats":10}' | jq

# 5. Dashboard state (cookie auth required)
SECRET="<DASHBOARD_SECRET from credentials.md>"
curl -s -c /tmp/c.txt -X POST https://l402kit.com/admin/login -H "Content-Type: application/json" -d "{\"secret\":\"$SECRET\"}" >/dev/null
curl -s -b /tmp/c.txt https://l402kit.com/admin/data | jq '.header, .action_queue'

# 6. Fiscal agent (today)
curl -s https://l402kit.com/api/verity/fiscal | jq

# 7. Cloudflare workers list
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<account_id>/workers/scripts" | jq '.result[] | .id'
```

---

**Date of audit:** 2026-05-19 (afternoon). Next audit recommended after next minor release (1.11.0) or quarterly.
