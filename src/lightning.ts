import type { Invoice } from "./types";

export async function createInvoice(amountSats: number, apiKey: string): Promise<Invoice> {
  if (!apiKey) throw new Error("Lightning API key missing. Set OPENNODE_API_KEY env var.");

  const baseUrl = process.env.OPENNODE_TESTMODE === "true"
    ? "https://dev-api.opennode.com"
    : "https://api.opennode.com";

  const res = await fetch(`${baseUrl}/v1/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey,
    },
    body: JSON.stringify({
      amount: amountSats,
      description: "L402 API access",
      currency: "SATS",
      auto_settle: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenNode invoice creation failed (${res.status}): ${err}`);
  }

  const { data } = (await res.json()) as {
    data: {
      lightning_invoice: { payreq: string };
      id: string;
      amount: number;
    };
  };

  const macaroon = Buffer.from(JSON.stringify({
    hash: data.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64");

  return {
    paymentRequest: data.lightning_invoice.payreq,
    paymentHash: data.id,
    macaroon,
    amountSats,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function checkPayment(chargeId: string, apiKey: string): Promise<boolean> {
  const baseUrl = process.env.OPENNODE_TESTMODE === "true"
    ? "https://dev-api.opennode.com"
    : "https://api.opennode.com";

  const res = await fetch(`${baseUrl}/v1/charge/${chargeId}`, {
    headers: { "Authorization": apiKey },
  });
  if (!res.ok) return false;
  const { data } = (await res.json()) as { data: { status?: string } };
  return data.status === "paid";
}
