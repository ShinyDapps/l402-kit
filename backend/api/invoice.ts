import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes } from "crypto";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";

/** Retry a fetch-based operation up to `attempts` times with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

async function blinkCreateInvoice(amountSats: number): Promise<{ paymentRequest: string; paymentHash: string }> {
  const gql = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
    body: JSON.stringify({
      query: `mutation CreateInvoice($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          invoice { paymentRequest paymentHash }
          errors { message }
        }
      }`,
      variables: { input: { walletId: BLINK_WALLET_ID, amount: amountSats, memo: "l402-kit" } },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!gql.ok) throw new Error(`Blink HTTP ${gql.status}`);
  const json = (await gql.json()) as {
    data: { lnInvoiceCreate: { invoice: { paymentRequest: string; paymentHash: string }; errors: { message: string }[] } };
  };
  const { invoice, errors } = json.data.lnInvoiceCreate;
  if (errors?.length) throw new Error(errors[0].message);
  return invoice;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || amountSats < 1) return res.status(400).json({ error: "Invalid amountSats" });

  try {
    const preimage = randomBytes(32).toString("hex");
    void preimage; // preimage kept locally for macaroon; Blink generates its own hash

    const invoice = await withRetry(() => blinkCreateInvoice(amountSats));

    const macaroon = Buffer.from(
      JSON.stringify({ hash: invoice.paymentHash, exp: Date.now() + 3600_000 })
    ).toString("base64");

    res.json({ paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash, macaroon });
  } catch (err) {
    console.error("[invoice] all retries failed:", String(err));
    res.status(503).json({ error: "Lightning provider temporarily unavailable. Retry in a moment." });
  }
}
