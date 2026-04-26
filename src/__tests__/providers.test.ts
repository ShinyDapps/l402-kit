import { BlinkProvider } from "../providers/blink";
import { LNbitsProvider } from "../providers/lnbits";
import { OpenNodeProvider } from "../providers/opennode";
import { AlbyProvider } from "../providers/alby";
import { ManagedProvider } from "../managed";

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
    const beforeSecs = Math.floor(Date.now() / 1000);
    const inv = await provider.createInvoice(100);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    // exp may be in seconds or ms — normalise both to seconds for comparison
    const expSecs = decoded.exp > 1e12 ? Math.floor(decoded.exp / 1000) : decoded.exp;
    expect(expSecs).toBeGreaterThan(beforeSecs);
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

// ─── AlbyProvider ─────────────────────────────────────────────────────────────

describe("AlbyProvider", () => {
  const provider = new AlbyProvider("alby-token-123", "https://myhub.getalby.com");

  it("createInvoice returns invoice with payment_request and hash", async () => {
    globalThis.fetch = mockFetch({
      payment_hash: "abc123hash",
      payment_request: "lnbc...",
    }) as typeof fetch;
    const inv = await provider.createInvoice(10);
    expect(inv.paymentRequest).toBe("lnbc...");
    expect(inv.paymentHash).toBe("abc123hash");
    expect(inv.amountSats).toBe(10);
  });

  it("sends amount in millisatoshis to Alby API", async () => {
    let capturedBody = "";
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({ payment_hash: "h", payment_request: "lnbc" }), text: async () => "" });
    }) as typeof fetch;
    await provider.createInvoice(50);
    expect(JSON.parse(capturedBody).amount).toBe(50_000); // 50 sats × 1000
  });

  it("sends Bearer token in Authorization header", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({ payment_hash: "h", payment_request: "lnbc" }), text: async () => "" });
    }) as typeof fetch;
    await provider.createInvoice(10);
    expect(capturedHeaders["Authorization"]).toBe("Bearer alby-token-123");
  });

  it("strips trailing slash from hubUrl", async () => {
    const p = new AlbyProvider("token", "https://hub.getalby.com/");
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_hash: "h", payment_request: "lnbc" }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(5);
    expect(capturedUrl).not.toContain("//api");
    expect(capturedUrl).toContain("hub.getalby.com/api/invoices");
  });

  it("macaroon is valid base64 containing payment hash", async () => {
    globalThis.fetch = mockFetch({ payment_hash: "testhash99", payment_request: "lnbc" }) as typeof fetch;
    const inv = await provider.createInvoice(10);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    expect(decoded.hash).toBe("testhash99");
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("uses expires_at from response when present", async () => {
    const future = new Date(Date.now() + 7200_000).toISOString();
    globalThis.fetch = mockFetch({ payment_hash: "h", payment_request: "lnbc", expires_at: future }) as typeof fetch;
    const inv = await provider.createInvoice(10);
    expect(inv.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3000);
  });

  it("falls back to 1h expiry when expires_at is absent", async () => {
    globalThis.fetch = mockFetch({ payment_hash: "h", payment_request: "lnbc" }) as typeof fetch;
    const inv = await provider.createInvoice(10);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(inv.expiresAt).toBeGreaterThanOrEqual(nowSec + 3598);
    expect(inv.expiresAt).toBeLessThanOrEqual(nowSec + 3602);
  });

  it("throws when payment_hash is missing from response", async () => {
    globalThis.fetch = mockFetch({ payment_request: "lnbc" }) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("unexpected invoice response format");
  });

  it("throws when payment_request is missing from response", async () => {
    globalThis.fetch = mockFetch({ payment_hash: "h" }) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("unexpected invoice response format");
  });

  it("throws on HTTP 401 (bad token)", async () => {
    globalThis.fetch = mockFetch({ error: "unauthorized" }, 401) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("401");
  });

  it("throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({ error: "server error" }, 500) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("500");
  });

  it("checkPayment returns true when settled_at is set", async () => {
    globalThis.fetch = mockFetch({ settled_at: "2024-01-01T00:00:00Z" }) as typeof fetch;
    expect(await provider.checkPayment("anyhash")).toBe(true);
  });

  it("checkPayment returns true when state=settled", async () => {
    globalThis.fetch = mockFetch({ state: "settled" }) as typeof fetch;
    expect(await provider.checkPayment("anyhash")).toBe(true);
  });

  it("checkPayment returns false when settled_at is null", async () => {
    globalThis.fetch = mockFetch({ settled_at: null, state: "pending" }) as typeof fetch;
    expect(await provider.checkPayment("anyhash")).toBe(false);
  });

  it("checkPayment returns false on HTTP 404", async () => {
    globalThis.fetch = mockFetch({}, 404) as typeof fetch;
    expect(await provider.checkPayment("anyhash")).toBe(false);
  });

  it("checkPayment returns false on HTTP 500", async () => {
    globalThis.fetch = mockFetch({}, 500) as typeof fetch;
    expect(await provider.checkPayment("anyhash")).toBe(false);
  });

  it("uses correct invoice URL with paymentHash", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ settled_at: "x" }), text: async () => "" });
    }) as typeof fetch;
    await provider.checkPayment("myhash123");
    expect(capturedUrl).toContain("myhub.getalby.com/api/invoices/myhash123");
  });
});

// ─── ManagedProvider ──────────────────────────────────────────────────────────

describe("ManagedProvider", () => {
  const provider = ManagedProvider.fromAddress("you@blink.sv");

  it("fromAddress creates a ManagedProvider instance", () => {
    expect(provider).toBeDefined();
    expect(typeof provider.createInvoice).toBe("function");
  });

  it("createInvoice POSTs to /api/invoice with correct body", async () => {
    let capturedBody = "";
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "hash123", macaroon: "mac" }), text: async () => "" });
    }) as typeof fetch;
    await provider.createInvoice(100);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.amountSats).toBe(100);
    expect(parsed.ownerAddress).toBe("you@blink.sv");
  });

  it("createInvoice returns invoice with amountSats and expiresAt", async () => {
    globalThis.fetch = mockFetch({ paymentRequest: "lnbc...", paymentHash: "h", macaroon: "m" }) as typeof fetch;
    const inv = await provider.createInvoice(50);
    expect(inv.amountSats).toBe(50);
    expect(inv.paymentRequest).toBe("lnbc...");
    expect(inv.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it("createInvoice throws on HTTP 400", async () => {
    globalThis.fetch = mockFetch({ error: "bad request" }, 400) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("invoice creation failed");
  });

  it("createInvoice throws on HTTP 503", async () => {
    globalThis.fetch = mockFetch({ error: "unavailable" }, 503) as typeof fetch;
    await expect(provider.createInvoice(10)).rejects.toThrow("invoice creation failed");
  });

  it("createInvoice calls the l402kit.com API endpoint by default", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "h", macaroon: "m" }), text: async () => "" });
    }) as typeof fetch;
    const p2 = ManagedProvider.fromAddress("x@y.com");
    await p2.createInvoice(10);
    expect(capturedUrl).toContain("l402kit.com/api/invoice");
  });

  it("checkPayment always returns false (server-side polling only)", async () => {
    expect(await provider.checkPayment()).toBe(false);
  });

  it("sendSplit POSTs to /api/split with correct body", async () => {
    let capturedBody = "";
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    }) as typeof fetch;
    await (provider as any).sendSplit(99);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.amountSats).toBe(99);
    expect(parsed.ownerAddress).toBe("you@blink.sv");
  });

  it("sendSplit throws on HTTP 400 with truncated error body", async () => {
    globalThis.fetch = mockFetch({ error: "bad request detail" }, 400) as typeof fetch;
    await expect((provider as any).sendSplit(10)).rejects.toThrow("400");
  });

  it("sendSplit throws on HTTP 500", async () => {
    globalThis.fetch = mockFetch({ error: "server error" }, 500) as typeof fetch;
    await expect((provider as any).sendSplit(10)).rejects.toThrow("500");
  });

  it("different fromAddress instances are independent", async () => {
    const p1 = ManagedProvider.fromAddress("alice@blink.sv");
    const p2 = ManagedProvider.fromAddress("bob@blink.sv");
    const bodies: string[] = [];
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      bodies.push(init.body as string);
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "h", macaroon: "m" }), text: async () => "" });
    }) as typeof fetch;
    await p1.createInvoice(10);
    await p2.createInvoice(10);
    expect(JSON.parse(bodies[0]).ownerAddress).toBe("alice@blink.sv");
    expect(JSON.parse(bodies[1]).ownerAddress).toBe("bob@blink.sv");
  });

  it("createInvoice uses POST method", async () => {
    let capturedMethod = "";
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedMethod = init.method as string;
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "h", macaroon: "m" }), text: async () => "" });
    }) as typeof fetch;
    await provider.createInvoice(10);
    expect(capturedMethod).toBe("POST");
  });

  it("createInvoice sets Content-Type to application/json", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "h", macaroon: "m" }), text: async () => "" });
    }) as typeof fetch;
    await provider.createInvoice(10);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  it("createInvoice with priceSats=1 works correctly", async () => {
    globalThis.fetch = mockFetch({ paymentRequest: "lnbc1", paymentHash: "h1", macaroon: "m1" }) as typeof fetch;
    const inv = await provider.createInvoice(1);
    expect(inv.amountSats).toBe(1);
    expect(inv.paymentRequest).toBe("lnbc1");
  });

  it("createInvoice with large amount works correctly", async () => {
    globalThis.fetch = mockFetch({ paymentRequest: "lnbc_big", paymentHash: "hbig", macaroon: "mbig" }) as typeof fetch;
    const inv = await provider.createInvoice(1_000_000);
    expect(inv.amountSats).toBe(1_000_000);
  });

  it("registerDirectory fires a silent POST to /api/register", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = jest.fn().mockImplementation((url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    }) as typeof fetch;
    ManagedProvider.fromAddress("me@blink.sv", {
      registerDirectory: { url: "https://api.me.com/data", name: "My API", priceSats: 5, category: "data" },
    });
    await Promise.resolve(); // flush microtask queue
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/api/register");
    const b = calls[0].body as Record<string, unknown>;
    expect(b.url).toBe("https://api.me.com/data");
    expect(b.name).toBe("My API");
    expect(b.price_sats).toBe(5);
    expect(b.lightning_address).toBe("me@blink.sv");
    expect(b.category).toBe("data");
  });

  it("registerDirectory errors are swallowed silently", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("network error")) as typeof fetch;
    expect(() =>
      ManagedProvider.fromAddress("me@blink.sv", {
        registerDirectory: { url: "https://api.me.com/data", name: "My API", priceSats: 5 },
      }),
    ).not.toThrow();
  });

  it("fromAddress without registerDirectory does not call /api/register", async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: true, json: async () => ({ paymentRequest: "lnbc", paymentHash: "h", macaroon: "m" }), text: async () => "" });
    }) as typeof fetch;
    const p = ManagedProvider.fromAddress("me@blink.sv");
    await Promise.resolve();
    expect(calls.filter(u => u.includes("/api/register"))).toHaveLength(0);
    // invoice call should still work
    await p.createInvoice(10);
    expect(calls.filter(u => u.includes("/api/invoice"))).toHaveLength(1);
  });
});

// ─── LNbitsProvider — additional coverage ────────────────────────────────────

describe("LNbitsProvider — additional coverage", () => {
  it("sends X-Api-Key header", async () => {
    let capturedHeaders: Record<string, string> = {};
    const p = new LNbitsProvider("my-lnbits-key");
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({ payment_request: "ln...", payment_hash: "h".repeat(64) }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(10);
    expect(capturedHeaders["X-Api-Key"]).toBe("my-lnbits-key");
  });

  it("sends amount in body (not millisatoshis)", async () => {
    let capturedBody = "";
    const p = new LNbitsProvider("k");
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({ payment_request: "ln...", payment_hash: "h".repeat(64) }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(77);
    expect(JSON.parse(capturedBody).amount).toBe(77);
  });

  it("createInvoice calls /api/v1/payments endpoint", async () => {
    let capturedUrl = "";
    const p = new LNbitsProvider("k", "https://mynode.lnbits.com");
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_request: "ln...", payment_hash: "h".repeat(64) }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(10);
    expect(capturedUrl).toBe("https://mynode.lnbits.com/api/v1/payments");
  });

  it("checkPayment calls /api/v1/payments/:hash endpoint", async () => {
    let capturedUrl = "";
    const p = new LNbitsProvider("k", "https://mynode.lnbits.com");
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ paid: true }), text: async () => "" });
    }) as typeof fetch;
    await p.checkPayment("myhash123");
    expect(capturedUrl).toBe("https://mynode.lnbits.com/api/v1/payments/myhash123");
  });

  it("strips trailing slash from baseUrl", async () => {
    let capturedUrl = "";
    const p = new LNbitsProvider("k", "https://mynode.lnbits.com/");
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ payment_request: "ln...", payment_hash: "h".repeat(64) }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(10);
    expect(capturedUrl).not.toContain("//api");
  });

  it("macaroon exp is ~1h in the future (in seconds)", async () => {
    const p = new LNbitsProvider("k");
    const hash = "a".repeat(64);
    globalThis.fetch = mockFetch({ payment_request: "ln...", payment_hash: hash });
    const inv = await p.createInvoice(10);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    const nowSec = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThanOrEqual(nowSec + 3598);
    expect(decoded.exp).toBeLessThanOrEqual(nowSec + 3602);
  });

  it("checkPayment returns true when paid field is 1 (truthy)", async () => {
    const p = new LNbitsProvider("k");
    globalThis.fetch = mockFetch({ paid: 1 });
    expect(await p.checkPayment("h")).toBe(true);
  });
});

// ─── OpenNodeProvider — additional coverage ───────────────────────────────────

describe("OpenNodeProvider — additional coverage", () => {
  it("sends Authorization header with raw API key", async () => {
    let capturedHeaders: Record<string, string> = {};
    const p = new OpenNodeProvider("my-opennode-key");
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({ ok: true, json: async () => ({ data: { id: "x", lightning_invoice: { payreq: "ln..." } } }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(10);
    expect(capturedHeaders["Authorization"]).toBe("my-opennode-key");
  });

  it("sends currency=SATS and auto_settle=false in body", async () => {
    let capturedBody = "";
    const p = new OpenNodeProvider("k");
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ ok: true, json: async () => ({ data: { id: "x", lightning_invoice: { payreq: "ln..." } } }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(33);
    const body = JSON.parse(capturedBody);
    expect(body.currency).toBe("SATS");
    expect(body.auto_settle).toBe(false);
    expect(body.amount).toBe(33);
  });

  it("createInvoice calls /v1/charges endpoint", async () => {
    let capturedUrl = "";
    const p = new OpenNodeProvider("k");
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ data: { id: "x", lightning_invoice: { payreq: "ln..." } } }), text: async () => "" });
    }) as typeof fetch;
    await p.createInvoice(10);
    expect(capturedUrl).toContain("/v1/charges");
  });

  it("checkPayment calls /v1/charge/:id endpoint", async () => {
    let capturedUrl = "";
    const p = new OpenNodeProvider("k");
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ data: { status: "paid" } }), text: async () => "" });
    }) as typeof fetch;
    await p.checkPayment("charge-xyz");
    expect(capturedUrl).toContain("/v1/charge/charge-xyz");
  });

  it("macaroon exp is ~1h in the future (in seconds)", async () => {
    const p = new OpenNodeProvider("k");
    globalThis.fetch = mockFetch({ data: { id: "chg1", lightning_invoice: { payreq: "ln..." } } });
    const inv = await p.createInvoice(10);
    const decoded = JSON.parse(Buffer.from(inv.macaroon, "base64").toString());
    const nowSec = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThanOrEqual(nowSec + 3598);
    expect(decoded.exp).toBeLessThanOrEqual(nowSec + 3602);
  });

  it("checkPayment returns false on HTTP 404", async () => {
    const p = new OpenNodeProvider("k");
    globalThis.fetch = mockFetch({}, 404);
    expect(await p.checkPayment("missing-id")).toBe(false);
  });

  it("checkPayment returns false when status=expired", async () => {
    const p = new OpenNodeProvider("k");
    globalThis.fetch = mockFetch({ data: { status: "expired" } });
    expect(await p.checkPayment("charge-abc")).toBe(false);
  });

  it("checkPayment returns false when status=underpaid", async () => {
    const p = new OpenNodeProvider("k");
    globalThis.fetch = mockFetch({ data: { status: "underpaid" } });
    expect(await p.checkPayment("charge-abc")).toBe(false);
  });
});
