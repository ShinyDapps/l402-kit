/**
 * TDD — Reputation tracking + Bonus budget
 *
 * Fix 1: recordSuccess / recordError em cada handler
 * Fix 2: applyBonusBudget chamado no fiscal agent
 *
 * Cobertura:
 *   - recordSuccess/recordError: escrevem nas chaves corretas do KV
 *   - Acumulação: múltiplas chamadas somam corretamente
 *   - Integração: sentiment, summarize, btcprice registram reputação
 *   - Fiscal: applyBonusBudget aplicado após relatório diário
 */

import { recordSuccess, recordError } from "../verity/pricing";
import { handleVeritySentiment }  from "../verity/services/sentiment";
import { handleVeritySummarize }  from "../verity/services/summarize";
import { handleVerityBtcPrice }   from "../verity/services/btcprice";
import { runFiscalAgent }         from "../verity/cron/fiscal";

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
    ANTHROPIC_API_KEY: "test-key",
    SERPER_API_KEY: "test-serper",
    ...overrides,
  } as unknown as import("../worker").Env;
}

function bytesToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function makeValidToken(kv: KVNamespace): Promise<string> {
  const preimageBytes = crypto.getRandomValues(new Uint8Array(32));
  const preimage = bytesToHex(preimageBytes);
  const hashBuf = await crypto.subtle.digest("SHA-256", preimageBytes);
  const hash = bytesToHex(new Uint8Array(hashBuf));
  const macaroon = btoa(JSON.stringify({ hash, exp: Date.now() + 3_600_000 }));
  return `L402 ${macaroon}:${preimage}`;
}

function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000);
}

const FAKE_BOLT11 = "lnbctest1qqqqqqqpp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

const originalFetch = globalThis.fetch;

function mockFetch(opts: {
  inferenceFail?: boolean;
  inferenceText?: string;
  btcFail?: boolean;
} = {}): void {
  globalThis.fetch = (url: string | URL | Request): Promise<Response> => {
    const u = url.toString();
    if (u.includes("groq.com") || u.includes("anthropic.com")) {
      if (opts.inferenceFail) return Promise.resolve(new Response(null, { status: 500 }));
      const text = opts.inferenceText ?? '{"sentiment":"positive","score":0.9,"confidence":0.8,"keywords":["test"]}';
      if (u.includes("groq.com")) return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 }));
    }
    if (u.includes("coingecko.com") || u.includes("coinbase.com")) {
      if (opts.btcFail) return Promise.resolve(new Response(null, { status: 500 }));
      if (u.includes("coinbase.com/v2/prices/BTC-USD")) return Promise.resolve(new Response(JSON.stringify({ data: { amount: "95000" } }), { status: 200 }));
      if (u.includes("coinbase.com/v2/prices/BTC-EUR")) return Promise.resolve(new Response(JSON.stringify({ data: { amount: "88000" } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ bitcoin: { usd: 95000, eur: 88000, brl: 530000 } }), { status: 200 }));
    }
    if (u.includes("blink.sv/.well-known/lnurlp")) {
      return Promise.resolve(new Response(JSON.stringify({ callback: "https://blink.sv/lnurlp/callback" }), { status: 200 }));
    }
    if (u.includes("blink.sv/lnurlp/callback")) {
      return Promise.resolve(new Response(JSON.stringify({ pr: FAKE_BOLT11 }), { status: 200 }));
    }
    if (u.includes("open-meteo.com")) {
      return Promise.resolve(new Response(null, { status: 500 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}

beforeEach(() => mockFetch());
afterEach(() => { globalThis.fetch = originalFetch; });

// ─── recordSuccess / recordError — unit ──────────────────────────────────────

describe("recordSuccess", () => {
  it("increments verity_success:{service}:{hour}", async () => {
    const kv = makeKV();
    await recordSuccess("sentiment", makeEnv(kv));
    const val = await kv.get(`verity_success:sentiment:${currentHour()}`);
    expect(val).toBe("1");
  });

  it("accumulates across multiple calls", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordSuccess("sentiment", env);
    await recordSuccess("sentiment", env);
    await recordSuccess("sentiment", env);
    const val = await kv.get(`verity_success:sentiment:${currentHour()}`);
    expect(val).toBe("3");
  });

  it("is independent per service", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordSuccess("sentiment", env);
    await recordSuccess("summarize", env);
    expect(await kv.get(`verity_success:sentiment:${currentHour()}`)).toBe("1");
    expect(await kv.get(`verity_success:summarize:${currentHour()}`)).toBe("1");
  });
});

describe("recordError", () => {
  it("increments verity_error:{service}:{hour}", async () => {
    const kv = makeKV();
    await recordError("sentiment", makeEnv(kv));
    const val = await kv.get(`verity_error:sentiment:${currentHour()}`);
    expect(val).toBe("1");
  });

  it("accumulates across multiple calls", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordError("sentiment", env);
    await recordError("sentiment", env);
    const val = await kv.get(`verity_error:sentiment:${currentHour()}`);
    expect(val).toBe("2");
  });

  it("success and error keys are independent", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await recordSuccess("search", env);
    await recordError("search", env);
    expect(await kv.get(`verity_success:search:${currentHour()}`)).toBe("1");
    expect(await kv.get(`verity_error:search:${currentHour()}`)).toBe("1");
  });
});

// ─── Handler integration: sentiment ──────────────────────────────────────────

describe("sentiment handler — reputation", () => {
  it("writes recordSuccess when inference succeeds", async () => {
    const kv = makeKV();
    const token = await makeValidToken(kv);
    await handleVeritySentiment(
      new Request("https://l402kit.com/api/verity/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ text: "Bitcoin is the future" }),
      }),
      makeEnv(kv),
    );
    const val = await kv.get(`verity_success:sentiment:${currentHour()}`);
    expect(val).toBe("1");
    expect(await kv.get(`verity_error:sentiment:${currentHour()}`)).toBeNull();
  });

  it("writes recordError when inference fails (503)", async () => {
    mockFetch({ inferenceFail: true });
    const kv = makeKV();
    const token = await makeValidToken(kv);
    const res = await handleVeritySentiment(
      new Request("https://l402kit.com/api/verity/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ text: "Bitcoin is the future" }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(503);
    const val = await kv.get(`verity_error:sentiment:${currentHour()}`);
    expect(val).toBe("1");
    expect(await kv.get(`verity_success:sentiment:${currentHour()}`)).toBeNull();
  });
});

// ─── Handler integration: summarize ──────────────────────────────────────────

describe("summarize handler — reputation", () => {
  it("writes recordSuccess on 200", async () => {
    mockFetch({ inferenceText: "Bitcoin is a decentralized currency." });
    const kv = makeKV();
    const token = await makeValidToken(kv);
    await handleVeritySummarize(
      new Request("https://l402kit.com/api/verity/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ text: "Long text about Bitcoin..." }),
      }),
      makeEnv(kv),
    );
    expect(await kv.get(`verity_success:summarize:${currentHour()}`)).toBe("1");
  });

  it("writes recordError on 503", async () => {
    mockFetch({ inferenceFail: true });
    const kv = makeKV();
    const token = await makeValidToken(kv);
    const res = await handleVeritySummarize(
      new Request("https://l402kit.com/api/verity/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ text: "Long text about Bitcoin..." }),
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(503);
    expect(await kv.get(`verity_error:summarize:${currentHour()}`)).toBe("1");
  });
});

// ─── Handler integration: btcprice (never fails) ─────────────────────────────

describe("btcprice handler — reputation", () => {
  it("always writes recordSuccess (even when CoinGecko fails)", async () => {
    mockFetch({ btcFail: true }); // CoinGecko fails, Coinbase also fails → returns {usd:0}
    const kv = makeKV();
    const token = await makeValidToken(kv);
    const res = await handleVerityBtcPrice(
      new Request("https://l402kit.com/api/verity/btc-price", {
        headers: { Authorization: token },
      }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    expect(await kv.get(`verity_success:btcprice:${currentHour()}`)).toBe("1");
    expect(await kv.get(`verity_error:btcprice:${currentHour()}`)).toBeNull();
  });
});

// ─── Fiscal agent: applyBonusBudget ──────────────────────────────────────────

describe("fiscal agent — applyBonusBudget", () => {
  it("applies bonus budget after running fiscal report", async () => {
    // Simulate 10.000 sats of weekly revenue
    const weekKey = (() => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const w = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
      return `${now.getFullYear()}-W${String(w).padStart(2, "0")}`;
    })();
    const kv = makeKV({ [`verity_revenue:${weekKey}`]: "10000" });
    await runFiscalAgent(makeEnv(kv));

    // 10% of 10.000 = 1.000 sats total bonus
    // 70% external = 700, 30% internal = 300
    const extBonus = await kv.get("verity_budget:external:bonus");
    const intBonus = await kv.get("verity_budget:internal:bonus");
    expect(extBonus).toBe("700");
    expect(intBonus).toBe("300");
  });

  it("bonus is zero when no weekly revenue", async () => {
    const kv = makeKV();
    await runFiscalAgent(makeEnv(kv));
    const extBonus = await kv.get("verity_budget:external:bonus");
    const intBonus = await kv.get("verity_budget:internal:bonus");
    // Both should be 0 (or not set — calculateBonusBudget returns 0 when no revenue)
    expect(extBonus === "0" || extBonus === null).toBe(true);
    expect(intBonus === "0" || intBonus === null).toBe(true);
  });

  it("fiscal report is still written even after applyBonusBudget", async () => {
    const kv = makeKV();
    await runFiscalAgent(makeEnv(kv));
    const today = new Date().toISOString().slice(0, 10);
    const report = await kv.get(`verity_fiscal:${today}`);
    expect(report).not.toBeNull();
    const parsed = JSON.parse(report!);
    expect(parsed.agent).toBe("VERITY");
  });
});
