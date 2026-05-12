/**
 * TDD — RADAR v5 · Anel 5 · GET /api/verity/admin/radar/synthesis
 *
 * Agrega todos os anéis em visão 360°:
 *   - Buyers (Anel 1): filas hot/warm por persona
 *   - Ecosystem (Anel 3): último relatório de anomalias
 *   - Competitors (Anel 4): lista de novos players
 *   - Partners (Anel 2): parceiros conhecidos (vazio por ora)
 * Scores normalizados POR anel (0–1), nunca cross-anel.
 */

import { handleVerity } from "../verity/index";

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

const SECRET = "test-secret";

function makeEnv(kv?: KVNamespace): import("../worker").Env {
  return { demo_preimages: kv ?? makeKV(), DASHBOARD_SECRET: SECRET } as unknown as import("../worker").Env;
}

function lead(url: string, score: number) {
  return { url, title: "Test lead", snippet: "", score, signal: score >= 6 ? "hot" : "warm", persona: "human", foundAt: new Date().toISOString(), expiresAt: Date.now() + 86_400_000 };
}

async function getSynthesis(kv?: KVNamespace) {
  const res = await handleVerity(
    new Request("https://l402kit.com/api/verity/admin/radar/synthesis", {
      headers: { "x-dashboard-secret": SECRET },
    }),
    makeEnv(kv),
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("GET /api/verity/admin/radar/synthesis — auth", () => {
  it("returns 401 without secret", async () => {
    const res = await handleVerity(
      new Request("https://l402kit.com/api/verity/admin/radar/synthesis"),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct secret", async () => {
    const { status } = await getSynthesis();
    expect(status).toBe(200);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe("GET /api/verity/admin/radar/synthesis — shape", () => {
  it("has timestamp, rings, topBuyers, summary", async () => {
    const { body } = await getSynthesis();
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("rings");
    expect(body).toHaveProperty("topBuyers");
    expect(body).toHaveProperty("summary");
  });

  it("rings has buyers, ecosystem, competitors, partners", async () => {
    const { body } = await getSynthesis();
    const rings = body.rings as Record<string, unknown>;
    expect(rings).toHaveProperty("buyers");
    expect(rings).toHaveProperty("ecosystem");
    expect(rings).toHaveProperty("competitors");
    expect(rings).toHaveProperty("partners");
  });

  it("topBuyers sorted descending by score", async () => {
    const kv = makeKV({
      "verity_radar:pending:human:hot":  JSON.stringify([lead("https://a.com", 9), lead("https://b.com", 6)]),
      "verity_radar:pending:human:warm": JSON.stringify([lead("https://c.com", 3)]),
    });
    const { body } = await getSynthesis(kv);
    const buyers = body.topBuyers as { score: number }[];
    expect(buyers.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < buyers.length - 1; i++) {
      expect(buyers[i].score).toBeGreaterThanOrEqual(buyers[i + 1].score);
    }
  });

  it("summary.totalBuyers = all leads across all queues", async () => {
    const kv = makeKV({
      "verity_radar:pending:human:hot":  JSON.stringify([lead("https://a.com", 9)]),
      "verity_radar:pending:agent:warm": JSON.stringify([lead("https://b.com", 3), lead("https://c.com", 3)]),
    });
    const { body } = await getSynthesis(kv);
    const summary = body.summary as Record<string, number>;
    expect(summary.totalBuyers).toBe(3);
  });

  it("ecosystem shows anomalies from latest report", async () => {
    const week = weekKey();
    const kv = makeKV({
      [`verity_radar:ecosystem:${week}`]: JSON.stringify({
        anomalies: ["npmDownloads"],
        timestamp: new Date().toISOString(),
      }),
    });
    const { body } = await getSynthesis(kv);
    const rings = body.rings as Record<string, unknown>;
    const eco = rings.ecosystem as { anomalies: string[] };
    expect(eco.anomalies).toContain("npmDownloads");
  });

  it("competitors list from KV", async () => {
    const kv = makeKV({
      "verity_radar:competitors:list": JSON.stringify([
        { title: "l402 rival", link: "https://rival.io", foundAt: new Date().toISOString() },
      ]),
    });
    const { body } = await getSynthesis(kv);
    const rings = body.rings as Record<string, unknown>;
    expect((rings.competitors as unknown[]).length).toBe(1);
  });

  it("summary.hasAnomalies = true when ecosystem has anomalies", async () => {
    const week = weekKey();
    const kv = makeKV({
      [`verity_radar:ecosystem:${week}`]: JSON.stringify({ anomalies: ["githubStars"], timestamp: new Date().toISOString() }),
    });
    const { body } = await getSynthesis(kv);
    const summary = body.summary as Record<string, unknown>;
    expect(summary.hasAnomalies).toBe(true);
  });
});

function weekKey(): string {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
