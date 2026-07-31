---
task: 'Ship truthful realtime mesh control-plane MCP capability'
slug: 20260718-022453_realtime-mesh-control-plane
project: mcp-games-server
effort: E3
effort_source: auto
phase: complete
progress: 47/47
mode: loop
iteration: 1
started: 2026-07-18T02:24:53Z
updated: 2026-07-18T02:56:00Z
---

## Problem

The realtime mesh planner currently produces a static internal blueprint that cannot be called through the MCP server. It does not distinguish a viable topology from a degraded one, does not expose role-to-node assignments, and accepts preferred regions without using them, so its output can look healthy while omitting a required control-plane role.

## Vision

An operator or agent calls one MCP tool and receives an immediately actionable session plan: which node owns each role, whether the topology is ready, what is missing, which channels are authorized, and which nodes will take over on failure. The same behavior is visible in a one-command local protocol demo, making the capability legible without reading implementation code.

## Out of Scope

- No low-level WebRTC, WebTransport, or WebSocket connection establishment.
- No cloud deployment, provider signup, paid service, or external network dependency.
- No autonomous node mutation or telemetry-driven governance loop.
- No persistence layer for blueprints in this increment.

## Principles

- Readiness must be explicit; absence of a role is never represented as success.
- Routing decisions must be deterministic from the same request.
- Permissions stay attached to channels so transport choice cannot silently broaden authority.
- The protocol demo must exercise the real MCP boundary, not call planner internals directly.

## Constraints

- Preserve the package's NodeNext ESM and strict TypeScript configuration.
- Use the existing Model Context Protocol SDK and Zod dependency.
- Keep transport execution outside the planning/control layer.
- Keep all verification local and free-first.
- Preserve the existing game tools and stdio server entry point.

## Goal

Ship a deterministic realtime mesh planning control plane that validates requests, reports topology readiness and role assignments, honors preferred regions, exposes the plan through `plan_realtime_mesh`, and proves the result through unit tests plus a real MCP stdio protocol demo.

## Criteria

### Request contract

- [x] ISC-1: A blank `sessionId` is rejected by the request parser.
- [x] ISC-2: A blank `gameId` is rejected by the request parser.
- [x] ISC-3: An empty `playerIds` array is rejected by the request parser.
- [x] ISC-4: A `hostPlayerId` absent from `playerIds` is rejected by the request parser.
- [x] ISC-5: Duplicate node IDs are rejected by the request parser.
- [x] ISC-6: A node with zero roles is rejected by the request parser.

### Routing and readiness

- [x] ISC-7: The same request produces the same selected node IDs.
- [x] ISC-8: A preferred-region node outranks an otherwise equal non-preferred node.
- [x] ISC-9: Lower observed RTT improves a node's score within the same region priority.
- [x] ISC-10: Every required mesh role has an explicit assignment when coverage exists.
- [x] ISC-11: Duplicate multi-role winners appear once in `selectedNodes`.
- [x] ISC-12: A fully covered topology reports `status: ready`.
- [x] ISC-13: A partially covered topology reports `status: degraded`.
- [x] ISC-14: A degraded topology lists each uncovered required role.
- [x] ISC-15: Failover node IDs exclude every selected node ID.
- [x] ISC-16: Failover node IDs use deterministic score order.

### Channels and authority

- [x] ISC-17: Every blueprint contains `game-state`.
- [x] ISC-18: Every blueprint contains `voice`.
- [x] ISC-19: Every blueprint contains `agent-control`.
- [x] ISC-20: Disabling video omits the `video` channel.
- [x] ISC-21: Disabling terminal access omits the `terminal` channel.
- [x] ISC-22: Disabling skill plugins omits both bridge channels.
- [x] ISC-23: Channel permissions contain no scope outside that channel plan's declared list.
- [x] ISC-24: Blueprint creation emits a readiness-aware telemetry event.

### MCP boundary and proof

- [x] ISC-25: MCP tool discovery lists `plan_realtime_mesh`.
- [x] ISC-26: The tool schema requires the session identity fields.
- [x] ISC-27: A valid MCP tool call returns a JSON blueprint.
- [x] ISC-28: An invalid MCP tool call returns a protocol error result.
- [x] ISC-29: A package command runs the stdio protocol demo to exit code 0.
- [x] ISC-30: Package typecheck exits 0.
- [x] ISC-31: Package build exits 0.
- [x] ISC-32: Anti: the implementation opens no media transport or external network connection during planning or demo verification.

### Iteration 1 — runtime and failover hardening

- [x] ISC-33: Direct planner calls reject runtime-invalid requests even when TypeScript types are bypassed.
- [x] ISC-34: The request parser rejects more than 64 player IDs.
- [x] ISC-35: The request parser rejects more than 32 preferred regions.
- [x] ISC-36: The request parser rejects more than 256 available nodes.
- [x] ISC-37: The request parser rejects duplicate player IDs.
- [x] ISC-38: The request parser rejects duplicate preferred-region IDs.
- [x] ISC-39: Every assigned role has one explicit failover route.
- [x] ISC-40: Every failover candidate advertises the route's role.
- [x] ISC-41: Every failover route excludes its primary node.
- [x] ISC-42: Repeated plans produce identical failover routes.
- [x] ISC-43: A topology without an alternate for every required role reports each unprotected role explicitly.
- [x] ISC-44: The MCP protocol demo reports topology resilience separately from readiness.
- [x] ISC-45: MCP discovery advertises the 64-player request limit.
- [x] ISC-46: MCP discovery advertises the 32-region request limit.
- [x] ISC-47: MCP discovery advertises the 256-node request limit.

## Test Strategy

```yaml
- isc: ISC-1..ISC-6
  type: parser-unit
  check: invalid request fixtures are rejected
  threshold: 100% rejected
  tool: pnpm --filter @omnigents/mcp-games-server test:mesh

- isc: ISC-7..ISC-16
  type: planner-unit
  check: deterministic routing and topology readiness fixtures
  threshold: all assertions pass
  tool: pnpm --filter @omnigents/mcp-games-server test:mesh

- isc: ISC-17..ISC-24
  type: blueprint-unit
  check: channel gates, permission declarations, telemetry payload
  threshold: all assertions pass
  tool: pnpm --filter @omnigents/mcp-games-server test:mesh

- isc: ISC-25..ISC-29
  type: protocol-integration
  check: spawn server over stdio, discover tool, invoke tool, inspect result
  threshold: exit 0 and READY summary
  tool: pnpm --filter @omnigents/mcp-games-server demo:mesh

- isc: ISC-30
  type: static
  check: strict TypeScript compiler
  threshold: exit 0
  tool: pnpm --filter @omnigents/mcp-games-server typecheck

- isc: ISC-31
  type: build
  check: TypeScript emission
  threshold: exit 0
  tool: pnpm --filter @omnigents/mcp-games-server build

- isc: ISC-32
  type: anti-probe
  check: planner and demo source contain no outbound client or transport-construction path beyond MCP stdio
  threshold: zero media or network connection calls
  tool: rg "RTCPeerConnection|fetch\\(|new WebSocket" src/realtime-mesh src/mcp/mesh-demo.ts

- isc: ISC-33..ISC-38
  type: parser-unit
  check: direct-call and bounded-collection invalid fixtures are rejected
  threshold: 100% rejected
  tool: pnpm --filter @omnigents/mcp-games-server test:mesh

- isc: ISC-39..ISC-43
  type: resilience-unit
  check: role-aware failover routes are deterministic, valid, and expose gaps
  threshold: all assertions pass
  tool: pnpm --filter @omnigents/mcp-games-server test:mesh

- isc: ISC-44
  type: protocol-integration
  check: stdio demo prints distinct readiness and resilience evidence
  threshold: exit 0 and resilience summary
  tool: pnpm --filter @omnigents/mcp-games-server demo:mesh

- isc: ISC-45..ISC-47
  type: protocol-schema
  check: stdio discovery publishes each parser collection bound
  threshold: exact maxItems values 64, 32, and 256
  tool: pnpm --filter @omnigents/mcp-games-server demo:mesh
```

## Features

```yaml
- name: TruthfulPlanner
  description: Validated requests, preferred-region scoring, role assignments, readiness, deterministic failover
  satisfies:
    [
      ISC-1,
      ISC-2,
      ISC-3,
      ISC-4,
      ISC-5,
      ISC-6,
      ISC-7,
      ISC-8,
      ISC-9,
      ISC-10,
      ISC-11,
      ISC-12,
      ISC-13,
      ISC-14,
      ISC-15,
      ISC-16,
    ]
  depends_on: []
  parallelizable: false

- name: LeastAuthorityChannels
  description: Feature-gated channel plans with explicit scopes and readiness telemetry
  satisfies: [ISC-17, ISC-18, ISC-19, ISC-20, ISC-21, ISC-22, ISC-23, ISC-24]
  depends_on: [TruthfulPlanner]
  parallelizable: false

- name: McpProtocolSurface
  description: Discoverable MCP tool, validation error envelope, and stdio protocol demo
  satisfies: [ISC-25, ISC-26, ISC-27, ISC-28, ISC-29, ISC-32]
  depends_on: [TruthfulPlanner, LeastAuthorityChannels]
  parallelizable: false

- name: BuildProof
  description: Strict compiler and emitted build verification
  satisfies: [ISC-30, ISC-31]
  depends_on: [McpProtocolSurface]
  parallelizable: false

- name: RuntimeBoundaryHardening
  description: Planner-level runtime validation plus explicit collection bounds and identity uniqueness
  satisfies: [ISC-33, ISC-34, ISC-35, ISC-36, ISC-37, ISC-38]
  depends_on: [TruthfulPlanner]
  parallelizable: false

- name: RoleAwareFailover
  description: Per-role deterministic alternates and explicit unprotected-role reporting
  satisfies: [ISC-39, ISC-40, ISC-41, ISC-42, ISC-43, ISC-44, ISC-45, ISC-46, ISC-47]
  depends_on: [RuntimeBoundaryHardening]
  parallelizable: false
```

## Decisions

- 2026-07-18 02:24Z: The package-level ISA is scoped to the realtime mesh control-plane increment because this is a persistent package capability; low-level transport remains explicitly out of scope.
- 2026-07-18 02:24Z: Protocol-level verification is required because directly testing the planner would not prove MCP discoverability, serialization, or stdio lifecycle behavior.
- 2026-07-18 02:36Z: The verification command remains feature-scoped because the package contains pre-existing Vitest suites collected by Jest and an unrelated `uuid@13` ESM failure; those baseline harness defects are not hidden by this increment.
- 2026-07-18 02:52: refined: Loop iteration 1 extends the completed planner contract with runtime boundary limits and role-aware failover truthfulness while preserving the control-plane boundary and existing MCP response fields.
- 2026-07-18 02:52: Baseline assessment is 7.4/10: deterministic planning 9/10, channel authority 8.5/10, MCP proof 8.5/10, runtime input hardening 6/10, and failover truthfulness 4/10. The two lowest dimensions define this iteration.
- 2026-07-18 02:55: refined: Post-build assessment found the new parser bounds absent from MCP discovery, so ISC-45 through ISC-47 require the protocol schema to publish the exact limits before iteration 1 can close.
- 2026-07-18 02:56: Iteration 1 assessment is 9.0/10: deterministic planning 9/10, channel authority 8.5/10, MCP proof 9.5/10, runtime input hardening 9/10, and failover truthfulness 9/10. The next candidate loop is scoring calibration and schema-drift elimination.

## Changelog

- 2026-07-18 | conjectured: The package-wide Jest command could serve as the final feature proof
  refuted by: Jest collected two pre-existing Vitest integration suites and the old game-engine suite failed on `uuid@13` ESM before running assertions
  learned: A truthful proof must isolate the new feature suite until the package's mixed-framework harness is unified, while separately preserving the baseline failure evidence
  criterion now: ISC-1 through ISC-24 use the explicit `test:mesh` command; protocol and compiler criteria remain separate probes
- 2026-07-18 | conjectured: A deterministic flat failover-node list was sufficient operational recovery evidence
  refuted by: A READY topology could list alternates that did not cover every primary role and could not identify unprotected roles
  learned: Readiness and survivability are independent; failover must be role-aware, explicit, and separately reported
  criterion now: ISC-39 through ISC-44 require deterministic per-role routes, valid candidates, explicit gaps, and protocol-visible resilience

## Verification

- ISC-1: parser unit — `test:mesh` passed the blank-session fixture.
- ISC-2: parser unit — `test:mesh` passed the blank-game fixture.
- ISC-3: parser unit — `test:mesh` passed the empty-player-list fixture.
- ISC-4: parser unit — `test:mesh` passed the missing-host fixture.
- ISC-5: parser unit — `test:mesh` passed the duplicate-node fixture.
- ISC-6: parser unit — `test:mesh` passed the zero-role-node fixture.
- ISC-7: planner unit — deterministic selection assertion passed.
- ISC-8: planner unit — preferred-region routing assertion passed.
- ISC-9: planner unit — lower-RTT preferred node won the fixture.
- ISC-10: planner unit — READY blueprint returned five role assignments.
- ISC-11: planner unit — multi-role winners were unique in `selectedNodes`.
- ISC-12: planner unit — complete topology returned `status: ready`.
- ISC-13: planner unit — incomplete topology returned `status: degraded`.
- ISC-14: planner unit — degraded fixture returned `relay, media, agent, state`.
- ISC-15: planner unit — failover exclusion assertion passed.
- ISC-16: planner unit — repeated failover ordering assertion passed.
- ISC-17: channel unit — base blueprint contained `game-state`.
- ISC-18: channel unit — base blueprint contained `voice`.
- ISC-19: channel unit — base blueprint contained `agent-control`.
- ISC-20: channel unit — disabled-video fixture omitted `video`.
- ISC-21: channel unit — disabled-terminal fixture omitted `terminal`.
- ISC-22: channel unit — disabled-plugin fixture omitted both bridge channels.
- ISC-23: authority unit — exact permission map assertion passed for all base channels.
- ISC-24: telemetry unit — spy observed `topologyStatus: ready` and `missingRoles: []`.
- ISC-25: MCP stdio — demo reported `discovery 5 tools; plan_realtime_mesh READY`.
- ISC-26: MCP stdio — demo reported `schema 4 identity fields required`.
- ISC-27: MCP stdio — demo parsed a JSON blueprint with `READY (5/5 roles)`.
- ISC-28: MCP stdio — demo reported `invalid request rejected as MCP error result`.
- ISC-29: command — `pnpm --filter @omnigents/mcp-games-server demo:mesh` exited 0 with `PROOF COMPLETE`.
- ISC-30: static — package `tsc --noEmit` exited 0.
- ISC-31: build — package `tsc` exited 0.
- ISC-32: anti-probe — source scan returned `ANTI_NETWORK_PROBE=PASS`.
- ISC-33: planner unit — direct call with a blank session ID threw a runtime validation error.
- ISC-34: parser unit — 65-player fixture was rejected.
- ISC-35: parser unit — 33-region fixture was rejected.
- ISC-36: parser unit — 257-node fixture was rejected.
- ISC-37: parser unit — duplicate-player fixture was rejected.
- ISC-38: parser unit — duplicate-region fixture was rejected.
- ISC-39: resilience unit — every required role produced an explicit failover route.
- ISC-40: resilience unit — every routed candidate advertised the route's role.
- ISC-41: resilience unit — every route excluded its primary node ID.
- ISC-42: resilience unit — repeated plans returned equal failover-route arrays.
- ISC-43: resilience unit — single-node READY fixture reported all five roles as unprotected and resilience `at-risk`.
- ISC-44: MCP stdio — demo reported `resilience RESILIENT (0 unprotected roles)` separately from topology readiness.
- ISC-45: MCP stdio — discovery proof reported the 64-player limit.
- ISC-46: MCP stdio — discovery proof reported the 32-region limit.
- ISC-47: MCP stdio — discovery proof reported the 256-node limit.
