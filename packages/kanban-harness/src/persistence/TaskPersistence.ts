import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import Database from "better-sqlite3";

export const TASK_STATES = ["triage","todo","in_progress","blocked","done","archived"] as const;
export type TaskState = typeof TASK_STATES[number];

export interface Task {
  id: string;
  title: string;
  state: TaskState;
  payload: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lease {
  taskId: string;
  owner: string;
  correlationId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  fromState: string | null;
  toState: string;
  correlationId: string;
  actor: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface TaskStore {
  create(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task>;
  transition(id: string, to: TaskState, actor: string, correlationId: string): Promise<Task>;
  claim(owner: string, ttlMs: number, correlationId: string): Promise<{ task: Task; lease: Lease } | null>;
  recoverExpiredLeases(now?: Date): Promise<number>;
  getById(id: string): Promise<Task | null>;
  getByState(state: TaskState): Promise<Task[]>;
  getEvents(taskId: string): Promise<TaskEvent[]>;
}

export const newTask = (input: Omit<Task, "id" | "createdAt" | "updatedAt">): Task => {
  const now = new Date().toISOString();
  return { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
};

export const canTransition = (from: TaskState, to: TaskState): boolean =>
  ({ triage:["todo","archived"], todo:["in_progress","blocked","archived"], in_progress:["blocked","done","todo"], blocked:["todo","in_progress","archived"], done:["archived"], archived:[] } as Record<TaskState, string[]>)[from].includes(to);

/**
 * SqliteTaskStore — SQLite-backed implementation of TaskStore.
 *
 * Uses schema.sql for table definitions.
 * Stores task lifecycle events in task_events, leases in the leases table.
 */
export class SqliteTaskStore implements TaskStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.applySchema();
  }

  private applySchema(): void {
    const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
    const sql = readFileSync(schemaPath, "utf8");
    // Execute each statement individually (better-sqlite3 exec handles multiple)
    this.db.exec(sql);
  }

  async create(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.db.prepare(
      `INSERT INTO tasks (id, title, state, payload, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(task.id, task.title, task.state, JSON.stringify(task.payload), task.correlationId, task.createdAt, task.updatedAt);
    this.db.prepare(
      `INSERT INTO task_events (task_id, from_state, to_state, correlation_id, actor, occurred_at, metadata)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`
    ).run(task.id, task.state, task.correlationId, "system", now, "{}");
    return task;
  }

  async transition(id: string, to: TaskState, actor: string, correlationId: string): Promise<Task> {
    const task = await this.getById(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (!canTransition(task.state, to)) {
      throw new Error(`Invalid transition from "${task.state}" to "${to}" for task ${id}`);
    }
    const now = new Date().toISOString();
    const from = task.state;
    this.db.prepare(
      `UPDATE tasks SET state = ?, updated_at = ?, correlation_id = ? WHERE id = ?`
    ).run(to, now, correlationId, id);
    this.db.prepare(
      `INSERT INTO task_events (task_id, from_state, to_state, correlation_id, actor, occurred_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, from, to, correlationId, actor, now, "{}");
    return (await this.getById(id))!;
  }

  async claim(owner: string, ttlMs: number, correlationId: string): Promise<{ task: Task; lease: Lease } | null> {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    // Recover expired leases first
    await this.recoverExpiredLeases(now);

    // Find the oldest "todo" task that has no active lease
    const row = this.db.prepare(
      `SELECT t.* FROM tasks t
       LEFT JOIN leases l ON l.task_id = t.id
       WHERE t.state = 'todo' AND l.task_id IS NULL
       ORDER BY t.updated_at ASC
       LIMIT 1`
    ).get() as any;

    if (!row) return null;

    const task = this.rowToTask(row);

    // Create lease
    this.db.prepare(
      `INSERT INTO leases (task_id, owner, correlation_id, acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(task.id, owner, correlationId, nowIso, expiresAt);

    const lease: Lease = {
      taskId: task.id,
      owner,
      correlationId,
      acquiredAt: nowIso,
      expiresAt,
    };

    return { task, lease };
  }

  async recoverExpiredLeases(now: Date = new Date()): Promise<number> {
    const nowIso = now.toISOString();
    const expired = this.db.prepare(
      `SELECT task_id FROM leases WHERE expires_at < ?`
    ).all(nowIso) as Array<{ task_id: string }>;

    if (expired.length === 0) return 0;

    const stmt = this.db.prepare(`DELETE FROM leases WHERE task_id = ?`);
    for (const row of expired) {
      stmt.run(row.task_id);
    }
    return expired.length;
  }

  async getById(id: string): Promise<Task | null> {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  async getByState(state: TaskState): Promise<Task[]> {
    const rows = this.db.prepare(
      `SELECT * FROM tasks WHERE state = ? ORDER BY updated_at ASC`
    ).all(state) as any[];
    return rows.map(r => this.rowToTask(r));
  }

  async getEvents(taskId: string): Promise<TaskEvent[]> {
    const rows = this.db.prepare(
      `SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC`
    ).all(taskId) as any[];
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      fromState: r.from_state,
      toState: r.to_state,
      correlationId: r.correlation_id,
      actor: r.actor,
      occurredAt: r.occurred_at,
      metadata: JSON.parse(r.metadata || "{}"),
    }));
  }

  close(): void {
    this.db.close();
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      state: row.state as TaskState,
      payload: JSON.parse(row.payload || "{}"),
      correlationId: row.correlation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
