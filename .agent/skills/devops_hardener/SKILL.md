---
name: DevOps Hardener
description: Enforces strict engineering standards, CI/CD best practices, and defensive coding patterns.
---

# DevOps Hardener Skill

This skill guides the agent to apply "Google-Grade" engineering practices to the codebase.

## 1. Safety & Resilience
- **Strict Typing**: No `any`. Use `unknown` with Zod validation at boundaries.
- **Error Boundaries**: Every major component (`RuntimeHost`, `MCPBridge`) must wrap operations in `try/catch` blocks that emit structured telemetry events before re-throwing or recovering.
- **Result Pattern**: Prefer returning `{ success: boolean, value?: T, error?: Error }` over throwing exceptions for expected failures (e.g., "Agent not found").

## 2. Testing Strategy
- **Unit Tests**: Every new class MUST have a corresponding `.test.ts` file using `node:test` or `vitest`.
- **Integration Tests**: `selftest.ts` should be expanded to simulate full runtime lifecycles.

## 3. DevOps Configuration
- **CI Pipeline**: Ensure a `.github/workflows/ci.yaml` exists to run build, lint, and test on every push.
- **Linting**: Ensure `eslint` and `prettier` are configured and enforcing rules.

## 4. Observability
- **Usage**: Use the `TelemetryBus` for all significant state changes.
- **Tracing**: Pass `traceId` through every async call depth.

## Protocol
When executing a task with this skill active:
1.  **Check**: Does a test exist?
2.  **Check**: Is the error handling robust?
3.  **Check**: Is the CI config present?
