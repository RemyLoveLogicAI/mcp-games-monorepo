CREATE TABLE action_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,

  arguments JSONB NOT NULL,
  canonical_request TEXT NOT NULL,
  proposal_hash BYTEA NOT NULL,
  idempotency_key TEXT NOT NULL,
  nonce_digest BYTEA,
  policy_version TEXT NOT NULL,

  approval_mode TEXT NOT NULL CHECK (
    approval_mode IN ('autonomous', 'user_move', 'exact')
  ),
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'queued', 'running', 'succeeded',
              'failed', 'expired', 'revoked')
  ),

  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  queued_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,

  UNIQUE (actor_id, server_id, tool_name, idempotency_key),
  UNIQUE (nonce_digest)
);

CREATE TABLE receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES action_intents(id),
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  canonical_event TEXT NOT NULL,
  previous_hash BYTEA,
  event_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  UNIQUE (action_id, sequence),
  UNIQUE (event_hash)
);