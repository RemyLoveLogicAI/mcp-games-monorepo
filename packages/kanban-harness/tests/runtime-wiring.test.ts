/**
 * runtime-wiring.test.ts
 *
 * Integration tests for the runtime wiring:
 *   - SqliteTaskStore: persistence via schema.sql
 *   - TickDispatcher: persists task lifecycle events to TaskStore
 *   - HarnessServer: enforces RBAC and records audit events
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "fs";
import { randomUUID } from "node:crypto";
import http from "http";
import type { AddressInfo } from "node:net";
import { HarnessDB } from "../src/schemas/HarnessDB";
import { TickDispatcher } from "../src/dispatcher/TickDispatcher";
import { logTaskHandler } from "../src/handlers/LogTaskHandler";
import { SqliteTaskStore } from "../src/persistence/TaskPersistence";
import { createHarnessServer } from "../src/server/HarnessServer";
import type { AuditSink, AuditEvent } from "../src/compliance/AuditLog";

const TEST_DB = "var/test-wiring.db";
const PERSIST_DB = "var/test-wiring-persist.db";
const DB_DIR = "var";

function cleanupDb(path: string): void {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) rmSync(f, { force: true });
}

// ──────────────────────────────────────────────────────────────────────────────
// SqliteTaskStore tests
// ──────────────────────────────────────────────────────────────────────────────
describe("SqliteTaskStore", () => {
  let store: SqliteTaskStore;

  beforeEach(() => {
    mkdirSync(DB_DIR, { recursive: true });
    cleanupDb(PERSIST_DB);
    store = new SqliteTaskStore(PERSIST_DB);
  });

  afterEach(() => {
    store.close();
    cleanupDb(PERSIST_DB);
  });

  it("creates a task and records a creation event", async () => {
    const correlationId = randomUUID();
    const task = await store.create({ title: "Test", state: "todo", payload: {}, correlationId });
    expect(task.id).toBeTruthy();
    expect(task.state).toBe("todo");

    const found = await store.getById(task.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe("Test");

    const events = await store.getEvents(task.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.toState).toBe("todo");
    expect(events[0]?.fromState).toBeNull();
  });

  it("transitions a task and appends an event", async () => {
    const correlationId = randomUUID();
    const task = await store.create({ title: "T", state: "todo", payload: {}, correlationId });
    const updated = await store.transition(task.id, "in_progress", "alice", randomUUID());
    expect(updated.state).toBe("in_progress");

    const events = await store.getEvents(task.id);
    expect(events).toHaveLength(2);
    expect(events[1]?.fromState).toBe("todo");
    expect(events[1]?.toState).toBe("in_progress");
    expect(events[1]?.actor).toBe("alice");
  });

  it("rejects invalid state transitions", async () => {
    const correlationId = randomUUID();
    const task = await store.create({ title: "T", state: "triage", payload: {}, correlationId });
    await expect(store.transition(task.id, "done", "actor", randomUUID())).rejects.toThrow("Invalid transition");
  });

  it("returns tasks filtered by state", async () => {
    const cid = randomUUID();
    await store.create({ title: "A", state: "todo", payload: {}, correlationId: cid });
    await store.create({ title: "B", state: "triage", payload: {}, correlationId: cid });
    const todos = await store.getByState("todo");
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe("A");
  });

  it("claim returns null when no todo tasks", async () => {
    const result = await store.claim("worker-1", 60_000, randomUUID());
    expect(result).toBeNull();
  });

  it("claim returns a task+lease for a todo task", async () => {
    const cid = randomUUID();
    await store.create({ title: "Claimable", state: "todo", payload: {}, correlationId: cid });
    const result = await store.claim("worker-1", 60_000, randomUUID());
    expect(result).not.toBeNull();
    expect(result?.task.title).toBe("Claimable");
    expect(result?.lease.owner).toBe("worker-1");
  });

  it("recoverExpiredLeases removes expired leases", async () => {
    const cid = randomUUID();
    await store.create({ title: "Expiring", state: "todo", payload: {}, correlationId: cid });
    await store.claim("worker-2", 1, randomUUID()); // 1ms TTL — expires immediately
    await new Promise(r => setTimeout(r, 10));
    const recovered = await store.recoverExpiredLeases(new Date());
    expect(recovered).toBe(1);

    // After recovery the task should be claimable again
    const result = await store.claim("worker-3", 60_000, randomUUID());
    expect(result).not.toBeNull();
  });

  it("reports WAL journal mode", () => {
    expect(store.journalMode()).toBe("wal");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TickDispatcher + TaskStore wiring — matching-ID integration test
// ──────────────────────────────────────────────────────────────────────────────
describe("TickDispatcher with TaskStore — matching-ID lifecycle", () => {
  let db: HarnessDB;
  let store: SqliteTaskStore;
  let dispatcher: TickDispatcher;

  beforeEach(() => {
    mkdirSync(DB_DIR, { recursive: true });
    cleanupDb(TEST_DB);
    cleanupDb(PERSIST_DB);
    db = new HarnessDB(TEST_DB);
    store = new SqliteTaskStore(PERSIST_DB);
    dispatcher = new TickDispatcher(db, logTaskHandler, store);
  });

  afterEach(() => {
    db.close();
    store.close();
    cleanupDb(TEST_DB);
    cleanupDb(PERSIST_DB);
  });

  it("idle tick does not persist any events", async () => {
    const result = await dispatcher.tick("test");
    expect(result.processed).toBe(false);
  });

  it("end-to-end lifecycle todo → in_progress → done with matching task ID", async () => {
    const cid = randomUUID();

    // 1. Create the task in SqliteTaskStore first to obtain its ID
    const storeTask = await store.create({
      title: "Matched lifecycle",
      state: "todo",
      payload: { estimateMs: 5 },
      correlationId: cid,
    });
    const sharedId = storeTask.id;

    // 2. Seed HarnessDB with the SAME id so the dispatcher can pick it up
    db.create({
      id: sharedId,
      title: "Matched lifecycle",
      priority: "high",
      metadata: { estimateMs: 5 },
    });
    db.transition(sharedId, "todo", "test");

    // 3. Dispatch one tick — this drives HarnessDB through todo→running→done
    //    and mirrors SqliteTaskStore through todo→in_progress→done
    const result = await dispatcher.tick("test", cid);

    expect(result.processed).toBe(true);
    expect(result.taskId).toBe(sharedId);
    expect(result.toState).toBe("done");

    // 4. Assert HarnessDB task reached "done"
    const hTask = db.getById(sharedId);
    expect(hTask?.state).toBe("done");

    // 5. Assert SqliteTaskStore task reached "done"
    const sTask = await store.getById(sharedId);
    expect(sTask?.state).toBe("done");

    // 6. Assert task_events contains creation + todo→in_progress + in_progress→done
    const events = await store.getEvents(sharedId);
    expect(events).toHaveLength(3);

    // creation event
    expect(events[0]?.fromState).toBeNull();
    expect(events[0]?.toState).toBe("todo");
    expect(events[0]?.taskId).toBe(sharedId);

    // first transition: todo → in_progress
    expect(events[1]?.fromState).toBe("todo");
    expect(events[1]?.toState).toBe("in_progress");
    expect(events[1]?.taskId).toBe(sharedId);

    // second transition: in_progress → done
    expect(events[2]?.fromState).toBe("in_progress");
    expect(events[2]?.toState).toBe("done");
    expect(events[2]?.taskId).toBe(sharedId);
  });

  it("PRAGMA journal_mode is wal", () => {
    expect(store.journalMode()).toBe("wal");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HarnessServer RBAC + Audit tests
// ──────────────────────────────────────────────────────────────────────────────
describe("HarnessServer RBAC and AuditLog", () => {
  let db: HarnessDB;
  let dispatcher: TickDispatcher;
  let server: http.Server;
  let port: number;
  const auditLog: AuditEvent[] = [];
  const sink: AuditSink = { append: (e) => { auditLog.push(e); } };

  const request = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> =>
    new Promise((resolve, reject) => {
      const opts = { method, hostname: "localhost", port, path, headers: { "Content-Type": "application/json", ...headers } };
      const req = http.request(opts, (res) => {
        let raw = "";
        res.on("data", d => (raw += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) as Record<string, unknown> }));
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });

  beforeEach(async () => {
    mkdirSync(DB_DIR, { recursive: true });
    cleanupDb(TEST_DB);
    db = new HarnessDB(TEST_DB);
    dispatcher = new TickDispatcher(db, logTaskHandler);
    auditLog.length = 0;
    server = createHarnessServer(db, dispatcher, 0, sink);
    await new Promise<void>(r => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    db.close();
    server.close();
    cleanupDb(TEST_DB);
  });

  it("GET /health requires no auth", async () => {
    const { status, data } = await request("GET", "/health");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("GET /tasks as viewer succeeds and emits audit event", async () => {
    const { status, data } = await request("GET", "/tasks", {
      "X-Principal-Subject": "alice",
      "X-Principal-Roles": "viewer",
    });
    expect(status).toBe(200);
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(auditLog.some(e => e.action === "task:list" && e.subject === "alice" && e.outcome === "allowed")).toBe(true);
  });

  it("GET /tasks as anonymous (no roles) succeeds with viewer default", async () => {
    const { status } = await request("GET", "/tasks");
    expect(status).toBe(200);
  });

  it("POST /tasks as viewer is forbidden", async () => {
    const { status, data } = await request("POST", "/tasks", {
      "X-Principal-Subject": "alice",
      "X-Principal-Roles": "viewer",
    }, { title: "Should fail" });
    expect(status).toBe(403);
    expect(typeof data.error).toBe("string");
    expect((data.error as string)).toContain("Forbidden");
  });

  it("POST /tasks as operator succeeds", async () => {
    const { status, data } = await request("POST", "/tasks", {
      "X-Principal-Subject": "bob",
      "X-Principal-Roles": "operator",
    }, { title: "Operator task" });
    expect(status).toBe(201);
    expect((data.task as Record<string, unknown>).title).toBe("Operator task");
    expect(auditLog.some(e => e.action === "task:create" && e.subject === "bob" && e.outcome === "allowed")).toBe(true);
  });

  it("POST /tasks/:id/transition as operator succeeds", async () => {
    const task = db.create({ title: "T", priority: "medium" });
    const { status, data } = await request("POST", `/tasks/${task.id}/transition`, {
      "X-Principal-Subject": "carol",
      "X-Principal-Roles": "operator",
    }, { to: "todo" });
    expect(status).toBe(200);
    expect((data.task as Record<string, unknown>).state).toBe("todo");
  });

  it("POST /tick as viewer is forbidden", async () => {
    const { status } = await request("POST", "/tick", {
      "X-Principal-Subject": "viewer1",
      "X-Principal-Roles": "viewer",
    });
    expect(status).toBe(403);
  });

  it("forbidden requests return 403", async () => {
    const { status, data } = await request("POST", "/tasks", {
      "X-Principal-Subject": "eve",
      "X-Principal-Roles": "viewer",
    }, { title: "Denied" });
    expect(status).toBe(403);
    expect(typeof data.error).toBe("string");
  });
});
