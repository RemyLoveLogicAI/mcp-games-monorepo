# MCP Games

**A playable AI-agent adventure and the super server behind it.**

The flagship website is the front door: it ships with a complete embedded
adventure, a command terminal, progression, rewards, sound, and an optional
live link to the MCP connector. The wider monorepo supplies the CYOA engine,
MCP stdio server, context contracts, realtime-mesh planning, Telegram and
voice surfaces, and the four-tier self-healing agent platform.

## Play it now

### Prerequisites

- Node.js 22.13 or newer
- pnpm 8 or newer

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts the two browser-facing services:

- Flagship website: the URL printed by the site dev server
- MCP connector: <http://localhost:3001>

The game remains fully playable if the connector is unavailable. Set
`NEXT_PUBLIC_MCP_CONNECTOR_URL=http://localhost:3001` before building the site
to enable its **Connect Super Server** control.

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
  └─ apps/mcp-games-site       playable flagship + NOVA terminal
       └─ apps/mcp-connector   browser-safe REST boundary
            └─ MCP transport bridge (tracked; not implemented yet)
                 └─ packages/mcp-games-server
                      ├─ health_check
                      ├─ load_game / start_game / make_choice
                      └─ plan_realtime_mesh
```

Today the website performs a real connector health handshake. Its embedded
game is intentionally resilient and does not depend on infrastructure. The
MCP Games server is a functional stdio MCP server for AI agents and desktop
clients. Bridging the connector to that stdio server is the next integration
milestone; the connector's query and context routes currently return explicit
placeholder responses.

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
| `REDIS_URL` | Server packages | Cache and telemetry bus |
| `SUPABASE_URL`, `SUPABASE_KEY` | MCP Games server | Optional persistence adapter |

Never put secrets in `NEXT_PUBLIC_*` variables.

## Project map

```text
apps/
  mcp-games-site/       flagship playable website
  mcp-connector/        REST integration boundary
  cyoa-engine/          earlier Next.js game surface
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
