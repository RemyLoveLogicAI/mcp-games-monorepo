# MCP Games Readiness Ledger

Last updated: 2026-07-30

This is the durable source of truth for the flagship MCP Games launch. It records
what is operational now, what was verified, and the prioritized work required to
turn the current solid baseline into the complete super-server vision.

## Shipped baseline

- The MCP Games website is the default flagship surface and is privately
  deployed at <https://mcp-games-command-center.lovelogic-ai.chatgpt.site>.
- The flagship is a time-aware execution surface with one visual/keyboard
  command bar, explicit verified/unavailable signals, and no fictional
  biofeedback or XP.
- A focus action creates a real `.ics` artifact. Successful device and MCP
  actions create source-labelled receipts, and repeated successful actions can
  become device-local shortcuts.
- The site attaches through `NEXT_PUBLIC_MCP_CONNECTOR_URL`; server actions stay
  unavailable when the transport is absent rather than falling back to
  simulated results.
- The default root development command builds the MCP Games server, then starts
  the flagship and connector together.
- The connector uses the official MCP client over stdio, discovers tools, and
  exposes health, load, start, choice, and realtime-mesh APIs.
- Connector responses carry a structured response-only receipt with tool,
  status, timestamps, duration, and summarized payload/result.
- The MCP server auto-loads `games/morning-decision.yaml`; `start_game` no longer
  requires a manual `load_game`.
- MCP responses include game and scene IDs, variables, effects, injected
  context, and completion state.
- The server keeps MCP on stdio and exposes independent HTTP `/health` and
  `/ready` probes.
- The connector has validated health, capability discovery, connection,
  disconnection, load, real start/choice turn, mesh planning, timeout, upstream
  failure, query, context, CORS, payload-limit, and not-found contracts.
- The game graph validates as 24 reachable, terminating scenes with more than
  ten endings.
- Runtime effects, conditions, context permissions, fallback rendering,
  completion persistence, trace propagation, and health state match the shared
  game contract.
- Dockerfiles, Compose wiring, environment examples, health probes, graceful
  shutdown, and safe in-memory persistence defaults are present.
- The execution-ledger workspace now builds with canonical proposal and
  receipt-event hashing, a PostgreSQL migration, a public package entry point,
  and deterministic unit coverage.
- Sites packaging is single-flight across vinext's concurrent Vite
  environments, so repeated and uncached builds no longer race on
  `dist/.openai/drizzle`.
- A maintained Node WebRTC implementation (`@roamhq/wrtc`) is wired via a clean `runtime.ts` factory wrapper to support native W3C peer connection constructors under Node.js.
- Audio DSP analysis gates are corrected: voice activity detection uses an 8-band DFT frequency estimation instead of time-sliced segments, AGC uses peak amplitude measurement with a 50% noise gate tolerance, and smoothing coefficients are clamped.

## Verification snapshot

- `pnpm build:flagship`: 7/7 tasks passed.
- Root `pnpm typecheck`: 13/13 tasks passed.
- Root `pnpm test`: 21/21 tasks passed.
- Root `pnpm lint`: 5/5 tasks passed.
- Execution-ledger unit tests: 4/4 passed.
- MCP server unit tests: 34/34 passed.
- MCP game-engine focused tests: 11/11 passed.
- Story engine build and immutable playthrough test: passed.
- Connector HTTP and stdio integration tests: 11/11 passed.
- Flagship rendered-page test, build, and lint: passed.
- Forced uncached flagship build and rendered-page test: passed.
- `docker-compose config --quiet`: passed.
- Live default-game load plus server `/health` and `/ready`: passed.
- WebRTC integration tests: 30/30 passed.
- Audio processing integration tests: 28/28 passed.
- Container execution was not verified locally because the Colima Docker daemon
  was not running.
- Root Git history was safely restored from the authoritative
  `RemyLoveLogicAI/mcp-games-monorepo` origin. The work now lives on
  `codex/mcp-games-flagship-readiness`, and the stale pointer remains available
  as a local recovery artifact.

## Backlog

### P0 — Initialize and enforce TestChimp collaboration

The official TestChimp skill is installed and its preflight passes, but this
repository does not yet contain `.testchimp-tests`, `.testchimp-plans`, project
MCP configuration, or `plans/knowledge/ai-test-instructions.md`. TestChimp
correctly refuses to launch Playwright without those files and a verified
runner API key.

Acceptance criteria:

- `/testchimp init` completes and the generated project files are reviewed.
- The API key remains in the approved MCP/runner environment and is never
  committed.
- `/testchimp test` produces an approved branch plan before browser execution.
- The flagship start, choice, receipt, offline, and focus-artifact journeys run
  as linked SmartTests with real scenario IDs.
- CI runs the mapped TestChimp suite from the SmartTests root.

### P0 — Deploy and bind the production execution plane

The Sites frontend is deployed, but there is no authenticated production
connector endpoint. The public surface therefore reports the Games transport as
unavailable.

Acceptance criteria:

- A TLS connector endpoint is deployed and bound into the site build.
- CORS allows only the flagship origin and requests carry authenticated actor
  identity.
- Liveness and execution readiness are distinct.
- A production canary completes one real start/choice turn.
- Rollback is documented and exercised.

### P0 — Wire production calendar and weather context adapters

The authored game supports calendar and weather context, but production
adapters are incomplete.

Acceptance criteria:

- Registered calendar and weather adapters return useful real data.
- Game context permissions are enforced at the adapter boundary.
- Timeout, denial, and provider errors use authored fallbacks.
- Tests cover success and fallback without exposing raw placeholders.

### P1 — Add approved real-world actions to game choices

Current choices execute real MCP state transitions, but the game schema does
not yet invoke calendar, notification, container, or task tools.

Acceptance criteria:

- Choice actions use typed, allowlisted descriptors.
- Preview and approval policy are explicit and idempotent.
- Receipts distinguish internal state mutation from external side effects.
- Failure and rollback states are visible.
- At least one flagship choice completes a useful external action.

### P1 — Build the durable receipt and optimization flywheel

The site’s current receipt history and repeated-action shortcut are
device-local convenience features, not a tamper-evident automation engine.

Acceptance criteria:

- Receipts are append-only and tamper-evident.
- Pattern recommendations cite the executions that support them.
- Users can promote, scope, revoke, and audit automation rights.
- Autonomous execution has approval, rollback, and permission-boundary tests.

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
