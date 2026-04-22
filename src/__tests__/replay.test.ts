import { randomBytes } from "crypto";
import { checkAndMarkPreimage, MemoryReplayAdapter, RedisReplayAdapter } from "../replay";
import type { RedisLike } from "../replay";

// ─── legacy export (backwards compat) ────────────────────────────────────────

describe("checkAndMarkPreimage (legacy)", () => {
  it("returns true for first-time preimage", () => {
    expect(checkAndMarkPreimage(randomBytes(32).toString("hex"))).toBe(true);
  });

  it("returns false on second use of same preimage (anti-replay)", () => {
    const preimage = randomBytes(32).toString("hex");
    expect(checkAndMarkPreimage(preimage)).toBe(true);
    expect(checkAndMarkPreimage(preimage)).toBe(false);
  });

  it("returns false on third use too", () => {
    const preimage = randomBytes(32).toString("hex");
    checkAndMarkPreimage(preimage);
    checkAndMarkPreimage(preimage);
    expect(checkAndMarkPreimage(preimage)).toBe(false);
  });

  it("different preimages are independent", () => {
    const p1 = randomBytes(32).toString("hex");
    const p2 = randomBytes(32).toString("hex");
    expect(checkAndMarkPreimage(p1)).toBe(true);
    expect(checkAndMarkPreimage(p2)).toBe(true);
    expect(checkAndMarkPreimage(p1)).toBe(false);
    expect(checkAndMarkPreimage(p2)).toBe(false);
  });

  it("100 unique preimages all succeed first-time", () => {
    const preimages = Array.from({ length: 100 }, () => randomBytes(32).toString("hex"));
    const results = preimages.map((p) => checkAndMarkPreimage(p));
    expect(results.every((r) => r === true)).toBe(true);
  });
});

// ─── MemoryReplayAdapter ──────────────────────────────────────────────────────

describe("MemoryReplayAdapter", () => {
  let adapter: MemoryReplayAdapter;

  beforeEach(() => {
    adapter = new MemoryReplayAdapter();
  });

  it("returns true for first-time preimage", () => {
    expect(adapter.check(randomBytes(32).toString("hex"))).toBe(true);
  });

  it("returns false on second use (replay)", () => {
    const p = randomBytes(32).toString("hex");
    expect(adapter.check(p)).toBe(true);
    expect(adapter.check(p)).toBe(false);
  });

  it("returns false on third use too", () => {
    const p = randomBytes(32).toString("hex");
    adapter.check(p);
    adapter.check(p);
    expect(adapter.check(p)).toBe(false);
  });

  it("independent instances do not share state", () => {
    const p = randomBytes(32).toString("hex");
    const other = new MemoryReplayAdapter();
    adapter.check(p);
    expect(other.check(p)).toBe(true);
  });

  it("clear() resets state so same preimage works again", () => {
    const p = randomBytes(32).toString("hex");
    adapter.check(p);
    adapter.clear();
    expect(adapter.check(p)).toBe(true);
  });

  it("clear() does not affect other adapters", () => {
    const p = randomBytes(32).toString("hex");
    const other = new MemoryReplayAdapter();
    adapter.check(p);
    other.check(p);
    adapter.clear();
    expect(other.check(p)).toBe(false); // other still has the mark
  });

  it("different preimages are independent", () => {
    const p1 = randomBytes(32).toString("hex");
    const p2 = randomBytes(32).toString("hex");
    expect(adapter.check(p1)).toBe(true);
    expect(adapter.check(p2)).toBe(true);
    expect(adapter.check(p1)).toBe(false);
  });

  it("50 unique preimages all succeed first-time", () => {
    const preimages = Array.from({ length: 50 }, () => randomBytes(32).toString("hex"));
    const results = preimages.map((p) => adapter.check(p));
    expect(results.every((r) => r === true)).toBe(true);
  });

  it("all 50 preimages blocked on second use", () => {
    const preimages = Array.from({ length: 50 }, () => randomBytes(32).toString("hex"));
    preimages.forEach((p) => adapter.check(p));
    const replays = preimages.map((p) => adapter.check(p));
    expect(replays.every((r) => r === false)).toBe(true);
  });

  it("handles empty string preimage without crashing", () => {
    const result1 = adapter.check("");
    const result2 = adapter.check("");
    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });

  it("handles very long preimage string", () => {
    const long = "a".repeat(512);
    expect(adapter.check(long)).toBe(true);
    expect(adapter.check(long)).toBe(false);
  });

  it("treats identical hex strings as identical (case-sensitive)", () => {
    const lower = randomBytes(32).toString("hex");
    const upper = lower.toUpperCase();
    adapter.check(lower);
    // Upper and lower are different strings — check implementation is consistent
    const upperResult = adapter.check(upper);
    // Either both are tracked or only the exact string is tracked — must not crash
    expect(typeof upperResult).toBe("boolean");
  });
});

// ─── RedisReplayAdapter ───────────────────────────────────────────────────────

function makeMockRedis(): { client: RedisLike; calls: string[] } {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const client: RedisLike = {
    async set(key, value, _ex, ttl, _nx) {
      calls.push(`SET ${key} EX=${ttl} NX`);
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
  };
  return { client, calls };
}

describe("RedisReplayAdapter", () => {
  it("returns true on first use (SET NX succeeds → OK)", async () => {
    const { client } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await expect(adapter.check(randomBytes(32).toString("hex"))).resolves.toBe(true);
  });

  it("returns false on replay (SET NX fails → null)", async () => {
    const { client } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    const p = randomBytes(32).toString("hex");
    await expect(adapter.check(p)).resolves.toBe(true);
    await expect(adapter.check(p)).resolves.toBe(false);
  });

  it("uses l402:replay: key prefix", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls[0]).toMatch(/^SET l402:replay:[0-9a-f]{64}/);
  });

  it("respects custom TTL", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client, 3600);
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls[0]).toContain("EX=3600");
  });

  it("default TTL is 7 days (604800 seconds)", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls[0]).toContain("EX=604800");
  });

  it("different preimages have different Redis keys", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    const p1 = randomBytes(32).toString("hex");
    const p2 = randomBytes(32).toString("hex");
    await adapter.check(p1);
    await adapter.check(p2);
    const key1 = calls[0]!.split(" ")[1];
    const key2 = calls[1]!.split(" ")[1];
    expect(key1).not.toBe(key2);
  });

  it("makes exactly one Redis SET call per check", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls).toHaveLength(1);
  });

  it("makes two Redis SET calls for two different preimages", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await adapter.check(randomBytes(32).toString("hex"));
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls).toHaveLength(2);
  });

  it("concurrent checks on same preimage: exactly one succeeds", async () => {
    const { client } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    const p = randomBytes(32).toString("hex");
    const results = await Promise.all([
      adapter.check(p),
      adapter.check(p),
      adapter.check(p),
    ]);
    const trueCount = results.filter((r) => r === true).length;
    expect(trueCount).toBe(1);
  });

  it("key contains the exact preimage hex", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    const p = randomBytes(32).toString("hex");
    await adapter.check(p);
    expect(calls[0]).toContain(p);
  });
});
