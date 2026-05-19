# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.** Email `shinydapps@gmail.com` with:
- Affected component (SDK lang / worker / docs / extension)
- Reproduction steps or PoC
- Suggested fix if you have one

You will get a response within 72 hours. We'll triage, assign severity, and coordinate a fix + disclosure window with you.

We do not currently run a bounty program but will publicly credit reporters.

## Supported versions

Only the latest minor of each SDK gets security patches. Older versions are not backported.

| Package | Supported |
|---|---|
| npm `l402-kit` | `1.10.x` |
| PyPI `l402kit` | `1.10.x` |
| crates.io `l402kit` | `1.10.x` |
| Go module | `v1.10.x` |
| VS Code Extension | `1.9.x` |

## Security posture

### What protects you (token verification)

`verify_token()` in every SDK enforces the same invariants:
1. **Token length guard** — rejects tokens > 4096 chars before parsing (DoS defense)
2. **MAX_EXP_MS forward cap (2h)** — rejects tokens claiming expiry > 2h ahead, defeats forged long-lived tokens
3. **Constant-time digest comparison** — `timingSafeEqual` (Node), `hmac.compare_digest` (Py), `subtle::ConstantTimeEq` (Rust), `crypto/subtle.ConstantTimeCompare` (Go)
4. **Macaroon JSON enforces required fields** (`hash`, `exp`) — empty/missing/null rejected
5. **Preimage validation** — exactly 64 hex chars (32 bytes), strict regex

### What protects the worker (cloudflare/)

- **SSRF blocklist** on outbound LNURL resolution (`split.ts`, `pay-invoice`)
- **Global rate limit** (200 req/min) + **per-IP rate limit** (20 req/min) on `/api/invoice`
- **HMAC-SHA256** on Blink webhooks (`blink-webhook`) and LAW-N events (`/api/lawn-events`)
- **Cookie-based admin auth** (`/admin`) with HttpOnly + Secure + SameSite=Strict + signed session (HMAC over expiresAt, 1h TTL)
- **Email alert via Resend** when split payment permanently fails after 3 retries

### Repo hygiene

- `.githooks/pre-commit` blocks 10 known token patterns (`ghp_`, `npm_`, `pypi-A`, `cfut_`, `sk-ant-`, `sk-proj-`, `re_`, `shdp_dash_<hex>`, private key blocks). Activate after clone:
  ```bash
  bash .githooks/install.sh
  ```
- `.github/workflows/ci.yml` runs `gitleaks-action` on every push and PR (server-side guarantee).
- `.gitleaks.toml` extends defaults with project-specific patterns + allowlist for known false positives.
- Strategic/operational docs live in `.private/` (gitignored).
- No credentials in code. All secrets via env vars / Cloudflare worker secrets / GitHub Actions secrets.

## Known-revoked credentials

Secrets that leaked into git history before the security sweep on **2026-05-19**:

| Secret | Status |
|---|---|
| `DASHBOARD_SECRET=shdp_dash_mK9pL2xQwRtNvJ4eHcBfUu3YsA7dZiXo` | **REVOKED** 2026-05-19 — new value set via `wrangler secret put`, old returns 401 |

No provider tokens (`ghp_`, `npm_`, `pypi-`, `cfut_`, `sk-`) were ever committed (history scan clean).

## What you should do as a user of l402-kit

1. **Set sane budgets in client code.** `L402Client` / `l402Client()` accepts `budgetSats` — cap your agent's spend per session.
2. **Use Sovereign mode if you don't trust managed.** `ManagedProvider` routes through `l402kit.com` with 0.3% fee. Sovereign mode talks straight to your Lightning node (0% fee).
3. **Rotate Lightning wallet keys** if a key has ever been in a screenshot, log, or shared chat.
4. **Validate `agentId` in your LAW-N pipeline** if you accept events from untrusted agents — HMAC-SHA256 proves the event came from someone with the shared secret, not that the claimed `agentId` is the real sender.

## Audit history

- **2026-05-05** — Schneier-style audit (F3-F7 fixes): SSRF protection, exp cap, global rate limit, split failure alert, timing-safe compare.
- **2026-05-08** — Critical fix: macaroon `exp` unit ms vs s correctness, fetch timeouts, token length guard.
- **2026-05-19** — Security parity sweep cross-lang (Py/Rust/Go), repo hygiene, `DASHBOARD_SECRET` rotation, pre-commit guard, CI gitleaks.
