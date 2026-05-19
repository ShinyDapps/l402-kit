# AGENTS.md — machine-readable navigation

> **Why this file:** anyone driving this repo from an AI agent (Claude Code, Cursor, etc.) reads this first to orient. Structured for grep + cheap context.

> **Companion:** [`CLAUDE.md`](CLAUDE.md) (Claude-specific ops), [`HANDBOOK.md`](HANDBOOK.md) (deep walkthrough), [`ARCHITECTURE.md`](ARCHITECTURE.md) (where-is-what).

---

## Entry points by question

| If you're trying to... | Read this first |
|---|---|
| Understand the project in 60s | `README.md` |
| Find where a file lives | `ARCHITECTURE.md` |
| Operate / deploy / debug | `CLAUDE.md` |
| Deep walkthrough of every flow | `HANDBOOK.md` |
| Report or understand security | `SECURITY.md` |
| Contribute code | `CONTRIBUTING.md` |
| See live state | `STATUS.md` |

## File invariants

```yaml
# This block is meant to be parsed by tools.
project:
  name: l402-kit
  primary_branch: main
  license: MIT
  org: ShinyDapps
  maintainer: ThiagoDataEngineer
  domain: l402kit.com
  docs: docs.l402kit.com

protocols:
  - L402  # HTTP 402 + BOLT11 + macaroon
  - Lightning Network
  - CloudEvents 1.0  # LAW-N events
  - MCP  # Model Context Protocol (npx l402-kit-mcp)

sdks:
  typescript:
    path: src/
    tests: src/__tests__/
    config: package.json
    registry: npmjs.com/package/l402-kit
  python:
    path: python/l402kit/
    tests: python/tests/
    config: python/pyproject.toml
    registry: pypi.org/project/l402kit
  rust:
    path: rust/src/
    tests: rust/tests/
    config: rust/Cargo.toml
    registry: crates.io/crates/l402kit
  go:
    path: go/
    tests: go/*_test.go
    config: go.mod
    registry: pkg.go.dev/github.com/shinydapps/l402-kit/go

server_side:
  api_worker:
    config: cloudflare/wrangler.toml
    code: cloudflare/src/
    deploys_to: l402kit.com/api/*, l402kit.com/admin/*, docs.l402kit.com/*
  landing_worker:
    config: wrangler.jsonc
    code: landing-worker.ts + backend/
    deploys_to: l402kit.com/*

ci_cd:
  ci: .github/workflows/ci.yml  # tests 4 langs in parallel, gitleaks scan
  release: .github/workflows/release.yml  # tag vX.Y.Z triggers 4-way publish
  release_secrets_required: [NPM_TOKEN, PYPI_TOKEN, CARGO_TOKEN]

security:
  pre_commit_guard: .githooks/pre-commit
  ci_secret_scan: gitleaks
  gitleaks_config: .gitleaks.toml
  revoked_secrets:
    - "shdp_dash_mK9pL2xQwRtNvJ4eHcBfUu3YsA7dZiXo"  # revoked 2026-05-19

private_paths:
  - .private/                # strategic docs, drafts, internal research, credentials-local.md
  - ~/.claude/projects/...   # per-machine memory (not in repo)
  - CREDENTIALS.md           # if exists, gitignored; canonical is memory/credentials.md

never_break:
  - cross_lang_parity: "any feature in src/ must port to python/, rust/, go/ before next minor"
  - tdd_first: "test before implementation, in __tests__/"
  - sovereign_mode: "cannot become paid upsell"
  - bitcoin_only: "reject x402/USDC/Solana/Polygon/Rootstock at scoring time"
  - all_secrets_via_env: "no hardcoded tokens, ever"
```

## How to make changes safely

```yaml
checklist:
  - read: STATUS.md  # know current state
  - run: bash .githooks/install.sh  # one-time after clone
  - tdd: write failing test in __tests__/
  - cross_lang: if SDK change, mirror in 4 langs
  - tests: run language-specific test suite (see HANDBOOK § 5.2)
  - secrets: pre-commit guard will block tokens automatically
  - commit: small + descriptive; follow Conventional Commits
  - release: bump 4 version files in sync; tag triggers release matrix
```

## Hot files to read for context (in order of priority)

```
1. STATUS.md                                    # current live state
2. ARCHITECTURE.md                              # structural map
3. CLAUDE.md                                    # ops cheatsheet
4. HANDBOOK.md § 2 (providers) + § 4 (routes)   # surface area
5. cloudflare/wrangler.toml                     # what's deployed where
6. .github/workflows/                           # what CI does
7. ~/.claude/projects/.../memory/MEMORY.md      # persistent context (if on the operator's machine)
```

## What this repo does NOT have (yet)

- A central CHANGELOG.md (release notes live in git tags + GitHub Releases)
- An issue template (intentional — keep barrier low for first contributors)
- A Dependabot config (could add later)
- E2E browser tests beyond `tests/smoke.sh` and `tests/audit-ui.sh`

## Conventions (don't fight them)

- **Test directory:** `__tests__/` per language (Python uses `tests/`)
- **Wrangler configs:** TWO files — `wrangler.jsonc` (landing) and `cloudflare/wrangler.toml` (API). Don't merge.
- **Branch:** all work goes through `main` via PR. Feature branches OK but no `develop` / `staging`.
- **Commit format:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `security:`, `test:`). Include `Co-Authored-By` if an AI helped.
- **Version bumps:** 4 files in sync. Tag triggers matrix. Drift between files fails the verify job.

## Tools likely to come up

| Tool | Why you'd use it here |
|---|---|
| `wrangler` | Cloudflare workers deploy + KV introspection |
| `cargo` | Rust build/test/publish |
| `pytest` | Python tests (use `-n auto` once `pytest-xdist` is in deps for parallel) |
| `jest` | TS tests (3 projects: sdk, workers, vscode-extension) |
| `gh` | GitHub CLI (if installed). Not installed by default on this machine — use API + curl |
| `git` | Source control. PAT must have `repo` + `workflow` scopes for workflow files |
| `gitleaks` | Secret scanner (CI + optional local) |
| `npx l402-kit-mcp` | Test the MCP server stdio locally |
