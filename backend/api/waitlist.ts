import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to l402-kit</title>
</head>
<body style="margin:0;padding:0;background:#07080E;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07080E;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:0 0 32px;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#F7931A;">⚡ l402-kit</span>
      </td></tr>
      <tr><td style="padding:0 0 24px;">
        <h1 style="margin:0;font-size:28px;font-weight:700;color:#FFFFFF;line-height:1.2;">You're on the list.</h1>
        <p style="margin:16px 0 0;font-size:16px;color:#8B8FA8;line-height:1.6;">
          Thanks for joining the l402-kit waitlist — Bitcoin Lightning pay-per-call for any API in 3 lines of code.
        </p>
      </td></tr>
      <tr><td style="padding:0 0 32px;">
        <div style="background:#0F111A;border:1px solid #1E2130;border-radius:8px;padding:20px 24px;font-family:'JetBrains Mono','Courier New',monospace;">
          <p style="margin:0 0 4px;font-size:12px;color:#F7931A;letter-spacing:0.5px;">TYPESCRIPT</p>
          <pre style="margin:0;font-size:13px;color:#E2E4ED;line-height:1.7;white-space:pre-wrap;">import { l402 } from 'l402-kit';

app.use(l402({
  price: 10,
  ownerLightningAddress: 'you@blink.sv',
}));</pre>
        </div>
      </td></tr>
      <tr><td style="padding:0 0 32px;">
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#FFFFFF;">What you get</h2>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:8px 0;font-size:14px;color:#8B8FA8;line-height:1.5;"><span style="color:#F7931A;margin-right:10px;">⚡</span><strong style="color:#E2E4ED;">Pay-per-call in sats</strong> — $0.001 per request, no Stripe minimum</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:#8B8FA8;line-height:1.5;"><span style="color:#F7931A;margin-right:10px;">🌍</span><strong style="color:#E2E4ED;">No bank, no account</strong> — Lightning settles in &lt;1 second globally</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:#8B8FA8;line-height:1.5;"><span style="color:#F7931A;margin-right:10px;">🤖</span><strong style="color:#E2E4ED;">AI agent native</strong> — TypeScript, Python, Go, Rust</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:#8B8FA8;line-height:1.5;"><span style="color:#F7931A;margin-right:10px;">💰</span><strong style="color:#E2E4ED;">0.3% flat fee</strong> — we only make money when you do</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 0 40px;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:12px;"><a href="https://l402kit.vercel.app" style="display:inline-block;background:#F7931A;color:#07080E;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:6px;">View landing page</a></td>
            <td><a href="https://shinydapps-bd9fa40b.mintlify.app" style="display:inline-block;background:transparent;border:1px solid #2A2D3E;color:#E2E4ED;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">Read the docs</a></td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="border-top:1px solid #1E2130;padding-top:24px;">
        <p style="margin:0;font-size:12px;color:#4A4D5E;line-height:1.6;">
          You're receiving this because you signed up at l402kit.vercel.app.<br>
          Built by <a href="https://github.com/ShinyDapps" style="color:#F7931A;text-decoration:none;">ShinyDapps</a> ·
          <a href="https://github.com/ShinyDapps/l402-kit" style="color:#F7931A;text-decoration:none;">GitHub</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

async function sendWelcomeEmail(email: string): Promise<string | null> {
  if (!RESEND_API_KEY) return null;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "l402-kit <hello@l402kit.com>",
      reply_to: "ShinyDapps <shinydapps@gmail.com>",
      to: email,
      subject: "⚡ You're on the l402-kit waitlist",
      html: WELCOME_HTML,
    }),
  });
  if (!r.ok) return null;
  const d = await r.json() as { id?: string };
  return d.id ?? null;
}

async function saveResendId(email: string, resendId: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ resend_id: resendId, email_status: "sending" }),
    }
  );
}

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
      body: JSON.stringify({ email, email_status: "pending" }),
    });

    // 409 = already signed up — idempotent, skip email
    if (r.status === 409) return res.status(200).json({ ok: true });

    if (!r.ok) {
      const err = await r.text();
      console.error("[waitlist] supabase error", r.status, err);
      return res.status(500).json({ error: "Failed to save" });
    }

    // Send welcome email and persist the Resend ID (fire-and-forget)
    (async () => {
      try {
        const resendId = await sendWelcomeEmail(email);
        if (resendId) await saveResendId(email, resendId);
      } catch (e) {
        console.error("[waitlist] email/tracking error", e);
      }
    })();

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[waitlist] unexpected error", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
