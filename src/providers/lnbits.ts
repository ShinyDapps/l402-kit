import type { Invoice, LightningProvider } from "../types";

/**
 * LNbits — self-hosted or public instance Lightning provider.
 * Get key: seu-lnbits.com → API info → Invoice/read key
 */
export class LNbitsProvider implements LightningProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://legend.lnbits.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": this.apiKey },
      body: JSON.stringify({ out: false, amount: amountSats, memo: "L402 API access" }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`LNbits failed (${res.status}): ${err}`);
    }
    const data = (await res.json()) as { payment_request: string; payment_hash: string };
    const macaroon = Buffer.from(JSON.stringify({ hash: data.payment_hash, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64");
    return { paymentRequest: data.payment_request, paymentHash: data.payment_hash, macaroon, amountSats, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  async checkPayment(paymentHash: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/v1/payments/${paymentHash}`, { headers: { "X-Api-Key": this.apiKey } });
    if (!res.ok) return false;
    const data = (await res.json()) as { paid?: boolean };
    return !!data.paid;
  }
}
