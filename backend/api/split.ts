import type { VercelRequest, VercelResponse } from "@vercel/node";

const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";
const FEE_PERCENT = 0.003;
const MIN_SATS = 10;

async function fetchInvoiceFromAddress(address: string, amountSats: number): Promise<string> {
  const [user, domain] = address.split("@");
  const meta = await fetch(`https://${domain}/.well-known/lnurlp/${user}`).then(r => r.json()) as { callback: string };
  const pay = await fetch(`${meta.callback}?amount=${amountSats * 1000}`).then(r => r.json()) as { pr: string };
  return pay.pr;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { amountSats, ownerAddress } = req.body ?? {};
  if (!amountSats || !ownerAddress) return res.status(400).json({ error: "Missing amountSats or ownerAddress" });
  if (amountSats < MIN_SATS) return res.json({ ok: true, skipped: true });

  const ownerSats = Math.floor(amountSats * (1 - FEE_PERCENT));

  try {
    const paymentRequest = await fetchInvoiceFromAddress(ownerAddress, ownerSats);

    const gql = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
      body: JSON.stringify({
        query: `mutation Pay($input: LnInvoicePaymentInput!) {
          lnInvoicePaymentSend(input: $input) {
            status errors { message }
          }
        }`,
        variables: { input: { walletId: BLINK_WALLET_ID, paymentRequest } },
      }),
    });

    const json = (await gql.json()) as { data: { lnInvoicePaymentSend: { status: string; errors: { message: string }[] } } };
    const { errors } = json.data.lnInvoicePaymentSend;
    if (errors?.length) throw new Error(errors[0].message);

    res.json({ ok: true, ownerSats });
  } catch (err) {
    res.status(500).json({ error: "Split failed", detail: String(err) });
  }
}
