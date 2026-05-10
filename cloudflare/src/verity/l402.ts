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

export async function createVerityInvoice(amountSats: number, _env: Env): Promise<InvoiceResult | null> {
  try {
    const lnurlRes = await fetch("https://blink.sv/.well-known/lnurlp/shinydapps", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!lnurlRes.ok) return null;
    const lnurlData = await lnurlRes.json() as { callback: string };
    if (!lnurlData.callback) return null;

    const cbRes = await fetch(`${lnurlData.callback}?amount=${amountSats * 1000}`, {
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
    const dataStr = lower.slice(sep + 1, -6);
    const vals: number[] = [];
    for (const c of dataStr) {
      const v = CHARSET.indexOf(c);
      if (v === -1) return null;
      vals.push(v);
    }
    let pos = 7;
    while (pos + 2 < vals.length) {
      const type = vals[pos];
      const len = vals[pos + 1] * 32 + vals[pos + 2];
      pos += 3;
      if (type === 1 && len === 52) {
        const field = vals.slice(pos, pos + len);
        const bytes = convertBits(field, 5, 8, false);
        if (bytes.length < 32) return null;
        return bytesToHex(new Uint8Array(bytes.slice(0, 32)));
      }
      pos += len;
    }
    return null;
  } catch { return null; }
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
