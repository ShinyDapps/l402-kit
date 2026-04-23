/**
 * Testes unitários para a lógica de email do /api/waitlist.
 * Mocka fetch globalmente para isolar Supabase e Resend sem rede real.
 */

type FetchArgs = [string, RequestInit?];

function makeSupabaseOk() {
  return Promise.resolve(
    new Response(JSON.stringify([{ id: "mock-row-id" }]), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function makeSupabase409() {
  return Promise.resolve(new Response(null, { status: 409 }));
}

function makeResendOk() {
  return Promise.resolve(
    new Response(JSON.stringify({ id: "resend_mock_id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildReq(body: unknown, method = "POST"): { method: string; body: unknown } {
  return { method, body };
}

function buildRes() {
  const calls: { status: number; body: unknown }[] = [];
  return {
    status(code: number) {
      return {
        json(body: unknown) {
          calls.push({ status: code, body });
        },
      };
    },
    calls,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("waitlist handler — email dispatch logic", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_ANON_KEY = "mock_key";
    process.env.RESEND_API_KEY = "re_test_mock";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("novo email: Supabase INSERT + Resend chamado", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      const url = args[0] as string;
      if (url.includes("supabase")) return makeSupabaseOk();
      if (url.includes("resend")) return makeResendOk();
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/waitlist");
    const req = { method: "POST", body: { email: "user@example.com" } };
    const res = buildRes();
    await handler(req as any, res as any);

    // aguarda fire-and-forget
    await new Promise((r) => setTimeout(r, 50));

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].body as any).ok).toBe(true);

    const supabasePOST = fetchCalls.filter(([u, o]) => (u as string).includes("supabase") && o?.method === "POST");
    const supabasePATCH = fetchCalls.filter(([u, o]) => (u as string).includes("supabase") && o?.method === "PATCH");
    const resendCalls = fetchCalls.filter(([u]) => (u as string).includes("resend"));
    expect(supabasePOST).toHaveLength(1);   // INSERT email
    expect(resendCalls).toHaveLength(1);     // send email
    expect(supabasePATCH).toHaveLength(1);  // save resend_id

    const resendBody = JSON.parse((resendCalls[0][1]?.body as string) ?? "{}");
    expect(resendBody.to).toBe("user@example.com");
    expect(resendBody.from).toContain("l402kit.com");

    // deve fazer PATCH no Supabase com o resend_id retornado
    await new Promise((r) => setTimeout(r, 100));
    const patchCalls = fetchCalls.filter(
      ([u, opts]) => (u as string).includes("supabase") && opts?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(1);
    const patchBody = JSON.parse(patchCalls[0][1]?.body as string);
    expect(patchBody.resend_id).toBe("resend_mock_id");
    expect(patchBody.email_status).toBe("sending");
  });

  it("email duplicado (409): retorna 200 mas Resend NÃO é chamado", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      const url = args[0] as string;
      if (url.includes("supabase")) return makeSupabase409();
      if (url.includes("resend")) return makeResendOk();
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/waitlist");
    const req = { method: "POST", body: { email: "returning@example.com" } };
    const res = buildRes();
    await handler(req as any, res as any);

    await new Promise((r) => setTimeout(r, 50));

    expect(res.calls[0].status).toBe(200);
    const resendCalls = fetchCalls.filter(([u]) => (u as string).includes("resend"));
    expect(resendCalls).toHaveLength(0);
  });

  it("sem RESEND_API_KEY: retorna 200, não chama Resend", async () => {
    delete process.env.RESEND_API_KEY;

    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      const url = args[0] as string;
      if (url.includes("supabase")) return makeSupabaseOk();
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/waitlist");
    const req = { method: "POST", body: { email: "nokey@example.com" } };
    const res = buildRes();
    await handler(req as any, res as any);

    await new Promise((r) => setTimeout(r, 50));

    expect(res.calls[0].status).toBe(200);
    const resendCalls = fetchCalls.filter(([u]) => (u as string).includes("resend"));
    expect(resendCalls).toHaveLength(0);
  });

  it("email inválido: retorna 400 sem chamar Supabase nem Resend", async () => {
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/waitlist");
    const req = { method: "POST", body: { email: "notanemail" } };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("método GET: retorna 405", async () => {
    global.fetch = jest.fn() as typeof fetch;

    const { default: handler } = await import("../../backend/api/waitlist");
    const req = { method: "GET", body: null };
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
