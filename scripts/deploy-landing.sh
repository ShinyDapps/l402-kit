#!/usr/bin/env bash
# ── deploy-landing.sh ─────────────────────────────────────────────────────────
# Pipeline completo de deploy da landing page:
#   1. Unit tests (Jest — TypeScript + Worker handlers)
#   2. Smoke tests contra produção atual (antes de sobrescrever)
#   3. wrangler deploy — site estático (l402-kit worker)
#   4. wrangler deploy — API worker (l402kit-api)
#   5. Smoke tests pós-deploy para confirmar que novo deploy está saudável
#
# Usage:
#   bash scripts/deploy-landing.sh
#   SKIP_SMOKE_PRE=1 bash scripts/deploy-landing.sh   # pula smoke pré-deploy
#   SKIP_TESTS=1 bash scripts/deploy-landing.sh        # pula unit tests (não recomendado)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
fail()  { echo -e "${RED}✗ $1${NC}"; exit 1; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }

# ── Require Cloudflare token ──────────────────────────────────────────────────
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  # Try reading from memory file (project convention)
  TOKEN_FILE="$HOME/.cloudflare_token"
  if [[ -f "$TOKEN_FILE" ]]; then
    export CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")"
    warn "CLOUDFLARE_API_TOKEN loaded from $TOKEN_FILE"
  else
    fail "CLOUDFLARE_API_TOKEN not set. Export it or create $TOKEN_FILE"
  fi
fi

START_TIME=$(date +%s)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Unit tests
# ─────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  step "1/5 — Unit tests (Jest)"
  if npm test -- --passWithNoTests --silent 2>&1; then
    ok "Unit tests passed"
  else
    fail "Unit tests FAILED — deploy aborted"
  fi
else
  warn "Unit tests skipped (SKIP_TESTS=1)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Smoke tests PRÉ-deploy (verifica que prod está saudável antes)
# ─────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_SMOKE_PRE:-0}" != "1" ]]; then
  step "2/5 — Smoke tests pré-deploy (prod atual)"
  if bash "$ROOT/tests/smoke.sh"; then
    ok "Prod pré-deploy saudável"
  else
    warn "Smoke pré-deploy falhou — prod já estava com problemas (continuando deploy)"
  fi
else
  warn "Smoke pré-deploy skipped (SKIP_SMOKE_PRE=1)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Deploy site estático (l402-kit worker → l402kit.com/*)
# ─────────────────────────────────────────────────────────────────────────────
step "3/5 — Deploy site estático (wrangler.jsonc)"
cd "$ROOT"
npx wrangler deploy --config wrangler.jsonc 2>&1 | tail -6
ok "Site estático deployado"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Deploy API worker (l402kit-api → /api/* + /.well-known/*)
# ─────────────────────────────────────────────────────────────────────────────
step "4/5 — Deploy API worker (cloudflare/wrangler.toml)"
cd "$ROOT/cloudflare"
npx wrangler deploy --config wrangler.toml 2>&1 | tail -6
cd "$ROOT"
ok "API worker deployado"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Smoke tests PÓS-deploy (verifica novo deploy)
# ─────────────────────────────────────────────────────────────────────────────
step "5/5 — Smoke tests pós-deploy (validando novo deploy)"

# Pequena pausa para propagação Cloudflare
echo "  Aguardando propagação Cloudflare (5s)…"
sleep 5

if bash "$ROOT/tests/smoke.sh"; then
  ok "Novo deploy saudável ✅"
else
  fail "Smoke pós-deploy FALHOU — verifique https://l402kit.com manualmente"
fi

# ─────────────────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}${BOLD}🚀 Deploy completo em ${ELAPSED}s${NC}"
echo -e "   ${CYAN}https://l402kit.com${NC}"
echo ""
