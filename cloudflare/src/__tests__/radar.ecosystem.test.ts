/**
 * TDD — RADAR v2 · Anel 3 · Ecossistema
 *
 * Módulo: src/verity/radar/ecosystem.ts
 * Funções testadas: detectAnomaly, buildEcosystemReport
 *
 * Regra: anomalia = desvio >25% vs média de 4 semanas anteriores.
 * Nunca usa a semana anterior isolada — evita sazonalidade.
 */

import { detectAnomaly, buildEcosystemReport } from "../verity/radar/ecosystem";

// ─── detectAnomaly ────────────────────────────────────────────────────────────

describe("detectAnomaly", () => {
  it("no anomaly when current ≤ 125% of 4-week avg", () => {
    // avg = 100, current = 124 → +24% → no anomaly
    expect(detectAnomaly([100, 100, 100, 100], 124)).toBe(false);
  });

  it("anomaly when current > 125% of 4-week avg", () => {
    // avg = 100, current = 126 → +26% → anomaly
    expect(detectAnomaly([100, 100, 100, 100], 126)).toBe(true);
  });

  it("anomaly when current < 75% of 4-week avg (drop)", () => {
    // avg = 100, current = 74 → -26% → anomaly
    expect(detectAnomaly([100, 100, 100, 100], 74)).toBe(true);
  });

  it("no anomaly at exactly -25% (boundary)", () => {
    // avg = 100, current = 75 → -25% → not an anomaly (threshold is strict >)
    expect(detectAnomaly([100, 100, 100, 100], 75)).toBe(false);
  });

  it("uses 4-week average — spike in one week does not inflate baseline", () => {
    // If week 4 was a spike, average = (100+100+100+200)/4 = 125
    // current = 130 → +4% vs avg → no anomaly
    expect(detectAnomaly([100, 100, 100, 200], 130)).toBe(false);
  });

  it("handles zero average gracefully (returns false — no anomaly on no data)", () => {
    expect(detectAnomaly([0, 0, 0, 0], 10)).toBe(false);
  });

  it("requires exactly 4 weeks of history", () => {
    // With fewer than 4 weeks, we cannot compute a reliable baseline → no anomaly
    expect(detectAnomaly([100, 100], 200)).toBe(false);
  });
});

// ─── buildEcosystemReport ─────────────────────────────────────────────────────

describe("buildEcosystemReport", () => {
  it("returns a report with all required fields", () => {
    const report = buildEcosystemReport({
      npmDownloads:   { history: [1000, 1200, 1100, 1050], current: 1800 },
      githubStars:    { history: [500, 520, 510, 505],     current: 600 },
      githubForks:    { history: [50, 52, 51, 50],         current: 55 },
    });
    expect(report).toHaveProperty("anomalies");
    expect(report).toHaveProperty("timestamp");
    expect(Array.isArray(report.anomalies)).toBe(true);
  });

  it("lists anomalous metrics in the anomalies array", () => {
    const report = buildEcosystemReport({
      npmDownloads: { history: [1000, 1000, 1000, 1000], current: 2000 }, // +100% → anomaly
      githubStars:  { history: [500, 500, 500, 500],     current: 510  }, // +2% → normal
      githubForks:  { history: [50, 50, 50, 50],         current: 51   }, // +2% → normal
    });
    expect(report.anomalies).toContain("npmDownloads");
    expect(report.anomalies).not.toContain("githubStars");
  });

  it("empty anomalies array when nothing is anomalous", () => {
    const report = buildEcosystemReport({
      npmDownloads: { history: [1000, 1000, 1000, 1000], current: 1010 },
      githubStars:  { history: [500,  500,  500,  500],  current: 510  },
      githubForks:  { history: [50,   50,   50,   50],   current: 51   },
    });
    expect(report.anomalies).toHaveLength(0);
  });
});
