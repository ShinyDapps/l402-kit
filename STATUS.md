# l402-kit — Live Status

> **Purpose:** snapshot vivo do projeto para retomar contexto rápido. Atualizar a cada sessão significativa.
> **Last updated:** 2026-05-19 03:31 BRT (Alby benchmark + 11/11 VERITY services live em 402index.io)

---

## TL;DR

`l402-kit@1.9.0` shipou em 12 Mai com LAW-N + RADAR + 11 serviços VERITY. Tudo deployado, 0 CVEs, git limpo, infra estável. **Distribuição: 11/11 VERITY services listadas em 402index.io em 19 Mai (Alby Hub features 402index.io na landing deles).** Bottleneck atual é tração comercial (0 revenue, drafts não postados), não produto nem visibilidade técnica.

---

## O que está vivo

| Camada | Onde | Versão | Estado |
|---|---|---|---|
| npm `l402-kit` | https://www.npmjs.com/package/l402-kit | 1.9.0 | ✅ |
| PyPI `l402kit` | https://pypi.org/project/l402kit | 1.8.6 | ⚠️ atrasado vs npm 1.9.0 (sem LAW-N adapter Python) |
| crates.io `l402kit` | https://crates.io/crates/l402kit | 1.8.5 | ⚠️ Rust independente, sem LAW-N |
| Go module | github.com/shinydapps/l402-kit/go | v1.8.2 | ⚠️ Go independente, sem LAW-N |
| VS Code Extension | ShinyDapps.shinydapps-l402 | 1.9.1 | ✅ 3 tabs: Payments / VERITY / LAW-N |
| Cloudflare Worker `l402kit-api` | l402kit.com/api/* | vf28aa984 | ✅ deployed 2026-05-13 (radar evolution + alpha repricing) |
| Docs Mintlify | docs.l402kit.com | auto-sync | ✅ EN + 10 locales × 40 pages |
| Landing | l402kit.com | static | ✅ |
| VERITY agent | l402kit.com/api/verity | — | ✅ 11 services live |
| MCP server | published via Glama | — | ✅ 92% A-A-B quality |

---

## VERITY (11 serviços)

| Serviço | Endpoint | Preço base | Estado |
|---|---|---|---|
| search | `/api/verity/search` | 500 sats | ✅ |
| scrape | `/api/verity/scrape` | 500 sats | ✅ |
| btc-price | `/api/verity/btc-price` | 100 sats | ✅ |
| summarize | `/api/verity/summarize` | 500 sats | ✅ |
| sentiment | `/api/verity/sentiment` | 300 sats | ✅ |
| domain-intel | `/api/verity/domain-intel` | 2.000 sats | ✅ |
| integration | `/api/verity/integration` | 200.000 sats | ✅ |
| worldstate | `/api/verity/worldstate` | 300 sats | ✅ |
| translate | `/api/verity/translate` | 500 sats | ✅ 11 idiomas, MDX-aware |
| research | `/api/verity/research` | 2.000 sats | ✅ bundle search+scrape+summary |
| alpha | `/api/verity/alpha` | 5.000 sats | ✅ (era 8k, reduzido em 13 Mai p/ destravar volume) |

**Revenue hoje:** 0 sats (sem chamadas pagantes). Treasury: `shinydapps@blink.sv`.

---

## RADAR (autonomous intelligence)

Cron a cada 30min. 5 anéis ativos. Filtro de repos mortos adicionado em 2026-05-19.

**Filas atuais (após cleanup):**
- human_hot: 0
- human_warm: 1 (Flutter mollie)
- agent_hot: 0
- agent_warm: 2 (Moesif, fetchai uAgents x402 — investigar)

**Alerts:** 0
**Partners:** 0 (Anel 2 só ativa com ≥5 parceiros conhecidos)

---

## Trabalho pendente (priorizado)

### 🔴 Alto impacto — não tocado faz tempo
1. **Show HN** — draft pronto, nunca postado. Maior driver de stars/dia. Com 2 stars hoje, thread boa = 50–200 stars + newsletter Bitcoin/AI.
2. ~~**Email Peace**~~ — ✅ **follow-up enviado 19 Mai 23:27 BRT** ([PEACE_FOLLOWUP.md](PEACE_FOLLOWUP.md)). Aguardando resposta com data do staging ingest. Re-pingar se >7 dias sem resposta.
3. **Email Trezoitão** (38responde@proton.me) — redigido, NÃO enviado.

### 🟡 PRs externos (sem resposta há ~7 dias)
- [**x402-foundation/x402 #2262** (NOSSA, draft)](https://github.com/x402-foundation/x402/pull/2262) — Zeke (zekebuilds-lab) deu 4 reviews técnicas; respondemos 19 Mai ([comment](https://github.com/x402-foundation/x402/pull/2262#issuecomment-4483836907)) com postura de "receber sem comprometer". Aguardando: (a) cross_server_invoice test em TS, (b) flag se interface NWC precisa ajuste. **Monitorar diariamente** — colaborador sério, publicou `@powforge/l402-verify@0.1.0` (35 testes MIT) e `@powforge/x402-lightning` (NWC adapter buyer-side)
- [awesome-mcp-servers #5585](https://github.com/punkpeye/awesome-mcp-servers/pull/5585) — requirements atendidos, ping ~2 Jun se nada
- [awesome-L402 #14](https://github.com/Fewsats/awesome-L402/pull/14) — positiveblue inativo
- [lightninglabs/L402 #25](https://github.com/lightninglabs/L402/pull/25) — simplificar descrição (era muito promocional)
- [btcpayserver-doc #1589](https://github.com/btcpayserver/btcpayserver-doc/pull/1589) — aguardar (fix real)

### 🟢 Próximos focos
- **Telegram outreach** — pack em [OUTREACH_TELEGRAM.md](OUTREACH_TELEGRAM.md), aguarda Thiago confirmar grupos
- **Twitch outreach** — listar streamers Bitcoin/dev BR + EN
- **YouTubers follow-up** — 7 acionados em 29 Abr, sem follow-up registrado
- **README multilingual** — mencionado várias vezes, nunca feito
- **DEV.to article** — draft pronto, não postado

### 💬 DMs aguardando resposta (não re-pingar)
- **Roland (`rolznz`, Alby dev)** — Discord, 19 Mai. Reply pós "we build competing solutions". Texto em [ROLAND_ALBY_REPLY.md](ROLAND_ALBY_REPLY.md). Re-engajar só se ele responder ou Alby lançar API monetization.
- **Moritz Kaminski (`moritz1509`, Alby browser ext)** — Discord DM, 19 Mai. Pergunta técnica narrow (`/api/payments` vs NWC), citou Roland upfront pra evitar end-run perception. Se ele responder "use NWC" → criar `AlbyNWCWallet` adapter no próximo minor. Texto em [MORITZ_ALBY_DM.md](MORITZ_ALBY_DM.md).

---

## Comandos úteis

```powershell
# Deploy worker
$env:CLOUDFLARE_API_TOKEN = "<see credentials.md>"
cd cloudflare; npx wrangler deploy --config wrangler.toml

# Check PRs externos
$h = @{ Authorization = "Bearer <GITHUB_PAT>"; Accept = "application/vnd.github+json" }
@(5585, 14, 25, 1589) | ForEach-Object { ... }  # ver project_traction.md

# Ver fila RADAR
$h = @{ "x-dashboard-secret" = "<DASHBOARD_SECRET>" }
Invoke-RestMethod "https://l402kit.com/api/verity/admin/radar" -Headers $h

# Limpar lead da fila
Invoke-RestMethod "https://l402kit.com/api/verity/admin/radar/lead" -Method DELETE `
  -Headers ($h + @{ "Content-Type"="application/json" }) `
  -Body '{"queue":"agent_hot","url":"https://..."}'

# Status fiscal hoje
curl https://l402kit.com/api/verity/fiscal

# Run tests
npm test -- --testPathPattern=radar  # (radar.queue.test.ts tem TS error pré-existente)
```

---

## Memória relevante (em `~/.claude/projects/c--Users-thiag-l402-kit/memory/`)

- `credentials.md` — TODOS os tokens
- `project_l402kit.md` — visão geral
- `project_traction.md` — PRs, drafts, YouTubers (atualizado 19 Mai)
- `project_mindseye.md` — LAW-N / Peace (atualizado 19 Mai)
- `project_radar.md` — RADAR system spec
- `project_distribution_targets.md` — repos para PR
- `feedback_secrets_powershell.md` — SEMPRE usar Bash `printf` para wrangler secrets (PS adiciona `\r\n`)
- `feedback_docs_update.md` — sempre atualizar /docs/*.mdx + push após mudanças

---

## Decisões "não mexer" (sem discutir antes)

- LNURL para invoice creation (não Blink API direto)
- Floor protection em dynamic pricing (downside Saylor)
- 0.3% fee ManagedProvider · Sovereign mode sempre 0%
- Schema CloudEvents 1.0 para LAW-N events (validado por Peace)
- Volume primeiro nos commodities, repricing diferido até 10k calls/dia

---

## Como atualizar este arquivo

Ao final de cada sessão significativa, revisar:
1. **TL;DR** — uma linha resumo do estado mental
2. **O que está vivo** — versões + última data deploy
3. **Trabalho pendente** — riscar concluídos, adicionar novos
4. **Last updated** no topo

Não substitui memory files — STATUS.md = snapshot operacional, memory = padrões duradouros.
