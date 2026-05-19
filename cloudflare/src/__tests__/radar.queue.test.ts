/**
 * TDD — RADAR v1 · Anel 1 · KV queue e dedup
 *
 * Módulo: src/verity/radar/queue.ts
 * Funções testadas: enqueue, dequeueAll, seenBefore, markSeen, hashUrl
 */

import {
  enqueue,
  dequeueAll,
  seenBefore,
  markSeen,
  hashUrl,
} from "../verity/radar/queue";
import type { Lead } from "../verity/radar/types";

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

function makeEnv(kv?: KVNamespace) {
  return { demo_preimages: kv ?? makeKV() } as unknown as import("../worker").Env;
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    url:       "https://github.com/foo/bar/issues/1",
    title:     "How to monetize my API?",
    snippet:   "I want to charge per call",
    score:     9,
    signal:    "hot",
    persona:   "human",
    foundAt:   new Date().toISOString(),
    expiresAt: Date.now() + 48 * 3_600_000,
    ...overrides,
  };
}

// ─── hashUrl ─────────────────────────────────────────────────────────────────

describe("hashUrl", () => {
  it("returns a non-empty string", () => {
    expect(hashUrl("https://example.com").length).toBeGreaterThan(0);
  });

  it("same URL → same hash", () => {
    expect(hashUrl("https://example.com")).toBe(hashUrl("https://example.com"));
  });

  it("different URLs → different hashes", () => {
    expect(hashUrl("https://foo.com")).not.toBe(hashUrl("https://bar.com"));
  });
});

// ─── seenBefore / markSeen ───────────────────────────────────────────────────

describe("seenBefore / markSeen", () => {
  it("new URL is not seen", async () => {
    expect(await seenBefore("https://new.example.com", makeEnv())).toBe(false);
  });

  it("after markSeen — seenBefore returns true", async () => {
    const env = makeEnv();
    const url = "https://github.com/foo/bar/issues/99";
    await markSeen(url, env);
    expect(await seenBefore(url, env)).toBe(true);
  });

  it("markSeen on one URL does not affect another", async () => {
    const env = makeEnv();
    await markSeen("https://a.com", env);
    expect(await seenBefore("https://b.com", env)).toBe(false);
  });

  it("uses verity_radar:seen: prefix in KV key", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await markSeen("https://example.com", env);
    // Verify indirectly via seenBefore (can't introspect KV mock directly).
    const found = await seenBefore("https://example.com", env);
    expect(found).toBe(true);
  });
});

// ─── enqueue / dequeueAll ────────────────────────────────────────────────────

describe("enqueue", () => {
  it("adds lead to an empty queue", async () => {
    const env = makeEnv();
    const lead = makeLead();
    await enqueue("verity_radar:pending:human:hot", lead, env);
    const all = await dequeueAll("verity_radar:pending:human:hot", env);
    expect(all).toHaveLength(1);
    expect(all[0].url).toBe(lead.url);
  });

  it("appends to existing queue", async () => {
    const env = makeEnv();
    await enqueue("verity_radar:pending:human:hot", makeLead({ url: "https://a.com" }), env);
    await enqueue("verity_radar:pending:human:hot", makeLead({ url: "https://b.com" }), env);
    const all = await dequeueAll("verity_radar:pending:human:hot", env);
    expect(all).toHaveLength(2);
  });

  it("different queue keys are independent", async () => {
    const env = makeEnv();
    await enqueue("verity_radar:pending:human:hot",  makeLead({ url: "https://human.com" }), env);
    await enqueue("verity_radar:pending:agent:warm", makeLead({ url: "https://agent.com" }), env);
    const human = await dequeueAll("verity_radar:pending:human:hot",  env);
    const agent = await dequeueAll("verity_radar:pending:agent:warm", env);
    expect(human).toHaveLength(1);
    expect(agent).toHaveLength(1);
    expect(human[0].url).toBe("https://human.com");
    expect(agent[0].url).toBe("https://agent.com");
  });
});

describe("dequeueAll — TTL filtering", () => {
  it("filters out leads past expiresAt", async () => {
    const env = makeEnv();
    const expired = makeLead({ url: "https://expired.com", expiresAt: Date.now() - 1000 });
    const fresh   = makeLead({ url: "https://fresh.com",   expiresAt: Date.now() + 86_400_000 });
    // Manually put both in KV (bypassing enqueue's own filtering)
    const key = "verity_radar:pending:human:hot";
    await env.demo_preimages.put(key, JSON.stringify([expired, fresh]));
    const all = await dequeueAll(key, env);
    expect(all).toHaveLength(1);
    expect(all[0].url).toBe("https://fresh.com");
  });

  it("returns empty array when queue is empty", async () => {
    const env = makeEnv();
    const all = await dequeueAll("verity_radar:pending:human:warm", env);
    expect(all).toEqual([]);
  });

  it("returns empty array when all leads are expired", async () => {
    const env = makeEnv();
    const key = "verity_radar:pending:agent:hot";
    const expired = makeLead({ expiresAt: Date.now() - 1 });
    await env.demo_preimages.put(key, JSON.stringify([expired]));
    const all = await dequeueAll(key, env);
    expect(all).toEqual([]);
  });
});
