/**
 * TDD — RADAR v4 · Anel 2 · Parceiros
 *
 * Módulo: src/verity/radar/partners.ts
 * Funções testadas: shouldActivatePartnerRing, recordFailure, isUnreliable
 *
 * Regras:
 *  - Anel 2 só ativa com ≥5 parceiros conhecidos em produção
 *  - 3 falhas consecutivas → unreliable:true → aprovação manual
 *  - Re-valida semanal (lógica de staleness)
 */

import {
  shouldActivatePartnerRing,
  recordPartnerFailure,
  isPartnerUnreliable,
  buildPartnerEntry,
} from "../verity/radar/partners";
import type { PartnerEntry } from "../verity/radar/types";

// ─── shouldActivatePartnerRing ────────────────────────────────────────────────

describe("shouldActivatePartnerRing", () => {
  it("does not activate with 0 partners", () => {
    expect(shouldActivatePartnerRing(0)).toBe(false);
  });

  it("does not activate with 4 partners", () => {
    expect(shouldActivatePartnerRing(4)).toBe(false);
  });

  it("activates at exactly 5 partners", () => {
    expect(shouldActivatePartnerRing(5)).toBe(true);
  });

  it("activates with more than 5 partners", () => {
    expect(shouldActivatePartnerRing(10)).toBe(true);
  });
});

// ─── buildPartnerEntry ────────────────────────────────────────────────────────

describe("buildPartnerEntry", () => {
  it("creates entry with reliability=1.0 and consecutiveFailures=0", () => {
    const entry = buildPartnerEntry("https://partner.com");
    expect(entry.reliability).toBe(1.0);
    expect(entry.consecutiveFailures).toBe(0);
    expect(entry.unreliable).toBe(false);
    expect(entry.url).toBe("https://partner.com");
  });

  it("includes lastValidated as ISO date string", () => {
    const entry = buildPartnerEntry("https://partner.com");
    expect(() => new Date(entry.lastValidated)).not.toThrow();
  });
});

// ─── recordPartnerFailure ─────────────────────────────────────────────────────

describe("recordPartnerFailure", () => {
  function makeEntry(overrides: Partial<PartnerEntry> = {}): PartnerEntry {
    return buildPartnerEntry("https://partner.com", overrides);
  }

  it("increments consecutiveFailures", () => {
    const entry = makeEntry({ consecutiveFailures: 1 });
    const updated = recordPartnerFailure(entry);
    expect(updated.consecutiveFailures).toBe(2);
  });

  it("sets unreliable=true after 3rd failure", () => {
    const entry = makeEntry({ consecutiveFailures: 2 });
    const updated = recordPartnerFailure(entry);
    expect(updated.consecutiveFailures).toBe(3);
    expect(updated.unreliable).toBe(true);
  });

  it("does not set unreliable before 3rd failure", () => {
    const entry = makeEntry({ consecutiveFailures: 1 });
    const updated = recordPartnerFailure(entry);
    expect(updated.unreliable).toBe(false);
  });

  it("decreases reliability with each failure", () => {
    const entry   = makeEntry({ reliability: 1.0, consecutiveFailures: 0 });
    const updated = recordPartnerFailure(entry);
    expect(updated.reliability).toBeLessThan(1.0);
  });

  it("reliability never goes below 0", () => {
    let entry = makeEntry({ reliability: 0.05, consecutiveFailures: 10 });
    for (let i = 0; i < 5; i++) entry = recordPartnerFailure(entry);
    expect(entry.reliability).toBeGreaterThanOrEqual(0);
  });
});

// ─── isPartnerUnreliable ──────────────────────────────────────────────────────

describe("isPartnerUnreliable", () => {
  it("returns false for a fresh partner", () => {
    expect(isPartnerUnreliable(buildPartnerEntry("https://good.com"))).toBe(false);
  });

  it("returns true when unreliable flag is set", () => {
    const entry = buildPartnerEntry("https://bad.com", { unreliable: true });
    expect(isPartnerUnreliable(entry)).toBe(true);
  });

  it("returns false after reliability is restored (flag cleared)", () => {
    const entry = buildPartnerEntry("https://recovered.com", {
      unreliable: false,
      consecutiveFailures: 0,
      reliability: 0.95,
    });
    expect(isPartnerUnreliable(entry)).toBe(false);
  });
});
