# mcp-games-monorepo — Project

## What this is

MCP Games Monorepo — a pnpm/Turborepo workspace building a multi-agent game
infrastructure stack: CYOA narrative engine, MCP protocol integration, kanban
task harness, and a 4-tier self-healing runtime. 17 workspace projects across
`packages/` and `apps/`.

## Architecture

```
apps/
  cyoa-engine/        — Next.js frontend, Choose Your Own Adventure UI
  mcp-connector/      — Express.js MCP integration service
  narrative-ai/       — AI narrative generation
  omnigentic/         — Omni-agent entry point

packages/
  kanban-harness/     — Tick dispatcher + state machine + HTTP control plane (:8794)
  mcp-games-server/   — Core game server
  mcp-sdk/            — MCP client library for semantic querying
  story-engine/       — Core story logic and state management
  telegram-bot/       — Telegram bot integration
  tier0-runtime/      — Tier 0: runtime execution
  tier1-watchdog/     — Tier 1: watchdog monitoring
  tier2-systems-check/— Tier 2: systems health checks
  tier3-hitl/         — Tier 3: human-in-the-loop
  shared/             — Shared utilities
  shared-types/       — Shared TypeScript type definitions
```

## Shipped work (from git history)

### kanban-harness (shipped Aug 27, 2026)
- Tick dispatcher with priority ordering (critical > high > medium > low)
- 4-state state machine: triage → todo → running → done
- SQLite-backed task store (better-sqlite3, WAL mode)
- HTTP control plane on :8794 (health, CRUD, transitions, tick, log)
- WorkerLoop with configurable interval + graceful shutdown
- RealTaskHandler: shell commands, HTTP calls, log fallback (metadata.type)
- 23 tests: 13 state-machine + 4 log-handler + 6 real-handler — ALL GREEN

### mcp-games-server
- Core game server with 4 test files

### mcp-sdk
- MCP client library for semantic querying — 1 test file

### story-engine
- Core story logic and state management — 1 test file

### tier3-hitl
- Human-in-the-loop integration — 1 test file

### mcp-connector (app)
- Express.js MCP integration — 1 test file

### cyoa-engine (app)
- Next.js frontend with static generation (5 pages)
- Builds clean: 13/13 turbo tasks green

### CI
- GitHub Actions: build (18.x, 20.x) + Build & Test
- pnpm lockfile regenerated, turbo v2 config fixed
- Dependabot active (npm_and_yarn + pip + github_actions groups)
- ECC bundle added (Claude Code agent context)

## Test inventory

| Package         | Test files | Status |
|----------------|------------|--------|
| kanban-harness  | 3          | 23/23 passing |
| mcp-games-server | 4         | passing |
| mcp-sdk         | 1          | passing |
| story-engine   | 1          | passing |
| tier3-hitl     | 1          | passing |
| mcp-connector  | 1          | passing |
| **Total**       | **11**     | **all green** |

## Tech stack

- **Monorepo:** pnpm workspaces + Turborepo v2
- **Language:** TypeScript (strict)
- **Runtime:** Node.js 18+ / 20+
- **Database:** SQLite (better-sqlite3, WAL)
- **Frontend:** Next.js 15, Tailwind v4
- **Testing:** Vitest 2.1.9
- **CI:** GitHub Actions (build matrix 18.x + 20.x)
- **Linting:** ESLint, Prettier
