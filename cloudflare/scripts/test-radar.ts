/// <reference types="@cloudflare/workers-types" />
/**
 * E2E manual do RADAR v1 — roda localmente com SERPER_API_KEY real.
 * Executa: npx ts-node --skip-project scripts/test-radar.ts
 */

import { runRadar } from "../src/verity/cron/radar";
import { dequeueAll } from "../src/verity/radar/queue";
import type { QueueKey } from "../src/verity/radar/types";

// ─── KV em memória ────────────────────────────────────────────────────────────

function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get:  async (k: string) => { const v = store.get(k); return v ?? null; },
    put:  async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

// ─── Env com credenciais reais ────────────────────────────────────────────────

const kv = makeKV();

const env = {
  demo_preimages: kv,
  SERPER_API_KEY: process.env.SERPER_API_KEY ?? "",
  GITHUB_PAT:     process.env.GITHUB_PAT ?? "",
  RESEND_API_KEY: "", // não envia email no teste local
} as unknown as import("../src/worker").Env;

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!env.SERPER_API_KEY) {
    console.error("❌ SERPER_API_KEY não definida. Use: $env:SERPER_API_KEY='...' antes de rodar.");
    process.exit(1);
  }

  console.log("🔍 RADAR v1 — iniciando run E2E...\n");

  const start = Date.now();
  await runRadar(env);
  const elapsed = Date.now() - start;

  console.log(`\n✅ Run concluído em ${elapsed}ms\n`);

  // ─── Queues ────────────────────────────────────────────────────────────────

  const keys: QueueKey[] = [
    "verity_radar:pending:human:hot",
    "verity_radar:pending:human:warm",
    "verity_radar:pending:agent:hot",
    "verity_radar:pending:agent:warm",
  ];

  for (const key of keys) {
    const leads = await dequeueAll(key, env);
    if (leads.length === 0) continue;
    console.log(`\n📋 ${key} (${leads.length} lead${leads.length > 1 ? "s" : ""})`);
    for (const lead of leads) {
      console.log(`  score=${lead.score} fw=${lead.framework ?? "?"} | ${lead.title.slice(0, 70)}`);
      console.log(`  ${lead.url}`);
    }
  }

  // ─── Log ──────────────────────────────────────────────────────────────────

  const slot = new Date().toISOString().slice(0, 13);
  const raw = await kv.get(`verity_radar:log:${slot}`);
  if (raw) {
    const log = JSON.parse(raw);
    console.log("\n📊 Log do run:");
    console.log(`  found:   ${log.found}`);
    console.log(`  queued:  ${log.queued}`);
    console.log(`  skipped: ${log.skipped}`);
    console.log(`  errors:  ${log.errors}`);
  }
}

main().catch(console.error);
