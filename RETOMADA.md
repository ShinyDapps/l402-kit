# Retomada — Sequência canônica "como estamos"

> **Para Claude (ou qualquer agente):** quando o Thiago disser "vamos retomar" / "como estamos" / "atualize-se profundamente", execute esta sequência **em paralelo** numa única round de tool calls. Não confirmar antes — executar e mostrar o resultado consolidado.
>
> **Para Thiago:** este é o checklist que eu sigo sozinho. Tu lê o resumo no final. Aponta o que mudou, não o que não mudou.

---

## Bloco 1 — Estado local (PowerShell)

```powershell
git log --oneline -10
git status --short
```

Ler:
- [`STATUS.md`](STATUS.md) — snapshot anterior (campo `Last updated` no topo)
- [`AUDIT.md`](AUDIT.md) — última auditoria end-to-end
- `~/.claude/projects/c--Users-thiag-l402-kit/memory/MEMORY.md` — índice das 30+ memórias

## Bloco 2 — Produção viva (HTTP em paralelo)

```powershell
$h = @{ "x-dashboard-secret" = "<see credentials.md>" }

# Endpoints públicos
Invoke-RestMethod https://l402kit.com/api/verity                # 11 services count
Invoke-RestMethod https://l402kit.com/api/verity/services        # catálogo machine-readable
Invoke-RestMethod https://l402kit.com/api/verity/fiscal          # revenue hoje
Invoke-RestMethod https://l402kit.com/.well-known/agent.json     # contract

# Admin (protegido)
Invoke-RestMethod https://l402kit.com/api/verity/admin/radar -Headers $h
Invoke-RestMethod https://l402kit.com/api/verity/admin/alerts -Headers $h
```

## Bloco 3 — PRs externos (GitHub API)

PAT em `credentials.md` § GitHub. Sempre os mesmos 5 PRs até concluírem:

```powershell
$h = @{ Authorization = "Bearer <GITHUB_PAT>"; Accept = "application/vnd.github+json" }
$prs = @(
  @{r="x402-foundation/x402";        n=2262; tag="OURS Zeke"},
  @{r="punkpeye/awesome-mcp-servers"; n=5585; tag="awesome-mcp"},
  @{r="Fewsats/awesome-L402";         n=14;   tag="awesome-L402"},
  @{r="lightninglabs/L402";           n=25;   tag="lightninglabs"},
  @{r="btcpayserver/btcpayserver-doc";n=1589; tag="btcpay"}
)
foreach ($p in $prs) {
  $pr = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$($p.r)/pulls/$($p.n)"
  $c  = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$($p.r)/issues/$($p.n)/comments?per_page=100"
  $last = $c | Select-Object -Last 1
  "$($p.tag) #$($p.n) state=$($pr.state) comments=$($c.Count) updated=$($pr.updated_at.Substring(0,10))"
  if ($last) { "  last: $($last.created_at.Substring(0,10)) by $($last.user.login)" }
}
```

Comparar com `STATUS.md`. Mudou → ler o comentário novo.

## Bloco 4 — Versão drift (SDKs)

```powershell
Invoke-RestMethod "https://registry.npmjs.org/l402-kit"   | Select-Object -Expand 'dist-tags'
Invoke-RestMethod "https://pypi.org/pypi/l402kit/json"     | Select-Object -ExpandProperty info | Select version
Invoke-RestMethod "https://crates.io/api/v1/crates/l402kit" -Headers @{"User-Agent"="l402-kit-audit"} | Select-Object -ExpandProperty crate | Select max_version
```

Comparar com `package.json` local. PyPI/crates/Go costumam ficar pra trás.

## Bloco 5 — Drifts recorrentes (sempre conferir)

| Drift conhecido | Onde verificar | Como corrigir |
|---|---|---|
| Preço Alpha | `/api/verity/services` vs `docs/agent/verity.mdx` vs `project_verity.md` | Editar manual nos arquivos defasados |
| Versão VSCode ext | Marketplace ID `ShinyDapps.shinydapps-l402` vs STATUS.md vs memory | Atualizar memory `project_traction.md` |
| Versão SDK por linguagem | npm vs PyPI vs crates vs pkg.go.dev | Idealmente release matrix dispara nos 4 |
| `STATUS.md` `Last updated` | Topo do arquivo | Se >7 dias → refresh ao final desta sessão |
| `btc_brl_rate: 0` no fiscal | `/api/verity/fiscal` | Cosmético, debug fetcher CoinGecko quando der tempo |

## Bloco 6 — Outreach / conversas vivas

| Onde | Arquivo | Aguardando |
|---|---|---|
| Show HN | [`.private/strategy/SHOW_HN_DRAFT.md`](.private/strategy/SHOW_HN_DRAFT.md) | Postar — nunca foi |
| Telegram | [`.private/OUTREACH_TELEGRAM.md`](.private/OUTREACH_TELEGRAM.md) | Thiago confirmar grupos |
| Twitch | [`.private/OUTREACH_TWITCH.md`](.private/OUTREACH_TWITCH.md) | Thiago aprovar streamers |
| Peace (LAW-N) | [`.private/PEACE_FOLLOWUP.md`](.private/PEACE_FOLLOWUP.md) | Resposta deles (>7d → re-pingar) |
| Roland (Alby) | [`.private/ROLAND_ALBY_REPLY.md`](.private/ROLAND_ALBY_REPLY.md) | Resposta dele (não re-pingar) |
| Moritz (Alby) | [`.private/MORITZ_ALBY_DM.md`](.private/MORITZ_ALBY_DM.md) | Resposta dele |
| Trezoitão email | redigido, não enviado | Enviar |
| YouTubers (7 acionados 29 Abr) | — | Follow-up nunca feito |
| DEV.to | [`.private/DEVTO_ARTICLE_DRAFT.md`](.private/DEVTO_ARTICLE_DRAFT.md) | Postar |
| Discord (LL / Alby) | [`.private/DISCORD_MESSAGES_DRAFT.md`](.private/DISCORD_MESSAGES_DRAFT.md) | Postar |

## Bloco 7 — Atualizar este arquivo + STATUS ao final

Se a sessão for significativa:
1. Atualizar `STATUS.md` (campo `Last updated` + TL;DR + tabela "O que está vivo" + "Trabalho pendente")
2. Memory files relevantes (drift detectado, decisão nova)
3. Este RETOMADA.md só se a sequência de blocos mudar (estrutural)

---

## Tempo esperado

- Blocos 1–5 em paralelo: ~90 segundos
- Bloco 6 leitura (priorizar 2–3 arquivos): ~3 min
- Resposta consolidada: ~1 min

**Total**: 5 min de Claude pra Thiago saber em que pé tudo está.

---

## O que NÃO fazer

- Não rodar `npm test` no início (400+ testes, lento). Só rodar quando vamos editar código.
- Não spawn agent — é literalmente fetches paralelos.
- Não abrir mais PRs externos se já há 4+ abertos sem resposta.
- Não confirmar antes de executar — Thiago já disse "retomar".