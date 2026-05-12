import type { EcosystemReport } from "./types";

interface MetricHistory {
  history: number[]; // last 4 weeks, oldest first
  current: number;
}

export function detectAnomaly(history: number[], current: number): boolean {
  if (history.length < 4) return false;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  if (avg === 0) return false;
  const change = Math.abs(current - avg) / avg;
  return change > 0.25; // strict > 25%
}

export function buildEcosystemReport(
  metrics: Record<string, MetricHistory>,
): EcosystemReport {
  const anomalies: string[] = [];
  for (const [key, { history, current }] of Object.entries(metrics)) {
    if (detectAnomaly(history, current)) anomalies.push(key);
  }
  return { anomalies, timestamp: new Date().toISOString() };
}
