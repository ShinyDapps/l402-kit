/**
 * TDD — Partner activation: earn-first gate
 *
 * Regra: VERITY só ativa um parceiro como consumidor L402
 * se já vendeu (tem earnings nas últimas 24h).
 *
 * Cobertura:
 *   - hasEarned(): false quando nenhuma venda
 *   - hasEarned(): true quando qualquer serviço tem success > 0
 *   - hasEarned(): acumula múltiplos serviços / horas
 *   - activatePartnerIfEarning(): sem earnings → não escreve KV
 *   - activatePartnerIfEarning(): com earnings, lista vazia → não escreve
 *   - activatePartnerIfEarning(): com earnings, parceiro válido → escreve KV
 *   - activatePartnerIfEarning(): com earnings, múltiplos → usa o primeiro
 *   - activatePartnerIfEarning(): sem earnings → log deferred, não escreve
 *   - runPartnersRadar(): sem SERPER_API_KEY → pula silenciosamente
 *   - runPartnersRadar(): probe retorna 200 (não 402) → não ativa parceiro
 *   - runPartnersRadar(): probe retorna 402 + earnings → ativa parceiro no KV
 *   - runPartnersRadar(): probe retorna 402 mas sem earnings → não ativa
 */

import { hasEarned, activatePartnerIfEarning } from "../verity/cron/partners";
import { runPartnersRadar } from "../verity/cron/partners";
import { DEFAULTS } from "../verity/pricing";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get:  async (k: string) => store.get(k) ?? null,
    put:  async (k: string, v: string, _opts?: unknown) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

function makeEnv(kv?: KVNamespace, overrides: Record<string, string> = {}): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    SERPER_API_KEY: "test-serper",
    ...overrides,
  } as unknown as import("../worker").Env;
}

function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000);
}

// ─── hasEarned ────────────────────────────────────────────────────────────────

describe("hasEarned()", () => {
  test("returns false when KV has no success keys", async () => {
    const env = makeEnv(makeKV());
    expect(await hasEarned(env)).toBe(false);
  });

  test("returns true when one service has a success in current hour", async () => {
    const hour = currentHour();
    const env = makeEnv(makeKV({ [`verity_success:btcprice:${hour}`]: "3" }));
    expect(await hasEarned(env)).toBe(true);
  });

  test("returns true when success is in a past hour (within 24h)", async () => {
    const hour = currentHour() - 5;
    const env = makeEnv(makeKV({ [`verity_success:search:${hour}`]: "1" }));
    expect(await hasEarned(env)).toBe(true);
  });

  test("returns false when success key exists but value is 0", async () => {
    const hour = currentHour();
    const env = makeEnv(makeKV({ [`verity_success:btcprice:${hour}`]: "0" }));
    expect(await hasEarned(env)).toBe(false);
  });

  test("accumulates across multiple services and hours", async () => {
    const hour = currentHour();
    const env = makeEnv(makeKV({
      [`verity_success:search:${hour}`]:    "2",
      [`verity_success:sentiment:${hour - 2}`]: "1",
      [`verity_success:btcprice:${hour - 10}`]: "5",
    }));
    expect(await hasEarned(env)).toBe(true);
  });

  test("ignores error keys — only success counts", async () => {
    const hour = currentHour();
    const env = makeEnv(makeKV({ [`verity_error:search:${hour}`]: "10" }));
    expect(await hasEarned(env)).toBe(false);
  });
});

// ─── activatePartnerIfEarning ─────────────────────────────────────────────────

describe("activatePartnerIfEarning()", () => {
  test("does NOT write KV when VERITY has no earnings", async () => {
    const kv = makeKV({
      "verity_radar:partners:list": JSON.stringify([
        { url: "https://partner.example.com/api/alpha", status: "active" },
      ]),
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    await activatePartnerIfEarning(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBeUndefined();
  });

  test("does NOT write KV when partner list is empty (even with earnings)", async () => {
    const hour = currentHour();
    const kv = makeKV({
      [`verity_success:btcprice:${hour}`]: "5",
      "verity_radar:partners:list": JSON.stringify([]),
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    await activatePartnerIfEarning(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBeUndefined();
  });

  test("writes KV when VERITY has earnings and a valid partner exists", async () => {
    const hour = currentHour();
    const partnerUrl = "https://partner.example.com/api/alpha";
    const kv = makeKV({
      [`verity_success:search:${hour}`]: "3",
      "verity_radar:partners:list": JSON.stringify([
        { url: partnerUrl, status: "active" },
      ]),
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    await activatePartnerIfEarning(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBe(partnerUrl);
  });

  test("picks the first partner when multiple are available", async () => {
    const hour = currentHour();
    const firstUrl = "https://first.example.com/api";
    const kv = makeKV({
      [`verity_success:alpha:${hour}`]: "1",
      "verity_radar:partners:list": JSON.stringify([
        { url: firstUrl, status: "active" },
        { url: "https://second.example.com/api", status: "active" },
      ]),
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    await activatePartnerIfEarning(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBe(firstUrl);
  });

  test("replaces existing partner URL when new partner list available with earnings", async () => {
    const hour = currentHour();
    const newPartnerUrl = "https://new-partner.example.com/api";
    const kv = makeKV({
      [`verity_success:translate:${hour}`]: "2",
      "verity_config:alpha_partner_url": "https://old-partner.example.com/api",
      "verity_radar:partners:list": JSON.stringify([
        { url: newPartnerUrl, status: "active" },
      ]),
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    await activatePartnerIfEarning(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBe(newPartnerUrl);
  });
});

// ─── runPartnersRadar integration ─────────────────────────────────────────────

describe("runPartnersRadar() — earn-first integration", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("skips silently when no SERPER_API_KEY", async () => {
    const kv = makeKV() as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);
    // Remove SERPER_API_KEY
    (env as unknown as Record<string, unknown>).SERPER_API_KEY = undefined;

    await expect(runPartnersRadar(env)).resolves.toBeUndefined();
    expect(kv._store.get("verity_config:alpha_partner_url")).toBeUndefined();
  });

  test("does NOT activate partner when probe returns 200 (not L402)", async () => {
    const hour = currentHour();
    const kv = makeKV({
      [`verity_success:btcprice:${hour}`]: "10",
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    let callCount = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("serper")) {
        callCount++;
        return new Response(JSON.stringify({
          organic: [{ title: "L402 API example", link: "https://api.example.com/v1", snippet: "l402 payment" }],
        }), { status: 200 });
      }
      // Partner probe returns 200, not 402
      return new Response("OK", { status: 200 });
    };

    await runPartnersRadar(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBeUndefined();
  });

  test("activates partner when probe returns 402 AND VERITY has earnings", async () => {
    const hour = currentHour();
    const partnerUrl = "https://api.example.com/v1";
    const kv = makeKV({
      [`verity_success:search:${hour}`]: "7",
    }) as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("serper")) {
        return new Response(JSON.stringify({
          organic: [{ title: "l402 pay-per-call API", link: partnerUrl, snippet: "l402 micropayment api" }],
        }), { status: 200 });
      }
      // Partner probe returns 402 — valid L402 endpoint
      return new Response("Payment Required", {
        status: 402,
        headers: { "WWW-Authenticate": "L402 macaroon=\"abc\", invoice=\"lnbc\"" },
      });
    };

    await runPartnersRadar(env);

    expect(kv._store.get("verity_config:alpha_partner_url")).toBe(partnerUrl);
  });

  test("does NOT activate partner when probe returns 402 but VERITY has no earnings", async () => {
    const partnerUrl = "https://api.example.com/v1";
    // No success keys in KV
    const kv = makeKV() as KVNamespace & { _store: Map<string, string> };
    const env = makeEnv(kv);

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("serper")) {
        return new Response(JSON.stringify({
          organic: [{ title: "l402 pay-per-call API", link: partnerUrl, snippet: "l402 micropayment api" }],
        }), { status: 200 });
      }
      return new Response("Payment Required", {
        status: 402,
        headers: { "WWW-Authenticate": "L402 macaroon=\"abc\", invoice=\"lnbc\"" },
      });
    };

    await runPartnersRadar(env);

    // Partner discovered and stored in radar list, but NOT activated for consumption
    expect(kv._store.get("verity_config:alpha_partner_url")).toBeUndefined();
  });
});
