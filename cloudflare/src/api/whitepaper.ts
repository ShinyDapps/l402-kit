import type { Env } from "../worker";

const PRICE_SATS = 100;

export async function handleWhitepaperExtended(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const token = auth.slice(5);
    const verified = await verifyToken(token);
    if (!verified.ok) {
      return new Response(JSON.stringify({ error: verified.reason }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const accept = req.headers.get("Accept") ?? "";
    if (accept.includes("text/html")) {
      return new Response(renderWhitepaperHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Content-Disposition": 'inline; filename="l402-kit-whitepaper-extended.html"',
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(JSON.stringify({ ok: true, content: "whitepaper-extended", paidSats: PRICE_SATS }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inv = await createInvoiceViaLnurl(PRICE_SATS);
  if (!inv) {
    return new Response(JSON.stringify({ error: "Lightning provider temporarily unavailable. Retry in a moment." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = {
    error: "Payment Required",
    document: "l402-kit White Paper — Extended Edition",
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

// ── helpers ─────────────────────────────────────────────────────────────────

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

async function createInvoiceViaLnurl(amountSats: number) {
  try {
    const lnurlRes = await fetch("https://blink.sv/.well-known/lnurlp/shinydapps", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!lnurlRes.ok) return null;
    const lnurlData = await lnurlRes.json() as { callback: string; minSendable?: number; maxSendable?: number };
    if (!lnurlData.callback) return null;

    const milliSats = amountSats * 1000;
    const cbRes = await fetch(`${lnurlData.callback}?amount=${milliSats}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!cbRes.ok) return null;
    const cbData = await cbRes.json() as { pr?: string };
    if (!cbData.pr) return null;

    const paymentHash = bolt11PaymentHash(cbData.pr);
    if (!paymentHash) return null;

    const exp = Date.now() + 3_600_000;
    const macaroon = btoa(JSON.stringify({ hash: paymentHash, exp }));

    return { paymentRequest: cbData.pr, paymentHash, macaroon };
  } catch {
    return null;
  }
}

function bolt11PaymentHash(invoice: string): string | null {
  try {
    const lower = invoice.toLowerCase();
    const sep = lower.lastIndexOf("1");
    if (sep === -1) return null;

    const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const dataStr = lower.slice(sep + 1, -6); // strip checksum
    const vals: number[] = [];
    for (const c of dataStr) {
      const v = CHARSET.indexOf(c);
      if (v === -1) return null;
      vals.push(v);
    }

    // Skip 7-group timestamp
    let pos = 7;
    while (pos + 2 < vals.length) {
      const type = vals[pos];
      const len = vals[pos + 1] * 32 + vals[pos + 2];
      pos += 3;
      if (type === 1 && len === 52) {
        // p tag = payment hash, 52 five-bit groups = 256 bits
        const field = vals.slice(pos, pos + len);
        const bytes = convertBits(field, 5, 8, false);
        if (bytes.length < 32) return null;
        return bytesToHex(new Uint8Array(bytes.slice(0, 32)));
      }
      pos += len;
    }
    return null;
  } catch {
    return null;
  }
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) result.push((acc << (to - bits)) & maxv);
  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function render402Page(payload: { priceSats: number; invoice: string; macaroon: string; paymentHash: string }): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>402 Payment Required — l402-kit Extended Edition</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0A0A0A;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.wrap{max-width:700px;width:100%;text-align:center}
.cover{background:linear-gradient(135deg,#0d0d0d 0%,#111 100%);border:1px solid #1e1e1e;border-radius:16px;padding:60px 48px 48px;margin-bottom:40px;position:relative;overflow:hidden}
.cover::before{content:'';position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(247,147,26,0.08) 0%,transparent 70%)}
.logo{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#666;margin-bottom:32px}
.title{font-size:32px;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.2}
.subtitle{font-size:15px;color:#888;margin-bottom:32px}
.tagline{font-style:italic;color:#F7931A;font-size:17px;font-weight:400}
.divider{border:none;border-top:1px solid #1e1e1e;margin:32px 0}
.price-badge{display:inline-flex;align-items:center;gap:10px;background:rgba(247,147,26,0.1);border:1px solid rgba(247,147,26,0.3);color:#F7931A;padding:10px 24px;border-radius:100px;font-size:15px;font-weight:600;margin-bottom:32px}
.price-badge svg{width:18px;height:18px}
.steps{display:flex;flex-direction:column;gap:14px;margin-bottom:32px;text-align:left}
.step{display:flex;gap:14px;align-items:flex-start;background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px 18px}
.step-num{width:26px;height:26px;border-radius:50%;background:#F7931A;color:#000;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-text{font-size:14px;color:#999;line-height:1.6}
.step-text strong{color:#e6edf3}
.code{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:10px;padding:16px 20px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;color:#a5d6ff;text-align:left;overflow-x:auto;white-space:pre;line-height:1.7;margin-bottom:24px}
.note{font-size:12px;color:#444;line-height:1.6}
.toc{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:10px;padding:20px 24px;text-align:left;margin-bottom:32px}
.toc-title{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:14px}
.toc-item{font-size:13px;color:#777;padding:4px 0;border-bottom:1px solid #141414}
.toc-item:last-child{border:none}
.toc-item span{color:#555;font-size:12px;font-family:'JetBrains Mono',monospace;float:right}
</style>
</head><body>
<div class="wrap">
  <div class="cover">
    <div class="logo">l402-kit · ShinyDapps · May 2026</div>
    <div class="title">White Paper</div>
    <div class="subtitle">Extended Edition — Complete Technical Specification</div>
    <div class="tagline">Payment is the credential.</div>
    <hr class="divider">
    <div class="price-badge">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      100 sats to unlock (~$0.10)
    </div>
    <div class="toc">
      <div class="toc-title">Table of Contents</div>
      <div class="toc-item">Preface — Author's note <span>p.2</span></div>
      <div class="toc-item">1. Founding Principles (7 principles, full text) <span>p.3</span></div>
      <div class="toc-item">2. The Problem: HTTP Was Built for Humans <span>p.5</span></div>
      <div class="toc-item">3. The L402 Protocol in Five Minutes <span>p.7</span></div>
      <div class="toc-item">4. Architecture (modes, replay, agent discovery) <span>p.9</span></div>
      <div class="toc-item">5. Design Decisions (4 languages, Blink, MIT) <span>p.11</span></div>
      <div class="toc-item">6. Threat Model (full table) <span>p.14</span></div>
      <div class="toc-item">7. Architectural Properties <span>p.16</span></div>
      <div class="toc-item">8. Use Cases <span>p.17</span></div>
      <div class="toc-item">9. L402 vs x402 — Honest Comparison <span>p.19</span></div>
      <div class="toc-item">10. Economic Model <span>p.21</span></div>
      <div class="toc-item">11. Versioning Commitments <span>p.22</span></div>
      <div class="toc-item">Appendices A–D (Glossary, References, Changelog, Design Notes) <span>p.24</span></div>
    </div>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">Pay the Lightning invoice below with any Bitcoin wallet</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Get the preimage (payment proof) from your wallet</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Retry with <strong>Authorization: L402 macaroon:preimage</strong></div></div>
    </div>
    <div class="code">curl -H "Authorization: L402 ${payload.macaroon}:&lt;preimage&gt;" \\
  -H "Accept: text/html" \\
  https://l402kit.com/whitepaper-extended

# invoice: ${payload.invoice.slice(0, 60)}...
# hash:    ${payload.paymentHash}</div>
    <p class="note">Invoice expires in 1 hour · SHA256(preimage) == paymentHash · verified locally, no database</p>
  </div>
</div>
</body></html>`;
}

function renderWhitepaperHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>l402-kit White Paper — Extended Edition</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@media print{
  .no-print{display:none!important}
  body{background:#fff;color:#000;font-size:11pt}
  .cover{page-break-after:always;border:none;background:#0A0A0A;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page2{page-break-after:always}
  h2{page-break-before:auto}
}
body{background:#f4f4f0;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;line-height:1.8;font-size:16px}
.cover{background:#0A0A0A;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 60px;position:relative;overflow:hidden}
.cover-hex{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;height:400px;opacity:0.04}
.cover-logo{font-family:-apple-system,sans-serif;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#555;margin-bottom:60px}
.cover-title{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:56px;font-weight:800;color:#fff;line-height:1.1;margin-bottom:16px}
.cover-subtitle{font-family:-apple-system,sans-serif;font-size:20px;color:#666;margin-bottom:48px}
.cover-tagline{font-style:italic;color:#F7931A;font-size:22px;margin-bottom:80px}
.cover-meta{font-family:-apple-system,sans-serif;font-size:13px;color:#444;line-height:2}
.page2{background:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:80px 120px}
.page2-inner{max-width:600px;text-align:center}
.page2-quote{font-style:italic;font-size:20px;color:#333;line-height:1.8}
.content{max-width:720px;margin:0 auto;padding:80px 40px}
h1{font-family:-apple-system,sans-serif;font-size:36px;font-weight:800;margin-bottom:8px;color:#0A0A0A}
h2{font-family:-apple-system,sans-serif;font-size:26px;font-weight:700;margin:60px 0 20px;color:#0A0A0A;border-bottom:2px solid #F7931A;padding-bottom:10px}
h3{font-family:-apple-system,sans-serif;font-size:18px;font-weight:600;margin:36px 0 14px;color:#222}
h4{font-family:-apple-system,sans-serif;font-size:15px;font-weight:600;margin:24px 0 10px;color:#333;text-transform:uppercase;letter-spacing:0.5px}
p{margin-bottom:18px;color:#2a2a2a}
blockquote{border-left:3px solid #F7931A;padding:12px 20px;margin:24px 0;background:#fafaf8;font-style:italic;color:#555}
pre{background:#0A0A0A;color:#a5d6ff;padding:20px 24px;border-radius:8px;overflow-x:auto;font-size:13px;font-family:'JetBrains Mono','Fira Code',monospace;line-height:1.7;margin:20px 0}
code{font-family:'JetBrains Mono','Fira Code',monospace;background:#f0ede8;padding:2px 6px;border-radius:3px;font-size:13px}
table{width:100%;border-collapse:collapse;margin:24px 0;font-size:14px}
th{background:#0A0A0A;color:#F7931A;padding:10px 16px;text-align:left;font-family:-apple-system,sans-serif;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}
td{padding:10px 16px;border-bottom:1px solid #e8e4dc;vertical-align:top}
tr:last-child td{border-bottom:none}
tr:nth-child(even) td{background:#fafaf8}
.section-num{color:#F7931A;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.appendix{background:#fafaf8;border:1px solid #e8e4dc;border-radius:8px;padding:24px 28px;margin:24px 0}
.print-btn{position:fixed;bottom:32px;right:32px;background:#F7931A;color:#000;border:none;padding:14px 28px;border-radius:100px;font-weight:700;font-size:14px;cursor:pointer;font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(247,147,26,0.4)}
.print-btn:hover{background:#e8841a}
hr{border:none;border-top:1px solid #e8e4dc;margin:40px 0}
ul,ol{padding-left:24px;margin-bottom:18px}
li{margin-bottom:6px;color:#2a2a2a}
strong{color:#0A0A0A}
</style>
</head><body>

<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

<!-- Cover -->
<div class="cover">
  <svg class="cover-hex" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="200,30 350,115 350,285 200,370 50,285 50,115" stroke="#F7931A" stroke-width="1.5" fill="none"/>
    <polygon points="200,70 320,135 320,265 200,330 80,265 80,135" stroke="#F7931A" stroke-width="0.8" fill="none"/>
  </svg>
  <div class="cover-logo">l402-kit · ShinyDapps · github.com/ShinyDapps/l402-kit</div>
  <div class="cover-title">White Paper</div>
  <div class="cover-subtitle">Extended Edition — Complete Technical Specification</div>
  <div class="cover-tagline">Payment is the credential.</div>
  <div class="cover-meta">
    Version 1.1 — May 2026<br>
    TypeScript · Python · Go · Rust<br>
    MIT License · docs.l402kit.com
  </div>
</div>

<!-- Page 2 -->
<div class="page2">
  <div class="page2-inner">
    <p class="page2-quote">HTTP 402 was reserved for twenty-five years.<br>This is what it was reserved for.</p>
  </div>
</div>

<div class="content">

<blockquote>This document is the complete technical specification of l402-kit. The public summary is available at l402kit.com/docs/whitepaper. This edition is served by l402-kit itself at l402kit.com/whitepaper-extended (100 sats).</blockquote>

<h2>Preface</h2>
<p>I built l402-kit because I kept running into the same wall. I had data worth selling — per query, not per month — and no infrastructure that could handle a transaction worth a fraction of a cent without collapsing under its own overhead. Stripe makes transactions below half a dollar economically irrational once their fees are applied. PayPal requires accounts on both sides. Subscriptions bundle demand that isn't bundled. None of these are bugs in those systems. They are consequences of being built for a specific kind of commerce — human, high-latency, high-trust — that is not the commerce I was trying to do.</p>
<p>What I was trying to do was closer to what electricity meters do: measure consumption precisely, charge exactly for what was used, settle immediately, require no relationship between the meter and the appliance. The Lightning Network is the closest thing in production today to this model. The L402 protocol wraps it in HTTP. The gap between the protocol and a usable middleware library was the thing worth building.</p>
<p>The bet this project makes is not a bet on Bitcoin's price. It is a bet on a simpler and longer-lived claim: that programmatic commerce between machines will grow, that the tools for that commerce will need to be as programmable as the machines themselves, and that a payment mechanism requiring human intervention at the authentication step is not a payment mechanism suited for autonomous systems. Agents that cannot pay cannot be fully autonomous. APIs that cannot charge cannot sustain themselves on something other than advertising or venture capital. Both gaps point to the same hole in the stack. The missing primitive is not exotic — it is just HTTP 402, finally implemented.</p>
<p>I am not certain the Lightning Network will be the permanent rail for this. I am not certain l402-kit will be the permanent library. What I am certain of is that the problem is real, that the mechanism is sound, and that the infrastructure to prove it exists today. The short term will surprise everyone. The direction does not change.</p>
<p><em>ShinyDapps · May 2026</em></p>

<h2>Abstract</h2>
<p>The HTTP 402 status code was reserved in 1996 for a payment mechanism that was never implemented. For twenty-five years it sat dormant while developers built workarounds: account creation flows, credit card processors, subscription billing systems, API key provisioning pipelines. Each workaround solved the immediate problem for humans. None of them work for machines.</p>
<p>l402-kit implements the L402 protocol — HTTP 402 Payment Required over the Bitcoin Lightning Network — as a drop-in middleware for web APIs. A developer adds three lines of code. An API caller, human or machine, pays a Lightning invoice and receives cryptographic proof of payment. The server verifies the proof with a single hash comparison. No account. No API key. No human in the loop.</p>
<p>The system is production-ready, tested across 462+ automated cases in five runtimes, and ships in TypeScript, Python, Go, and Rust. The managed mode charges 0.3% flat. The sovereign mode charges nothing — the operator runs their own Lightning node and keeps every satoshi.</p>
<p><strong>l402-kit is a family of L402 protocol implementations in TypeScript, Python, Go, and Rust. Open-source, custody-free, account-free. Each implementation does exactly what the protocol asks of it, and nothing more.</strong></p>

<hr>

<h2>1. Founding Principles</h2>
<p>These seven principles govern every architectural decision in l402-kit. They are not aspirations — they are constraints. A feature that violates them does not ship.</p>

<h3>1.1 Minimal Essence</h3>
<p>The middleware does the protocol, and nothing else. Custody belongs to the Lightning Service Provider. Billing belongs to the operator. Fiat conversion, when it exists, belongs to the operator's bank. The middleware's nature is defined by the L402 protocol: receive a request, check for payment proof, issue a challenge or pass to the handler. Each component of the system has its own nature; mixing natures produces software that is worse in every dimension — harder to audit, harder to maintain, harder to trust. Smallness is not a phase of the project. It is a direct consequence of the product's definition, and it will be defended against every reasonable-sounding reason to grow.</p>

<h3>1.2 Auditability as a Precondition for Trust</h3>
<p>Closed-source financial middleware is a contradiction in terms. Anyone who cannot read the code cannot rationally trust the code with their payment flows. The code is open under the MIT license, written in four languages that are widely read by working developers, and kept small enough that any senior engineer can review an entire implementation end to end in a single session. The test suite covers 462+ cases across five runtimes and is public. The cryptographic verification logic — the single most security-critical function — is fewer than thirty lines in every language. Auditability is not a marketing claim. It is a structural property of the codebase.</p>

<h3>1.3 Operator Sovereignty</h3>
<p>The operator holds the keys. The operator chooses the Lightning provider — Blink, OpenNode, LNbits, Alby, LND, Core Lightning, or any implementation of the two-method interface. The operator keeps their own ledger. The operator decides the price, the expiry window, and the replay protection strategy. l402-kit asks for no trust it cannot honor: it does not hold funds, does not store payment credentials, and does not route traffic through a proprietary network. There is no single point of capture — neither in the middleware nor in the maintainer relationship. A developer who decides to fork and self-maintain the library loses nothing except the upstream maintenance.</p>

<h3>1.4 Truth as Correspondence</h3>
<p>What the documentation states and what the code does are the same. Comparisons with alternative tools — Stripe, x402, Aperture, Fewsats — are honest, including where alternatives are better. The managed mode fee is 0.3%; that number appears in the code, not only in the marketing. The threat model in this document names attacks that l402-kit does not fully mitigate and explains why. The marketing claims and the runtime behavior do not diverge. When they would diverge, the marketing changes.</p>

<h3>1.5 Stability at the Foundation, Evolution at the Leaves</h3>
<p>HTTP will last decades. The Lightning Network is being built to last decades. The macaroon credential format has been stable since its 2014 academic specification. The middleware that connects these foundations must be treated with the seriousness they deserve. Breaking changes in the verification logic, the token format, or the provider interface require a major version increment and a migration guide. Convenience features, new language bindings, and provider implementations live at the leaves and evolve freely. The foundation does not move without reason, and never moves silently.</p>

<h3>1.6 Composition, Not Construction</h3>
<p>l402-kit does not reinvent Lightning, HTTP, or macaroons. It composes well-defined parts that already exist, are independently specified, and are independently maintained. The BOLT11 invoice format is a Lightning Labs specification. The SHA256 hash function is a NIST standard. The HTTP 402 status code is an IETF assignment. The macaroon structure derives from a 2014 academic paper. Each part keeps its own function and its own maintenance burden; the kit's role is to connect them correctly and expose the connection as a simple interface. Building from well-defined primitives means each primitive can be replaced without rewriting the others.</p>

<h3>1.7 Adequacy to the Nature of the Problem</h3>
<p>Programmatic payments between machines are technically distinct from payments between people, and must be treated as such. A human can create an account, enter a card number, and wait for a subscription to activate. An AI agent calling an API at three in the morning cannot. The protocol must be stateless, the credential must be self-contained, and the verification must complete in constant time without a network call. Implementing l402-kit in four languages — TypeScript, Python, Go, Rust — is the recognition that developers in each ecosystem encounter the same problem and deserve a solution in the language where they already work. A Python solution that requires FFI into a TypeScript runtime is not a Python solution.</p>

<hr>

<h2>2. The Problem: HTTP Was Built for Humans</h2>

<h3>2.1 Twenty-Five Years of Dormancy</h3>
<p>In 1996, the authors of HTTP/1.1 reserved status code 402 for "Payment Required" and noted it was "reserved for future use." The future they imagined — a web where servers could demand payment in a machine-readable way before serving a response — did not arrive. What arrived instead was a web built entirely around human interaction: browser forms, credit card flows, account registration pages, monthly subscription dialogs. These mechanisms work for people. They do not work for programs.</p>
<p>The gap was not a failure of imagination. It was a failure of infrastructure. In 1996, there was no payment system that could settle a transaction in under a second, for under a cent, without requiring the payer to have a pre-existing account with the payee. The HTTP 402 code had nowhere to go.</p>

<h3>2.2 The Workarounds That Replaced It</h3>
<p>In the absence of a native payment primitive, developers built workarounds. The most common is the API key: the developer registers an account with a payment method attached, receives a credential, and includes it in every request. The credential proves identity, not payment — the actual billing happens asynchronously, in monthly cycles, billed to a card that may decline or expire. The system requires human setup, human maintenance, and human intervention when something goes wrong. It cannot be automated end to end.</p>
<p>Subscription models improved the developer experience by consolidating billing, but made the payment model worse: the consumer pays for capacity, not for consumption. A developer who needs ten API calls a month pays the same as a developer who needs ten thousand. The pricing does not correspond to value delivered.</p>
<p>Per-call billing exists in some systems (AWS Lambda, OpenAI API) but requires pre-provisioned credits, account creation, and billing infrastructure that is expensive to build and operate. The minimum practical transaction on Stripe is $0.50 after fees. A call worth $0.001 cannot be monetized through existing rails at all.</p>

<h3>2.3 The Agent Problem</h3>
<p>The gap became acute with the emergence of autonomous AI agents. An agent that discovers a new API at runtime cannot create an account, enter a card number, or navigate an OAuth flow. It can only make HTTP requests. If the API requires a pre-provisioned credential, the agent is stopped. The human who deployed the agent must intervene, provision the credential, and redeploy. The loop that was supposed to be autonomous is not.</p>
<p>The requirement is clear: a payment mechanism that works at the HTTP layer, requires no pre-existing relationship between client and server, settles in under a second, and produces a self-contained, cryptographically verifiable proof that the server can check without a network call. HTTP 402 was reserved for exactly this. The Lightning Network makes it implementable.</p>

<h3>2.4 Two Responses to the Gap</h3>
<p>Two protocol proposals address this gap. L402, specified by Lightning Labs, uses Bitcoin's Lightning Network as the payment rail: invoices denominated in satoshis, settled in milliseconds, with the cryptographic preimage as the payment proof. x402, proposed by Coinbase in 2025, uses USDC on the Base L2 blockchain: stablecoin transfers, settled in seconds, with an on-chain transaction as proof. Both protocols use HTTP 402 as the signaling mechanism. Section 9 of this document compares them honestly. l402-kit implements L402.</p>

<hr>

<h2>3. The L402 Protocol in Five Minutes</h2>

<h3>3.1 The Four-Step Sequence</h3>
<p><strong>Step 1 — Request without proof.</strong> The client sends a normal HTTP request to a protected endpoint. No special headers required.</p>
<p><strong>Step 2 — 402 Challenge.</strong> The server responds with HTTP 402 and a <code>WWW-Authenticate: L402</code> header containing two values: a BOLT11 Lightning invoice and a macaroon. The invoice encodes the amount and a <code>paymentHash</code>. The macaroon encodes the same <code>paymentHash</code> and an expiry timestamp.</p>
<p><strong>Step 3 — Payment.</strong> The client pays the Lightning invoice using any Lightning wallet. The Lightning Network delivers the cryptographic preimage to the payer as settlement proof. This step takes under one second on the mainnet in 2026.</p>
<p><strong>Step 4 — Authenticated request.</strong> The client resends the original request with an <code>Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;</code> header. The server verifies that <code>SHA256(preimage) == paymentHash</code> — a single, constant-time hash comparison. If it matches and the token has not expired and has not been used before, the request passes to the handler.</p>

<h3>3.2 Three Properties</h3>
<p><strong>Statelessness.</strong> The server does not need to maintain session state. The macaroon carries the payment hash and expiry inline. Verification is a pure function: given a macaroon and a preimage, return true or false. No database read is required on the hot path.</p>
<p><strong>Self-contained credentials.</strong> The token format carries everything needed for verification. Unlike JWT, there is no signing key that could be compromised. Unlike API keys, there is no credential database that could be breached. The credential is valid because the preimage is cryptographically bound to the Lightning invoice that was paid.</p>
<p><strong>Privacy by structure.</strong> The server learns that someone paid the invoice. It does not learn who. The Lightning Network does not require identity at the payment layer.</p>

<h3>3.3 Token Format</h3>
<pre>Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;

where:
  macaroon = base64url( JSON{ hash: string, exp: number } )
  preimage  = 64-character hex string (32 bytes)</pre>
<p>The <code>hash</code> field is the <code>paymentHash</code> from the Lightning invoice. The <code>exp</code> field is a Unix timestamp in milliseconds. The <code>preimage</code> is the 32-byte value whose SHA256 equals <code>hash</code>. This format is compatible with all known L402 and x402 client implementations.</p>

<hr>

<h2>4. Architecture</h2>

<h3>4.1 Overview</h3>
<p>l402-kit operates across three tiers. The operator's application is unchanged; the middleware wraps routes. The Lightning provider is pluggable.</p>

<h3>4.2 The Integration Surface</h3>
<pre>// TypeScript
import { l402, ManagedProvider } from "l402-kit";
app.use("/api/data", l402({ priceSats: 10, lightning }));

# Python
@app.get("/api/data")
@l402_required(price_sats=10, lightning=lightning)
async def data(): ...

// Go
http.Handle("/api/data", l402kit.Middleware(l402kit.Options{
    PriceSats: 10, Lightning: provider,
}, handler))

// Rust
let app = Router::new()
    .route("/api/data", get(data_handler))
    .layer(L402Layer::new(provider, 10));</pre>

<h3>4.3 Two Operating Modes</h3>
<p><strong>Managed mode</strong> uses the ShinyDapps-hosted Lightning infrastructure. The operator provides only a Lightning Address (e.g. <code>you@blink.sv</code>). Invoice creation, webhook handling, and payment settlement are managed by the backend. The fee is 0.3% of each payment. The operator receives 99.7% of every payment, directly to their Lightning Address, within seconds. No Lightning node required.</p>
<p><strong>Sovereign mode</strong> uses a Lightning provider the operator controls entirely. Built-in providers: <code>BlinkProvider</code>, <code>OpenNodeProvider</code>, <code>LNbitsProvider</code>. The fee is 0%: every satoshi reaches the operator. For full self-custody, operators implement the <code>LightningProvider</code> interface (two methods: <code>createInvoice</code>, optionally <code>getInvoiceStatus</code>) pointing at their LND or Core Lightning node.</p>

<h3>4.4 Replay Protection — Three Independent Layers</h3>
<table>
<tr><th>Layer</th><th>Mechanism</th><th>Scope</th><th>Latency</th></tr>
<tr><td>L1</td><td>MemoryReplayAdapter — Set in RAM</td><td>Single process</td><td>&lt; 1 ms</td></tr>
<tr><td>L2</td><td>DB unique constraint on preimage</td><td>Durable, cross-restart</td><td>&lt; 10 ms</td></tr>
<tr><td>L3</td><td>RedisReplayAdapter — atomic SET NX</td><td>Multi-instance</td><td>&lt; 5 ms</td></tr>
</table>
<p>All three are optional and composable. A solo developer on a single process uses L1. A multi-instance deployment uses L1 + L3. A compliance-sensitive deployment uses all three. The default is L1 (zero dependencies).</p>

<h3>4.5 Agent Discovery</h3>
<p>APIs protected by l402-kit expose machine-readable discovery signals: <code>/.well-known/l402.json</code>, <code>/.well-known/agent.json</code>, <code>/llms.txt</code>, and an MCP server (<code>npx l402-kit-mcp</code>) that enables Claude, Cursor, and compatible clients to call L402-protected APIs directly from the IDE context.</p>

<hr>

<h2>5. Design Decisions</h2>

<h3>5.1 Why Four Languages</h3>
<p>Principle 7 (Adequacy to the nature of the problem) drives this decision. TypeScript is the dominant language for Node.js API development. Python is the dominant language for AI/ML applications and FastAPI services — no other L402 implementation has a Python SDK. Go is the standard for high-throughput infrastructure services. Rust is the choice for systems where memory safety and performance are non-negotiable. A developer who works in Go should not need to run a sidecar in another language. The tradeoff: maintaining four codebases is expensive. The mitigation: a shared test corpus defines expected behavior, and each implementation is tested against it.</p>

<h3>5.2 Why Blink as the Default Managed Provider</h3>
<p>Three Lightning providers were evaluated: Blink, OpenNode, and Phoenix Server. Blink won on two criteria: a reliable Svix-based webhook with HMAC-SHA256 signature verification, and a clean versioned GraphQL API. The tradeoff is that Blink is custodial. Sovereign mode exists precisely for operators who find this unacceptable.</p>

<h3>5.3 Why Stateless Verification</h3>
<p>The verification function — <code>SHA256(preimage) == paymentHash</code> — requires no state. No database read. No network call. This is a consequence of the cryptographic structure of the Lightning Network. The design choice is to preserve this property: nothing in the verification path introduces statefulness. The benefit: the verification function scales horizontally without coordination.</p>

<h3>5.4 Why MIT License</h3>
<p>MIT is maximally permissive: it imposes no requirements on how the code is used, modified, or redistributed. A developer who embeds l402-kit in a commercial product owes nothing except the attribution notice. A developer who forks and builds a competing product is welcome to do so. The license reflects the belief that financial infrastructure should be freely usable — not as a marketing position, but as a structural commitment to the ecosystem.</p>

<h3>5.5 What l402-kit Deliberately Does Not Do</h3>
<p>By Principle 1, the following are explicitly out of scope: custody, channel management, fiat conversion, KYC/AML, billing dashboards, and rate limiting. Rate limiting is an application-layer concern. l402-kit handles payment authentication; the application handles access policy.</p>

<hr>

<h2>6. Threat Model</h2>
<table>
<tr><th>Threat</th><th>Mitigation</th><th>Responsibility</th></tr>
<tr><td>Replay of a redeemed token</td><td>Three-layer replay adapter. First use marks the preimage as spent.</td><td>l402-kit</td></tr>
<tr><td>Token expiry bypass</td><td>exp field verified against Date.now() with millisecond precision. Max 2-hour cap.</td><td>l402-kit</td></tr>
<tr><td>Token forgery</td><td>SHA256(preimage) == paymentHash is cryptographically unforgeable without the Lightning Network.</td><td>Lightning Network protocol</td></tr>
<tr><td>Macaroon theft in transit</td><td>HTTPS is the transport layer's responsibility.</td><td>Operator</td></tr>
<tr><td>Macaroon theft after issuance</td><td>Tokens expire (max 2 hours). Replay protection makes a stolen token usable only once.</td><td>Shared</td></tr>
<tr><td>Timing attack on comparison</td><td>crypto.timingSafeEqual with Uint8Array prevents side-channel leakage.</td><td>l402-kit</td></tr>
<tr><td>Lightning provider compromise</td><td>Provider-agnostic interface. Operator can swap providers in one line.</td><td>Operator</td></tr>
<tr><td>DoS via invoice issuance</td><td>Rate limiting is an application-layer concern. Operator must apply upstream.</td><td>Operator</td></tr>
<tr><td>SSRF via Lightning Address</td><td>Domain validation in fetchInvoiceFromAddress() blocks private IP ranges.</td><td>l402-kit</td></tr>
<tr><td>SQL injection via preimage storage</td><td>Parameterized queries throughout.</td><td>l402-kit</td></tr>
<tr><td>Webhook spoofing (Blink)</td><td>HMAC-SHA256 with timestamp verification, 5-minute window, timingSafeEqual.</td><td>l402-kit</td></tr>
</table>

<hr>

<h2>7. Architectural Properties</h2>
<p><strong>Constant-time verification per request.</strong> One SHA256 hash, one integer comparison, one replay check. Cost is bounded and does not grow with number of users or tokens.</p>
<p><strong>Horizontal scalability without coordination.</strong> The verification path requires no shared state. Multiple instances can verify the same class of tokens independently. Replay protection is handled by the pluggable adapter.</p>
<p><strong>Deterministic memory footprint.</strong> The middleware does not accumulate state across requests. The in-memory replay adapter holds a fixed-size set of preimage hashes; the set is bounded by operator configuration.</p>
<p><strong>Behavioral parity across four languages.</strong> The shared test corpus defines 462+ cases that all four implementations must pass. A token minted by TypeScript is verifiable by Go. The wire format is identical across all languages.</p>
<p><strong>Stable upgrade path within a major version.</strong> Tokens minted by l402-kit 1.x are verifiable by all subsequent 1.x releases. The macaroon format and verification algorithm do not change within a major version.</p>

<hr>

<h2>8. Use Cases</h2>

<h3>8.1 Pay-Per-Call API Monetization</h3>
<p>A developer exposes an endpoint that provides real value — data, computation, inference — and charges per access. A caller who has paid can access the endpoint for the token's validity window. A caller who has not paid receives a 402 with an invoice. The economic model is exact: the caller pays for exactly what they use. No minimum spend, no monthly commitment, no registration.</p>

<h3>8.2 AI Agent Autonomous Payments</h3>
<p>An autonomous agent discovers an L402-protected API at runtime. The agent has a Lightning wallet with a budget. It pays the invoice, receives the preimage, and continues execution without human intervention.</p>
<pre>import { L402Client } from "l402-kit/agent";

const client = new L402Client({
  wallet: new BlinkWallet(process.env.BLINK_API_KEY!),
  budget: { maxSats: 1000 },  // hard cap per session
});

const data = await client.fetch("https://api.example.com/data");
// Handles 402 automatically: pays invoice, retries with proof</pre>
<p>The budget cap is the governance primitive. An agent with a 1000-sat budget cannot spend more, regardless of how many APIs it discovers.</p>

<h3>8.3 Content Gating</h3>
<p>l402-kit gates content as naturally as it gates APIs. A document, a report, a dataset, a PDF — anything served over HTTP can be placed behind an L402 paywall. This document is an example: the Extended Edition is served by l402-kit itself at <code>l402kit.com/whitepaper-extended</code> for 100 sats. The developer who pays 100 sats and downloads this document has performed an end-to-end test of the middleware in production.</p>

<hr>

<h2>9. L402 vs x402: An Honest Comparison</h2>
<table>
<tr><th>Property</th><th>L402 (l402-kit)</th><th>x402 (Coinbase proposal)</th></tr>
<tr><td>Settlement asset</td><td>Bitcoin (satoshis)</td><td>USDC (stablecoin)</td></tr>
<tr><td>Settlement time</td><td>&lt; 1 second (Lightning)</td><td>&lt; 1 second (Base L2)</td></tr>
<tr><td>Minimum economical payment</td><td>~1 sat (~$0.001)</td><td>~$0.01 (gas cost floor)</td></tr>
<tr><td>Custody requirement</td><td>None (sovereign) or managed</td><td>Requires Base wallet</td></tr>
<tr><td>Identity requirement</td><td>None</td><td>On-chain address (pseudonymous)</td></tr>
<tr><td>Governance</td><td>IETF draft, Lightning Labs spec</td><td>Coinbase-led proposal</td></tr>
<tr><td>Production SDK</td><td>l402-kit (TS/Python/Go/Rust)</td><td>No production SDK as of May 2026</td></tr>
<tr><td>Managed mode</td><td>Yes (0.3%, no node required)</td><td>No</td></tr>
<tr><td>Volatility exposure</td><td>Satoshi price fluctuates</td><td>USDC pegged to USD</td></tr>
</table>
<p><strong>L402 is the better choice when:</strong> payments are small (under $0.10 per call), the operator wants zero identity requirements from callers, or sub-second settlement is required.</p>
<p><strong>x402 is the better choice when:</strong> callers need stablecoin denomination, the operator already operates in the Coinbase/Base ecosystem, or larger per-transaction amounts justify the gas cost overhead.</p>

<hr>

<h2>10. Economic Model</h2>
<table>
<tr><th>Tier</th><th>Cost</th><th>What You Get</th></tr>
<tr><td><strong>Free</strong></td><td>0.3% of payments received</td><td>Unlimited calls, full SDK, 7-day history, charts</td></tr>
<tr><td><strong>Pro</strong></td><td>~9,000 sats/month (~$9)</td><td>Full history, 30D/1Y/ALL charts, CSV export, priority support</td></tr>
<tr><td><strong>Founder</strong></td><td>~1,000,000 sats one-time (~$999)</td><td>Lifetime Pro, founder badge, direct maintainer access</td></tr>
</table>
<pre>$1,000/month in API revenue  →  $3/month fee   →  $997 net
$10,000/month                →  $30/month fee  →  $9,970 net
$100,000/month               →  $300/month fee →  $99,700 net</pre>
<p>Sovereign mode: 0% fee. Every satoshi reaches the operator's wallet directly.</p>

<hr>

<h2>11. Versioning Commitments</h2>
<p><strong>Patch releases (1.x.y → 1.x.z):</strong> No behavioral change. Bug fixes and documentation only. Never changes the wire format, verification algorithm, or provider interface.</p>
<p><strong>Minor releases (1.x → 1.y):</strong> Additive only. New providers, new language features, new optional configuration fields. Existing code continues to work without modification.</p>
<p><strong>Major releases (1.x → 2.x):</strong> Breaking changes are permitted and documented. A migration guide ships with every major release.</p>
<p><strong>Wire format stability within 1.x:</strong> The macaroon format and the token wire format (<code>macaroon:preimage</code>) are stable for all 1.x releases.</p>

<h3>Version Path</h3>
<ul>
<li><strong>v1.x</strong> — Current series. Managed mode, four language SDKs, MCP server, VS Code extension, 462+ tests.</li>
<li><strong>v1.5</strong> — Sovereign mode expansion: first-class BTCPay Server, LND, and Core Lightning providers.</li>
<li><strong>v2.x</strong> — Direct Lightning: SDK creates and verifies invoices directly against LND/CLN.</li>
<li><strong>v3.x</strong> — Multi-provider: payment routing across multiple Lightning nodes.</li>
</ul>

<hr>

<h2>12. Adoption</h2>
<pre>npm install l402-kit    # TypeScript / Node.js
pip install l402kit     # Python
go get github.com/shinydapps/l402-kit/go@v1.8.2  # Go
cargo add l402kit       # Rust</pre>
<table>
<tr><th>Language</th><th>Registry</th><th>URL</th></tr>
<tr><td>TypeScript</td><td>npm</td><td>npmjs.com/package/l402-kit</td></tr>
<tr><td>Python</td><td>PyPI</td><td>pypi.org/project/l402kit</td></tr>
<tr><td>Go</td><td>pkg.go.dev</td><td>pkg.go.dev/github.com/shinydapps/l402-kit/go</td></tr>
<tr><td>Rust</td><td>crates.io</td><td>crates.io/crates/l402kit</td></tr>
</table>

<hr>

<div class="appendix">
<h2>Appendix A — Glossary</h2>
<p><strong>Bearer credential.</strong> A credential that grants access to whoever holds it, without proof of identity. l402-kit tokens are bearer credentials.</p>
<p><strong>Caveat.</strong> In the macaroon model, a condition that restricts credential use. l402-kit's <code>exp</code> field is a caveat.</p>
<p><strong>Lightning Address.</strong> A human-readable identifier in the format <code>user@domain</code> that resolves to a Lightning payment endpoint via LNURL.</p>
<p><strong>LSP.</strong> Lightning Service Provider. Blink, OpenNode, and LNbits are LSPs.</p>
<p><strong>Macaroon.</strong> A cryptographic credential format that supports delegation and attenuation. l402-kit uses a simplified format: base64-encoded JSON with payment hash and expiry.</p>
<p><strong>Preimage.</strong> The 32-byte value whose SHA256 hash equals the Lightning invoice's paymentHash. The payment credential in L402.</p>
<p><strong>Replay protection.</strong> Mechanism that prevents a previously used credential from being used again. l402-kit marks preimages as spent on first use.</p>
</div>

<div class="appendix">
<h2>Appendix B — References</h2>
<ol>
<li><strong>L402 Protocol Specification.</strong> Lightning Labs. docs.lightning.engineering/the-lightning-network/l402</li>
<li><strong>BOLT11: Invoice Protocol for Lightning Payments.</strong> Rusty Russell et al.</li>
<li><strong>Macaroons: Cookies with Contextual Caveats.</strong> Birgisson et al., 2014.</li>
<li><strong>x402 Protocol Proposal.</strong> Coinbase, 2025. x402.org</li>
<li><strong>Aperture: A Lightning-Native Reverse Proxy.</strong> Lightning Labs.</li>
<li><strong>HTTP/1.1 Status Code Definitions.</strong> RFC 7231, Section 6.5.2.</li>
</ol>
</div>

<div class="appendix">
<h2>Appendix D — Design Notes</h2>

<h3>D.1 Macaroons over JWT</h3>
<p>The first instinct when designing a bearer credential for an HTTP API is to reach for JWT. The reason l402-kit uses macaroons instead is attenuation. A macaroon can be restricted by adding caveats that tighten its scope without invalidating the cryptographic chain. A token minted for 100 sats of access can be delegated to a sub-agent with an additional caveat restricting it to a specific endpoint or shorter validity window. The sub-agent cannot remove those restrictions. JWT does not support attenuation natively. The cost: macaroons are not universally known.</p>

<h3>D.2 Blink as Default Managed Provider</h3>
<p>Blink won the managed mode default evaluation on two criteria: a reliable Svix-based webhook with HMAC-SHA256 signature verification, and a clean versioned GraphQL API. The tradeoff is custody — managed mode users trust Blink with payment routing. Sovereign mode exists for operators who find this unacceptable.</p>

<h3>D.3 0.3% Fee, Not 1%</h3>
<p>0.3% scales correctly at both ends of the developer spectrum. At micro-scale it is negligible and never a barrier. At scale it remains small enough that the operator's incentive to switch to sovereign mode (0% fee) is not strong until the operational overhead of running a Lightning node is genuinely worth it. The structural alignment matters more than the percentage: when a developer earns nothing, the fee is zero.</p>

<h3>D.4 Stateless Validation, Not Redis-First</h3>
<p>Every dependency that is present by default becomes a deployment requirement. A developer who wants to run l402-kit in a Cloudflare Worker or Lambda function should not need to provision Redis to get started. Stateless validation makes all deployment targets viable without modification. Replay protection is handled through a pluggable adapter rather than a built-in dependency. The default adapter is in-memory, suitable for single-process deployments. Redis is one line of configuration away for multi-instance deployments.</p>
</div>

<div class="appendix">
<h2>Appendix C — Document Changelog</h2>
<table>
<tr><th>Version</th><th>Date</th><th>Changes</th></tr>
<tr><td>1.0</td><td>April 2026</td><td>Initial release.</td></tr>
<tr><td>1.1</td><td>May 2026</td><td>Extended Edition. Added: Founding Principles (§1), Design Decisions (§5), expanded Threat Model (§6), Architectural Properties (§7), Use Cases (§8), L402 vs x402 (§9), Versioning Commitments (§11), Appendices A/B/C/D. Updated all code samples to v1.8.2 API.</td></tr>
</table>
</div>

<hr>
<p style="text-align:center;color:#888;font-size:13px;margin-top:40px;font-family:-apple-system,sans-serif">l402-kit is released under the MIT License · ShinyDapps · thiagoyoshiaki@gmail.com · May 2026</p>

</div>
</body></html>`;
}
