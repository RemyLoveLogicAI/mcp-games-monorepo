import { randomUUID } from "node:crypto";
import type { HarnessDB } from "../schemas/HarnessDB";
import type { KanbanTask } from "../schemas/Task";
import type { TaskStore } from "../persistence/TaskPersistence";
import { canTransition as canPersistTransition } from "../persistence/TaskPersistence";

/**
 * TickDispatcher — single-tick task processing.
 *
 * On each tick:
 * 1. Find the highest-priority task in "todo" state
 * 2. Transition it to "running"
 * 3. Execute the registered handler
 * 4. On success → transition to "done"
 * 5. On failure → transition back to "todo" (re-queue)
 *
 * The dispatcher is idempotent: calling tick() when no "todo" tasks
 * exist is a no-op returning { processed: false }.
 *
 * If a TaskStore is provided, task lifecycle transitions are also persisted
 * there (task_events, leases) for audit and recovery.
 */

export type TaskHandler = (task: KanbanTask) => Promise<void>;

export interface TickResult {
  processed: boolean;
  taskId: string | null;
  fromState: string;
  toState: string;
  durationMs: number;
  error?: string;
}

export class TickDispatcher {
  private db: HarnessDB;
  private handler: TaskHandler;
  private tickCount: number = 0;
  private taskStore?: TaskStore;

  constructor(db: HarnessDB, handler: TaskHandler, taskStore?: TaskStore) {
    this.db = db;
    this.handler = handler;
    this.taskStore = taskStore;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  async tick(actor: string = "dispatcher", correlationId: string = randomUUID()): Promise<TickResult> {
    this.tickCount++;
    const start = Date.now();

    // Priority ordering: critical > high > medium > low
    const priorityOrder = ["critical", "high", "medium", "low"];
    const todoTasks = this.db.getByState("todo");

    if (todoTasks.length === 0) {
      return {
        processed: false,
        taskId: null,
        fromState: "idle",
        toState: "idle",
        durationMs: Date.now() - start,
      };
    }

    // Sort by priority then by creation time
    todoTasks.sort((a, b) => {
      const pa = priorityOrder.indexOf(a.priority);
      const pb = priorityOrder.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const task = todoTasks[0]!;

    // Transition todo → running
    this.db.transition(task.id, "running", actor);
    // Persist to TaskStore if available (only when the persistence state machine allows it)
    if (this.taskStore) {
      const persisted = await this.taskStore.getById(task.id);
      if (persisted && canPersistTransition(persisted.state, "in_progress")) {
        await this.taskStore.transition(task.id, "in_progress", actor, correlationId).catch(() => {});
      }
    }

    try {
      await this.handler(task);

      // Transition running → done
      this.db.transition(task.id, "done", actor);
      if (this.taskStore) {
        const persisted = await this.taskStore.getById(task.id);
        if (persisted && canPersistTransition(persisted.state, "done")) {
          await this.taskStore.transition(task.id, "done", actor, correlationId).catch(() => {});
        }
      }

      return {
        processed: true,
        taskId: task.id,
        fromState: "todo",
        toState: "done",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      // Transition running → todo (re-queue)
      this.db.transition(task.id, "todo", actor);
      if (this.taskStore) {
        const persisted = await this.taskStore.getById(task.id);
        if (persisted && canPersistTransition(persisted.state, "todo")) {
          await this.taskStore.transition(task.id, "todo", actor, correlationId).catch(() => {});
        }
      }

      return {
        processed: true,
        taskId: task.id,
        fromState: "running",
        toState: "todo",
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
