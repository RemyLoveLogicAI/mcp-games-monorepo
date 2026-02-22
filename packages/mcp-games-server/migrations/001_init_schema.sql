-- Migration: 001_init_schema.sql
-- Description: Initialize core game session and history tables
-- Author: Omnigents Team
-- Date: 2026-02-18

-- Sessions: Main game session storage
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,

  current_scene_id TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  context_permissions JSONB NOT NULL,

  voice_mode BOOLEAN DEFAULT FALSE,
  voice_persona TEXT,
  health_score INTEGER DEFAULT 100,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  trace_id TEXT,

  CONSTRAINT valid_health_score CHECK (health_score >= 0 AND health_score <= 100)
);

CREATE INDEX idx_sessions_player ON sessions(player_id);
CREATE INDEX idx_sessions_active ON sessions(completed_at) WHERE completed_at IS NULL;
CREATE INDEX idx_sessions_game ON sessions(game_id);

-- Session history: Every action in a game
CREATE TABLE IF NOT EXISTS session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  scene_id TEXT NOT NULL,
  choice_id TEXT,
  freeform_input TEXT,
  context_injected JSONB DEFAULT '{}',
  effects_applied JSONB DEFAULT '[]',

  trace_id TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_history_session ON session_history(session_id, created_at DESC);
CREATE INDEX idx_session_history_trace ON session_history(trace_id);

-- Tier 0 telemetry: Self-aware agent operations (24h retention)
CREATE TABLE IF NOT EXISTS tier0_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  service TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),

  duration_ms INTEGER,
  error_message TEXT,
  error_code TEXT,
  trace_id TEXT NOT NULL,
  health_score INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tier0_telemetry_agent ON tier0_telemetry(agent_id, created_at DESC);
CREATE INDEX idx_tier0_telemetry_status ON tier0_telemetry(status, created_at DESC);
CREATE INDEX idx_tier0_telemetry_service ON tier0_telemetry(service, created_at DESC);

-- Auto-delete old telemetry (24h retention policy)
CREATE OR REPLACE FUNCTION delete_old_tier0_telemetry()
RETURNS void AS $$
BEGIN
  DELETE FROM tier0_telemetry WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Recovery log: Track all recovery attempts
CREATE TABLE IF NOT EXISTS recovery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL CHECK (tier IN ('tier0', 'tier1', 'tier2')),
  agent_id TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  recovery_strategy TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),

  duration_ms INTEGER,
  commands_executed JSONB DEFAULT '[]',
  error_message TEXT,
  trace_id TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_log_agent ON recovery_log(agent_id, created_at DESC);
CREATE INDEX idx_recovery_log_status ON recovery_log(status, created_at DESC);
CREATE INDEX idx_recovery_log_tier ON recovery_log(tier, created_at DESC);

-- HITL requests: Human intervention tracking
CREATE TABLE IF NOT EXISTS hitl_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  situation TEXT NOT NULL,
  ai_analysis TEXT NOT NULL,
  ai_recommendation TEXT NOT NULL,
  options JSONB NOT NULL,

  selected_option INTEGER,
  responded_by TEXT,
  auto_selected BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_hitl_requests_priority ON hitl_requests(priority, created_at DESC);
CREATE INDEX idx_hitl_requests_pending ON hitl_requests(responded_at) WHERE responded_at IS NULL;
CREATE INDEX idx_hitl_requests_expired ON hitl_requests(expires_at) WHERE responded_at IS NULL;

-- Enable Row Level Security (for multi-tenant safety)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier0_telemetry ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Players can only see their own sessions
CREATE POLICY sessions_player_policy ON sessions
  FOR ALL USING (player_id = current_setting('app.player_id', true)::text);

CREATE POLICY session_history_player_policy ON session_history
  FOR ALL USING (
    session_id IN (SELECT id FROM sessions WHERE player_id = current_setting('app.player_id', true)::text)
  );

CREATE POLICY tier0_telemetry_public_policy ON tier0_telemetry
  FOR SELECT USING (true); -- Telemetry is read-only for analytics

-- ═══════════════════════════════════════════════════════════
-- QUERY OPTIMIZATION INDEXES
-- ═══════════════════════════════════════════════════════════

-- Composite indexes for common query patterns
CREATE INDEX idx_sessions_player_state ON sessions(player_id, current_scene_id, completed_at);
CREATE INDEX idx_sessions_active_time ON sessions(completed_at, last_activity_at DESC) WHERE completed_at IS NULL;
CREATE INDEX idx_session_history_time ON session_history(session_id, created_at DESC);

-- Additional performance indexes
CREATE INDEX idx_tier0_telemetry_time ON tier0_telemetry(created_at DESC);
CREATE INDEX idx_recovery_log_time ON recovery_log(created_at DESC);
CREATE INDEX idx_hitl_requests_time ON hitl_requests(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON sessions TO authenticated;
GRANT SELECT, INSERT ON session_history TO authenticated;
GRANT SELECT, INSERT ON tier0_telemetry TO authenticated;
GRANT SELECT, INSERT, UPDATE ON recovery_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hitl_requests TO authenticated;
