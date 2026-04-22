import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

// Resend uses Svix for webhook signing.
// Signed payload: "{svix-id}.{svix-timestamp}.{raw-body}"
// Secret is base64-encoded after stripping the "whsec_" prefix.
function verifySignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): boolean {
  if (!WEBHOOK_SECRET) return false;

  const secret = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(toSign).digest("base64");

  // svixSignature format: "v1,<base64>" — may contain multiple space-separated sigs
  const sigs = svixSignature.split(" ");
  for (const sig of sigs) {
    const [version, value] = sig.split(",");
    if (version !== "v1" || !value) continue;
    try {
      if (timingSafeEqual(Buffer.from(value, "base64"), Buffer.from(expected, "base64")))
        return true;
    } catch {
      // length mismatch — not a match
    }
  }
  return false;
}

// Map Resend event types to our email_status values
const STATUS_MAP: Record<string, string> = {
  "email.sent":      "sending",
  "email.delivered": "delivered",
  "email.bounced":   "bounced",
  "email.complained":"complained",
};

async function updateEmailStatus(resendId: string, status: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?resend_id=eq.${encodeURIComponent(resendId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email_status: status }),
    }
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const svixId        = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature)
    return res.status(400).json({ error: "Missing Svix headers" });

  // Replay protection: reject events older than 5 minutes
  const ts = parseInt(svixTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300)
    return res.status(400).json({ error: "Timestamp too old" });

  const rawBody = JSON.stringify(req.body);
  if (!verifySignature(rawBody, svixId, svixTimestamp, svixSignature))
    return res.status(401).json({ error: "Invalid signature" });

  const { type, data } = req.body as { type: string; data: { email_id?: string } };
  const resendId = data?.email_id;

  if (!resendId || !STATUS_MAP[type]) {
    // Unknown event — acknowledge without action
    return res.status(200).json({ ok: true });
  }

  try {
    await updateEmailStatus(resendId, STATUS_MAP[type]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[resend-webhook] update error", e);
    return res.status(500).json({ error: "Failed to update status" });
  }
}
