import type { Env } from "../worker";

export async function handleCheckout(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  const tier = url.searchParams.get("tier") ?? "pro";

  return new Response(checkoutHtml(address, tier, env.SUPABASE_URL, env.SUPABASE_ANON_KEY), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function checkoutHtml(address: string, tier: string, supabaseUrl: string, supabaseKey: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Safe for inline <script> injection: escape HTML-significant chars as unicode escapes
  const safeJson = (val: string) => JSON.stringify(val).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const tierLabel: Record<string, string> = { pro: "Pro", business: "Business", lifetime: "Lifetime" };
  const tierUsd: Record<string, number> = { pro: 9, business: 99, lifetime: 999 };
  const usd = tierUsd[tier] ?? 9;
  const label = tierLabel[tier] ?? "Pro";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>⚡ Upgrade to ${label} — l402-kit</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b0b0b;color:#d0d0d0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#111;border:1px solid #222;border-radius:16px;padding:32px;max-width:400px;width:100%;text-align:center}
.logo{font-size:28px;margin-bottom:8px}
h1{font-size:18px;font-weight:700;color:#f7931a;margin-bottom:4px}
.addr{font-size:11px;color:#555;margin-bottom:24px;word-break:break-all}
.price-box{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:10px;padding:14px;margin-bottom:20px}
.price-big{font-size:28px;font-weight:700;color:#f7931a}
.price-sub{font-size:11px;color:#555;margin-top:4px}
.features{font-size:11px;color:#666;line-height:1.9;margin-bottom:20px;text-align:left}
.qr-wrap{margin:0 auto 16px;width:200px;height:200px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.qr-wrap img{width:200px;height:200px}
.invoice-box{background:#0d0d0d;border:1px solid #222;border-radius:8px;padding:10px;margin-bottom:12px;font-family:monospace;font-size:9px;color:#666;word-break:break-all;text-align:left;max-height:60px;overflow:hidden;position:relative}
.copy-btn{width:100%;padding:10px;background:#f7931a;color:#000;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:12px}
.copy-btn:hover{background:#ffa640}
.copy-btn:active{background:#d97b0a}
.status{font-size:12px;color:#555;margin-top:8px;min-height:20px}
.loading-state{color:#888;font-size:13px;padding:40px 0}
.success{display:none;padding:24px 0}
.success-icon{font-size:48px;margin-bottom:12px}
.success-title{font-size:18px;font-weight:700;color:#22c55e;margin-bottom:8px}
.success-sub{font-size:12px;color:#666}
.error-state{display:none;color:#ef4444;font-size:12px;padding:16px 0}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #333;border-top-color:#f7931a;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.powered{font-size:10px;color:#333;margin-top:20px}
.powered a{color:#444;text-decoration:none}
.powered a:hover{color:#f7931a}
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡</div>
  <h1>Upgrade to l402-kit ${esc(label)}</h1>
  <div class="addr">${esc(address) || "No address"}</div>

  <div id="loadingState" class="loading-state">
    <span class="spinner"></span> Generating invoice…
  </div>

  <div id="invoiceState" style="display:none">
    <div class="price-box">
      <div class="price-big" id="priceEl">… sats</div>
      <div class="price-sub">$${usd} / month · pay with Bitcoin Lightning</div>
    </div>
    <div class="features">
      ✓ Full payment history<br>
      ✓ 30D / 1Y / ALL chart ranges<br>
      ✓ CSV export<br>
      ✓ 30-day subscription
    </div>
    <div class="qr-wrap" id="qrWrap">
      <span style="color:#ccc;font-size:11px">Loading QR…</span>
    </div>
    <div class="invoice-box" id="invoiceBox"></div>
    <button class="copy-btn" id="copyBtn">⚡ Copy invoice</button>
    <div class="status" id="statusEl"><span class="spinner"></span> Waiting for payment…</div>
  </div>

  <div id="errorState" class="error-state"></div>

  <div id="successState" class="success">
    <div class="success-icon">⚡</div>
    <div class="success-title">Pro activated!</div>
    <div class="success-sub">Go back to VS Code — your dashboard is now unlocked.</div>
  </div>

  <div class="powered">Secured by <a href="https://l402kit.com" target="_blank">l402kit.com</a></div>
</div>

<script>
(function(){
const ADDR = ${safeJson(address)};
const TIER = ${safeJson(tier)};
const SB_URL = ${safeJson(supabaseUrl)};
const SB_KEY = ${safeJson(supabaseKey)};

let paymentHash = '';
let pollTimer = null;

async function init() {
  if (!ADDR) { showError('No Lightning address provided. Please go back and configure one.'); return; }
  try {
    const r = await fetch('/api/pro-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lightningAddress: ADDR, tier: TIER }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); showError(d.error || 'Failed to create invoice (HTTP ' + r.status + ')'); return; }
    const d = await r.json();
    paymentHash = d.paymentHash;
    showInvoice(d.paymentRequest, d.amountSats);
    startPolling();
  } catch(e) {
    showError('Network error — ' + (e && e.message ? e.message : 'check your connection'));
  }
}

function showInvoice(pr, sats) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('invoiceState').style.display = 'block';
  document.getElementById('priceEl').textContent = sats.toLocaleString() + ' sats';
  document.getElementById('invoiceBox').textContent = pr;
  document.getElementById('copyBtn').addEventListener('click', function() {
    navigator.clipboard.writeText(pr).then(function() {
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✓ Copied!';
      setTimeout(function() { btn.textContent = '⚡ Copy invoice'; }, 2000);
    });
  });
  // QR via api.qrserver.com — lightning: URI works with all wallets
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent('lightning:' + pr.toLowerCase());
  const img = document.createElement('img');
  img.src = qrUrl;
  img.alt = 'Payment QR code';
  document.getElementById('qrWrap').innerHTML = '';
  document.getElementById('qrWrap').appendChild(img);
}

function startPolling() {
  pollTimer = setInterval(async function() {
    try {
      const r = await fetch('/api/pro-poll?paymentHash=' + encodeURIComponent(paymentHash) + '&address=' + encodeURIComponent(ADDR) + '&tier=' + TIER);
      if (!r.ok) return;
      const d = await r.json();
      if (d.paid) { clearInterval(pollTimer); showSuccess(); }
    } catch(_) {}
  }, 3000);
}

function showSuccess() {
  document.getElementById('invoiceState').style.display = 'none';
  document.getElementById('successState').style.display = 'block';
}

function showError(msg) {
  document.getElementById('loadingState').style.display = 'none';
  const el = document.getElementById('errorState');
  el.style.display = 'block';
  el.textContent = '⚠ ' + msg;
}

init();
})();
</script>
</body>
</html>`;
}
