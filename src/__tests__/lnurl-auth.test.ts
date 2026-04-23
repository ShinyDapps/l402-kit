/**
 * Testes funcionais para /api/lnurl-auth
 *
 * Fluxo real testado:
 *   1. GET ?lightningAddress=  → gera k1 + LNURL, salva no Supabase
 *   2. GET ?tag=login&k1&sig&key → wallet callback: verifica secp256k1, emite token
 *   3. GET ?poll=k1             → cliente faz poll: retorna { verified, token }
 *
 * Mocka fetch (Supabase) — não faz chamadas de rede reais.
 * Usa @noble/curves para gerar assinatura secp256k1 real (simula carteira Lightning).
 */

import { randomBytes } from "crypto";
import { secp256k1 } from "@noble/curves/secp256k1";

type FetchArgs = [string, RequestInit?];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, res: any) => Promise<unknown>;

// ── helpers ───────────────────────────────────────────────────────────────────

function buildReq(query: Record<string, string>, method = "GET") {
  return { method, query, headers: { host: "l402kit.com" } };
}

function buildRes() {
  const calls: { status: number; body: unknown }[] = [];
  const obj = {
    calls,
    setHeader: () => obj,
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

/** Generate a secp256k1 keypair and sign a k1 challenge — simulates a Lightning wallet */
function signChallenge(k1Hex: string) {
  const privKey = randomBytes(32);
  const k1Bytes = Uint8Array.from(Buffer.from(k1Hex, "hex"));
  const sig = secp256k1.sign(k1Bytes, privKey);
  const pubKey = secp256k1.getPublicKey(privKey, true);
  return {
    sig: Buffer.from(sig.toDERRawBytes()).toString("hex"),
    key: Buffer.from(pubKey).toString("hex"),
  };
}

/** Build a mock fetch that responds based on URL/method patterns */
function makeFetchMock(supabaseResponses: Map<string, () => Response>) {
  const calls: FetchArgs[] = [];
  const fn = jest.fn((...args: FetchArgs) => {
    calls.push(args);
    const url = args[0] as string;
    for (const [pattern, factory] of supabaseResponses) {
      if (url.includes(pattern)) return Promise.resolve(factory());
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  return { fn: fn as typeof fetch, calls };
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

// ── Mode 1: challenge generation ──────────────────────────────────────────────

describe("lnurl-auth — Mode 1: challenge generation", () => {
  it("retorna { k1, lnurl } com k1 de 64 chars (32 bytes hex)", async () => {
    const { fn } = makeFetchMock(new Map([
      ["lnurl_challenges", () => new Response(null, { status: 201 })],
    ]));
    global.fetch = fn;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ lightningAddress: "user@blink.sv" });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const body = res.calls[0].body as { k1: string; lnurl: string };
    expect(body.k1).toHaveLength(64);
    expect(body.lnurl).toMatch(/^LNURL/);
  });

  it("LNURL é bech32 encodado com HRP 'lnurl'", async () => {
    const { fn } = makeFetchMock(new Map([
      ["lnurl_challenges", () => new Response(null, { status: 201 })],
    ]));
    global.fetch = fn;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ lightningAddress: "user@blink.sv" });
    const res = buildRes();
    await handler(req as any, res as any);

    const body = res.calls[0].body as { lnurl: string };
    expect(body.lnurl.toUpperCase()).toMatch(/^LNURL1/);
  });

  it("salva k1 no Supabase com expires_at", async () => {
    let insertedBody: unknown;
    const { fn, calls } = makeFetchMock(new Map([
      ["lnurl_challenges", () => new Response(null, { status: 201 })],
    ]));
    global.fetch = jest.fn((...args: FetchArgs) => {
      insertedBody = args[1]?.body ? JSON.parse(args[1].body as string) : null;
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ lightningAddress: "user@blink.sv" });
    const res = buildRes();
    await handler(req as any, res as any);

    const body = insertedBody as Record<string, unknown>;
    expect(body).toHaveProperty("k1");
    expect(body).toHaveProperty("expires_at");
    expect(body.lightning_address).toBe("user@blink.sv");
  });

  it("rejeita requisição sem lightningAddress → 400", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({});
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
  });

  it("k1s gerados são únicos (randomBytes)", async () => {
    const k1s = new Set<string>();
    for (let i = 0; i < 5; i++) {
      jest.resetModules();
      global.fetch = jest.fn(() => Promise.resolve(new Response(null, { status: 201 }))) as typeof fetch;
      const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
      const res = buildRes();
      await handler(buildReq({ lightningAddress: "user@blink.sv" }) as any, res as any);
      k1s.add((res.calls[0].body as { k1: string }).k1);
    }
    expect(k1s.size).toBe(5);
  });
});

// ── Mode 2: wallet callback (secp256k1 verify) ────────────────────────────────

describe("lnurl-auth — Mode 2: wallet callback (LNURL-auth spec)", () => {
  const k1 = randomBytes(32).toString("hex");
  const futureExpiry = new Date(Date.now() + 300_000).toISOString();

  function makeChallengeRow(overrides: Partial<{ expires_at: string; verified: boolean }> = {}) {
    return JSON.stringify([{
      k1,
      expires_at: overrides.expires_at ?? futureExpiry,
      verified: overrides.verified ?? false,
    }]);
  }

  it("aceita assinatura secp256k1 válida → status OK + emite token", async () => {
    const { sig, key } = signChallenge(k1);
    let patched: unknown;
    global.fetch = jest.fn((...args: FetchArgs) => {
      const url = args[0] as string;
      if (url.includes("lnurl_challenges") && args[1]?.method === "PATCH") {
        patched = JSON.parse(args[1].body as string);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (url.includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig, key });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].body as { status: string }).status).toBe("OK");
    expect(patched).toMatchObject({ verified: true, pubkey: key });
    const p = patched as { token: string; token_expires_at: string };
    expect(p.token).toHaveLength(64);
    expect(new Date(p.token_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejeita assinatura inválida (sig adulterada) → 400", async () => {
    const { key } = signChallenge(k1);
    const badSig = randomBytes(71).toString("hex"); // garbage signature

    global.fetch = jest.fn((...args: FetchArgs) => {
      if ((args[0] as string).includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeChallengeRow(), { status: 200 }));
      }
      return Promise.reject(new Error("unexpected"));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig: badSig, key });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
    expect((res.calls[0].body as { status: string }).status).toBe("ERROR");
  });

  it("rejeita challenge expirado → 400", async () => {
    const { sig, key } = signChallenge(k1);
    const pastExpiry = new Date(Date.now() - 1000).toISOString();

    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(makeChallengeRow({ expires_at: pastExpiry }), { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig, key });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
    expect((res.calls[0].body as { reason: string }).reason).toMatch(/expired/i);
  });

  it("rejeita k1 desconhecido → 400", async () => {
    const { sig, key } = signChallenge(k1);
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("[]", { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1: "deadbeef".repeat(8), sig, key });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(400);
    expect((res.calls[0].body as { reason: string }).reason).toMatch(/unknown/i);
  });

  it("callback idempotente: challenge já verificado → 200 OK sem re-emitir", async () => {
    const { sig, key } = signChallenge(k1);
    const patchCalls: unknown[] = [];
    global.fetch = jest.fn((...args: FetchArgs) => {
      if (args[1]?.method === "PATCH") patchCalls.push(args);
      return Promise.resolve(new Response(
        makeChallengeRow({ verified: true }),
        { status: 200 }
      ));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig, key });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    expect(patchCalls).toHaveLength(0); // não re-emite token
  });

  it("rejeita quando faltam k1, sig ou key → 400", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };

    const res1 = buildRes();
    await handler(buildReq({ tag: "login", k1 }) as any, res1 as any);
    expect(res1.calls[0].status).toBe(400);
  });
});

// ── Mode 1 (dashboard): ?dashboard=1 challenge generation ────────────────────

describe("lnurl-auth — Mode 1 (dashboard): ?dashboard=1", () => {
  beforeEach(() => {
    process.env.OWNER_PUBKEY = "03" + "ab".repeat(32); // dummy 33-byte compressed pubkey
  });

  it("gera k1 + LNURL sem exigir lightningAddress", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(null, { status: 201 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ dashboard: "1" });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const body = res.calls[0].body as { k1: string; lnurl: string };
    expect(body.k1).toHaveLength(64);
    expect(body.lnurl).toMatch(/^LNURL/);
  });

  it("salva lightning_address = '__dashboard__' no Supabase", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inserted: any = null;
    global.fetch = jest.fn((...args: FetchArgs) => {
      inserted = JSON.parse(args[1]?.body as string);
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    await handler(buildReq({ dashboard: "1" }) as any, buildRes() as any);

    expect(inserted).not.toBeNull();
    expect(inserted.lightning_address).toBe("__dashboard__");
  });

  it("retorna 500 quando OWNER_PUBKEY não está configurado", async () => {
    delete process.env.OWNER_PUBKEY;
    global.fetch = jest.fn() as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ dashboard: "1" }) as any, res as any);

    expect(res.calls[0].status).toBe(500);
  });

  it("rejeita ?dashboard=1 sem OWNER_PUBKEY — nunca insere no Supabase", async () => {
    delete process.env.OWNER_PUBKEY;
    const fetchCalls: FetchArgs[] = [];
    global.fetch = jest.fn((...a: FetchArgs) => {
      fetchCalls.push(a);
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    await handler(buildReq({ dashboard: "1" }) as any, buildRes() as any);

    expect(fetchCalls).toHaveLength(0);
  });
});

// ── Mode 2 (dashboard): OWNER_PUBKEY enforcement ──────────────────────────────

describe("lnurl-auth — Mode 2 (dashboard): OWNER_PUBKEY enforcement", () => {
  const k1 = randomBytes(32).toString("hex");
  const futureExpiry = new Date(Date.now() + 300_000).toISOString();

  function makeDashboardRow(overrides: Partial<{ expires_at: string; verified: boolean; pubkey: string }> = {}) {
    return JSON.stringify([{
      k1,
      expires_at: overrides.expires_at ?? futureExpiry,
      verified: overrides.verified ?? false,
      lightning_address: "__dashboard__",
    }]);
  }

  it("rejeita wallet diferente do OWNER_PUBKEY → 401", async () => {
    const ownerPriv = randomBytes(32);
    const ownerPub = Buffer.from(secp256k1.getPublicKey(ownerPriv, true)).toString("hex");
    process.env.OWNER_PUBKEY = ownerPub;

    // sign with a DIFFERENT key
    const { sig, key: wrongKey } = signChallenge(k1);

    global.fetch = jest.fn((...args: FetchArgs) => {
      if ((args[0] as string).includes("lnurl_challenges")) {
        return Promise.resolve(new Response(makeDashboardRow(), { status: 200 }));
      }
      return Promise.reject(new Error("unexpected"));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig, key: wrongKey });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(401);
    expect((res.calls[0].body as { reason: string }).reason).toMatch(/not authorized|not the owner/i);
  });

  it("aceita owner wallet com sig válida → 200 OK + token com TTL ~24h", async () => {
    const ownerPriv = randomBytes(32);
    const ownerPub = Buffer.from(secp256k1.getPublicKey(ownerPriv, true)).toString("hex");
    process.env.OWNER_PUBKEY = ownerPub;

    const k1Bytes = Uint8Array.from(Buffer.from(k1, "hex"));
    const sig = Buffer.from(secp256k1.sign(k1Bytes, ownerPriv).toDERRawBytes()).toString("hex");

    let patched: Record<string, unknown> | null = null;
    global.fetch = jest.fn((...args: FetchArgs) => {
      if (args[1]?.method === "PATCH") {
        patched = JSON.parse(args[1].body as string);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(makeDashboardRow(), { status: 200 }));
    }) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const req = buildReq({ tag: "login", k1, sig, key: ownerPub });
    const res = buildRes();
    await handler(req as any, res as any);

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].body as { status: string }).status).toBe("OK");
    expect(patched).not.toBeNull();
    // 24h token: expires_at deve ser ao menos 23h no futuro
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttlMs = new Date((patched as any).token_expires_at as string).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1_000);
  });
});

// ── Mode 3: client poll ───────────────────────────────────────────────────────

describe("lnurl-auth — Mode 3: client poll", () => {
  const k1 = randomBytes(32).toString("hex");
  const futureExpiry = new Date(Date.now() + 600_000).toISOString();

  it("retorna { verified: false } enquanto wallet não assinou", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(
        JSON.stringify([{ verified: false, token: null, token_expires_at: null }]),
        { status: 200 }
      ))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ poll: k1 }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].body as { verified: boolean }).verified).toBe(false);
  });

  it("retorna { verified: true, token } após assinatura", async () => {
    const token = randomBytes(32).toString("hex");
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(
        JSON.stringify([{ verified: true, token, token_expires_at: futureExpiry }]),
        { status: 200 }
      ))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ poll: k1 }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    const body = res.calls[0].body as { verified: boolean; token: string };
    expect(body.verified).toBe(true);
    expect(body.token).toHaveLength(64);
  });

  it("retorna 404 para k1 desconhecido", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("[]", { status: 200 }))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ poll: "unknown_k1" }) as any, res as any);

    expect(res.calls[0].status).toBe(404);
  });

  it("retorna verified: false quando token expirou", async () => {
    const token = randomBytes(32).toString("hex");
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(
        JSON.stringify([{ verified: true, token, token_expires_at: pastExpiry }]),
        { status: 200 }
      ))
    ) as typeof fetch;

    const { default: handler } = await import("../../backend/api/lnurl-auth") as unknown as { default: Handler };
    const res = buildRes();
    await handler(buildReq({ poll: k1 }) as any, res as any);

    expect(res.calls[0].status).toBe(200);
    expect((res.calls[0].body as { verified: boolean }).verified).toBe(false);
  });
});
