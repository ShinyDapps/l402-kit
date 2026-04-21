import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const raw = req.body?.email;
  if (!raw || typeof raw !== "string")
    return res.status(400).json({ error: "Email required" });

  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: "Invalid email" });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email }),
    });

    // 409 = unique violation (already signed up) — treat as success
    if (r.ok || r.status === 409)
      return res.status(200).json({ ok: true });

    const err = await r.text();
    console.error("[waitlist] supabase error", r.status, err);
    return res.status(500).json({ error: "Failed to save" });
  } catch (e) {
    console.error("[waitlist] unexpected error", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
