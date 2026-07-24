# MCP Games Readiness Ledger

Last updated: 2026-07-24

This is the durable source of truth for the flagship MCP Games launch. It records
what is operational now, what was verified, and the prioritized work required to
turn the current solid baseline into the complete super-server vision.

## Shipped baseline

- The MCP Games website is the default flagship surface and is privately
  deployed at <https://mcp-games-command-center.lovelogic-ai.chatgpt.site>.
- The Morning Decision is playable through tactile choices, number keys, and
  the NOVA command console.
- The flagship site can attach to the connector through
  `NEXT_PUBLIC_MCP_CONNECTOR_URL` and remains playable with its embedded agent
  core when the remote transport is absent.
- The default root development command starts the flagship and connector
  together.
- The MCP server auto-loads `games/morning-decision.yaml`; `start_game` no longer
  requires a manual `load_game`.
- MCP responses include game and scene IDs, variables, effects, injected
  context, and completion state.
- The server keeps MCP on stdio and exposes independent HTTP `/health` and
  `/ready` probes.
- The connector has validated health, readiness, connection, disconnection,
  query, context, CORS, payload-limit, and not-found contracts.
- The game graph validates as 24 reachable, terminating scenes with more than
  ten endings.
- Runtime effects, conditions, context permissions, fallback rendering,
  completion persistence, trace propagation, and health state match the shared
  game contract.
- Dockerfiles, Compose wiring, environment examples, health probes, graceful
  shutdown, and safe in-memory persistence defaults are present.

## Verification snapshot

- `pnpm build:flagship`: 7/7 tasks passed.
- MCP server unit tests: 34/34 passed.
- MCP game-engine focused tests: 11/11 passed.
- Story engine build and immutable playthrough test: passed.
- Connector HTTP integration tests: 3/3 passed.
- Flagship rendered-page test, build, and lint: passed.
- `docker-compose config --quiet`: passed.
- Live default-game load plus server `/health` and `/ready`: passed.
- Container execution was not verified locally because the Colima Docker daemon
  was not running.
- Root Git inspection remains unavailable because `.git` references a missing
  worktree administration path. No destructive repair was attempted.

## Backlog

### P0 — Implement the real connector-to-MCP transport bridge

The browser connector currently exposes correct HTTP contracts, but its
underlying MCP client still returns placeholder query data.

Acceptance criteria:

- The connector launches or connects to the stdio MCP server.
- MCP initialization and capability discovery complete before readiness.
- `load_game`, `start_game`, `make_choice`, and mesh planning are callable
  through the browser-safe API.
- Disconnect cleans up child transport and process resources.
- Tests cover a real game turn, timeout, disconnect, and upstream failure.

### P0 — Wire production calendar and weather context adapters

The authored game supports calendar and weather context, but production
adapters are incomplete.

Acceptance criteria:

- Registered calendar and weather adapters return useful real data.
- Game context permissions are enforced at the adapter boundary.
- Timeout, denial, and provider errors use authored fallbacks.
- Tests cover success and fallback without exposing raw placeholders.

### P0 — Provide a supported Node WebRTC runtime

Twenty of thirty WebRTC integration tests currently fail because
`RTCPeerConnection` is unavailable in Node.

Acceptance criteria:

- A maintained Node WebRTC implementation is selected and wired, or peer
  operations move to a documented browser boundary.
- All thirty WebRTC integration tests pass in CI.

### P0 — Unify the mixed Jest/Vitest integration harness

Some legacy integration suites import Vitest while running under Jest and one
suite reaches into a private peer connection.

Acceptance criteria:

- One documented package command runs unit, audio, and WebRTC suites.
- No suite imports a missing test framework or accesses private members.
- CI runs the full suite without compile-time harness failures.

### P1 — Make the Docker topology prove the actual transport

Compose syntax is valid, but the full container topology has not been exercised.

Acceptance criteria:

- CI builds both service images from monorepo contexts.
- `docker compose up` reaches healthy state.
- A smoke test performs MCP initialize, list-tools, and one real game turn.
- Health checks represent actual server and connector readiness.

### P1 — Choose and finish the persistence architecture

The server supports in-memory and Supabase REST state while Compose provisions
PostgreSQL.

Acceptance criteria:

- Either implement a PostgreSQL adapter using the existing migrations or remove
  PostgreSQL from the default topology.
- Sessions survive restart.
- Persistence integration tests cover start, choice, completion, and resume.

### P1 — Consolidate duplicate game models and engines

The story engine and MCP game engine still expose overlapping array- and
record-based models.

Acceptance criteria:

- One canonical contract package owns the game definition and runtime state.
- YAML, MCP server, connector, and web surface consume that contract.
- Legacy types are deprecated or removed.
- A migration test proves the flagship game remains playable.

### P1 — Add session listing, resume, and optimistic concurrency

Acceptance criteria:

- MCP exposes list, get, and resume session tools.
- Stale concurrent writes are rejected or versioned.
- Completed sessions are immutable.
- A restart persistence test passes against the selected durable adapter.

### P1 — Correct audio DSP metrics

Three of twenty-eight audio integration tests report zero voice percentage, AGC
gain, or processor frame statistics.

Acceptance criteria:

- Representative voiced and quiet frames produce meaningful non-zero metrics.
- All twenty-eight audio tests pass deterministically.

### P1 — Add a flagship CI integration gate

Acceptance criteria:

- CI runs `pnpm build:flagship`.
- Connector HTTP tests and flagship rendered-HTML tests pass.
- The Turbo graph includes the website, connector, and MCP server.
- Workspace or lockfile drift fails the gate.

### P1 — Sandbox `load_game` filesystem access

Acceptance criteria:

- Game paths are constrained to configured game roots.
- Traversal and symlink escapes are rejected.
- Security tests cover permitted paths and both escape techniques.

### P2 — Implement typed context transforms

Acceptance criteria:

- `summarize`, `verbatim`, `extract_names`, and `extract_dates` have stable,
  typed output.
- Calendar, weather, and notes fixtures are covered.
- Raw provider JSON is emitted only for explicitly verbatim content.

### P2 — Make Redis telemetry resilient offline

Acceptance criteria:

- Reconnect uses bounded exponential backoff.
- Offline mode is quiet and documented.
- Shutdown is deterministic while Redis is unavailable.
- Readiness behavior is explicitly defined.

### P2 — Repair root worktree metadata

Acceptance criteria:

- Root `.git` points to an existing worktree administration directory.
- `git status`, `git diff`, and branch discovery work.
- All current uncommitted work is preserved.

