/**
 * Supabase Edge Function — blink-webhook
 *
 * Recebe confirmação de pagamento do Blink (via Cloudflare Worker que já
 * verificou a assinatura Svix). O Worker enriquece o body com _ownerAddress
 * e _amountSats buscados do KV antes de repassar aqui.
 *
 * Responsabilidades:
 *   1. Atualiza owner_address na tabela payments (se a linha já existir)
 *   2. Dispara o split: chama pay-invoice com 99.7% para o dev
 *
 * Deploy:
 *   supabase functions deploy blink-webhook --no-verify-jwt
 */

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FEE_PERCENT               = 0.003;  // 0.3% — mesma constante do split.ts Worker
const MIN_SPLIT_SATS            = 10;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function backfillOwnerAddress(paymentHash: string, ownerAddress: string): Promise<void> {
  // Tenta preencher owner_address caso o middleware já tenha logado o pagamento.
  // Ignora silenciosamente se a linha ainda não existe (timing race — o split já foi enviado).
  await fetch(`${SUPABASE_URL}/rest/v1/payments?payment_hash=eq.${paymentHash}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey":        SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify({ owner_address: ownerAddress }),
  }).catch(() => {});
}

async function triggerSplit(ownerAddress: string, amountSats: number): Promise<void> {
  if (amountSats < MIN_SPLIT_SATS) return;

  const feeSats   = Math.max(1, Math.floor(amountSats * FEE_PERCENT));
  const ownerSats = amountSats - feeSats;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/pay-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ ownerAddress, ownerSats }),
    // @ts-ignore
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`pay-invoice ${res.status}: ${detail.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // paymentHash vem do campo padrão do Blink webhook
  const paymentHash: string | undefined =
    (body?.data as Record<string, unknown> | undefined)
      ?.initiationVia
      ? ((body.data as Record<string, unknown>).initiationVia as Record<string, unknown>)?.paymentHash as string
      : undefined;

  // ownerAddress e amountSats foram injetados pelo Worker a partir do KV
  const ownerAddress = body._ownerAddress as string | undefined;
  const amountSats   = body._amountSats   as number | undefined;

  if (!ownerAddress || !amountSats) {
    // Pagamento não é do modo gerenciado (dev soberano) — nada a fazer aqui
    return json({ ok: true, skipped: true });
  }

  // Backfill assíncrono do owner_address (best-effort)
  if (paymentHash) {
    backfillOwnerAddress(paymentHash, ownerAddress).catch(() => {});
  }

  try {
    await triggerSplit(ownerAddress, amountSats);
    return json({ ok: true, ownerAddress, amountSats });
  } catch (err) {
    console.error("[blink-webhook] split failed:", String(err));
    // Retorna 200 para evitar que o Blink reenvie o webhook indefinidamente.
    // O erro fica nos logs do Supabase para investigação manual.
    return json({ ok: false, error: String(err) });
  }
});
