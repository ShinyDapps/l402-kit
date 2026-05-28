/**
 * Validates fixtures/lawn-events.ndjson against the LAW-N CloudEvents 1.0 schema.
 *
 * Why this test exists: the fixture is shared externally (offered to LAW-N partner
 * Peace as a reference parser input). If we drift the schema in code without
 * updating the fixture, partners parsing against it break silently.
 *
 * The fixture must cover ALL 5 event types (sequence-geometry signal for LAW-N).
 */
import * as fs from "fs";
import * as path from "path";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "lawn-events.ndjson");

const REQUIRED_TYPES = new Set([
  "l402.payment.initiated",
  "l402.payment.settled",
  "l402.caveat.violation",
  "l402.budget.exhausted",
  "l402.payment.retry_with_proof",
]);

function loadFixture(): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf-8").trim();
  return raw.split("\n").filter(Boolean).map((line, i) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`Line ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
  });
}

describe("LAW-N events fixture (lawn-events.ndjson)", () => {
  let events: Array<Record<string, unknown>>;

  beforeAll(() => {
    events = loadFixture();
  });

  it("is non-empty and parses as NDJSON", () => {
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("covers all 5 L402EventType values (sequence-geometry coverage)", () => {
    const present = new Set(events.map((e) => e.type as string));
    for (const t of REQUIRED_TYPES) {
      expect(present.has(t)).toBe(true);
    }
  });

  it.each([
    ["specversion", "1.0"],
    ["source", "l402-kit"],
    ["subject", "agent-payment-flow"],
    ["datacontenttype", "application/json"],
  ])("every event has %s == %j", (field, expected) => {
    for (const e of events) {
      expect(e[field]).toBe(expected);
    }
  });

  it("every event has CloudEvents 1.0 required envelope fields", () => {
    for (const e of events) {
      expect(typeof e.id).toBe("string");
      expect((e.id as string).length).toBeGreaterThan(0);
      expect(typeof e.time).toBe("string");
      // ISO 8601 UTC
      expect(e.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      expect(REQUIRED_TYPES.has(e.type as string)).toBe(true);
    }
  });

  it("every event.data has the required L402EventData fields", () => {
    for (const e of events) {
      const d = e.data as Record<string, unknown>;
      expect(typeof d.session_id).toBe("string");
      expect(typeof d.request_id).toBe("string");
      expect(typeof d.endpoint).toBe("string");
      expect(typeof d.event_type).toBe("string");
      // Inner event_type must match the envelope type (consistency)
      expect(d.event_type).toBe(e.type);
    }
  });

  it("agent_id (when present) starts with 'agent:' and is a valid identifier", () => {
    // Convention is `agent:<namespace>.<name>` (e.g. agent:shinydapps.verity) OR
    // single-token agent IDs (e.g. agent:research-node-7 — used in our own
    // src/integrations/law-n-adapter.ts example). Both are accepted in the wild.
    for (const e of events) {
      const d = e.data as Record<string, unknown>;
      if (d.agent_id) {
        expect(d.agent_id).toMatch(/^agent:[a-z0-9._-]+$/i);
      }
    }
  });

  it("settled payments carry both invoice_hash and preimage_hash", () => {
    const settled = events.filter((e) => e.type === "l402.payment.settled");
    expect(settled.length).toBeGreaterThanOrEqual(1);
    for (const e of settled) {
      const p = (e.data as { payment?: Record<string, unknown> }).payment;
      expect(p).toBeDefined();
      expect(typeof p?.invoice_hash).toBe("string");
      expect(typeof p?.preimage_hash).toBe("string");
      expect(p?.settled).toBe(true);
    }
  });

  it("budget.exhausted events flag budget_exhausted: true", () => {
    const exhausted = events.filter((e) => e.type === "l402.budget.exhausted");
    expect(exhausted.length).toBeGreaterThanOrEqual(1);
    for (const e of exhausted) {
      const b = (e.data as { behavior?: Record<string, unknown> }).behavior;
      expect(b?.budget_exhausted).toBe(true);
    }
  });

  it("caveat.violation events carry risk signals (severity/trust/drift)", () => {
    const viol = events.filter((e) => e.type === "l402.caveat.violation");
    expect(viol.length).toBeGreaterThanOrEqual(1);
    for (const e of viol) {
      const risk = (e.data as { risk?: Record<string, unknown> }).risk;
      expect(risk).toBeDefined();
      expect(typeof risk?.severity).toBe("number");
      expect(typeof risk?.trust_score).toBe("number");
      expect(typeof risk?.drift_score).toBe("number");
    }
  });
});
