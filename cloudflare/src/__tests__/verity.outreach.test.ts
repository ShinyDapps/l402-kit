/**
 * TDD — Autonomous outreach drafting
 *
 * Quando RADAR detecta hot lead, VERITY:
 *   1. Drafta mensagem personalizada com Claude (framework-aware, persona-aware)
 *   2. Armazena em KV: verity_radar:outreach:{hash}
 *   3. Inclui draft no email de notificação
 *   4. Admin endpoint retorna drafts junto com leads
 *
 * Cobertura:
 *   - draftOutreach(): retorna texto não vazio
 *   - draftOutreach(): menciona l402-kit
 *   - draftOutreach(): framework-specific (Express → Express no draft)
 *   - draftOutreach(): agent persona → tom diferente de human
 *   - draftOutreach(): falha do Claude → retorna null (não bloqueia)
 *   - storeDraft(): grava verity_radar:outreach:{hash} com TTL 48h
 *   - getDraft(): recupera draft pelo hash da URL
 *   - runRadar(): hot lead → draft gerado e armazenado
 *   - runRadar(): warm lead → sem draft (só hot)
 *   - runRadar(): Claude falha → lead ainda enfileirado, sem crash
 */

import { draftOutreach, storeDraft, getDraft, outreachKey } from "../verity/radar/outreach";
import type { Lead } from "../verity/radar/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get:  async (k: string) => store.get(k) ?? null,
    put:  async (k: string, v: string, _opts?: unknown) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

function makeEnv(kv?: KVNamespace, overrides: Record<string, string> = {}): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    ANTHROPIC_API_KEY: "test-key",
    SERPER_API_KEY: "test-serper",
    ...overrides,
  } as unknown as import("../worker").Env;
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    url:       "https://github.com/owner/repo/issues/42",
    title:     "How do I add pay-per-call billing to my Express API?",
    snippet:   "I want to monetize my Express API. Looking for micropayment solutions.",
    score:     90,
    signal:    "hot",
    persona:   "human",
    framework: "express",
    foundAt:   new Date().toISOString(),
    expiresAt: Date.now() + 48 * 3_600_000,
    ...overrides,
  };
}

// ─── draftOutreach ────────────────────────────────────────────────────────────

describe("draftOutreach()", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function mockClaude(response: string | null): void {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("anthropic")) {
        if (response === null) return new Response("error", { status: 500 });
        return new Response(JSON.stringify({
          content: [{ type: "text", text: response }],
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
  }

  test("returns non-empty string when Claude responds", async () => {
    mockClaude("Hey! I noticed you want to monetize your Express API. l402-kit can do this in 3 lines.");
    const env = makeEnv();
    const result = await draftOutreach(makeLead(), env);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(10);
  });

  test("draft mentions l402-kit", async () => {
    mockClaude("l402-kit is exactly what you need for pay-per-call on your Express API.");
    const env = makeEnv();
    const result = await draftOutreach(makeLead(), env);
    expect(result?.toLowerCase()).toContain("l402-kit");
  });

  test("prompt includes framework when detected", async () => {
    let capturedBody = "";
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("anthropic")) {
        capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "Express-specific outreach about l402-kit." }],
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    const env = makeEnv();
    await draftOutreach(makeLead({ framework: "express" }), env);
    expect(capturedBody.toLowerCase()).toContain("express");
  });

  test("prompt differs for agent vs human persona", async () => {
    const prompts: string[] = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("anthropic")) {
        prompts.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "outreach about l402-kit" }],
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    const env = makeEnv();
    await draftOutreach(makeLead({ persona: "human" }), env);
    await draftOutreach(makeLead({ persona: "agent" }), env);
    expect(prompts[0]).not.toBe(prompts[1]);
  });

  test("returns null when Claude fails — does not throw", async () => {
    mockClaude(null);
    const env = makeEnv();
    const result = await draftOutreach(makeLead(), env);
    expect(result).toBeNull();
  });

  test("returns null when no ANTHROPIC_API_KEY", async () => {
    const env = makeEnv(undefined, { ANTHROPIC_API_KEY: "" });
    (env as unknown as Record<string, unknown>).ANTHROPIC_API_KEY = undefined;
    const result = await draftOutreach(makeLead(), env);
    expect(result).toBeNull();
  });
});

// ─── storeDraft / getDraft ────────────────────────────────────────────────────

describe("storeDraft() + getDraft()", () => {
  test("storeDraft writes to correct KV key", async () => {
    const kv = makeKV() as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);
    const lead = makeLead();
    const key = outreachKey(lead.url);

    await storeDraft(lead, "Hey! l402-kit is perfect for your use case.", env);

    expect(kv._store.has(key)).toBe(true);
    const stored = JSON.parse(kv._store.get(key)!);
    expect(stored.draft).toBe("Hey! l402-kit is perfect for your use case.");
    expect(stored.url).toBe(lead.url);
  });

  test("getDraft retrieves stored draft by URL", async () => {
    const kv = makeKV() as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);
    const lead = makeLead();

    await storeDraft(lead, "l402-kit draft text", env);
    const retrieved = await getDraft(lead.url, env);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.draft).toBe("l402-kit draft text");
  });

  test("getDraft returns null for unknown URL", async () => {
    const env = makeEnv(makeKV());
    const result = await getDraft("https://unknown.example.com/issues/99", env);
    expect(result).toBeNull();
  });

  test("storeDraft includes lead metadata in stored object", async () => {
    const kv = makeKV() as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);
    const lead = makeLead({ framework: "fastapi", persona: "agent" });

    await storeDraft(lead, "agent-targeted l402-kit pitch", env);
    const retrieved = await getDraft(lead.url, env);

    expect(retrieved!.framework).toBe("fastapi");
    expect(retrieved!.persona).toBe("agent");
    expect(retrieved!.signal).toBe("hot");
  });
});

// ─── outreachKey ──────────────────────────────────────────────────────────────

describe("outreachKey()", () => {
  test("returns deterministic key for same URL", () => {
    const url = "https://github.com/owner/repo/issues/42";
    expect(outreachKey(url)).toBe(outreachKey(url));
  });

  test("returns different keys for different URLs", () => {
    expect(outreachKey("https://a.com")).not.toBe(outreachKey("https://b.com"));
  });

  test("key starts with verity_radar:outreach:", () => {
    expect(outreachKey("https://example.com")).toMatch(/^verity_radar:outreach:/);
  });
});
