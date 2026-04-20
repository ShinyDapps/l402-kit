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

-- Pro access table (for dev dashboard)
create table if not exists pro_access (
  id uuid default gen_random_uuid() primary key,
  address text not null,
  payment_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on pro_access (address);
create index on pro_access (expires_at);

-- Migration helper (run if table already exists without owner_address):
-- ALTER TABLE payments ADD COLUMN IF NOT EXISTS owner_address text not null default '';
-- CREATE INDEX IF NOT EXISTS payments_owner_address_idx ON payments (owner_address);
