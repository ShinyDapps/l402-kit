import { createHash } from "crypto";

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * Pluggable replay-protection adapter.
 * Implement this interface to use any storage backend.
 */
export interface ReplayAdapter {
  /**
   * Returns `true` if this preimage was NOT yet seen and marks it as used.
   * Returns `false` if it was already seen (replay attack).
   * Must be atomic — concurrent calls with the same preimage must not both return `true`.
   */
  check(preimage: string): Promise<boolean> | boolean;
}

// ─── Memory adapter (default) ─────────────────────────────────────────────────

/**
 * In-process replay protection. Fast, zero dependencies.
 * **Not** safe across multiple server instances or process restarts.
 * Use `RedisReplayAdapter` for production multi-instance deployments.
 */
export class MemoryReplayAdapter implements ReplayAdapter {
  private readonly seen = new Set<string>();

  check(preimage: string): boolean {
    const key = createHash("sha256").update(preimage).digest("hex");
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  /** Clear all state — useful in tests. */
  clear(): void { this.seen.clear(); }
}

// ─── Redis adapter ────────────────────────────────────────────────────────────

/**
 * Minimal Redis interface — compatible with `ioredis` and `@upstash/redis`.
 * If you use `node-redis` v4, wrap it:
 * ```ts
 * { set: (k, v, ex, ttl, nx) => client.set(k, v, { EX: ttl, NX: true }) }
 * ```
 */
export interface RedisLike {
  set(
    key: string,
    value: string,
    exMode: "EX",
    ttlSecs: number,
    nxMode: "NX",
  ): Promise<"OK" | null | string | undefined>;
}

/**
 * Distributed replay protection backed by Redis.
 * Uses atomic `SET NX` — safe across multiple server instances and restarts.
 *
 * Compatible with: `ioredis`, `@upstash/redis`, `node-redis` (with wrapper)
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { l402, RedisReplayAdapter } from "l402-kit";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 *
 * app.use("/premium", l402({
 *   priceSats: 100,
 *   replayAdapter: new RedisReplayAdapter(redis),
 * }));
 * ```
 */
export class RedisReplayAdapter implements ReplayAdapter {
  constructor(
    private readonly redis: RedisLike,
    /** How long to remember a preimage. Default: 7 days (covers invoice expiry + buffer). */
    private readonly ttlSecs: number = 86_400 * 7,
  ) {}

  async check(preimage: string): Promise<boolean> {
    const key = `l402:replay:${createHash("sha256").update(preimage).digest("hex")}`;
    // Atomic SET NX: sets the key only if it does not exist.
    // Returns "OK" on first write (not seen), null if key already existed (replay).
    const result = await this.redis.set(key, "1", "EX", this.ttlSecs, "NX");
    return result !== null && result !== undefined;
  }
}

// ─── Module-level default (backwards compat) ─────────────────────────────────

const _default = new MemoryReplayAdapter();

/**
 * Check and mark a preimage using the default in-memory store.
 * @deprecated Pass a `ReplayAdapter` via `l402({ replayAdapter })` instead.
 * This module-level store does not survive restarts or scale across instances.
 */
export function checkAndMarkPreimage(preimage: string): boolean {
  return _default.check(preimage);
}
