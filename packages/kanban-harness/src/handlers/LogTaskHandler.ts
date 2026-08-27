import type { KanbanTask } from "../schemas/Task";

/**
 * LogTaskHandler — the simplest real handler.
 * Processes a task by logging its execution, simulating work based on
 * metadata.estimateMs (default 100ms), and returning success.
 *
 * In production, swap this for an actual task executor (API call,
 * codegen, build step, etc.)
 */

export interface LogTaskResult {
  taskId: string;
  title: string;
  durationMs: number;
  output: string;
  success: boolean;
}

export async function logTaskHandler(task: KanbanTask): Promise<void> {
  const estimate = (task.metadata.estimateMs as number) ?? 100;
  const start = Date.now();

  // Simulate actual work
  await new Promise((resolve) => setTimeout(resolve, estimate));

  const duration = Date.now() - start;
  const output = `[executed] ${task.title} — ${duration}ms — tags: ${task.tags.join(", ") || "none"}`;

  console.log(`[handler] ${output}`);

  if (task.metadata.failOnPurpose) {
    throw new Error(`Intentional failure for task ${task.id}`);
  }
}
