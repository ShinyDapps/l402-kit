import type { Env } from "../worker";

const ipCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 20) return true;
  entry.count++;
  return false;
}

export async function handleInvoice(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (isRateLimited(ip)) return json({ error: "Too many requests. Max 20 invoices/minute per IP." }, 429);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const amountSats = Number(body?.amountSats);
  if (!amountSats || amountSats < 1) return json({ error: "Invalid amountSats" }, 400);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ amountSats }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[invoice] edge fn error:", r.status, text);
      throw new Error(`Edge function HTTP ${r.status}`);
    }

    const data = await r.json();
    return json(data);
  } catch (err) {
    console.error("[invoice] failed:", String(err));
    return json({ error: "Lightning provider temporarily unavailable. Retry in a moment." }, 503);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
