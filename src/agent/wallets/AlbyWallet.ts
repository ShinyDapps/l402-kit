import type { L402Wallet } from "../../client";

/**
 * AlbyWallet — pay BOLT11 invoices via Alby Hub.
 * Get credentials: your Alby Hub → Settings → Developer → Access Tokens
 */
export class AlbyWallet implements L402Wallet {
  private readonly hubUrl: string;

  constructor(
    private readonly token: string,
    hubUrl = "https://getalby.com",
  ) {
    this.hubUrl = hubUrl.replace(/\/$/, "");
  }

  async payInvoice(bolt11: string): Promise<{ preimage: string }> {
    const res = await fetch(`${this.hubUrl}/api/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify({ invoice: bolt11 }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Alby payment failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      payment_preimage?: string;
      preimage?: string;
      error?: string;
    };

    if (data.error) throw new Error(`Alby error: ${data.error}`);

    const preimage = data.payment_preimage ?? data.preimage ?? "";
    if (!preimage) throw new Error("Alby returned no preimage");

    return { preimage };
  }
}
