import { L402Client, L402PaymentError, L402ParseError } from "../client";

// ── helpers ────────────────────────────────────────────────────────────────────

const MACAROON = "eyJoYXNoIjoiYWJjMTIzIiwiZXhwIjoxOTk5OTk5OTk5fQ==";
const INVOICE  = "lnbctest1234";
const PREIMAGE = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

function mockWallet(preimage = PREIMAGE) {
  return { payInvoice: jest.fn().mockResolvedValue({ preimage }) };
}

function make402Body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ macaroon: MACAROON, invoice: INVOICE, price_sats: 100, ...overrides });
}

function mockFetch(responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[Math.min(call++, responses.length - 1)];
    const headers = new Headers(r.headers ?? {});
    return Promise.resolve({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers,
      clone: () => ({
        json: () => Promise.resolve(r.body ? JSON.parse(r.body) : {}),
      }),
      json: () => Promise.resolve(r.body ? JSON.parse(r.body) : {}),
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("L402Client", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  describe("happy path", () => {
    it("returns 200 directly when no 402", async () => {
      global.fetch = mockFetch([{ status: 200, body: '{"ok":true}' }]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      const res = await client.fetch("https://api.example.com/free");
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("pays invoice and retries on 402", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"data":"paid"}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      const res = await client.fetch("https://api.example.com/premium");
      expect(res.status).toBe(200);
      expect(wallet.payInvoice).toHaveBeenCalledWith(INVOICE);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("sends correct L402 Authorization header on retry", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await client.fetch("https://api.example.com/premium");
      const [, retryCall] = (global.fetch as jest.Mock).mock.calls;
      const headers = retryCall[1].headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`L402 ${MACAROON}:${PREIMAGE}`);
    });

    it("uses cached token on second call to same endpoint", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      await client.fetch("https://api.example.com/premium");
      await client.fetch("https://api.example.com/premium");
      // wallet called only once — second call uses cache
      expect(wallet.payInvoice).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("passes through original fetch init options", async () => {
      global.fetch = mockFetch([{ status: 200 }]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await client.fetch("https://api.example.com/data", {
        method: "POST",
        body: '{"q":1}',
        headers: { "Content-Type": "application/json" },
      });
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });
  });

  describe("x402 (Coinbase) compatibility", () => {
    it("parses x402 format from X-Payment-Required header", async () => {
      const xHeader = JSON.stringify({ invoice: INVOICE, macaroon: MACAROON });
      global.fetch = mockFetch([
        { status: 402, body: '{}', headers: { "X-Payment-Required": xHeader } },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      const res = await client.fetch("https://api.example.com/x402");
      expect(res.status).toBe(200);
      expect(wallet.payInvoice).toHaveBeenCalledWith(INVOICE);
    });
  });

  describe("alternative field names", () => {
    it("accepts paymentRequest instead of invoice", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body({ invoice: undefined, paymentRequest: INVOICE }) },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      await client.fetch("https://api.example.com/premium");
      expect(wallet.payInvoice).toHaveBeenCalledWith(INVOICE);
    });
  });

  describe("error handling", () => {
    it("throws L402PaymentError when wallet rejects", async () => {
      global.fetch = mockFetch([{ status: 402, body: make402Body() }]) as typeof fetch;
      const wallet = { payInvoice: jest.fn().mockRejectedValue(new Error("Insufficient funds")) };
      const client = new L402Client({ wallet });
      await expect(client.fetch("https://api.example.com/premium"))
        .rejects.toThrow(L402PaymentError);
    });

    it("throws L402ParseError when 402 body has no macaroon", async () => {
      global.fetch = mockFetch([{ status: 402, body: '{"invoice":"lnbc1"}' }]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await expect(client.fetch("https://api.example.com/premium"))
        .rejects.toThrow(L402ParseError);
    });

    it("throws L402ParseError when 402 body has no invoice", async () => {
      global.fetch = mockFetch([{ status: 402, body: '{"macaroon":"abc"}' }]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await expect(client.fetch("https://api.example.com/premium"))
        .rejects.toThrow(L402ParseError);
    });

    it("clears cached token if server returns 402 again and re-pays", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() }, // 1st call: unauthenticated → 402
        { status: 200, body: '{}' },           // 1st call: retry with token → 200
        { status: 402, body: make402Body() }, // 2nd call: cached token rejected → 402
        { status: 402, body: make402Body() }, // 2nd call: unauthenticated again → 402 (new invoice)
        { status: 200, body: '{}' },           // 2nd call: retry with new token → 200
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      await client.fetch("https://api.example.com/premium");
      await client.fetch("https://api.example.com/premium");
      expect(wallet.payInvoice).toHaveBeenCalledTimes(2);
    });
  });

  describe("token store", () => {
    it("custom token store is used for caching", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const store = new Map<string, { macaroon: string; preimage: string }>();
      const tokenStore = {
        get: (url: string) => store.get(url),
        set: (url: string, token: { macaroon: string; preimage: string }) => { store.set(url, token); },
      };
      const client = new L402Client({ wallet: mockWallet(), tokenStore });
      await client.fetch("https://api.example.com/premium");
      expect(store.size).toBe(1);
    });

    it("different URLs have independent token caches", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      await client.fetch("https://api.example.com/route-a");
      await client.fetch("https://api.example.com/route-b");
      expect(wallet.payInvoice).toHaveBeenCalledTimes(2);
    });
  });

  describe("request forwarding", () => {
    it("preserves POST body on retry request", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await client.fetch("https://api.example.com/premium", {
        method: "POST",
        body: '{"q":42}',
      });
      const [, retryCall] = (global.fetch as jest.Mock).mock.calls;
      expect(retryCall[1].body).toBe('{"q":42}');
    });

    it("preserves custom headers on retry request", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await client.fetch("https://api.example.com/premium", {
        headers: { "X-Custom-Header": "my-value" },
      });
      const [, retryCall] = (global.fetch as jest.Mock).mock.calls;
      const headers = retryCall[1].headers as Record<string, string>;
      expect(headers["X-Custom-Header"]).toBe("my-value");
    });

    it("sets method to GET by default on retry", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await client.fetch("https://api.example.com/premium");
      const [firstCall, retryCall] = (global.fetch as jest.Mock).mock.calls;
      expect(firstCall[1]?.method ?? "GET").toBe(retryCall[1]?.method ?? "GET");
    });
  });

  describe("error types", () => {
    it("L402PaymentError message contains original error info", async () => {
      global.fetch = mockFetch([{ status: 402, body: make402Body() }]) as typeof fetch;
      const wallet = { payInvoice: jest.fn().mockRejectedValue(new Error("No route found")) };
      const client = new L402Client({ wallet });
      const err = await client.fetch("https://api.example.com/premium").catch((e) => e);
      expect(err).toBeInstanceOf(L402PaymentError);
      expect(err.message).toContain("No route found");
    });

    it("L402ParseError thrown when 402 body is not JSON", async () => {
      global.fetch = mockFetch([{ status: 402, body: "not-json" }]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      await expect(client.fetch("https://api.example.com/premium"))
        .rejects.toThrow(L402ParseError);
    });

    it("non-402 non-200 responses are returned as-is (no payment attempted)", async () => {
      global.fetch = mockFetch([{ status: 404, body: '{"error":"not found"}' }]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      const res = await client.fetch("https://api.example.com/missing");
      expect(res.status).toBe(404);
      expect(wallet.payInvoice).not.toHaveBeenCalled();
    });

    it("500 responses are returned as-is (no payment attempted)", async () => {
      global.fetch = mockFetch([{ status: 500, body: '{"error":"internal"}' }]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      const res = await client.fetch("https://api.example.com/broken");
      expect(res.status).toBe(500);
      expect(wallet.payInvoice).not.toHaveBeenCalled();
    });
  });

  describe("alternative field names", () => {
    it("accepts payment_request field as invoice alias", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body({ invoice: undefined, payment_request: INVOICE }) },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const wallet = mockWallet();
      const client = new L402Client({ wallet });
      await client.fetch("https://api.example.com/premium");
      expect(wallet.payInvoice).toHaveBeenCalledWith(INVOICE);
    });

    it("accepts payment_hash field alongside macaroon", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body({ payment_hash: "ph123" }) },
        { status: 200, body: '{}' },
      ]) as typeof fetch;
      const client = new L402Client({ wallet: mockWallet() });
      const res = await client.fetch("https://api.example.com/premium");
      expect(res.status).toBe(200);
    });
  });
});
