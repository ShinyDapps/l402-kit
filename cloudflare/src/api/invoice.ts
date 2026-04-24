import type { Env } from "../worker";

const RATE_LIMIT = 20;
const RATE_WINDOW = 60; // seconds

async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  const key = `inv_rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const raw = await env.demo_preimages.get(key);
  if (raw) {
    const { count, reset } = JSON.parse(raw) as { count: number; reset: number };
    if (now < reset && count >= RATE_LIMIT) return true;
    const newCount = now < reset ? count + 1 : 1;
    const newReset = now < reset ? reset : now + RATE_WINDOW;
    await env.demo_preimages.put(key, JSON.stringify({ count: newCount, reset: newReset }), { expirationTtl: RATE_WINDOW });
  } else {
    await env.demo_preimages.put(key, JSON.stringify({ count: 1, reset: now + RATE_WINDOW }), { expirationTtl: RATE_WINDOW });
  }
  return false;
}

export async function handleInvoice(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (await isRateLimited(ip, env)) return json({ error: "Too many requests. Max 20 invoices/minute per IP." }, 429);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const amountSats    = Number(body?.amountSats);
  const ownerAddress  = typeof body?.ownerAddress === "string" ? body.ownerAddress : undefined;
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

    const data = await r.json() as { paymentHash?: string; paymentRequest?: string; macaroon?: string };

    // Armazena paymentHash → {ownerAddress, amountSats} no KV para o blink-webhook usar no split
    if (ownerAddress && data.paymentHash) {
      await env.demo_preimages.put(
        `l402_inv:${data.paymentHash}`,
        JSON.stringify({ ownerAddress, amountSats }),
        { expirationTtl: 7200 },  // 2h — cobre expiração do invoice com folga
      );
    }

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
