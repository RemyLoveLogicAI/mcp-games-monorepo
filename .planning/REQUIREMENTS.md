# mcp-games-monorepo — Requirements

## R1: Eliminate code injection via `new Function()` in GameStateMachine
- **Sources:** #5, #7
- **Severity:** CRITICAL (CVSS 9.0-10.0)
- **Package:** story-engine
- **Phase:** P1
- **Acceptance criteria:**
  1. No occurrence of `new Function()` or `eval()` in any source file
  2. GameStateMachine uses a static dispatch table or Map for state transitions
  3. Test: malicious payload injection returns error, does not execute
  4. All existing 23+ tests still pass
- **Verification:** grep -rn "new Function\|eval(" packages/ → 0 hits

## R2: Add authentication + authorization to all API endpoints
- **Sources:** #6, #9
- **Severity:** CRITICAL (CVSS 8.5-9.0)
- **Package:** mcp-games-server
- **Phase:** P1
- **Acceptance criteria:**
  1. All HTTP endpoints require valid auth token (Bearer or session)
  2. Unauthorized requests return 401 with error body
  3. Forbidden requests (wrong scope) return 403
  4. Auth middleware unit tested with mock tokens
  5. Integration test: full request cycle with + without auth
- **Verification:** curl localhost:PORT/endpoint without token → 401

## R3: Implement PCI-DSS compliance (incident response + access control)
- **Sources:** #8, #11
- **Severity:** HIGH
- **Package:** mcp-games-server
- **Phase:** P1
- **Acceptance criteria:**
  1. Access control matrix document in repo (docs/access-control.md)
  2. Role-based access: admin, operator, viewer
  3. Audit log: all state transitions + API calls logged with actor
  4. Incident response playbook in repo (docs/incident-response.md)
  5. Audit log queryable via API endpoint
- **Verification:** audit log contains actor + action + timestamp for every mutation

## R4: Fix race conditions + memory leaks in GameStateMachine
- **Sources:** #10, #14
- **Severity:** MEDIUM
- **Package:** story-engine
- **Phase:** P2
- **Acceptance criteria:**
  1. No unbounded array/object growth in transition history
  2. Concurrent tick test: 100 parallel ticks, no data corruption
  3. Memory profile: flat over 10k sequential ticks (heap delta < 1MB)
  4. All existing tests pass
- **Verification:** node --expose-gc stress test, heap snapshot before/after

## R5: Fix dialogue manager ambiguous response handling
- **Sources:** #12, #15
- **Severity:** MEDIUM
- **Package:** story-engine
- **Phase:** P2
- **Acceptance criteria:**
  1. Ambiguous responses resolve to a single deterministic path
  2. No infinite conversation loops (max depth: 10)
  3. User receives feedback when response is ambiguous
  4. Test: feed ambiguous input, verify single resolved path + feedback
- **Verification:** unit test with ambiguous fixture → deterministic output

## R6: Bump vitest from 2.1.9 → 3.x
- **Sources:** #56
- **Severity:** LOW
- **Package:** root
- **Phase:** P3
- **Acceptance criteria:**
  1. vitest 3.x installed and running
  2. All 23+ existing tests pass without modification
  3. No deprecated API usage warnings
  4. CI matrix updated if needed
- **Verification:** pnpm test → all green, zero warnings

## R7: Deduplicate GitHub issues
- **Severity:** LOW
- **Phase:** P3
- **Acceptance criteria:**
  1. Close #7 as duplicate of #5
  2. Close #9 as duplicate of #6
  3. Close #11 as duplicate of #8
  4. Close #14 as duplicate of #10
  5. Close #15 as duplicate of #12
  6. Each closed issue has "Duplicate of #N" comment
- **Verification:** open issues count drops from 11 → 6

## R8: Add retry/backoff to RealTaskHandler
- **Severity:** MEDIUM
- **Package:** kanban-harness
- **Phase:** P4
- **Acceptance criteria:**
  1. Shell command failures retry up to N times (configurable, default 3)
  2. Exponential backoff between retries (base 1s, factor 2)
  3. Final failure transitions task to "todo" (existing behavior)
  4. Retry count tracked in task.metadata
  5. Test: failing command retries then succeeds on 2nd attempt

## R9: Add Prometheus metrics endpoint to HarnessServer
- **Severity:** MEDIUM
- **Package:** kanban-harness
- **Phase:** P4
- **Acceptance criteria:**
  1. GET /metrics returns Prometheus-format text
  2. Metrics: ticks_total, tasks_processed_total, tasks_failed_total, tick_duration_ms
  3. Test: /metrics returns valid prometheus format

## R10: Add task TTL + auto-cleanup for stale "running" tasks
- **Severity:** MEDIUM
- **Package:** kanban-harness
- **Phase:** P4
- **Acceptance criteria:**
  1. Tasks in "running" state longer than TTL (default 5min) auto-transition to "todo"
  2. Cleanup runs on each tick
  3. Test: task stuck in "running" for 6min → auto-requeued

## R11: Wire kanban-harness to story-engine as task source
- **Severity:** HIGH
- **Package:** kanban-harness → story-engine
- **Phase:** P4
- **Acceptance criteria:**
  1. story-engine creates kanban tasks for narrative beats
  2. kanban-harness executes story tasks via RealTaskHandler
  3. Completed tasks update story state
  4. Integration test: create story task → harness executes → story state advances
