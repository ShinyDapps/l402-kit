#!/bin/bash
# Submit VERITY services to 402index.io
# Rate limit: 10/hour per IP. Submit 10 services; alpha (11th) waits.

BASE="https://402index.io/api/v1/register"
LOGFILE="/c/Users/thiag/l402-kit/.402index-submissions.log"
echo "=== 402 Index submissions $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOGFILE"

submit() {
  local name="$1" url="$2" method="$3" price="$4" desc="$5" cat="$6"
  local body
  body=$(printf '{"url":"%s","name":"%s","protocol":"L402","http_method":"%s","price_sats":%s,"description":"%s","category":"%s","provider":"VERITY (l402-kit)","contact_email":"shinydapps@blink.sv","payment_asset":"BTC","payment_network":"lightning"}' \
    "$url" "$name" "$method" "$price" "$desc" "$cat")
  echo ""
  echo "→ $name ($price sats, $method)"
  resp=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "$resp"
  echo "$name | $resp" >> "$LOGFILE"
}

submit "VERITY BTC Price"     "https://l402kit.com/api/verity/btc-price"     "GET"  100   "Real-time Bitcoin price in USD/EUR/BRL" "data"
submit "VERITY Web Search"    "https://l402kit.com/api/verity/search?q=test" "GET"  500   "Web search top 10 organic results"      "search"
submit "VERITY World State"   "https://l402kit.com/api/verity/worldstate"    "GET"  300   "UTC time + caller geolocation + local weather" "data"
submit "VERITY Domain Intel"  "https://l402kit.com/api/verity/domain-intel?domain=example.com" "GET" 2000 "WHOIS + DNS + SSL certs" "intelligence"
submit "VERITY Web Scrape"    "https://l402kit.com/api/verity/scrape"        "POST" 500   "Full page content as markdown"          "scraping"
submit "VERITY Summarize"     "https://l402kit.com/api/verity/summarize"     "POST" 500   "AI summarization up to 50000 chars"     "ai"
submit "VERITY Sentiment"     "https://l402kit.com/api/verity/sentiment"     "POST" 300   "Sentiment analysis score+confidence"    "ai"
submit "VERITY Translate"     "https://l402kit.com/api/verity/translate"     "POST" 500   "Professional translation 11 locales MDX-aware" "ai"
submit "VERITY Research"      "https://l402kit.com/api/verity/research"      "POST" 2000  "Search+scrape+AI summary bundle"        "research"
submit "VERITY Integration"   "https://l402kit.com/api/verity/integration"   "POST" 200000 "L402 codebase analysis and integration code" "consulting"

echo ""
echo "(alpha — 11th — will be submitted after rate limit window)"
