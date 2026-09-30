import Database from "better-sqlite3";
import type { KanbanTask } from "./Task";
import type { TaskState } from "./TaskStateMachine";
import { assertTransition } from "./TaskStateMachine";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  state: string;
  priority: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  tags: string;
  metadata: string;
}

interface TransitionLogRow {
  id: number;
  task_id: string;
  from_state: string;
  to_state: string;
  actor: string;
  timestamp: string;
}

/**
 * HarnessDB — SQLite-backed task store at var/harness.db
 * All writes are synchronous (better-sqlite3 is sync by design).
 */
export class HarnessDB {
  private db: Database.Database;

  constructor(dbPath: string = "var/harness.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'triage',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

      CREATE TABLE IF NOT EXISTS transition_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        actor TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
    `);
  }

  create(input: { title: string; description?: string; priority?: string; tags?: string[]; metadata?: Record<string, unknown>; id?: string }): KanbanTask {
    const now = new Date().toISOString();
    const id = input.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: KanbanTask = {
      id,
      title: input.title,
      description: input.description ?? "",
      state: "triage",
      priority: (input.priority as KanbanTask["priority"]) ?? "medium",
      assigneeId: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };

    this.db.prepare(`
      INSERT INTO tasks (id, title, description, state, priority, assignee_id, created_at, updated_at, started_at, completed_at, tags, metadata)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)
    `).run(task.id, task.title, task.description, task.state, task.priority, task.createdAt, task.updatedAt, JSON.stringify(task.tags), JSON.stringify(task.metadata));

    return task;
  }

  getById(id: string): KanbanTask | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  getByState(state: TaskState): KanbanTask[] {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE state = ? ORDER BY created_at ASC").all(state) as TaskRow[];
    return rows.map(r => this.rowToTask(r));
  }

  getAll(): KanbanTask[] {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all() as TaskRow[];
    return rows.map(r => this.rowToTask(r));
  }

  transition(taskId: string, newState: TaskState, actor: string = "system"): KanbanTask {
    const task = this.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const oldState = task.state;
    assertTransition(oldState, newState, taskId);

    const now = new Date().toISOString();
    const updates: Partial<KanbanTask> = {
      state: newState,
      updatedAt: now,
    };

    if (newState === "running" && oldState !== "running") {
      updates.startedAt = now;
    }
    if (newState === "done" && oldState !== "done") {
      updates.completedAt = now;
    }
    if (newState === "todo" && oldState === "running") {
      // Yielded back — clear startedAt
      updates.startedAt = null;
    }

    this.db.prepare(`
      UPDATE tasks SET state = ?, updated_at = ?, started_at = ?, completed_at = ? WHERE id = ?
    `).run(updates.state, updates.updatedAt, updates.startedAt ?? null, updates.completedAt ?? null, taskId);

    this.db.prepare(`
      INSERT INTO transition_log (task_id, from_state, to_state, actor, timestamp) VALUES (?, ?, ?, ?, ?)
    `).run(taskId, oldState, newState, actor, now);

    const updated = this.getById(taskId);
    if (!updated) throw new Error(`Task ${taskId} not found after transition`);
    return updated;
  }

  assign(taskId: string, assigneeId: string): KanbanTask {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE tasks SET assignee_id = ?, updated_at = ? WHERE id = ?").run(assigneeId, now, taskId);
    const task = this.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return task;
  }

  getTransitionLog(taskId: string): Array<{ id: number; taskId: string; fromState: string; toState: string; actor: string; timestamp: string }> {
    const rows = this.db.prepare("SELECT * FROM transition_log WHERE task_id = ? ORDER BY id ASC").all(taskId) as TransitionLogRow[];
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      fromState: r.from_state,
      toState: r.to_state,
      actor: r.actor,
      timestamp: r.timestamp,
    }));
  }

  close(): void {
    this.db.close();
  }

  private rowToTask(row: TaskRow): KanbanTask {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      state: row.state as TaskState,
      priority: row.priority as KanbanTask["priority"],
      assigneeId: row.assignee_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      tags: JSON.parse(row.tags || "[]") as string[],
      metadata: JSON.parse(row.metadata || "{}") as Record<string, unknown>,
    };
  }
}
