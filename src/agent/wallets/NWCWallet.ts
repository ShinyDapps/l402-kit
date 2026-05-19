import type { L402Wallet } from "../../client";

/**
 * Minimal shape of `@getalby/sdk/nwc` we depend on. Declared locally to avoid
 * forcing users without the optional peer dep to install ~10MB of types.
 */
interface NWCClientInstance {
  payInvoice(args: { invoice: string }): Promise<{ preimage: string; fees_paid?: number }>;
  close(): void;
}
interface NWCClientConstructor {
  new (opts: { nostrWalletConnectUrl: string }): NWCClientInstance;
}
interface NWCModule {
  NWCClient: NWCClientConstructor;
}

/**
 * NWCWallet — pay BOLT11 invoices via Nostr Wallet Connect (NIP-47).
 *
 * Works with any NWC-compatible wallet: Alby Hub, Mutiny, Coinos, Phoenix,
 * lnwallet.app, Yakihonne, Primal, and any wallet listed at https://nwc.dev.
 *
 * NWC is the canonical interface going forward — replaces the deprecated
 * Alby shared wallet API that was shut down 2025-01-04.
 *
 * Setup:
 *   1. Get an NWC connection string from your wallet
 *      (e.g. Alby Hub → Settings → Connections → New connection)
 *   2. Install the peer dependency: `npm install @getalby/sdk`
 *
 * @example
 * ```ts
 * import { NWCWallet } from "l402-kit/agent";
 * const wallet = new NWCWallet(process.env.NWC_URI!);
 * ```
 */
export class NWCWallet implements L402Wallet {
  constructor(private readonly nwcUri: string) {
    if (!nwcUri || !nwcUri.startsWith("nostr+walletconnect://")) {
      throw new Error(
        'NWCWallet: URI must start with "nostr+walletconnect://" (got: ' +
          (nwcUri ?? "").slice(0, 30) + ")",
      );
    }
  }

  async payInvoice(bolt11: string): Promise<{ preimage: string }> {
    let mod: NWCModule;
    try {
      // Resolved at runtime — peer dep is optional. Cast through unknown so TS doesn't
      // require the module to be installed at compile time.
      mod = (await import(/* webpackIgnore: true */ "@getalby/sdk/nwc" as string)) as unknown as NWCModule;
    } catch {
      throw new Error(
        'NWCWallet requires the optional peer dependency "@getalby/sdk". ' +
          "Install it with: npm install @getalby/sdk",
      );
    }
    const client = new mod.NWCClient({ nostrWalletConnectUrl: this.nwcUri });
    try {
      const result = await client.payInvoice({ invoice: bolt11 });
      return { preimage: result.preimage };
    } finally {
      try { client.close(); } catch { /* close() may throw on already-closed; non-fatal */ }
    }
  }
}
