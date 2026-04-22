/**
 * Testes unitários — /api/resend-webhook
 * Cobre: verificação de assinatura Svix, mapeamento de status,
 * replay protection, e atualização no Supabase.
 */

import { createHmac } from "crypto";

type FetchArgs = [string, RequestInit?];

const MOCK_SECRET = "whsec_" + Buffer.from("testsecret12345678901234567890123456789012").toString("base64");

function buildSvixHeaders(body: unknown, secret: string, opts: { oldTimestamp?: boolean } = {}) {
  const rawSecret = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const id = "msg_test_" + Date.now();
  const ts = opts.oldTimestamp
    ? Math.floor(Date.now() / 1000) - 400
    : Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(body);
  const toSign = `${id}.${ts}.${rawBody}`;
  const sig = createHmac("sha256", rawSecret).update(toSign).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}

function buildRes() {
  const calls: { status: number; body: unknown }[] = [];
  return {
    status(code: number) { return { json(b: unknown) { calls.push({ status: code, body: b }); } }; },
    calls,
  };
}

describe("resend-webhook handler", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "mock_service_key";
    process.env.RESEND_WEBHOOK_SECRET = MOCK_SECRET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("event delivered → atualiza email_status para 'delivered'", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const body = { type: "email.delivered", data: { email_id: "resend_abc123" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET);
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const patchCall = fetchCalls.find(([u]) => (u as string).includes("resend_id=eq.resend_abc123"));
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1]?.body as string);
    expect(patchBody.email_status).toBe("delivered");
  });

  it("event bounced → atualiza email_status para 'bounced'", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const body = { type: "email.bounced", data: { email_id: "resend_xyz" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET);
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const patchBody = JSON.parse(fetchCalls.find(([u]) => (u as string).includes("resend_id"))![1]?.body as string);
    expect(patchBody.email_status).toBe("bounced");
  });

  it("event complained → atualiza email_status para 'complained'", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const body = { type: "email.complained", data: { email_id: "resend_spam" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET);
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    const patchBody = JSON.parse(fetchCalls.find(([u]) => (u as string).includes("resend_id"))![1]?.body as string);
    expect(patchBody.email_status).toBe("complained");
  });

  it("assinatura inválida → 401", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const body = { type: "email.delivered", data: { email_id: "x" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET);
    headers["svix-signature"] = "v1,invalidsig==";

    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("headers Svix ausentes → 400", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers: {}, body: { type: "email.delivered", data: {} } };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("timestamp antigo (> 5min) → 400 (replay protection)", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const body = { type: "email.delivered", data: { email_id: "x" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET, { oldTimestamp: true });

    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
  });

  it("tipo desconhecido → 200 sem chamar Supabase", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const body = { type: "email.unknown_future_event", data: { email_id: "x" } };
    const headers = buildSvixHeaders(body, MOCK_SECRET);
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "POST", headers, body };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const supabaseCalls = fetchCalls.filter(([u]) => (u as string).includes("supabase"));
    expect(supabaseCalls).toHaveLength(0);
  });

  it("GET → 405", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/resend-webhook");
    const req = { method: "GET", headers: {}, body: {} };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(405);
  });
});
