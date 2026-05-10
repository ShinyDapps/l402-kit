import type { Env } from "../worker";

export interface InvoiceResult {
  paymentRequest: string;
  paymentHash: string;
  macaroon: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  preimage?: string;
}

export async function verifyL402(authHeader: string): Promise<VerifyResult> {
  const token = authHeader.slice(5);
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

export async function replayCheck(preimage: string, env: Env): Promise<boolean> {
  const key = `verity_spent:${preimage}`;
  const spent = await env.demo_preimages.get(key);
  if (spent) return true;
  await env.demo_preimages.put(key, "1", { expirationTtl: 86400 });
  return false;
}

export async function createVerityInvoice(amountSats: number, env: Env): Promise<InvoiceResult | null> {
  try {
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

    const paymentHash = inv.invoice.paymentHash;
    const exp = Date.now() + 3_600_000;
    const macaroon = btoa(JSON.stringify({ hash: paymentHash, exp }));

    return { paymentRequest: inv.invoice.paymentRequest, paymentHash, macaroon };
  } catch {
    return null;
  }
}

export function make402(service: string, priceSats: number, inv: InvoiceResult): Response {
  return new Response(JSON.stringify({
    error: "Payment Required",
    agent: "VERITY",
    service,
    priceSats,
    invoice: inv.paymentRequest,
    macaroon: inv.macaroon,
  }), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `L402 macaroon="${inv.macaroon}", invoice="${inv.paymentRequest}"`,
    },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
