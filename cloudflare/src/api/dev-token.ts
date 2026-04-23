import type { Env } from "../worker";

export async function handleDevToken(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const address = url.searchParams.get("address") ?? "";
    if (!address) return json({ error: "Missing address" }, 400);

    const existing = await getProAccess(address, env);
    if (existing) return json({ access: true, expiresAt: existing.expires_at });

    // Create invoice via Supabase Edge Function (keeps BLINK_API_KEY off Workers)
    const r = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ amountSats: 9000, memo: `ShinyDapps Pro — ${address}` }),
    });
    if (!r.ok) return json({ error: "Failed to create invoice" }, 503);
    const { paymentRequest, paymentHash, macaroon } = await r.json() as { paymentRequest: string; paymentHash: string; macaroon: string };

    return json({ access: false, priceSats: 9000, invoice: paymentRequest, macaroon });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as { macaroon?: string; preimage?: string };
    if (!body.macaroon || !body.preimage) return json({ error: "Missing macaroon or preimage" }, 400);

    try {
      const payload = JSON.parse(atob(body.macaroon)) as { hash: string; address: string; exp: number };
      if (Date.now() > payload.exp) return json({ error: "Invoice expired" }, 401);

      const preimageBytes = hexToUint8Array(body.preimage);
      const hashBuffer = await crypto.subtle.digest("SHA-256", preimageBytes.buffer as ArrayBuffer);
      const digest = uint8ArrayToHex(new Uint8Array(hashBuffer));
      if (digest !== payload.hash) return json({ error: "Invalid payment proof" }, 401);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await fetch(`${env.SUPABASE_URL}/rest/v1/pro_access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ address: payload.address, expires_at: expiresAt, payment_hash: payload.hash }),
      });

      return json({ access: true, expiresAt });
    } catch {
      return json({ error: "Invalid token" }, 400);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

async function getProAccess(address: string, env: Env) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } }
  );
  const rows = await r.json() as { expires_at: string }[];
  return rows[0] ?? null;
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
