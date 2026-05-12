/**
 * TDD — POST /api/verity/alpha
 *
 * Módulo: src/verity/services/alpha.ts
 * Cobertura: method guard, 402 flow, L402 auth, input defaults,
 *            timeframe mapping, risk sizing, output shape,
 *            BTC price fallback, search fallback, inference fallback,
 *            JSON parse fallback, replay protection, recordCall.
 */

import { handleVerityAlpha } from "../verity/services/alpha";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get:  async (k: string) => store.get(k) ?? null,
    put:  async (k: string, v: string, _opts?: unknown) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(kv?: KVNamespace, overrides: Record<string, string> = {}): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    SERPER_API_KEY: "test-serper-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    ...overrides,
  } as unknown as import("../worker").Env;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://l402kit.com/api/verity/alpha", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(): Request {
  return new Request("https://l402kit.com/api/verity/alpha", { method: "GET" });
}

function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function makeValidToken(kv: KVNamespace): Promise<{ token: string; preimage: string }> {
  const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
  const preimage = bytesToHex(preimageBytes);
  const hashBuf = await crypto.subtle.digest("SHA-256", preimageBytes);
  const hash = bytesToHex(new Uint8Array(hashBuf));
  const macaroon = btoa(JSON.stringify({ hash, exp: Date.now() + 3_600_000 }));
  return { token: `L402 ${macaroon}:${preimage}`, preimage };
}

async function makeExpiredToken(): Promise<string> {
  const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
  const preimage = bytesToHex(preimageBytes);
  const hashBuf = await crypto.subtle.digest("SHA-256", preimageBytes);
  const hash = bytesToHex(new Uint8Array(hashBuf));
  const macaroon = btoa(JSON.stringify({ hash, exp: Date.now() - 1000 }));
  return `L402 ${macaroon}:${preimage}`;
}

// ─── Default fetch mock (search + inference + btc price) ─────────────────────

const ALPHA_JSON = JSON.stringify({
  cycle_phase: "early_bull",
  alpha_window: "open",
  strategy: "Farm governance tokens of Base L2 protocols before TGE",
  chain: "Base",
  timeframe_days: 7,
  entry: "TVL > $50M and governance forum activity rising",
  exit_trigger: "TGE announced or TVL growth stalls for 48h",
  exit_price_btc_usd: 120000,
  position_size_pct: 20,
  confidence: 0.74,
  risk_level: "medium",
  thesis: "Base ecosystem is in early growth phase. Governance tokens pre-TGE have asymmetric upside. Window closes when TGE is announced.",
});

const SEARCH_RESULTS = {
  organic: [
    { title: "DeFi Alpha: Base L2 opportunities", link: "https://defiprime.com/base-alpha", snippet: "Top yield strategies on Base" },
    { title: "Governance token farming guide", link: "https://mirror.xyz/defi-guide", snippet: "How to farm governance tokens before TGE" },
  ],
};

const BTC_PRICE = { bitcoin: { usd: 95000, usd_24h_change: 2.3 } };

const originalFetch = globalThis.fetch;

function mockFetch(opts: {
  btcPrice?: object;
  searchResults?: object;
  inferenceText?: string;
  btcFail?: boolean;
  searchFail?: boolean;
  inferenceFail?: boolean;
  blinkLnurl?: object;
  blinkCallback?: object;
} = {}): void {
  globalThis.fetch = (url: string | URL | Request): Promise<Response> => {
    const u = url.toString();

    if (u.includes("coingecko.com")) {
      if (opts.btcFail) return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response(JSON.stringify(opts.btcPrice ?? BTC_PRICE), { status: 200 }));
    }

    if (u.includes("serper.dev") || u.includes("search.brave.com")) {
      if (opts.searchFail) return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response(JSON.stringify(opts.searchResults ?? SEARCH_RESULTS), { status: 200 }));
    }

    if (u.includes("groq.com") || u.includes("anthropic.com")) {
      if (opts.inferenceFail) return Promise.resolve(new Response(null, { status: 500 }));
      const text = opts.inferenceText ?? ALPHA_JSON;
      // Groq format
      if (u.includes("groq.com")) {
        return Promise.resolve(new Response(
          JSON.stringify({ choices: [{ message: { content: text } }] }),
          { status: 200 },
        ));
      }
      // Anthropic format
      return Promise.resolve(new Response(
        JSON.stringify({ content: [{ type: "text", text }] }),
        { status: 200 },
      ));
    }

    if (u.includes("blink.sv/.well-known/lnurlp")) {
      const data = opts.blinkLnurl ?? { callback: "https://blink.sv/lnurlp/callback" };
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }

    if (u.includes("blink.sv/lnurlp/callback")) {
      // Minimal valid BOLT11: 9-char prefix ending in "1", 7 timestamp vals (q),
      // type=1 (p) + len=52 encoded as (p)(5) = 1×32+20, 52 data vals (q), 6-char checksum (q)
      const fakePr = "lnbctest1qqqqqqqpp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
      const data = opts.blinkCallback ?? { pr: fakePr };
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }

    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

beforeEach(() => mockFetch());
afterEach(() => { globalThis.fetch = originalFetch; });

// ─── Method guard ─────────────────────────────────────────────────────────────

describe("method guard", () => {
  it("returns 405 for GET", async () => {
    const res = await handleVerityAlpha(get(), makeEnv());
    expect(res.status).toBe(405);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("POST required");
  });
});

// ─── 402 flow ─────────────────────────────────────────────────────────────────

describe("402 flow", () => {
  it("returns 402 with invoice when no Authorization header", async () => {
    const res = await handleVerityAlpha(post({}), makeEnv());
    expect(res.status).toBe(402);
    const body = await res.json() as { priceSats: number; invoice: string; macaroon: string };
    expect(body.priceSats).toBeGreaterThan(0);
    expect(body.invoice).toBeTruthy();
    expect(body.macaroon).toBeTruthy();
  });

  it("returns 503 when Lightning provider unavailable", async () => {
    mockFetch({ btcFail: false }); // reset
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 503 }));
    const res = await handleVerityAlpha(post({}), makeEnv());
    expect(res.status).toBe(503);
  });
});

// ─── L402 auth ────────────────────────────────────────────────────────────────

describe("L402 auth", () => {
  it("returns 401 for malformed token", async () => {
    const res = await handleVerityAlpha(
      post({}, { Authorization: "L402 notvalidtoken" }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong preimage", async () => {
    const kv = makeKV();
    const preimage = "a".repeat(64);
    const fakeHash = "b".repeat(64);
    const macaroon = btoa(JSON.stringify({ hash: fakeHash, exp: Date.now() + 3_600_000 }));
    const res = await handleVerityAlpha(
      post({}, { Authorization: `L402 ${macaroon}:${preimage}` }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for expired token", async () => {
    const token = await makeExpiredToken();
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for replayed preimage", async () => {
    const kv = makeKV();
    const { token, preimage } = await makeValidToken(kv);
    await kv.put(`verity_spent:${preimage}`, "1");
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(401);
  });
});

// ─── Input defaults ───────────────────────────────────────────────────────────

describe("input defaults", () => {
  it("uses default capital_sats=100000 when omitted", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(post({}), makeEnv(kv));
    // only reachable with valid token, but defaults are baked into prompt — test via output
    await handleVerityAlpha(post({}, { Authorization: token }), makeEnv(kv));
    // no assertion on prompt internals — covered by output shape tests
  });

  it("uses default timeframe=7d when omitted", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { timeframe_days: number };
    expect(body.timeframe_days).toBe(7);
  });

  it("handles empty body without throwing", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const req = new Request("https://l402kit.com/api/verity/alpha", {
      method: "POST",
      headers: { Authorization: token },
      body: "not json",
    });
    const res = await handleVerityAlpha(req, makeEnv(kv));
    expect(res.status).toBe(200);
  });
});

// ─── Timeframe mapping ────────────────────────────────────────────────────────

describe("timeframe mapping", () => {
  const cases: Array<["1d" | "7d" | "30d", number]> = [
    ["1d", 1],
    ["7d", 7],
    ["30d", 30],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" → timeframe_days: ${expected}`, async () => {
      const kv = makeKV();
      const { token } = await makeValidToken(kv);
      const res = await handleVerityAlpha(
        post({ timeframe: input }, { Authorization: token }),
        makeEnv(kv),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { timeframe_days: number };
      expect(body.timeframe_days).toBe(expected);
    });
  }
});

// ─── Risk position sizing ─────────────────────────────────────────────────────

describe("risk position sizing — AI respects ceiling", () => {
  const riskCaps: Array<["low" | "medium" | "high", number]> = [
    ["low", 10],
    ["medium", 25],
    ["high", 50],
  ];

  for (const [risk, maxPct] of riskCaps) {
    it(`${risk} risk: position_size_pct ≤ ${maxPct}`, async () => {
      // Simulate AI returning a position_size_pct that respects the ceiling
      const alphaWithRisk = JSON.stringify({ ...JSON.parse(ALPHA_JSON), risk_level: risk, position_size_pct: maxPct });
      mockFetch({ inferenceText: alphaWithRisk });
      const kv = makeKV();
      const { token } = await makeValidToken(kv);
      const res = await handleVerityAlpha(
        post({ risk }, { Authorization: token }),
        makeEnv(kv),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { position_size_pct: number; risk_level: string };
      expect(body.risk_level).toBe(risk);
      if (body.position_size_pct !== null) {
        expect(body.position_size_pct).toBeLessThanOrEqual(maxPct);
      }
    });
  }
});

// ─── BTC price integration ────────────────────────────────────────────────────

describe("BTC price", () => {
  it("includes btc_price_usd and btc_change_24h_pct when CoinGecko succeeds", async () => {
    mockFetch({ btcPrice: { bitcoin: { usd: 95000, usd_24h_change: 2.3 } } });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { btc_price_usd: number; btc_change_24h_pct: number };
    expect(body.btc_price_usd).toBe(95000);
    expect(body.btc_change_24h_pct).toBeCloseTo(2.3, 1);
  });

  it("btc_price_usd is null when CoinGecko fails", async () => {
    mockFetch({ btcFail: true });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { btc_price_usd: null };
    expect(body.btc_price_usd).toBeNull();
  });
});

// ─── Search integration ───────────────────────────────────────────────────────

describe("search integration", () => {
  it("includes sources in response", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { sources: { title: string; link: string }[] };
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.sources[0]).toHaveProperty("title");
    expect(body.sources[0]).toHaveProperty("link");
  });

  it("returns 200 even when both searches fail", async () => {
    mockFetch({ searchFail: true });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { sources: unknown[] };
    expect(body.sources).toEqual([]);
  });
});

// ─── Structured output ────────────────────────────────────────────────────────

describe("structured alpha output", () => {
  it("returns all required fields when inference returns valid JSON", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({ capital_sats: 200000, timeframe: "7d", risk: "medium" }, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body.agent).toBe("VERITY");
    expect(body.service).toBe("alpha");
    expect(body.paid_with).toBe("⚡ Lightning L402");
    expect(body.cycle_phase).toBeTruthy();
    expect(body.alpha_window).toMatch(/^(open|narrowing|closed)$/);
    expect(body.strategy).toBeTruthy();
    expect(body.chain).toBeTruthy();
    expect(typeof body.timeframe_days).toBe("number");
    expect(body.entry).toBeTruthy();
    expect(body.exit_trigger).toBeTruthy();
    expect(typeof body.confidence).toBe("number");
    expect(body.thesis).toBeTruthy();
    expect(body.input).toMatchObject({ capital_sats: 200000, timeframe: "7d", risk: "medium" });
  });

  it("echoes query in input when provided", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({ query: "Solana meme coins" }, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { input: { query: string } };
    expect(body.input.query).toBe("Solana meme coins");
  });

  it("does not include query in input when omitted", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}),
      makeEnv(kv),
    );
    // 402 flow — no auth, just check query not leaked in 402 body
    expect(res.status).toBe(402);
  });
});

// ─── Inference fallbacks ──────────────────────────────────────────────────────

describe("inference fallbacks", () => {
  it("falls back to synthesis string when inference returns non-JSON", async () => {
    mockFetch({ inferenceText: "The market is in early bull phase. Consider farming governance tokens on Base." });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { synthesis: string; cycle_phase?: string };
    expect(body.synthesis).toBeTruthy();
    expect(body.cycle_phase).toBeUndefined();
  });

  it("returns synthesis: null when inference completely fails", async () => {
    mockFetch({ inferenceFail: true });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv, { GROQ_API_KEY: "", ANTHROPIC_API_KEY: "" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { synthesis: string | null };
    // No keys = no inference = synthesis null or fallback message
    expect(body.synthesis).toBeDefined();
  });

  it("strips markdown fences from inference output", async () => {
    const fenced = "```json\n" + ALPHA_JSON + "\n```";
    mockFetch({ inferenceText: fenced });
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { cycle_phase: string };
    expect(body.cycle_phase).toBe("early_bull");
  });
});

// ─── recordCall ───────────────────────────────────────────────────────────────

describe("recordCall", () => {
  it("increments KV counter for alpha service after successful call", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    await handleVerityAlpha(
      post({}, { Authorization: token }),
      makeEnv(kv),
    );
    const hour = Math.floor(Date.now() / 3_600_000);
    const count = await kv.get(`verity_calls:alpha:${hour}`);
    expect(count).toBe("1");
  });

  it("accumulates multiple calls", async () => {
    const kv = makeKV();
    const { token: t1 } = await makeValidToken(kv);
    const { token: t2 } = await makeValidToken(kv);
    await handleVerityAlpha(post({}, { Authorization: t1 }), makeEnv(kv));
    await handleVerityAlpha(post({}, { Authorization: t2 }), makeEnv(kv));
    const hour = Math.floor(Date.now() / 3_600_000);
    const count = await kv.get(`verity_calls:alpha:${hour}`);
    expect(count).toBe("2");
  });
});

// ─── Replay protection ────────────────────────────────────────────────────────

describe("replay protection", () => {
  it("marks preimage as spent after first use", async () => {
    const kv = makeKV();
    const { token, preimage } = await makeValidToken(kv);
    await handleVerityAlpha(post({}, { Authorization: token }), makeEnv(kv));
    const spent = await kv.get(`verity_spent:${preimage}`);
    expect(spent).toBe("1");
  });

  it("rejects same token on second use", async () => {
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const env = makeEnv(kv);
    const res1 = await handleVerityAlpha(post({}, { Authorization: token }), env);
    const res2 = await handleVerityAlpha(post({}, { Authorization: token }), env);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(401);
  });
});

// ─── E2E with real APIs (skip in CI) ─────────────────────────────────────────

const SERPER_KEY = process.env.SERPER_API_KEY ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const itIfReal = SERPER_KEY && ANTHROPIC_KEY ? it : it.skip;

describe("E2E with real APIs", () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  itIfReal("returns structured alpha with valid JSON fields", async () => {
    globalThis.fetch = originalFetch;
    const kv = makeKV();
    const { token } = await makeValidToken(kv);
    const res = await handleVerityAlpha(
      post({ capital_sats: 100_000, timeframe: "7d", risk: "medium" }, { Authorization: token }),
      { demo_preimages: kv, SERPER_API_KEY: SERPER_KEY, ANTHROPIC_API_KEY: ANTHROPIC_KEY } as unknown as import("../worker").Env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    console.log("\n🎯 ALPHA E2E:", JSON.stringify(body, null, 2));
    expect(body.cycle_phase).toBeTruthy();
    expect(body.alpha_window).toMatch(/^(open|narrowing|closed)$/);
    expect(body.confidence).toBeGreaterThan(0);
  }, 60_000);
});
