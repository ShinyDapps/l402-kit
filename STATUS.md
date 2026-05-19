# l402-kit — Live Status

> **Purpose:** snapshot vivo do projeto para retomar contexto rápido. Atualizar a cada sessão significativa.
> **Last updated:** 2026-05-19 noite (audit profundo + RETOMADA.md + OUTREACH_TWITCH.md + Telegram pack atualizado com grupos verificados)
>
> **Para retomar contexto rápido:** [`RETOMADA.md`](RETOMADA.md) — sequência canônica de 5 blocos paralelos (~5min total).

---

## TL;DR

`l402-kit@1.10.0` cross-lang (TS/Py/Rust/Go) shipou em 19 Mai com LAW-N adapter equalizado nos 4 SDKs + GH Actions release matrix ativa + `/admin` dashboard live. RADAR refinado (`isBuyerLead()` filtra competidores cripto/fiat gateways; queries SERPER diversificadas além de github.com). Tudo deployado, 0 CVEs, git limpo. **Distribuição: 11/11 VERITY services listadas em 402index.io (Alby Hub features 402index.io).** Bottleneck atual é tração comercial (0 revenue, Show HN não postado), não produto nem visibilidade técnica.

---

## O que está vivo

| Camada | Onde | Versão | Estado |
|---|---|---|---|
| npm `l402-kit` | https://www.npmjs.com/package/l402-kit | **1.10.0** | ✅ Granular token bypass 2FA · LAW-N adapter + MCP server completo |
| PyPI `l402kit` | https://pypi.org/project/l402kit | **1.10.0** | ✅ LAW-N adapter Python + build_wallet ergonomics 19 Mai |
| crates.io `l402kit` | https://crates.io/crates/l402kit | **1.10.0** | ✅ LAW-N adapter Rust (feature `lawn-adapter`) 19 Mai |
| Go module | github.com/shinydapps/l402-kit/go | **v1.10.0** | ✅ LAW-N adapter Go (`CreateLawNAdapter`). Tag `go/v1.10.0` no proxy 5-30min |
| VS Code Extension | ShinyDapps.shinydapps-l402 | **1.9.2** | ✅ 3 tabs: Payments / VERITY (11 services) / LAW-N · published 2026-05-19 |
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

**Filas atuais (verificado 19 Mai noite):**
- human_hot: 0
- human_warm: 1
- agent_hot: 1
- agent_warm: 2

Último log: `found:40 queued:0 skipped:40` — dedup cache 7d ainda segurando URLs do 12/5. Cache expira ~20 Mai → próximas runs trazem leads frescos.

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

## Smithery refresh (em deploy 2026-05-19)

- `l402-kit@1.9.1` publicado no npm (MCP server reescrito: 12 tools, sem preços hardcoded, `verity_pricing` adicionado pra dynamic pricing self-discovery)
- `smithery.yaml` criado na raiz com displayName + description rica + iconUrl + configSchema + commandFunction (`npx -p l402-kit l402-kit-mcp`)
- CLI publish disparado: release `8e8638a5-b846-4500-a06f-4dd79f5f7fe8`, status PENDING. Build/deploy Smithery em curso.
- Verificar em https://smithery.ai/server/ShinyDapps/l402-kit em ~15min

---

## Diretório próprio /api/apis.json (popular desde 2026-05-19)

10/11 VERITY services registrados + Diagram Forge = 11 entradas. Antes só tinha Diagram Forge.
- Integration (200k sats) ficou de fora — rate limit /api/register é 10/IP/hora. Resubmeto em 1h.
- Script reutilizável: `scripts/register-local-directory.sh`
- Widget API Directory na landing já tinha 9 VERITYs em `_SEED_APIS` (hardcoded), agora bate com o banco real

## RADAR seen cache wipe (2026-05-19)

- **129 chaves `verity_radar:seen:*` deletadas** via `DELETE /api/verity/admin/radar/seen` (novo endpoint admin)
- RADAR vai re-descobrir leads frescos no próximo cron (/30min)
- Queue antes do reset já tinha 28 leads (8 hot, 20 warm) — desbloqueio aumenta o pool

---

## Glama MCP score (2026-05-19)

`l402-kit-mcp` em https://glama.ai/mcp/servers/ShinyDapps/l402-kit/score:
- Profile completion: **100%** ✅
- Server Coherence / Tool Definition Quality / License: **A** ✅
- Maintenance: **B** ← último gap
  - CI failing → **fixado def1b88, agora green**
  - "No commit activity data available" → provavelmente Glama OAuth permissions ou aguardando re-sync (Glama re-sincroniza pelo menos 1x/dia)
- Tools `l402_fetch`/`l402_balance`/`l402_set_budget`/`l402_spending_report`: todos A (4.6-4.7/5.0)

**Próximo:** clicar "Sync Server" no [admin Glama](https://glama.ai/mcp/servers/ShinyDapps/l402-kit/admin) (logado como ShinyDapps) ou esperar 24h pro daily auto-sync detectar CI green. Maintenance deve subir pra A.

---

## Live Demo (deployado 2026-05-19)

Section interativa entre hero e "How it works" (`#liveDemo`). Visitante escolhe um serviço VERITY (btc-price/worldstate/search/domain-intel) e clica Run → faz fetch real, mostra HTTP 402 + macaroon + invoice + JSON body. Zero pagamento (so mostra o challenge). CORS já aberto no worker.

Click em "Run" dispara `click_demo` no A/B tracker (via `data-ab-demo="1"`).

---

## A/B test hero (live desde 2026-05-19)

Três variantes rotam por visitante de língua inglesa (sticky via localStorage). Não afeta PT/ES/FR/etc.

| Variante | Headline |
|---|---|
| A | "Your API earns Bitcoin from AI agents. Three lines of code." |
| B | "Make your API pay-per-call. In sats. Settles in 1 second." |
| C | "Give your API a Bitcoin price. AI agents pay automatically." |

Eventos rastreados via KV: `view`, `click_install`, `click_docs`, `click_demo`. Reset diário.

```powershell
# Ler estatísticas do dia
curl -H "x-dashboard-secret: <see credentials.md>" https://l402kit.com/api/ab-stats
# Outro dia: ?date=YYYY-MM-DD
```

---

## Comandos úteis

```powershell
# Deploy worker
$env:CLOUDFLARE_API_TOKEN = "<see credentials.md>"
cd cloudflare; npx wrangler deploy --config wrangler.toml

# Check PRs externos
$h = @{ Authorization = "Bearer <GITHUB_PAT>"; Accept = "application/vnd.github+json" }
# 2262 = x402-foundation/x402 (NOSSA, Zeke ativo) — monitorar DIÁRIO
# 5585 = punkpeye/awesome-mcp-servers · 14 = Fewsats/awesome-L402 · 25 = lightninglabs/L402 · 1589 = btcpayserver-doc
@(2262, 5585, 14, 25, 1589) | ForEach-Object { ... }  # ver project_traction.md

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

**Sempre ler primeiro ao retomar:**
- `feedback_retomada_checklist.md` — sequência canônica "como estamos" (Bloco 1-5, ~2min)
- `MEMORY.md` — índice completo (30+ memórias)

**Contexto operacional:**
- `credentials.md` — TODOS os tokens
- `project_l402kit.md` — visão geral v1.10.0
- `project_traction.md` — PRs, drafts, YouTubers, outreach (canonical, atualizado 19 Mai)
- `project_verity.md` — 11 serviços, reputation pricing, RADAR SDR
- `project_radar.md` — RADAR system spec · `project_radar_classification.md` — isBuyerLead patterns
- `project_admin_dashboard.md` — /admin board (cookie HMAC, action queue, treasury sparkline)
- `project_sdk_parity.md` — cross-lang 1.10.0 + GH Actions release matrix
- `project_ecosystem_players.md` — competidores (DeepBlue/Fynx/PingPay) e complementares (NÃO engajar como leads)
- `project_x402_collaborator_zeke.md` — postura na PR #2262 (receber sem comprometer)
- `project_mindseye.md` — LAW-N / Peace (enviado follow-up 19 Mai 23:27 BRT)
- `reference_audit_endpoints.md` — mapa completo dos endpoints HTTP/Supabase/KV/cron

**Regras de operação (feedback):**
- `feedback_secrets_powershell.md` — SEMPRE Bash `printf` para wrangler secrets
- `feedback_no_secrets_in_scripts.md` — NUNCA hardcodar tokens (push protection bloqueia)
- `feedback_dm_scammer_patterns.md` — validar identidade ANTES de pitch técnico
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
