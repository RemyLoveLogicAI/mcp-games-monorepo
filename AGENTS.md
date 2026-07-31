# AGENTS.md — MCP Games Monorepo

> AI-coding agent instructions for the MCP Games super-server monorepo.
> Follow these conventions on every change. When in doubt, run `pnpm typecheck` and `pnpm test`.

## Project at a Glance

A TypeScript pnpm-workspace monorepo that implements a "super server" for AI-agent
playable experiences on the Model Context Protocol (MCP). It ships a flagship MCP
server (`@omnigents/mcp-games-server`) plus a four-tier self-healing observability
stack, a Next.js site, a Telegram bot, and supporting packages.

- **Package manager:** pnpm 8.12.0 (`packageManager` field in root `package.json`)
- **Build orchestrator:** turbo 1.11.0 (`turbo.json`)
- **TypeScript:** 5.3+ (strict)
- **Runtime:** Node.js >=22.13.0
- **Tests:** Jest (unit) + Vitest (integration), unified via turbo
- **Lint:** ESLint 8.57.1 + `eslint-plugin-security`
- **Format:** Prettier 3.1.0

## Repository Layout

```
.
├── apps/
│   ├── cyoa-engine/        # Choose Your Own Adventure engine
│   ├── mcp-connector/      # Express.js MCP integration service (15s timeout to game server)
│   ├── mcp-games-site/     # Next.js frontend (Vercel / Cloudflare Workers)
│   ├── narrative-ai/       # Python-based narrative AI
│   └── omnigentic/         # Main application entry
├── packages/
│   ├── mcp-games-server/   # Flagship MCP server (game engine, WebRTC, audio, realtime mesh)
│   ├── mcp-sdk/            # MCP client library
│   ├── shared/             # Shared types, telemetry, logging, utilities
│   ├── shared-types/       # Type definitions
│   ├── story-engine/       # Core story logic
│   ├── execution-ledger/   # Execution tracking
│   ├── telegram-bot/       # Telegram bot integration
│   ├── tier0-runtime/      # Tier 0: Agent Runtime
│   ├── tier1-watchdog/     # Tier 1: AI Watchdog (failure classification + recovery)
│   ├── tier2-systems-check/ # Tier 2: Systems Check (health monitoring CLI)
│   └── tier3-hitl/         # Tier 3: Human-in-the-Loop manager
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## File-Scoped Commands

Run from the repository root unless a package path is noted.

### Top-level (turbo-orchestrated)

| Command | What it does |
|---|---|
| `pnpm install` | Install all dependencies (pnpm workspace) |
| `pnpm build` | Build all packages via turbo |
| `pnpm build:flagship` | Build only the flagship apps: mcp-games-site, mcp-connector, mcp-games-server |
| `pnpm dev` | Dev mode for flagship apps (mcp-games-site + mcp-connector) |
| `pnpm dev:all` | Dev mode for all packages |
| `pnpm dev:site` | Dev mode for just the Next.js site |
| `pnpm dev:connector` | Dev mode for just the Express connector (builds server first) |
| `pnpm test` | Run all tests (turbo: test) |
| `pnpm lint` | Lint all packages (turbo: lint) |
| `pnpm lint:security` | Run security-focused ESLint on all JS/TS files |
| `pnpm typecheck` | Type-check all packages (turbo: typecheck) |
| `pnpm format` | Format all TS/TSX/JS/JSON/MD files with Prettier |
| `pnpm clean` | Clean all dist dirs + node_modules |

### Package-scoped (use `--filter` or `--dir`)

```bash
# Build a single package
pnpm --filter @omnigents/mcp-games-server build

# Run a single package's tests
pnpm --filter @omnigents/mcp-games-server test

# Dev a specific app
pnpm --dir apps/mcp-connector dev
```

### Key package scripts (`@omnigents/mcp-games-server`)

| Command | What it does |
|---|---|
| `pnpm --filter @omnigents/mcp-games-server build` | `tsc` — compile to `dist/` |
| `pnpm --filter @omnigents/mcp-games-server dev` | `tsc --watch` |
| `pnpm --filter @omnigents/mcp-games-server start` | Run MCP server in stdio mode: `MCP_STDIO=1 node dist/index.js` |
| `pnpm --filter @omnigents/mcp-games-server selftest` | Build + run self-test (`node dist/selftest.js`) |
| `pnpm --filter @omnigents/mcp-games-server test` | Run unit + integration tests |
| `pnpm --filter @omnigents/mcp-games-server test:unit` | Jest unit tests (`src`) |
| `pnpm --filter @omnigents/mcp-games-server test:integration` | Vitest integration tests (`tests/integration`) |
| `pnpm --filter @omnigents/mcp-games-server test:mesh` | Run the realtime-mesh session-blueprint test |
| `pnpm --filter @omnigents/mcp-games-server demo:mesh` | Build + run the mesh demo |

## Build & Dev Order (Critical)

The MCP server **must be built before** the connector can start in dev mode.
The root `predev` / `predev:connector` scripts handle this automatically, but
if you run things manually:

```bash
pnpm --filter @omnigents/mcp-games-server build   # build first
pnpm dev:connector                                 # then start connector
```

Turbo enforces build ordering via `dependsOn: ["^build"]` in `turbo.json`, so
`pnpm build` from the root always builds dependencies before dependents.

## MCP Server

- **Transport:** stdio (`MCP_STDIO=1`)
- **Entrypoint:** `packages/mcp-games-server/dist/index.js`
- **Tools exposed:** `health_check`, `load_game`, `start_game`, `make_choice`, `plan_realtime_mesh`
- **Game definitions:** YAML files validated by Zod schemas
- **Default game:** `games/morning-decision.yaml` (path resolved via multi-location fallback)
- **Self-test:** `pnpm --filter @omnigents/mcp-games-server selftest`
- **Health endpoints (connector):** `/health` and `/ready`

## Testing Conventions

- **Unit tests:** Jest with `ts-jest`, ESM support, `__tests__/` directories.
  Run with `NODE_ENV=test` to disable telemetry bus emission (emits are no-ops in test).
- **Integration tests:** Vitest, `tests/integration/` directories.
- **Run all:** `pnpm test` (turbo-orchestrated, depends on `build`).
- **Single package:** `pnpm --filter <pkg> test`
- **Run in-band for stability:** `jest --runInBand` is used in package scripts.

## Key Conventions & Gotchas

- **Workspace protocol:** Inter-package deps use `"workspace:*"` in `package.json`.
- **Telemetry bus:** Emits are no-ops when `NODE_ENV=test`. Don't rely on
  telemetry side-effects in tests.
- **State manager:** Has both an interface (`StateStore`) and implementations
  (`InMemoryStateStore`, `SupabaseStateStore`). Use `getStateStore()` to obtain
  the active store — verify it exists before relying on it.
- **Game path resolution:** The server checks multiple candidate locations for
  game YAML files; don't hardcode a single path.
- **Connector timeout:** The MCP connector enforces a 15-second timeout on
  game-server calls. Handle timeouts gracefully in integration code.
- **Env files:** `turbo.json` treats `**/.env.*local` as global dependencies,
  so turbo will re-run tasks when local env files change.
- **Private packages:** Most packages are `"private": true` — do not publish.
- **Format on save:** Run `pnpm format` before committing; Prettier targets
  `**/*.{ts,tsx,js,jsx,json,md}`.

## Commit Attribution

Commits in this repo use the following attribution format:

```
Co-Authored-By: Claude <noreply@anthropic.com>

Co-authored-by: Orca <help@stably.ai>

LoveLogic AI Dev <luvlogic-ai@proton.me>
```

Include this trailer block on all commits authored with AI assistance.

## Tier Architecture (Quick Reference)

| Tier | Package | Role |
|---|---|---|
| 0 | `@omnigents/tier0-runtime` | Agent runtime — executes agent turns |
| 1 | `@omnigents/tier1-watchdog` | AI Watchdog — classifies failures and triggers recovery |
| 2 | `@omnigents/tier2-systems-check` | Systems Check — health monitoring CLI |
| 3 | `@omnigents/tier3-hitl` | Human-in-the-Loop — escalates to human operators |

## CI / Lint Gate

Before opening a PR, ensure:

```bash
pnpm build       # all packages compile
pnpm typecheck   # all packages type-check
pnpm lint        # passes ESLint (incl. security rules)
pnpm test        # all unit + integration tests pass
pnpm format      # code is Prettier-formatted
```

## Notes for Future Agents

- The `.claude/` directory holds agent-specific config (`settings.local.json`,
  `notes/`). Keep it in sync with repo conventions.
- `workspace/` is a scratch/experimental area — avoid committing work there.
- If you add a new package under `packages/` or `apps/`, ensure it is picked up
  by `pnpm-workspace.yaml` (uses `'packages/*'` and `'apps/*'` globs) and that
  its `package.json` defines `build`, `test`, `lint`, and `typecheck` scripts
  so turbo can orchestrate it.
- For the MCP server specifically, always run `selftest` after major changes
  to verify the game engine, state store, and tool registration are intact.
