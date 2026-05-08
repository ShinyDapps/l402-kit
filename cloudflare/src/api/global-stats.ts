import type { Env } from "../worker";

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
    // Use Supabase RPC to SUM server-side — avoids fetching all rows
    fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/total_payment_sats`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } },
    ),
  ]);

  const range = countRes.headers.get("content-range") ?? "";
  const total = parseInt(range.split("/")[1] ?? "0") || 0;

  let totalSats = 0;
  try {
    if (sumsRes.ok) {
      const result = await sumsRes.json() as number | null;
      totalSats = result ?? 0;
    }
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ count: total, totalSats }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}