import { createHash } from "crypto";
import { parseToken, verifyToken } from "../verify";

// ─── helpers ────────────────────────────────────────────────────────────────

function makePreimage(): string {
  return "a".repeat(64); // valid 64-hex chars
}

function makeHash(preimage: string): string {
  return createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
}

function makeMacaroon(hash: string, expOffsetMs = 3_600_000): string {
  const payload = { hash, exp: Date.now() + expOffsetMs };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function makeToken(preimage = makePreimage(), expOffsetMs = 3_600_000): string {
  const hash = makeHash(preimage);
  const mac = makeMacaroon(hash, expOffsetMs);
  return `${mac}:${preimage}`;
}

// ─── parseToken ─────────────────────────────────────────────────────────────

describe("parseToken", () => {
  it("splits on last colon", () => {
    const { macaroon, preimage } = parseToken("abc:def:ghi");
    expect(macaroon).toBe("abc:def");
    expect(preimage).toBe("ghi");
  });

  it("throws on missing colon", () => {
    expect(() => parseToken("nocolon")).toThrow("Invalid L402 token format");
  });
});

// ─── verifyToken ────────────────────────────────────────────────────────────

describe("verifyToken", () => {
  it("accepts a valid fresh token", async () => {
    expect(await verifyToken(makeToken())).toBe(true);
  });

  it("rejects expired token", async () => {
    expect(await verifyToken(makeToken(makePreimage(), -1000))).toBe(false);
  });

  it("rejects wrong preimage (hash mismatch)", async () => {
    const preimage = makePreimage();
    const wrongHash = makeHash("b".repeat(64));
    const mac = makeMacaroon(wrongHash);
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(false);
  });

  it("rejects preimage shorter than 64 hex chars", async () => {
    const short = "aabbcc";
    const hash = makeHash("a".repeat(64));
    const mac = makeMacaroon(hash);
    expect(await verifyToken(`${mac}:${short}`)).toBe(false);
  });

  it("rejects non-hex preimage", async () => {
    const nonHex = "z".repeat(64);
    const mac = makeMacaroon(makeHash("a".repeat(64)));
    expect(await verifyToken(`${mac}:${nonHex}`)).toBe(false);
  });

  it("rejects garbage string", async () => {
    expect(await verifyToken("notavalidtoken")).toBe(false);
  });

  it("rejects malformed base64 macaroon", async () => {
    expect(await verifyToken("!!!notbase64!!!:" + "a".repeat(64))).toBe(false);
  });

  it("rejects macaroon missing hash field", async () => {
    const mac = Buffer.from(JSON.stringify({ exp: Date.now() + 3600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects macaroon missing exp field", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: makeHash("a".repeat(64)) })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });
});
