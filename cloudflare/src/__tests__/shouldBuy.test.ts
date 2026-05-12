/**
 * TDD — shouldBuy() context-aware economic decision
 * MARGIN_FLOOR = 50 sats (canonical invariant)
 *
 * Contexts:
 *   direct          → floor × 1.0 (baseline, backward-compat)
 *   partner_internal → floor × 0   (callSelf — only budget matters)
 *   partner_external unknown → floor × 2.0
 *   partner_external known   → floor × 1.0
 *   partner_external known + reliability >= 0.9 → floor × 0.8
 *   scout cold  → floor × 1.2
 *   scout warm  → floor × 0.85
 *   scout hot   → floor × 0.7
 *   invoice expired → false regardless of margin
 */

import { shouldBuy, BuyContext } from "../verity/consumer";

const FLOOR = 50;

// ─── baseline (no context) ────────────────────────────────────────────────────

describe("shouldBuy — no context (backward compat)", () => {
  it("returns true when margin >= FLOOR", () => {
    expect(shouldBuy(100, 150)).toBe(true);  // margin = 50
  });

  it("returns false when margin < FLOOR", () => {
    expect(shouldBuy(100, 149)).toBe(false); // margin = 49
  });

  it("returns true on exact floor", () => {
    expect(shouldBuy(0, 50)).toBe(true);     // margin = 50
  });
});

// ─── direct ───────────────────────────────────────────────────────────────────

describe("shouldBuy — direct context", () => {
  const ctx: BuyContext = { type: 'direct' };

  it("same as baseline: margin >= FLOOR passes", () => {
    expect(shouldBuy(100, 150, ctx)).toBe(true);
  });

  it("same as baseline: margin < FLOOR fails", () => {
    expect(shouldBuy(100, 149, ctx)).toBe(false);
  });
});

// ─── partner_internal ─────────────────────────────────────────────────────────

describe("shouldBuy — partner_internal (callSelf)", () => {
  const ctx: BuyContext = { type: 'partner_internal' };

  it("passes even with zero margin (floor × 0)", () => {
    expect(shouldBuy(100, 100, ctx)).toBe(true);
  });

  it("passes with negative cost", () => {
    expect(shouldBuy(0, 0, ctx)).toBe(true);
  });
});

// ─── partner_external ─────────────────────────────────────────────────────────

describe("shouldBuy — partner_external unknown (floor × 2)", () => {
  const ctx: BuyContext = { type: 'partner_external', partner: { known: false } };

  it("requires margin >= 100 sats", () => {
    expect(shouldBuy(0, 100, ctx)).toBe(true);   // margin = 100 = floor×2
    expect(shouldBuy(0, 99, ctx)).toBe(false);    // margin = 99
  });
});

describe("shouldBuy — partner_external known (floor × 1)", () => {
  const ctx: BuyContext = { type: 'partner_external', partner: { known: true, reliability: 0.5 } };

  it("requires margin >= 50 sats", () => {
    expect(shouldBuy(0, 50, ctx)).toBe(true);
    expect(shouldBuy(0, 49, ctx)).toBe(false);
  });
});

describe("shouldBuy — partner_external known + reliability >= 0.9 (floor × 0.8)", () => {
  const ctx: BuyContext = { type: 'partner_external', partner: { known: true, reliability: 0.9 } };

  it("requires margin >= 40 sats", () => {
    expect(shouldBuy(0, 40, ctx)).toBe(true);    // floor × 0.8 = 40
    expect(shouldBuy(0, 39, ctx)).toBe(false);
  });
});

// ─── scout ────────────────────────────────────────────────────────────────────

describe("shouldBuy — scout cold (floor × 1.2)", () => {
  const ctx: BuyContext = { type: 'scout', signal: { strength: 'cold' } };

  it("requires margin >= 60 sats", () => {
    expect(shouldBuy(0, 60, ctx)).toBe(true);    // floor × 1.2 = 60
    expect(shouldBuy(0, 59, ctx)).toBe(false);
  });
});

describe("shouldBuy — scout warm (floor × 0.85)", () => {
  const ctx: BuyContext = { type: 'scout', signal: { strength: 'warm' } };

  it("requires margin >= 43 sats (rounded)", () => {
    expect(shouldBuy(0, 43, ctx)).toBe(true);    // floor × 0.85 = 42.5 → 43
    expect(shouldBuy(0, 42, ctx)).toBe(false);
  });
});

describe("shouldBuy — scout hot (floor × 0.7)", () => {
  const ctx: BuyContext = { type: 'scout', signal: { strength: 'hot' } };

  it("requires margin >= 35 sats", () => {
    expect(shouldBuy(0, 35, ctx)).toBe(true);    // floor × 0.7 = 35
    expect(shouldBuy(0, 34, ctx)).toBe(false);
  });
});

// ─── invoice expiry ───────────────────────────────────────────────────────────

describe("shouldBuy — invoice expiry guard", () => {
  it("rejects if invoice already expired", () => {
    const expiredCtx: BuyContext = {
      type: 'invoice',
      invoice: { expiresAt: Math.floor(Date.now() / 1000) - 1 },
    };
    expect(shouldBuy(0, 10_000, expiredCtx)).toBe(false);
  });

  it("passes if invoice still valid and margin OK", () => {
    const validCtx: BuyContext = {
      type: 'invoice',
      invoice: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    };
    expect(shouldBuy(0, 50, validCtx)).toBe(true);
  });

  it("rejects if invoice valid but margin insufficient", () => {
    const validCtx: BuyContext = {
      type: 'invoice',
      invoice: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    };
    expect(shouldBuy(0, 49, validCtx)).toBe(false);
  });
});
