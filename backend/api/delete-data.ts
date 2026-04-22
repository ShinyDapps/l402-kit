import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { lightningAddress } = (req.body as Record<string, string>) ?? {};
  if (!lightningAddress || !lightningAddress.includes("@")) {
    return res.status(400).json({ error: "Invalid lightning address" });
  }

  const addr = lightningAddress.trim();
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  try {
    const [paymentsRes, proRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(addr)}`,
        { method: "DELETE", headers }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(addr)}`,
        { method: "DELETE", headers }
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
