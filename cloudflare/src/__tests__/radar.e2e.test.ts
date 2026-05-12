/**
 * E2E test — RADAR v1 com Serper API real
 * Só roda quando SERPER_API_KEY está definida (CI skip automático).
 *
 * Run: $env:SERPER_API_KEY='...' npx jest radar.e2e --no-coverage
 */

import { runRadar } from "../verity/cron/radar";
import { dequeueAll } from "../verity/radar/queue";
import type { QueueKey } from "../verity/radar/types";

const SERPER_KEY = process.env.SERPER_API_KEY ?? "";
const GITHUB_PAT = process.env.GITHUB_PAT ?? "";

const itIfReal = SERPER_KEY ? it : it.skip;

function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get:  async (k: string) => store.get(k) ?? null,
    put:  async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

function makeEnv(): import("../worker").Env {
  return {
    demo_preimages: makeKV(),
    SERPER_API_KEY: SERPER_KEY,
    GITHUB_PAT,
    RESEND_API_KEY: "", // sem email no teste
  } as unknown as import("../worker").Env;
}

describe("RADAR v1 — E2E com Serper real", () => {
  itIfReal("completa run e escreve log no KV", async () => {
    const env = makeEnv();
    await runRadar(env);

    const slot = new Date().toISOString().slice(0, 13);
    const raw = await env.demo_preimages.get(`verity_radar:log:${slot}`);
    expect(raw).not.toBeNull();

    const log = JSON.parse(raw!);
    console.log("\n📊 RADAR E2E log:", JSON.stringify(log, null, 2));
    expect(log.found).toBeGreaterThanOrEqual(0);
    expect(log.errors).toBe(0); // sem erros inesperados
  }, 60_000);

  itIfReal("retorna leads válidos nas filas", async () => {
    const env = makeEnv();
    await runRadar(env);

    const keys: QueueKey[] = [
      "verity_radar:pending:human:hot",
      "verity_radar:pending:human:warm",
      "verity_radar:pending:agent:hot",
      "verity_radar:pending:agent:warm",
    ];

    let totalLeads = 0;
    for (const key of keys) {
      const leads = await dequeueAll(key, env);
      totalLeads += leads.length;
      for (const lead of leads) {
        console.log(`\n[${key.split(":").slice(-2).join(":")}] score=${lead.score} fw=${lead.framework ?? "?"}`);
        console.log(`  ${lead.title.slice(0, 80)}`);
        console.log(`  ${lead.url}`);
        expect(lead.url).toMatch(/^https?:\/\//);
        expect(lead.signal).toMatch(/^(hot|warm)$/);
        expect(lead.score).toBeGreaterThanOrEqual(3);
      }
    }
    console.log(`\n✅ Total de leads qualificados: ${totalLeads}`);
  }, 60_000);

  itIfReal("deduplica — nenhum URL aparece mais de uma vez nas filas", async () => {
    const env = makeEnv();
    await runRadar(env); // run 1
    await runRadar(env); // run 2 — Serper pode retornar resultados ligeiramente diferentes

    const keys: QueueKey[] = [
      "verity_radar:pending:human:hot",
      "verity_radar:pending:human:warm",
      "verity_radar:pending:agent:hot",
      "verity_radar:pending:agent:warm",
    ];

    const allLeads = (await Promise.all(keys.map(k => dequeueAll(k, env)))).flat();
    const urls = allLeads.map(l => l.url);
    const uniqueUrls = new Set(urls);

    // Nenhum URL duplicado entre os dois runs
    expect(uniqueUrls.size).toBe(urls.length);
    console.log(`\n✅ ${urls.length} leads únicos após 2 runs`);
  }, 120_000);
});
