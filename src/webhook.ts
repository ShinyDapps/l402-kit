import { createHmac, timingSafeEqual } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookEvent {
  /** Unique event ID (hex-random) */
  id: string;
  type: "payment.received";
  /** Unix timestamp (seconds) of when the event was created */
  created: number;
  data: {
    endpoint: string;
    amountSats: number;
    preimage: string;
    paymentHash: string;
    ownerAddress: string;
  };
}

// ─── Signing ──────────────────────────────────────────────────────────────────

/**
 * Compute the `l402-signature` header value for a webhook payload.
 * Format: `t=<unix_ts>,v1=<hmac_hex>` — identical to Stripe's scheme.
 */
export function buildSignatureHeader(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Verify an incoming webhook and return the parsed event.
 *
 * @throws if the signature is invalid or the timestamp is outside the tolerance window.
 *
 * @example
 * ```ts
 * import { verifyWebhook } from "l402-kit";
 *
 * app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
 *   const event = verifyWebhook(
 *     process.env.L402_WEBHOOK_SECRET!,
 *     req.body.toString(),
 *     req.headers["l402-signature"] as string,
 *   );
 *   console.log("Payment received:", event.data.amountSats, "sats");
 *   res.sendStatus(200);
 * });
 * ```
 */
export function verifyWebhook(
  secret: string,
  rawBody: string,
  signatureHeader: string,
  toleranceSecs = 300,
): WebhookEvent {
  if (!signatureHeader) throw new Error("[l402] Missing l402-signature header");

  const parts: Record<string, string> = {};
  for (const chunk of signatureHeader.split(",")) {
    const eq = chunk.indexOf("=");
    if (eq !== -1) parts[chunk.slice(0, eq)] = chunk.slice(eq + 1);
  }

  const ts = parseInt(parts["t"] ?? "0", 10);
  if (!ts) throw new Error("[l402] Invalid l402-signature: missing timestamp");

  const drift = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (drift > toleranceSecs)
    throw new Error(`[l402] Webhook timestamp too old (${drift}s drift, tolerance ${toleranceSecs}s)`);

  const v1 = parts["v1"];
  if (!v1) throw new Error("[l402] Invalid l402-signature: missing v1");

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  // Timing-safe comparison prevents timing attacks
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(v1.padEnd(expected.length, "0"), "hex");
  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new Error("[l402] Webhook signature mismatch");
  }

  try {
    return JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new Error("[l402] Webhook body is not valid JSON");
  }
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

/**
 * POST a signed webhook event to `url`. Never throws — errors are logged.
 * Called automatically by the `l402` middleware when `webhookUrl` is set.
 */
export async function sendWebhook(
  url: string,
  secret: string,
  event: WebhookEvent,
): Promise<void> {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = buildSignatureHeader(secret, timestamp, body);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "l402-signature": sig,
        "User-Agent": "l402-kit/0.9",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error(`[l402] webhook delivery failed: HTTP ${r.status} → ${url}`);
    }
  } catch (err) {
    console.error("[l402] webhook delivery error:", String(err));
  }
}
