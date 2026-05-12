/**
 * TDD — optimistic spend lock para evitar race condition no budget
 * KV não tem transações — lock otimista reduz janela de race
 */

import { acquireSpendLock, releaseSpendLock } from "../verity/consumer";

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(kv?: KVNamespace) {
  return { demo_preimages: kv ?? makeKV() } as any;
}

describe("acquireSpendLock", () => {
  it("returns token when no lock exists", async () => {
    const token = await acquireSpendLock("external", makeEnv());
    expect(token).not.toBeNull();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(0);
  });

  it("returns null when lock already held", async () => {
    const env = makeEnv();
    const first = await acquireSpendLock("external", env);
    expect(first).not.toBeNull();

    const second = await acquireSpendLock("external", env);
    expect(second).toBeNull();
  });

  it("internal and external locks are independent", async () => {
    const env = makeEnv();
    const ext = await acquireSpendLock("external", env);
    const int = await acquireSpendLock("internal", env);
    expect(ext).not.toBeNull();
    expect(int).not.toBeNull();
  });
});

describe("releaseSpendLock", () => {
  it("releases lock when token matches — next acquire succeeds", async () => {
    const env = makeEnv();
    const token = await acquireSpendLock("external", env);
    expect(token).not.toBeNull();

    await releaseSpendLock("external", token!, env);

    const next = await acquireSpendLock("external", env);
    expect(next).not.toBeNull();
  });

  it("does not release lock when token does not match", async () => {
    const env = makeEnv();
    await acquireSpendLock("external", env);

    await releaseSpendLock("external", "wrong-token", env);

    const next = await acquireSpendLock("external", env);
    expect(next).toBeNull(); // still locked
  });
});
