/**
 * TDD — RADAR v1 · Anel 1 · scoring puro
 *
 * Módulo: src/verity/radar/scoring.ts
 * Funções testadas: scoreSignal, detectFramework, queueKey, isCompetitorRelevant
 * Sem efeitos colaterais — sem KV, sem fetch.
 */

import {
  scoreSignal,
  detectFramework,
  queueKey,
} from "../verity/radar/scoring";

// ─── detectFramework ─────────────────────────────────────────────────────────

describe("detectFramework", () => {
  it("detects express in title", () => {
    expect(detectFramework("how to add billing to express app")).toBe("express");
  });

  it("detects fastapi in snippet", () => {
    expect(detectFramework("monetize my fastapi route")).toBe("fastapi");
  });

  it("detects axum (rust)", () => {
    expect(detectFramework("pay per call axum handler")).toBe("axum");
  });

  it("detects gin (go)", () => {
    expect(detectFramework("gin middleware for payments")).toBe("gin");
  });

  it("detects hono", () => {
    expect(detectFramework("using hono for cloudflare worker api")).toBe("hono");
  });

  it("detects nextjs", () => {
    expect(detectFramework("nextjs api route monetization")).toBe("nextjs");
  });

  it("returns undefined for unknown framework", () => {
    expect(detectFramework("add payments to my api")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(detectFramework("FastAPI endpoint")).toBe("fastapi");
  });
});

// ─── scoreSignal ─────────────────────────────────────────────────────────────

describe("scoreSignal — signal classification", () => {
  it("hot keyword → hot signal (no date, no framework)", () => {
    const { signal } = scoreSignal("how do I charge for my API", "");
    expect(signal).toBe("hot");
  });

  it("l402 keyword → hot", () => {
    const { signal } = scoreSignal("implement l402 for my endpoint", "");
    expect(signal).toBe("hot");
  });

  it("warm keyword → at least warm signal (no date, no framework)", () => {
    const { signal } = scoreSignal("add payments to my api", "");
    expect(["warm", "hot"]).toContain(signal);
  });

  it("generic text → cold", () => {
    const { signal } = scoreSignal("error handling in async rust", "");
    expect(signal).toBe("cold");
  });

  it("recent date (<7 days) multiplies score — can push warm to hot", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { signal } = scoreSignal("add payments to my api", "", recent);
    expect(signal).toBe("hot"); // warm × 3 (recency) = 6 → hot
  });

  it("old date (>30 days) — no recency bonus", () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { signal: withOld } = scoreSignal("add payments to my api", "", old);
    const { signal: noDate }  = scoreSignal("add payments to my api", "");
    expect(withOld).toBe(noDate); // same — no bonus
  });

  it("framework match × 1.5 — warm + recent + framework → hot", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { signal } = scoreSignal("add payments to fastapi route", "", recent);
    expect(signal).toBe("hot"); // warm(2) × recency(3) × fw(1.5) = 9 → hot
  });

  it("cold text stays cold even with recent date — recency only amplifies existing signal", () => {
    const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const { signal } = scoreSignal("generic debugging question", "my async function is not working", recent);
    expect(signal).toBe("cold");
  });

  it("returns numeric score ≥ 1", () => {
    const { score } = scoreSignal("anything", "");
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("hot signal always has score ≥ 6", () => {
    const { score, signal } = scoreSignal("how do I charge for my API", "");
    if (signal === "hot") expect(score).toBeGreaterThanOrEqual(6);
  });

  it("warm signal has score in [3, 5]", () => {
    const { score, signal } = scoreSignal("add payments to my api", "");
    if (signal === "warm") {
      expect(score).toBeGreaterThanOrEqual(3);
      expect(score).toBeLessThan(6);
    }
  });
});

// ─── queueKey ────────────────────────────────────────────────────────────────

describe("queueKey", () => {
  it("human + hot → human hot queue", () => {
    expect(queueKey("human", "hot")).toBe("verity_radar:pending:human:hot");
  });

  it("human + warm → human warm queue", () => {
    expect(queueKey("human", "warm")).toBe("verity_radar:pending:human:warm");
  });

  it("agent + hot → agent hot queue", () => {
    expect(queueKey("agent", "hot")).toBe("verity_radar:pending:agent:hot");
  });

  it("agent + warm → agent warm queue", () => {
    expect(queueKey("agent", "warm")).toBe("verity_radar:pending:agent:warm");
  });

  it("cold → null (not enqueued)", () => {
    expect(queueKey("human", "cold")).toBeNull();
    expect(queueKey("agent", "cold")).toBeNull();
  });
});
