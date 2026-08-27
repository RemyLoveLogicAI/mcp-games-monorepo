import { HarnessDB } from "./schemas/HarnessDB";
import { TickDispatcher } from "./dispatcher/TickDispatcher";
import { WorkerLoop } from "./WorkerLoop";
import { createHarnessServer } from "./server/HarnessServer";
import { logTaskHandler } from "./handlers/LogTaskHandler";

const PORT = parseInt(process.env.HARNESS_PORT ?? "8794", 10);
const TICK_MS = parseInt(process.env.HARNESS_TICK_MS ?? "1000", 10);

const db = new HarnessDB("var/harness.db");

// Real handler: processes tasks via LogTaskHandler
const dispatcher = new TickDispatcher(db, logTaskHandler);

const worker = new WorkerLoop(dispatcher, {
  intervalMs: TICK_MS,
  onTick: (result) => {
    if (result.processed) {
      console.log(`[tick] ${result.taskId}: ${result.fromState} → ${result.toState} (${result.durationMs}ms)${result.error ? ` ERR: ${result.error}` : ""}`);
    }
  },
  onError: (err) => console.error(`[tick] Worker error:`, err),
});

const server = createHarnessServer(db, dispatcher, PORT);

// Graceful shutdown
const shutdown = () => {
  console.log("\n[harness] Shutting down...");
  worker.stop();
  server.close();
  db.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

worker.start().then(() => {
  console.log(`[kanban-harness] Worker loop running — ${TICK_MS}ms tick interval`);
  console.log(`[kanban-harness] HTTP control plane on http://localhost:${PORT}`);
  console.log(`[kanban-harness] Health: http://localhost:${PORT}/health`);
});
