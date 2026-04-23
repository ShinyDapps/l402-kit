import type { Invoice, LightningProvider } from "../types";

/**
 * BTCPay Server provider — full sovereignty. Zero custodian. Your node, your keys.
 *
 * Compatible with any BTCPay Server instance:
 *   - Self-hosted (Umbrel, Start9, VPS)
 *   - Third-party hosting (Voltage, LunaNode)
 *
 * Setup:
 *   1. Open your BTCPay Server store → Lightning → Settings
 *   2. Account → API Keys → Generate key (scope: btcpay.store.cancreatelightninginvoice)
 *   3. Note your Store ID from the store URL
 *
 * @example
 * ```ts
 * import { BTCPayProvider } from "l402-kit";
 * const lightning = new BTCPayProvider(
 *   process.env.BTCPAY_URL!,        // e.g. "https://btcpay.yourdomain.com"
 *   process.env.BTCPAY_API_KEY!,    // from BTCPay Account → API Keys
 *   process.env.BTCPAY_STORE_ID!,   // from store URL
 * );
 * ```
 */
export class BTCPayProvider implements LightningProvider {
  private url: string;
  private apiKey: string;
  private storeId: string;

  constructor(url: string, apiKey: string, storeId: string) {
    this.url     = url.replace(/\/$/, "");
    this.apiKey  = apiKey;
    this.storeId = storeId;
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(
      `${this.url}/api/v1/stores/${this.storeId}/lightning/BTC/invoices`,
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `token ${this.apiKey}`,
        },
        body: JSON.stringify({
          amount:      String(amountSats * 1000), // BTCPay uses millisatoshis as string
          description: "L402 API access",
          expiry:      3600,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`BTCPay invoice creation failed (${res.status}): ${err}`);
    }

    const data = await res.json() as {
      id:             string;
      BOLT11:         string;
      paymentHash:    string;
      expiresAt?:     number;
    };

    if (!data.BOLT11 || !data.paymentHash) {
      throw new Error("BTCPay: unexpected invoice response format");
    }

    return {
      paymentRequest: data.BOLT11,
      paymentHash:    data.paymentHash,
      macaroon:       this._buildMacaroon(data.paymentHash),
      amountSats,
      expiresAt:      data.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async checkPayment(paymentHash: string): Promise<boolean> {
    const res = await fetch(
      `${this.url}/api/v1/stores/${this.storeId}/lightning/BTC/invoices/${paymentHash}`,
      { headers: { "Authorization": `token ${this.apiKey}` } }
    );
    if (!res.ok) return false;
    const data = await res.json() as { status?: string };
    return data.status === "Complete";
  }

  private _buildMacaroon(paymentHash: string): string {
    return Buffer.from(
      JSON.stringify({ hash: paymentHash, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64");
  }
}
