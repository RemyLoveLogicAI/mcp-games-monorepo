# MCP Games

**A contextual execution surface and the MCP super server behind it.**

The flagship website is the front door. It turns a decision into one of two
honest outcomes: a tangible browser artifact, or a typed MCP tool call with a
structured execution receipt. A single command bar serves keyboard and visual
workflows. The wider monorepo supplies the game engine, stdio MCP server,
browser-safe connector, context contracts, realtime-mesh planning, Telegram
and voice surfaces, and the four-tier self-healing agent platform.

## Play it now

### Prerequisites

- Node.js 22.13 or newer
- pnpm 8 or newer

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` builds the stdio server, then starts the two browser-facing services:

- Flagship website: the URL printed by the site dev server
- MCP connector: <http://localhost:3001>

Set `NEXT_PUBLIC_MCP_CONNECTOR_URL=http://localhost:3001` before building the
site to enable server-backed runs. Without a connector, the interface says so
and keeps only its local artifact actions available; it never substitutes a
fictional server result.

Useful focused commands:

```bash
pnpm dev:site       # flagship only
pnpm dev:connector  # browser-to-MCP boundary only
pnpm start:mcp      # MCP Games server over stdio
pnpm build:flagship # site + connector + MCP server
pnpm dev:all        # every development task in the monorepo
```

## How the surfaces fit

```text
Player
  └─ apps/mcp-games-site       contextual surface + unified command bar
       └─ apps/mcp-connector   browser-safe REST boundary
            └─ stdio MCP transport bridge
                 └─ packages/mcp-games-server
                      ├─ health_check
                      ├─ load_game / start_game / make_choice
                      └─ plan_realtime_mesh
```

The website checks Games execution readiness through the connector, starts a
real MCP session, executes typed choices, and retains returned receipts in
device-local history. Browser-created focus blocks download as real `.ics`
artifacts and receive separate local receipts. Device-local history is useful
but is not an immutable audit ledger; durable, tamper-evident receipts are
tracked in Beads.

The deployed Sites frontend currently has no hosted connector and therefore
reports the execution plane as unavailable. Production connector hosting,
authentication, and strict origin policy are release blockers, not simulated
features. Calendar and weather adapters are also incomplete, so authored
fallback context remains visible until verified providers are connected.

## MCP server

Build and register the stdio entry point with an MCP client:

```bash
pnpm --dir packages/mcp-games-server build
pnpm start:mcp
```

The server exposes:

- `health_check`
- `load_game`
- `start_game`
- `make_choice`
- `plan_realtime_mesh`

The included game definition lives at
`games/morning-decision.yaml`. Server parser sample data lives at
`packages/mcp-games-server/data/sample.yaml`.

## Environment contract

Copy `.env.example` for local development. The important browser boundary is:

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_MCP_CONNECTOR_URL` | Flagship site | Connector base URL embedded at build time |
| `MCP_CONNECTOR_PORT` or `PORT` | MCP connector | REST listener; defaults to `3001` |
| `CORS_ORIGINS` or `MCP_CONNECTOR_ALLOWED_ORIGINS` | MCP connector | Comma-separated browser origins |
| `MCP_GAMES_SERVER_ENTRY` | MCP connector | Optional explicit path to the built Games stdio entry |
| `MCP_GAMES_ROOT`, `MCP_GAMES_WORKDIR` | MCP connector | Optional game allowlist root and child-process working directory |
| `MCP_GAMES_FLAGSHIP_URL` | Legacy CYOA app | Canonical flagship redirect destination |
| `REDIS_URL` | Server packages | Cache and telemetry bus |
| `SUPABASE_URL`, `SUPABASE_KEY` | MCP Games server | Optional persistence adapter |

Never put secrets in `NEXT_PUBLIC_*` variables.

## Project map

```text
apps/
  mcp-games-site/       flagship playable website
  mcp-connector/        REST integration boundary
  cyoa-engine/          legacy entry redirected to the flagship
  omnigentic/           agent application
packages/
  mcp-games-server/     MCP stdio game server
  story-engine/         narrative engine
  mcp-sdk/              MCP client primitives
  telegram-bot/         Telegram surface
  tier0-runtime/        self-aware runtime
  tier1-watchdog/       automated recovery
  tier2-systems-check/  coordination and status
  tier3-hitl/           human escalation
games/                  YAML game definitions
docs/                   audio, WebRTC, and security notes
```

## Verification

```bash
pnpm build:flagship
pnpm typecheck
pnpm test
pnpm lint
```

Some older packages do not yet define every lifecycle task, so Turborepo may
report that no task exists for those workspaces. The flagship build command is
the fastest integration gate for the primary product path.

## Platform philosophy

The four-tier agent platform favors observable, recoverable, governable
automation:

1. Tier 0 runs and self-monitors the agent.
2. Tier 1 applies automated recovery strategies.
3. Tier 2 coordinates services and exposes system status.
4. Tier 3 escalates decisions that truly need a human.

See `unrestricted-omnigents-manifesto.md` and
`four-tier-observability.md` for the deeper architecture.

## License

MIT © LoveLogicAI LLC
