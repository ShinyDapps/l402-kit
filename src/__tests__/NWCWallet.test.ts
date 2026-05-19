/**
 * NWCWallet — pay BOLT11 invoices via Nostr Wallet Connect (NIP-47).
 * Generic NWC adapter that works with Alby Hub, Mutiny, Coinos, Phoenix, etc.
 *
 * TDD: tests define the public contract before implementation.
 */

const mockPayInvoice = jest.fn();
const mockClose = jest.fn();
const mockNWCClientCtor = jest.fn().mockImplementation(() => ({
  payInvoice: mockPayInvoice,
  close: mockClose,
}));

jest.mock(
  "@getalby/sdk/nwc",
  () => ({ NWCClient: mockNWCClientCtor }),
  { virtual: true },
);

import { NWCWallet } from "../agent/wallets/NWCWallet";

const VALID_URI = "nostr+walletconnect://abc?relay=wss://relay.test&secret=hex";

describe("NWCWallet", () => {
  beforeEach(() => {
    mockPayInvoice.mockReset();
    mockClose.mockReset();
    mockNWCClientCtor.mockClear();
  });

  it("rejects URIs that do not start with nostr+walletconnect://", () => {
    expect(() => new NWCWallet("https://example.com")).toThrow(/nostr\+walletconnect/);
    expect(() => new NWCWallet("")).toThrow();
  });

  it("accepts valid NWC URIs", () => {
    expect(() => new NWCWallet(VALID_URI)).not.toThrow();
  });

  it("constructs NWCClient with the URI and returns the preimage", async () => {
    mockPayInvoice.mockResolvedValue({ preimage: "deadbeef", fees_paid: 100 });
    const wallet = new NWCWallet(VALID_URI);
    const result = await wallet.payInvoice("lnbc1...");
    expect(result).toEqual({ preimage: "deadbeef" });
    expect(mockNWCClientCtor).toHaveBeenCalledWith({ nostrWalletConnectUrl: VALID_URI });
    expect(mockPayInvoice).toHaveBeenCalledWith({ invoice: "lnbc1..." });
  });

  it("propagates payment errors and still closes the client", async () => {
    mockPayInvoice.mockRejectedValue(new Error("insufficient_balance"));
    const wallet = new NWCWallet(VALID_URI);
    await expect(wallet.payInvoice("lnbc1...")).rejects.toThrow("insufficient_balance");
    expect(mockClose).toHaveBeenCalled();
  });

  it("closes the client after a successful payment", async () => {
    mockPayInvoice.mockResolvedValue({ preimage: "deadbeef" });
    const wallet = new NWCWallet(VALID_URI);
    await wallet.payInvoice("lnbc1...");
    expect(mockClose).toHaveBeenCalled();
  });

  it("throws an informative error if @getalby/sdk is not installed", async () => {
    jest.resetModules();
    jest.doMock(
      "@getalby/sdk/nwc",
      () => { throw new Error("Cannot find module"); },
      { virtual: true },
    );
    // Re-import NWCWallet so it picks up the failing dynamic import
    const { NWCWallet: FreshNWCWallet } = await import("../agent/wallets/NWCWallet");
    const wallet = new FreshNWCWallet(VALID_URI);
    await expect(wallet.payInvoice("lnbc1...")).rejects.toThrow(/@getalby\/sdk/);
    // Restore the working mock for subsequent tests
    jest.resetModules();
  });
});
