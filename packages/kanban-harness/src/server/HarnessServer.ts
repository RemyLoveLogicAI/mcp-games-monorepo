import http from "http";
import type { HarnessDB } from "../schemas/HarnessDB";
import { TickDispatcher, type TickResult } from "../dispatcher/TickDispatcher";
import { type AuditSink, withAudit } from "../compliance/AuditLog";
import { type AuthPrincipal, requirePermission, type Permission, ForbiddenError } from "../compliance/Rbac";

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
 *
 * RBAC & Audit:
 *   All mutating operations require a principal with the appropriate permission.
 *   Principal is extracted from the X-Principal-Subject (subject) and
 *   X-Principal-Roles (comma-separated roles) request headers.
 *   Every operation is recorded via the AuditSink.
 */

export function createHarnessServer(
  db: HarnessDB,
  dispatcher: TickDispatcher,
  port: number = 8794,
  auditSink?: AuditSink,
): http.Server {
  // Default no-op audit sink when none provided
  const sink: AuditSink = auditSink ?? { append: () => {} };

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

    // Extract principal from request headers
    const extractPrincipal = (correlationId: string): AuthPrincipal => {
      const subject = (req.headers["x-principal-subject"] as string | undefined) ?? "anonymous";
      const rolesHeader = (req.headers["x-principal-roles"] as string | undefined) ?? "";
      const roles = rolesHeader
        .split(",")
        .map(r => r.trim())
        .filter(r => ["viewer", "operator", "auditor", "admin"].includes(r)) as AuthPrincipal["roles"];
      return { subject, roles: roles.length ? roles : ["viewer"], correlationId };
    };

    // Helper: wrap operation with permission check + audit
    const guarded = async <T>(
      resource: string,
      action: string,
      permission: Permission,
      correlationId: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const principal = extractPrincipal(correlationId);
      requirePermission(principal, permission);
      return withAudit(sink, { subject: principal.subject, action, resource, correlationId }, operation);
    };

    try {
      // GET /health — no auth required
      if (path === "/health" && method === "GET") {
        res.end(JSON.stringify({ ok: true, ticks: dispatcher.getTickCount() }));
        return;
      }

      const correlationId = (req.headers["x-correlation-id"] as string | undefined) ?? crypto.randomUUID();

      // GET /tasks
      if (path === "/tasks" && method === "GET") {
        const tasks = await guarded("/tasks", "task:list", "task:read", correlationId, async () => db.getAll());
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // GET /tasks/:state
      const stateMatch = path.match(/^\/tasks\/(triage|todo|running|done)$/);
      if (stateMatch && method === "GET") {
        const tasks = await guarded(`/tasks/${stateMatch[1]}`, "task:list-by-state", "task:read", correlationId, async () => db.getByState(stateMatch[1] as any));
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // POST /tasks
      if (path === "/tasks" && method === "POST") {
        const body = await readBody();
        const task = await guarded("/tasks", "task:create", "task:write", correlationId, async () =>
          db.create({
            title: body.title ?? "Untitled",
            description: body.description,
            priority: body.priority,
            tags: body.tags,
            metadata: body.metadata,
          })
        );
        res.statusCode = 201;
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/transition
      const transitionMatch = path.match(/^\/tasks\/(.+)\/transition$/);
      if (transitionMatch && method === "POST") {
        const taskId = transitionMatch[1]!;
        const body = await readBody();
        const task = await guarded(`/tasks/${taskId}`, "task:transition", "task:transition", correlationId, async () =>
          db.transition(taskId, body.to, body.actor ?? "api")
        );
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/assign
      const assignMatch = path.match(/^\/tasks\/(.+)\/assign$/);
      if (assignMatch && method === "POST") {
        const taskId = assignMatch[1]!;
        const body = await readBody();
        const task = await guarded(`/tasks/${taskId}`, "task:assign", "task:write", correlationId, async () =>
          db.assign(taskId, body.assigneeId)
        );
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tick
      if (path === "/tick" && method === "POST") {
        const result = await guarded("/tick", "dispatcher:tick", "task:transition", correlationId, async () =>
          dispatcher.tick("api", correlationId)
        );
        res.end(JSON.stringify({ result }));
        return;
      }

      // GET /tasks/:id/log
      const logMatch = path.match(/^\/tasks\/(.+)\/log$/);
      if (logMatch && method === "GET") {
        const taskId = logMatch[1]!;
        const log = await guarded(`/tasks/${taskId}/log`, "task:read-log", "task:read", correlationId, async () =>
          db.getTransitionLog(taskId)
        );
        res.end(JSON.stringify({ log }));
        return;
      }

      // 404
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: err.message }));
      } else {
        // Avoid leaking internal details (stack traces, file paths) to clients
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  server.listen(port, () => {
    console.log(`[kanban-harness] Server listening on :${port}`);
  });

  return server;
}
