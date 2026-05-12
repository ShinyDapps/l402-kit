/**
 * TDD — GET /api/verity/admin/radar
 *
 * Auth: x-dashboard-secret header
 * Retorna: queues (human/agent × hot/warm), log mais recente, stats
 */

import { handleVerity } from "../verity/index";

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

const SECRET = "test-secret";

function makeEnv(kv?: KVNamespace): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    DASHBOARD_SECRET: SECRET,
    SERPER_API_KEY: "",
  } as unknown as import("../worker").Env;
}

function makeReq(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://l402kit.com${path}`, { headers });
}

function lead(url: string, signal: "hot" | "warm", persona: "human" | "agent") {
  return { url, title: "Test", snippet: "", score: signal === "hot" ? 9 : 3, signal, persona, foundAt: new Date().toISOString(), expiresAt: Date.now() + 86_400_000 };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/verity/admin/radar — auth", () => {
  it("returns 401 without secret", async () => {
    const res = await handleVerity(makeReq("/api/verity/admin/radar"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const res = await handleVerity(
      makeReq("/api/verity/admin/radar", { "x-dashboard-secret": "wrong" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct secret", async () => {
    const res = await handleVerity(
      makeReq("/api/verity/admin/radar", { "x-dashboard-secret": SECRET }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe("GET /api/verity/admin/radar — response", () => {
  async function getRadar(kv?: KVNamespace) {
    const res = await handleVerity(
      makeReq("/api/verity/admin/radar", { "x-dashboard-secret": SECRET }),
      makeEnv(kv),
    );
    return res.json() as Promise<Record<string, unknown>>;
  }

  it("has queues, stats, and log fields", async () => {
    const body = await getRadar();
    expect(body).toHaveProperty("queues");
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("log");
  });

  it("queues has 4 keys", async () => {
    const body = await getRadar();
    const queues = body.queues as Record<string, unknown>;
    expect(Object.keys(queues)).toEqual(
      expect.arrayContaining(["human_hot", "human_warm", "agent_hot", "agent_warm"]),
    );
  });

  it("queues are empty arrays when nothing enqueued", async () => {
    const body = await getRadar();
    const queues = body.queues as Record<string, unknown[]>;
    expect(queues.human_hot).toEqual([]);
    expect(queues.human_warm).toEqual([]);
    expect(queues.agent_hot).toEqual([]);
    expect(queues.agent_warm).toEqual([]);
  });

  it("returns leads that are in KV queues", async () => {
    const kv = makeKV({
      "verity_radar:pending:human:hot": JSON.stringify([
        lead("https://github.com/foo/bar/issues/1", "hot", "human"),
      ]),
    });
    const body = await getRadar(kv);
    const queues = body.queues as Record<string, unknown[]>;
    expect(queues.human_hot).toHaveLength(1);
  });

  it("stats.total_queued = sum across all queues", async () => {
    const kv = makeKV({
      "verity_radar:pending:human:hot":  JSON.stringify([lead("https://a.com", "hot",  "human")]),
      "verity_radar:pending:human:warm": JSON.stringify([lead("https://b.com", "warm", "human")]),
      "verity_radar:pending:agent:hot":  JSON.stringify([lead("https://c.com", "hot",  "agent")]),
    });
    const body = await getRadar(kv);
    const stats = body.stats as Record<string, number>;
    expect(stats.total_queued).toBe(3);
  });

  it("stats.hot_total = human_hot + agent_hot count", async () => {
    const kv = makeKV({
      "verity_radar:pending:human:hot": JSON.stringify([lead("https://a.com", "hot", "human"), lead("https://b.com", "hot", "human")]),
      "verity_radar:pending:agent:hot": JSON.stringify([lead("https://c.com", "hot", "agent")]),
    });
    const body = await getRadar(kv);
    const stats = body.stats as Record<string, number>;
    expect(stats.hot_total).toBe(3);
  });

  it("log is null when no run has happened yet", async () => {
    const body = await getRadar();
    expect(body.log).toBeNull();
  });

  it("log contains last run data when available", async () => {
    const slot = new Date().toISOString().slice(0, 13);
    const kv = makeKV({
      [`verity_radar:log:${slot}`]: JSON.stringify({ ts: "2026-05-11T00:00:00Z", found: 40, queued: 30, skipped: 10, errors: 0 }),
    });
    const body = await getRadar(kv);
    expect(body.log).not.toBeNull();
    const log = body.log as Record<string, unknown>;
    expect(log.found).toBe(40);
    expect(log.queued).toBe(30);
  });
});

// ─── DELETE /api/verity/admin/radar/lead ──────────────────────────────────────

describe("DELETE /api/verity/admin/radar/lead — mark acted", () => {
  it("returns 400 without queue param", async () => {
    const res = await handleVerity(
      new Request("https://l402kit.com/api/verity/admin/radar/lead", {
        method: "DELETE",
        headers: { "x-dashboard-secret": SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("removes lead by url from specified queue", async () => {
    const targetUrl = "https://github.com/foo/bar/issues/1";
    const kv = makeKV({
      "verity_radar:pending:human:hot": JSON.stringify([
        lead(targetUrl, "hot", "human"),
        lead("https://github.com/other/repo/issues/2", "hot", "human"),
      ]),
    });
    const env = makeEnv(kv);

    const res = await handleVerity(
      new Request("https://l402kit.com/api/verity/admin/radar/lead", {
        method: "DELETE",
        headers: { "x-dashboard-secret": SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ queue: "human_hot", url: targetUrl }),
      }),
      env,
    );
    expect(res.status).toBe(200);

    // Lead should be gone from queue
    const remaining = JSON.parse(await kv.get("verity_radar:pending:human:hot") ?? "[]") as { url: string }[];
    expect(remaining.find(l => l.url === targetUrl)).toBeUndefined();
    expect(remaining).toHaveLength(1);
  });
});
