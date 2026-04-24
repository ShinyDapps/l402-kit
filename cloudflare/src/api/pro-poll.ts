import type { Env } from "../worker";

// Polled every 3s by the Pro modal to detect payment confirmation.
// Checks if the macaroon's payment_hash exists in pro_access (inserted by blink-webhook).
// Falls back to checking Supabase payments table if pro_access not yet written.
export async function handleProPoll(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const paymentHash = url.searchParams.get("paymentHash") ?? "";
  const address = url.searchParams.get("address") ?? "";
  const tier = url.searchParams.get("tier") ?? "pro";

  if (!paymentHash || !address) return json({ paid: false, error: "Missing params" }, 400);

  // Check if payment exists and activate pro_access if not yet done
  const [accessRes, paymentRes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1&select=expires_at`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } },
    ),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/payments?payment_hash=eq.${encodeURIComponent(paymentHash)}&limit=1&select=paid`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } },
    ),
  ]);

  const accessRows = await accessRes.json() as { expires_at: string }[];
  if (accessRows.length > 0) return json({ paid: true, expiresAt: accessRows[0].expires_at });

  const paymentRows = await paymentRes.json() as { paid: boolean }[];
  const paid = paymentRows[0]?.paid === true;
  if (!paid) return json({ paid: false });

  // Payment confirmed — create pro_access row
  const days = tier === "lifetime" ? 365 * 100 : tier === "business" ? 30 : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await fetch(`${env.SUPABASE_URL}/rest/v1/pro_access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify({ address, expires_at: expiresAt, payment_hash: paymentHash, tier }),
  });

  return json({ paid: true, expiresAt });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
