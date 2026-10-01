import { mkdirSync } from "node:fs";
import { HarnessDB } from "./schemas/HarnessDB";
import { TickDispatcher } from "./dispatcher/TickDispatcher";
import { WorkerLoop } from "./WorkerLoop";
import { createHarnessServer } from "./server/HarnessServer";
import { realTaskHandler } from "./handlers/RealTaskHandler";
import { SqliteTaskStore } from "./persistence/TaskPersistence";
import { type AuditEvent } from "./compliance/AuditLog";
import { type Role } from "./compliance/Rbac";

const PORT = parseInt(process.env.HARNESS_PORT ?? "8794", 10);
const TICK_MS = parseInt(process.env.HARNESS_TICK_MS ?? "1000", 10);
const DB_PATH = process.env.HARNESS_DB ?? "var/harness.db";
const PERSIST_DB = process.env.HARNESS_PERSIST_DB ?? "var/harness-persist.db";

// Ensure var directory exists
mkdirSync("var", { recursive: true });

const db = new HarnessDB(DB_PATH);
const taskStore = new SqliteTaskStore(PERSIST_DB);

// Audit sink: write to stdout (structured JSON)
const auditSink = {
  append(event: AuditEvent): void {
    console.log(`[audit] ${JSON.stringify(event)}`);
  },
};

// Production handler: executes shell commands, HTTP calls, or log fallback
// based on task.metadata.type
const dispatcher = new TickDispatcher(db, realTaskHandler, taskStore);

const worker = new WorkerLoop(dispatcher, {
  intervalMs: TICK_MS,
  onTick: (result) => {
    if (result.processed) {
      console.log(`[tick] ${result.taskId}: ${result.fromState} → ${result.toState} (${result.durationMs}ms)${result.error ? ` ERR: ${result.error}` : ""}`);
    }
  },
  onError: (err) => console.error(`[tick] Worker error:`, err),
});

// Server-side subject → roles mapping (JSON). Roles are resolved server-side;
// the X-Principal-Roles request header is never trusted. Example:
//   HARNESS_ROLE_ASSIGNMENTS='{"remy":["admin"],"agent-1":["operator"]}'
// Unset → every HTTP principal is viewer (safe default; the worker loop and
// dispatcher are unaffected).
const roleAssignments = (() => {
  const valid: readonly Role[] = ["viewer", "operator", "auditor", "admin"];
  try {
    const raw = process.env.HARNESS_ROLE_ASSIGNMENTS;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, readonly Role[]> = {};
    for (const [subject, roles] of Object.entries(parsed)) {
      if (!Array.isArray(roles)) continue;
      const kept = roles.filter((r): r is Role => typeof r === "string" && (valid as readonly string[]).includes(r));
      if (kept.length) out[subject] = kept;
    }
    return out;
  } catch {
    console.error("[harness] Ignoring invalid HARNESS_ROLE_ASSIGNMENTS (must be JSON object)");
    return undefined;
  }
})();

const server = createHarnessServer(db, dispatcher, PORT, auditSink, { roleAssignments });

// Graceful shutdown
const shutdown = () => {
  console.log("\n[harness] Shutting down...");
  worker.stop();
  server.close();
  db.close();
  taskStore.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

worker.start().then(() => {
  console.log(`[kanban-harness] Worker loop running — ${TICK_MS}ms tick interval`);
  console.log(`[kanban-harness] HTTP control plane on http://localhost:${PORT}`);
  console.log(`[kanban-harness] Persistence DB: ${PERSIST_DB}`);
});
