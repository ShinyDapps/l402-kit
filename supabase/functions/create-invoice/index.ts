/**
 * Supabase Edge Function — create-invoice
 *
 * Cria invoice Lightning via Blink API.
 * BLINK_API_KEY e BLINK_WALLET_ID ficam em Supabase Secrets — nunca saem daqui.
 * Cloudflare Workers chama esta função com a anon key (sem expor credenciais do Blink).
 *
 * Deploy:
 *   supabase functions deploy create-invoice --no-verify-jwt
 *   supabase secrets set BLINK_API_KEY=<key> BLINK_WALLET_ID=<id>
 */

const BLINK_API_KEY   = Deno.env.get("BLINK_API_KEY")   ?? "";
const BLINK_WALLET_ID = Deno.env.get("BLINK_WALLET_ID") ?? "";
const ALLOWED_ORIGIN  = Deno.env.get("ALLOWED_ORIGIN")  ?? "*";

const cors = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function blinkCreateInvoice(amountSats: number) {
  const res = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
    body: JSON.stringify({
      query: `mutation CreateInvoice($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          invoice { paymentRequest paymentHash }
          errors { message }
        }
      }`,
      variables: {
        input: { walletId: BLINK_WALLET_ID, amount: amountSats, memo: "l402-kit" },
      },
    }),
    // @ts-ignore — Deno supports AbortSignal.timeout
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Blink HTTP ${res.status}`);
  const json = await res.json() as {
    data: {
      lnInvoiceCreate: {
        invoice: { paymentRequest: string; paymentHash: string };
        errors: { message: string }[];
      };
    };
  };
  const { invoice, errors } = json.data.lnInvoiceCreate;
  if (errors?.length) throw new Error(errors[0].message);
  return invoice;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let amountSats: number;
  try {
    const body = await req.json();
    amountSats = Number(body.amountSats);
    if (!amountSats || amountSats < 1) throw new Error("invalid");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid amountSats" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const invoice = await blinkCreateInvoice(amountSats);
    // macaroon = base64(JSON({ hash, exp })) — same format as Node backend
    const macaroon = btoa(JSON.stringify({
      hash: invoice.paymentHash,
      exp: Date.now() + 3_600_000,
    }));
    return new Response(JSON.stringify({
      paymentRequest: invoice.paymentRequest,
      paymentHash:    invoice.paymentHash,
      macaroon,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[create-invoice]", String(err));
    return new Response(JSON.stringify({ error: "Lightning provider unavailable" }), {
      status: 503, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
