import { HarnessDB } from "./schemas/HarnessDB";
import { TickDispatcher } from "./dispatcher/TickDispatcher";
import { WorkerLoop } from "./WorkerLoop";
import { createHarnessServer } from "./server/HarnessServer";
import { realTaskHandler } from "./handlers/RealTaskHandler";
import { SqliteTaskStore } from "./persistence/TaskPersistence";
import { type AuditEvent } from "./compliance/AuditLog";

const PORT = parseInt(process.env.HARNESS_PORT ?? "8794", 10);
const TICK_MS = parseInt(process.env.HARNESS_TICK_MS ?? "1000", 10);
const DB_PATH = process.env.HARNESS_DB ?? "var/harness.db";
const PERSIST_DB = process.env.HARNESS_PERSIST_DB ?? "var/harness-persist.db";

// Ensure var directory exists
import { mkdirSync } from "node:fs";
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

const server = createHarnessServer(db, dispatcher, PORT, auditSink);

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
  console.log(`[kanban-harness] Handler: realTaskHandler (shell|http|log)`);
  console.log(`[kanban-harness] HTTP control plane on http://localhost:${PORT}`);
  console.log(`[kanban-harness] Health: http://localhost:${PORT}/health`);
  console.log(`[kanban-harness] Persistence DB: ${PERSIST_DB}`);
  console.log(`[kanban-harness] Create a shell task:`);
  console.log(`  curl -X POST http://localhost:${PORT}/tasks -H 'Content-Type: application/json' -H 'X-Principal-Subject: alice' -H 'X-Principal-Roles: operator' -d '{"title":"Run tests","priority":"high","metadata":{"type":"shell","command":"echo hello && pwd","timeoutMs":5000}}'`);
});
