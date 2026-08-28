PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('triage','todo','in_progress','blocked','done','archived')), payload TEXT NOT NULL DEFAULT '{}', correlation_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leases (task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, owner TEXT NOT NULL, correlation_id TEXT NOT NULL, acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, from_state TEXT, to_state TEXT NOT NULL, correlation_id TEXT NOT NULL, actor TEXT NOT NULL, occurred_at TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS idx_tasks_state_updated ON tasks(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_leases_expiry ON leases(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_task_time ON task_events(task_id, occurred_at);
