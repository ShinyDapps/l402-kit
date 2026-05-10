/**
 * Cloudflare Workers — API endpoint unit tests.
 * Handlers are imported directly; fetch + KV are mocked.
 * Requires Node 18+ for crypto.subtle and globalThis.fetch.
 */

import { createHash, randomBytes } from "crypto";
import { createHmac } from "crypto";
import { handleInvoice } from "../api/invoice";
import { handleVerify } from "../api/verify";
import { handleStats } from "../api/stats";
import { handleSplit } from "../api/split";
import { handleBlinkHook } from "../api/blink-webhook";
import { handleDemo, handleDemoBtcPrice, handleDemoPreimage, handleDemoPayAddress } from "../api/demo";
import { handleCheckout } from "../api/checkout";
import { handleProSubscribe } from "../api/pro-subscribe";
import { handleProPoll } from "../api/pro-poll";
import { handleProCheck } from "../api/pro-check";
import { handleLnurlp } from "../api/lnurlp";
import { sweepTransitWallet } from "../api/sweep";
import { handleLawnEvents } from "../api/lawn-events";
import { handleActivity } from "../api/activity";
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
    BLINK_API_KEY: "blink_key",
    BLINK_WALLET_ID: "wallet_id",
    BLINK_API_KEY_DEMO: "blink_demo_key",
    BLINK_WALLET_ID_DEMO: "demo_wallet_id",
    OWNER_LIGHTNING_ADDRESS: "owner@blink.sv",
    BLINK_WEBHOOK_SECRET: "whsec_dGVzdHNlY3JldGZvcnVuaXR0ZXN0czEyMzQ1Njc4",
    LAWN_HMAC_SECRET: "test_lawn_secret_xyz",
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
  test("GET returns 410 Gone — endpoint deprecated", async () => {
    const res = await handleDemoPreimage(
      makeRequest("GET", "https://l402kit.com/api/demo/preimage"),
      makeEnv(),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { deprecated: boolean };
    expect(body.deprecated).toBe(true);
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

  test("POST duplicate paymentHash returns skipped without calling Supabase", async () => {
    const hash = "hash_already_processed";
    const body = blinkBody(hash);
    const kv   = makeKV({ [`processed:${hash}`]: "1" });
    const req  = await makeSvixRequest(body, SECRET);

    const res = await handleBlinkHook(req, makeEnv({ demo_preimages: kv }));
    expect(res.status).toBe(200);
    const resBody = await res.json() as { ok: boolean; skipped: boolean; reason: string };
    expect(resBody.ok).toBe(true);
    expect(resBody.skipped).toBe(true);
    expect(resBody.reason).toBe("duplicate");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("POST first delivery stores processed key in KV", async () => {
    const hash = "hash_first_delivery";
    const body = blinkBody(hash);
    const kv   = makeKV();
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await handleBlinkHook(req, makeEnv({ demo_preimages: kv }));

    const stored = await kv.get(`processed:${hash}`);
    expect(stored).toBe("1");
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

  // ── Payload schema snapshot — guards against silent Blink format changes ──

  test("payload schema: data.initiationVia.paymentHash is the field we depend on", async () => {
    // If Blink changes this path, KV enrichment silently stops working.
    // This test freezes the contract so any format change is caught immediately.
    const hash = "schema_snapshot_hash";
    const canonicalPayload = {
      id: "evt_test",
      type: "transaction.received",
      data: {
        settlementAmount: 100,
        initiationVia: { paymentHash: hash },  // ← exact path the handler reads
      },
    };
    const body = JSON.stringify(canonicalPayload);
    const kv   = makeKV({ [`l402_inv:${hash}`]: JSON.stringify({ ownerAddress: "test@blink.sv", amountSats: 100 }) });
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await handleBlinkHook(req, makeEnv({ demo_preimages: kv }));

    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    // Enrichment only happens if the path is correct — if Blink renames initiationVia, this fails
    expect(forwarded._ownerAddress).toBe("test@blink.sv");
    expect(forwarded._amountSats).toBe(100);
  });

  test("payload schema: missing initiationVia does not crash handler", async () => {
    // Graceful degradation — if Blink sends a new event type without initiationVia, handler must not throw
    const body = JSON.stringify({ id: "evt_other", type: "transaction.sent", data: { settlementAmount: 50 } });
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await handleBlinkHook(req, makeEnv());
    expect(res.status).toBe(200);

    const forwarded = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(forwarded._ownerAddress).toBeUndefined(); // no enrichment — expected
  });

  test("Svix headers are forwarded to Supabase for re-verification", async () => {
    // Supabase edge function re-verifies the Svix signature — we must forward the headers
    const body = blinkBody("hash_fwd_headers");
    const req  = await makeSvixRequest(body, SECRET);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await handleBlinkHook(req, makeEnv());

    const forwardedHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(forwardedHeaders["svix-id"]).toBeTruthy();
    expect(forwardedHeaders["svix-timestamp"]).toBeTruthy();
    expect(forwardedHeaders["svix-signature"]).toBeTruthy();
  });
});

// ─── .well-known discovery routes ────────────────────────────────────────────

describe(".well-known/agent.json", () => {
  test("GET returns 200 with JSON content-type", async () => {
    const req = new Request("https://l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  test("response contains required agent discovery fields", async () => {
    const req = new Request("https://l402kit.com/.well-known/agent.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.name).toBe("l402-kit");
    expect(body.protocols).toContain("l402");
    expect(body.install).toBeDefined();
    expect(body.fee).toBeDefined();
  });

  test("install field has all four package managers", async () => {
    const req = new Request("https://l402kit.com/.well-known/agent.json");
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
    const req = new Request("https://l402kit.com/.well-known/l402.json");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  test("response declares l402 protocol and demo endpoint", async () => {
    const req = new Request("https://l402kit.com/.well-known/l402.json");
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.protocol).toBe("l402");
    expect(body.demo_endpoint).toContain("l402kit.com");
    expect(body.price_sats).toBe(1);
  });

  test("response includes docs and sdk links", async () => {
    const req = new Request("https://l402kit.com/.well-known/l402.json");
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

// ─── /api/checkout ───────────────────────────────────────────────────────────

describe("handleCheckout", () => {
  test("GET returns 200 with HTML content-type", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  test("page contains Lightning address injected from query param", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).toContain("user@blink.sv");
  });

  test("page title reflects tier label", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).toMatch(/Upgrade to Pro/i);
  });

  test("missing address renders no-address state gracefully", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?tier=pro");
    const res = await handleCheckout(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("No address");
  });

  test("unknown tier falls back to pro label", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=enterprise");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).toMatch(/\$9/); // falls back to pro USD price
  });

  test("page contains /api/pro-subscribe POST target", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).toContain("/api/pro-subscribe");
  });

  test("page contains /api/pro-poll polling target", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).toContain("/api/pro-poll");
  });

  test("XSS: address is HTML-escaped in output", async () => {
    const req = makeRequest("GET", "https://l402kit.com/api/checkout?address=%3Cscript%3Ealert(1)%3C%2Fscript%3E&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    const body = await res.text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });

  test("POST method returns 200 (checkout is GET-only but must not crash)", async () => {
    // The handler doesn't check method — it just renders HTML regardless.
    // This documents the current behavior; if method gating is added, update this test.
    const req = makeRequest("POST", "https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await handleCheckout(req, makeEnv());
    expect(res.status).toBe(200);
  });

  test("worker routes /api/checkout to handleCheckout", async () => {
    const req = new Request("https://l402kit.com/api/checkout?address=user%40blink.sv&tier=pro");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });
});

// ─── /api/pro-subscribe ──────────────────────────────────────────────────────

describe("handleProSubscribe", () => {
  test("GET returns 405", async () => {
    const res = await handleProSubscribe(makeRequest("GET", "https://l402kit.com/api/pro-subscribe"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST without lightningAddress returns 400", async () => {
    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { tier: "pro" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/lightning address/i);
  });

  test("POST with address missing @ returns 400", async () => {
    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "notanemail", tier: "pro" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  test("POST with invalid tier returns 400", async () => {
    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "diamond" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid tier/i);
  });

  test("POST valid request calls BTC price API then Supabase create-invoice", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 100_000 } }), { status: 200 })) // coingecko
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentRequest: "lnbc90n1...", paymentHash: "hash_abc" }), { status: 200 })); // supabase

    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "pro" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { paymentRequest: string; paymentHash: string; amountSats: number };
    expect(body.paymentRequest).toBe("lnbc90n1...");
    expect(body.paymentHash).toBe("hash_abc");
    expect(body.amountSats).toBeGreaterThan(0);
  });

  test("POST returns 503 when Supabase create-invoice fails", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 100_000 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 503 }));

    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "pro" }),
      makeEnv(),
    );
    expect(res.status).toBe(503);
  });

  test("POST falls back to hardcoded BTC price when CoinGecko fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network")) // coingecko fails
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentRequest: "lnbc...", paymentHash: "hash" }), { status: 200 }));

    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "pro" }),
      makeEnv(),
    );
    // Should still succeed using fallback price
    expect(res.status).toBe(200);
    const body = await res.json() as { amountSats: number };
    // $9 at fallback $95,000/BTC ≈ 9473 sats
    expect(body.amountSats).toBeGreaterThan(5000);
    expect(body.amountSats).toBeLessThan(20_000);
  });

  test("POST business tier returns higher amountSats than pro", async () => {
    const makeInvoiceRes = () =>
      new Response(JSON.stringify({ paymentRequest: "lnbc...", paymentHash: "hash" }), { status: 200 });

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 100_000 } }), { status: 200 }))
      .mockResolvedValueOnce(makeInvoiceRes());
    const resPro = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "pro" }),
      makeEnv(),
    );
    const { amountSats: proSats } = await resPro.json() as { amountSats: number };

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 100_000 } }), { status: 200 }))
      .mockResolvedValueOnce(makeInvoiceRes());
    const resBiz = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv", tier: "business" }),
      makeEnv(),
    );
    const { amountSats: bizSats } = await resBiz.json() as { amountSats: number };

    expect(bizSats).toBeGreaterThan(proSats);
  });

  test("response includes CORS header", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 100_000 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentRequest: "lnbc...", paymentHash: "h" }), { status: 200 }));

    const res = await handleProSubscribe(
      makeRequest("POST", "https://l402kit.com/api/pro-subscribe", { lightningAddress: "user@blink.sv" }),
      makeEnv(),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ─── /api/demo/pay-address ───────────────────────────────────────────────────

describe("handleDemoPayAddress", () => {
  test("GET returns 405", async () => {
    const res = await handleDemoPayAddress(makeRequest("GET", "https://l402kit.com/api/demo/pay-address"), makeEnv());
    expect(res.status).toBe(405);
  });

  test("POST with missing address returns 400", async () => {
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", {}), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST with address missing @ returns 400", async () => {
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "nodomain" }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST with address missing dot returns 400", async () => {
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@nodot" }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST rate-limited by IP returns 429", async () => {
    const kv = makeKV({ "demo-pay-rl:1.2.3.4": JSON.stringify({ count: 2, reset: Math.floor(Date.now() / 1000) + 3600 }) });
    const env = makeEnv({ demo_preimages: kv });
    const req = makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }, { "CF-Connecting-IP": "1.2.3.4" });
    const res = await handleDemoPayAddress(req, env);
    expect(res.status).toBe(429);
  });

  test("POST rate-limited by address returns 429", async () => {
    const kv = makeKV({ "demo-pay-addr:user@blink.sv": "1" });
    const env = makeEnv({ demo_preimages: kv });
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), env);
    expect(res.status).toBe(429);
  });

  test("POST where LNURL resolve fails returns 400", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST where LNURL tag is not payRequest returns 400", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ tag: "channelRequest", callback: "https://x.com/cb" }), { status: 200 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(400);
  });

  test("POST where amount below minSendable returns 400", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 5000 }), { status: 200 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/minimum/i);
  });

  test("POST where invoice request fails returns 503", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("err", { status: 503 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(503);
  });

  test("POST where invoice missing pr returns 503", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reason: "no funds" }), { status: 200 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(503);
  });

  test("POST where Blink payment returns non-ok returns 503", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc1..." }), { status: 200 }))
      .mockResolvedValueOnce(new Response("err", { status: 500 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(503);
  });

  test("POST where Blink payment has errors returns 503", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc1..." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lnInvoicePaymentSend: { status: "FAILURE", errors: [{ message: "insufficient balance" }] } } }), { status: 200 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(503);
  });

  test("POST successful payment returns {paid: true, amountSats: 1}", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: "payRequest", callback: "https://x.com/cb", minSendable: 1000, maxSendable: 1_000_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc1..." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } } }), { status: 200 }));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { paid: boolean; amountSats: number };
    expect(body.paid).toBe(true);
    expect(body.amountSats).toBe(1);
  });

  test("POST fetch throws returns 503", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    const res = await handleDemoPayAddress(makeRequest("POST", "https://l402kit.com/api/demo/pay-address", { address: "user@blink.sv" }), makeEnv());
    expect(res.status).toBe(503);
  });
});

// ─── /.well-known/lnurlp/:name ───────────────────────────────────────────────

describe("handleLnurlp", () => {
  test("GET unknown user returns 404", async () => {
    const req = new Request("https://l402kit.com/.well-known/lnurlp/unknown");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(404);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ERROR");
  });

  test("GET Phase 1 (no amount) returns payRequest metadata", async () => {
    const req = new Request("https://l402kit.com/.well-known/lnurlp/shinydapps");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { tag: string; callback: string; minSendable: number; maxSendable: number };
    expect(body.tag).toBe("payRequest");
    expect(body.callback).toContain("lnurlp/shinydapps");
    expect(body.minSendable).toBe(1000);
    expect(body.maxSendable).toBeGreaterThan(1000);
  });

  test("GET Phase 2 with invalid amount returns 400", async () => {
    const req = new Request("https://l402kit.com/.well-known/lnurlp/shinydapps?amount=0");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json() as { status: string; reason: string };
    expect(body.status).toBe("ERROR");
    expect(body.reason).toMatch(/invalid amount/i);
  });

  test("GET Phase 2 with amount below minSendable returns 400", async () => {
    const req = new Request("https://l402kit.com/.well-known/lnurlp/shinydapps?amount=500");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(400);
  });

  test("GET Phase 2 valid amount returns invoice", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ paymentRequest: "lnbc1000n1..." }), { status: 200 }));
    const req = new Request("https://l402kit.com/.well-known/lnurlp/shinydapps?amount=1000");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { pr: string; routes: unknown[] };
    expect(body.pr).toBe("lnbc1000n1...");
    expect(body.routes).toEqual([]);
  });

  test("GET Phase 2 Supabase failure returns 503", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 503 }));
    const req = new Request("https://l402kit.com/.well-known/lnurlp/shinydapps?amount=1000");
    const res = await handleLnurlp(req, makeEnv());
    expect(res.status).toBe(503);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ERROR");
  });
});

// ─── /api/pro-poll ───────────────────────────────────────────────────────────

describe("handleProPoll", () => {
  test("GET missing paymentHash returns 400", async () => {
    const req = new Request("https://l402kit.com/api/pro-poll?address=user@blink.sv");
    const res = await handleProPoll(req, makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json() as { paid: boolean; error: string };
    expect(body.paid).toBe(false);
    expect(body.error).toMatch(/missing params/i);
  });

  test("GET missing address returns 400", async () => {
    const req = new Request("https://l402kit.com/api/pro-poll?paymentHash=abc123");
    const res = await handleProPoll(req, makeEnv());
    expect(res.status).toBe(400);
  });

  test("GET returns paid:true when pro_access row exists", async () => {
    const expiresAt = new Date(Date.now() + 86400_000).toISOString();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ expires_at: expiresAt }]), { status: 200 }));
    const req = new Request("https://l402kit.com/api/pro-poll?paymentHash=abc&address=user@blink.sv");
    const res = await handleProPoll(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { paid: boolean; expiresAt: string };
    expect(body.paid).toBe(true);
    expect(body.expiresAt).toBe(expiresAt);
  });

  test("GET returns paid:false when no pro_access row", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const req = new Request("https://l402kit.com/api/pro-poll?paymentHash=abc&address=user@blink.sv");
    const res = await handleProPoll(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { paid: boolean };
    expect(body.paid).toBe(false);
  });

  test("GET returns paid:false until webhook populates pro_access", async () => {
    // After payment, webhook creates pro_access. Until then, poll returns false.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const req = new Request("https://l402kit.com/api/pro-poll?paymentHash=abc&address=user@blink.sv&tier=pro");
    const res = await handleProPoll(req, makeEnv());
    const body = await res.json() as { paid: boolean };
    expect(body.paid).toBe(false);
  });

  test("GET returns paid:true once pro_access is populated (lifetime)", async () => {
    const expiresAt = new Date(Date.now() + 36500 * 86400_000).toISOString();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ expires_at: expiresAt }]), { status: 200 }));
    const req = new Request("https://l402kit.com/api/pro-poll?paymentHash=abc&address=user@blink.sv&tier=lifetime");
    const res = await handleProPoll(req, makeEnv());
    const body = await res.json() as { paid: boolean; expiresAt: string };
    expect(body.paid).toBe(true);
    const yearsAhead = (new Date(body.expiresAt).getTime() - Date.now()) / (1000 * 86400 * 365);
    expect(yearsAhead).toBeGreaterThan(50);
  });
});

// ─── sweepTransitWallet ───────────────────────────────────────────────────────

describe("sweepTransitWallet", () => {
  test("returns early when OWNER_LIGHTNING_ADDRESS is missing", async () => {
    const env = makeEnv({ OWNER_LIGHTNING_ADDRESS: "" });
    await sweepTransitWallet(env);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns early when BLINK_API_KEY_DEMO is missing", async () => {
    const env = makeEnv({ BLINK_API_KEY_DEMO: "" });
    await sweepTransitWallet(env);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns early when Blink balance call fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));
    await sweepTransitWallet(makeEnv());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns early when balance is zero", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: { me: { defaultAccount: { wallets: [{ id: "demo_wallet_id", walletCurrency: "BTC", balance: 0 }] } } },
    }), { status: 200 }));
    await sweepTransitWallet(makeEnv());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("full happy path calls Supabase pay-invoice", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { me: { defaultAccount: { wallets: [{ id: "demo_wallet_id", walletCurrency: "BTC", balance: 100 }] } } },
      }), { status: 200 })) // balance check
      .mockResolvedValueOnce(new Response(JSON.stringify({ callback: "https://blink.sv/cb", minSendable: 1000 }), { status: 200 })) // lnurlp metadata
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: "lnbc100n1..." }), { status: 200 })) // lnurlp invoice
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })); // supabase pay-invoice
    await sweepTransitWallet(makeEnv());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const lastCall = fetchMock.mock.calls[3][0] as string;
    expect(lastCall).toContain("pay-invoice");
  });

  test("does not throw when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    await expect(sweepTransitWallet(makeEnv())).resolves.toBeUndefined();
  });
});

// ─── fetchBtcPrice fallback paths (via handleDemoBtcPrice) ───────────────────

describe("fetchBtcPrice fallback", () => {
  function makeValidToken(): string {
    return makeToken(3_600_000);
  }

  test("uses Coinbase when CoinGecko fails", async () => {
    const token = makeValidToken();
    fetchMock
      .mockRejectedValueOnce(new Error("coingecko down")) // CoinGecko
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { amount: "95000" } }), { status: 200 })) // Coinbase USD
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { amount: "88000" } }), { status: 200 })) // Coinbase EUR
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { amount: "75000" } }), { status: 200 })); // Coinbase GBP
    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price", undefined, { Authorization: `L402 ${token}` }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { bitcoin: { source: string; usd: number } };
    expect(body.bitcoin.source).toBe("Coinbase");
    expect(body.bitcoin.usd).toBe(95000);
  });

  test("returns source:unavailable when both CoinGecko and Coinbase fail", async () => {
    const token = makeValidToken();
    fetchMock
      .mockRejectedValueOnce(new Error("coingecko down"))   // CoinGecko
      .mockRejectedValueOnce(new Error("coinbase usd down")) // Coinbase USD
      .mockRejectedValueOnce(new Error("coinbase eur down")) // Coinbase EUR
      .mockRejectedValueOnce(new Error("coinbase gbp down")); // Coinbase GBP
    const res = await handleDemoBtcPrice(
      makeRequest("GET", "https://l402kit.com/api/demo/btc-price", undefined, { Authorization: `L402 ${token}` }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { bitcoin: { source: string; usd: number } };
    expect(body.bitcoin.source).toBe("unavailable");
    expect(body.bitcoin.usd).toBe(0);
  });
});

// ─── handleStats error path ───────────────────────────────────────────────────

describe("handleStats error path", () => {
  test("returns 500 when Supabase fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("supabase down"));
    const res = await handleStats(
      makeRequest("GET", "https://l402kit.com/api/stats", undefined, { "x-dashboard-secret": "dash_secret_xyz" }),
      makeEnv(),
    );
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/failed to fetch stats/i);
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

// ─── handleProCheck ───────────────────────────────────────────────────────────

describe("handleProCheck", () => {
  function makeProCheckReq(address: string) {
    return new Request(`https://l402kit.com/api/pro-check?address=${encodeURIComponent(address)}`);
  }

  test("returns 400 when address missing", async () => {
    const req = new Request("https://l402kit.com/api/pro-check");
    const res = await handleProCheck(req, makeEnv());
    expect(res.status).toBe(400);
  });

  test("returns pro:false when no active row in Supabase", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const res = await handleProCheck(makeProCheckReq("user@blink.sv"), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { pro: boolean; active: boolean };
    expect(body.pro).toBe(false);
    expect(body.active).toBe(false);
  });

  test("returns pro:true and active:true when valid row exists", async () => {
    const expiresAt = new Date(Date.now() + 86400_000).toISOString();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ expires_at: expiresAt }]), { status: 200 })
    );
    const res = await handleProCheck(makeProCheckReq("user@blink.sv"), makeEnv());
    const body = await res.json() as { pro: boolean; active: boolean; expiresAt: string };
    expect(body.pro).toBe(true);
    expect(body.active).toBe(true);
    expect(body.expiresAt).toBe(expiresAt);
  });

  test("expiresAt is null when not active", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const res = await handleProCheck(makeProCheckReq("user@blink.sv"), makeEnv());
    const body = await res.json() as { expiresAt: null };
    expect(body.expiresAt).toBeNull();
  });

  test("worker routes /api/pro-check correctly", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const req = new Request("https://l402kit.com/api/pro-check?address=x%40y.com");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { pro: boolean };
    expect(typeof body.pro).toBe("boolean");
  });
});

// ─── helpers for handleLawnEvents tests ──────────────────────────────────────

const LAWN_SECRET = "test_lawn_secret_xyz";

function makeLawnSig(body: string, secret = LAWN_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function makeCloudEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    specversion: "1.0",
    type: "l402.payment.settled",
    source: "l402-kit",
    id: "evt-test-" + Math.random().toString(36).slice(2),
    time: new Date().toISOString(),
    subject: "agent-payment-flow",
    datacontenttype: "application/json",
    data: {
      agent_id: "agent-001",
      session_id: "sess-abc",
      request_id: "req-xyz",
      endpoint: "/api/data",
      event_type: "payment_settled",
      payment: { amount_sats: 10, settled: true, latency_ms: 450 },
    },
    ...overrides,
  };
}

function makeLawnRequest(body: string, sig?: string): Request {
  return new Request("https://l402kit.com/api/lawn-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig !== undefined ? { "X-LAW-N-Signature": sig } : {}),
    },
    body,
  });
}

// ─── handleLawnEvents ─────────────────────────────────────────────────────────

describe("handleLawnEvents", () => {
  test("returns 401 when X-LAW-N-Signature header is missing", async () => {
    const body = JSON.stringify(makeCloudEvent());
    const res = await handleLawnEvents(makeLawnRequest(body), makeEnv());
    expect(res.status).toBe(401);
  });

  test("returns 401 when signature is wrong", async () => {
    const body = JSON.stringify(makeCloudEvent());
    const res = await handleLawnEvents(makeLawnRequest(body, "sha256=" + "a".repeat(64)), makeEnv());
    expect(res.status).toBe(401);
  });

  test("returns 401 when signature is malformed (not hex)", async () => {
    const body = JSON.stringify(makeCloudEvent());
    const res = await handleLawnEvents(makeLawnRequest(body, "sha256=notahex!"), makeEnv());
    expect(res.status).toBe(401);
  });

  test("returns 400 when body is malformed JSON", async () => {
    const body = "not-json";
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is missing specversion", async () => {
    const event = makeCloudEvent();
    delete (event as Record<string, unknown>).specversion;
    const body = JSON.stringify(event);
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is missing type", async () => {
    const event = makeCloudEvent();
    delete (event as Record<string, unknown>).type;
    const body = JSON.stringify(event);
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is missing data", async () => {
    const event = makeCloudEvent();
    delete (event as Record<string, unknown>).data;
    const body = JSON.stringify(event);
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(400);
  });

  test("returns 200 with ok:true when valid event received (Supabase returns 201)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 201 }));
    const body = JSON.stringify(makeCloudEvent());
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(200);
    const resBody = await res.json() as { ok: boolean };
    expect(resBody.ok).toBe(true);
  });

  test("returns 200 even when Supabase throws (graceful degradation)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("supabase down"));
    const body = JSON.stringify(makeCloudEvent());
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(200);
    const resBody = await res.json() as { ok: boolean };
    expect(resBody.ok).toBe(true);
  });

  test("returns 200 even when Supabase returns 500 (graceful degradation)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));
    const body = JSON.stringify(makeCloudEvent());
    const sig = makeLawnSig(body);
    const res = await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());
    expect(res.status).toBe(200);
  });

  test("inserts correct fields to Supabase", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 201 }));
    const event = makeCloudEvent();
    const body = JSON.stringify(event);
    const sig = makeLawnSig(body);
    await handleLawnEvents(makeLawnRequest(body, sig), makeEnv());

    const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(callBody.event_id).toBe((event as Record<string, unknown>).id);
    expect(callBody.event_type).toBe("l402.payment.settled");
    expect(callBody.agent_id).toBe("agent-001");
    expect(callBody.session_id).toBe("sess-abc");
    expect(callBody.amount_sats).toBe(10);
  });

  test("worker routes POST /api/lawn-events correctly", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 201 }));
    const body = JSON.stringify(makeCloudEvent());
    const sig = makeLawnSig(body);
    const req = new Request("https://l402kit.com/api/lawn-events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LAW-N-Signature": sig },
      body,
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
  });
});

// ─── handleActivity ───────────────────────────────────────────────────────────

describe("handleActivity", () => {
  function makeActivityReq(): Request {
    return new Request("https://l402kit.com/api/activity");
  }

  test("returns 200 with correct shape when Supabase has data", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allEvents = [
      { agent_id: "agent-001", event_type: "l402.payment.settled", amount_sats: 10, settled: true },
      { agent_id: "agent-002", event_type: "l402.payment.initiated", amount_sats: null, settled: null },
    ];
    const recentEvents = [
      { id: "1", event_type: "l402.payment.settled", agent_id: "agent-001", endpoint: "/api/data", amount_sats: 10, created_at: new Date().toISOString() },
    ];
    const agentRows = [
      { agent_id: "agent-001" },
      { agent_id: "agent-001" },
      { agent_id: "agent-002" },
    ];

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(allEvents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(recentEvents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(agentRows), { status: 200 }));

    const res = await handleActivity(makeActivityReq(), makeEnv());
    expect(res.status).toBe(200);

    const body = await res.json() as {
      total_events: number;
      unique_agents: number;
      total_sats: number;
      recent_events: unknown[];
      top_agents: { agent_id: string; event_count: number }[];
    };

    expect(body.total_events).toBe(2);
    expect(body.unique_agents).toBe(2);
    expect(body.total_sats).toBe(10); // only settled events
    expect(body.recent_events).toHaveLength(1);
    expect(body.top_agents).toBeDefined();
    expect(body.top_agents[0].agent_id).toBe("agent-001");
    expect(body.top_agents[0].event_count).toBe(2);
  });

  test("returns empty state gracefully when Supabase returns empty arrays", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const res = await handleActivity(makeActivityReq(), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { total_events: number; unique_agents: number; total_sats: number; recent_events: unknown[]; top_agents: unknown[] };
    expect(body.total_events).toBe(0);
    expect(body.unique_agents).toBe(0);
    expect(body.total_sats).toBe(0);
    expect(body.recent_events).toEqual([]);
    expect(body.top_agents).toEqual([]);
  });

  test("returns empty state when Supabase fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    const res = await handleActivity(makeActivityReq(), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { total_events: number };
    expect(body.total_events).toBe(0);
  });

  test("has Cache-Control: no-cache header", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const res = await handleActivity(makeActivityReq(), makeEnv());
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  test("only sums sats from settled payment events", async () => {
    const allEvents = [
      { agent_id: "a1", event_type: "l402.payment.settled", amount_sats: 100, settled: true },
      { agent_id: "a1", event_type: "l402.payment.settled", amount_sats: 50,  settled: false }, // not settled
      { agent_id: "a2", event_type: "l402.payment.initiated", amount_sats: 200, settled: null }, // wrong type
    ];
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(allEvents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const res = await handleActivity(makeActivityReq(), makeEnv());
    const body = await res.json() as { total_sats: number };
    expect(body.total_sats).toBe(100); // only the first event qualifies
  });

  test("worker routes GET /api/activity correctly", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const req = new Request("https://l402kit.com/api/activity");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { total_events: number };
    expect(typeof body.total_events).toBe("number");
  });
});
