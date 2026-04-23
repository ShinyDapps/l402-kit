-- ═══════════════════════════════════════════════════════════════════════════
-- l402-kit — Supabase Schema
-- Execute no Supabase SQL Editor (Settings → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── payments ─────────────────────────────────────────────────────────────────
create table if not exists payments (
  id           uuid        default gen_random_uuid() primary key,
  endpoint     text        not null,
  payment_hash text        not null unique,  -- SHA-256(preimage) — já público no BOLT11
  amount_sats  integer     not null,
  owner_address text       not null default '',
  paid_at      timestamptz not null default now()
);

create index if not exists payments_paid_at_idx      on payments (paid_at desc);
create index if not exists payments_endpoint_idx     on payments (endpoint);
create index if not exists payments_owner_addr_idx   on payments (owner_address);

alter table payments enable row level security;

-- anon key: só insert (middleware usa anon key para logar pagamentos)
create policy if not exists "anon_insert_payments" on payments
  for insert to anon with check (true);

-- service role: acesso total (dashboard, pro-check, etc.)
create policy if not exists "service_full_payments" on payments
  for all to service_role using (true);


-- ── pro_access ───────────────────────────────────────────────────────────────
create table if not exists pro_access (
  id           uuid        default gen_random_uuid() primary key,
  address      text        not null,               -- Lightning Address do dev
  payment_hash text        not null unique,
  tier         text        not null default 'pro',
  expires_at   timestamptz,                        -- null = pendente (fatura não paga)
  created_at   timestamptz not null default now()
);

create index if not exists pro_access_address_idx    on pro_access (address);
create index if not exists pro_access_expires_idx    on pro_access (expires_at);

alter table pro_access enable row level security;

-- Sem acesso anon: Lightning Addresses são sensíveis.
-- Todas as leituras de pro_access vão pelo /api/pro-check (service key no servidor).
create policy if not exists "service_full_pro" on pro_access
  for all to service_role using (true);


-- ── lnurl_challenges ─────────────────────────────────────────────────────────
-- Usado por LNURL-auth: delete de dados E login do dashboard.
create table if not exists lnurl_challenges (
  k1                text        primary key,
  lightning_address text,                          -- null ou '__dashboard__' para login
  verified          boolean     not null default false,
  pubkey            text,                          -- chave pública secp256k1 da wallet
  token             text,                          -- token de uso único (delete ou session)
  token_expires_at  timestamptz,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);

create index if not exists lnurl_challenges_token_idx on lnurl_challenges (token);
create index if not exists lnurl_challenges_exp_idx   on lnurl_challenges (expires_at);

alter table lnurl_challenges enable row level security;

-- Apenas service role lê/escreve: desafios contêm tokens sensíveis.
-- O backend Vercel usa SUPABASE_SERVICE_KEY para todas as operações.
create policy if not exists "service_full_challenges" on lnurl_challenges
  for all to service_role using (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATIONS (execute apenas se as tabelas já existem)
-- ═══════════════════════════════════════════════════════════════════════════

-- Migration 2026-04-23: rename preimage → payment_hash
-- (só execute se a coluna ainda se chama 'preimage')
-- ALTER TABLE payments RENAME COLUMN preimage TO payment_hash;

-- Migration 2026-04-23: drop waitlist (removida — zero PII)
-- DROP TABLE IF EXISTS waitlist;

-- Migration 2026-04-23: lnurl_challenges (se não existia ainda)
-- (já coberto pelo CREATE TABLE IF NOT EXISTS acima)

-- ═══════════════════════════════════════════════════════════════════════════
-- DEPLOY DA EDGE FUNCTION (executar no terminal com Supabase CLI)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   supabase login
--   supabase link --project-ref <seu-project-ref>
--   supabase functions deploy create-invoice --no-verify-jwt
--   supabase secrets set BLINK_API_KEY=<sua-key> BLINK_WALLET_ID=<seu-wallet-id>
--
-- Após o deploy:
--   - Remova L402KIT_BLINK_API_KEY e L402KIT_BLINK_WALLET_ID do Vercel
--   - Adicione SUPABASE_ANON_KEY ao Vercel (necessário para chamar a Edge Function)
--   - Adicione OWNER_PUBKEY ao Vercel (pubkey secp256k1 da sua Lightning wallet)
--     → Faça um LNURL-auth teste e copie o campo 'pubkey' da tabela lnurl_challenges
