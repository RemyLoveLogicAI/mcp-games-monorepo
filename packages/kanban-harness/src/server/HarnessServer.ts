import http from "http";
import { randomUUID } from "node:crypto";
import type { HarnessDB } from "../schemas/HarnessDB";
import { TickDispatcher } from "../dispatcher/TickDispatcher";
import { type AuditSink, withAudit } from "../compliance/AuditLog";
import { type AuthPrincipal, type Role, requirePermission, type Permission, ForbiddenError } from "../compliance/Rbac";

const KNOWN_ROLES: readonly Role[] = ["viewer", "operator", "auditor", "admin"];

/**
 * Principal-resolution options for the control plane.
 *
 * TRUST BOUNDARY: the X-Principal-Subject / X-Principal-Roles request headers
 * are client-controlled. They are NEVER trusted by default.
 *
 * - `trustProxyHeaders: true` — honor the headers as asserted by an upstream
 *   trusted proxy. Enable ONLY when a proxy strips client-supplied values and
 *   sets its own from verified authentication. Direct client access with this
 *   on lets anyone claim admin.
 * - `roleAssignments` — server-side subject → roles map. The request subject is
 *   looked up here; the X-Principal-Roles header is ignored entirely. Subjects
 *   missing from the map get the viewer role.
 * - neither — every request is treated as viewer (safe default).
 */
export interface HarnessServerAuthOptions {
  readonly trustProxyHeaders?: boolean;
  readonly roleAssignments?: Readonly<Record<string, readonly Role[]>>;
}

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
 *   The principal subject is read from the X-Principal-Subject request header.
 *   Roles are resolved server-side (see HarnessServerAuthOptions): client
 *   X-Principal-Roles headers are ignored unless trustProxyHeaders is enabled
 *   behind a trusted proxy. Unmapped subjects default to viewer.
 *   Every operation — including denied attempts — is recorded via the AuditSink.
 */

export function createHarnessServer(
  db: HarnessDB,
  dispatcher: TickDispatcher,
  port: number = 8794,
  auditSink?: AuditSink,
  auth: HarnessServerAuthOptions = {},
): http.Server {
  // Default no-op audit sink when none provided
  const sink: AuditSink = auditSink ?? { append: () => {} };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    res.setHeader("Content-Type", "application/json");

    // Helper to read body
    const readBody = (): Promise<Record<string, unknown>> =>
      new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try { resolve(data ? JSON.parse(data) as Record<string, unknown> : {}); }
          catch { resolve({}); }
        });
      });

    // Resolve principal: subject is client-asserted; roles are NEVER taken from
    // client headers unless a trusted proxy is configured to assert them.
    const extractPrincipal = (correlationId: string): AuthPrincipal => {
      const subject = (req.headers["x-principal-subject"] as string | undefined) ?? "anonymous";
      let roles: readonly Role[];
      if (auth.trustProxyHeaders) {
        const rolesHeader = (req.headers["x-principal-roles"] as string | undefined) ?? "";
        const parsed = rolesHeader
          .split(",")
          .map(r => r.trim())
          .filter((r): r is Role => (KNOWN_ROLES as readonly string[]).includes(r));
        roles = parsed.length ? parsed : ["viewer"];
      } else if (auth.roleAssignments) {
        const assigned = auth.roleAssignments[subject] ?? [];
        const valid = assigned.filter((r): r is Role => (KNOWN_ROLES as readonly string[]).includes(r));
        roles = valid.length ? valid : ["viewer"];
      } else {
        roles = ["viewer"];
      }
      return { subject, roles, correlationId };
    };

    // Helper: wrap operation with permission check + audit.
    // The permission check runs INSIDE the audit wrapper so that denied
    // attempts are recorded (outcome "denied") instead of throwing before
    // the audit event is emitted.
    const guarded = async <T>(
      resource: string,
      action: string,
      permission: Permission,
      correlationId: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const principal = extractPrincipal(correlationId);
      return withAudit(
        sink,
        { subject: principal.subject, action, resource, correlationId },
        async () => {
          requirePermission(principal, permission);
          return operation();
        },
      );
    };

    try {
      // GET /health — no auth required
      if (path === "/health" && method === "GET") {
        res.end(JSON.stringify({ ok: true, ticks: dispatcher.getTickCount() }));
        return;
      }

      const correlationId = (req.headers["x-correlation-id"] as string | undefined) ?? randomUUID();

      // GET /tasks
      if (path === "/tasks" && method === "GET") {
        const tasks = await guarded("/tasks", "task:list", "task:read", correlationId, async () => db.getAll());
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // GET /tasks/:state
      const stateMatch = path.match(/^\/tasks\/(triage|todo|running|done)$/);
      if (stateMatch && method === "GET") {
        const state = stateMatch[1] ?? "todo";
        const tasks = await guarded(`/tasks/${state}`, "task:list-by-state", "task:read", correlationId, async () => db.getByState(state as Parameters<HarnessDB["getByState"]>[0]));
        res.end(JSON.stringify({ tasks }));
        return;
      }

      // POST /tasks
      if (path === "/tasks" && method === "POST") {
        const body = await readBody();
        const task = await guarded("/tasks", "task:create", "task:write", correlationId, async () =>
          db.create({
            title: typeof body.title === "string" ? body.title : "Untitled",
            description: typeof body.description === "string" ? body.description : undefined,
            priority: typeof body.priority === "string" ? body.priority : undefined,
            tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
            metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : undefined,
          })
        );
        res.statusCode = 201;
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/transition
      const transitionMatch = path.match(/^\/tasks\/(.+)\/transition$/);
      if (transitionMatch && method === "POST") {
        const taskId = transitionMatch[1] ?? "";
        const body = await readBody();
        const task = await guarded(`/tasks/${taskId}`, "task:transition", "task:transition", correlationId, async () =>
          db.transition(taskId, body.to as Parameters<HarnessDB["transition"]>[1], typeof body.actor === "string" ? body.actor : "api")
        );
        res.end(JSON.stringify({ task }));
        return;
      }

      // POST /tasks/:id/assign
      const assignMatch = path.match(/^\/tasks\/(.+)\/assign$/);
      if (assignMatch && method === "POST") {
        const taskId = assignMatch[1] ?? "";
        const body = await readBody();
        const task = await guarded(`/tasks/${taskId}`, "task:assign", "task:write", correlationId, async () =>
          db.assign(taskId, typeof body.assigneeId === "string" ? body.assigneeId : "")
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
        const taskId = logMatch[1] ?? "";
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
