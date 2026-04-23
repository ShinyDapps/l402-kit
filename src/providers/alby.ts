import type { Invoice, LightningProvider } from "../types";

/**
 * Alby Hub provider — self-custodial Lightning node in the cloud.
 * Your keys, your sats. No custodian.
 *
 * Setup:
 *   1. Create an Alby Hub at hub.getalby.com (or self-host)
 *   2. Go to Settings → Access Tokens → Create token (scope: invoices:create, invoices:read)
 *   3. Copy your Hub URL (e.g. https://your-name.getalby.com) and access token
 *
 * Lightning Address: you@getalby.com (or custom domain with Alby Hub)
 *
 * @example
 * ```ts
 * import { AlbyProvider } from "l402-kit";
 * const lightning = new AlbyProvider(
 *   process.env.ALBY_ACCESS_TOKEN!,
 *   process.env.ALBY_HUB_URL!, // e.g. "https://your-name.getalby.com"
 * );
 * ```
 */
export class AlbyProvider implements LightningProvider {
  private accessToken: string;
  private hubUrl: string;

  constructor(accessToken: string, hubUrl: string) {
    this.accessToken = accessToken;
    this.hubUrl = hubUrl.replace(/\/$/, "");
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(`${this.hubUrl}/api/invoices`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        amount:      amountSats * 1000, // Alby uses millisatoshis
        description: "L402 API access",
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Alby invoice creation failed (${res.status}): ${err}`);
    }

    const data = await res.json() as {
      payment_hash:    string;
      payment_request: string;
      expires_at?:     string;
    };

    if (!data.payment_hash || !data.payment_request) {
      throw new Error("Alby: unexpected invoice response format");
    }

    return {
      paymentRequest: data.payment_request,
      paymentHash:    data.payment_hash,
      macaroon:       this._buildMacaroon(data.payment_hash),
      amountSats,
      expiresAt:      data.expires_at
        ? Math.floor(new Date(data.expires_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async checkPayment(paymentHash: string): Promise<boolean> {
    const res = await fetch(`${this.hubUrl}/api/invoices/${paymentHash}`, {
      headers: { "Authorization": `Bearer ${this.accessToken}` },
    });
    if (!res.ok) return false;
    const data = await res.json() as { settled_at?: string | null; state?: string };
    return !!(data.settled_at || data.state === "settled");
  }

  private _buildMacaroon(paymentHash: string): string {
    return Buffer.from(
      JSON.stringify({ hash: paymentHash, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64");
  }
}
