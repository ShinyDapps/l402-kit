export { BlinkWallet } from "./wallets/BlinkWallet";
export { AlbyWallet } from "./wallets/AlbyWallet";
export { buildWallet } from "./wallets";
export { BudgetExceededError } from "./budget";
export type { SpendingReport } from "./budget";

export { L402Client } from "../client";
export type { L402ClientOptions, L402Wallet } from "../client";

import { L402Client } from "../client";
import type { L402ClientOptions } from "../client";

/**
 * Factory function — creates an L402Client instance.
 * Convenience alias for `new L402Client(opts)`.
 *
 * @example
 * ```ts
 * import { l402Client, buildWallet } from "l402-kit/agent";
 * const client = l402Client({ wallet: buildWallet(process.env), budgetSats: 1000 });
 * const res = await client.fetch("https://api.example.com/paid");
 * ```
 */
export function l402Client(opts: L402ClientOptions): L402Client {
  return new L402Client(opts);
}
