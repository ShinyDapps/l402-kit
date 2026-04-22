create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  endpoint text not null,
  preimage text not null unique,
  amount_sats integer not null,
  owner_address text not null default '',
  paid_at timestamptz not null default now()
);

create index on payments (paid_at desc);
create index on payments (endpoint);
create index on payments (owner_address);

-- Row Level Security: prevent public anon key from reading ALL users' data
alter table payments enable row level security;

-- middleware (anon key) can insert new payments
create policy "anon_insert_payments" on payments
  for insert to anon with check (true);

-- anon key (used by VS Code extension) can read payments.
-- ⚠ ACKNOWLEDGED RISK: using (true) allows full table reads with the anon key.
-- Payments contain endpoint + amount_sats — no PII, no preimages.
-- The extension always filters by owner_address client-side; this is enforced
-- by application logic, not RLS. Tighten to JWT claims if you add auth later.
create policy "anon_select_own_payments" on payments
  for select to anon using (true);

-- service role has unrestricted access (used by pro-* endpoints)
create policy "service_full_payments" on payments
  for all to service_role using (true);

-- Pro access table (for dev dashboard)
create table if not exists pro_access (
  id uuid default gen_random_uuid() primary key,
  address text not null,
  payment_hash text not null unique,
  tier text not null default 'pro',
  -- null = pending (invoice created, not yet paid)
  -- timestamptz = activation expiry (set by pro-poll or blink-webhook on confirmation)
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index on pro_access (address);
create index on pro_access (expires_at);

alter table pro_access enable row level security;
-- NO anon_select_pro: pro_access contains Lightning addresses (privacy-sensitive).
-- All pro_access reads go through /api/pro-check (server-side, service key).
-- anon key has zero access to this table.
create policy "service_full_pro" on pro_access for all to service_role using (true);

-- Waitlist (email capture from landing page)
create table if not exists waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;
-- Only service role can read/write (backend API uses service key for inserts)
-- anon key pode inserir emails na waitlist (sem autenticação — captura pública)
create policy "anon_insert_waitlist" on waitlist for insert to anon with check (true);
-- service role lê/escreve tudo (backend usa service key para deduplicação)
create policy "service_full_waitlist" on waitlist for all to service_role using (true);

-- ─── Migrations (run if tables already exist) ────────────────────────────────
-- Security fix 2026-04-22: remove anon read access to pro_access (address privacy)
-- ✅ EXECUTADO em 22 Abr 2026 via Supabase Management API.
-- pro_access tem apenas service_full_pro. Anon key sem acesso. Lightning Addresses protegidas.
-- DROP POLICY IF EXISTS "anon_select_pro" ON pro_access;
-- ALTER TABLE pro_access ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'pro';
-- ALTER TABLE payments ADD COLUMN IF NOT EXISTS owner_address text not null default '';
-- CREATE TABLE IF NOT EXISTS waitlist (id bigint generated always as identity primary key, email text not null unique, created_at timestamptz not null default now());
-- ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_full_waitlist" ON waitlist FOR ALL TO service_role USING (true);
-- ALTER TABLE pro_access ALTER COLUMN expires_at DROP NOT NULL;
-- CREATE INDEX IF NOT EXISTS payments_owner_address_idx ON payments (owner_address);
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pro_access ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_insert_payments" ON payments FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "anon_select_own_payments" ON payments FOR SELECT TO anon USING (true);
-- CREATE POLICY "service_full_payments" ON payments FOR ALL TO service_role USING (true);
-- CREATE POLICY "anon_select_pro" ON pro_access FOR SELECT TO anon USING (true);
-- CREATE POLICY "service_full_pro" ON pro_access FOR ALL TO service_role USING (true);
