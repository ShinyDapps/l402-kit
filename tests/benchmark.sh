#!/usr/bin/env bash
# l402-kit Worker throughput benchmark
# Usage: bash tests/benchmark.sh [base_url]
# Requires: curl, bc

BASE=${1:-https://l402kit.com}
CONCURRENCY=10
REQUESTS=100

echo "=== l402-kit Benchmark ==="
echo "Target: $BASE"
echo "Requests: $REQUESTS | Concurrency: $CONCURRENCY"
echo ""

# Helper: measure endpoint latency (N sequential calls)
bench() {
  local label=$1 url=$2 method=${3:-GET} body=$4
  local total=0 count=20 errors=0

  for i in $(seq 1 $count); do
    if [ -n "$body" ]; then
      ms=$(curl -s -o /dev/null -w "%{time_total}" -X "$method" \
        -H "Content-Type: application/json" -d "$body" "$url" 2>/dev/null)
    else
      ms=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null)
    fi
    if [ $? -ne 0 ]; then ((errors++)); continue; fi
    total=$(echo "$total + $ms" | bc)
  done

  local good=$((count - errors))
  if [ $good -gt 0 ]; then
    avg=$(echo "scale=3; $total / $good * 1000" | bc)
    echo "  [$label] avg: ${avg}ms over $good calls (${errors} errors)"
  else
    echo "  [$label] all $count calls failed"
  fi
}

echo "--- Endpoint latency (20 calls each) ---"
bench "GET  /api/apis.json"       "$BASE/api/apis.json"
bench "POST /api/invoice (1 sat)" "$BASE/api/invoice" POST '{"amountSats":1,"ownerAddress":"shinydapps@blink.sv"}'
bench "POST /api/verify (invalid)" "$BASE/api/verify" POST '{"token":"invalid:token"}'
bench "GET  /api/global-stats"    "$BASE/api/global-stats"

echo ""
echo "--- Concurrent load ($CONCURRENCY parallel, $REQUESTS total) ---"
start_time=$(date +%s%3N)
success=0; fail=0
for i in $(seq 1 $REQUESTS); do
  curl -s -o /dev/null "$BASE/api/apis.json" &
  if (( i % CONCURRENCY == 0 )); then wait; fi
done
wait
end_time=$(date +%s%3N)
elapsed=$((end_time - start_time))
rps=$(echo "scale=1; $REQUESTS * 1000 / $elapsed" | bc)
echo "  $REQUESTS requests in ${elapsed}ms → ~${rps} req/sec"

echo ""
echo "--- Token verification throughput (local, no network) ---"
node -e "
const { verifyToken } = require('./dist/verify');
const { createHash, randomBytes } = require('crypto');

function makeToken() {
  const pre = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(Buffer.from(pre,'hex')).digest('hex');
  const mac = Buffer.from(JSON.stringify({hash, exp: Date.now()+3600000})).toString('base64');
  return mac + ':' + pre;
}

const tokens = Array.from({length: 1000}, makeToken);
const start = Date.now();
Promise.all(tokens.map(t => verifyToken(t))).then(results => {
  const elapsed = Date.now() - start;
  const passed = results.filter(Boolean).length;
  console.log('  1000 verifyToken calls: ' + elapsed + 'ms → ' + Math.round(1000000/elapsed) + ' verifications/sec');
  console.log('  All valid: ' + (passed === 1000 ? 'YES' : 'NO (' + passed + '/1000)'));
});
" 2>/dev/null || echo "  (run 'npm run build' first)"

echo ""
echo "=== Done ==="
