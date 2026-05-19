#!/usr/bin/env bash
# Run all SDK test suites in PARALLEL. Zero npm deps — uses bash & + wait.
#
# ⚠ CAVEAT: parallel can be SLOWER and trigger flaky failures locally.
# TS Jest already uses many CPU workers. Adding Python (with timing-sensitive
# LAW-N tests using local HTTP fake servers) on the same machine starves Python
# of CPU and `wait_for(timeout)` fails. Locally, prefer:
#   - `npm test`           (only TS, fastest dev loop)
#   - `npm run test:py`    (only Python)
#   - `npm run test:go`    (only Go)
#   - `npm run test:rust`  (only Rust, slowest cold)
#   - `npm run test:all`   (serial, ~225s, reliable)
# True parallel happens IN CI (GitHub Actions matrix, 4 runners, see .github/workflows/ci.yml).
# This script is useful when (a) you have a fast 8+ core machine, (b) you accept potential
# LAW-N flakes, (c) you want a one-shot pass/fail summary.
#
# Usage:
#   bash scripts/test-fast.sh             # all 4 langs in parallel
#   bash scripts/test-fast.sh --skip-rust # skip the slow Rust compile
#   bash scripts/test-fast.sh --verbose   # stream all output (no parallel-friendly summary)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_RUST=false
VERBOSE=false
for arg in "$@"; do
  [[ "$arg" == "--skip-rust" ]] && SKIP_RUST=true
  [[ "$arg" == "--verbose" ]] && VERBOSE=true
done

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
DIM='\033[0;90m'
NC='\033[0m'

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

run_lang() {
  local label="$1" cmd="$2"
  local start_ns
  start_ns=$(date +%s%N)
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${YELLOW}▶ $label starting${NC}"
    eval "$cmd"
    local code=$?
  else
    eval "$cmd" >"$TMP/$label.log" 2>&1
    local code=$?
  fi
  local end_ns=$(date +%s%N)
  local dur_ms=$(( (end_ns - start_ns) / 1000000 ))
  echo "$code $dur_ms" > "$TMP/$label.result"
  return "$code"   # propagate to wait so parent's $? reflects the real status
}

echo -e "${YELLOW}── Parallel test sweep ──────────────────────${NC}"
echo -e "${DIM}  (logs streamed to $TMP/<lang>.log; combined summary at end)${NC}"
echo

# Launch in parallel
run_lang "ts"     "npm test -- --passWithNoTests" &
PID_TS=$!

run_lang "python" "cd python && python -m pytest tests/ -q --tb=short" &
PID_PY=$!

run_lang "go"     "cd go && go test ./..." &
PID_GO=$!

if [[ "$SKIP_RUST" == "false" ]]; then
  run_lang "rust"  "cd rust && cargo test --all-features" &
  PID_RUST=$!
fi

# Wait for all
wait $PID_TS; STATUS_TS=$?
wait $PID_PY; STATUS_PY=$?
wait $PID_GO; STATUS_GO=$?
if [[ "$SKIP_RUST" == "false" ]]; then
  wait $PID_RUST; STATUS_RUST=$?
fi

# Pretty summary
print_result() {
  local label="$1" status="$2"
  if [[ ! -f "$TMP/$label.result" ]]; then
    echo -e "  ${YELLOW}? $label    no result${NC}"
    return
  fi
  read code dur_ms < "$TMP/$label.result"
  local dur_s=$(( dur_ms / 1000 ))
  local sym color
  if [[ "$code" -eq 0 ]]; then
    sym="✓"; color=$GREEN
  else
    sym="✗"; color=$RED
  fi
  printf "  ${color}%s %-8s${NC}  ${DIM}%4ds${NC}\n" "$sym" "$label" "$dur_s"
  if [[ "$code" -ne 0 ]] && [[ "$VERBOSE" == "false" ]]; then
    echo -e "${DIM}    tail of failing output:${NC}"
    tail -12 "$TMP/$label.log" | sed 's/^/      /'
  fi
}

echo
echo -e "${YELLOW}── Results ────────────────────────────────${NC}"
print_result ts     "$STATUS_TS"
print_result python "$STATUS_PY"
print_result go     "$STATUS_GO"
[[ "$SKIP_RUST" == "false" ]] && print_result rust "$STATUS_RUST"

ANY_FAILURE=0
[[ "$STATUS_TS"   -ne 0 ]] && ANY_FAILURE=1
[[ "$STATUS_PY"   -ne 0 ]] && ANY_FAILURE=1
[[ "$STATUS_GO"   -ne 0 ]] && ANY_FAILURE=1
[[ "$SKIP_RUST" == "false" && "${STATUS_RUST:-1}" -ne 0 ]] && ANY_FAILURE=1

echo
if [[ "$ANY_FAILURE" -eq 0 ]]; then
  echo -e "${GREEN}✅ All test suites passed.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some suites failed. Full logs in $TMP (run with --verbose to stream).${NC}"
  exit 1
fi
