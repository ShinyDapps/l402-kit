import { BlinkProvider } from "../providers/blink";
import { LNbitsProvider } from "../providers/lnbits";
import { OpenNodeProvider } from "../providers/opennode";

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── BlinkProvider ────────────────────────────────────────────────────────────

describe("BlinkProvider", () => {
  const provider = new BlinkProvider("test-key", "wallet-123");

  it("createInvoice returns invoice with macaroon", async () => {
    globalThis.fetch = mockFetch({
      data: {
        lnInvoiceCreate: {
          invoice: {
            paymentRequest: "lnbc100n1...",
            paymentHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc123de",
          },
          errors: [],
        },
      },
    });

    const inv = await provider.createInvoice(100);
    expect(inv.paymentRequest).toBe("lnbc100n1...");
    expect(inv.paymentHash).toBe("abc123def456abc123def456abc123def456abc123def456abc123def456abc123de");
    expect(inv.macaroon).toBeTruthy();
    expect(inv.amountSats).toBe(100);
    expect(typeof inv.expiresAt).toBe("number");
  });

  it("createInvoice throws on GraphQL errors array", async () => {
    globalThis.fetch = mockFetch({
      data: {
        lnInvoiceCreate: {
          invoice: null,
          errors: [{ message: "Insufficient balance" }],
        },
      },
    });

    await expect(provider.createInvoice(100)).rejects.toThrow("Insufficient balance");
  });

  it("createInvoice throws on HTTP error", async () => {
    globalThis.fetch = mockFetch({ error: "Unauthorized" }, 401);
    await expect(provider.createInvoice(100)).rejects.toThrow("401");
  });

  it("checkPayment returns true when status is PAID", async () => {
    globalThis.fetch = mockFetch({
      data: {
        lnInvoice: { status: "PAID" },
      },
    });

    const paid = await provider.checkPayment("hash123");
    expect(paid).toBe(true);
  });

  it("checkPayment returns false when status is PENDING", async () => {
    globalThis.fetch = mockFetch({
      data: {
        lnInvoice: { status: "PENDING" },
      },
    });

    const paid = await provider.checkPayment("hash123");
    expect(paid).toBe(false);
  });

  it("checkPayment returns false on HTTP error", async () => {
    globalThis.fetch = mockFetch({}, 500);
    const paid = await provider.checkPayment("hash123");
    expect(paid).toBe(false);
  });
});

// ─── LNbitsProvider ───────────────────────────────────────────────────────────

describe("LNbitsProvider", () => {
  const provider = new LNbitsProvider("test-key", "https://legend.lnbits.com");

  it("createInvoice returns invoice", async () => {
    globalThis.fetch = mockFetch({
      payment_request: "lnbctest...",
      payment_hash: "deadbeef".repeat(8),
    });

    const inv = await provider.createInvoice(50);
    expect(inv.paymentRequest).toBe("lnbctest...");
    expect(inv.amountSats).toBe(50);
    expect(inv.macaroon).toBeTruthy();
  });

  it("createInvoice throws on HTTP error", async () => {
    globalThis.fetch = mockFetch({ detail: "Not found" }, 404);
    await expect(provider.createInvoice(50)).rejects.toThrow("404");
  });

  it("checkPayment returns true when paid=true", async () => {
    globalThis.fetch = mockFetch({ paid: true });
    expect(await provider.checkPayment("hash")).toBe(true);
  });

  it("checkPayment returns false when paid=false", async () => {
    globalThis.fetch = mockFetch({ paid: false });
    expect(await provider.checkPayment("hash")).toBe(false);
  });

  it("checkPayment returns false on HTTP error", async () => {
    globalThis.fetch = mockFetch({}, 500);
    expect(await provider.checkPayment("hash")).toBe(false);
  });
});

// ─── OpenNodeProvider ─────────────────────────────────────────────────────────

describe("OpenNodeProvider", () => {
  const provider = new OpenNodeProvider("test-key");

  it("createInvoice returns invoice", async () => {
    globalThis.fetch = mockFetch({
      data: {
        id: "charge-abc",
        lightning_invoice: { payreq: "lnbctest..." },
      },
    });

    const inv = await provider.createInvoice(25);
    expect(inv.paymentRequest).toBe("lnbctest...");
    expect(inv.paymentHash).toBe("charge-abc");
    expect(inv.amountSats).toBe(25);
  });

  it("createInvoice throws on HTTP error", async () => {
    globalThis.fetch = mockFetch({ message: "Unauthorized" }, 401);
    await expect(provider.createInvoice(25)).rejects.toThrow("401");
  });

  it("checkPayment returns true when status=paid", async () => {
    globalThis.fetch = mockFetch({ data: { status: "paid" } });
    expect(await provider.checkPayment("charge-abc")).toBe(true);
  });

  it("checkPayment returns false when status=processing", async () => {
    globalThis.fetch = mockFetch({ data: { status: "processing" } });
    expect(await provider.checkPayment("charge-abc")).toBe(false);
  });

  it("uses dev-api.opennode.com in testMode", async () => {
    const devProvider = new OpenNodeProvider("test-key", true);
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { id: "x", lightning_invoice: { payreq: "ln..." } } }),
        text: async () => "",
      });
    }) as typeof fetch;

    await devProvider.createInvoice(10);
    expect(capturedUrl).toContain("dev-api.opennode.com");
  });
});
