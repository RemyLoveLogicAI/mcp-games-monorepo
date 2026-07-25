# MCP Games Flagship

The canonical MCP Games execution surface. It turns decisions into either a
real browser artifact or a typed Games MCP call with a returned execution
receipt. It does not generate fictional metrics or simulate unavailable
integrations.

## Run

From the repository root:

```bash
pnpm install
pnpm dev
```

The root command builds the Games stdio server and starts this site plus the
browser-safe connector. For site-only UI work:

```bash
pnpm dev:site
```

## Execution contract

Set the connector URL before building:

```bash
NEXT_PUBLIC_MCP_CONNECTOR_URL=http://localhost:3001
```

When configured, the site:

- checks `GET /api/games/health`;
- starts a real session with `POST /api/games/sessions`;
- executes a move through
  `POST /api/games/sessions/:sessionId/choices`;
- records returned receipt IDs and provenance in device-local activity.

When the connector is absent or unavailable, server actions stay visibly
disabled. The focus action remains useful because it creates and downloads a
standards-based `.ics` calendar artifact entirely in the browser.

## Commands

Press `/` to focus the single command bar.

- `focus [minutes]` downloads a calendar event.
- `start` starts a Games MCP session when the connector is available.
- `status` reports the verified connection state.
- `connect` rechecks the configured connector.
- `clear` removes device-local activity history.

## Receipts and automation rights

MCP receipts identify the tool, status, timestamps, duration, and summarized
payload/result. The site keeps a small local history and recommends a shortcut
only after the same kind of action succeeds twice.

That browser history is convenient, not immutable or durable. Autonomous rights
remain locked unless the backend explicitly advertises the capability and the
deployment explicitly enables it. Durable, tamper-evident receipts and scoped
automation promotion are tracked in Beads.
