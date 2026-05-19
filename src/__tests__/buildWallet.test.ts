/**
 * buildWallet — auto-detects a Lightning wallet from env vars.
 * Priority: Blink > NWC > Alby (deprecated).
 */

// Silence the Alby deprecation warning emitted on construction
const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

import { buildWallet, BlinkWallet, AlbyWallet, NWCWallet } from "../agent/wallets";

const VALID_NWC = "nostr+walletconnect://abc?relay=wss://relay.test&secret=hex";

describe("buildWallet", () => {
  afterAll(() => consoleWarnSpy.mockRestore());

  it("returns BlinkWallet when BLINK_API_KEY+BLINK_WALLET_ID are set", () => {
    const w = buildWallet({ BLINK_API_KEY: "k", BLINK_WALLET_ID: "w" });
    expect(w).toBeInstanceOf(BlinkWallet);
  });

  it("returns NWCWallet when NWC_URI is set", () => {
    const w = buildWallet({ NWC_URI: VALID_NWC });
    expect(w).toBeInstanceOf(NWCWallet);
  });

  it("returns AlbyWallet when only ALBY_TOKEN is set", () => {
    const w = buildWallet({ ALBY_TOKEN: "t" });
    expect(w).toBeInstanceOf(AlbyWallet);
  });

  it("prefers Blink over NWC over Alby when all are set", () => {
    const w1 = buildWallet({
      BLINK_API_KEY: "k", BLINK_WALLET_ID: "w",
      NWC_URI: VALID_NWC,
      ALBY_TOKEN: "t",
    });
    expect(w1).toBeInstanceOf(BlinkWallet);

    const w2 = buildWallet({ NWC_URI: VALID_NWC, ALBY_TOKEN: "t" });
    expect(w2).toBeInstanceOf(NWCWallet);
  });

  it("throws an informative error when no credentials are configured", () => {
    expect(() => buildWallet({})).toThrow(/BLINK_API_KEY|NWC_URI|ALBY_TOKEN/);
  });

  it("does not pick Blink when only BLINK_API_KEY is set (partial config)", () => {
    expect(() => buildWallet({ BLINK_API_KEY: "k" })).toThrow();
  });
});
