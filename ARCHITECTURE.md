# Architecture — where is what

> **Goal of this file:** in 60 seconds, anyone (human or AI agent) finds the file they need without grep.

## Top-level map

```
l402-kit/
├── src/                  TypeScript SDK (npm: l402-kit)
├── python/               Python SDK (PyPI: l402kit)
├── rust/                 Rust SDK (crates.io: l402kit)
├── go/                   Go SDK (pkg.go.dev: github.com/shinydapps/l402-kit/go)
├── mcp/                  MCP server (bin: l402-kit-mcp) — TS, ships in npm package
├── cloudflare/           Server-side: API worker (l402kit.com/api/*) + VERITY agent
├── backend/              Static landing site (l402kit.com, deployed via wrangler.jsonc)
├── docs/                 Mintlify docs (docs.l402kit.com, auto-sync on git push)
├── vscode-extension/     VS Code extension (marketplace: ShinyDapps.shinydapps-l402)
├── packages/             Sub-packages (create-l402-app scaffold)
├── examples/             Runnable examples per language
├── supabase/             Edge functions (blink-webhook, pay-invoice) + migrations
├── scripts/              Operational scripts (deploy, demo, monitor, PR checks)
├── tests/                Cross-cutting integration test scripts (smoke, audit, benchmark)
├── .github/              CI workflows + community files
├── .githooks/            Pre-commit secret guard (activate: bash .githooks/install.sh)
└── .private/             Strategic docs & drafts — gitignored (not for public repo)
```

## SDK locations (cross-lang)

| Lang | Source | Tests | Published as | Version source of truth |
|---|---|---|---|---|
| TypeScript | `src/` | `src/__tests__/` | npm `l402-kit` | `package.json` |
| Python | `python/l402kit/` | `python/tests/` | PyPI `l402kit` | `python/pyproject.toml` |
| Rust | `rust/src/` | `rust/tests/` | crates.io `l402kit` | `rust/Cargo.toml` |
| Go | `go/` | `go/*_test.go` | `github.com/shinydapps/l402-kit/go` | git tag `go/vX.Y.Z` |
| VS Code ext | `vscode-extension/src/` | `vscode-extension/src/__tests__/` | Marketplace | `vscode-extension/package.json` |
| MCP server | `mcp/` | — | bin in npm `l402-kit` | inherits `package.json` |

All SDKs ship the **same `verify_token` contract** (token length guard 4096 + MAX_EXP_MS 2h cap + constant-time compare). All ship LAW-N adapter (`createLawNAdapter` / `create_lawn_adapter` / `CreateLawNAdapter`).

Tag `vX.Y.Z` triggers the **release matrix** (`.github/workflows/release.yml`) that publishes all 4 in parallel.

## Server-side

`cloudflare/` houses **two distinct workers**:

| Worker | Config | Routes | Purpose |
|---|---|---|---|
| `l402kit-api` | `cloudflare/wrangler.toml` | `l402kit.com/api/*`, `/admin/*`, `/.well-known/*`, `docs.l402kit.com/*` | API + VERITY + dashboard |
| `l402-kit` (landing) | `wrangler.jsonc` (root) | `l402kit.com/*` (static assets) | Marketing site from `backend/` |

VERITY (autonomous agent built on l402-kit) lives in `cloudflare/src/verity/`:
- `services/` — 11 paid endpoints (BTC price, search, scrape, summarize, etc.)
- `radar/` — autonomous lead discovery (5 rings, cron 30min)
- `cron/` — scheduled jobs (heartbeat, fiscal, pricing, radar)
- `pricing.ts` — dynamic pricing (+10% surge, -10% idle, floor protected)

## Documentation surfaces

| Audience | File | Updated by |
|---|---|---|
| GitHub visitors / npm landing | `README.md` | manual |
| Users (multilingual docs) | `docs/*.mdx` (Mintlify, 11 locales) | auto-sync on git push main |
| Contributors | `CONTRIBUTING.md` | manual |
| AI agents / Claude Code | `CLAUDE.md` | manual |
| Operational state | `STATUS.md` | per-session manual |
| Security posture | `SECURITY.md` | manual |
| **This file** | `ARCHITECTURE.md` | manual when structure changes |

Internal-only docs (`.private/`):
- `.private/strategy/` — launch plans, marketing, operations playbooks
- `.private/research/` — design docs (PRO billing, MindsEye integration, VERITY research)
- `.private/legacy/` — superseded versions kept for diff reference
- `.private/*.md` — outreach drafts (Moritz, Roland, Peace, Zeke), discord messages

## Key conventions (don't break)

- **TDD always.** Tests live in `__tests__/` per language, written before implementation.
- **Cross-lang feature parity.** Any feature in `src/` (TS) must port to `python/`, `rust/`, `go/` before the next minor release. Track in `memory/project_sdk_parity.md`.
- **Server-side concerns stay server-side.** SSRF protection, rate limiting, fraud detection live in `cloudflare/`, not in SDK clients.
- **No secrets in code.** Pre-commit guard (`.githooks/pre-commit`) + CI gitleaks block known token formats.
- **Memory over docs for ephemeral state.** Project state goes in `C:\Users\thiag\.claude\projects\c--Users-thiag-l402-kit\memory\` (per-machine, gitignored via `.claude/`), not in repo.

## When something changes

| Change type | Update |
|---|---|
| New SDK feature | Source + tests + `docs/sdk/<lang>.mdx` + memory `project_sdk_parity.md` |
| Bump version | `package.json` + `python/pyproject.toml` + `rust/Cargo.toml` + `go/README.md` (manual sync OR rely on release matrix to fail loudly if drift) |
| New VERITY service | `cloudflare/src/verity/services/` + `cloudflare/src/verity/pricing.ts` DEFAULTS + route in `cloudflare/src/verity/index.ts` + `docs/agent/verity.mdx` |
| New cron | `cloudflare/src/verity/cron/` + register in `cloudflare/wrangler.toml` triggers |
| Top-level restructure | This file (`ARCHITECTURE.md`) |

## Quick paths for common questions

> "Where do I add a new Lightning provider?"
→ `src/providers/`, `python/l402kit/providers/`, `rust/src/managed.rs` (cloud only), `go/providers.go`. All 4. Add tests in respective `__tests__/`.

> "Where is the VERITY pricing logic?"
→ `cloudflare/src/verity/pricing.ts` (DEFAULTS + dynamic adjustment). Cron in `cloudflare/src/verity/cron/`.

> "How do I deploy?"
→ See `CLAUDE.md` § Deploy. Two configs: `wrangler.jsonc` (landing) and `cloudflare/wrangler.toml` (API).

> "Where do the dashboard secrets come from?"
→ `cloudflare/wrangler.toml` env vars set via `wrangler secret put`. Tokens in `~/.claude/projects/.../memory/credentials.md` (local-only).
