import { describe, it, expect } from "vitest";
import { logTaskHandler } from "../src/handlers/LogTaskHandler";
import type { KanbanTask } from "../src/schemas/Task";

function makeTask(overrides?: Partial<KanbanTask>): KanbanTask {
  const now = new Date().toISOString();
  return {
    id: "test-1",
    title: "Test Task",
    description: "A test task",
    state: "running",
    priority: "medium",
    assigneeId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: null,
    tags: ["test"],
    metadata: {},
    ...overrides,
  };
}

describe("LogTaskHandler", () => {
  it("processes a task successfully", async () => {
    const task = makeTask({ metadata: { estimateMs: 50 } });
    await expect(logTaskHandler(task)).resolves.toBeUndefined();
  });

  it("throws when failOnPurpose is set", async () => {
    const task = makeTask({ metadata: { failOnPurpose: true } });
    await expect(logTaskHandler(task)).rejects.toThrow("Intentional failure");
  });

  it("handles tasks with no tags", async () => {
    const task = makeTask({ tags: [], metadata: { estimateMs: 10 } });
    await expect(logTaskHandler(task)).resolves.toBeUndefined();
  });

  it("respects estimateMs for work simulation", async () => {
    const task = makeTask({ metadata: { estimateMs: 200 } });
    const start = Date.now();
    await logTaskHandler(task);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180); // allow 20ms jitter
  });
});
