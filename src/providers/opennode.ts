import type { Invoice, LightningProvider } from "../types";

/**
 * OpenNode — Lightning provider with free sandbox.
 * Get API key: app.opennode.com → API Keys
 */
export class OpenNodeProvider implements LightningProvider {
  private apiKey: string;
  private testMode: boolean;

  constructor(apiKey: string, testMode = false) {
    this.apiKey = apiKey;
    this.testMode = testMode;
  }

  private get baseUrl() {
    return this.testMode ? "https://dev-api.opennode.com" : "https://api.opennode.com";
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(`${this.baseUrl}/v1/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": this.apiKey },
      body: JSON.stringify({ amount: amountSats, description: "L402 API access", currency: "SATS", auto_settle: false }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`OpenNode failed (${res.status}): ${err}`);
    }
    const { data } = (await res.json()) as { data: { lightning_invoice: { payreq: string }; id: string } };
    const macaroon = Buffer.from(JSON.stringify({ hash: data.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64");
    return { paymentRequest: data.lightning_invoice.payreq, paymentHash: data.id, macaroon, amountSats, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  async checkPayment(chargeId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/v1/charge/${chargeId}`, { headers: { "Authorization": this.apiKey } });
    if (!res.ok) return false;
    const { data } = (await res.json()) as { data: { status?: string } };
    return data.status === "paid";
  }
}
