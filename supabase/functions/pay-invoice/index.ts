/**
 * Supabase Edge Function — pay-invoice
 *
 * Resolve um Lightning Address via LNURL-pay e paga o invoice resultante
 * usando a Blink API. Chamada pelo blink-webhook após confirmação de pagamento
 * e pelo /api/split do Worker.
 *
 * Deploy:
 *   supabase functions deploy pay-invoice --no-verify-jwt
 *   (BLINK_API_KEY e BLINK_WALLET_ID já estão nos Supabase Secrets)
 */

const BLINK_API_KEY   = Deno.env.get("BLINK_API_KEY")   ?? "";
const BLINK_WALLET_ID = Deno.env.get("BLINK_WALLET_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function resolveLnurlp(address: string, amountSats: number): Promise<string> {
  const [user, domain] = address.split("@");
  if (!user || !domain) throw new Error(`Invalid Lightning Address: ${address}`);

  const metaRes = await fetch(`https://${domain}/.well-known/lnurlp/${user}`);
  if (!metaRes.ok) throw new Error(`LNURL fetch failed for ${address}: ${metaRes.status}`);

  const meta = await metaRes.json() as {
    callback: string;
    minSendable: number;
    maxSendable: number;
  };

  const amountMsats = amountSats * 1000;
  if (amountMsats < meta.minSendable || amountMsats > meta.maxSendable) {
    throw new Error(
      `Amount ${amountSats} sats out of range [${meta.minSendable / 1000}, ${meta.maxSendable / 1000}]`
    );
  }

  const payRes = await fetch(`${meta.callback}?amount=${amountMsats}`);
  if (!payRes.ok) throw new Error(`LNURL callback failed for ${address}: ${payRes.status}`);

  const pay = await payRes.json() as { pr: string };
  if (!pay.pr) throw new Error("LNURL callback returned no payment request");
  return pay.pr;
}

async function payViaBlinkGraphQL(paymentRequest: string): Promise<void> {
  const res = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": BLINK_API_KEY,
    },
    body: JSON.stringify({
      query: `mutation PayInvoice($input: LnInvoicePaymentInput!) {
        lnInvoicePaymentSend(input: $input) {
          status
          errors { message }
        }
      }`,
      variables: {
        input: { walletId: BLINK_WALLET_ID, paymentRequest },
      },
    }),
    // @ts-ignore — Deno supports AbortSignal.timeout
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Blink HTTP ${res.status}`);

  const result = await res.json() as {
    data: {
      lnInvoicePaymentSend: {
        status: string;
        errors: { message: string }[];
      };
    };
  };

  const { status, errors } = result.data.lnInvoicePaymentSend;
  if (errors?.length) throw new Error(`Blink error: ${errors[0].message}`);
  if (status === "FAILURE") throw new Error("Blink payment returned FAILURE");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let ownerAddress: string;
  let ownerSats: number;

  try {
    const body = await req.json();
    ownerAddress = body.ownerAddress;
    ownerSats    = Number(body.ownerSats);
    if (!ownerAddress || !ownerSats || ownerSats < 1) throw new Error("invalid");
  } catch {
    return json({ error: "Required: ownerAddress (string), ownerSats (number >= 1)" }, 400);
  }

  try {
    const paymentRequest = await resolveLnurlp(ownerAddress, ownerSats);
    await payViaBlinkGraphQL(paymentRequest);
    return json({ ok: true, ownerAddress, ownerSats });
  } catch (err) {
    console.error("[pay-invoice]", String(err));
    return json({ error: "Split payment failed", detail: String(err) }, 502);
  }
});
