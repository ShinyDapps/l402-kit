/**
 * TDD — VERITY treasury alert system
 *
 * Covers three alert conditions:
 *   budget_low      — spent ≥ 80% of daily budget
 *   budget_exhausted — spent + cost would exceed daily budget
 *   payment_failed  — Blink returned null (wallet empty or error)
 */

import {
  recordAlert,
  getAlerts,
  clearAlert,
  checkBudgetAlert,
  type AlertType,
} from "../verity/alerts";

// ─── KV stub ─────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: unknown) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? "";
      const keys = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name, expiration: undefined, metadata: null }));
      return { keys, list_complete: true, cursor: "" };
    },
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(kv?: KVNamespace) {
  return { demo_preimages: kv ?? makeKV() } as any;
}

// ─── recordAlert ─────────────────────────────────────────────────────────────

describe("recordAlert", () => {
  it("writes a KV entry with verity_alert: prefix", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordAlert("budget_exhausted", "external", { spent: 2000, cost: 100, budget: 2000 }, env);
    const keys = (await kv.list({ prefix: "verity_alert:" })).keys;
    expect(keys.length).toBe(1);
    expect(keys[0].name).toMatch(/^verity_alert:budget_exhausted:external:/);
  });

  it("stores correct JSON payload", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordAlert("payment_failed", "external", { invoice: "lnbc...", error: "NO_ROUTE" }, env);
    const keys = (await kv.list({ prefix: "verity_alert:" })).keys;
    const raw = await kv.get(keys[0].name);
    const parsed = JSON.parse(raw!);
    expect(parsed.type).toBe("payment_failed");
    expect(parsed.rail).toBe("external");
    expect(parsed.details.error).toBe("NO_ROUTE");
    expect(typeof parsed.ts).toBe("string");
  });

  it("does NOT create duplicate entry within same minute", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordAlert("budget_exhausted", "external", { spent: 2000 }, env);
    await recordAlert("budget_exhausted", "external", { spent: 2050 }, env);
    const keys = (await kv.list({ prefix: "verity_alert:budget_exhausted:external:" })).keys;
    expect(keys.length).toBe(1);
  });

  it("creates separate entries for different rails", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordAlert("budget_exhausted", "internal", { spent: 5000 }, env);
    await recordAlert("budget_exhausted", "external", { spent: 2000 }, env);
    const keys = (await kv.list({ prefix: "verity_alert:budget_exhausted:" })).keys;
    expect(keys.length).toBe(2);
  });
});

// ─── getAlerts ────────────────────────────────────────────────────────────────

describe("getAlerts", () => {
  it("returns empty array when no alerts", async () => {
    const alerts = await getAlerts(makeEnv());
    expect(alerts).toEqual([]);
  });

  it("returns all alerts sorted newest first", async () => {
    const env = makeEnv();
    await recordAlert("budget_low", "external", { pct: 82 }, env);
    await recordAlert("payment_failed", "external", { invoice: "lnbc1" }, env);
    const alerts = await getAlerts(env);
    expect(alerts.length).toBe(2);
    expect(alerts.every(a => typeof a.type === "string")).toBe(true);
  });

  it("includes type, rail, ts, details in each alert", async () => {
    const env = makeEnv();
    await recordAlert("budget_low", "internal", { pct: 85 }, env);
    const [alert] = await getAlerts(env);
    expect(alert).toMatchObject({
      type: "budget_low",
      rail: "internal",
      details: { pct: 85 },
    });
    expect(typeof alert.ts).toBe("string");
  });
});

// ─── clearAlert ──────────────────────────────────────────────────────────────

describe("clearAlert", () => {
  it("removes an alert by key", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordAlert("budget_exhausted", "external", { spent: 2000 }, env);
    const before = (await kv.list({ prefix: "verity_alert:" })).keys;
    expect(before.length).toBe(1);
    await clearAlert(before[0].name, env);
    const after = (await kv.list({ prefix: "verity_alert:" })).keys;
    expect(after.length).toBe(0);
  });

  it("is a no-op for non-existent key", async () => {
    await expect(clearAlert("verity_alert:nonexistent", makeEnv())).resolves.not.toThrow();
  });
});

// ─── checkBudgetAlert ────────────────────────────────────────────────────────

describe("checkBudgetAlert", () => {
  it("fires budget_low when spent is exactly 80% of budget", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await checkBudgetAlert("external", 1600, 2000, env); // 80%
    const keys = (await kv.list({ prefix: "verity_alert:budget_low:" })).keys;
    expect(keys.length).toBe(1);
  });

  it("fires budget_low when spent is above 80%", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await checkBudgetAlert("external", 1900, 2000, env); // 95%
    const keys = (await kv.list({ prefix: "verity_alert:budget_low:" })).keys;
    expect(keys.length).toBe(1);
  });

  it("does NOT fire budget_low when spent is below 80%", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await checkBudgetAlert("external", 1500, 2000, env); // 75%
    const keys = (await kv.list({ prefix: "verity_alert:budget_low:" })).keys;
    expect(keys.length).toBe(0);
  });

  it("fires budget_exhausted when spent + cost would exceed budget", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await checkBudgetAlert("external", 1950, 2000, env, 100); // 1950 + 100 > 2000
    const keys = (await kv.list({ prefix: "verity_alert:budget_exhausted:" })).keys;
    expect(keys.length).toBe(1);
  });

  it("does NOT fire budget_exhausted when budget is sufficient", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await checkBudgetAlert("external", 1800, 2000, env, 100); // 1800 + 100 = 1900 ≤ 2000
    const keys = (await kv.list({ prefix: "verity_alert:budget_exhausted:" })).keys;
    expect(keys.length).toBe(0);
  });
});
