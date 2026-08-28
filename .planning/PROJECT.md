# PROJECT: mcp-games-monorepo

## Identity
**Repo:** RemyLoveLogicAI/mcp-games-monorepo
**Description:** Four-Tier Self-Healing AI Agent Platform + context-aware CYOA game engine
**Stack:** TypeScript, pnpm monorepo, Node.js 20+, Redis, vitest
**Live demo:** https://mcp-games-pyqtlryc.devinapps.com (static `Activation` story, `apps/cyoa-engine`)

## Packages
| Package | Role | Status |
|---------|------|--------|
| `apps/cyoa-engine` | CYOA game engine, YAML-defined games | Live (static demo) |
| `kanban-harness` | Kanban workflow layer | In development |
| `story-engine` | Narrative/dialogue system | In development |
| `antigravity-superserver-mcp` | MCP super-server / orchestration | Partially built |

## Architecture (4-Tier)
```
TIER 3: HUMAN-IN-THE-LOOP  → absolute intervention only
TIER 2: SYSTEMS CHECK      → human-glanceable dashboard
TIER 1: AI WATCHDOG        → 5+ recovery strategies per failure
TIER 0: AGENT RUNTIME      → self-monitors: memory, CPU, latency, errors
```

## Context for cad-adopt
- 11 open issues: 4 CRITICAL security, 2 HIGH compliance, 4 MEDIUM bugs, 1 dep update
- Monorepo: each package (cyoa-engine, kanban-harness, story-engine) maps to a Cadence phase workstream
- Security issues MUST ship before any public game content or payment integration
- Tests: vitest suite exists at root level (upgrading vitest 2.1.9 → 3.2.6 in issue #56)
- DO NOT ship phase 3+ until phase 0 security is closed
