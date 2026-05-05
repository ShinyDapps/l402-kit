import type { Env } from "../worker";

/**
 * GET /api/dashboard/:address
 * Header: x-dashboard-secret: <DASHBOARD_SECRET>
 *
 * Returns split history for an owner Lightning address.
 */
export async function handleDashboard(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-dashboard-secret");
  if (!secret || secret !== env.DASHBOARD_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const address = url.pathname.replace(/^\/api\/dashboard\/?/, "").trim();
  if (!address || !address.includes("@")) {
    return json({ error: "Lightning address required: /api/dashboard/:address" }, 400);
  }

  const encoded = encodeURIComponent(address);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pending_splits?owner_address=eq.${encoded}&order=created_at.desc&limit=100`,
    {
      headers: {
        "apikey":        env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );

  if (!res.ok) {
    return json({ error: "Failed to fetch splits" }, 502);
  }

  const splits = await res.json() as Array<{
    payment_hash: string;
    amount_sats: number;
    owner_sats: number;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    completed_at: string | null;
  }>;

  const completed = splits.filter(s => s.status === "completed");
  const failed    = splits.filter(s => s.status === "failed");
  const pending   = splits.filter(s => s.status === "pending");

  const totalReceivedSats = completed.reduce((sum, s) => sum + s.owner_sats, 0);

  return json({
    owner: address,
    summary: {
      total_received_sats: totalReceivedSats,
      completed: completed.length,
      failed: failed.length,
      pending: pending.length,
    },
    splits,
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
