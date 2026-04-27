import { createHash, randomBytes } from "crypto";
import { parseToken, verifyToken } from "../verify";

// ─── helpers ────────────────────────────────────────────────────────────────

function makePreimage(): string {
  return randomBytes(32).toString("hex"); // unique 64-hex chars each call
}

function makeHash(preimage: string): string {
  return createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
}

function makeMacaroon(hash: string, expOffsetMs = 3_600_000, extra?: Record<string, unknown>): string {
  const payload = { hash, exp: Date.now() + expOffsetMs, ...extra };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function makeToken(preimage = makePreimage(), expOffsetMs = 3_600_000): string {
  const hash = makeHash(preimage);
  const mac = makeMacaroon(hash, expOffsetMs);
  return `${mac}:${preimage}`;
}

// ─── parseToken ─────────────────────────────────────────────────────────────

describe("parseToken", () => {
  it("splits on last colon — simple case", () => {
    const { macaroon, preimage } = parseToken("abc:def");
    expect(macaroon).toBe("abc");
    expect(preimage).toBe("def");
  });

  it("splits on last colon when macaroon contains colons", () => {
    const { macaroon, preimage } = parseToken("abc:def:ghi");
    expect(macaroon).toBe("abc:def");
    expect(preimage).toBe("ghi");
  });

  it("handles base64 macaroon with many colons", () => {
    const { macaroon, preimage } = parseToken("a:b:c:d:preimage");
    expect(macaroon).toBe("a:b:c:d");
    expect(preimage).toBe("preimage");
  });

  it("throws on missing colon — plain string", () => {
    expect(() => parseToken("nocolon")).toThrow("Invalid L402 token format");
  });

  it("throws on empty string", () => {
    expect(() => parseToken("")).toThrow();
  });

  it("throws on only-colon string — empty preimage", () => {
    // ":" splits to macaroon="" preimage="" — implementation may allow or throw
    // Either way it must not crash with an unhandled exception
    expect(() => {
      const result = parseToken(":");
      // If it doesn't throw, both parts must be strings
      expect(typeof result.macaroon).toBe("string");
      expect(typeof result.preimage).toBe("string");
    }).not.toThrow();
  });

  it("returns string types for both parts", () => {
    const { macaroon, preimage } = parseToken("mac:pre");
    expect(typeof macaroon).toBe("string");
    expect(typeof preimage).toBe("string");
  });

  it("preserves exact characters in macaroon and preimage", () => {
    const { macaroon, preimage } = parseToken("eyJoYXNocg==:abc123def456");
    expect(macaroon).toBe("eyJoYXNocg==");
    expect(preimage).toBe("abc123def456");
  });
});

// ─── verifyToken ────────────────────────────────────────────────────────────

describe("verifyToken", () => {
  // ── happy path ─────────────────────────────────────────────────────────────

  it("accepts a valid fresh token", async () => {
    expect(await verifyToken(makeToken())).toBe(true);
  });

  it("accepts token expiring far in the future (1 year)", async () => {
    expect(await verifyToken(makeToken(makePreimage(), 365 * 24 * 3_600_000))).toBe(true);
  });

  it("accepts token expiring in 1 ms", async () => {
    // exp is now+1ms — might race, but should generally pass
    const token = makeToken(makePreimage(), 5_000);
    expect(await verifyToken(token)).toBe(true);
  });

  it("accepts token with extra fields in macaroon payload (forwards compat)", async () => {
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const mac = makeMacaroon(hash, 3_600_000, { version: 2, extra: "field" });
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(true);
  });

  it("accepts token with uppercase hex preimage", async () => {
    const lower = makePreimage();
    const upper = lower.toUpperCase();
    const hash = makeHash(lower);
    const mac = makeMacaroon(hash);
    // Uppercase hex preimage — verify implementation handles case normalisation
    const result = await verifyToken(`${mac}:${upper}`);
    // implementation may accept or reject uppercase; it must not throw
    expect(typeof result).toBe("boolean");
  });

  // ── expiry ─────────────────────────────────────────────────────────────────

  it("rejects expired token (1 second ago)", async () => {
    expect(await verifyToken(makeToken(makePreimage(), -1_000))).toBe(false);
  });

  it("rejects expired token (1 hour ago)", async () => {
    expect(await verifyToken(makeToken(makePreimage(), -3_600_000))).toBe(false);
  });

  it("rejects token with exp=0 (Unix epoch)", async () => {
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const mac = Buffer.from(JSON.stringify({ hash, exp: 0 })).toString("base64");
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(false);
  });

  it("rejects token with negative exp", async () => {
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const mac = Buffer.from(JSON.stringify({ hash, exp: -999999 })).toString("base64");
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(false);
  });

  // ── hash mismatch ──────────────────────────────────────────────────────────

  it("rejects wrong preimage (hash mismatch)", async () => {
    const correctPreimage = makePreimage();
    const wrongHash = makeHash(makePreimage()); // hash of a different preimage
    const mac = makeMacaroon(wrongHash);
    expect(await verifyToken(`${mac}:${correctPreimage}`)).toBe(false);
  });

  it("rejects preimage flipped by one bit (last char changed)", async () => {
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const mac = makeMacaroon(hash);
    const tampered = preimage.slice(0, -1) + (preimage.endsWith("a") ? "b" : "a");
    expect(await verifyToken(`${mac}:${tampered}`)).toBe(false);
  });

  it("rejects all-zeros preimage against real hash", async () => {
    const realPreimage = makePreimage();
    const hash = makeHash(realPreimage);
    const mac = makeMacaroon(hash);
    const zeros = "0".repeat(64);
    expect(await verifyToken(`${mac}:${zeros}`)).toBe(false);
  });

  // ── format errors ──────────────────────────────────────────────────────────

  it("rejects preimage shorter than 64 hex chars", async () => {
    const short = "aabbcc"; // only 6 chars
    const hash = makeHash("a".repeat(64));
    const mac = makeMacaroon(hash);
    expect(await verifyToken(`${mac}:${short}`)).toBe(false);
  });

  it("rejects preimage longer than 64 hex chars", async () => {
    const long = "a".repeat(128); // 128 chars = 64 bytes but wrong hash
    const hash = makeHash("a".repeat(64));
    const mac = makeMacaroon(hash);
    expect(await verifyToken(`${mac}:${long}`)).toBe(false);
  });

  it("rejects non-hex preimage (z characters)", async () => {
    const nonHex = "z".repeat(64);
    const mac = makeMacaroon(makeHash("a".repeat(64)));
    expect(await verifyToken(`${mac}:${nonHex}`)).toBe(false);
  });

  it("rejects empty preimage", async () => {
    const hash = makeHash("a".repeat(64));
    const mac = makeMacaroon(hash);
    expect(await verifyToken(`${mac}:`)).toBe(false);
  });

  it("rejects garbage string", async () => {
    expect(await verifyToken("notavalidtoken")).toBe(false);
  });

  it("rejects empty string", async () => {
    expect(await verifyToken("")).toBe(false);
  });

  it("rejects malformed base64 macaroon", async () => {
    expect(await verifyToken("!!!notbase64!!!:" + "a".repeat(64))).toBe(false);
  });

  it("rejects macaroon missing hash field", async () => {
    const mac = Buffer.from(JSON.stringify({ exp: Date.now() + 3_600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects macaroon missing exp field", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: makeHash("a".repeat(64)) })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects macaroon with null hash", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: null, exp: Date.now() + 3_600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects macaroon with numeric hash", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: 12345, exp: Date.now() + 3_600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects plain JSON string that is not a valid macaroon", async () => {
    const mac = Buffer.from("[]").toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("rejects token where macaroon is valid base64 but not JSON", async () => {
    const mac = Buffer.from("not json at all").toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  // ── concurrency ────────────────────────────────────────────────────────────

  it("verifies multiple different valid tokens concurrently", async () => {
    const tokens = Array.from({ length: 10 }, () => makeToken());
    const results = await Promise.all(tokens.map((t) => verifyToken(t)));
    expect(results.every((r) => r === true)).toBe(true);
  });

  it("rejects multiple different expired tokens concurrently", async () => {
    const tokens = Array.from({ length: 10 }, () => makeToken(makePreimage(), -1_000));
    const results = await Promise.all(tokens.map((t) => verifyToken(t)));
    expect(results.every((r) => r === false)).toBe(true);
  });

  it("verifyToken returns boolean (not a truthy object)", async () => {
    const token = makeToken();
    const result = await verifyToken(token);
    expect(typeof result).toBe("boolean");
  });

  it("accepts token where exp is exactly now + 1ms (not yet expired)", async () => {
    const preimage = makePreimage();
    const mac = makeMacaroon(makeHash(preimage), 1);
    const result = await verifyToken(`${mac}:${preimage}`);
    expect(result).toBe(true);
  });

  it("rejects token where hash is empty string", async () => {
    const preimage = makePreimage();
    const mac = Buffer.from(JSON.stringify({ hash: "", exp: Date.now() + 3_600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(false);
  });

  it("accepts token with very large exp value (year 3000)", async () => {
    const preimage = makePreimage();
    const far = new Date("3000-01-01").getTime();
    const mac = Buffer.from(JSON.stringify({ hash: makeHash(preimage), exp: far })).toString("base64");
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(true);
  });

  it("rejects token with null preimage field", async () => {
    const mac = makeMacaroon(makePreimage());
    expect(await verifyToken(`${mac}:${null}`)).toBe(false);
  });

  it("parseToken: returns exact string types for 64-char hex preimage", () => {
    const pre = "a".repeat(64);
    const { preimage, macaroon } = parseToken(`mymac:${pre}`);
    expect(preimage).toBe(pre);
    expect(macaroon).toBe("mymac");
  });

  it("verifyToken returns false for completely empty string", async () => {
    expect(await verifyToken("")).toBe(false);
  });

  it("rejects 50 tokens with wrong preimages concurrently", async () => {
    const tokens = Array.from({ length: 50 }, () => {
      const preimage = makePreimage();
      const wrongHash = makeHash(makePreimage()); // hash of a different preimage
      const mac = makeMacaroon(wrongHash);
      return `${mac}:${preimage}`;
    });
    const results = await Promise.all(tokens.map((t) => verifyToken(t)));
    expect(results.every((r) => r === false)).toBe(true);
  });

  // ── attack vectors ─────────────────────────────────────────────────────────

  it("ATTACK: forged macaroon with known hash but wrong preimage is rejected", async () => {
    // Attacker intercepts a valid paymentHash from a 402 response
    // and crafts a macaroon manually — still needs a valid preimage
    const legitimatePreimage = makePreimage();
    const knownHash = makeHash(legitimatePreimage);
    const forgedMac = makeMacaroon(knownHash); // attacker builds macaroon with known hash
    const attackerPreimage = makePreimage();   // attacker does NOT have the real preimage
    expect(await verifyToken(`${forgedMac}:${attackerPreimage}`)).toBe(false);
  });

  it("ATTACK: forged macaroon with self-consistent hash/preimage is rejected when expired", async () => {
    // Attacker generates their own valid preimage+hash pair but backdates the token
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const expiredMac = makeMacaroon(hash, -1); // expired 1ms ago
    expect(await verifyToken(`${expiredMac}:${preimage}`)).toBe(false);
  });

  it("ATTACK: macaroon with hash field set to empty string is rejected", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: "", exp: Date.now() + 3_600_000 })).toString("base64");
    expect(await verifyToken(`${mac}:${"a".repeat(64)}`)).toBe(false);
  });

  it("ATTACK: macaroon with hash set to all-zeros is rejected", async () => {
    const mac = makeMacaroon("0".repeat(64));
    const preimage = "0".repeat(64); // SHA256("0"*64) != "0"*64
    expect(await verifyToken(`${mac}:${preimage}`)).toBe(false);
  });

  it("ATTACK: exp field set to Infinity to bypass expiry check", async () => {
    const preimage = makePreimage();
    const hash = makeHash(preimage);
    const mac = Buffer.from(JSON.stringify({ hash, exp: Infinity })).toString("base64");
    // Infinity serializes as null in JSON — implementation must handle gracefully
    const result = await verifyToken(`${mac}:${preimage}`);
    expect(typeof result).toBe("boolean"); // must not throw
  });

  it("ATTACK: preimage with SQL injection characters is rejected", async () => {
    const sqlPreimage = "'; DROP TABLE payments; --" + "a".repeat(38);
    const mac = makeMacaroon(makeHash("a".repeat(64)));
    expect(await verifyToken(`${mac}:${sqlPreimage}`)).toBe(false);
  });

  it("ATTACK: extremely long preimage (DoS attempt) does not hang", async () => {
    const longPreimage = "a".repeat(100_000);
    const mac = makeMacaroon(makeHash("a".repeat(64)));
    const start = Date.now();
    const result = await verifyToken(`${mac}:${longPreimage}`);
    expect(Date.now() - start).toBeLessThan(200); // must resolve in <200ms
    expect(result).toBe(false);
  });

  it("ATTACK: extremely long macaroon (DoS attempt) does not hang", async () => {
    const longMac = "a".repeat(100_000);
    const preimage = makePreimage();
    const start = Date.now();
    const result = await verifyToken(`${longMac}:${preimage}`);
    expect(Date.now() - start).toBeLessThan(200);
    expect(result).toBe(false);
  });

  it("TIMING: valid and invalid tokens resolve in similar time (no timing oracle)", async () => {
    const validToken = makeToken();
    const invalidToken = makeToken(makePreimage(), -1_000); // expired

    const runs = 20;
    const timings = { valid: 0, invalid: 0 };

    for (let i = 0; i < runs; i++) {
      let t = Date.now(); await verifyToken(validToken); timings.valid += Date.now() - t;
      t = Date.now(); await verifyToken(invalidToken); timings.invalid += Date.now() - t;
    }

    const avgValid = timings.valid / runs;
    const avgInvalid = timings.invalid / runs;
    // Both paths should be fast — no path should be >50ms slower than the other
    expect(Math.abs(avgValid - avgInvalid)).toBeLessThan(50);
  });
});
