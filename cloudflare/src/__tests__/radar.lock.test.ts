/**
 * TDD — RADAR · lock anti-overlap
 *
 * Módulo: src/verity/radar/lock.ts
 * Funções testadas: acquireRadarLock, releaseRadarLock
 *
 * Garante que dois runs simultâneos não colidem.
 * Semântica: mesmo padrão do spendLock mas TTL=60s e chave global.
 */

import { acquireRadarLock, releaseRadarLock } from "../verity/radar/lock";

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

describe("acquireRadarLock", () => {
  it("returns token when no lock exists", async () => {
    const token = await acquireRadarLock(makeEnv());
    expect(token).not.toBeNull();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
  });

  it("returns null when lock already held", async () => {
    const env = makeEnv();
    const first = await acquireRadarLock(env);
    expect(first).not.toBeNull();
    const second = await acquireRadarLock(env);
    expect(second).toBeNull();
  });

  it("uses verity_radar:running as the lock key", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await acquireRadarLock(env);
    const val = await kv.get("verity_radar:running");
    expect(val).not.toBeNull();
  });
});

describe("releaseRadarLock", () => {
  it("releases lock — next acquire succeeds", async () => {
    const env = makeEnv();
    const token = await acquireRadarLock(env);
    expect(token).not.toBeNull();
    await releaseRadarLock(token!, env);
    const next = await acquireRadarLock(env);
    expect(next).not.toBeNull();
  });

  it("does not release when token does not match", async () => {
    const env = makeEnv();
    await acquireRadarLock(env);
    await releaseRadarLock("wrong-token", env);
    const next = await acquireRadarLock(env);
    expect(next).toBeNull(); // still locked
  });
});
