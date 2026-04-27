import type { Env } from "../worker";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CATEGORIES = ["data", "ai", "finance", "weather", "compute", "storage", "other"] as const;

// Rate limit: max 10 registrations per IP per hour (stored in KV if available, else header check)
const REGISTER_RATE_LIMIT = 10;

export async function handleRegister(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Basic rate limiting via CF-Connecting-IP header
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const rateLimitKey = `register:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  if (env.demo_preimages) {
    const count = Number(await env.demo_preimages.get(rateLimitKey) ?? "0");
    if (count >= REGISTER_RATE_LIMIT) {
      return json({ error: "Rate limit exceeded — max 10 registrations per hour per IP" }, 429);
    }
    await env.demo_preimages.put(rateLimitKey, String(count + 1), { expirationTtl: 3600 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { url, name, description, price_sats, lightning_address, category } = body as {
    url?: string;
    name?: string;
    description?: string;
    price_sats?: number;
    lightning_address?: string;
    category?: string;
  };

  if (!url || !name || !price_sats || !lightning_address) {
    return json({ error: "Missing required fields: url, name, price_sats, lightning_address" }, 400);
  }

  let parsedUrl: URL;
  try { parsedUrl = new URL(url as string); } catch {
    return json({ error: "Invalid url" }, 400);
  }
  // Only allow https URLs in production
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return json({ error: "url must use http or https" }, 400);
  }

  if (typeof price_sats !== "number" || !Number.isInteger(price_sats) || price_sats < 1) {
    return json({ error: "price_sats must be a positive integer" }, 400);
  }

  // Basic lightning address validation (user@domain)
  if (typeof lightning_address !== "string" || !lightning_address.includes("@")) {
    return json({ error: "lightning_address must be a valid Lightning Address (user@domain)" }, 400);
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100) {
    return json({ error: "name must be between 2 and 100 characters" }, 400);
  }

  const cat = CATEGORIES.includes(category as typeof CATEGORIES[number]) ? category : "other";

  const { data, error } = await supabase(env).from("api_registry").upsert(
    { url, name, description: description ?? null, price_sats, lightning_address, category: cat },
    { onConflict: "url" }
  ).select("id").single() as { data: { id: string } | null; error: { message: string } | null };

  if (error) {
    return json({ error: "Registration failed", detail: error.message }, 500);
  }

  return json({ ok: true, id: (data as { id: string } | null)?.id });
}

export async function handleApis(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  let query = supabase(env)
    .from("api_registry")
    .select("url,name,description,price_sats,category,created_at")
    .eq("verified", false)  // show all (verification is advisory only for MVP)
    .order("created_at", { ascending: false })
    .limit(100);

  if (category && CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    query = query.eq("category", category);
  }

  const { data, error } = await query as { data: unknown[] | null; error: { message: string } | null };

  if (error) return json({ error: "Failed to fetch APIs" }, 500);

  return json({
    version: "1",
    count: (data ?? []).length,
    apis: data ?? [],
  });
}

// Minimal Supabase REST client (no external dep needed in Workers)
function supabase(env: Env) {
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  function from(table: string) {
    return new QueryBuilder(base, table, headers);
  }

  return { from };
}

class QueryBuilder {
  private _url: URL;
  private _headers: Record<string, string>;
  private _body?: unknown;
  private _method = "GET";
  private _upsertConflict?: string;

  constructor(base: string, table: string, headers: Record<string, string>) {
    this._url = new URL(`${base}/${table}`);
    this._headers = { ...headers };
  }

  select(cols: string) {
    this._url.searchParams.set("select", cols);
    return this;
  }

  eq(col: string, val: unknown) {
    this._url.searchParams.set(col, `eq.${val}`);
    return this;
  }

  order(col: string, opts: { ascending: boolean }) {
    this._url.searchParams.set("order", `${col}.${opts.ascending ? "asc" : "desc"}`);
    return this;
  }

  limit(n: number) {
    this._url.searchParams.set("limit", String(n));
    return this;
  }

  upsert(data: unknown, opts?: { onConflict?: string }) {
    this._method = "POST";
    this._body = data;
    this._headers["Prefer"] = "resolution=merge-duplicates,return=representation";
    if (opts?.onConflict) {
      this._url.searchParams.set("on_conflict", opts.onConflict);
    }
    return this;
  }

  single() {
    this._headers["Accept"] = "application/vnd.pgrst.object+json";
    return this;
  }

  async then(resolve: (v: { data: unknown; error: { message: string } | null }) => unknown) {
    try {
      const res = await fetch(this._url.toString(), {
        method: this._method,
        headers: this._headers,
        body: this._body ? JSON.stringify(this._body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` })) as { message: string };
        return resolve({ data: null, error: err });
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return resolve({ data, error: null });
    } catch (e) {
      return resolve({ data: null, error: { message: String(e) } });
    }
  }
}
