// Minimal Cloudflare KV stub for Jest test environment.
// Replaces @cloudflare/workers-types, which is incompatible with Node DOM types.

declare interface KVNamespace {
  get(key: string, options?: unknown): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string; expiration?: number }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  getWithMetadata<T = unknown>(key: string): Promise<{ value: string | null; metadata: T | null }>;
}
