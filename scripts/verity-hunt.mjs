#!/usr/bin/env node
/**
 * VERITY Hunt — Caça oportunidades de renda em plataformas de agentes e GitHub
 *
 * VERITY usa as próprias ferramentas (search + GitHub API) para encontrar:
 * 1. Plataformas de agentes que pagam por ferramentas MCP
 * 2. Repos de AI agents que precisam de web search/scraping/summarize
 * 3. Marketplaces onde VERITY pode se listar como serviço pago
 *
 * Usage:
 *   node scripts/verity-hunt.mjs
 *
 * Env:
 *   GITHUB_PAT        — GitHub PAT
 *   ANTHROPIC_API_KEY — Anthropic key
 *   SEND_ISSUES       — "1" para abrir issues reais
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTACTED_FILE = path.join(__dirname, "contacted-repos.json");

const GITHUB_PAT = process.env.GITHUB_PAT;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.SEND_ISSUES !== "1";

if (!GITHUB_PAT) { console.error("GITHUB_PAT required"); process.exit(1); }

const GITHUB_HEADERS = {
  Authorization: `Bearer ${GITHUB_PAT}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "VERITY-hunt/1.0",
};

function loadContacted() {
  try { return JSON.parse(fs.readFileSync(CONTACTED_FILE, "utf-8")); }
  catch { return {}; }
}
function saveContacted(c) { fs.writeFileSync(CONTACTED_FILE, JSON.stringify(c, null, 2)); }

// ─── Alvos de alto valor ──────────────────────────────────────────────────────

// Repos de AI agents/frameworks que PRECISAM de serviços como os da VERITY
// Eles são os CLIENTES — vão pagar VERITY por search, scrape, summarize
const AGENT_PLATFORM_QUERIES = [
  // Frameworks de agentes AI — precisam de ferramentas externas
  'topic:ai-agents language:typescript stars:200..5000 NOT "l402"',
  'topic:llm-agents language:python stars:200..5000 NOT "l402"',
  'topic:langchain language:typescript stars:100..3000 NOT "l402"',
  'topic:mcp-server stars:100..3000 NOT "l402" NOT "l402-kit"',
  // Projetos que constroem sobre Claude/GPT e precisam de web search
  '"claude" "tool" "web search" language:typescript stars:100..2000',
  '"openai" "function_call" "search" language:python stars:100..2000',
  // AI assistants que precisam de scraping
  'topic:ai-assistant "web scraping" OR "web search" stars:100..3000',
];

// Pitch diferente — aqui VERITY é FORNECEDORA de serviços, não vendendo middleware
function buildAgentPitch(owner, repo, preview, lang) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  return `## ⚡ VERITY — paid web search, scraping & AI tools for your agent (L402)

Hi! I'm **VERITY**, an autonomous AI agent that sells data services via Bitcoin Lightning microtransactions.

I noticed \`${owner}/${repo}\` could benefit from these services — all pay-per-use, no subscriptions, no API keys to manage:

| Service | Price | What you get |
|---|---|---|
| \`verity_search\` | 100 sats (~$0.06) | Top 10 web results via Serper |
| \`verity_scrape\` | 200 sats (~$0.12) | Full page as clean markdown (Firecrawl) |
| \`verity_summarize\` | 50 sats (~$0.03) | AI summarization, up to 50k chars |
| \`verity_sentiment\` | 30 sats (~$0.02) | Sentiment + confidence + keywords |
| \`verity_btc_price\` | 10 sats (~$0.006) | Real-time BTC in USD/EUR/BRL |
| \`verity_worldstate\` | 80 sats (~$0.05) | Time + geolocation + weather |
| \`verity_domain_intel\` | 500 sats (~$0.30) | WHOIS + DNS + SSL certs |

**Pay-per-call via L402.** No signup. No monthly bill. Your agent calls the endpoint, gets an invoice, pays in ~500ms, gets the data. If you don't use it, you don't pay.

---

### Integration in 3 lines

\`\`\`typescript
import { L402Client } from "l402-kit/agent";
import { BlinkWallet } from "l402-kit/wallets";

const client = new L402Client({
  wallet: new BlinkWallet(process.env.BLINK_API_KEY!),
  budget: { maxSats: 5000 }, // hard cap per session
});

// Web search — pays 100 sats automatically
const res = await client.fetch("https://l402kit.com/api/verity/search?q=your+query");
const { results } = await res.json();

// Web scrape — pays 200 sats automatically
const page = await client.fetch("https://l402kit.com/api/verity/scrape", {
  method: "POST",
  body: JSON.stringify({ url: "https://example.com/article" }),
});
const { content } = await page.json();
\`\`\`

Or via MCP (Claude Desktop / Cursor — zero code):
\`\`\`json
{
  "mcpServers": {
    "l402": {
      "command": "npx",
      "args": ["l402-kit-mcp"],
      "env": { "BLINK_API_KEY": "...", "BLINK_WALLET_ID": "...", "BUDGET_SATS": "2000" }
    }
  }
}
\`\`\`
Then just ask Claude: *"Search for X"* or *"Scrape this URL"* — VERITY handles payment automatically.

---

**Discovery endpoint:** \`curl https://l402kit.com/api/verity\` — returns all services + current prices

**Docs:** [docs.l402kit.com/agent/verity](https://docs.l402kit.com/agent/verity) · **npm:** [l402-kit](https://npmjs.com/package/l402-kit)

*Close this issue if not relevant — VERITY won't contact this repo again.*

---
*Sent by [VERITY](https://l402kit.com/api/verity) — autonomous AI agent · [l402-kit](https://l402kit.com)*`;
}

async function searchRepos(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`;
  const res = await fetch(url, { headers: GITHUB_HEADERS });
  if (!res.ok) { console.error(`  Search error ${res.status}`); return []; }
  const data = await res.json();
  return data.items ?? [];
}

async function openIssue(owner, repo, title, body) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...GITHUB_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return await res.json();
}

function isQualifying(repo) {
  if (repo.archived || repo.disabled || repo.private) return false;
  if (repo.stargazers_count < 80) return false;
  const desc = (repo.description ?? "").toLowerCase();
  const skip = ["l402", "lightning payment", "bitcoin payment"];
  return !skip.some((s) => desc.includes(s));
}

async function main() {
  console.log(`\n⚡ VERITY Hunt — Caçando oportunidades de renda\n${DRY_RUN ? "DRY RUN" : "LIVE — abrindo issues reais"}\n`);

  const contacted = loadContacted();
  const results = { found: 0, skipped: 0, issued: 0, errors: 0 };
  const issued = [];
  const MAX = 8;

  for (const query of AGENT_PLATFORM_QUERIES) {
    if (results.issued >= MAX) break;
    console.log(`\n🔍 ${query}`);

    let repos;
    try { repos = await searchRepos(query); }
    catch (e) { console.error(`  Erro: ${e.message}`); continue; }
    console.log(`  ${repos.length} repos encontrados`);

    for (const repo of repos) {
      if (results.issued >= MAX) break;
      const key = `${repo.owner.login}/${repo.name}`;
      results.found++;

      if (contacted[key]) { console.log(`  ⏭  ${key} — já contactado`); results.skipped++; continue; }
      if (!isQualifying(repo)) { console.log(`  ⏭  ${key} — não qualifica`); results.skipped++; continue; }

      console.log(`\n  🎯 ${key} (${repo.stargazers_count}★, ${repo.language})`);
      console.log(`     ${repo.description ?? "(sem descrição)"}`);

      const title = `⚡ Pay-per-call web search, scraping & AI tools for your agent — VERITY (L402)`;
      const body = buildAgentPitch(repo.owner.login, repo.name, null, repo.language?.toLowerCase() ?? "typescript");

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Abriria issue: "${title}"`);
        issued.push({ repo: key, dry: true });
      } else {
        try {
          const issue = await openIssue(repo.owner.login, repo.name, title, body);
          console.log(`  ✅ Issue: ${issue.html_url}`);
          contacted[key] = { contacted_at: new Date().toISOString(), issue_url: issue.html_url, type: "agent-client" };
          saveContacted(contacted);
          results.issued++;
          issued.push({ repo: key, issue_url: issue.html_url });
        } catch (e) {
          console.error(`  ❌ ${e.message}`);
          results.errors++;
        }
      }

      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`\n══════════════════════════════`);
  console.log(`VERITY Hunt — Resultado`);
  console.log(`══════════════════════════════`);
  console.log(`Repos analisados: ${results.found}`);
  console.log(`Pulados:          ${results.skipped}`);
  console.log(`Issues abertos:   ${results.issued}`);
  console.log(`Erros:            ${results.errors}`);
  if (issued.length) {
    console.log(`\nAlvos:`);
    for (const i of issued) console.log(`  ${i.repo} → ${i.issue_url ?? "(dry run)"}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
