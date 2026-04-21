import { randomBytes } from "crypto";
import { checkAndMarkPreimage, MemoryReplayAdapter, RedisReplayAdapter } from "../replay";
import type { RedisLike } from "../replay";

// ─── legacy export (backwards compat) ────────────────────────────────────────

describe("checkAndMarkPreimage (legacy)", () => {
  it("returns true for first-time preimage", () => {
    const preimage = randomBytes(32).toString("hex");
    expect(checkAndMarkPreimage(preimage)).toBe(true);
  });

  it("returns false on second use of same preimage (anti-replay)", () => {
    const preimage = randomBytes(32).toString("hex");
    expect(checkAndMarkPreimage(preimage)).toBe(true);
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
});

// ─── MemoryReplayAdapter ──────────────────────────────────────────────────────

describe("MemoryReplayAdapter", () => {
  let adapter: MemoryReplayAdapter;
  beforeEach(() => { adapter = new MemoryReplayAdapter(); });

  it("returns true for first-time preimage", () => {
    expect(adapter.check(randomBytes(32).toString("hex"))).toBe(true);
  });

  it("returns false on second use (replay)", () => {
    const p = randomBytes(32).toString("hex");
    expect(adapter.check(p)).toBe(true);
    expect(adapter.check(p)).toBe(false);
  });

  it("independent instances do not share state", () => {
    const p = randomBytes(32).toString("hex");
    const other = new MemoryReplayAdapter();
    adapter.check(p);
    // Different instance — should allow
    expect(other.check(p)).toBe(true);
  });

  it("clear() resets state", () => {
    const p = randomBytes(32).toString("hex");
    adapter.check(p);
    adapter.clear();
    expect(adapter.check(p)).toBe(true);
  });

  it("different preimages are independent", () => {
    const p1 = randomBytes(32).toString("hex");
    const p2 = randomBytes(32).toString("hex");
    expect(adapter.check(p1)).toBe(true);
    expect(adapter.check(p2)).toBe(true);
    expect(adapter.check(p1)).toBe(false);
  });
});

// ─── RedisReplayAdapter ───────────────────────────────────────────────────────

function makeMockRedis(): { client: RedisLike; calls: string[] } {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const client: RedisLike = {
    async set(key, value, _ex, ttl, _nx) {
      calls.push(`SET ${key} EX=${ttl} NX`);
      if (store.has(key)) return null;  // key exists → NX fails
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

  it("default TTL is 7 days", async () => {
    const { client, calls } = makeMockRedis();
    const adapter = new RedisReplayAdapter(client);
    await adapter.check(randomBytes(32).toString("hex"));
    expect(calls[0]).toContain("EX=604800");
  });

  it("different preimages have different keys", async () => {
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
});
