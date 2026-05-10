CREATE TABLE IF NOT EXISTS agent_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  agent_id text,
  session_id text NOT NULL,
  request_id text NOT NULL,
  endpoint text,
  amount_sats integer,
  settled boolean,
  latency_ms integer,
  budget_remaining integer,
  budget_exhausted boolean,
  retry_count integer,
  proof_reuse_attempt boolean,
  caveat_violations integer,
  network_provider text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_agent_id_idx ON agent_events(agent_id);
CREATE INDEX IF NOT EXISTS agent_events_created_at_idx ON agent_events(created_at DESC);
