import type { HarnessDB } from "../schemas/HarnessDB";
import type { KanbanTask } from "../schemas/Task";

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

  constructor(db: HarnessDB, handler: TaskHandler) {
    this.db = db;
    this.handler = handler;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  async tick(actor: string = "dispatcher"): Promise<TickResult> {
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

    try {
      await this.handler(task);

      // Transition running → done
      this.db.transition(task.id, "done", actor);

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
