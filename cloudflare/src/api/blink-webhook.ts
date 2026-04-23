import type { Env } from "../worker";

export async function handleBlinkHook(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.text();
  const signature = req.headers.get("svix-signature") ?? "";

  // Forward to Supabase for processing (keeps webhook secret server-side)
  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/blink-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      "svix-signature": signature,
    },
    body,
  });

  const data = await r.json();
  return json(data, r.ok ? 200 : r.status);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
