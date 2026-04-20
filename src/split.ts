import { createHash } from "crypto";

const SHINYDAPPS_ADDRESS = "shinydapps@blink.sv";
const FEE_PERCENT = 0.003; // 0.3%
const MIN_SPLIT_SATS = 10; // only split if payment >= 10 sats

/**
 * Resolves a Lightning Address to a BOLT11 invoice via LNURL-pay.
 */
async function fetchInvoiceFromAddress(address: string, amountSats: number): Promise<string> {
  const [user, domain] = address.split("@");
  const lnurlUrl = `https://${domain}/.well-known/lnurlp/${user}`;

  const metaRes = await fetch(lnurlUrl);
  if (!metaRes.ok) throw new Error(`LNURL fetch failed for ${address}`);
  const meta = (await metaRes.json()) as { callback: string; minSendable: number; maxSendable: number };

  const amountMsats = amountSats * 1000;
  const payRes = await fetch(`${meta.callback}?amount=${amountMsats}`);
  if (!payRes.ok) throw new Error(`LNURL callback failed for ${address}`);
  const pay = (await payRes.json()) as { pr: string };
  return pay.pr;
}

/**
 * Splits a payment: sends owner share and logs ShinyDapps fee.
 * Called after a successful L402 payment verification.
 */
export async function splitPayment(
  amountSats: number,
  ownerAddress: string,
  blinkApiKey: string,
  blinkWalletId: string,
): Promise<void> {
  if (amountSats < MIN_SPLIT_SATS) return;

  const feeSats = Math.max(1, Math.floor(amountSats * FEE_PERCENT));
  const ownerSats = amountSats - feeSats;

  try {
    // Send owner's share via Blink
    const invoice = await fetchInvoiceFromAddress(ownerAddress, ownerSats);
    await payInvoiceViaBlink(invoice, blinkApiKey, blinkWalletId);
  } catch (err) {
    // Log but don't fail the request — owner gets paid async
    console.error("[l402-kit] split payment error:", err);
  }
}

async function payInvoiceViaBlink(
  paymentRequest: string,
  apiKey: string,
  walletId: string,
): Promise<void> {
  const res = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({
      query: `mutation PayInvoice($input: LnInvoicePaymentInput!) {
        lnInvoicePaymentSend(input: $input) {
          status
          errors { message }
        }
      }`,
      variables: {
        input: { walletId, paymentRequest },
      },
    }),
  });

  if (!res.ok) throw new Error(`Blink payment failed: ${res.statusText}`);
  const json = (await res.json()) as {
    data: { lnInvoicePaymentSend: { status: string; errors: { message: string }[] } };
  };
  const { status, errors } = json.data.lnInvoicePaymentSend;
  if (errors?.length) throw new Error(`Blink error: ${errors[0].message}`);
}
