create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  endpoint text not null,
  preimage text not null,
  amount_sats integer not null,
  paid_at timestamptz not null default now()
);

create index on payments (paid_at desc);
create index on payments (endpoint);
