import type { Env } from "../worker";

function sb(path: string, env: Env, key?: string): Promise<Response> {
  const k = key ?? env.SUPABASE_ANON_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: k, Authorization: `Bearer ${k}` },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleLnurlAuth(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const isDashboard = url.searchParams.get("dashboard") === "1";
  const poll = url.searchParams.get("poll");
  const sig = url.searchParams.get("sig");
  const k1 = url.searchParams.get("k1");
  const key = url.searchParams.get("key");

  // Phase 1: generate challenge
  if (!sig && !poll) {
    const k1 = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    const domain = "l402kit.com";
    const tag = "login";
    const lnurl = `https://${domain}/api/lnurl-auth?k1=${k1}&tag=${tag}${isDashboard ? "&dashboard=1" : ""}`;

    await fetch(`${env.SUPABASE_URL}/rest/v1/lnurl_challenges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ k1, lnurl, is_dashboard: isDashboard, expires_at: new Date(Date.now() + 300_000).toISOString() }),
    });

    return json({ k1, lnurl });
  }

  // Phase 2: wallet callback (wallet calls this with sig+key+k1)
  if (sig && k1 && key) {
    const rows = await sb(
      `/lnurl_challenges?k1=eq.${k1}&select=id,is_dashboard,expires_at&limit=1`,
      env
    ).then(r => r.json()) as { id: string; is_dashboard: boolean; expires_at: string }[];

    if (!rows[0] || new Date(rows[0].expires_at) < new Date()) {
      return json({ status: "ERROR", reason: "Invalid or expired challenge" });
    }

    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, "0")).join("");

    await fetch(`${env.SUPABASE_URL}/rest/v1/lnurl_challenges?k1=eq.${k1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        verified: true,
        pubkey: key,
        token,
        token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });

    return json({ status: "OK" });
  }

  // Phase 3: poll for completion
  if (poll) {
    const rows = await sb(
      `/lnurl_challenges?k1=eq.${poll}&select=verified,token&limit=1`,
      env
    ).then(r => r.json()) as { verified: boolean; token: string }[];

    const row = rows[0];
    if (!row) return json({ verified: false });
    return json({ verified: row.verified, token: row.verified ? row.token : null });
  }

  return json({ error: "Invalid request" }, 400);
}
