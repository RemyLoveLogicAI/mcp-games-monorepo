import { HarnessDB } from "./schemas/HarnessDB";
import { TickDispatcher } from "./dispatcher/TickDispatcher";
import { WorkerLoop } from "./WorkerLoop";
import { createHarnessServer } from "./server/HarnessServer";
import { realTaskHandler } from "./handlers/RealTaskHandler";

const PORT = parseInt(process.env.HARNESS_PORT ?? "8794", 10);
const TICK_MS = parseInt(process.env.HARNESS_TICK_MS ?? "1000", 10);

const db = new HarnessDB("var/harness.db");

// Production handler: executes shell commands, HTTP calls, or log fallback
// based on task.metadata.type
const dispatcher = new TickDispatcher(db, realTaskHandler);

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
  console.log(`[kanban-harness] Handler: realTaskHandler (shell|http|log)`);
  console.log(`[kanban-harness] HTTP control plane on http://localhost:${PORT}`);
  console.log(`[kanban-harness] Health: http://localhost:${PORT}/health`);
  console.log(`[kanban-harness] Create a shell task:`);
  console.log(`  curl -X POST http://localhost:${PORT}/tasks -H 'Content-Type: application/json' -d '{"title":"Run tests","priority":"high","metadata":{"type":"shell","command":"echo hello && pwd","timeoutMs":5000}}'`);
  console.log(`  curl -X POST http://localhost:${PORT}/tasks/$(curl -s http://localhost:${PORT}/tasks/triage | jq -r .tasks[0].id)/transition -H 'Content-Type: application/json' -d '{"to":"todo"}'`);
});
