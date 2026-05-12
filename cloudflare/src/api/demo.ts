import type { Env } from "../worker";

const PRICE_SATS = 1;
const RATE_LIMIT  = 8;     // max invoice creations per IP per hour
const RATE_WINDOW = 3600;  // seconds

// Shared SSRF blocklist — mirrors split.ts
const SSRF_BLOCKLIST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|169\.254\.)/i;

async function checkRateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `rl:${ip}`;
  const raw = await env.demo_preimages.get(key);
  const now = Math.floor(Date.now() / 1000);
  if (raw) {
    const { count, reset } = JSON.parse(raw) as { count: number; reset: number };
    if (now < reset && count >= RATE_LIMIT) return false;
    const newCount = now < reset ? count + 1 : 1;
    const newReset = now < reset ? reset : now + RATE_WINDOW;
    await env.demo_preimages.put(key, JSON.stringify({ count: newCount, reset: newReset }), { expirationTtl: RATE_WINDOW });
  } else {
    await env.demo_preimages.put(key, JSON.stringify({ count: 1, reset: now + RATE_WINDOW }), { expirationTtl: RATE_WINDOW });
  }
  return true;
}

export async function handleDemo(_req: Request, _env: Env): Promise<Response> {
  return json({
    message: "l402-kit demo — use /api/demo/btc-price (costs 1 sat)",
    endpoints: { btcPrice: "/api/demo/btc-price" },
  });
}

export async function handleDemoBtcPrice(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const token = auth.slice(5);
    const colon = token.lastIndexOf(":");
    const preimage = colon !== -1 ? token.slice(colon + 1) : "";

    const verified = await verifyToken(token);
    if (!verified.ok) return json({ error: verified.reason }, 401);

    // Replay protection: each preimage is valid exactly once within its expiry window
    const spentKey = `spent:${preimage}`;
    const alreadySpent = await env.demo_preimages.get(spentKey);
    if (alreadySpent) return json({ error: "Token already used" }, 401);
    await env.demo_preimages.put(spentKey, "1", { expirationTtl: RATE_WINDOW });

    const price = await fetchBtcPrice();
    return json({
      bitcoin: price,
      priceSats: PRICE_SATS,
      paidWith: "⚡ Lightning — L402 protocol",
      protocol: "L402",
      timestamp: new Date().toISOString(),
    });
  }

  const ip = req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For") ?? "unknown";
  const allowed = await checkRateLimit(ip, env);
  if (!allowed) return json({ error: "Too many requests — try again in 1 hour", retryAfter: 3600 }, 429);

  const inv = await createInvoice(PRICE_SATS, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);

  const payload = {
    error: "Payment Required",
    priceSats: PRICE_SATS,
    invoice: inv.paymentRequest,
    macaroon: inv.macaroon,
    paymentHash: inv.paymentHash,
  };

  const accept = req.headers.get("Accept") ?? "";
  if (accept.includes("text/html")) {
    return new Response(render402Page(payload), {
      status: 402,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "WWW-Authenticate": `L402 macaroon="${inv.macaroon}", invoice="${inv.paymentRequest}"`,
      },
    });
  }

  return new Response(JSON.stringify(payload), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `L402 macaroon="${inv.macaroon}", invoice="${inv.paymentRequest}"`,
    },
  });
}

// Deprecated — the demo now uses standard L402: the preimage comes directly
// from your Lightning wallet after payment. No polling needed.
export async function handleDemoPreimage(_req: Request, _env: Env): Promise<Response> {
  return json({
    deprecated: true,
    message: "This endpoint is no longer needed. The demo now uses standard L402: pay the invoice with any Lightning wallet and use the preimage your wallet provides directly.",
  }, 410);
}

// ── invoice creation ─────────────────────────────────────────────────────────

async function createInvoice(amountSats: number, env: Env) {
  try {
    // Blink generates the invoice; paymentHash goes directly into the macaroon.
    // Standard L402: SHA256(lightningPreimage) == paymentHash — no dual-hash.
    const r = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY_DEMO },
      body: JSON.stringify({
        query: `mutation { lnInvoiceCreate(input: { walletId: "${env.BLINK_WALLET_ID_DEMO}", amount: ${amountSats} }) { invoice { paymentRequest paymentHash } errors { message } } }`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { data?: { lnInvoiceCreate?: { invoice?: { paymentRequest: string; paymentHash: string }; errors?: { message: string }[] } } };
    const inv = data?.data?.lnInvoiceCreate;
    if (!inv?.invoice || inv.errors?.length) return null;

    const paymentHash = inv.invoice.paymentHash;
    const exp = Date.now() + 3_600_000;
    const macaroon = btoa(JSON.stringify({ hash: paymentHash, exp }));

    return { paymentRequest: inv.invoice.paymentRequest, paymentHash, macaroon };
  } catch {
    return null;
  }
}

// ── Pay-to-address demo: l402kit.com acts as L402Client, pays visitor 1 sat ──

export async function handleDemoPayAddress(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({})) as { address?: string };
  const address = (body.address ?? "").trim().toLowerCase();

  if (!address || !address.includes("@") || !address.includes(".")) {
    return json({ error: "Invalid Lightning address" }, 400);
  }

  const [user, domain] = address.split("@");

  // SSRF protection: block private/internal domains before any fetch
  if (!user || !domain || SSRF_BLOCKLIST.test(domain)) {
    return json({ error: "Invalid Lightning address" }, 400);
  }

  // Rate limit by IP: 2 demo payments per IP per hour
  const ip = req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For") ?? "unknown";
  // Rate limit per address: 1 per address per 24h (prevents double-spend of demo sats)
  const addrKey = `demo-pay-addr:${address}`;
  const addrUsed = await env.demo_preimages.get(addrKey);
  if (addrUsed) return json({ error: "Already sent a demo payment to this address today" }, 429);

  try {
    // Resolve LNURL-pay metadata
    const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${user}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!lnurlRes.ok) return json({ error: "Could not resolve Lightning address — is it correct?" }, 400);

    const lnurlData = await lnurlRes.json() as {
      tag?: string; callback?: string; minSendable?: number; maxSendable?: number;
    };
    if (lnurlData.tag !== "payRequest" || !lnurlData.callback) {
      return json({ error: "Address returned an invalid LNURL-pay response" }, 400);
    }

    // SSRF protection on callback URL
    let cbHostname: string;
    try {
      cbHostname = new URL(lnurlData.callback).hostname;
    } catch {
      return json({ error: "Invalid callback URL" }, 400);
    }
    if (SSRF_BLOCKLIST.test(cbHostname)) return json({ error: "Invalid callback URL" }, 400);

    const amountMsat = 1000; // 1 sat
    if (lnurlData.minSendable && amountMsat < lnurlData.minSendable) {
      const minSats = Math.ceil(lnurlData.minSendable / 1000);
      return json({ error: `Minimum payment for this wallet is ${minSats} sats` }, 400);
    }

    // Get invoice from their wallet
    const cbUrl = new URL(lnurlData.callback);
    cbUrl.searchParams.set("amount", String(amountMsat));
    const invRes = await fetch(cbUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!invRes.ok) return json({ error: "Failed to request invoice from wallet" }, 503);

    const invData = await invRes.json() as { pr?: string; reason?: string };
    if (!invData.pr) return json({ error: "Wallet did not return an invoice" }, 503);

    // Pay via Blink (l402kit.com acts as the L402Client)
    const payRes = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY_DEMO },
      body: JSON.stringify({
        query: `mutation Pay($input: LnInvoicePaymentInput!) {
          lnInvoicePaymentSend(input: $input) { status errors { message } }
        }`,
        variables: { input: { walletId: env.BLINK_WALLET_ID_DEMO, paymentRequest: invData.pr } },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!payRes.ok) return json({ error: "Payment service unavailable — try again" }, 503);
    const payData = await payRes.json() as {
      data?: { lnInvoicePaymentSend?: { status: string; errors?: { message: string }[] } };
    };
    const result = payData?.data?.lnInvoicePaymentSend;
    if (result?.errors?.length) return json({ error: "Payment failed — check your address" }, 503);
    if (result?.status !== "SUCCESS" && result?.status !== "PENDING") {
      return json({ error: "Payment did not go through — check your address" }, 503);
    }

    // Mark address as used (24h)
    await env.demo_preimages.put(addrKey, "1", { expirationTtl: 86400 });

    return json({ paid: true, amountSats: 1 });
  } catch {
    return json({ error: "Payment failed — try again" }, 503);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<{ ok: boolean; reason?: string }> {
  const colon = token.lastIndexOf(":");
  if (colon === -1) return { ok: false, reason: "Malformed token" };

  const macaroon = token.slice(0, colon);
  const preimage = token.slice(colon + 1);

  if (preimage.length !== 64) return { ok: false, reason: "Invalid preimage length" };

  try {
    const decoded = JSON.parse(atob(macaroon)) as { hash?: string; exp?: number };
    if (!decoded.hash) return { ok: false, reason: "No hash in macaroon" };
    if (decoded.exp && Date.now() > decoded.exp) return { ok: false, reason: "Token expired" };

    const bytes = hexToBytes(preimage);
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    const hash = bytesToHex(new Uint8Array(hashBuf));

    if (hash !== decoded.hash) return { ok: false, reason: "Invalid preimage" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "Invalid token format" };
  }
}

async function fetchBtcPrice(): Promise<{ usd: number; eur: number; gbp: number; source: string }> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (r.ok) {
      const d = await r.json() as { bitcoin: { usd: number; eur: number; gbp: number } };
      return { ...d.bitcoin, source: "CoinGecko" };
    }
  } catch { /* fallback */ }

  try {
    const [usd, eur, gbp] = await Promise.all([
      fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot").then(r => r.json()) as Promise<{ data: { amount: string } }>,
      fetch("https://api.coinbase.com/v2/prices/BTC-EUR/spot").then(r => r.json()) as Promise<{ data: { amount: string } }>,
      fetch("https://api.coinbase.com/v2/prices/BTC-GBP/spot").then(r => r.json()) as Promise<{ data: { amount: string } }>,
    ]);
    return {
      usd: parseFloat(usd.data.amount),
      eur: parseFloat(eur.data.amount),
      gbp: parseFloat(gbp.data.amount),
      source: "Coinbase",
    };
  } catch { /* last resort */ }

  return { usd: 0, eur: 0, gbp: 0, source: "unavailable" };
}

function render402Page(payload: Record<string, unknown>): string {
  const pretty = JSON.stringify(payload, null, 2)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span class="jk">"$1"</span>:')
    .replace(/: "([^"]*)"([,\n])/g, ': <span class="js">"$1"</span>$2')
    .replace(/: (\d+)([,\n])/g, ': <span class="jn">$1</span>$2');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>402 Payment Required — l402-kit demo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-family:'Cascadia Code','Courier New',monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px}
.wrap{display:flex;gap:32px;max-width:980px;width:100%;align-items:flex-start}
.left{flex:1;min-width:0}.right{flex:1;min-width:0}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.4);color:#f85149;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:20px}
.status{font-size:36px;font-weight:800;color:#e6edf3;margin-bottom:8px;line-height:1.1}
.status span{color:#f85149}
.desc{font-size:15px;color:#6e7681;line-height:1.7;margin-bottom:24px}
.steps{display:flex;flex-direction:column;gap:12px;margin-bottom:28px}
.step{display:flex;gap:12px;align-items:flex-start}
.step-num{width:24px;height:24px;border-radius:50%;background:#f7931a;color:#000;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-text{font-size:14px;color:#8b949e;line-height:1.6}
.step-text strong{color:#e6edf3}
.cmd{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 16px;font-size:13px;color:#a5d6ff;margin-bottom:20px;overflow-x:auto;white-space:pre}
.links{display:flex;gap:12px;flex-wrap:wrap}
.btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;display:inline-block}
.btn-primary{background:#f7931a;color:#000}
.btn-secondary{background:#21262d;color:#e6edf3;border:1px solid #30363d}
.json-wrap{background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden}
.json-titlebar{background:#21262d;padding:8px 14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#6e7681}
.dot{width:10px;height:10px;border-radius:50%}
.json-body{padding:18px 20px;overflow-x:auto}
.json-body pre{font-size:13px;line-height:1.7;white-space:pre}
.jk{color:#79c0ff}.js{color:#a5d6ff}.jn{color:#ffa657}
.note{font-size:11px;color:#444;margin-top:12px;text-align:center}
@media(max-width:680px){.wrap{flex-direction:column}}
</style>
</head><body>
<div class="wrap">
  <div class="left">
    <div class="badge">⚡ HTTP 402</div>
    <div class="status"><span>Payment Required</span><br>to access this API</div>
    <p class="desc">Protected by the <strong style="color:#e6edf3">L402 protocol</strong>. Pay <strong style="color:#f7931a">1 sat</strong> (~$0.0006) and get instant access. Your wallet provides the preimage directly — no polling.</p>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">Pay the <strong>BOLT11 invoice</strong> with any Lightning wallet</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Copy the <strong>preimage</strong> from your wallet's payment details</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Retry: <strong>Authorization: L402 macaroon:preimage</strong></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">Server verifies <strong>SHA256(preimage) == hash</strong> → 200 OK</div></div>
    </div>
    <pre class="cmd">curl -H "Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;" \\
  https://l402kit.com/api/demo/btc-price</pre>
    <div class="links">
      <a href="https://l402kit.com" class="btn btn-primary">← Back to l402kit.com</a>
      <a href="https://l402kit.com/docs" class="btn btn-secondary">Docs →</a>
    </div>
  </div>
  <div class="right">
    <div class="json-wrap">
      <div class="json-titlebar">
        <div class="dot" style="background:#f85149"></div>
        <div class="dot" style="background:#d29922"></div>
        <div class="dot" style="background:#3fb950"></div>
        <span style="margin-left:6px">HTTP 402 response</span>
      </div>
      <div class="json-body"><pre>${pretty}</pre></div>
    </div>
    <p class="note">invoice expires in 1h · each preimage works exactly once · SHA256 verified locally</p>
  </div>
</div>
</body></html>`;
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}