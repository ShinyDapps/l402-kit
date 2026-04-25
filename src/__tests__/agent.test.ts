import { BlinkWallet } from "../agent/wallets/BlinkWallet";
import { AlbyWallet } from "../agent/wallets/AlbyWallet";
import { BudgetTracker, BudgetExceededError } from "../agent/budget";
import { L402Client } from "../client";

function mockFetch(body: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => { jest.restoreAllMocks(); });

// ─── BlinkWallet ──────────────────────────────────────────────────────────────

describe("BlinkWallet", () => {
  const wallet = new BlinkWallet("test-key", "wallet-123");

  it("sends X-API-KEY header", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({
        data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [],
          transaction: { settlementVia: { preImage: "preimage123" } } } }
      }), text: async () => "" });
    }) as typeof fetch;
    await wallet.payInvoice("lnbc1test");
    expect(capturedHeaders["X-API-KEY"]).toBe("test-key");
  });

  it("returns preimage from transaction.settlementVia.preImage", async () => {
    globalThis.fetch = mockFetch({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [],
        transaction: { settlementVia: { preImage: "abc123preimage" } } } }
    }) as typeof fetch;
    const result = await wallet.payInvoice("lnbc1test");
    expect(result.preimage).toBe("abc123preimage");
  });

  it("throws when errors array is non-empty", async () => {
    globalThis.fetch = mockFetch({
      data: { lnInvoicePaymentSend: { status: "FAILURE",
        errors: [{ message: "Insufficient balance" }], transaction: null } }
    }) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("Insufficient balance");
  });

  it("throws when status is FAILURE with no errors", async () => {
    globalThis.fetch = mockFetch({
      data: { lnInvoicePaymentSend: { status: "FAILURE", errors: [], transaction: null } }
    }) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("FAILURE");
  });

  it("throws on HTTP 401", async () => {
    globalThis.fetch = mockFetch({ error: "Unauthorized" }, 401) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("401");
  });

  it("throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("500");
  });

  it("sends walletId and paymentRequest in GraphQL variables", async () => {
    let capturedBody = "";
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({
        data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [],
          transaction: { settlementVia: { preImage: "pre" } } } }
      }), text: async () => "" });
    }) as typeof fetch;
    await wallet.payInvoice("lnbc_invoice_here");
    const body = JSON.parse(capturedBody);
    expect(body.variables.input.walletId).toBe("wallet-123");
    expect(body.variables.input.paymentRequest).toBe("lnbc_invoice_here");
  });

  it("calls Blink GraphQL endpoint", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({
        data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [],
          transaction: { settlementVia: { preImage: "pre" } } } }
      }), text: async () => "" });
    }) as typeof fetch;
    await wallet.payInvoice("lnbc1test");
    expect(capturedUrl).toBe("https://api.blink.sv/graphql");
  });

  it("returns empty preimage string when transaction is null", async () => {
    globalThis.fetch = mockFetch({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [], transaction: null } }
    }) as typeof fetch;
    const result = await wallet.payInvoice("lnbc1test");
    expect(result.preimage).toBe("");
  });
});

// ─── AlbyWallet ───────────────────────────────────────────────────────────────

describe("AlbyWallet", () => {
  const wallet = new AlbyWallet("alby-token-123", "https://myhub.getalby.com");

  it("sends Bearer token in Authorization header", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({ payment_preimage: "pre123" }), text: async () => "" });
    }) as typeof fetch;
    await wallet.payInvoice("lnbc1test");
    expect(capturedHeaders["Authorization"]).toBe("Bearer alby-token-123");
  });

  it("returns payment_preimage from response", async () => {
    globalThis.fetch = mockFetch({ payment_preimage: "mypreimage456" }) as typeof fetch;
    const result = await wallet.payInvoice("lnbc1test");
    expect(result.preimage).toBe("mypreimage456");
  });

  it("also accepts preimage field as fallback", async () => {
    globalThis.fetch = mockFetch({ preimage: "fallbackpreimage" }) as typeof fetch;
    const result = await wallet.payInvoice("lnbc1test");
    expect(result.preimage).toBe("fallbackpreimage");
  });

  it("throws when data.error is set", async () => {
    globalThis.fetch = mockFetch({ error: "payment failed" }) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("payment failed");
  });

  it("throws when no preimage in response", async () => {
    globalThis.fetch = mockFetch({ status: "ok" }) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("no preimage");
  });

  it("throws on HTTP 401", async () => {
    globalThis.fetch = mockFetch({ error: "unauthorized" }, 401) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("401");
  });

  it("throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500) as typeof fetch;
    await expect(wallet.payInvoice("lnbc1test")).rejects.toThrow("500");
  });

  it("calls /api/payments endpoint on hubUrl", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_preimage: "pre" }), text: async () => "" });
    }) as typeof fetch;
    await wallet.payInvoice("lnbc1test");
    expect(capturedUrl).toBe("https://myhub.getalby.com/api/payments");
  });

  it("strips trailing slash from hubUrl", async () => {
    const w = new AlbyWallet("token", "https://hub.getalby.com/");
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_preimage: "pre" }), text: async () => "" });
    }) as typeof fetch;
    await w.payInvoice("lnbc1test");
    expect(capturedUrl).not.toContain("//api");
    expect(capturedUrl).toContain("hub.getalby.com/api/payments");
  });

  it("uses getalby.com as default hubUrl", async () => {
    const w = new AlbyWallet("token");
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_preimage: "pre" }), text: async () => "" });
    }) as typeof fetch;
    await w.payInvoice("lnbc1test");
    expect(capturedUrl).toContain("getalby.com/api/payments");
  });
});

// ─── BudgetTracker ────────────────────────────────────────────────────────────

describe("BudgetTracker", () => {
  it("allows spend within budget", () => {
    const b = new BudgetTracker(1000);
    expect(() => b.check("https://api.com/data", 100)).not.toThrow();
    b.record("https://api.com/data", 100);
    expect(b.report().total).toBe(100);
    expect(b.report().remaining).toBe(900);
  });

  it("throws BudgetExceededError when over budget", () => {
    const b = new BudgetTracker(100);
    b.record("https://api.com/data", 80);
    expect(() => b.check("https://api.com/data", 30)).toThrow(BudgetExceededError);
  });

  it("BudgetExceededError contains url, required, remaining", () => {
    const b = new BudgetTracker(100);
    b.record("https://api.com/data", 80);
    try {
      b.check("https://api.com/data", 30);
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      expect((e as BudgetExceededError).url).toBe("https://api.com/data");
      expect((e as BudgetExceededError).required).toBe(30);
      expect((e as BudgetExceededError).remaining).toBe(20);
    }
  });

  it("calls onBudgetExceeded callback when blocked", () => {
    const onBudgetExceeded = jest.fn();
    const b = new BudgetTracker(50, undefined, undefined, onBudgetExceeded);
    b.record("https://api.com/data", 40);
    try { b.check("https://api.com/data", 20); } catch { /* expected */ }
    expect(onBudgetExceeded).toHaveBeenCalledWith("https://api.com/data", 20);
  });

  it("calls onSpend callback after recording", () => {
    const onSpend = jest.fn();
    const b = new BudgetTracker(1000, undefined, onSpend);
    b.record("https://api.com/data", 55);
    expect(onSpend).toHaveBeenCalledWith(55, "https://api.com/data");
  });

  it("tracks spending per domain", () => {
    const b = new BudgetTracker(1000);
    b.record("https://api1.com/data", 100);
    b.record("https://api1.com/other", 50);
    b.record("https://api2.com/data", 200);
    const report = b.report();
    expect(report.byDomain["api1.com"]).toBe(150);
    expect(report.byDomain["api2.com"]).toBe(200);
  });

  it("enforces per-domain budget", () => {
    const b = new BudgetTracker(1000, { "api1.com": 100 });
    b.record("https://api1.com/data", 80);
    expect(() => b.check("https://api1.com/other", 30)).toThrow(BudgetExceededError);
  });

  it("per-domain limit does not affect other domains", () => {
    const b = new BudgetTracker(1000, { "api1.com": 50 });
    b.record("https://api1.com/data", 50);
    expect(() => b.check("https://api2.com/data", 500)).not.toThrow();
  });

  it("report contains transaction history", () => {
    const b = new BudgetTracker(1000);
    b.record("https://api.com/a", 10);
    b.record("https://api.com/b", 20);
    expect(b.report().transactions).toHaveLength(2);
    expect(b.report().transactions[0].sats).toBe(10);
    expect(b.report().transactions[1].sats).toBe(20);
  });

  it("remaining is 0 when budget exactly spent", () => {
    const b = new BudgetTracker(100);
    b.record("https://api.com/data", 100);
    expect(b.report().remaining).toBe(0);
  });

  it("allows exactly the budget amount", () => {
    const b = new BudgetTracker(100);
    expect(() => b.check("https://api.com/data", 100)).not.toThrow();
  });
});

// ─── L402Client + budget integration ─────────────────────────────────────────

describe("L402Client — budget integration", () => {
  const MACAROON = "eyJoYXNoIjoiYWJjMTIzIiwiZXhwIjoxOTk5OTk5OTk5fQ==";
  const INVOICE  = "lnbctest1234";
  const PREIMAGE = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  function mockWallet() {
    return { payInvoice: jest.fn().mockResolvedValue({ preimage: PREIMAGE }) };
  }

  function make402(priceSats = 100) {
    return JSON.stringify({ macaroon: MACAROON, invoice: INVOICE, priceSats });
  }

  function mockFetchResponses(responses: Array<{ status: number; body: string }>) {
    let i = 0;
    return jest.fn().mockImplementation(() => {
      const r = responses[Math.min(i++, responses.length - 1)];
      return Promise.resolve({
        status: r.status,
        ok: r.status >= 200 && r.status < 300,
        headers: new Headers(),
        clone: () => ({ json: () => Promise.resolve(JSON.parse(r.body)) }),
        json: () => Promise.resolve(JSON.parse(r.body)),
      });
    });
  }

  it("spendingReport returns null when no budget configured", async () => {
    const client = new L402Client({ wallet: mockWallet() });
    expect(client.spendingReport()).toBeNull();
  });

  it("spendingReport returns report when budget configured", async () => {
    global.fetch = mockFetchResponses([
      { status: 402, body: make402(100) },
      { status: 200, body: "{}" },
    ]) as typeof fetch;
    const client = new L402Client({ wallet: mockWallet(), budgetSats: 1000 });
    await client.fetch("https://api.example.com/data");
    const report = client.spendingReport();
    expect(report).not.toBeNull();
    expect(report!.total).toBe(100);
    expect(report!.remaining).toBe(900);
  });

  it("throws BudgetExceededError when budget would be exceeded", async () => {
    global.fetch = mockFetchResponses([
      { status: 402, body: make402(200) },
    ]) as typeof fetch;
    const client = new L402Client({ wallet: mockWallet(), budgetSats: 100 });
    await expect(client.fetch("https://api.example.com/data"))
      .rejects.toThrow(BudgetExceededError);
  });

  it("calls onSpend callback with sats and url", async () => {
    const onSpend = jest.fn();
    global.fetch = mockFetchResponses([
      { status: 402, body: make402(50) },
      { status: 200, body: "{}" },
    ]) as typeof fetch;
    const client = new L402Client({ wallet: mockWallet(), budgetSats: 1000, onSpend });
    await client.fetch("https://api.example.com/data");
    expect(onSpend).toHaveBeenCalledWith(50, "https://api.example.com/data");
  });

  it("does not record spend when priceSats is absent from 402 body", async () => {
    global.fetch = mockFetchResponses([
      { status: 402, body: JSON.stringify({ macaroon: MACAROON, invoice: INVOICE }) },
      { status: 200, body: "{}" },
    ]) as typeof fetch;
    const client = new L402Client({ wallet: mockWallet(), budgetSats: 1000 });
    await client.fetch("https://api.example.com/data");
    expect(client.spendingReport()!.total).toBe(0);
  });
});
