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

  describe("CloudEvents 1.0 envelope shape", () => {
    it("emits valid CloudEvents 1.0 envelope on payment.settled", async () => {
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

      const settled = events.find(e => e.type === "l402.payment.settled");
      expect(settled).toBeDefined();
      expect(settled!.specversion).toBe("1.0");
      expect(settled!.source).toBe("l402-kit");
      expect(settled!.subject).toBe("agent-payment-flow");
      expect(settled!.datacontenttype).toBe("application/json");
      expect(settled!.id).toMatch(/^evt_[0-9a-f]{32}$/);
      expect(settled!.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("event.data contains session_id and request_id", async () => {
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

      events.forEach(e => {
        expect(e.data.session_id).toMatch(/^sess_/);
        expect(e.data.request_id).toMatch(/^req_/);
      });
    });

    it("all events in one fetch() share the same session_id and request_id", async () => {
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

      expect(events.length).toBeGreaterThan(1);
      const sessionIds = [...new Set(events.map(e => e.data.session_id))];
      const requestIds = [...new Set(events.map(e => e.data.request_id))];
      expect(sessionIds).toHaveLength(1);
      expect(requestIds).toHaveLength(1);
    });
  });

  describe("event ordering", () => {
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
        onEvent: (e) => order.push(e.data.event_type),
      });

      await client.fetch("https://api.example.com/premium");

      expect(order.indexOf("payment_initiated")).toBeLessThan(order.indexOf("pay"));
      expect(order.indexOf("payment_settled")).toBeGreaterThan(order.indexOf("pay"));
    });
  });

  describe("agentId", () => {
    it("propagates agentId into event.data.agent_id", async () => {
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
      events.forEach(e => expect(e.data.agent_id).toBe("agent:research-node-7"));
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

      events.forEach(e => expect(e.data.agent_id).toBeUndefined());
    });

    it("uses provided sessionId instead of auto-generating", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        sessionId: "sess_custom_abc",
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/premium");

      events.forEach(e => expect(e.data.session_id).toBe("sess_custom_abc"));
    });
  });

  describe("timing metadata", () => {
    it("payment.settled includes timing with client_sent_at and payment_completed_at", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        onEvent: (e) => events.push(e),
      });

      const before = Math.floor(Date.now() / 1000);
      await client.fetch("https://api.example.com/premium");

      const settled = events.find(e => e.type === "l402.payment.settled");
      expect(settled!.data.timing?.client_sent_at).toBeGreaterThanOrEqual(before);
      expect(settled!.data.timing?.payment_completed_at).toBeGreaterThanOrEqual(before);
      expect(settled!.data.payment?.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe("network metadata", () => {
    it("forwards network config into event.data.network", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 200, body: '{"ok":true}' },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        network: { provider: "blink", transport: "lightning", region: "global" },
        onEvent: (e) => events.push(e),
      });

      await client.fetch("https://api.example.com/premium");

      const settled = events.find(e => e.type === "l402.payment.settled");
      expect(settled!.data.network?.provider).toBe("blink");
      expect(settled!.data.network?.transport).toBe("lightning");
    });
  });

  describe("budget_exhausted", () => {
    it("emits l402.budget.exhausted when budget would be exceeded", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body({ price_sats: 500 }) },
      ]) as typeof fetch;

      const events: L402CloudEvent[] = [];
      const client = new L402Client({
        wallet: mockWallet(),
        budgetSats: 100,
        onBudgetExceeded: () => { /* suppress throw for test */ },
        onEvent: (e) => events.push(e),
      });

      try {
        await client.fetch("https://api.example.com/premium");
      } catch {
        // budget exceeded may throw
      }

      const exhausted = events.find(e => e.type === "l402.budget.exhausted");
      expect(exhausted).toBeDefined();
      expect(exhausted!.data.behavior?.budget_exhausted).toBe(true);
    });
  });

  describe("retry_with_proof", () => {
    it("emits l402.payment.retry_with_proof with retry_count", async () => {
      global.fetch = mockFetch([
        { status: 402, body: make402Body() },
        { status: 402, body: make402Body() },
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
        // expected
      }

      const retries = events.filter(e => e.type === "l402.payment.retry_with_proof");
      expect(retries.length).toBeGreaterThanOrEqual(1);
      expect(retries[0].data.behavior?.retry_count).toBeGreaterThanOrEqual(1);
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
});