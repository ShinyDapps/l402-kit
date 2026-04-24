import type { Env } from "../worker";

// Returns public aggregate stats (payment count + total sats) without
// exposing the Supabase URL or anon key to the browser.
export async function handleGlobalStats(_req: Request, env: Env): Promise<Response> {
  const [countRes, sumsRes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/payments?select=id`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: "0-0",
        },
      },
    ),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/payments?select=amount_sats`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } },
    ),
  ]);

  const range = countRes.headers.get("content-range") ?? "";
  const total = parseInt(range.split("/")[1] ?? "0") || 0;

  let totalSats = 0;
  try {
    const rows = await sumsRes.json() as { amount_sats: number }[];
    totalSats = rows.reduce((s, r) => s + (r.amount_sats || 0), 0);
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ count: total, totalSats }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
