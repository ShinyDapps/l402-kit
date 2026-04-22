#!/usr/bin/env bash
# Run the full test suite across all SDKs.
# Usage: bash scripts/test-all.sh
# Optional: bash scripts/test-all.sh --skip-rust   (skip cargo test, slow on first run)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_RUST=false
for arg in "$@"; do
  [[ "$arg" == "--skip-rust" ]] && SKIP_RUST=true
done

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
section() { echo -e "\n${YELLOW}── $1 ──────────────────────────${NC}"; }

FAILURES=()

run_section() {
  local label="$1"
  shift
  section "$label"
  if "$@"; then
    pass "$label"
  else
    echo -e "${RED}✗ $label FAILED${NC}"
    FAILURES+=("$label")
  fi
}

# ── TypeScript ────────────────────────────────────────────────────────────────
run_section "TypeScript (Jest)" bash -c "
  cd '$ROOT'
  npm run build --silent
  npm test -- --passWithNoTests 2>&1
"

# ── Python ────────────────────────────────────────────────────────────────────
run_section "Python (pytest)" bash -c "
  cd '$ROOT/python'
  python -m pytest tests/ -v --tb=short 2>&1
"

# ── Go ────────────────────────────────────────────────────────────────────────
run_section "Go (go test)" bash -c "
  cd '$ROOT/go'
  go test ./... -v -count=1 2>&1
"

# ── Rust ──────────────────────────────────────────────────────────────────────
if [[ "$SKIP_RUST" == "false" ]]; then
  run_section "Rust (cargo test)" bash -c "
    cd '$ROOT/rust'
    cargo test --all-features 2>&1
  "
else
  echo -e "${YELLOW}⚠ Rust tests skipped (--skip-rust)${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo -e "${GREEN}✅ All test suites passed.${NC}"
else
  echo -e "${RED}❌ Failed suites: ${FAILURES[*]}${NC}"
  exit 1
fi
