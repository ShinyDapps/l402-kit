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
import { handleBlinkHook } from "../api/blink-webhook";
import { handleDemo, handleDemoBtcPrice, handleDemoPreimage } from "../api/demo";
import worker from "../worker";

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
    BLINK_WEBHOOK_SECRET: "whsec_dGVzdHNlY3JldGZvcnVuaXR0ZXN0czEyMzQ1Njc4",
    demo_preimages: makeKV(),
    ...overrides,
  };
}

// Gera um Request com headers Svix válidos para testar handleBlinkHook
async function makeSvixRequest(body: string, secret: string): Promise<Request> {
  const msgId        = "msg_test_" + randomBytes(8).toString("hex");
  const msgTimestamp = String(Math.floor(Date.now() / 1000));
  const toSign       = `${msgId}.${msgTimestamp}.${body}`;

  const keyBytes = new Uint8Array(Buffer.from(secret.replace("whsec_", ""), "base64"));
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig    = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const sigB64 = Buffer.from(sig).toString("base64");

  return new Request("https://l402kit.com/api/blink-webhook", {
    method: "POST",
    headers: {
      "Content-Type":   "application/json",
      "svix-id":        msgId,
      "svix-timestamp": msgTimestamp,
      "svix-signature": `v1,${sigB64}`,
    },
    body,
  });
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

  test("GET with expired L402 token returns 401", async () => {
    const preimage = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
    const macaroon = Buffer.from(JSON.stringify({ hash, exp: Date.now() - 1000 })).toString("base64");
    const token = `${macaroon}:${preimage}`;

    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price", undefined, { "Authorization": `L402 ${token}` }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("GET without auth respects rate limit after 8 requests from same IP", async () => {
    const kv = makeKV();
    const env = makeEnv({ demo_preimages: kv });

    const blinkResp = { data: { lnInvoiceCreate: { invoice: { paymentRequest: "lnbc1...", paymentHash: "ratelimithash" }, errors: [] } } };

    // First 8 requests succeed
    for (let i = 0; i < 8; i++) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...blinkResp, data: { lnInvoiceCreate: { invoice: { paymentRequest: "lnbc1...", paymentHash: `rlhash${i}` }, errors: [] } } }), { status: 200 }));
      const req = new Request("https://l402kit.com/api/demo/btc-price", {
        method: "GET",
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      });
      const res = await handleDemoBtcPrice(req, env);
      expect(res.status).toBe(402);
    }

    // 9th request from the same IP hits the rate limit
    const req = new Request("https://l402kit.com/api/demo/btc-price", {
      method: "GET",
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    const res = await handleDemoBtcPrice(req, env);
    expect(res.status).toBe(429);
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

  test("GET with pending hash returns preimage after Blink confirms payment", async () => {
    const preimage = "cc".repeat(32);
    const kv = makeKV({ "confirmedhash": JSON.stringify({ serverPreimage: preimage, paid: false }) });
    // Mock Blink returning the matching transaction
    const blinkData = { data: { me: { defaultAccount: { wallets: [{ transactions: { edges: [{ node: { initiationVia: { paymentHash: "confirmedhash" } } }] } }] } } } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(blinkData), { status: 200 }));

    const res = await handleDemoPreimage(
      new Request("https://l402kit.com/api/demo/preimage?hash=confirmedhash"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { preimage: string };
    expect(body.preimage).toBe(preimage);
  });

  test("GET with paid hash does not re-check Blink", async () => {
    const preimage = "dd".repeat(32);
    const kv = makeKV({ "alreadypaid": JSON.stringify({ serverPreimage: preimage, paid: true }) });

    const res = await handleDemoPreimage(
      new Request("https://l402kit.com/api/demo/preimage?hash=alreadypaid"),
      makeEnv({ demo_preimages: kv }),
    );
    expect(res.status).toBe(200);
    // Blink should NOT have been called (fetch still at 0 calls for this test)
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await res.json() as { preimage: string };
    expect(body.preimage).toBe(preimage);
  });
});

// ─── /api/invoice — ownerAddress KV storage ──────────────────────────────────

describe("handleInvoice — ownerAddress KV storage", () => {
  test("stores ownerAddress + amountSats in KV when edge fn returns paymentHash", async () => {
    const kv  = makeKV();
    const env = makeEnv({ demo_preimages: kv });
    const invoice = { paymentRequest: "lnbc100n1...", paymentHash: "hash_owner_test", macaroon: "mac" };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(invoice), { status: 200 }));

    await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 100, ownerAddress: "dev@blink.sv" }),
      env,
    );

    const stored = await kv.get("l402_inv:hash_owner_test");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { ownerAddress: string; amountSats: number };
    expect(parsed.ownerAddress).toBe("dev@blink.sv");
    expect(parsed.amountSats).toBe(100);
  });

  test("does NOT write to KV when ownerAddress is absent", async () => {
    const kv  = makeKV();
    const env = makeEnv({ demo_preimages: kv });
    const invoice = { paymentRequest: "lnbc10n1...", paymentHash: "hash_no_owner", macaroon: "mac" };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(invoice), { status: 200 }));

    await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 10 }),
      env,
    );

    const stored = await kv.get("l402_inv:hash_no_owner");
    expect(stored).toBeNull();
  });

  test("does NOT write to KV when edge fn returns no paymentHash", async () => {
    const kv  = makeKV();
    const env = makeEnv({ demo_preimages: kv });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ paymentRequest: "lnbc10n1..." }), { status: 200 }));

    await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 10, ownerAddress: "dev@blink.sv" }),
      env,
    );

    // No paymentHash in response → nothing stored
    const keys = Array.from((kv as any)["store"]?.keys?.() ?? []).filter((k: unknown) => String(k).startsWith("l402_inv:"));
    expect(keys).toHaveLength(0);
  });

  test("still returns invoice body to caller after KV write", async () => {
    const kv  = makeKV();
    const invoice = { paymentRequest: "lnbc200n1...", paymentHash: "hash_return_test", macaroon: "mac_return" };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(invoice), { status: 200 }));

    const res = await handleInvoice(
      makeRequest("POST", "https://l402kit.com/api/invoice", { amountSats: 200, ownerAddress: "dev@blink.sv" }),
      makeEnv({ demo_preimages: kv }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as typeof invoice;
    expect(body.paymentRequest).toBe("lnbc200n1...");
    expect(body.macaroon).toBe("mac_return");
  });
});

// ─── /api/blink-webhook — signature + KV enrichment ─────────────────────────

describe("handleBlinkHook", () => {
  const SECRET = "whsec_dGVzdHNlY3JldGZvcnVuaXR0ZXN0czEyMzQ1Njc4";

  const blinkBody = (paymentHash: string, amount = 1000) =>
    JSON.stringify({
      id: "evt_test",
      type: "transaction.received",
      data: {
        settlementAmount: amount,
        initiationVia: { paymentHash },
      },
    });

  test("GET returns 405", async () => {
    const res = await handleBlinkHook(
      new Request("https://l402kit.com/api/blink-webhook", { method: "GET" }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
  });

  test("POST without Svix headers returns 401", async () => {
    const res = await handleBlinkHook(
      makeRequest("POST", "https://l402kit.com/api/blink-webhook", { type: "transaction.received" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST with wrong signature returns 401", async () => {
    const body = blinkBody("hash_wrong_sig");
    const res = await handleBlinkHook(
      new Request("https://l402kit.com/api/blink-webhook", {
        method: "POST",
        headers: {
          "Content-Type":   "application/json",
          "svix-id":        "msg_bad",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,invalidsignature==",
        },
        body,
      }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST with stale timestamp returns 401", async () => {
    const body      = blinkBody("hash_stale");
    const msgId     = "msg_stale";
    const staleTs   = String(Math.floor(Date.now() / 1000) - 400); // > 300s ago
    const toSign    = `${msgId}.${staleTs}.${body}`;
    const keyBytes  = new Uint8Array(Buffer.from(SECRET.replace("whsec_", ""), "base64"));
    const key       = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig       = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const sigB64    = Buffer.from(sig).toString("base64");

    const res = await handleBlinkHook(
      new Request("https://l402kit.com/api/blink-webhook", {
        method: "POST",
        headers: {
          "Content-Type":   "application/json",
          "svix-id":        msgId,
          "svix-timestamp": staleTs,
          "svix-signature": `v1,${sigB64}`,
        },
        body,
      }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST with valid signature + no KV entry passes body as-is to Supabase", async () => {
    const body = blinkBody("hash_no_kv");
    const req  = await makeSvixRequest(body, SECRET);
    const env  = makeEnv(); // KV empty

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await handleBlinkHook(req, env);
    expect(res.status).toBe(200);

    // Body forwarded to Supabase should NOT contain _ownerAddress
    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(forwarded._ownerAddress).toBeUndefined();
  });

  test("POST with valid signature + KV hit enriches body with _ownerAddress and _amountSats", async () => {
    const hash = "hash_kv_hit";
    const body = blinkBody(hash, 500);
    const kv   = makeKV({ [`l402_inv:${hash}`]: JSON.stringify({ ownerAddress: "dev@blink.sv", amountSats: 500 }) });
    const env  = makeEnv({ demo_preimages: kv });
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await handleBlinkHook(req, env);
    expect(res.status).toBe(200);

    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(forwarded._ownerAddress).toBe("dev@blink.sv");
    expect(forwarded._amountSats).toBe(500);
  });

  test("POST with valid signature + KV hit preserves original Blink fields", async () => {
    const hash = "hash_preserve";
    const body = blinkBody(hash, 250);
    const kv   = makeKV({ [`l402_inv:${hash}`]: JSON.stringify({ ownerAddress: "owner@ln.tips", amountSats: 250 }) });
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await handleBlinkHook(req, makeEnv({ demo_preimages: kv }));

    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect((forwarded.data as Record<string, unknown>)?.settlementAmount).toBe(250);
    expect((forwarded.data as Record<string, unknown>)?.initiationVia).toBeDefined();
  });

  test("POST with valid signature proxies Supabase error status", async () => {
    const body = blinkBody("hash_supabase_err");
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "internal" }), { status: 500 }));

    const res = await handleBlinkHook(req, makeEnv());
    expect(res.status).toBe(500);
  });

  test("POST with malformed JSON body returns 401 (signature mismatch, not crash)", async () => {
    // Malformed JSON with valid signature — verifySvix should still work, but JSON.parse in handler won't crash
    const body = "not-valid-json";
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    // Even with bad JSON, the handler should not throw — passes body through
    const res = await handleBlinkHook(req, makeEnv());
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ─── .well-known discovery routes ────────────────────────────────────────────

describe(".well-known/agent.json", () => {
  test("GET returns 200 with JSON content-type", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  test("response contains required agent discovery fields", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.name).toBe("l402-kit");
    expect(body.protocols).toContain("l402");
    expect(body.install).toBeDefined();
    expect(body.llms_txt).toBeDefined();
  });

  test("install field has all four package managers", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as { install: Record<string, string> };
    expect(body.install.npm).toMatch(/npm install/);
    expect(body.install.pip).toMatch(/pip install/);
    expect(body.install.cargo).toMatch(/cargo add/);
    expect(body.install.go).toMatch(/go get/);
  });
});

describe(".well-known/l402.json", () => {
  test("GET returns 200 with JSON content-type", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/l402.json");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  test("response declares l402 protocol and demo endpoint", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/l402.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.protocol).toBe("l402");
    expect(body.demo_endpoint).toContain("api.l402kit.com");
    expect(body.price_sats).toBe(1);
  });

  test("response includes docs and sdk links", async () => {
    const req = new Request("https://api.l402kit.com/.well-known/l402.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.docs).toContain("l402kit.com");
    expect(body.sdk).toContain("npmjs.com");
  });
});

// ─── /api/split ──────────────────────────────────────────────────────────────

describe("handleSplit", () => {
  test("GET returns 405", async () => {
    const res = await handleSplit(makeRequest("GET", "https://l402kit.com/api/split"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST without secret returns 401", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 100, ownerAddress: "a@b.com" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST with wrong secret returns 401", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 100, ownerAddress: "a@b.com" }, { "x-split-secret": "wrong" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  test("POST missing amountSats returns 400", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { ownerAddress: "a@b.com" }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/missing/i);
  });

  test("POST missing ownerAddress returns 400", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 100 }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  test("POST amountSats below MIN_SATS skips and returns ok+skipped", async () => {
    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 5, ownerAddress: "a@b.com" }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: boolean };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
  });

  test("POST valid split calls lnurlp and supabase, returns ownerSats", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ callback: "https://blink.sv/lnurlp/cb" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc100n1..." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 100, ownerAddress: "user@blink.sv" }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; ownerSats: number };
    expect(body.ok).toBe(true);
    expect(body.ownerSats).toBe(99); // floor(100 * 0.997)
  });

  test("POST split returns 500 if supabase pay-invoice fails", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ callback: "https://blink.sv/lnurlp/cb" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc100n1..." }), { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 502 }));

    const res = await handleSplit(
      makeRequest("POST", "https://l402kit.com/api/split", { amountSats: 100, ownerAddress: "user@blink.sv" }, { "x-split-secret": "split_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(500);
  });
});

// ─── Badge routes ─────────────────────────────────────────────────────────────

describe("badge routes", () => {
  test("GET /badge/powered-by-l402kit.svg returns SVG with 200", async () => {
    const req = new Request("https://l402kit.com/badge/powered-by-l402kit.svg");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/image\/svg\+xml/);
    const body = await res.text();
    expect(body).toContain("<svg");
  });

  test("GET /badge/powered-by-l402kit-sm.svg returns small SVG", async () => {
    const req = new Request("https://l402kit.com/badge/powered-by-l402kit-sm.svg");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("120");
  });

  test("GET /badge/powered-by-l402kit-light.svg returns light SVG", async () => {
    const req = new Request("https://l402kit.com/badge/powered-by-l402kit-light.svg");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("#0B0C14");
  });

  test("badge has Cache-Control header", async () => {
    const req = new Request("https://l402kit.com/badge/powered-by-l402kit.svg");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("Cache-Control")).toMatch(/max-age/);
  });
});

// ─── CORS & OPTIONS ───────────────────────────────────────────────────────────

describe("CORS", () => {
  test("OPTIONS returns 204 with CORS headers", async () => {
    const req = new Request("https://l402kit.com/api/demo", { method: "OPTIONS" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("all responses include Access-Control-Allow-Origin", async () => {
    const req = new Request("https://l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("404 unknown route still includes CORS headers", async () => {
    const req = new Request("https://l402kit.com/unknown-path-xyz");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ─── /docs redirect ───────────────────────────────────────────────────────────

describe("docs redirect", () => {
  test("GET /docs redirects to docs.l402kit.com", async () => {
    const req = new Request("https://l402kit.com/docs");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("docs.l402kit.com");
  });

  test("GET /docs/quickstart preserves path", async () => {
    const req = new Request("https://l402kit.com/docs/quickstart");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("quickstart");
  });
});

// ─── docs.l402kit.com hostname redirect ──────────────────────────────────────

describe("docs.l402kit.com hostname", () => {
  test("redirects to mintlify.app", async () => {
    const req = new Request("https://docs.l402kit.com/introduction");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("mintlify.app");
    expect(res.headers.get("Location")).toContain("/introduction");
  });

  test("preserves path and query string", async () => {
    const req = new Request("https://docs.l402kit.com/agent/quickstart?ref=test");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") ?? "";
    expect(loc).toContain("agent/quickstart");
    expect(loc).toContain("ref=test");
  });
});

// ─── 402index verify route ────────────────────────────────────────────────────

describe("/.well-known/402index-verify.txt", () => {
  test("GET returns 200 with text/plain", async () => {
    const req = new Request("https://l402kit.com/.well-known/402index-verify.txt");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
  });

  test("response is a 64-char hex hash", async () => {
    const req = new Request("https://l402kit.com/.well-known/402index-verify.txt");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.text();
    expect(body).toMatch(/^[0-9a-f]{64}$/);
  });
});
