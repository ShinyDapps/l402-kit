import type { Invoice, LightningProvider } from "../types";

/**
 * Blink (blink.sv) — free custodial Lightning provider.
 * Get API key: dashboard.blink.sv → API Keys
 */
export class BlinkProvider implements LightningProvider {
  private apiKey: string;
  private walletId: string;

  constructor(apiKey: string, walletId: string) {
    this.apiKey = apiKey;
    this.walletId = walletId;
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        query: `mutation CreateInvoice($input: LnInvoiceCreateInput!) {
          lnInvoiceCreate(input: $input) {
            invoice { paymentRequest paymentHash }
            errors { message }
          }
        }`,
        variables: {
          input: {
            walletId: this.walletId,
            amount: amountSats,
            memo: "L402 API access",
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Blink invoice creation failed (${res.status}): ${err}`);
    }

    const json = (await res.json()) as {
      data: {
        lnInvoiceCreate: {
          invoice: { paymentRequest: string; paymentHash: string };
          errors: { message: string }[];
        };
      };
    };

    const { invoice, errors } = json.data.lnInvoiceCreate;
    if (errors?.length) throw new Error(`Blink error: ${errors[0].message}`);

    const macaroon = Buffer.from(JSON.stringify({
      hash: invoice.paymentHash,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString("base64");

    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      macaroon,
      amountSats,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async checkPayment(paymentHash: string): Promise<boolean> {
    const res = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        query: `query CheckInvoice($paymentHash: PaymentHash!) {
          lnInvoice(paymentHash: $paymentHash) { status }
        }`,
        variables: { paymentHash },
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data: { lnInvoice: { status: string } } };
    return json.data?.lnInvoice?.status === "PAID";
  }
}
