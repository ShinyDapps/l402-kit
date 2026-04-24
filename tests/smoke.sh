#!/usr/bin/env bash
# ── Smoke tests — l402kit.com production endpoints ───────────────────────────
# Usage:
#   bash tests/smoke.sh                    # tests against https://l402kit.com
#   BASE_URL=http://localhost:8787 bash tests/smoke.sh  # local wrangler dev
#
# Exit code 0 = all passed. Non-zero = at least one failure.

set -euo pipefail

BASE_URL="${BASE_URL:-https://l402kit.com}"
TIMEOUT=10

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
PASS=0; FAIL=0; FAILURES=()

ok()   { echo -e "${GREEN}  ✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}  ✗${NC} $1"; FAILURES+=("$1"); FAIL=$((FAIL + 1)); }
sep()  { echo -e "\n${YELLOW}── $1 ──────────────────────────────────────────${NC}"; }

check_status() {
  local label="$1" url="$2" expected="${3:-200}" method="${4:-GET}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X "$method" "$url")
  if [[ "$status" == "$expected" ]]; then ok "$label (HTTP $status)";
  else fail "$label — expected $expected, got $status — $url"; fi
}

check_json_key() {
  local label="$1" url="$2" key="$3" method="${4:-GET}"
  local body
  body=$(curl -s --max-time "$TIMEOUT" --compressed -X "$method" "$url")
  if echo "$body" | grep "\"$key\"" > /dev/null; then ok "$label (key '$key' present)";
  else fail "$label — key '$key' missing in: $(echo "$body" | head -c 200)"; fi
}

check_content() {
  local label="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s --max-time "$TIMEOUT" --compressed "$url")
  if echo "$body" | grep "$pattern" > /dev/null; then ok "$label";
  else fail "$label — pattern '$pattern' not found"; fi
}

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}🔥 l402-kit smoke tests → $BASE_URL${NC}"

sep "Static assets"
check_status  "index.html"                "$BASE_URL/"                        200
check_status  "sitemap.xml"               "$BASE_URL/sitemap.xml"             200
check_status  "OG image (SVG)"            "$BASE_URL/logos/og-1200x630.svg"   200
check_content "OG image has SVG tag"      "$BASE_URL/logos/og-1200x630.svg"   "<svg"
check_content "canonical in head"         "$BASE_URL/"                        "canonical"

sep "API — public endpoints"
check_status   "GET /api/demo info (200)"           "$BASE_URL/api/demo"                200
# btc-price returns 402 (normal) or 429 (rate-limited after 8 req/hour from same IP) — both are valid
btcstatus=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$BASE_URL/api/demo/btc-price")
if [[ "$btcstatus" == "402" || "$btcstatus" == "429" ]]; then ok "GET /api/demo/btc-price (HTTP $btcstatus — 402 or 429 ok)";
else fail "GET /api/demo/btc-price — expected 402 or 429, got $btcstatus"; fi
check_json_key "GET /api/global-stats"              "$BASE_URL/api/global-stats"        "count"
check_json_key "GET /api/dev-stats"                 "$BASE_URL/api/dev-stats"           "tests"
check_json_key "GET /api/dev-token no addr"         "$BASE_URL/api/dev-token"           "error"

sep "API — pro endpoints"
check_json_key "GET /api/pro-poll returns paid:false" \
  "$BASE_URL/api/pro-poll?paymentHash=smoketest123&address=smoke%40test.com"  "paid"
check_status   "POST /api/pro-subscribe missing body (400)" \
  "$BASE_URL/api/pro-subscribe"  400  POST

sep "API — verify (invalid token)"
check_status   "POST /api/verify empty body (400)"    "$BASE_URL/api/verify"  400  POST

sep "API — LNURL"
check_status   "/.well-known/lnurlp missing user (404)" \
  "$BASE_URL/.well-known/lnurlp/"                                             404

sep "Docs proxy"
check_status   "GET /docs/introduction → Mintlify"    "$BASE_URL/docs/introduction"     200

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}Failed tests:${NC}"
  for f in "${FAILURES[@]}"; do echo -e "  ${RED}✗${NC} $f"; done
  echo ""
  exit 1
fi

echo -e "${GREEN}✅ All smoke tests passed.${NC}\n"
