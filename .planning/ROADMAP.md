# mcp-games-monorepo — Roadmap

## Milestone: v1.0 — Security Hardening + Stability

Target: resolve all critical/high security issues, stabilize state machine,
then ship dialogue fixes and dependency updates.

---

### P1 — Security Fixes (CRITICAL, blocks all other work)

| Req | Issue(s) | Title | Severity | Package |
|-----|---------|-------|----------|---------|
| R1  | #5, #7  | Eliminate code injection via `new Function()` in GameStateMachine | CRITICAL | story-engine |
| R2  | #6, #9  | Add authentication + authorization to API endpoints | CRITICAL | mcp-games-server |
| R3  | #8, #11 | Implement PCI-DSS compliance: incident response + access control | HIGH | mcp-games-server |

**Acceptance:**
- R1: No `new Function()` or `eval()` anywhere in the codebase. GameStateMachine uses a safe dispatch table. Test: inject malicious payload, verify rejection.
- R2: All API endpoints require auth token. Unauthorized requests return 401. Test: curl without token → 401.
- R3: Access control matrix documented. Incident response playbook in repo. Audit log functional.

---

### P2 — Stability (MEDIUM, after P1)

| Req | Issue(s) | Title | Severity | Package |
|-----|---------|-------|----------|---------|
| R4  | #10, #14 | Fix race conditions + memory leaks in GameStateMachine | MEDIUM | story-engine |
| R5  | #12, #15 | Fix dialogue manager ambiguous response handling | MEDIUM | story-engine |

**Acceptance:**
- R4: No unbounded growth in state machine transitions. Concurrent tick test passes under load (100 parallel ticks). Memory profile flat over 10k ticks.
- R5: Ambiguous responses resolve deterministically. No infinite conversation loops. Test: feed ambiguous input, verify single resolved path.

---

### P3 — Dependency Hygiene (LOW, after P2)

| Req | Issue(s) | Title | Severity | Package |
|-----|---------|-------|----------|---------|
| R6  | #56    | Bump vitest from 2.1.9 → 3.x | LOW | root |
| R7  | (ongoing) | Deduplicate duplicate issues (#5↔#7, #6↔#9, #8↔#11, #10↔#14, #12↔#15) | LOW | github |

**Acceptance:**
- R6: vitest 3.x running, all 23+ tests green, no breaking API changes.
- R7: Duplicate issues closed with "duplicate of #N" comment. Canonical issue retains all context.

---

### P4 — Feature: Kanban-Harness Production Hardening (post-stability)

| Req | Title | Severity | Package |
|-----|-------|----------|---------|
| R8  | Add retry/backoff to RealTaskHandler shell failures | medium | kanban-harness |
| R9  | Add Prometheus metrics endpoint to HarnessServer | medium | kanban-harness |
| R10 | Add task TTL + auto-cleanup for stale "running" tasks | medium | kanban-harness |
| R11 | Wire kanban-harness to story-engine as task source | high | kanban-harness → story-engine |

---

### P5 — Feature: CYOA Engine Polish (post-hardening)

| Req | Title | Severity | Package |
|-----|-------|----------|---------|
| R12 | Add story branching visualization to cyoa-engine | medium | cyoa-engine |
| R13 | Wire narrative-ai to story-engine for AI-generated branches | high | narrative-ai → story-engine |
| R14 | Add multiplayer session support to mcp-games-server | high | mcp-games-server |

---

## Issue → Requirement → Phase mapping

| Issue # | Req | Phase | Status |
|---------|-----|-------|--------|
| #5  | R1 | P1 | open |
| #7  | R1 | P1 | open (dup of #5) |
| #6  | R2 | P1 | open |
| #9  | R2 | P1 | open (dup of #6) |
| #8  | R3 | P1 | open |
| #11 | R3 | P1 | open (dup of #8) |
| #10 | R4 | P2 | open |
| #14 | R4 | P2 | open (dup of #10) |
| #12 | R5 | P2 | open |
| #15 | R5 | P2 | open (dup of #12) |
| #56 | R6 | P3 | open |
