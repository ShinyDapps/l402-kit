/**
 * Testes funcionais para /api/delete-data
 *
 * Fluxo testado:
 *   POST { lightningAddress, token } → valida token LNURL-auth, revoga token (single-use),
 *   deleta payments + pro_access do usuário no Supabase.
 *
 * Mocka fetch (Supabase) — sem chamadas de rede reais.
 */

import { randomBytes } from "crypto";

type FetchArgs = [string, RequestInit?];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, res: any) => Promise<unknown>;

// ── helpers ───────────────────────────────────────────────────────────────────

function buildReq(body: Record<string, string>, method = "POST") {
  return { method, body, headers: {} };
}

function buildRes() {
  const calls: { status: number; body: unknown }[] = [];
  const obj = {
    calls,
    status(code: number) {
      return {
        json(body: unknown) { calls.push({ status: code, body }); },
        end() { calls.push({ status: code, body: null }); },
      };
    },
    json(body: unknown) { calls.push({ status: 200, body }); },
  };
  return obj;
}

function makeToken() {
  return randomBytes(32).toString("hex"); // 64 hex chars
}

function makeChallengeRow(overrides: Partial<{
  verified: boolean;
  token_expires_at: string;
  lightning_address: string;
}> = {}) {
  return JSON.stringify([{
    verified: overrides.verified ?? true,
    token_expires_at: overrides.token_expires_at ?? new Date(Date.now() + 600_000).toISOString(),
    lightning_address: overrides.lightning_address ?? "user@blink.sv",
  }]);
}

// ── setup / teardown ──────────────────────────────────────────────────────────

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "mock_service_key";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.resetModules();
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("delete-data — input validation", () => {
  it("rejeita método GET → 405", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const req = { method: "GET", body: {}, headers: {} };
    const res = buildRes();
    await handler(req as any, res as any);
    expect(res.calls[0].status).toBe(405);
  });

  it("rejeita sem lightningAddress → 400", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ token: makeToken() }) as any, res as any);
    expect(res.calls[0].status).toBe(400);
  });

  it("rejeita lightningAddress sem @ → 400", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "invalido", token: makeToken() }) as any, res as any);
    expect(res.calls[0].status).toBe(400);
  });

  it("rejeita sem token → 401", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv" }) as any, res as any);
    expect(res.calls[0].status).toBe(401);
  });

  it("rejeita token com comprimento errado → 401", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: "curto" }) as any, res as any);
    expect(res.calls[0].status).toBe(401);
  });
});

// ── Token validation ──────────────────────────────────────────────────────────

describe("delete-data — token validation", () => {
  it("rejeita token inexistente no Supabase → 401", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("[]", { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: makeToken() }) as any, res as any);
    expect(res.calls[0].status).toBe(401);
    expect((res.calls[0].body as { error: string }).error).toMatch(/invalid|unverified/i);
  });

  it("rejeita token não verificado (verified=false) → 401", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(makeChallengeRow({ verified: false }), { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: makeToken() }) as any, res as any);
    expect(res.calls[0].status).toBe(401);
  });

  it("rejeita token expirado → 401", async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(makeChallengeRow({ token_expires_at: pastExpiry }), { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: makeToken() }) as any, res as any);
    expect(res.calls[0].status).toBe(401);
    expect((res.calls[0].body as { error: string }).error).toMatch(/expired/i);
  });
});

// ── Successful deletion ───────────────────────────────────────────────────────

describe("delete-data — successful deletion", () => {
  it("deleta payments e pro_access e retorna contagens", async () => {
    const token = makeToken();
    const patchCalls: FetchArgs[] = [];
    const deleteCalls: FetchArgs[] = [];

    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      const method = args[1]?.method?.toUpperCase();

      if (url.includes("lnurl_challenges") && method === "PATCH") {
        patchCalls.push(args);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      if (method === "DELETE") {
        deleteCalls.push(args);
        if (url.includes("payments")) {
          return Promise.resolve(new Response(JSON.stringify([{}, {}]), { status: 200 }));
        }
        if (url.includes("pro_access")) {
          return Promise.resolve(new Response(JSON.stringify([{}]), { status: 200 }));
        }
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const body = res.calls[0].body as { deleted: { payments: number; proAccess: boolean } };
    expect(body.deleted.payments).toBe(2);
    expect(body.deleted.proAccess).toBe(true);
    expect(deleteCalls).toHaveLength(2);
  });

  it("retorna payments=0 e proAccess=false quando não há dados", async () => {
    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      const method = args[1]?.method?.toUpperCase();

      if (url.includes("lnurl_challenges") && method === "PATCH") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      if (method === "DELETE") {
        return Promise.resolve(new Response("[]", { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: makeToken() }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const body = res.calls[0].body as { deleted: { payments: number; proAccess: boolean } };
    expect(body.deleted.payments).toBe(0);
    expect(body.deleted.proAccess).toBe(false);
  });

  it("normaliza lightningAddress (trim + lowercase) antes de deletar", async () => {
    const deletedAddresses: string[] = [];

    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      const method = args[1]?.method?.toUpperCase();

      if (url.includes("lnurl_challenges") && method === "PATCH") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      if (method === "DELETE") {
        deletedAddresses.push(url);
        return Promise.resolve(new Response("[]", { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "  USER@Blink.SV  ", token: makeToken() }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    deletedAddresses.forEach(url => {
      expect(url).toContain("user%40blink.sv");
    });
  });
});

// ── Single-use enforcement ────────────────────────────────────────────────────

describe("delete-data — single-use token enforcement", () => {
  it("revoga token (PATCH token=null) antes de deletar dados", async () => {
    const token = makeToken();
    const callOrder: string[] = [];

    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      const method = args[1]?.method?.toUpperCase();

      if (url.includes("lnurl_challenges") && method === "PATCH") {
        callOrder.push("revoke");
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        callOrder.push("validate");
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      if (method === "DELETE") {
        callOrder.push("delete");
        return Promise.resolve(new Response("[]", { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ lightningAddress: "user@blink.sv", token }) as any, res as any);

    expect(callOrder[0]).toBe("validate");
    expect(callOrder[1]).toBe("revoke");
    expect(callOrder[2]).toBe("delete"); // delete only after revocation
  });

  it("PATCH token=null contém { token: null } no body", async () => {
    let patchBody: unknown;

    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      const method = args[1]?.method?.toUpperCase();

      if (url.includes("lnurl_challenges") && method === "PATCH") {
        patchBody = JSON.parse(args[1]?.body as string);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      if (method === "DELETE") {
        return Promise.resolve(new Response("[]", { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/delete-data") as unknown as { default: Handler };
    await handler(buildReq({ lightningAddress: "user@blink.sv", token: makeToken() }) as any, buildRes() as any);

    expect(patchBody).toEqual({ token: null });
  });
});
