/**
 * Cloudflare Workers — API endpoint unit tests.
 * Handlers are imported directly; fetch + KV are mocked.
 * Requires Node 18+ for crypto.subtle and globalThis.fetch.
 */

import { createHash, randomBytes } from "crypto";
import { handleInvoice } from "../api/invoice";
import { handleVerify } from "../api/verify";
import { handleStats } from "../api/stats";
import { handleSplit } from "../api/split";
import { handleDemo, handleDemoBtcPrice, handleDemoPreimage } from "../api/demo";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  };
}

function makeEnv(overrides: Record<string, unknown> = {}): any {
  return {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "anon_key",
    SUPABASE_SERVICE_KEY: "service_key",
    SPLIT_SECRET: "split_secret_xyz",
    DASHBOARD_SECRET: "dash_secret_xyz",
    RESEND_API_KEY: "resend_key",
    BLINK_API_KEY: "blink_key",
    BLINK_WALLET_ID: "wallet_id",
    demo_preimages: makeKV(),
    ...overrides,
  };
}

function makeRequest(method: string, url: string, body?: unknown, headers?: Record<string, string>): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

function makeToken(expOffsetMs = 3_600_000): string {
  const preimage = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
  const macaroon = Buffer.from(JSON.stringify({ hash, exp: Date.now() + expOffsetMs })).toString("base64");
  return `${macaroon}:${preimage}`;
}

let fetchMock: jest.SpyInstance;

beforeEach(() => {
  fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 }),
  );
});

afterEach(() => {
  fetchMock.mockRestore();
});

// ─── /api/invoice ────────────────────────────────────────────────────────────

describe("handleInvoice", () => {
  test("GET returns 405 Method Not Allowed", async () => {
    const res = await handleInvoice(makeRequest("GET", "https://l402kit.com/api/invoice"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST with missing amountSats returns 400", async () => {
    const res = await handleInvoice(makeRequest("POST", "https://l402kit.com/api/invoice", {}), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/amountSats/i);
  });

  test("POST with amountSats=0 returns 400", async () => {
    const res = await handleInvoice(makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 0 }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST with negative amountSats returns 400", async () => {
    const res = await handleInvoice(makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: -5 }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST valid amountSats proxies to Supabase edge fn", async () => {
    const invoice = { paymentRequest: "lnbc10n1...", paymentHash: "abc", macaroon: "mac" };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(invoice), { status: 200 }));

    const res = await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 10 }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as typeof invoice;
    expect(body.paymentRequest).toBe("lnbc10n1...");
  });

  test("POST returns 503 when Supabase edge fn fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 503 }));

    const res = await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 10 }),
      makeEnv(),
    );
    expect(res.status).toBe(503);
  });

  test("POST returns 503 when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    const res = await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 10 }),
      makeEnv(),
    );
    expect(res.status).toBe(503);
  });
});

// ─── /api/verify ─────────────────────────────────────────────────────────────

describe("handleVerify", () => {
  test("GET returns 405", async () => {
    const res = await handleVerify(makeRequest("GET", "https://l402kit.com/api/verify"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST with missing token returns 400", async () => {
    const res = await handleVerify(makeRequest("POST", "https://l402kit.com/api/verify", {}), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST with valid token returns {valid: true}", async () => {
    const token = makeToken();
    const res = await handleVerify(makeRequest("POST", "https://l402kit.com/api/verify", { token }), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { valid: boolean };
    expect(body.valid).toBe(true);
  });

  test("POST with wrong preimage returns {valid: false}", async () => {
    const token = makeToken();
    const tampered = token.replace(/:.*$/, ":aaaa" + "0".repeat(60));
    const res = await handleVerify(makeRequest("POST", "https://l402kit.com/api/verify", { token: tampered }), makeEnv());
    const body = await res.json() as { valid: boolean };
    expect(body.valid).toBe(false);
  });

  test("POST with expired token returns {valid: false}", async () => {
    const token = makeToken(-1000);
    const res = await handleVerify(makeRequest("POST", "https://l402kit.com/api/verify", { token }), makeEnv());
    const body = await res.json() as { valid: boolean; error: string };
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/expired/i);
  });

  test("POST with malformed token returns {valid: false}", async () => {
    const res = await handleVerify(makeRequest("POST", "https://l402kit.com/api/verify", { token: "garbage" }), makeEnv());
    const body = await res.json() as { valid: boolean };
    expect(body.valid).toBe(false);
  });
});

// ─── /api/stats ──────────────────────────────────────────────────────────────

describe("handleStats", () => {
  test("GET without auth returns 401", async () => {
    const res = await handleStats(makeRequest("GET", "https://l402kit.com/api/stats"), makeEnv());
    expect(res.status).toBe(401);
  });

  test("GET with wrong secret returns 401", async () => {
    const res = await handleStats(
      makeRequest("GET", "https://l402kit.com/api/stats", undefined, { "x-dashboard-secret": "wrong" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("GET with correct secret fetches Supabase and returns stats", async () => {
    const payments = [
      { id: "1", endpoint: "/api/data", payment_hash: "h1", amount_sats: 100, owner_address: "dev@blink.sv", paid_at: new Date().toISOString() },
      { id: "2", endpoint: "/api/data", payment_hash: "h2", amount_sats: 200, owner_address: "dev@blink.sv", paid_at: new Date().toISOString() },
    ];
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payments), { status: 200 }));

    const res = await handleStats(
      makeRequest("GET", "https://l402kit.com/api/stats", undefined, { "x-dashboard-secret": "dash_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { totalPayments: number; totalSats: number; shinydappsFee: number };
    expect(body.totalPayments).toBe(2);
    expect(body.totalSats).toBe(300);
    expect(body.shinydappsFee).toBe(Math.floor(300 * 0.003));
  });

  test("POST returns 405", async () => {
    const res = await handleStats(makeRequest("POST", "https://l402kit.com/api/stats"), makeEnv());
    expect(res.status).toBe(405);
  });
});

// ─── /api/split ──────────────────────────────────────────────────────────────

describe("handleSplit", () => {
  test("GET returns 405", async () => {
    const res = await handleSplit(makeRequest("GET", "https://l402kit.com/api/split"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST without secret returns 401", async () => {
    const res = await handleSplit(makeRequest("POST", "https://l402kit.com/api/split", {}), makeEnv());
    expect(res.status).toBe(401);
  });

  test("POST with wrong secret returns 401", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", {}, { "x-split-secret": "wrong" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST with missing fields returns 400", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", {}, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  test("POST below MIN_SATS returns {ok:true, skipped:true}", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 5, ownerAddress: "dev@blink.sv" }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: boolean };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
  });
});

// ─── /api/demo ───────────────────────────────────────────────────────────────

describe("handleDemo", () => {
  test("GET returns info object with endpoints", async () => {
    const res = await handleDemo(makeRequest("GET", "https://l402kit.com/api/demo"), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { endpoints: { btcPrice: string } };
    expect(body.endpoints.btcPrice).toBe("/api/demo/btc-price");
  });
});

// ─── /api/demo/btc-price ─────────────────────────────────────────────────────

describe("handleDemoBtcPrice", () => {
  test("GET without auth returns 402 with WWW-Authenticate header", async () => {
    const blinkInvoice = { data: { lnInvoiceCreate: { invoice: { paymentRequest: "lnbc1...", paymentHash: "hash123" }, errors: [] } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(blinkInvoice), { status: 200 }));

    const kv = makeKV();
    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(402);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/L402/);
  });

  test("GET without auth returns JSON body with invoice and macaroon", async () => {
    const blinkInvoice = { data: { lnInvoiceCreate: { invoice: { paymentRequest: "lnbc1...", paymentHash: "hash456" }, errors: [] } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(blinkInvoice), { status: 200 }));

    const kv = makeKV();
    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price"),
      makeEnv({ demo_preimages: kv }),
    );
    const body = await res.json() as { invoice: string; macaroon: string; priceSats: number };
    expect(body.invoice).toBe("lnbc1...");
    expect(body.macaroon).toBeTruthy();
    expect(body.priceSats).toBe(1);
  });

  test("GET with valid L402 token returns 200 with BTC price", async () => {
    const token = makeToken();
    const coinPrice = { bitcoin: { usd: 90000, eur: 82000, gbp: 71000 } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(coinPrice), { status: 200 }));

    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price", undefined, { "Authorization": `L402 ${token}` }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { bitcoin: { usd: number }; protocol: string };
    expect(body.bitcoin.usd).toBe(90000);
    expect(body.protocol).toBe("L402");
  });

  test("GET with invalid L402 token returns 401", async () => {
    const tampered = "badmacaroon:aaaa" + "0".repeat(60);
    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price", undefined, { "Authorization": `L402 ${tampered}` }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("GET without auth and Blink failure returns 503", async () => {
    const kv = makeKV();
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 503 }));

    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(503);
  });

  test("GET without auth with Accept:text/html returns 402 HTML page", async () => {
    const blinkInvoice = { data: { lnInvoiceCreate: { invoice: { paymentRequest: "lnbc1...", paymentHash: "htmlhash" }, errors: [] } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(blinkInvoice), { status: 200 }));

    const kv = makeKV();
    const req = new Request("https://l402kit.com/api/demo/btc-price", {
      method: "GET",
      headers: { "Accept": "text/html", "Content-Type": "application/json" },
    });
    const res = await handleDemoBtcPrice(req, makeEnv({ demo_preimages: kv }));
    expect(res.status).toBe(402);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("402");
  });
});

// ─── /api/demo/preimage ───────────────────────────────────────────────────────

describe("handleDemoPreimage", () => {
  test("GET without hash returns 400", async () => {
    const res = await handleDemoPreimage(
      makeRequest("GET", "https://l402kit.com/api/demo/preimage"),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  test("GET with unknown hash returns 404", async () => {
    const res = await handleDemoPreimage(
      makeRequest("GET", "https://l402kit.com/api/demo/preimage?hash=unknownhash"),
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  test("GET with known paid hash returns preimage", async () => {
    const kv = makeKV({ "myhash": JSON.stringify({ serverPreimage: "aa".repeat(32), paid: true }) });
    const res = await handleDemoPreimage(
      new Request("https://l402kit.com/api/demo/preimage?hash=myhash"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { preimage: string };
    expect(body.preimage).toBe("aa".repeat(32));
  });

  test("GET with pending hash returns 202", async () => {
    const kv = makeKV({ "pendinghash": JSON.stringify({ serverPreimage: "bb".repeat(32), paid: false }) });
    // Mock Blink check returning not confirmed
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { me: { defaultAccount: { wallets: [] } } } }), { status: 200 }));

    const res = await handleDemoPreimage(
      new Request("https://l402kit.com/api/demo/preimage?hash=pendinghash"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(202);
    const body = await res.json() as { pending: boolean };
    expect(body.pending).toBe(true);
  });
});
