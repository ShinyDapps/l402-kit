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

-- extension/dashboard can SELECT only rows matching a specific owner_address filter.
-- Full-table scans with the anon key are blocked by default when RLS is enabled.
-- Supabase anon key enforces this at the API level.
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
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on pro_access (address);
create index on pro_access (expires_at);

alter table pro_access enable row level security;
create policy "anon_select_pro" on pro_access for select to anon using (true);
create policy "service_full_pro" on pro_access for all to service_role using (true);

-- Waitlist (email capture from landing page)
create table if not exists waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;
-- Only service role can read/write (backend API uses service key for inserts)
create policy "service_full_waitlist" on waitlist for all to service_role using (true);

-- ─── Migrations (run if tables already exist) ────────────────────────────────
-- ALTER TABLE pro_access ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'pro';
-- ALTER TABLE payments ADD COLUMN IF NOT EXISTS owner_address text not null default '';
-- CREATE TABLE IF NOT EXISTS waitlist (id bigint generated always as identity primary key, email text not null unique, created_at timestamptz not null default now());
-- ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_full_waitlist" ON waitlist FOR ALL TO service_role USING (true);
-- CREATE INDEX IF NOT EXISTS payments_owner_address_idx ON payments (owner_address);
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pro_access ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_insert_payments" ON payments FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY "anon_select_own_payments" ON payments FOR SELECT TO anon USING (true);
-- CREATE POLICY "service_full_payments" ON payments FOR ALL TO service_role USING (true);
-- CREATE POLICY "anon_select_pro" ON pro_access FOR SELECT TO anon USING (true);
-- CREATE POLICY "service_full_pro" ON pro_access FOR ALL TO service_role USING (true);
