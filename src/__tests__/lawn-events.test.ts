import { L402Client } from "../client";
import type { L402CloudEvent } from "../types/events";

// ── helpers ───────────────────────────────────────────────────────────────────

const MACAROON = "eyJoYXNoIjoiYWJjMTIzIiwiZXhwIjoxOTk5OTk5OTk5fQ==";
const INVOICE  = "lnbctest1234";
const PREIMAGE = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

function mockWallet(preimage = PREIMAGE) {
  return { payInvoice: jest.fn().mockResolvedValue({ preimage }) };
}

function make402Body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ macaroon: MACAROON, invoice: INVOICE, price_sats: 120, ...overrides });
}

function mockFetch(responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[Math.min(call++, responses.length - 1)];
    const headers = new Headers(r.headers ?? {});
    return Promise.resolve({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers,
      clone: () => ({
        json: () => Promise.resolve(r.body ? JSON.parse(r.body) : {}),
      }),
      json: () => Promise.resolve(r.body ? JSON.parse(r.body) : {}),
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("LAW-N events", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  describe("event shape", () => {
    it("emits a valid CloudEvents 1.0 envelope on payment_settled", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/premium");

      const settled = events.find(e => e.type === "l402.payment_settled");
      expect(settled).toBeDefined();
      expect(settled!.specversion).toBe("1.0");
      expect(settled!.source).toBe("l402-kit");
      expect(settled!.event_id).toMatch(/^[0-9a-f]{32}$/);
      expect(settled!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("emits payment_initiated before paying the invoice", async () => {
      const order: string[] = [];
      const wallet = {
        payInvoice: jest.fn().mockImplementation(async () => {
          order.push("pay");
          return { preimage: PREIMAGE };
        }),
      };

      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const client = new L402Client({
        wallet,
        onEvent: (e) => order.push(e.type),
      });

      await client.fetch("https://api.example.com/premium");

      expect(order.indexOf("l402.payment_initiated")).toBeLessThan(order.indexOf("pay"));
      expect(order.indexOf("l402.payment_settled")).toBeGreaterThan(order.indexOf("pay"));
    });
  });

  describe("agentId", () => {
    it("propagates agentId to emitted events", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        agentId: "agent:research-node-7",
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/premium");

      expect(events.length).toBeGreaterThan(0);
      events.forEach(e => expect(e.agent_id).toBe("agent:research-node-7"));
    });

    it("omits agent_id when agentId is not set", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/premium");

      events.forEach(e => expect(e.agent_id).toBeUndefined());
    });
  });

  describe("budget_exhausted", () => {
    it("emits budget_exhausted instead of throwing when budget would be exceeded", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body({ price_sats: 500 }) },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        budgetSats: 100,
        onBudgetExceeded: () => { /* suppress throw */ },
        onEvent: (e) => events.push(e),
      });

      try {
        await client.fetch("https://api.example.com/premium");
      } catch {
        // budget exceeded may throw — we only care about the event
      }

      const exhausted = events.find(e => e.type === "l402.budget_exhausted");
      expect(exhausted).toBeDefined();
    });
  });

  describe("resilience", () => {
    it("does not break request flow when onEvent throws", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const client = new L402Client({
        wallet: mockWallet(),
        onEvent: () => { throw new Error("hook failure"); },
      });

      const res = await client.fetch("https://api.example.com/premium");
      expect(res.status).toBe(200);
    });

    it("does not emit events when no 402 is encountered", async () => {
      global.fetch = mockFetch([{ status: 200, body: '{"ok":true}' }]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/free");
      expect(events).toHaveLength(0);
    });
  });

  describe("retry_with_proof", () => {
    it("emits retry_with_proof on each retry attempt", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 402, body: make402Body() }, // retry still rejected
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        maxRetries: 1,
        onEvent: (e) => events.push(e),
      });

      try {
        await client.fetch("https://api.example.com/premium");
      } catch {
        // expected: server rejected after retries
      }

      const retries = events.filter(e => e.type === "l402.retry_with_proof");
      expect(retries.length).toBeGreaterThanOrEqual(1);
    });
  });
});