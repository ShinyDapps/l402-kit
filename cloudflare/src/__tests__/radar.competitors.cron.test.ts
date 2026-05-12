/**
 * TDD — RADAR v3 · Anel 4 · cron de concorrentes
 *
 * Módulo: src/verity/cron/competitors.ts
 * - Serper com keywords estritas (l402, x402, lightning micropayment, pay-per-call api)
 * - Filtra com isCompetitorRelevant
 * - Dedup TTL 30 dias por competitorHash
 * - Persiste lista de novos concorrentes no KV
 * - Email se novo concorrente relevante
 */

import { runCompetitorsRadar } from "../verity/cron/competitors";

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
  return { demo_preimages: kv ?? makeKV(), SERPER_API_KEY: serper, RESEND_API_KEY: resend } as unknown as import("../worker").Env;
}

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; body?: string }[] = [];

function mockFetch(results: { title: string; link: string; snippet: string }[]) {
  fetchCalls = [];
  globalThis.fetch = (url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
    const u = url.toString();
    fetchCalls.push({ url: u, body: opts?.body as string });
    if (u.includes("serper.dev")) {
      return Promise.resolve(new Response(JSON.stringify({ organic: results }), { status: 200 }));
    }
    if (u.includes("resend.com")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

afterEach(() => { globalThis.fetch = originalFetch; });

describe("runCompetitorsRadar", () => {
  it("skips when no SERPER_API_KEY", async () => {
    const env = makeEnv(undefined, "");
    await runCompetitorsRadar(env);
    expect(fetchCalls).toHaveLength(0);
  });

  it("calls Serper with competitor keywords", async () => {
    mockFetch([]);
    await runCompetitorsRadar(makeEnv());
    const serperCalls = fetchCalls.filter(c => c.url.includes("serper.dev"));
    expect(serperCalls.length).toBeGreaterThanOrEqual(1);
    // Keywords like l402 or x402 must be in at least one query body
    const bodies = serperCalls.map(c => c.body ?? "").join(" ");
    expect(bodies.toLowerCase()).toMatch(/l402|x402|lightning micropayment/);
  });

  it("filters out irrelevant results (Stripe, PayPal, etc.)", async () => {
    mockFetch([
      { title: "Stripe payment gateway", link: "https://stripe.com", snippet: "Accept payments online" },
      { title: "PayPal checkout",        link: "https://paypal.com", snippet: "Pay with PayPal" },
    ]);
    const kv = makeKV();
    await runCompetitorsRadar(makeEnv(kv, "key", "resend-key"));
    const raw = await kv.get("verity_radar:competitors:list");
    const list = raw ? JSON.parse(raw) : [];
    expect(list).toHaveLength(0);
  });

  it("stores relevant competitor in KV", async () => {
    mockFetch([
      { title: "New l402 gateway launched", link: "https://l402rival.io", snippet: "l402 pay-per-call api gateway" },
    ]);
    const kv = makeKV();
    await runCompetitorsRadar(makeEnv(kv));
    const raw = await kv.get("verity_radar:competitors:list");
    expect(raw).not.toBeNull();
    const list = JSON.parse(raw!);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].link).toBe("https://l402rival.io");
  });

  it("deduplicates — same URL not stored twice", async () => {
    const rival = { title: "x402 micropayment tool", link: "https://x402tool.com", snippet: "x402 protocol api" };
    mockFetch([rival]);
    const kv = makeKV();
    await runCompetitorsRadar(makeEnv(kv)); // run 1
    await runCompetitorsRadar(makeEnv(kv)); // run 2
    const raw = await kv.get("verity_radar:competitors:list");
    const list = JSON.parse(raw!);
    const count = list.filter((c: { link: string }) => c.link === "https://x402tool.com").length;
    expect(count).toBe(1);
  });

  it("sends email when new competitor found and RESEND_API_KEY set", async () => {
    mockFetch([
      { title: "lightning micropayment startup", link: "https://newplayer.io", snippet: "lightning micropayment api gateway" },
    ]);
    await runCompetitorsRadar(makeEnv(undefined, "key", "resend-key"));
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    expect(resendCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("no email when no new competitor", async () => {
    mockFetch([]);
    await runCompetitorsRadar(makeEnv(undefined, "key", "resend-key"));
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    expect(resendCalls).toHaveLength(0);
  });
});
