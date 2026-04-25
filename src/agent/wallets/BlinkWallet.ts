import type { L402Wallet } from "../../client";

/**
 * BlinkWallet — pay BOLT11 invoices via Blink (blink.sv).
 * Get credentials: dashboard.blink.sv → API Keys
 */
export class BlinkWallet implements L402Wallet {
  constructor(
    private readonly apiKey: string,
    private readonly walletId: string,
  ) {}

  async payInvoice(bolt11: string): Promise<{ preimage: string }> {
    const res = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        query: `mutation PayInvoice($input: LnInvoicePaymentInput!) {
          lnInvoicePaymentSend(input: $input) {
            status
            errors { message }
            transaction { settlementVia { ... on SettlementViaLn { preImage } } }
          }
        }`,
        variables: {
          input: {
            walletId: this.walletId,
            paymentRequest: bolt11,
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Blink payment failed (${res.status}): ${err}`);
    }

    const json = (await res.json()) as {
      data: {
        lnInvoicePaymentSend: {
          status: string;
          errors: { message: string }[];
          transaction?: {
            settlementVia?: { preImage?: string };
          };
        };
      };
    };

    const result = json.data?.lnInvoicePaymentSend;
    if (result?.errors?.length) {
      throw new Error(`Blink payment error: ${result.errors[0].message}`);
    }
    if (result?.status === "FAILURE") {
      throw new Error("Blink payment failed: FAILURE status");
    }

    const preimage = result?.transaction?.settlementVia?.preImage ?? "";
    return { preimage };
  }
}
