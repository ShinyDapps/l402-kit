/**
 * Cria invoice Lightning chamando a Supabase Edge Function `create-invoice`.
 * BLINK_API_KEY fica em Supabase Secrets — Vercel não precisa mais da chave.
 * Vercel usa apenas SUPABASE_URL + SUPABASE_ANON_KEY (ambas de baixo risco).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL  = process.env.SUPABASE_URL       ?? "";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY  ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || amountSats < 1) return res.status(400).json({ error: "Invalid amountSats" });

  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ amountSats }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[invoice] edge function error:", r.status, text);
      throw new Error(`Edge function HTTP ${r.status}`);
    }

    const data = await r.json();
    return res.json(data);
  } catch (err) {
    console.error("[invoice] failed:", String(err));
    return res.status(503).json({ error: "Lightning provider temporarily unavailable. Retry in a moment." });
  }
}
