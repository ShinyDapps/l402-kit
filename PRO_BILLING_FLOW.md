# Pro Subscription — Fluxo de Pagamento e Arquitetura

> Documento interno para gestores. Atualizado: 07 Mai 2026.

---

## Visão Geral

Assinatura Pro ($9/mês) é paga em Bitcoin Lightning. O dinheiro trafega por uma carteira de trânsito (+55 Blink) e vai automaticamente para a conta principal (`shinydapps@blink.sv`).

---

## Fluxo Completo

```
1. Usuário clica "Upgrade to Pro"
        ↓
2. /api/checkout?address=SEU@EMAIL.COM&tier=pro
   → página HTML renderizada com QR + polling

3. JS da página faz POST /api/pro-subscribe
   → Cloudflare Worker chama Supabase Edge Function create-invoice
   → create-invoice cria invoice BOLT11 na conta +55 via Blink API
   → Cloudflare salva KV: pro_inv:{paymentHash} = {address, tier} (TTL 24h)
   → Retorna {paymentRequest, paymentHash, amountSats}

4. Página exibe QR do invoice → usuário paga

5. JS faz polling GET /api/pro-poll?paymentHash=...&address=...&tier=pro (a cada 3s)
   → pro-poll checa tabela pro_access no Supabase (via service key)
   → Se não encontrar: consulta Blink API direto — confere as últimas 10 transações
   → Quando confirma pagamento: insere linha em pro_access (expires_at = now+30d)
   → Dispara sweep do +55 → shinydapps@blink.sv (fire-and-forget)
   → Retorna {paid: true, expiresAt}

6. Página exibe "Pro ativado!" e fecha o modal

7. Extensão VS Code chama /api/pro-check?address=... (no startup e no refresh)
   → Retorna {pro: true, active: true, expiresAt}
   → Extensão desbloqueia gráficos completos, CSV export, histórico all-time
```

---

## Carteiras Blink

| Conta | Papel | Wallet ID |
|-------|-------|-----------|
| `shinydapps@blink.sv` | Conta principal — destino final dos sats | `2e6bc9c6-2db5-445c-b9fb-237a158e255c` |
| `+55` (demo) | Transit wallet — recebe todos os pagamentos (Pro + API) | `9da6b07e-7aaa-44e0-bc96-f1e22610b4d1` |

**Regra do 1 sat:** o sweep sempre deixa 1 sat na carteira +55 para mantê-la ativa.

---

## Sweep Automático

Implementado em `cloudflare/src/api/sweep.ts`.

**Quando dispara:**
- Após confirmação de pagamento Pro via `pro-poll`
- Após processamento de webhook Blink (pagamentos API managed)

**O que faz:**
1. Consulta saldo BTC da carteira +55
2. Se saldo > 1 sat: resolve LNURL de `shinydapps@blink.sv`
3. Gera invoice pelo callback LNURL para `saldo - 1` sats
4. Paga o invoice via Supabase Edge Function `pay-invoice` (usa credenciais +55)
5. Resultado: +55 fica com 1 sat, shinydapps recebe o resto

**Se o sweep falhar:** os sats ficam em +55 até o próximo evento (pagamento API ou Pro) que acionar outro sweep. Nenhum sat é perdido — apenas atrasado.

---

## Supabase

| Tabela | Papel |
|--------|-------|
| `pro_access` | Linhas de assinatura ativa. Consultada via service key (RLS bloquearia anon key). Campos: `address`, `tier`, `payment_hash`, `expires_at` |
| `pending_splits` | Splits de pagamentos API managed — independente do Pro |

**Edge Functions:**
- `create-invoice` — cria invoice Blink usando `BLINK_API_KEY` + `BLINK_WALLET_ID` dos Supabase Secrets (aponta para conta +55)
- `pay-invoice` — paga invoice usando as mesmas credenciais (usado pelo sweep)
- `blink-webhook` — processa confirmações de pagamento API para split de receita

---

## Endpoints Cloudflare (todos em `/api/*`)

| Endpoint | Método | Papel |
|----------|--------|-------|
| `/api/checkout` | GET | Renderiza página de checkout com QR |
| `/api/pro-subscribe` | POST | Cria invoice + salva KV |
| `/api/pro-poll` | GET | Confirma pagamento, ativa Pro, dispara sweep |
| `/api/pro-check` | GET | Extensão verifica se address tem Pro ativo |
| `/api/blink-webhook` | POST | Recebe eventos Blink (pagamentos API) |

---

## Variáveis de Ambiente

### Cloudflare Secrets
```
BLINK_API_KEY_DEMO      → API key da conta +55 (transit wallet)
BLINK_WALLET_ID_DEMO    → Wallet ID BTC da conta +55
OWNER_LIGHTNING_ADDRESS → shinydapps@blink.sv (destino do sweep)
SUPABASE_URL            → URL do projeto Supabase
SUPABASE_ANON_KEY       → Leitura pública
SUPABASE_SERVICE_KEY    → Escrita em pro_access (bypassa RLS)
BLINK_WEBHOOK_SECRET    → Secret Svix para verificar webhooks do Blink
```

### Supabase Secrets (nas Edge Functions)
```
BLINK_API_KEY    → API key +55 (cria/paga invoices)
BLINK_WALLET_ID  → Wallet ID +55
```

---

## Gestão Manual — Comandos Úteis

### Ver saldo carteira +55
```bash
curl -s -X POST "https://api.blink.sv/graphql" \
  -H "X-API-KEY: <BLINK_API_KEY_DEMO>" \
  -d '{"query":"{ me { defaultAccount { wallets { walletCurrency balance } } } }"}'
```

### Verificar Pro de um endereço
```bash
curl "https://l402kit.com/api/pro-check?address=USUARIO@DOMINIO.COM"
```

### Ativar Pro manualmente (pagamento confirmado fora do fluxo)
```bash
# Inserir linha em pro_access via Supabase
curl -X POST "https://urcqtpklpfyvizcgcsia.supabase.co/rest/v1/pro_access" \
  -H "apikey: <SERVICE_KEY>" \
  -H "Authorization: Bearer <SERVICE_KEY>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation,resolution=ignore-duplicates" \
  -d '{"address":"usuario@dominio.com","tier":"pro","expires_at":"2026-06-07T00:00:00Z","payment_hash":"HASH_AQUI"}'
```

### Sweep manual +55 → shinydapps
```bash
# 1. Pegar saldo
# 2. Resolver LNURL
curl "https://blink.sv/.well-known/lnurlp/shinydapps"
# 3. Gerar invoice pelo callback (?amount=SATS_EM_MSATS)
# 4. Pagar via Blink API com key do +55
```

---

## Problemas Conhecidos e Workarounds

| Problema | Status | Workaround |
|----------|--------|------------|
| Webhook Blink não dispara para invoices Pro | Investigando (possível filtro no dashboard Blink) | `pro-poll` confirma via Blink API diretamente — não depende do webhook |
| API key shinydapps@blink.sv retorna 401 | Aguardando regeneração manual no dashboard Blink | Toda operação usa conta +55; sweep move fundos automaticamente |
| pro_access rows antigas sem expires_at | Legacy (Abr 2026) | Não afetam — query filtra `expires_at > now()` |

---

## Histórico de Decisões

| Data | Decisão | Motivo |
|------|---------|--------|
| Mai 2026 | Transit wallet +55 como receptor de invoices Pro | API key shinydapps@blink.sv indisponível; flow funciona igualmente via sweep |
| Mai 2026 | Sweep mantém 1 sat em +55 | Evita conta ficar com saldo zero e possível desativação |
| Mai 2026 | pro-poll verifica Blink API diretamente como fallback | Webhook não está disparando para invoices Pro — pro-poll não depende dele |
| Mai 2026 | pro_access usa SUPABASE_SERVICE_KEY | RLS bloqueia anon key de ler a tabela — service key necessário |
