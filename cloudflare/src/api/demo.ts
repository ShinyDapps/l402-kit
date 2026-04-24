import type { Env } from "../worker";

const PRICE_SATS = 1;
const RATE_LIMIT   = 8;      // max invoice creations per IP per hour
const RATE_WINDOW  = 3600;   // seconds

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
    const verified = await verifyToken(token);
    if (!verified.ok) return json({ error: verified.reason }, 401);

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

  return new Response(
    JSON.stringify({
      error: "Payment Required",
      priceSats: PRICE_SATS,
      invoice: inv.paymentRequest,
      macaroon: inv.macaroon,
      blinkPaymentHash: inv.paymentHash,
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `L402 macaroon="${inv.macaroon}", invoice="${inv.paymentRequest}"`,
      },
    },
  );
}

// Returns the server-generated preimage once the Blink invoice is paid.
// Client polls this after paying manually (e.g. from Bipa).
export async function handleDemoPreimage(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const blinkHash = url.searchParams.get("hash");
  if (!blinkHash) return json({ error: "Missing hash" }, 400);

  const stored = await env.demo_preimages.get(blinkHash);
  if (!stored) return json({ error: "Unknown invoice" }, 404);

  const { serverPreimage, paid } = JSON.parse(stored) as { serverPreimage: string; paid: boolean };

  if (!paid) {
    // Check Blink for payment
    const confirmed = await checkBlinkPayment(blinkHash, env);
    if (!confirmed) return json({ pending: true }, 202);
    // Mark paid in KV
    await env.demo_preimages.put(blinkHash, JSON.stringify({ serverPreimage, paid: true }), { expirationTtl: 3600 });
  }

  return json({ preimage: serverPreimage });
}

// ── helpers ────────────────────────────────────────────────────────────────────

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

async function createInvoice(amountSats: number, env: Env) {
  try {
    // Generate server-side preimage; macaroon binds to SHA256 of it
    const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
    const serverPreimage = bytesToHex(preimageBytes);
    const serverHashBuf = await crypto.subtle.digest("SHA-256", preimageBytes.buffer as ArrayBuffer);
    const serverHash = bytesToHex(new Uint8Array(serverHashBuf));

    // Create real Blink invoice (Blink generates its own payment hash — different from serverHash)
    const r = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY },
      body: JSON.stringify({
        query: `mutation { lnInvoiceCreate(input: { walletId: "${env.BLINK_WALLET_ID}", amount: ${amountSats} }) { invoice { paymentRequest paymentHash } errors { message } } }`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { data?: { lnInvoiceCreate?: { invoice?: { paymentRequest: string; paymentHash: string }; errors?: { message: string }[] } } };
    const inv = data?.data?.lnInvoiceCreate;
    if (!inv?.invoice || inv.errors?.length) return null;

    const blinkHash = inv.invoice.paymentHash;

    // Store serverPreimage keyed by blinkHash so the preimage endpoint can return it after payment
    await env.demo_preimages.put(blinkHash, JSON.stringify({ serverPreimage, paid: false }), { expirationTtl: 3600 });

    // Macaroon encodes serverHash (= SHA256(serverPreimage)) — verifyToken checks this
    const exp = Date.now() + 3_600_000;
    const macaroon = btoa(JSON.stringify({ hash: serverHash, exp }));

    return { paymentRequest: inv.invoice.paymentRequest, paymentHash: blinkHash, macaroon };
  } catch {
    return null;
  }
}

async function checkBlinkPayment(blinkPaymentHash: string, env: Env): Promise<boolean> {
  try {
    const r = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY },
      body: JSON.stringify({
        query: `{ me { defaultAccount { wallets { ... on BTCWallet { transactions(first: 10) { edges { node { initiationVia { ... on InitiationViaLn { paymentHash } } } } } } } } } }`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return false;
    const data = await r.json() as { data?: { me?: { defaultAccount?: { wallets?: { transactions?: { edges?: { node?: { initiationVia?: { paymentHash?: string } } }[] } }[] } } } };
    const wallets = data?.data?.me?.defaultAccount?.wallets ?? [];
    for (const w of wallets) {
      for (const edge of (w as { transactions?: { edges?: { node?: { initiationVia?: { paymentHash?: string } } }[] } }).transactions?.edges ?? []) {
        if (edge?.node?.initiationVia?.paymentHash === blinkPaymentHash) return true;
      }
    }
    return false;
  } catch {
    return false;
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
