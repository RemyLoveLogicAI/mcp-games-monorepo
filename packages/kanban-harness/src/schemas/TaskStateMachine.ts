/**
 * Kanban Harness — Task State Machine
 *
 * Valid transitions:
 *   triage → todo      (accepted into sprint)
 *   todo   → running   (worker picks up task)
 *   running → done     (task completed)
 *   running → todo     (yielded back to queue)
 *   triage → done      (rejected/closed without work)
 *   done   → triage    (reopened)
 *
 * Invalid transitions throw TaskTransitionError.
 */

export type TaskState = "triage" | "todo" | "running" | "done";

export interface TaskTransitionError {
  code: "INVALID_TRANSITION";
  message: string;
  from: TaskState;
  to: TaskState;
  taskId: string;
}

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  triage: ["todo", "done"],
  todo: ["running"],
  running: ["done", "todo"],
  done: ["triage"],
};

export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TaskState, to: TaskState, taskId: string): void {
  if (!isValidTransition(from, to)) {
    const err: TaskTransitionError = {
      code: "INVALID_TRANSITION",
      message: `Cannot transition task ${taskId} from "${from}" to "${to}"`,
      from,
      to,
      taskId,
    };
    throw err;
  }
}

export function getValidTransitions(state: TaskState): TaskState[] {
  return VALID_TRANSITIONS[state] ?? [];
}
