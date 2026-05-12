/**
 * TDD — RADAR v2 · Anel 3 · cron de ecossistema
 *
 * Módulo: src/verity/cron/ecosystem.ts
 * - Busca npm downloads + GitHub stars/forks
 * - Guarda histórico de 4 semanas no KV
 * - Roda detectAnomaly e persiste relatório
 * - Envia email se anomalia detectada
 */

import { runEcosystemRadar } from "../verity/cron/ecosystem";

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

function makeEnv(kv?: KVNamespace, resend = ""): import("../worker").Env {
  return { demo_preimages: kv ?? makeKV(), RESEND_API_KEY: resend } as unknown as import("../worker").Env;
}

// ─── npm + GitHub fetch mocks ─────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function mockFetch(npmDownloads: number, stars: number, forks: number) {
  fetchCalls = [];
  globalThis.fetch = (url: string | URL | Request): Promise<Response> => {
    const u = url.toString();
    fetchCalls.push(u);
    if (u.includes("api.npmjs.org")) {
      return Promise.resolve(new Response(JSON.stringify({ downloads: npmDownloads }), { status: 200 }));
    }
    if (u.includes("api.github.com/repos")) {
      return Promise.resolve(new Response(JSON.stringify({ stargazers_count: stars, forks_count: forks }), { status: 200 }));
    }
    if (u.includes("resend.com")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "mock" }), { status: 200 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

afterEach(() => { globalThis.fetch = originalFetch; });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runEcosystemRadar", () => {
  it("fetches npm downloads and GitHub stats", async () => {
    mockFetch(5000, 200, 30);
    const env = makeEnv();
    await runEcosystemRadar(env);
    expect(fetchCalls.some(u => u.includes("api.npmjs.org"))).toBe(true);
    expect(fetchCalls.some(u => u.includes("api.github.com"))).toBe(true);
  });

  it("persists ecosystem report to KV", async () => {
    mockFetch(5000, 200, 30);
    const kv = makeKV();
    await runEcosystemRadar(makeEnv(kv));
    const week = weekKey();
    const raw = await kv.get(`verity_radar:ecosystem:${week}`);
    expect(raw).not.toBeNull();
    const report = JSON.parse(raw!);
    expect(report).toHaveProperty("anomalies");
    expect(report).toHaveProperty("timestamp");
  });

  it("persists weekly snapshot for history", async () => {
    mockFetch(5000, 200, 30);
    const kv = makeKV();
    await runEcosystemRadar(makeEnv(kv));
    const week = weekKey();
    const snap = await kv.get(`verity_radar:ecosystem:snapshot:${week}`);
    expect(snap).not.toBeNull();
    const data = JSON.parse(snap!);
    expect(data.npmDownloads).toBe(5000);
    expect(data.githubStars).toBe(200);
    expect(data.githubForks).toBe(30);
  });

  it("no email when no anomaly", async () => {
    mockFetch(1000, 100, 10);
    // Pre-populate 4 weeks of history close to current value → no anomaly
    const week = weekKey();
    const kv = makeKV({
      [`verity_radar:ecosystem:snapshot:${prevWeek(1)}`]: JSON.stringify({ npmDownloads: 950, githubStars: 98,  githubForks: 9  }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(2)}`]: JSON.stringify({ npmDownloads: 900, githubStars: 95,  githubForks: 9  }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(3)}`]: JSON.stringify({ npmDownloads: 980, githubStars: 100, githubForks: 10 }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(4)}`]: JSON.stringify({ npmDownloads: 970, githubStars: 97,  githubForks: 9  }),
    });
    await runEcosystemRadar(makeEnv(kv, "resend-key"));
    const resendCalls = fetchCalls.filter(u => u.includes("resend.com"));
    expect(resendCalls).toHaveLength(0);
  });

  it("sends email when anomaly detected (>25% spike)", async () => {
    mockFetch(5000, 100, 10); // npm 5x spike
    const kv = makeKV({
      [`verity_radar:ecosystem:snapshot:${prevWeek(1)}`]: JSON.stringify({ npmDownloads: 1000, githubStars: 100, githubForks: 10 }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(2)}`]: JSON.stringify({ npmDownloads: 1000, githubStars: 100, githubForks: 10 }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(3)}`]: JSON.stringify({ npmDownloads: 1000, githubStars: 100, githubForks: 10 }),
      [`verity_radar:ecosystem:snapshot:${prevWeek(4)}`]: JSON.stringify({ npmDownloads: 1000, githubStars: 100, githubForks: 10 }),
    });
    await runEcosystemRadar(makeEnv(kv, "resend-key"));
    const resendCalls = fetchCalls.filter(u => u.includes("resend.com"));
    expect(resendCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weekKey(offset = 0): string {
  const now   = new Date(Date.now() - offset * 7 * 86_400_000);
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function prevWeek(n: number): string { return weekKey(n); }
