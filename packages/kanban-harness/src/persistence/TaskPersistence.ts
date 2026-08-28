import { randomUUID } from "node:crypto";
export const TASK_STATES = ["triage","todo","in_progress","blocked","done","archived"] as const;
export type TaskState = typeof TASK_STATES[number];
export interface Task { id: string; title: string; state: TaskState; payload: Record<string, unknown>; correlationId: string; createdAt: string; updatedAt: string; }
export interface Lease { taskId: string; owner: string; correlationId: string; acquiredAt: string; expiresAt: string; }
export interface TaskStore { create(task: Omit<Task, "id"|"createdAt"|"updatedAt">): Promise<Task>; transition(id: string, to: TaskState, actor: string, correlationId: string): Promise<Task>; claim(owner: string, ttlMs: number, correlationId: string): Promise<{ task: Task; lease: Lease } | null>; recoverExpiredLeases(now?: Date): Promise<number>; }
export const newTask = (input: Omit<Task, "id"|"createdAt"|"updatedAt">): Task => { const now = new Date().toISOString(); return { ...input, id: randomUUID(), createdAt: now, updatedAt: now }; };
export const canTransition = (from: TaskState, to: TaskState): boolean => ({ triage:["todo","archived"], todo:["in_progress","blocked","archived"], in_progress:["blocked","done","todo"], blocked:["todo","in_progress","archived"], done:["archived"], archived:[] } as Record<TaskState, string[]>)[from].includes(to);
