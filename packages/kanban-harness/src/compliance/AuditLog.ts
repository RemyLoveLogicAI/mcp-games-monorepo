import { randomUUID } from "node:crypto";

export type AuditOutcome = "allowed" | "denied" | "error";
export interface AuditEvent {
  readonly id: string; readonly occurredAt: string; readonly correlationId: string;
  readonly subject: string; readonly action: string; readonly resource?: string;
  readonly outcome: AuditOutcome; readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface AuditSink { append(event: AuditEvent): Promise<void> | void; }
export const auditEvent = (input: Omit<AuditEvent, "id" | "occurredAt">): AuditEvent => ({
  ...input, id: randomUUID(), occurredAt: new Date().toISOString(),
});
export const withAudit = async <T>(sink: AuditSink, input: Omit<AuditEvent, "id" | "occurredAt"|"outcome">, operation: () => Promise<T>): Promise<T> => {
  try { const result = await operation(); await sink.append(auditEvent({ ...input, outcome: "allowed" })); return result; }
  catch (error) { await sink.append(auditEvent({ ...input, outcome: "error", metadata: { error: String(error) } })); throw error; }
};
