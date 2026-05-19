export { BlinkWallet } from "./BlinkWallet";
export { AlbyWallet } from "./AlbyWallet";
export { NWCWallet } from "./NWCWallet";

import type { L402Wallet } from "../../client";
import { BlinkWallet } from "./BlinkWallet";
import { AlbyWallet } from "./AlbyWallet";
import { NWCWallet } from "./NWCWallet";

/**
 * Auto-detects a Lightning wallet from environment variables.
 *
 * Priority order:
 *   1. BLINK_API_KEY + BLINK_WALLET_ID → BlinkWallet
 *   2. NWC_URI                          → NWCWallet (recommended)
 *   3. ALBY_TOKEN                       → AlbyWallet (deprecated — see NWCWallet)
 *
 * @example
 * ```ts
 * import { buildWallet } from "l402-kit/agent";
 * const wallet = buildWallet(process.env);
 * ```
 */
export function buildWallet(env: Record<string, string | undefined> = {}): L402Wallet {
  if (env.BLINK_API_KEY && env.BLINK_WALLET_ID) {
    return new BlinkWallet(env.BLINK_API_KEY, env.BLINK_WALLET_ID);
  }
  if (env.NWC_URI) {
    return new NWCWallet(env.NWC_URI);
  }
  if (env.ALBY_TOKEN) {
    return new AlbyWallet(env.ALBY_TOKEN);
  }
  throw new Error(
    "buildWallet: no wallet configured — set BLINK_API_KEY+BLINK_WALLET_ID, NWC_URI, or ALBY_TOKEN",
  );
}
