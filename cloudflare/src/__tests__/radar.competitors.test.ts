/**
 * TDD — RADAR v3 · Anel 4 · Concorrentes
 *
 * Módulo: src/verity/radar/competitors.ts
 * Funções testadas: isCompetitorRelevant, competitorHash
 *
 * Keywords estritas: l402, x402, "lightning micropayment", "pay-per-call api"
 * Falsos positivos excluídos: Stripe, PayPal, Shopify, Square
 * Dedup: TTL 30 dias por hash de competidor
 */

import {
  isCompetitorRelevant,
  competitorHash,
} from "../verity/radar/competitors";

// ─── isCompetitorRelevant ─────────────────────────────────────────────────────

describe("isCompetitorRelevant — keyword matching", () => {
  // Aceita
  it("accepts l402 mention", () => {
    expect(isCompetitorRelevant("l402 api gateway new project")).toBe(true);
  });

  it("accepts x402 mention", () => {
    expect(isCompetitorRelevant("x402 payment protocol launch")).toBe(true);
  });

  it("accepts lightning micropayment", () => {
    expect(isCompetitorRelevant("lightning micropayment api for developers")).toBe(true);
  });

  it("accepts pay-per-call api", () => {
    expect(isCompetitorRelevant("new pay-per-call api monetization tool")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCompetitorRelevant("L402 Implementation Released")).toBe(true);
  });

  // Rejeita falsos positivos
  it("rejects Stripe alone", () => {
    expect(isCompetitorRelevant("stripe payment gateway integration")).toBe(false);
  });

  it("rejects PayPal alone", () => {
    expect(isCompetitorRelevant("paypal checkout integration guide")).toBe(false);
  });

  it("rejects Shopify alone", () => {
    expect(isCompetitorRelevant("shopify payment app development")).toBe(false);
  });

  it("rejects Square alone", () => {
    expect(isCompetitorRelevant("square payments pos system")).toBe(false);
  });

  it("rejects generic payment without keywords", () => {
    expect(isCompetitorRelevant("payment processing api for e-commerce")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isCompetitorRelevant("")).toBe(false);
  });

  // Edge: keyword present but excluded brand also present → keyword wins
  it("l402 wins even if Stripe also mentioned", () => {
    expect(isCompetitorRelevant("l402 alternative to stripe payment gateway")).toBe(true);
  });
});

// ─── competitorHash ───────────────────────────────────────────────────────────

describe("competitorHash", () => {
  it("returns a non-empty string", () => {
    expect(competitorHash("https://competitor.com").length).toBeGreaterThan(0);
  });

  it("same input → same hash", () => {
    expect(competitorHash("https://foo.com")).toBe(competitorHash("https://foo.com"));
  });

  it("different inputs → different hashes", () => {
    expect(competitorHash("https://a.com")).not.toBe(competitorHash("https://b.com"));
  });

  it("produces the KV key for 30-day dedup", () => {
    const h = competitorHash("https://rival.io");
    expect(h).toMatch(/^[a-z0-9]+$/); // alphanumeric — safe KV key segment
  });
});
