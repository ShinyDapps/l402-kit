import type { PartnerEntry } from "./types";

const ACTIVATION_THRESHOLD = 5;
const FAILURE_RELIABILITY_PENALTY = 0.15;

export function shouldActivatePartnerRing(knownPartners: number): boolean {
  return knownPartners >= ACTIVATION_THRESHOLD;
}

export function buildPartnerEntry(url: string, overrides: Partial<PartnerEntry> = {}): PartnerEntry {
  return {
    url,
    reliability: 1.0,
    consecutiveFailures: 0,
    unreliable: false,
    lastValidated: new Date().toISOString(),
    ...overrides,
  };
}

export function recordPartnerFailure(entry: PartnerEntry): PartnerEntry {
  const consecutiveFailures = entry.consecutiveFailures + 1;
  const reliability = Math.max(0, entry.reliability - FAILURE_RELIABILITY_PENALTY);
  const unreliable = consecutiveFailures >= 3;
  return { ...entry, consecutiveFailures, reliability, unreliable };
}

export function isPartnerUnreliable(entry: PartnerEntry): boolean {
  return entry.unreliable;
}
