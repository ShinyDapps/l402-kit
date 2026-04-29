# L402-Kit — Plano Master Status

Atualizado: 2026-04-29

## Phase 0 — Discovery & Machine-Readable Metadata

| ID | Tarefa | Status | Notas |
|----|--------|--------|-------|
| T001 | `.well-known/agent.json` | ✅ Done | `cloudflare/src/worker.ts` → `handleAgentJson()` |
| T002 | `.well-known/l402.json` | ✅ Done | `cloudflare/src/worker.ts` → `handleL402Json()` |
| T003 | DNS TXT `l402._payment.l402kit.com` | ✅ Done | Verificado via API Cloudflare |
| T004 | `llms.txt` atualizado | ✅ Done | MCP, Agent SDK no topo |
| T005 | `Accept-Payment` header no middleware | ✅ Done | `src/middleware.ts` + 3 testes |

## Phase 1 — Agent SDK & Docs

| ID | Tarefa | Status | Notas |
|----|--------|--------|-------|
| T010 | `docs/agent/system-prompt.mdx` | ✅ Done | Snippets LangChain/OpenAI/CrewAI/Vercel |
| T011 | `docs/agent/wallet-quickstart.mdx` | ✅ Done | Blink/Alby 60-second onboarding |
| T012 | `docs/agent/crewai.mdx` | ✅ Done | CrewAI full example |
| T013 | `docs/agent/openai-agents.mdx` | ✅ Done | Python + TypeScript |
| T014 | `docs/agent/vercel-ai.mdx` | ✅ Done | Next.js App Router |
| T015 | `docs/agent/autogpt.mdx` | ✅ Done | AutoGPT command pattern |
| T016 | `docs/reference/errors.mdx` | ✅ Done | 8 error codes documentados |
| T017 | `docs/agent/delegation.mdx` | ✅ Done | Orchestrator→sub-agent caveats |
| T018 | `docs/guides/dns-discovery.mdx` | ✅ Done | DNS TXT setup + dig verification |
| T019 | `docs/mint.json` atualizado | ✅ Done | Agent Integrations group, Reference |
| T020 | Docs URL `shinydapps.mintlify.app` → `docs.l402kit.com` | ✅ Done | `worker.ts` + wrangler routes |

## Phase 2 — Distribuição

| ID | Tarefa | Status | Notas |
|----|--------|--------|-------|
| T031 | `Accept-Payment` header | ✅ Done | Incluído em T005 |
| T032 | 402index.io registro | ⏳ Manual | Formulário web — fazer manualmente |
| T033 | Satring.com | ⏳ Manual | Custa 1.000 sats — fazer manualmente |
| T035 | MCP Market (glama.ai via punkpeye/awesome-mcp-servers) | ✅ Done | PR #5585: https://github.com/punkpeye/awesome-mcp-servers/pull/5585 |
| T035b | Fewsats/awesome-L402 | ✅ Done | PR #14 aberto |
| T036 | README `## For AI Agents` section | ✅ Done | MCP config, LangChain, framework compat |
| T040 | Badge SVG (dark/light/sm) | ✅ Done | Inlined em `worker.ts`, routes em `wrangler.toml` |
| T041 | x402 coluna na tabela de comparação | ✅ Done | `backend/index.html` |
| T042 | UptimeRobot status page | ✅ Done | https://stats.uptimerobot.com/57uOzF17jK — 6 monitors |

## Phase 3 — Qualidade & Testes

| ID | Tarefa | Status | Notas |
|----|--------|--------|-------|
| T043 | 448 testes passando | ✅ Done | `npm test` — 0 falhas |
| T044 | Workers tests `.well-known` | ✅ Done | 6 novos testes em `workers.test.ts` |
| T045 | Middleware `Accept-Payment` tests | ✅ Done | 3 testes em `middleware.test.ts` |

## Phase 4 — Divulgação

| ID | Tarefa | Status | Notas |
|----|--------|--------|-------|
| T050 | Show HN post | ✅ Draft | `SHOW_HN_DRAFT.md` — postar em news.ycombinator.com |
| T051 | DEV.to artigo | ✅ Draft | `DEVTO_ARTICLE_DRAFT.md` — publicar em dev.to |
| T052 | Discord Lightning Labs | ✅ Draft | `DISCORD_MESSAGES_DRAFT.md` — #dev channel |
| T053 | Discord Alby | ✅ Draft | `DISCORD_MESSAGES_DRAFT.md` — #builders channel |

## Links Rápidos

| Recurso | URL |
|---------|-----|
| Site | https://l402kit.com |
| Docs | https://docs.l402kit.com |
| Demo API | https://l402kit.com/api/demo |
| Status | https://stats.uptimerobot.com/57uOzF17jK |
| GitHub | https://github.com/ShinyDapps/l402-kit |
| npm | https://npmjs.com/package/l402-kit |
| PyPI | https://pypi.org/project/l402kit |
| crates.io | https://crates.io/crates/l402kit |
| Go | https://pkg.go.dev/github.com/shinydapps/l402-kit/go |
| Agent JSON | https://l402kit.com/.well-known/agent.json |
| L402 JSON | https://l402kit.com/.well-known/l402.json |
| awesome-MCP PR | https://github.com/punkpeye/awesome-mcp-servers/pull/5585 |
| awesome-L402 PR | https://github.com/Fewsats/awesome-L402/pull/14 |

## Credenciais (refs para `credentials.md`)

- npm: `shinydapps` / token em credentials.md
- Cloudflare Workers: dois tokens em credentials.md
- Blink: `shinydapps@blink.sv` / API key em credentials.md
- Supabase: URL + keys em credentials.md
- UptimeRobot: API key `u3468616-b6ee2842a355c1ea1c2c0c91`

## Comandos de Deploy

```bash
# Deploy API Worker (token em credentials.md → Cloudflare Workers)
CLOUDFLARE_API_TOKEN=<workers-token> \
  npx wrangler deploy --config /c/Users/thiag/l402-kit/cloudflare/wrangler.toml

# Deploy Site estático
CLOUDFLARE_API_TOKEN=<workers-token> \
  npx wrangler deploy --config /c/Users/thiag/l402-kit/wrangler.jsonc

# Rodar testes
npm test

# Publicar npm (token em credentials.md → npm)
NPM_TOKEN=<npm-token> npm publish
```
