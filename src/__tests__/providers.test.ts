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

function mockFetchOnce(responses: Array<{ body: unknown; status?: number }>) {
  let i = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[i++] ?? { body: {}, status: 500 };
    const status = r.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    });
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── BlinkProvider ────────────────────────────────────────────────────────────

describe("BlinkProvider", () => {
  const provider = new BlinkProvider("test-key", "wallet-123");

  const validInvoiceResponse = (amount: number, hash = "abc123def456abc123def456abc123def456abc123def456abc123def456abc123de") => ({
    data: {
      lnInvoiceCreate: {
        invoice: {
          paymentRequest: `lnbc${amount}n1...`,
          paymentHash: hash,
        },
        errors: [],
      },
    },
  });

  it("createInvoice returns invoice with macaroon", async () => {
    globalThis.fetch = mockFetch(validInvoiceResponse(100));
    const inv = await provider.createInvoice(100);
    expect(inv.paymentRequest).toBe("lnbc100n1...");
    expect(inv.paymentHash).toBe("abc123def456abc123def456abc123def456abc123def456abc123def456abc123de");
    expect(inv.macaroon).toBeTruthy();
    expect(inv.amountSats).toBe(100);
    expect(typeof inv.expiresAt).toBe("number");
  });

  it("createInvoice with amount 1 sat", async () => {
    globalThis.fetch = mockFetch(validInvoiceResponse(1));
    const inv = await provider.createInvoice(1);
    expect(inv.amountSats).toBe(1);
    expect(inv.macaroon).toBeTruthy();
  });

  it("createInvoice with large amount (1000000 sats)", async () => {
    globalThis.fetch = mockFetch(validInvoiceResponse(1_000_000));
    const inv = await provider.createInvoice(1_000_000);
    expect(inv.amountSats).toBe(1_000_000);
  });

  it("macaroon contains paymentHash encoded in base64", async () => {
    const hash = "deadbeef".repeat(8);
    globalThis.fetch = mockFetch(validInvoiceResponse(100, hash));
    const inv = await provider.createInvoice(100);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    expect(decoded.hash).toBe(hash);
  });

  it("macaroon contains future expiry timestamp", async () => {
    globalThis.fetch = mockFetch(validInvoiceResponse(100));
    const before = Date.now();
    const inv = await provider.createInvoice(100);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    expect(decoded.exp).toBeGreaterThan(before);
  });

  it("createInvoice throws on GraphQL errors array", async () => {
    globalThis.fetch = mockFetch({
      data: { lnInvoiceCreate: { invoice: null, errors: [{ message: "Insufficient balance" }] } },
    });
    await expect(provider.createInvoice(100)).rejects.toThrow("Insufficient balance");
  });

  it("createInvoice throws on HTTP 401", async () => {
    globalThis.fetch = mockFetch({ error: "Unauthorized" }, 401);
    await expect(provider.createInvoice(100)).rejects.toThrow("401");
  });

  it("createInvoice throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({ error: "Server Error" }, 500);
    await expect(provider.createInvoice(100)).rejects.toThrow("500");
  });

  it("createInvoice throws on HTTP 429 (rate limited)", async () => {
    globalThis.fetch = mockFetch({ error: "Too Many Requests" }, 429);
    await expect(provider.createInvoice(100)).rejects.toThrow("429");
  });

  it("checkPayment returns true when status is PAID", async () => {
    globalThis.fetch = mockFetch({ data: { lnInvoice: { status: "PAID" } } });
    expect(await provider.checkPayment("hash123")).toBe(true);
  });

  it("checkPayment returns false when status is PENDING", async () => {
    globalThis.fetch = mockFetch({ data: { lnInvoice: { status: "PENDING" } } });
    expect(await provider.checkPayment("hash123")).toBe(false);
  });

  it("checkPayment returns false when status is EXPIRED", async () => {
    globalThis.fetch = mockFetch({ data: { lnInvoice: { status: "EXPIRED" } } });
    expect(await provider.checkPayment("hash123")).toBe(false);
  });

  it("checkPayment returns false on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500);
    expect(await provider.checkPayment("hash123")).toBe(false);
  });

  it("checkPayment returns false on HTTP 401", async () => {
    globalThis.fetch = mockFetch({}, 401);
    expect(await provider.checkPayment("hash123")).toBe(false);
  });

  it("different BlinkProvider instances are independent", async () => {
    const p1 = new BlinkProvider("key1", "wallet1");
    const p2 = new BlinkProvider("key2", "wallet2");
    expect(p1).not.toBe(p2);
  });

  it("concurrent createInvoice calls resolve independently", async () => {
    globalThis.fetch = mockFetchOnce([
      { body: validInvoiceResponse(10) },
      { body: validInvoiceResponse(20) },
    ]);
    const [inv1, inv2] = await Promise.all([
      provider.createInvoice(10),
      provider.createInvoice(20),
    ]);
    expect(inv1.amountSats).toBe(10);
    expect(inv2.amountSats).toBe(20);
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

  it("createInvoice macaroon has correct structure", async () => {
    globalThis.fetch = mockFetch({
      payment_request: "lnbctest...",
      payment_hash: "deadbeef".repeat(8),
    });
    const inv = await provider.createInvoice(50);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    expect(decoded).toHaveProperty("hash");
    expect(decoded).toHaveProperty("exp");
  });

  it("createInvoice throws on HTTP 404", async () => {
    globalThis.fetch = mockFetch({ detail: "Not found" }, 404);
    await expect(provider.createInvoice(50)).rejects.toThrow("404");
  });

  it("createInvoice throws on HTTP 401 (invalid key)", async () => {
    globalThis.fetch = mockFetch({ detail: "Unauthorized" }, 401);
    await expect(provider.createInvoice(50)).rejects.toThrow("401");
  });

  it("createInvoice throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500);
    await expect(provider.createInvoice(50)).rejects.toThrow("500");
  });

  it("checkPayment returns true when paid=true", async () => {
    globalThis.fetch = mockFetch({ paid: true });
    expect(await provider.checkPayment("hash")).toBe(true);
  });

  it("checkPayment returns false when paid=false", async () => {
    globalThis.fetch = mockFetch({ paid: false });
    expect(await provider.checkPayment("hash")).toBe(false);
  });

  it("checkPayment returns false on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500);
    expect(await provider.checkPayment("hash")).toBe(false);
  });

  it("checkPayment returns false on HTTP 404", async () => {
    globalThis.fetch = mockFetch({}, 404);
    expect(await provider.checkPayment("hash")).toBe(false);
  });

  it("uses custom host URL for API calls", async () => {
    const customProvider = new LNbitsProvider("test-key", "https://my.lnbits.host");
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ payment_request: "ln...", payment_hash: "a".repeat(64) }),
        text: async () => "",
      });
    }) as typeof fetch;
    await customProvider.createInvoice(10);
    expect(capturedUrl).toContain("my.lnbits.host");
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

  it("createInvoice includes macaroon in response", async () => {
    globalThis.fetch = mockFetch({
      data: { id: "charge-xyz", lightning_invoice: { payreq: "lnbc..." } },
    });
    const inv = await provider.createInvoice(25);
    expect(inv.macaroon).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    expect(decoded).toHaveProperty("hash");
  });

  it("createInvoice throws on HTTP 401", async () => {
    globalThis.fetch = mockFetch({ message: "Unauthorized" }, 401);
    await expect(provider.createInvoice(25)).rejects.toThrow("401");
  });

  it("createInvoice throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500);
    await expect(provider.createInvoice(25)).rejects.toThrow("500");
  });

  it("checkPayment returns true when status=paid", async () => {
    globalThis.fetch = mockFetch({ data: { status: "paid" } });
    expect(await provider.checkPayment("charge-abc")).toBe(true);
  });

  it("checkPayment returns false when status=processing", async () => {
    globalThis.fetch = mockFetch({ data: { status: "processing" } });
    expect(await provider.checkPayment("charge-abc")).toBe(false);
  });

  it("checkPayment returns false when status=unpaid", async () => {
    globalThis.fetch = mockFetch({ data: { status: "unpaid" } });
    expect(await provider.checkPayment("charge-abc")).toBe(false);
  });

  it("checkPayment returns false on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500);
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

  it("uses api.opennode.com in production mode", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { id: "y", lightning_invoice: { payreq: "ln..." } } }),
        text: async () => "",
      });
    }) as typeof fetch;
    await provider.createInvoice(10);
    expect(capturedUrl).toContain("api.opennode.com");
    expect(capturedUrl).not.toContain("dev-api");
  });
});
