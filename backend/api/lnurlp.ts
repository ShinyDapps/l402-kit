/**
 * LNURL-pay endpoint — implementa o protocolo Lightning Address.
 * GET /.well-known/lnurlp/:name  → rewritten para /api/lnurlp?name=:name
 *
 * Fase 1 (payRequest): retorna metadata + callback URL
 * Fase 2 (invoice):    ?amount=<msats> → cria invoice via Supabase Edge Function
 *
 * Resultado: shinydapps@l402kit.com funciona em qualquer carteira Lightning.
 * Para trocar de wallet: só muda a Edge Function. O endereço permanece o mesmo.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const DOMAIN       = "l402kit.com";
const USERNAME     = "shinydapps";
const DISPLAY_NAME = "ShinyDapps — l402-kit";
const DESCRIPTION  = "Lightning Address for l402kit.com";
const MIN_SATS     = 1;
const MAX_SATS     = 1_000_000;

const SUPABASE_URL  = process.env.SUPABASE_URL      ?? "";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const name   = (req.query.name as string ?? "").toLowerCase();
  const amount = req.query.amount ? Number(req.query.amount) : null; // msats

  if (name !== USERNAME) {
    return res.status(404).json({ status: "ERROR", reason: `User ${name} not found` });
  }

  // ── Fase 2: gerar invoice ──────────────────────────────────────────────────
  if (amount !== null) {
    if (!Number.isInteger(amount) || amount < MIN_SATS * 1000) {
      return res.status(400).json({ status: "ERROR", reason: "Amount too small" });
    }
    if (amount > MAX_SATS * 1000) {
      return res.status(400).json({ status: "ERROR", reason: "Amount too large" });
    }

    const amountSats = Math.floor(amount / 1000);

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

      if (!r.ok) throw new Error(`Edge function HTTP ${r.status}`);
      const { paymentRequest } = await r.json();

      return res.json({ pr: paymentRequest, routes: [] });
    } catch (err) {
      console.error("[lnurlp] invoice error:", String(err));
      return res.status(503).json({ status: "ERROR", reason: "Invoice generation failed" });
    }
  }

  // ── Fase 1: payRequest metadata ────────────────────────────────────────────
  const callback = `https://${DOMAIN}/api/lnurlp?name=${USERNAME}`;
  const metadata = JSON.stringify([
    ["text/plain",       DESCRIPTION],
    ["text/identifier",  `${USERNAME}@${DOMAIN}`],
    ["text/long-desc",   DISPLAY_NAME],
  ]);

  return res.json({
    tag:            "payRequest",
    callback,
    minSendable:    MIN_SATS * 1000,
    maxSendable:    MAX_SATS * 1000,
    metadata,
    commentAllowed: 144,
  });
}
