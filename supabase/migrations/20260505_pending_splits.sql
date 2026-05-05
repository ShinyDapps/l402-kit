-- Tracks every split attempt for the managed mode fee distribution.
-- Decoupled from the payments table to avoid race conditions with the L402 middleware.

CREATE TABLE IF NOT EXISTS pending_splits (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_hash   text        UNIQUE NOT NULL,
  owner_address  text        NOT NULL,
  amount_sats    integer     NOT NULL,
  owner_sats     integer     NOT NULL,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'completed', 'failed')),
  attempts       integer     NOT NULL DEFAULT 0,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS pending_splits_status_idx ON pending_splits (status);
CREATE INDEX IF NOT EXISTS pending_splits_owner_idx  ON pending_splits (owner_address);

-- Allow service role full access; anon has no access.
ALTER TABLE pending_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
  ON pending_splits
  USING (auth.role() = 'service_role');
