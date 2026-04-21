/**
 * Blink webhook receiver — eliminates client-side polling for Pro subscriptions.
 *
 * Setup in Blink dashboard:
 *   Webhooks → Add → URL: https://<your-vercel-domain>/api/blink-webhook
 *   Events: transaction.ln.invoice.paid
 *   Secret: same value as L402KIT_BLINK_WEBHOOK_SECRET env var
 *
 * Blink sends HMAC-SHA256 in the `btcpay-sig` header:
 *   sha256=<hex>
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";

const BLINK_WEBHOOK_SECRET = process.env.L402KIT_BLINK_WEBHOOK_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const TIER_DAYS: Record<string, number> = {
  pro: 30,
  business: 30,
  lifetime: 36500,
};

function verifyBlinkSignature(rawBody: string, sigHeader: string): boolean {
  if (!BLINK_WEBHOOK_SECRET) return false;
  // Header format: "sha256=<hex>"
  const received = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const expected = createHmac("sha256", BLINK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected.padEnd(received.length, "0"), "hex");
  const b = Buffer.from(received.padEnd(expected.length, "0"), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
}

export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString("utf8"); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Read raw body before any JSON parsing (required for HMAC verification)
  const rawBody = await readRawBody(req);

  const sigHeader = String(req.headers["btcpay-sig"] ?? "");
  if (!verifyBlinkSignature(rawBody, sigHeader)) {
    console.warn("[blink-webhook] signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // We only care about paid Lightning invoices
  const eventType = event["type"] as string | undefined;
  if (eventType !== "transaction.ln.invoice.paid") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const paymentHash = (event["paymentHash"] ?? (event["data"] as Record<string, unknown>)?.["paymentHash"]) as string | undefined;
  if (!paymentHash) {
    console.warn("[blink-webhook] missing paymentHash in event:", JSON.stringify(event).slice(0, 200));
    return res.status(400).json({ error: "Missing paymentHash" });
  }

  // Look up the pending pro_access row by payment_hash
  try {
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_access?payment_hash=eq.${encodeURIComponent(paymentHash)}&select=tier,expires_at&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const rows = (await lookup.json()) as { tier: string; expires_at: string | null }[];
    const row = rows[0];

    // Not a known subscription invoice — not an error, just not our payment
    if (!row) return res.status(200).json({ ok: true, ignored: true });

    // Already activated (expires_at is a future date)
    if (row.expires_at && new Date(row.expires_at) > new Date()) {
      return res.status(200).json({ ok: true, alreadyActive: true });
    }

    const days = TIER_DAYS[row.tier] ?? 30;
    const expires_at = new Date(Date.now() + days * 86400_000).toISOString();

    const activate = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_access?payment_hash=eq.${encodeURIComponent(paymentHash)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ expires_at }),
      }
    );

    if (!activate.ok) {
      console.error("[blink-webhook] failed to activate subscription:", activate.status);
      return res.status(500).json({ error: "Failed to activate" });
    }

    console.log(`[blink-webhook] activated ${row.tier} via webhook for paymentHash=${paymentHash}`);
    res.status(200).json({ ok: true, activated: true, tier: row.tier, expires_at });
  } catch (err) {
    console.error("[blink-webhook] error:", String(err));
    res.status(500).json({ error: "Internal error" });
  }
}
