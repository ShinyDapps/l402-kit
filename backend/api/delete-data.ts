import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;

const serviceHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { lightningAddress, token } = (req.body as Record<string, string>) ?? {};

  if (!lightningAddress || !lightningAddress.includes("@")) {
    return res.status(400).json({ error: "Invalid lightning address" });
  }
  if (!token || token.length !== 64) {
    return res.status(401).json({ error: "LNURL-auth token required" });
  }

  // ── Validate single-use deletion token ──────────────────────────────────
  const challengeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/lnurl_challenges?token=eq.${encodeURIComponent(token)}&select=verified,token_expires_at,lightning_address&limit=1`,
    { headers: serviceHeaders }
  );
  const challenges = (await challengeRes.json()) as {
    verified: boolean;
    token_expires_at: string;
    lightning_address: string | null;
  }[];
  const challenge = challenges[0];

  if (!challenge || !challenge.verified) {
    return res.status(401).json({ error: "Invalid or unverified token" });
  }
  if (new Date(challenge.token_expires_at) < new Date()) {
    return res.status(401).json({ error: "Token expired — restart the LNURL-auth flow" });
  }

  // Revoke token immediately (single-use — prevent any race-condition replay)
  await fetch(
    `${SUPABASE_URL}/rest/v1/lnurl_challenges?token=eq.${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: { ...serviceHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ token: null }),
    }
  );

  const addr = lightningAddress.trim().toLowerCase();

  try {
    const [paymentsRes, proRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(addr)}`,
        { method: "DELETE", headers: serviceHeaders }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(addr)}`,
        { method: "DELETE", headers: serviceHeaders }
      ),
    ]);

    const deletedPayments = paymentsRes.ok ? ((await paymentsRes.json()) as unknown[]) : [];
    const deletedPro      = proRes.ok      ? ((await proRes.json()) as unknown[])      : [];

    return res.status(200).json({
      deleted: {
        payments:  Array.isArray(deletedPayments) ? deletedPayments.length : 0,
        proAccess: Array.isArray(deletedPro) && deletedPro.length > 0,
      },
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}
