/**
 * Supabase Edge Function — blink-webhook
 *
 * Recebe confirmação de pagamento do Blink (via Cloudflare Worker que já
 * verificou a assinatura Svix). O Worker enriquece o body com _ownerAddress
 * e _amountSats buscados do KV antes de repassar aqui.
 *
 * Responsabilidades:
 *   1. Upsert em pending_splits (source of truth para o split — independente da tabela payments)
 *   2. Tenta o split até 3x com backoff de 2s
 *   3. Marca status completed/failed na tabela
 *
 * Deploy:
 *   supabase functions deploy blink-webhook --no-verify-jwt
 */

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FEE_PERCENT               = 0.003;
const MIN_SPLIT_SATS            = 10;
const MAX_ATTEMPTS              = 3;
const RETRY_DELAY_MS            = 2000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function upsertPendingSplit(
  paymentHash: string,
  ownerAddress: string,
  amountSats: number,
  ownerSats: number,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/pending_splits`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer":        "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ payment_hash: paymentHash, owner_address: ownerAddress, amount_sats: amountSats, owner_sats: ownerSats }),
  });
}

async function markSplit(
  paymentHash: string,
  status: "completed" | "failed",
  attempts: number,
  lastError?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status, attempts };
  if (status === "completed") patch.completed_at = new Date().toISOString();
  if (lastError) patch.last_error = lastError.slice(0, 500);

  await fetch(`${SUPABASE_URL}/rest/v1/pending_splits?payment_hash=eq.${paymentHash}`, {
    method: "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(patch),
  });
}

async function callPayInvoice(ownerAddress: string, ownerSats: number): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pay-invoice`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
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

async function trySplitWithRetry(
  paymentHash: string,
  ownerAddress: string,
  ownerSats: number,
): Promise<void> {
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await callPayInvoice(ownerAddress, ownerSats);
      await markSplit(paymentHash, "completed", attempt);
      return;
    } catch (err) {
      lastError = String(err);
      console.error(`[blink-webhook] split attempt ${attempt}/${MAX_ATTEMPTS} failed:`, lastError);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }

  await markSplit(paymentHash, "failed", MAX_ATTEMPTS, lastError);
  throw new Error(`Split failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
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

  const paymentHash: string | undefined =
    (body?.data as Record<string, unknown> | undefined)?.initiationVia
      ? ((body.data as Record<string, unknown>).initiationVia as Record<string, unknown>)?.paymentHash as string
      : undefined;

  const ownerAddress = body._ownerAddress as string | undefined;
  const amountSats   = body._amountSats   as number | undefined;

  if (!ownerAddress || !amountSats) {
    return json({ ok: true, skipped: true, reason: "sovereign mode — no split needed" });
  }

  if (amountSats < MIN_SPLIT_SATS) {
    return json({ ok: true, skipped: true, reason: "below minimum split threshold" });
  }

  const feeSats   = Math.max(1, Math.floor(amountSats * FEE_PERCENT));
  const ownerSats = amountSats - feeSats;
  const hash      = paymentHash ?? `nohash_${Date.now()}`;

  // Write to pending_splits immediately — source of truth, independent of payments table timing
  await upsertPendingSplit(hash, ownerAddress, amountSats, ownerSats).catch(() => {});

  try {
    await trySplitWithRetry(hash, ownerAddress, ownerSats);
    return json({ ok: true, ownerAddress, ownerSats, feeSats });
  } catch (err) {
    console.error("[blink-webhook] split permanently failed:", String(err));
    // Return 200 to stop Blink/Svix from re-delivering the webhook.
    // The failure is recorded in pending_splits for manual review.
    return json({ ok: false, error: String(err), recorded: true });
  }
});
