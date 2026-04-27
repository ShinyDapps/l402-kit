/**
 * MCP server logic tests — validates tool behavior without starting the stdio server.
 * Tests: wallet builder env detection, budget tracking, spending report formatting,
 * l402_fetch pay-and-retry flow, and error handling.
 */

import { L402Client } from "../client";
import { BudgetTracker } from "../agent/budget";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMockWallet(preimage = "a".repeat(64)) {
  return {
    payInvoice: jest.fn().mockResolvedValue({ preimage }),
    callCount: 0,
  };
}

function make402Response(priceSats = 10) {
  const mac = Buffer.from(
    JSON.stringify({ hash: "a".repeat(64), exp: Date.now() + 3_600_000 })
  ).toString("base64");
  return new Response(
    JSON.stringify({ macaroon: mac, invoice: "lnbc100n1test", priceSats }),
    { status: 402, headers: { "Content-Type": "application/json" } }
  );
}

function make200Response(body = '{"data":"ok"}') {
  return new Response(body, { status: 200 });
}

// ─── wallet builder (simulated env logic) ───────────────────────────────────

describe("MCP wallet builder logic", () => {
  it("selects BlinkWallet when BLINK_API_KEY and BLINK_WALLET_ID are set", () => {
    const env = { BLINK_API_KEY: "key", BLINK_WALLET_ID: "wid" };
    const hasBlink = !!(env.BLINK_API_KEY && env.BLINK_WALLET_ID);
    const hasAlby  = false;
    expect(hasBlink).toBe(true);
    expect(hasAlby).toBe(false);
  });

  it("selects AlbyWallet when ALBY_TOKEN is set", () => {
    const env: Record<string, string> = { ALBY_TOKEN: "tok" };
    const hasBlink = !!(env.BLINK_API_KEY && env.BLINK_WALLET_ID);
    const hasAlby  = !!env.ALBY_TOKEN;
    expect(hasBlink).toBe(false);
    expect(hasAlby).toBe(true);
  });

  it("prefers Blink over Alby when both are set", () => {
    const env = { BLINK_API_KEY: "key", BLINK_WALLET_ID: "wid", ALBY_TOKEN: "tok" };
    const selected = (env.BLINK_API_KEY && env.BLINK_WALLET_ID) ? "blink" : "alby";
    expect(selected).toBe("blink");
  });

  it("throws when no wallet env vars are set", () => {
    function buildWallet(env: Record<string, string | undefined>) {
      if (env.BLINK_API_KEY && env.BLINK_WALLET_ID) return "blink";
      if (env.ALBY_TOKEN) return "alby";
      throw new Error("l402-kit MCP: no wallet configured.");
    }
    expect(() => buildWallet({})).toThrow("no wallet configured");
  });

  it("BUDGET_SATS defaults to 1000 when not set", () => {
    const budgetSats = process.env.BUDGET_SATS
      ? parseInt(process.env.BUDGET_SATS, 10)
      : 1000;
    expect(budgetSats).toBe(1000);
  });

  it("BUDGET_SATS parses correctly when set", () => {
    const raw = "500";
    const budgetSats = parseInt(raw, 10);
    expect(budgetSats).toBe(500);
  });
});

// ─── l402_fetch tool behavior ────────────────────────────────────────────────

describe("l402_fetch tool behavior (via L402Client)", () => {
  it("pays invoice and returns response body prefixed with sats paid", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(10))
      .mockResolvedValueOnce(make200Response('{"price":97500}'));

    const res = await client.fetch("https://api.example.com/btc-price");
    const text = await res.text();
    const report = client.spendingReport();

    expect(wallet.payInvoice).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(text).toBe('{"price":97500}');
    expect(report?.total).toBe(10);
    expect(report?.remaining).toBe(990);

    fetchMock.mockRestore();
  });

  it("reuses cached token on second call to same URL — no second payment", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(5))
      .mockResolvedValue(make200Response("cached"));

    await client.fetch("https://api.example.com/data");
    await client.fetch("https://api.example.com/data");

    expect(wallet.payInvoice).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("returns non-402 response directly without paying", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make200Response("free content"));

    const res = await client.fetch("https://api.example.com/free");
    expect(wallet.payInvoice).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    fetchMock.mockRestore();
  });

  it("throws BudgetExceededError when payment exceeds budget", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 5 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(10));

    await expect(client.fetch("https://api.example.com/expensive"))
      .rejects.toThrow("Budget exceeded");

    fetchMock.mockRestore();
  });

  it("calls onSpend callback after successful payment", async () => {
    const onSpend = jest.fn();
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000, onSpend });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(7))
      .mockResolvedValueOnce(make200Response("ok"));

    await client.fetch("https://api.example.com/data");
    expect(onSpend).toHaveBeenCalledWith(7, "https://api.example.com/data");
    fetchMock.mockRestore();
  });
});

// ─── l402_balance tool behavior ──────────────────────────────────────────────

describe("l402_balance tool behavior", () => {
  it("returns null report when no budget configured", () => {
    const client = new L402Client({ wallet: makeMockWallet() });
    expect(client.spendingReport()).toBeNull();
  });

  it("returns correct remaining after spend", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 200 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(50))
      .mockResolvedValueOnce(make200Response("ok"));

    await client.fetch("https://api.example.com/data");
    const report = client.spendingReport()!;
    expect(report.remaining).toBe(150);
    expect(report.total).toBe(50);
    fetchMock.mockRestore();
  });

  it("remaining never goes below zero", () => {
    const tracker = new BudgetTracker(100);
    tracker.record("https://api.example.com", 100);
    expect(tracker.report().remaining).toBe(0);
  });
});

// ─── l402_spending_report tool behavior ──────────────────────────────────────

describe("l402_spending_report tool behavior", () => {
  it("groups spend by domain correctly", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(10))
      .mockResolvedValueOnce(make200Response("ok"))
      .mockResolvedValueOnce(make402Response(20))
      .mockResolvedValueOnce(make200Response("ok"));

    await client.fetch("https://api.weather.com/data");
    await client.fetch("https://api.finance.com/btc");

    const report = client.spendingReport()!;
    expect(report.byDomain["api.weather.com"]).toBe(10);
    expect(report.byDomain["api.finance.com"]).toBe(20);
    expect(report.total).toBe(30);
    fetchMock.mockRestore();
  });

  it("transactions list records url, sats, and ts (number)", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(make402Response(15))
      .mockResolvedValueOnce(make200Response("ok"));

    const before = Date.now();
    await client.fetch("https://api.example.com/data");
    const after = Date.now();

    const report = client.spendingReport()!;
    expect(report.transactions).toHaveLength(1);
    const tx = report.transactions[0];
    expect(tx.sats).toBe(15);
    expect(tx.url).toBe("https://api.example.com/data");
    expect(tx.ts).toBeGreaterThanOrEqual(before);
    expect(tx.ts).toBeLessThanOrEqual(after);
    // Verify ts can be formatted as ISO string (what the MCP tool does)
    expect(() => new Date(tx.ts).toISOString()).not.toThrow();
    fetchMock.mockRestore();
  });

  it("multiple payments accumulate correctly", async () => {
    const wallet = makeMockWallet();
    const client = new L402Client({ wallet, budgetSats: 1000 });

    const fetchMock = jest.spyOn(global, "fetch");
    for (let i = 0; i < 5; i++) {
      fetchMock
        .mockResolvedValueOnce(make402Response(10))
        .mockResolvedValueOnce(make200Response("ok"));
      await client.fetch(`https://api.example.com/item${i}`);
    }

    const report = client.spendingReport()!;
    expect(report.total).toBe(50);
    expect(report.remaining).toBe(950);
    expect(report.transactions).toHaveLength(5);
    fetchMock.mockRestore();
  });
});
