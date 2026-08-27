import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HarnessDB } from "../src/schemas/HarnessDB";
import { TickDispatcher } from "../src/dispatcher/TickDispatcher";
import { realTaskHandler } from "../src/handlers/RealTaskHandler";
import { rmSync, mkdirSync } from "fs";
import path from "path";

const DB_PATH = "var/test-real-handler.db";
const DB_DIR = path.dirname(DB_PATH);

describe("RealTaskHandler", () => {
  let db: HarnessDB;
  let dispatcher: TickDispatcher;

  beforeEach(() => {
    mkdirSync(DB_DIR, { recursive: true });
    rmSync(DB_PATH, { force: true });
    rmSync(DB_PATH + "-wal", { force: true });
    rmSync(DB_PATH + "-shm", { force: true });
    db = new HarnessDB(DB_PATH);
    dispatcher = new TickDispatcher(db, realTaskHandler);
  });

  afterEach(() => {
    db.close();
    rmSync(DB_PATH, { force: true });
    rmSync(DB_PATH + "-wal", { force: true });
    rmSync(DB_PATH + "-shm", { force: true });
  });

  it("should execute a shell command task", async () => {
    const task = db.create({
      title: "Echo test",
      priority: "high",
      metadata: { type: "shell", command: "echo 'hello world'" },
    });
    db.transition(task.id, "todo", "test");

    const result = await dispatcher.tick("test");

    expect(result.processed).toBe(true);
    expect(result.fromState).toBe("todo");
    expect(result.toState).toBe("done");
    expect(result.error).toBeUndefined();

    const doneTask = db.getById(task.id);
    expect(doneTask?.state).toBe("done");
    expect(doneTask?.completedAt).not.toBeNull();
  });

  it("should re-queue on shell command failure", async () => {
    const task = db.create({
      title: "Failing command",
      priority: "high",
      metadata: { type: "shell", command: "exit 1" },
    });
    db.transition(task.id, "todo", "test");

    const result = await dispatcher.tick("test");

    expect(result.processed).toBe(true);
    expect(result.toState).toBe("todo");
    expect(result.error).toBeDefined();

    const requeuedTask = db.getById(task.id);
    expect(requeuedTask?.state).toBe("todo");
  });

  it("should fall back to log handler for unknown type", async () => {
    const task = db.create({
      title: "Log task",
      priority: "low",
      metadata: { type: "log", estimateMs: 10 },
    });
    db.transition(task.id, "todo", "test");

    const result = await dispatcher.tick("test");

    expect(result.processed).toBe(true);
    expect(result.toState).toBe("done");
  });

  it("should handle shell timeout", async () => {
    const task = db.create({
      title: "Slow command",
      priority: "high",
      metadata: { type: "shell", command: "sleep 10", timeoutMs: 100 },
    });
    db.transition(task.id, "todo", "test");

    const result = await dispatcher.tick("test");

    expect(result.processed).toBe(true);
    expect(result.toState).toBe("todo"); // re-queued
    expect(result.error).toBeDefined();
  });

  it("should process tasks in priority order", async () => {
    const lowTask = db.create({
      title: "Low priority",
      priority: "low",
      metadata: { type: "log", estimateMs: 5 },
    });
    const criticalTask = db.create({
      title: "Critical",
      priority: "critical",
      metadata: { type: "log", estimateMs: 5 },
    });

    db.transition(lowTask.id, "todo", "test");
    db.transition(criticalTask.id, "todo", "test");

    const result = await dispatcher.tick("test");
    expect(result.taskId).toBe(criticalTask.id);
  });

  it("should execute an HTTP task successfully", async () => {
    const task = db.create({
      title: "HTTP test",
      priority: "medium",
      metadata: {
        type: "http",
        url: "https://httpbin.org/post",
        method: "POST",
        body: { test: true },
        timeoutMs: 10000,
      },
    });
    db.transition(task.id, "todo", "test");

    const result = await dispatcher.tick("test");

    expect(result.processed).toBe(true);
    expect(result.toState).toBe("done");

    const doneTask = db.getById(task.id);
    expect(doneTask?.state).toBe("done");
  });
});
