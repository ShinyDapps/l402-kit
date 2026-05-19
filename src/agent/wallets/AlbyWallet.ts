import type { L402Wallet } from "../../client";

let DEPRECATION_WARNED = false;

/**
 * @deprecated Alby shut down the shared wallet API on 2025-01-04. The default
 * `https://getalby.com/api/payments` endpoint no longer responds. Use
 * {@link NWCWallet} instead, which works with Alby Hub via NWC (NIP-47).
 *
 * Migration:
 * ```ts
 * // before:
 * new AlbyWallet(process.env.ALBY_TOKEN!);
 * // after — get NWC URI from Alby Hub → Settings → Connections:
 * import { NWCWallet } from "l402-kit/agent";
 * new NWCWallet(process.env.NWC_URI!); // install: npm install @getalby/sdk
 * ```
 *
 * This class is retained for one minor release for users with self-hosted
 * Alby endpoints. It will be removed in 1.11.
 */
export class AlbyWallet implements L402Wallet {
  private readonly hubUrl: string;

  constructor(
    private readonly token: string,
    hubUrl = "https://getalby.com",
  ) {
    this.hubUrl = hubUrl.replace(/\/$/, "");
    if (!DEPRECATION_WARNED) {
      DEPRECATION_WARNED = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[l402-kit] AlbyWallet is deprecated — Alby shared wallet was shut down 2025-01-04. " +
          "Use NWCWallet with a NWC connection string from your wallet. " +
          "See: https://docs.l402kit.com/agent/wallets",
      );
    }
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
