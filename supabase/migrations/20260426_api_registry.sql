-- API Registry — diretório público de APIs L402
-- Executar em: supabase.com/dashboard/project/urcqtpklpfyvizcgcsia/sql/new

create table if not exists api_registry (
  id            uuid primary key default gen_random_uuid(),
  url           text not null unique,
  name          text not null,
  description   text,
  price_sats    integer not null check (price_sats >= 1),
  lightning_address text not null,
  category      text not null default 'other'
                  check (category in ('data','ai','finance','weather','compute','storage','other')),
  verified      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Índice para listagem por categoria
create index if not exists api_registry_category_idx on api_registry (category, created_at desc);

-- RLS: leitura pública, escrita via service role (Worker usa service key)
alter table api_registry enable row level security;

create policy "public read" on api_registry
  for select using (true);

create policy "service write" on api_registry
  for all using (auth.role() = 'service_role');
