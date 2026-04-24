#!/usr/bin/env bash
# ── UI / Functional Audit — l402kit.com ─────────────────────────────────────
# Tests every critical link, button target, API integration, and JS function
# that should work on the landing page.
#
# Usage:
#   bash tests/audit-ui.sh
#   BASE_URL=http://localhost:8787 bash tests/audit-ui.sh

set -euo pipefail
BASE_URL="${BASE_URL:-https://l402kit.com}"
TIMEOUT=12

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0; FAILURES=()

ok()   { echo -e "${GREEN}  ✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗${NC} $1"; FAILURES+=("$1"); FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; WARN=$((WARN+1)); }
sep()  { echo -e "\n${CYAN}${BOLD}── $1 ──────────────────────────────────────${NC}"; }

# helpers
status() { curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -L "$1"; }
body()   { curl -s --max-time "$TIMEOUT" --compressed -L "$1"; }
has()    { echo "$2" | grep "$1" > /dev/null 2>&1; }
jkey()   { echo "$1" | grep "\"$2\"" > /dev/null 2>&1; }

echo -e "\n${BOLD}🔍 l402-kit UI Audit → $BASE_URL${NC}"

# ── 1. Static pages ───────────────────────────────────────────────────────────
sep "Static pages"
idx=$(body "$BASE_URL/")
[[ "${#idx}" -gt 50000 ]] && ok "index.html loaded (${#idx} bytes)" || fail "index.html too small (${#idx} bytes)"
[[ "$(status "$BASE_URL/sitemap.xml")" == "200" ]] && ok "sitemap.xml 200" || fail "sitemap.xml not 200"
[[ "$(status "$BASE_URL/logos/og-1200x630.svg")" == "200" ]] && ok "OG image 200" || fail "OG image missing"
has "<svg" "$(body "$BASE_URL/logos/og-1200x630.svg")" && ok "OG image is valid SVG" || fail "OG image not SVG"
has "dashboard.html" "$idx" && ok "dashboard.html link present" || fail "dashboard.html link missing"

# ── 2. Head / SEO ────────────────────────────────────────────────────────────
sep "SEO / Head"
has 'rel="canonical"' "$idx"           && ok "canonical link" || fail "canonical link missing"
has 'og:title'        "$idx"           && ok "og:title meta" || fail "og:title missing"
has 'og:image'        "$idx"           && ok "og:image meta" || fail "og:image missing"
has 'application/ld+json' "$idx"       && ok "JSON-LD present" || fail "JSON-LD missing"
has 'rel="sitemap"'   "$idx"           && ok "sitemap link in head" || fail "sitemap link missing"
has 'integrity='      "$idx"           && ok "SRI attribute present" || fail "SRI missing on CDN scripts"

# ── 3. Navbar links ───────────────────────────────────────────────────────────
sep "Navbar links"
has 'href="#"'        "$idx"           && ok "logo links to top (#)" || fail "logo not linked to top"
has 'href="#how"'     "$idx"           && ok "Como funciona anchor" || fail "#how anchor missing"
has 'href="#pricing"' "$idx"           && ok "Precos anchor" || fail "#pricing anchor missing"
has 'target="_blank".*Docs\|Docs.*target="_blank"' "$idx" && ok "Docs opens new tab" || {
  has 'navDocsLink' "$idx" && has 'target="_blank"' "$idx" && ok "Docs opens new tab" || fail "Docs link missing target=_blank"
}
has 'href="dashboard.html"' "$idx"     && ok "Painel link present" || fail "Painel link missing"
# Verify NO dead docs.l402kit.com links remain
if echo "$idx" | grep "docs\.l402kit\.com" > /dev/null 2>&1; then
  fail "Found dead docs.l402kit.com links in HTML — should be l402kit.com/docs"
else
  ok "No dead docs.l402kit.com links"
fi

# ── 4. Docs redirect (all paths → Mintlify) ──────────────────────────────────
sep "Docs redirect (l402kit.com/docs/* → Mintlify 302)"
# bare /docs
s=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 --max-redirs 0 "$BASE_URL/docs" 2>/dev/null || echo "000")
[[ "$s" == "302" ]] && ok "/docs (bare) → 302 redirect" || fail "/docs (bare) → $s (expected 302)"
# path variants
for path in "introduction" "quickstart" "providers" "guides/ai-agents"; do
  s=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 --max-redirs 0 "$BASE_URL/docs/$path" 2>/dev/null || echo "000")
  redir=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 8 --max-redirs 0 "$BASE_URL/docs/$path" 2>/dev/null)
  if [[ "$s" == "302" ]] && echo "$redir" | grep "mintlify" > /dev/null 2>&1; then
    ok "/docs/$path → 302 → Mintlify"
  elif [[ "$s" == "302" ]]; then
    fail "/docs/$path → 302 but redirect not to Mintlify: $redir"
  else
    fail "/docs/$path → $s (expected 302)"
  fi
done

# ── 5. Quickstart code block ─────────────────────────────────────────────────
sep "Quickstart section (HTML)"
has 'class="qs-tab'        "$idx" && ok "qs-tab class present" || fail "qs-tab class missing"
has 'id="qs-install-text"' "$idx" && ok "qs-install-text element" || fail "qs-install-text missing"
has 'id="qs-code-body"'    "$idx" && ok "qs-code-body element" || fail "qs-code-body missing"
has 'id="qs-docs-link"'    "$idx" && ok "qs-docs-link element" || fail "qs-docs-link missing"
has 'switchQsLang'         "$idx" && ok "switchQsLang function" || fail "switchQsLang JS missing"
has 'copyQsInstall'        "$idx" && ok "copyQsInstall function" || fail "copyQsInstall JS missing"
has 'AI agents pay natively' "$idx" && ok "AI agents badge text" || fail "AI agents badge missing"
has '\[·-·\]'              "$idx" && ok "Robot ASCII art present" || fail "Robot ASCII art missing"
has "id=\"qs-scaffold"     "$idx" && ok "scaffold chip present" || fail "scaffold chip missing"

# ── 5b. Hero tabs (showTab) ────────────────────────────────────────────────────
sep "Hero code tabs"
has "function showTab(lang, el)" "$idx" && ok "showTab signature correct (lang, el)" || fail "showTab still uses global event — not fixed"
has "el.classList.add('active')" "$idx" && ok "showTab uses passed element (el.classList.add)" || fail "showTab still uses event.target"
for tabid in "tab-agent" "tab-ts" "tab-managed" "tab-py" "tab-go" "tab-rs"; do
  has "id=\"$tabid\"" "$idx" && ok "code pane #$tabid present" || fail "code pane #$tabid missing"
done
for lang in "agent" "ts" "managed" "py" "go" "rs"; do
  has "showTab('$lang',this)" "$idx" && ok "tab onclick passes this — showTab('$lang',this)" || fail "tab showTab('$lang') missing this arg"
done
has "class=\"tab active\"" "$idx" && ok "default tab has active class" || fail "no tab has active class"

# ── 5c. Language switcher ──────────────────────────────────────────────────────
sep "Language switcher"
has "function applyLanguage" "$idx" && ok "applyLanguage function" || fail "applyLanguage missing"
has "function syncDocsLinks" "$idx" && ok "syncDocsLinks function" || fail "syncDocsLinks missing"
has "id=\"languageSelect\""  "$idx" && ok "languageSelect element" || fail "languageSelect missing"
has "LANG_INFO"              "$idx" && ok "LANG_INFO object" || fail "LANG_INFO missing"
for lang in "en" "pt" "es" "fr" "de" "it" "ja" "ru" "zh" "hi" "ar"; do
  has "  $lang:" "$idx" && ok "LANG_INFO[$lang] present" || fail "LANG_INFO[$lang] missing"
done
# No dead docs.l402kit.com in any href
if echo "$idx" | grep 'href="https://docs\.l402kit\.com' > /dev/null 2>&1; then
  fail "Dead docs.l402kit.com href found — should be Mintlify direct URL"
else
  ok "No dead docs.l402kit.com hrefs"
fi
# Mintlify direct links present
has "shinydapps-bd9fa40b.mintlify.app" "$idx" && ok "Mintlify direct links present" || fail "Mintlify links missing"

# ── 6. API endpoints ─────────────────────────────────────────────────────────
sep "API endpoints"
b_stats=$(body "$BASE_URL/api/global-stats")
jkey "$b_stats" "count"     && ok "/api/global-stats has 'count'" || fail "/api/global-stats missing 'count'"
jkey "$b_stats" "totalSats" && ok "/api/global-stats has 'totalSats'" || fail "/api/global-stats missing 'totalSats'"

b_dev=$(body "$BASE_URL/api/dev-stats")
jkey "$b_dev" "tests"       && ok "/api/dev-stats has 'tests'" || fail "/api/dev-stats missing 'tests'"

b_devtok=$(body "$BASE_URL/api/dev-token")
jkey "$b_devtok" "error"    && ok "/api/dev-token no addr → error" || fail "/api/dev-token no addr wrong response"

s_verify=$(status "$BASE_URL/api/verify" 2>/dev/null || true)
# POST with no body
s_verify=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X POST "$BASE_URL/api/verify")
[[ "$s_verify" == "400" ]] && ok "POST /api/verify empty → 400" || fail "POST /api/verify → $s_verify (expected 400)"

s_sub=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X POST "$BASE_URL/api/pro-subscribe")
[[ "$s_sub" == "400" ]] && ok "POST /api/pro-subscribe no body → 400" || fail "POST /api/pro-subscribe → $s_sub"

b_poll=$(body "$BASE_URL/api/pro-poll?paymentHash=audit123&address=audit%40test.com")
jkey "$b_poll" "paid"       && ok "/api/pro-poll returns 'paid'" || fail "/api/pro-poll missing 'paid'"

s_demo=$(status "$BASE_URL/api/demo/btc-price")
[[ "$s_demo" == "402" || "$s_demo" == "429" ]] && ok "/api/demo/btc-price → $s_demo (402 or 429 ok)" || fail "/api/demo/btc-price → $s_demo"

# ── 7. LNURL ─────────────────────────────────────────────────────────────────
sep "LNURL"
s_lnurl=$(status "$BASE_URL/.well-known/lnurlp/")
[[ "$s_lnurl" == "404" ]] && ok "/.well-known/lnurlp/ (no user) → 404" || warn "/.well-known/lnurlp/ → $s_lnurl (expected 404)"

# ── 8. Pricing section ────────────────────────────────────────────────────────
sep "Pricing section"
has 'openProModal'  "$idx" && ok "openProModal function wired" || fail "openProModal missing"
has 'proModal'      "$idx" && ok "#proModal element present" || fail "#proModal missing"
has 'pro-subscribe' "$idx" && ok "/api/pro-subscribe referenced" || fail "pro-subscribe not referenced"
has 'tier-pro-sats' "$idx" && ok "#tier-pro-sats element" || fail "#tier-pro-sats missing"
has 'QRCode'        "$idx" && ok "QRCode library referenced" || fail "QRCode library missing"

# ── 9. External links in new tab ─────────────────────────────────────────────
sep "External links open in new tab"
# check that key external hrefs have target=_blank
for anchor in "github.com" "npmjs.com" "marketplace.visualstudio.com"; do
  if echo "$idx" | grep -o 'href="[^"]*'"$anchor"'[^"]*"[^>]*>' | grep 'target="_blank"' > /dev/null 2>&1; then
    ok "$anchor links have target=_blank"
  else
    warn "$anchor links may be missing target=_blank (check manually)"
  fi
done

# ── 10. Correct marketplace extension ID ─────────────────────────────────────
sep "VS Code extension link"
has 'dapp-agent-forge-vscode' "$idx" && ok "Correct extension ID (dapp-agent-forge-vscode)" || fail "Wrong/missing extension ID"
if echo "$idx" | grep "wallet-lab-forge" > /dev/null 2>&1; then
  fail "Old wrong extension ID (wallet-lab-forge) still present"
else
  ok "Old wrong ID (wallet-lab-forge) not found"
fi

# ── 11. Responsiveness ───────────────────────────────────────────────────────
sep "Responsiveness (CSS breakpoints)"
has 'max-width:768px'      "$idx" && ok "768px breakpoint present" || fail "768px breakpoint missing"
has 'max-width:480px'      "$idx" && ok "480px breakpoint present" || fail "480px breakpoint missing"
has 'qs-tab-bar'           "$idx" && ok "qs-tab-bar class (scrollable tabs)" || fail "qs-tab-bar missing — tabs may overflow"
has 'overflow-x:auto'      "$idx" && ok "overflow-x:auto on tab bar" || fail "tab bar missing overflow-x:auto"
has 'scrollbar-width:none' "$idx" && ok "scrollbar hidden on tab bar" || fail "scrollbar-width:none missing"
has 'extGrid'              "$idx" && ok "#extGrid element present" || fail "#extGrid missing"
# Confirm extGrid collapses in media query
has 'extGrid.*grid-template-columns:1fr\|grid-template-columns:1fr.*extGrid' "$idx" || \
  { echo "$idx" | grep -o '@media[^}]*extGrid[^}]*' > /dev/null 2>&1; } && ok "extGrid collapses in media query" || \
  warn "extGrid may not collapse on mobile (check manually)"
has 'white-space:nowrap'   "$idx" && ok "qs-tab white-space:nowrap" || fail "qs-tab missing white-space:nowrap"

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Results: ${GREEN}$PASS passed${NC}, ${YELLOW}$WARN warnings${NC}, ${RED}$FAIL failed${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}Failed:${NC}"
  for f in "${FAILURES[@]}"; do echo -e "  ${RED}✗${NC} $f"; done
  echo ""
  exit 1
fi

echo -e "${GREEN}✅ All audit checks passed.${NC}\n"
