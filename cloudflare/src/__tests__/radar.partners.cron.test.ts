/**
 * TDD — RADAR v4 · Anel 2 · cron de parceiros
 *
 * Módulo: src/verity/cron/partners.ts
 * - Serper com keywords L402/x402
 * - Filtra l402-kit próprio e resultados irrelevantes
 * - Valida via fetch (HTTP 402 ou header WWW-Authenticate: L402)
 * - Dedup TTL 30 dias
 * - Persiste lista no KV: verity_radar:partners:list
 * - Email quando anel ativa (≥5 parceiros) ou novo parceiro
 * - Re-valida parceiros existentes (falha → recordPartnerFailure)
 */

import { runPartnersRadar } from "../verity/cron/partners";

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get:    async (k: string) => store.get(k) ?? null,
    put:    async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list:   async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(kv?: KVNamespace, serper = "test-key", resend = ""): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    SERPER_API_KEY: serper,
    RESEND_API_KEY: resend,
  } as unknown as import("../worker").Env;
}

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; method?: string; body?: string }[] = [];

interface MockRoute {
  match: string | RegExp;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function mockFetch(serperResults: { title: string; link: string; snippet: string }[], routes: MockRoute[] = []) {
  fetchCalls = [];
  globalThis.fetch = (url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
    const u = url.toString();
    fetchCalls.push({ url: u, method: opts?.method ?? "GET", body: opts?.body as string });

    if (u.includes("serper.dev")) {
      return Promise.resolve(new Response(JSON.stringify({ organic: serperResults }), { status: 200 }));
    }
    if (u.includes("resend.com")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    }

    for (const route of routes) {
      const matches = typeof route.match === "string" ? u.includes(route.match) : route.match.test(u);
      if (matches) {
        return Promise.resolve(
          new Response(route.body ? JSON.stringify(route.body) : null, {
            status: route.status,
            headers: route.headers ?? {},
          }),
        );
      }
    }

    // Default: non-L402 endpoint
    return Promise.resolve(new Response(null, { status: 200 }));
  };
}

afterEach(() => { globalThis.fetch = originalFetch; });

// ─── Startup guards ───────────────────────────────────────────────────────────

describe("runPartnersRadar — startup", () => {
  it("skips when no SERPER_API_KEY", async () => {
    mockFetch([]);
    await runPartnersRadar(makeEnv(undefined, ""));
    expect(fetchCalls).toHaveLength(0);
  });

  it("queries Serper with L402/x402 keywords", async () => {
    mockFetch([]);
    await runPartnersRadar(makeEnv());
    const serperCalls = fetchCalls.filter(c => c.url.includes("serper.dev"));
    expect(serperCalls.length).toBeGreaterThanOrEqual(1);
    const bodies = serperCalls.map(c => c.body ?? "").join(" ");
    expect(bodies.toLowerCase()).toMatch(/l402|x402|lightning/);
  });
});

// ─── Filtering ────────────────────────────────────────────────────────────────

describe("runPartnersRadar — filtering", () => {
  it("ignores l402-kit's own repo", async () => {
    mockFetch([
      { title: "l402-kit middleware", link: "https://github.com/ShinyDapps/l402-kit", snippet: "l402 middleware open source" },
    ]);
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:partners:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list.every((p: { url: string }) => !p.url.includes("ShinyDapps/l402-kit"))).toBe(true);
  });

  it("ignores results without L402-related keywords", async () => {
    mockFetch([
      { title: "A generic REST API library", link: "https://github.com/acme/restlib", snippet: "HTTP client library" },
    ]);
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:partners:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list).toHaveLength(0);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("runPartnersRadar — validation", () => {
  it("adds partner when endpoint returns HTTP 402", async () => {
    mockFetch(
      [{ title: "x402 api gateway", link: "https://github.com/acme/x402-gateway", snippet: "x402 pay-per-call api" }],
      [{ match: "acme/x402-gateway", status: 402, headers: { "WWW-Authenticate": "L402 realm=test" } }],
    );
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:partners:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].url).toContain("x402-gateway");
  });

  it("adds partner when WWW-Authenticate header contains L402", async () => {
    mockFetch(
      [{ title: "l402 payments service", link: "https://api.l402service.io/data", snippet: "l402 micropayment api" }],
      [{ match: "l402service.io", status: 402, headers: { "WWW-Authenticate": "L402 macaroon=abc" } }],
    );
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:partners:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list.some((p: { url: string }) => p.url.includes("l402service.io"))).toBe(true);
  });

  it("does not add partner when endpoint returns 200 (not L402)", async () => {
    mockFetch(
      [{ title: "x402 sdk wrapper", link: "https://github.com/acme/x402-sdk", snippet: "x402 protocol implementation" }],
      [{ match: "acme/x402-sdk", status: 200 }],
    );
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:partners:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list).toHaveLength(0);
  });
});

// ─── Deduplication ───────────────────────────────────────────────────────────

describe("runPartnersRadar — deduplication", () => {
  it("does not add the same partner twice", async () => {
    mockFetch(
      [{ title: "l402 api", link: "https://github.com/acme/l402-api", snippet: "l402 pay per call" }],
      [{ match: "acme/l402-api", status: 402, headers: { "WWW-Authenticate": "L402" } }],
    );
    const kv = makeKV();
    await runPartnersRadar(makeEnv(kv)); // run 1
    await runPartnersRadar(makeEnv(kv)); // run 2 — same URL already seen
    const raw = await kv.get("verity_radar:partners:list");
    const list = JSON.parse(raw!);
    const count = list.filter((p: { url: string }) => p.url.includes("acme/l402-api")).length;
    expect(count).toBe(1);
  });
});

// ─── Ring activation & email ─────────────────────────────────────────────────

describe("runPartnersRadar — ring activation", () => {
  function makeListWith(n: number): string {
    const entries = Array.from({ length: n }, (_, i) => ({
      url: `https://partner${i}.io`,
      reliability: 1.0,
      consecutiveFailures: 0,
      unreliable: false,
      lastValidated: new Date().toISOString(),
      title: `Partner ${i}`,
    }));
    return JSON.stringify(entries);
  }

  it("sends activation email when list reaches exactly 5", async () => {
    // 4 existing + 1 new = 5 → ring activates
    const kv = makeKV({ "verity_radar:partners:list": makeListWith(4) });
    mockFetch(
      [{ title: "l402 new api", link: "https://github.com/acme/fifth-partner", snippet: "l402 micropayment gateway" }],
      [{ match: "fifth-partner", status: 402, headers: { "WWW-Authenticate": "L402" } }],
    );
    await runPartnersRadar(makeEnv(kv, "key", "resend-key"));
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    expect(resendCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(resendCalls[0].body ?? "{}");
    expect(body.subject).toMatch(/anel.*ativ|ring.*activ|parceiro/i);
  });

  it("sends new-partner email when ring already active", async () => {
    // 5 existing partners, new one found
    const kv = makeKV({ "verity_radar:partners:list": makeListWith(5) });
    mockFetch(
      [{ title: "x402 streaming service", link: "https://github.com/acme/x402-stream", snippet: "x402 streaming payments api" }],
      [{ match: "x402-stream", status: 402, headers: { "WWW-Authenticate": "L402" } }],
    );
    await runPartnersRadar(makeEnv(kv, "key", "resend-key"));
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    expect(resendCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("no email when no new partners and ring not yet active", async () => {
    mockFetch([]); // nothing found
    await runPartnersRadar(makeEnv(undefined, "key", "resend-key"));
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    expect(resendCalls).toHaveLength(0);
  });
});
