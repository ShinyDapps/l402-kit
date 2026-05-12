import type { Lead, EcosystemReport, SynthesisReport } from "./types";

export function normalizeRingScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 1);
  return scores.map(s => (s - min) / (max - min));
}

interface SynthesisInput {
  buyers:      Lead[];
  ecosystem:   EcosystemReport;
  competitors: unknown[];
  partners:    PartnerSummary[];
}

interface PartnerSummary { url: string }

export function buildSynthesis(input: SynthesisInput): SynthesisReport {
  const { buyers, ecosystem, competitors, partners } = input;

  const hotBuyers  = buyers.filter(l => l.signal === "hot").length;
  const warmBuyers = buyers.filter(l => l.signal === "warm").length;

  const rawScores = buyers.map(l => l.score);
  const normalized = normalizeRingScores(rawScores);
  const scoredBuyers = buyers
    .map((l, i) => ({ ...l, _norm: normalized[i] }))
    .sort((a, b) => b._norm - a._norm)
    .map(({ _norm: _, ...lead }) => lead as Lead);

  return {
    timestamp: new Date().toISOString(),
    rings: {
      buyers:      { total: buyers.length, hot: hotBuyers, warm: warmBuyers },
      ecosystem,
      competitors,
      partners:    partners.length,
    },
    topBuyers: scoredBuyers,
    summary: {
      totalBuyers:    buyers.length,
      hotBuyers,
      hasAnomalies:   ecosystem.anomalies.length > 0,
      newCompetitors: competitors.length,
    },
  };
}
