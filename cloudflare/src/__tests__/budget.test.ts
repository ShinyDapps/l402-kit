/**
 * TDD — split budget system (internal vs external)
 * internal: callSelf() — no real sats leave treasury
 * external: callExternal() — real Lightning payments
 */

import { getDailyBudget, getDailySpend, recordSpend, calculateBonusBudget } from "../verity/consumer";

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

// ─── getDailyBudget ───────────────────────────────────────────────────────────

describe("getDailyBudget", () => {
  it("internal: returns 5000 default floor when no KV", async () => {
    expect(await getDailyBudget("internal", makeEnv())).toBe(5000);
  });

  it("external: returns 2000 default floor when no KV", async () => {
    expect(await getDailyBudget("external", makeEnv())).toBe(2000);
  });

  it("internal: returns floor + bonus when bonus set", async () => {
    const kv = makeKV({
      "verity_budget:internal:floor": "5000",
      "verity_budget:internal:bonus": "300",
    });
    expect(await getDailyBudget("internal", makeEnv(kv))).toBe(5300);
  });

  it("external: returns floor + bonus when bonus set", async () => {
    const kv = makeKV({
      "verity_budget:external:floor": "500",
      "verity_budget:external:bonus": "700",
    });
    expect(await getDailyBudget("external", makeEnv(kv))).toBe(1200);
  });

  it("respects custom floor from KV", async () => {
    const kv = makeKV({ "verity_budget:internal:floor": "8000" });
    expect(await getDailyBudget("internal", makeEnv(kv))).toBe(8000);
  });
});

// ─── getDailySpend ────────────────────────────────────────────────────────────

describe("getDailySpend", () => {
  it("internal: returns 0 when nothing spent", async () => {
    expect(await getDailySpend("internal", makeEnv())).toBe(0);
  });

  it("external: returns 0 when nothing spent", async () => {
    expect(await getDailySpend("external", makeEnv())).toBe(0);
  });

  it("returns correct amount after recordSpend internal", async () => {
    const env = makeEnv();
    await recordSpend("internal", 400, "self:search", env);
    expect(await getDailySpend("internal", env)).toBe(400);
    expect(await getDailySpend("external", env)).toBe(0); // isolated
  });

  it("returns correct amount after recordSpend external", async () => {
    const env = makeEnv();
    await recordSpend("external", 200, "https://api.example.com", env);
    expect(await getDailySpend("external", env)).toBe(200);
    expect(await getDailySpend("internal", env)).toBe(0); // isolated
  });

  it("accumulates multiple spends independently", async () => {
    const env = makeEnv();
    await recordSpend("internal", 100, "self:search", env);
    await recordSpend("internal", 150, "self:scrape", env);
    await recordSpend("external", 300, "https://api.example.com", env);
    expect(await getDailySpend("internal", env)).toBe(250);
    expect(await getDailySpend("external", env)).toBe(300);
  });
});

// ─── calculateBonusBudget ─────────────────────────────────────────────────────

describe("calculateBonusBudget", () => {
  it("returns zero bonus when no weekly revenue", async () => {
    const result = await calculateBonusBudget(makeEnv());
    expect(result.internal).toBe(0);
    expect(result.external).toBe(0);
  });

  it("splits 10% of weekly revenue: 70% external, 30% internal", async () => {
    const kv = makeKV({ "verity_budget:reinvestment_rate": "0.10" });
    const today = new Date().toISOString().slice(0, 10);
    // Simulate 10000 sats revenue this week via fiscal KV
    const week = getWeekKey();
    kv["put"](`verity_revenue:${week}`, "10000");
    const result = await calculateBonusBudget(makeEnv(kv));
    expect(result.external).toBe(700); // 10000 × 0.10 × 0.70
    expect(result.internal).toBe(300); // 10000 × 0.10 × 0.30
  });

  it("uses custom reinvestment rate", async () => {
    const kv = makeKV({ "verity_budget:reinvestment_rate": "0.20" });
    const week = getWeekKey();
    kv["put"](`verity_revenue:${week}`, "5000");
    const result = await calculateBonusBudget(makeEnv(kv));
    expect(result.external).toBe(700); // 5000 × 0.20 × 0.70
    expect(result.internal).toBe(300); // 5000 × 0.20 × 0.30
  });
});

function getWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
