import http from "http";
import type { HarnessDB } from "../schemas/HarnessDB";
import { TickDispatcher, type TickResult } from "../dispatcher/TickDispatcher";

/**
 * HarnessServer — HTTP control plane on :8794.
 *
 * Endpoints:
 *   GET  /health            → { ok: true, ticks: N }
 *   GET  /tasks             → all tasks
 *   GET  /tasks/:state      → tasks filtered by state
 *   POST /tasks             → create task { title, description, priority, tags }
 *   POST /tasks/:id/transition → { to: "todo"|"running"|"done", actor?: string }
 *   POST /tasks/:id/assign    → { assigneeId }
 *   POST /tick              → manual tick dispatch
 *   GET  /tasks/:id/log     → transition history
 */

export function createHarnessServer(db: HarnessDB, dispatcher: TickDispatcher, port: number = 8794): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    res.setHeader("Content-Type", "application/json");

    // Helper to read body
    const readBody = (): Promise<any> =>
      new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try { resolve(data ? JSON.parse(data) : {}); }
          catch { resolve({}); }
        });
      });

    try {
      // GET /health
      if (path === "/health" && method === "GET") {
        res.end(JSON.stringify({ ok: true, ticks: dispatcher.getTickCount() }));
        return;
      }

      // GET /tasks
      if (path === "/tasks" && method === "GET") {
        const tasks = db.getAll();
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // GET /tasks/:state
      const stateMatch = path.match(/^\/tasks\/(triage|todo|running|done)$/);
      if (stateMatch && method === "GET") {
        const tasks = db.getByState(stateMatch[1] as any);
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // POST /tasks
      if (path === "/tasks" && method === "POST") {
        const body = await readBody();
        const task = db.create({
          title: body.title ?? "Untitled",
          description: body.description,
          priority: body.priority,
          tags: body.tags,
          metadata: body.metadata,
        });
        res.statusCode = 201;
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/transition
      const transitionMatch = path.match(/^\/tasks\/(.+)\/transition$/);
      if (transitionMatch && method === "POST") {
        const taskId = transitionMatch[1];
        const body = await readBody();
        const task = db.transition(taskId, body.to, body.actor ?? "api");
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/assign
      const assignMatch = path.match(/^\/tasks\/(.+)\/assign$/);
      if (assignMatch && method === "POST") {
        const taskId = assignMatch[1];
        const body = await readBody();
        const task = db.assign(taskId, body.assigneeId);
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tick
      if (path === "/tick" && method === "POST") {
        const result = await dispatcher.tick("api");
        res.end(JSON.stringify({ result }));
        return;
      }

      // GET /tasks/:id/log
      const logMatch = path.match(/^\/tasks\/(.+)\/log$/);
      if (logMatch && method === "GET") {
        const log = db.getTransitionLog(logMatch[1]);
        res.end(JSON.stringify({ log }));
        return;
      }

      // 404
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(port, () => {
    console.log(`[kanban-harness] Server listening on :${port}`);
  });

  return server;
}
