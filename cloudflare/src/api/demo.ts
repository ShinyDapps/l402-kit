import type { Env } from "../worker";

const PRICE_SATS = 1;
const used = new Set<string>();

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
    if (used.has(verified.preimage!)) return json({ error: "Token already used" }, 401);
    used.add(verified.preimage!);

    const price = await fetchBtcPrice();
    return json({
      bitcoin: price,
      priceSats: PRICE_SATS,
      paidWith: "⚡ Lightning — L402 protocol",
      protocol: "L402",
      timestamp: new Date().toISOString(),
    });
  }

  // No token — create invoice and return 402
  const inv = await createInvoice(PRICE_SATS, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);

  return new Response(
    JSON.stringify({
      error: "Payment Required",
      priceSats: PRICE_SATS,
      invoice: inv.paymentRequest,
      macaroon: inv.macaroon,
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

// ── helpers ────────────────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<{ ok: boolean; reason?: string; preimage?: string }> {
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
    return { ok: true, preimage };
  } catch {
    return { ok: false, reason: "Invalid token format" };
  }
}

async function createInvoice(amountSats: number, env: Env) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ amountSats }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return await r.json() as { paymentRequest: string; paymentHash: string; macaroon: string };
  } catch {
    return null;
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

  // Fallback: Coinbase
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
