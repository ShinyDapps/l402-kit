/**
 * TDD — RADAR v5 · Anel 5 · Síntese 360°
 *
 * Módulo: src/verity/radar/synthesis.ts
 * Funções testadas: normalizeRingScores, buildSynthesis
 *
 * Regras:
 *  - Score normalizado POR anel (0–1), nunca cross-anel
 *  - Síntese agrega todos os anéis em visão unificada
 */

import { normalizeRingScores, buildSynthesis } from "../verity/radar/synthesis";
import type { Lead } from "../verity/radar/types";

// ─── normalizeRingScores ──────────────────────────────────────────────────────

describe("normalizeRingScores", () => {
  it("min score → 0, max score → 1", () => {
    const result = normalizeRingScores([2, 4, 6, 8, 10]);
    expect(result[0]).toBeCloseTo(0);
    expect(result[4]).toBeCloseTo(1);
  });

  it("middle values normalized linearly", () => {
    const result = normalizeRingScores([0, 5, 10]);
    expect(result[1]).toBeCloseTo(0.5);
  });

  it("single item → 1 (not NaN or 0)", () => {
    expect(normalizeRingScores([7])).toEqual([1]);
  });

  it("all-equal items → all 1 (all equally relevant)", () => {
    const result = normalizeRingScores([5, 5, 5]);
    expect(result).toEqual([1, 1, 1]);
  });

  it("returns array of same length as input", () => {
    const scores = [3, 1, 4, 1, 5];
    expect(normalizeRingScores(scores)).toHaveLength(scores.length);
  });

  it("all values between 0 and 1 inclusive", () => {
    const result = normalizeRingScores([1, 7, 3, 9, 2]);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("does NOT mix scores across rings — normalization is per-array", () => {
    // Ring 1 with raw [9] normalizes to [1]
    // Ring 3 with raw [3] normalizes to [1]
    // They're independent — both are "top of their ring"
    expect(normalizeRingScores([9])[0]).toBe(normalizeRingScores([3])[0]);
  });
});

// ─── buildSynthesis ───────────────────────────────────────────────────────────

function makeLead(score: number): Lead {
  return {
    url:       `https://example.com/${score}`,
    title:     "Test lead",
    snippet:   "",
    score,
    signal:    score >= 6 ? "hot" : score >= 3 ? "warm" : "cold",
    persona:   "human",
    foundAt:   new Date().toISOString(),
    expiresAt: Date.now() + 86_400_000,
  };
}

describe("buildSynthesis", () => {
  it("returns a report with all required fields", () => {
    const report = buildSynthesis({
      buyers:      [makeLead(9), makeLead(4)],
      ecosystem:   { anomalies: [], timestamp: new Date().toISOString() },
      competitors: [],
      partners:    [],
    });

    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("rings");
    expect(report).toHaveProperty("topBuyers");
    expect(report).toHaveProperty("summary");
  });

  it("topBuyers are sorted descending by normalized score", () => {
    const report = buildSynthesis({
      buyers:      [makeLead(3), makeLead(9), makeLead(6)],
      ecosystem:   { anomalies: [], timestamp: new Date().toISOString() },
      competitors: [],
      partners:    [],
    });
    const scores = report.topBuyers.map((l: Lead) => l.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1] ?? 0);
  });

  it("summary.totalBuyers equals buyers array length", () => {
    const buyers = [makeLead(9), makeLead(6), makeLead(3)];
    const report = buildSynthesis({
      buyers,
      ecosystem:   { anomalies: [], timestamp: new Date().toISOString() },
      competitors: [],
      partners:    [],
    });
    expect(report.summary.totalBuyers).toBe(buyers.length);
  });

  it("summary.hotBuyers counts only hot leads", () => {
    const buyers = [makeLead(9), makeLead(9), makeLead(3)]; // 2 hot, 1 warm
    const report = buildSynthesis({
      buyers,
      ecosystem:   { anomalies: [], timestamp: new Date().toISOString() },
      competitors: [],
      partners:    [],
    });
    expect(report.summary.hotBuyers).toBe(2);
  });

  it("works with empty buyers", () => {
    const report = buildSynthesis({
      buyers:      [],
      ecosystem:   { anomalies: [], timestamp: new Date().toISOString() },
      competitors: [],
      partners:    [],
    });
    expect(report.summary.totalBuyers).toBe(0);
    expect(report.topBuyers).toEqual([]);
  });
});
