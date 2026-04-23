import { createHmac, randomBytes } from "crypto";
import { buildSignatureHeader, verifyWebhook, sendWebhook } from "../webhook";
import type { WebhookEvent } from "../webhook";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: randomBytes(16).toString("hex"),
    type: "payment.received",
    created: Math.floor(Date.now() / 1000),
    data: {
      endpoint: "/premium",
      amountSats: 100,
      preimage: randomBytes(32).toString("hex"),
      paymentHash: randomBytes(32).toString("hex"),
      ownerAddress: "you@yourdomain.com",
    },
    ...overrides,
  };
}

function sign(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

// ─── buildSignatureHeader ────────────────────────────────────────────────────

describe("buildSignatureHeader", () => {
  it("returns t= and v1= components", () => {
    const sig = buildSignatureHeader("secret", 1000, "body");
    expect(sig).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
  });

  it("produces deterministic HMAC for same inputs", () => {
    const a = buildSignatureHeader("sec", 42, "payload");
    const b = buildSignatureHeader("sec", 42, "payload");
    expect(a).toBe(b);
  });

  it("differs for different secrets", () => {
    const a = buildSignatureHeader("sec1", 1, "body");
    const b = buildSignatureHeader("sec2", 1, "body");
    expect(a).not.toBe(b);
  });
});

// ─── verifyWebhook ────────────────────────────────────────────────────────────

describe("verifyWebhook", () => {
  const SECRET = "test_secret_32_bytes_xxxxxxxxxxxx";

  function validRequest(event = makeEvent(), toleranceSecs = 300) {
    const body = JSON.stringify(event);
    const now = Math.floor(Date.now() / 1000);
    const sig = sign(SECRET, now, body);
    return { body, sig, now, toleranceSecs };
  }

  it("returns parsed event for valid signature", () => {
    const event = makeEvent();
    const { body, sig } = validRequest(event);
    const result = verifyWebhook(SECRET, body, sig);
    expect(result.type).toBe("payment.received");
    expect(result.data.amountSats).toBe(100);
  });

  it("throws on missing signature header", () => {
    expect(() => verifyWebhook(SECRET, "{}", "")).toThrow("Missing l402-signature");
  });

  it("throws on wrong secret", () => {
    const { body, sig } = validRequest();
    expect(() => verifyWebhook("wrong_secret", body, sig)).toThrow("signature mismatch");
  });

  it("throws on tampered body", () => {
    const { sig } = validRequest();
    const tamperedBody = JSON.stringify(makeEvent({ data: { endpoint: "/evil", amountSats: 999999, preimage: "x", paymentHash: "y", ownerAddress: "attacker@evil.com" } }));
    expect(() => verifyWebhook(SECRET, tamperedBody, sig)).toThrow("signature mismatch");
  });

  it("throws when timestamp is too old (beyond tolerance)", () => {
    const event = makeEvent();
    const body = JSON.stringify(event);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago
    const sig = sign(SECRET, oldTimestamp, body);
    expect(() => verifyWebhook(SECRET, body, sig, 300)).toThrow("too old");
  });

  it("accepts timestamps within tolerance window", () => {
    const event = makeEvent();
    const body = JSON.stringify(event);
    const recentTimestamp = Math.floor(Date.now() / 1000) - 100;
    const sig = sign(SECRET, recentTimestamp, body);
    expect(() => verifyWebhook(SECRET, body, sig, 300)).not.toThrow();
  });

  it("throws on missing v1 component", () => {
    const { body } = validRequest();
    const malformedSig = `t=${Math.floor(Date.now() / 1000)}`;
    expect(() => verifyWebhook(SECRET, body, malformedSig)).toThrow("missing v1");
  });

  it("throws on invalid JSON body", () => {
    const now = Math.floor(Date.now() / 1000);
    const body = "not-json";
    const sig = sign(SECRET, now, body);
    expect(() => verifyWebhook(SECRET, body, sig)).toThrow("not valid JSON");
  });
});

// ─── sendWebhook ─────────────────────────────────────────────────────────────

describe("sendWebhook", () => {
  afterEach(() => jest.restoreAllMocks());

  it("POSTs JSON with l402-signature header", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 200 });
    });

    const event = makeEvent();
    await sendWebhook("https://example.com/webhook", "secret", event);

    expect(requests).toHaveLength(1);
    const { url, init } = requests[0]!;
    expect(url).toBe("https://example.com/webhook");
    expect((init.headers as Record<string, string>)["l402-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(init.body as string) as WebhookEvent;
    expect(sent.type).toBe("payment.received");
    expect(sent.data.amountSats).toBe(100);
  });

  it("does not throw when fetch fails", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendWebhook("https://example.com/webhook", "secret", makeEvent())).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[l402] webhook delivery error:"), expect.stringContaining("network error"));
  });

  it("logs on non-2xx response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await sendWebhook("https://example.com/webhook", "secret", makeEvent());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
  });

  it("signs the payload verifiably", async () => {
    const SECRET = "verify_round_trip_secret";
    let capturedSig = "";
    let capturedBody = "";

    jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      capturedSig = (init?.headers as Record<string, string>)["l402-signature"] ?? "";
      capturedBody = init?.body as string;
      return new Response(null, { status: 200 });
    });

    const event = makeEvent();
    await sendWebhook("https://example.com/webhook", SECRET, event);

    // Verify the sent signature is valid (within tolerance)
    expect(() => verifyWebhook(SECRET, capturedBody, capturedSig)).not.toThrow();
  });
});
