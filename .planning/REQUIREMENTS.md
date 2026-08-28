# REQUIREMENTS

> Source-of-truth requirement matrix. Each row maps to a GitHub issue.
> Status: open | in-progress | done | filed

## Security (P0 — CRITICAL)

| ID | Requirement | Source | CVSS | Status |
|----|-------------|--------|------|--------|
| SEC-01 | Remove `new Function()` in GameStateMachine; replace with safe eval sandbox or allowlist | #7, #5 | 9.0–10.0 | open |
| SEC-02 | Add authentication + authorization controls to all API endpoints | #9, #6 | 8.5–9.0 | open |

### SEC-01 Detail
- `new Function()` constructor in `antigravity-superserver-mcp/source-snapshots/` allows arbitrary code execution
- Fix: replace with a static dispatch table or sandboxed interpreter; no dynamic code construction from user input
- Tests required: inject malicious string → expect rejection; valid state transition → expect correct state

### SEC-02 Detail
- Base API endpoints lack auth middleware
- Fix: JWT/API-key middleware on all `/api/*` routes; 401 on missing token; 403 on insufficient scope
- Tests required: unauthenticated request → expect 401; authenticated valid → expect 200; wrong scope → expect 403

---

## Compliance (P1 — HIGH)

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| COMP-01 | Implement PCI-DSS access control: RBAC, least-privilege, access logging | #8, #11 | open |
| COMP-02 | Implement PCI-DSS incident response plan: detection, containment, reporting | #8, #11 | open |

### COMP-01 Detail
- Required: role-based access control for any payment-adjacent data
- Required: access logs with tamper-evident storage
- Prerequisite: SEC-02 must be closed first

### COMP-02 Detail
- Required: documented incident response runbook (can be markdown in repo)
- Required: automated alerting on anomalous access patterns
- Prerequisite: COMP-01

---

## Stability (P2 — MEDIUM)

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| STAB-01 | Fix race conditions in Game State Machine | #14, #10 | open |
| STAB-02 | Fix memory leaks in Game State Machine | #14, #10 | open |
| STAB-03 | Fix Dialogue Manager ambiguous response handling | #15, #12 | open |

### STAB-01 / STAB-02 Detail
- File: `antigravity-superserver-mcp/source-snapshots/` (GameStateMachine)
- Race fix: add mutex/semaphore around shared state transitions; use async-queue pattern
- Memory fix: clear event listener refs on state exit; audit for unresolved promise chains
- Tests required: concurrent state transitions → expect deterministic result

### STAB-03 Detail
- Dialogue manager: ambiguous responses cause unexpected conversation flows in CYOA engine
- Fix: add explicit intent disambiguation step before routing; fallback to clarification prompt
- Tests required: ambiguous input → expect clarification; unambiguous → expect direct route

---

## Maintenance (P3)

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| MAINT-01 | Upgrade vitest 2.1.9 → 3.2.6 (Dependabot PR #56) | #56 | open |

---

## Features (P4 — Roadmap)

| ID | Requirement | Package | Status |
|----|-------------|---------|--------|
| FEAT-01 | kanban-harness: core board CRUD + event bus | kanban-harness | planned |
| FEAT-02 | story-engine: narrative graph compiler | story-engine | planned |
| FEAT-03 | CYOA voice narration via PersonaPlex | apps/cyoa-engine | planned |
| FEAT-04 | Real-time MCP context injection (calendar, weather, notes) | apps/cyoa-engine | planned |
| FEAT-05 | Four-Tier self-healing runtime: Tier 0 agent self-monitoring | agentic platform | planned |
