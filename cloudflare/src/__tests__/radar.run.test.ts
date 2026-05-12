/**
 * TDD — RADAR v1 · runRadar() · integração
 *
 * Módulo: src/verity/cron/radar.ts
 * Testa o fluxo completo do Anel 1 com Serper e GitHub mockados.
 */

import { runRadar } from "../verity/cron/radar";
import { dequeueAll } from "../verity/radar/queue";

// ─── Mocks ────────────────────────────────────────────────────────────────────

let fetchCalls: { url: string; options?: RequestInit }[] = [];
let fetchResponses: Map<string, Response> = new Map();

const originalFetch = globalThis.fetch;

function mockFetch(): void {
  globalThis.fetch = (url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
    const urlStr = url.toString();
    fetchCalls.push({ url: urlStr, options: opts });

    // Serper response
    if (urlStr.includes("serper.dev")) {
      return Promise.resolve(new Response(JSON.stringify({
        organic: [
          {
            title: "How do I charge for my FastAPI endpoint?",
            link:  "https://github.com/foo/bar/issues/42",
            snippet: "I want to monetize my fastapi route using pay per call",
            date: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago
          },
          {
            title: "Add payments to my Express API",
            link:  "https://github.com/baz/qux/issues/7",
            snippet: "Looking to add billing to my express server",
            date: new Date(Date.now() - 5 * 86_400_000).toISOString(), // 5 days ago
          },
          {
            title: "Generic debugging question",
            link:  "https://github.com/other/repo/issues/1",
            snippet: "My async function is not working",
            date: new Date(Date.now() - 1 * 86_400_000).toISOString(),
          },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }

    // GitHub issues API — all open
    if (urlStr.includes("api.github.com")) {
      return Promise.resolve(new Response(JSON.stringify({ state: "open" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }));
    }

    // Resend — accept
    if (urlStr.includes("resend.com")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "mock" }), { status: 200 }));
    }

    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

// ─── KV mock ─────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get:  async (k: string) => store.get(k) ?? null,
    put:  async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(kv?: KVNamespace): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    SERPER_API_KEY: "test-serper-key",
    RESEND_API_KEY: "test-resend-key",
    GITHUB_PAT:     "test-github-pat",
  } as unknown as import("../worker").Env;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = new Map();
  mockFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runRadar — Anel 1", () => {
  it("skips run when no SERPER_API_KEY", async () => {
    const env = makeEnv();
    (env as unknown as Record<string, unknown>).SERPER_API_KEY = "";
    await runRadar(env);
    const humanHot = await dequeueAll("verity_radar:pending:human:hot", env);
    expect(humanHot).toHaveLength(0);
  });

  it("skips run when lock is already held", async () => {
    const kv = makeKV({ "verity_radar:running": "existing-lock" });
    const env = makeEnv(kv);
    await runRadar(env);
    // No Serper calls should happen
    const serperCalls = fetchCalls.filter(c => c.url.includes("serper.dev"));
    expect(serperCalls).toHaveLength(0);
  });

  it("releases lock after run even on errors", async () => {
    const env = makeEnv();
    // Make Serper fail
    globalThis.fetch = () => Promise.reject(new Error("network error"));
    await runRadar(env);
    // Lock must be released
    const lock = await env.demo_preimages.get("verity_radar:running");
    expect(lock).toBeNull();
  });

  it("enqueues hot leads into the correct queue", async () => {
    const env = makeEnv();
    await runRadar(env);
    const humanHot = await dequeueAll("verity_radar:pending:human:hot", env);
    // "how do I charge for my FastAPI" — hot keyword + framework + <7 days → should be hot
    expect(humanHot.length).toBeGreaterThanOrEqual(1);
  });

  it("does not enqueue cold leads", async () => {
    const env = makeEnv();
    await runRadar(env);
    const allQueues = await Promise.all([
      dequeueAll("verity_radar:pending:human:hot",  env),
      dequeueAll("verity_radar:pending:human:warm", env),
      dequeueAll("verity_radar:pending:agent:hot",  env),
      dequeueAll("verity_radar:pending:agent:warm", env),
    ]);
    const allLeads = allQueues.flat();
    // "Generic debugging question" should not be enqueued
    const genericLead = allLeads.find(l => l.title.includes("Generic debugging"));
    expect(genericLead).toBeUndefined();
  });

  it("deduplicates — same URL not enqueued twice", async () => {
    const env = makeEnv();
    await runRadar(env);
    await runRadar(env); // second run
    const humanHot = await dequeueAll("verity_radar:pending:human:hot", env);
    const urls = humanHot.map(l => l.url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it("writes observability log to KV", async () => {
    const env = makeEnv();
    await runRadar(env);
    // Find log key — pattern verity_radar:log:YYYY-MM-DDTHH
    const slot = new Date().toISOString().slice(0, 13);
    const raw = await env.demo_preimages.get(`verity_radar:log:${slot}`);
    expect(raw).not.toBeNull();
    const log = JSON.parse(raw!);
    expect(log).toHaveProperty("found");
    expect(log).toHaveProperty("queued");
    expect(log).toHaveProperty("skipped");
    expect(log).toHaveProperty("errors");
  });

  it("sends email for hot leads when RESEND_API_KEY is set", async () => {
    const env = makeEnv();
    await runRadar(env);
    const resendCalls = fetchCalls.filter(c => c.url.includes("resend.com"));
    // At least one hot lead → at least one email
    const humanHot = await dequeueAll("verity_radar:pending:human:hot", env);
    if (humanHot.length > 0) {
      expect(resendCalls.length).toBeGreaterThanOrEqual(1);
    }
  });
});
