# ROADMAP

> Phase-based execution plan. Cadence enforces: plan → execute → verify → gate.
> No phase starts until the previous gate passes adversarial review.

## Phase 0 — Security Hardening
**Goal:** Close all CRITICAL vulnerabilities before any new feature work.
**Gate:** SEC-01 and SEC-02 tests green; manual pentest of GameStateMachine + API auth layer.

| Step | Task | Req | Owner |
|------|------|-----|-------|
| 0.1 | Replace `new Function()` with safe dispatch in GameStateMachine | SEC-01 | |
| 0.2 | Write injection tests for GameStateMachine | SEC-01 | |
| 0.3 | Implement JWT/API-key middleware on all `/api/*` routes | SEC-02 | |
| 0.4 | Write auth tests (401/403/200 matrix) | SEC-02 | |
| 0.5 | Run full vitest suite — all pass | SEC-01, SEC-02 | |
| 0.6 | Adversarial review: have a subagent red-team the changes | SEC-01, SEC-02 | |

**Estimated effort:** 2–3 sessions
**Hard dependency:** Nothing from Phase 1+ ships until 0.6 passes.

---

## Phase 1 — Compliance
**Goal:** PCI-DSS access control + incident response runbook in place.
**Gate:** RBAC test matrix green; runbook reviewed and merged.

| Step | Task | Req | Owner |
|------|------|-----|-------|
| 1.1 | Implement RBAC middleware (role definitions + enforcement) | COMP-01 | |
| 1.2 | Add access logging with append-only log store | COMP-01 | |
| 1.3 | Write incident response runbook (`.planning/INCIDENT_RESPONSE.md`) | COMP-02 | |
| 1.4 | Implement anomaly-detection alerting on access logs | COMP-02 | |
| 1.5 | Run RBAC test matrix | COMP-01 | |
| 1.6 | Adversarial review: attempt privilege escalation | COMP-01, COMP-02 | |

**Prerequisite:** Phase 0 gate passed.

---

## Phase 2 — Stability
**Goal:** Eliminate race conditions, memory leaks, and dialogue ambiguity bugs.
**Gate:** Stress tests and concurrency tests green; dialogue test suite passes.

| Step | Task | Req | Owner |
|------|------|-----|-------|
| 2.1 | Fix race conditions in GameStateMachine (mutex pattern) | STAB-01 | |
| 2.2 | Fix memory leaks (event listener cleanup, promise audits) | STAB-02 | |
| 2.3 | Fix Dialogue Manager ambiguous response routing | STAB-03 | |
| 2.4 | Write concurrency stress tests | STAB-01, STAB-02 | |
| 2.5 | Write dialogue disambiguation tests | STAB-03 | |
| 2.6 | Bump vitest 2.1.9 → 3.2.6 (merge Dependabot PR #56) | MAINT-01 | |
| 2.7 | Full vitest suite green after upgrade | MAINT-01 | |

**Prerequisite:** Phase 0 gate passed. Phase 1 can run in parallel.

---

## Phase 3 — Core Package Build
**Goal:** kanban-harness and story-engine reach MVP; CYOA engine is feature-complete for season 1.
**Gate:** Each package has a passing integration test suite; CYOA demo runs with real MCP context injection.

### Workstream A: kanban-harness
| Step | Task | Req |
|------|------|-----|
| 3A.1 | Define board schema (columns, cards, swimlanes) | FEAT-01 |
| 3A.2 | Implement CRUD API for boards + cards | FEAT-01 |
| 3A.3 | Implement event bus for card transitions | FEAT-01 |
| 3A.4 | Integration tests | FEAT-01 |

### Workstream B: story-engine
| Step | Task | Req |
|------|------|-----|
| 3B.1 | Define narrative graph schema (YAML → AST) | FEAT-02 |
| 3B.2 | Implement graph compiler | FEAT-02 |
| 3B.3 | Wire compiler output to CYOA engine | FEAT-02 |
| 3B.4 | Integration tests | FEAT-02 |

### Workstream C: cyoa-engine enhancements
| Step | Task | Req |
|------|------|-----|
| 3C.1 | Real-time MCP context injection (calendar, weather, notes) | FEAT-04 |
| 3C.2 | Voice narration via PersonaPlex | FEAT-03 |

**Prerequisite:** Phase 0 gate passed. Phases 1 and 2 should be complete or nearly complete.

---

## Phase 4 — Self-Healing Runtime
**Goal:** Tier 0 agent self-monitoring live; Tier 1 AI watchdog with 5+ recovery strategies.
**Gate:** Chaos test (inject fault) → system detects and recovers without human intervention.

| Step | Task | Req |
|------|------|-----|
| 4.1 | Tier 0: instrument agent with self-monitoring (memory, CPU, latency, errors) | FEAT-05 |
| 4.2 | Tier 1: AI watchdog reads Tier 0 telemetry | FEAT-05 |
| 4.3 | Implement 5 recovery strategies per failure category | FEAT-05 |
| 4.4 | Tier 2: human-glanceable dashboard | FEAT-05 |
| 4.5 | Tier 3: push notification + escalation | FEAT-05 |
| 4.6 | Chaos test: inject fault → verify automated recovery | FEAT-05 |

---

## Milestones

| Milestone | Phase | Condition |
|-----------|-------|-----------|
| `v0.1-secure` | P0 done | All CRITICAL security issues closed |
| `v0.2-compliant` | P1 done | PCI-DSS controls in place |
| `v0.3-stable` | P2 done | All MEDIUM bugs closed, vitest upgraded |
| `v1.0-mvp` | P3 done | kanban-harness + story-engine live, CYOA with MCP context |
| `v2.0-self-healing` | P4 done | Four-tier runtime operational |
