import type { TaskState } from "./TaskStateMachine";

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  priority: "low" | "medium" | "high" | "critical";
  assigneeId: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  startedAt: string | null;
  completedAt: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface TaskCreateInput {
  title: string;
  description: string;
  priority?: KanbanTask["priority"];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskUpdateInput {
  state?: TaskState;
  assigneeId?: string | null;
  priority?: KanbanTask["priority"];
  tags?: string[];
  metadata?: Record<string, unknown>;
}
