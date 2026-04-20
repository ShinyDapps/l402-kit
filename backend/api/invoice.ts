import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes } from "crypto";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const amountSats = Number(req.body?.amountSats);
  if (!amountSats || amountSats < 1) return res.status(400).json({ error: "Invalid amountSats" });

  try {
    const preimage = randomBytes(32).toString("hex");
    const paymentHash = createHash("sha256").update(preimage, "hex").digest("hex");

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
    });

    const json = (await gql.json()) as {
      data: { lnInvoiceCreate: { invoice: { paymentRequest: string; paymentHash: string }; errors: { message: string }[] } };
    };

    const { invoice, errors } = json.data.lnInvoiceCreate;
    if (errors?.length) return res.status(500).json({ error: errors[0].message });

    const macaroon = Buffer.from(JSON.stringify({ hash: invoice.paymentHash, exp: Date.now() + 3600_000 })).toString("base64");

    res.json({ paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash, macaroon });
  } catch (err) {
    res.status(500).json({ error: "Failed to create invoice" });
  }
}
