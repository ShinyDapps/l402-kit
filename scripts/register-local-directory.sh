#!/bin/bash
# Register all 11 VERITY services in our own l402kit.com/api/apis.json registry
BASE="https://l402kit.com/api/register"
LA="shinydapps@blink.sv"
LOG="/c/Users/thiag/l402-kit/.local-registry-submissions.log"
echo "=== Local registry submissions $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"

submit() {
  local name="$1" url="$2" price="$3" desc="$4" cat="$5"
  local body
  body=$(printf '{"url":"%s","name":"%s","price_sats":%s,"description":"%s","category":"%s","lightning_address":"%s"}' \
    "$url" "$name" "$price" "$desc" "$cat" "$LA")
  echo ""
  echo "→ $name ($price sats, $cat)"
  resp=$(curl -s -w "\nHTTP:%{http_code}" -X POST "$BASE" -H "Content-Type: application/json" -d "$body")
  echo "$resp"
  echo "$name | $resp" >> "$LOG"
}

submit "VERITY BTC Price"     "https://l402kit.com/api/verity/btc-price"     100    "Real-time Bitcoin price in USD, EUR, BRL"                                "finance"
submit "VERITY World State"   "https://l402kit.com/api/verity/worldstate"    300    "UTC time + caller geolocation + local weather in one call"               "weather"
submit "VERITY Sentiment"     "https://l402kit.com/api/verity/sentiment"     300    "Sentiment analysis with score, confidence, and keywords"                 "ai"
submit "VERITY Web Search"    "https://l402kit.com/api/verity/search"        500    "Web search returning top 10 organic results"                             "ai"
submit "VERITY Web Scrape"    "https://l402kit.com/api/verity/scrape"        500    "Full page content as markdown, JS-rendered via Firecrawl"                "data"
submit "VERITY Summarize"     "https://l402kit.com/api/verity/summarize"     500    "AI summarization of text up to 50000 characters"                         "ai"
submit "VERITY Translate"     "https://l402kit.com/api/verity/translate"     500    "Professional translation in 11 locales, MDX-aware"                       "ai"
submit "VERITY Domain Intel"  "https://l402kit.com/api/verity/domain-intel"  2000   "WHOIS + DNS + SSL certificates in one call"                              "data"
submit "VERITY Research"      "https://l402kit.com/api/verity/research"      2000   "Deep research bundle - search + scrape + AI summary"                     "ai"
submit "VERITY Alpha"         "https://l402kit.com/api/verity/alpha"         5000   "Crypto-native strategist intelligence - alpha windows, narrative cycles" "ai"
submit "VERITY l402-kit Integration" "https://l402kit.com/api/verity/integration" 200000 "L402 integration code from any GitHub repo - replaces a consultant" "other"
