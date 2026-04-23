/**
 * /api/demo — public endpoint that demonstrates the full L402 flow.
 *
 * GET /api/demo
 *   → 402 Payment Required + real BOLT11 invoice (10 sats)
 *
 * GET /api/demo?preimage=<hex>
 *   → 200 OK if SHA256(preimage) matches the stored payment_hash
 *   → 401 if wrong preimage
 *
 * Invoices are cached in memory (process lifetime) keyed by payment_hash.
 * This is intentionally lightweight — demo only, no persistence needed.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";

const SUPABASE_URL  = process.env.SUPABASE_URL       ?? "";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY  ?? "";

const DEMO_SATS = 10;
const DEMO_DATA = { message: "Hello from l402-kit ⚡", sats: DEMO_SATS, protocol: "L402", settled: true };

// In-memory store: payment_hash → { paymentRequest, createdAt }
const pending = new Map<string, { paymentRequest: string; createdAt: number }>();

async function createInvoice(): Promise<{ paymentRequest: string; paymentHash: string }> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
    body: JSON.stringify({ amountSats: DEMO_SATS }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`edge function ${r.status}`);
  return r.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { preimage } = req.query as Record<string, string>;

  // ── Verify payment ────────────────────────────────────────────────────────
  if (preimage) {
    const hash = createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
    if (pending.has(hash)) {
      pending.delete(hash);
      return res.status(200).json(DEMO_DATA);
    }
    return res.status(401).json({ error: "Invalid or expired preimage" });
  }

  // ── Issue 402 ─────────────────────────────────────────────────────────────
  try {
    const { paymentRequest, paymentHash } = await createInvoice();
    pending.set(paymentHash, { paymentRequest, createdAt: Date.now() });

    // Prune entries older than 1h
    for (const [hash, entry] of pending) {
      if (Date.now() - entry.createdAt > 3_600_000) pending.delete(hash);
    }

    const token = Buffer.from(JSON.stringify({ hash: paymentHash, exp: Date.now() + 3_600_000 })).toString("base64");
    res.setHeader("WWW-Authenticate", `L402 token="${token}", invoice="${paymentRequest}"`);
    return res.status(402).json({
      error: "Payment Required",
      invoice: paymentRequest,
      token,
      amount_sats: DEMO_SATS,
      description: "l402-kit demo — pay 10 sats to unlock",
    });
  } catch (err) {
    console.error("[demo] invoice error:", String(err));
    return res.status(503).json({ error: "Lightning provider temporarily unavailable" });
  }
}
