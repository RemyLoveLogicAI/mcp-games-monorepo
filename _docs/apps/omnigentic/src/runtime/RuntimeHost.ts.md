<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "apps/omnigentic/src/runtime/RuntimeHost.ts",
  "source_hash": "d4e6940b6cb8531e2b6eff06f5b9515b92ab496749897946e0b31a3f365d2eec",
  "last_updated": "2026-02-19T18:52:44.461935+00:00",
  "tokens_used": 12842,
  "complexity_score": 6,
  "estimated_review_time_minutes": 25,
  "external_dependencies": []
}
```

</details>

[Documentation Home](../../../../README.md) > [apps](../../../README.md) > [omnigentic](../../README.md) > [src](../README.md) > [runtime](./README.md) > **RuntimeHost**

---

# RuntimeHost.ts

> **File:** `apps/omnigentic/src/runtime/RuntimeHost.ts`

![Complexity: Medium](https://img.shields.io/badge/Complexity-Medium-yellow) ![Review Time: 25min](https://img.shields.io/badge/Review_Time-25min-blue)

## 📑 Table of Contents


- [Overview](#overview)
- [Dependencies](#dependencies)
- [Architecture Notes](#architecture-notes)
- [Usage Examples](#usage-examples)
- [Maintenance Notes](#maintenance-notes)
- [Functions and Classes](#functions-and-classes)

---

## Overview

This file defines a single primary runtime manager (RuntimeHost) responsible for registering EnvironmentHost instances, registering agent template factories, spawning and despawning agents, broadcasting control signals, executing heartbeat ticks across active agents, orchestrating swarms, and persisting execution-related memory fragments via a MemoryIO implementation. RuntimeHost maintains in-memory state using Maps for agents, environments, and templates; records runtime events into a capped in-memory event buffer; and exposes snapshot APIs so callers can inspect agents, swarms, environments, and recent runtime events.

RuntimeHost integrates closely with three internal contracts: AgentContract (AgentLifecycle, Action, RuntimeContext, RuntimeSignal), EnvironmentContract (EnvironmentHost, ActionResult) and MemoryContract (MemoryIO, MemoryFragment). Key runtime workflows are: start/stop (starts a heartbeat timer if autoTick is enabled), spawnAgent / spawnAgentFromTemplate (invokes agent.onMount, env.admitAgent, and records a ManagedAgent), tick (concurrently runs managed.lifecycle.tick(perception) for targeted agents, dispatches produced actions via env.dispatchAction, persists action outcomes through MemoryIO.write, and updates per-agent metrics and state), and orchestrateSwarm (calls tick repeatedly for a swarm). The implementation emphasizes async/await for non-blocking operations, configurable concurrency via maxParallelTicks, and fault tolerant handling through safe wrappers (safeSignal, safeUnmount, safeExpel) and recorded runtime events.

## Dependencies

### Internal Dependencies

| Module | Usage |
| --- | --- |
| [./AgentContract.js](.././AgentContract.js.md) | Imports types used throughout RuntimeHost: Action, AgentLifecycle, RuntimeContext, RuntimeSignal. These types are referenced in signatures (e.g., spawnAgent(agentId: string, envId: string, agentImpl: AgentLifecycle, ...)), in tick logic (managed.lifecycle.tick(perception) returns Action), and for signaling (agent.onSignal(signal)). |
| [./EnvironmentContract.js](.././EnvironmentContract.js.md) | Imports ActionResult and EnvironmentHost. EnvironmentHost methods are invoked by RuntimeHost: env.admitAgent(agentId,...), env.getPerception(managed.agentId), env.dispatchAction(managed.agentId, action), and env.expelAgent(agentId, reason). ActionResult is used to inspect dispatch outcome (success, feedback, error) when persisting memory and updating agent state. |
| [./MemoryContract.js](.././MemoryContract.js.md) | Imports MemoryFragment and MemoryIO. RuntimeHost uses MemoryIO.write(fragment) in persistExecutionMemory(...) to persist a JSON-serialized fragment that includes environmentId, actionType, confidence, and dispatch outcome; MemoryFragment shape is constructed inline with tags, created timestamp, importance, and type. |

## 📁 Directory

This file is part of the **runtime** directory. View the [directory index](_docs/apps/omnigentic/src/runtime/README.md) to see all files in this module.

## Architecture Notes

- Primary class RuntimeHost implements a centralized runtime manager pattern: it stores agents, environments, and templates as Maps and exposes lifecycle and orchestration operations. State is purely in-memory (Maps and arrays) and persisted execution traces are delegated to a provided MemoryIO implementation.
- Concurrency model: tick() uses runWithConcurrency(items, maxParallel, worker) to run multiple agent ticks in parallel. That helper creates N async runners that iterate a shared cursor over items; Node.js event loop and Promise.all coordinate completion. maxParallelTicks is configurable and bounded by the number of targets.
- Error handling: the runtime favors isolation and observability. Agent-facing operations use safe wrappers (safeSignal, safeUnmount, safeExpel) to catch and record exceptions without throwing. executeAgentTick has localized try/catch to increment per-agent errorCount, set lastError, and call autoPauseOnRepeatedFailure. recordEvent stores timestamped runtime events with a ring-buffer behavior limited by maxRuntimeEvents.
- Integration points / dataflow: spawnAgent calls agent.onMount() then env.admitAgent(); tick performs env.getPerception -> agent.tick(perception) -> env.dispatchAction(agentId, action) -> persistExecutionMemory(fragment) via MemoryIO. Memory fragments include tags (runtime, action, env:<id>, success/failure) and a JSON content payload.
- Design trade-offs: RuntimeHost uses setInterval for heartbeats when autoTick is enabled; this is simple but can lead to overlapping ticks if ticks are long unless tickInProgress prevents reentry. Agents are auto-paused after configurable repeated failures (maxAgentErrorsBeforePause).

## Usage Examples

### Start the runtime and let it run heartbeats

Create RuntimeHost with a MemoryIO instance and desired options (e.g., { autoTick: true, tickIntervalMs: 1000 }). Call runtime.start() to set running=true and start a setInterval that invokes tick() every tickIntervalMs. If autoTick is enabled, tick() will run periodically; tick checks tickInProgress and returns a skipped summary if a prior tick is still running. On shutdown, call runtime.stop() to clear the interval and despawn all agents.

### Spawn an agent from a registered template into an environment

1) Register an EnvironmentHost implementation using registerEnvironment(env). 2) Register a template factory via registerAgentTemplate(templateType, factory). 3) Call spawnAgentFromTemplate({ templateType, agentId, environmentId, ... }). That invokes the factory to create an AgentLifecycle, calls agent.onMount(context), then env.admitAgent(agentId, environmentConfig). On success a ManagedAgent is created and stored with initial counters. If admitAgent fails or throws, the runtime signals TERMINATE and unmounts the agent using safe wrappers and throws an error to the caller.

### Run a focused orchestration over a swarm

Call orchestrateSwarm({ swarmId, iterations, stopOnFailure, delayBetweenRoundsMs }). The method collects member agentIds for the swarm, then runs tick(memberIds) for the requested number of iterations. Each tick returns a TickSummary with outcomes per agent. If stopOnFailure is true and a round reports any failedAgents, orchestration halts. The method aggregates totals and returns an OrchestrateSwarmResult with per-round summaries.

### Broadcast signals to agents or a swarm

Call broadcastSignal(signal, filter) where filter can include swarmId or environmentId. The runtime filters managed agents accordingly and calls signalAgent(agentId, signal) for each target. signalAgent handles TERMINATE by calling despawnAgent, and other signals by calling agent.onSignal(signal) and updating agent.state for PAUSE/RESUME. The broadcast returns counts of targeted, succeeded and failed signals and records a runtime event.

## Maintenance Notes

- Performance considerations: runWithConcurrency uses a shared numeric cursor across async runners. In heavy-load scenarios, long-running agent.tick implementations can stall progress. Tune maxParallelTicks based on expected agent.tick latency and Node.js available resources.
- Heartbeat reentrancy: tickInProgress prevents concurrent ticks but setInterval can still trigger frequent skipped ticks if tick duration exceeds tickIntervalMs. Consider adaptive scheduling or clearing/restarting the interval to avoid busy skipped ticks.
- Event buffer and memory: runtimeEvents is an in-memory array trimmed to maxRuntimeEvents; if the runtime runs long-lived with many events, developers should monitor memory usage or persist events externally. MemoryFragment content is JSON-serialized; ensure MemoryIO.write implementations accept the specified fragment shape.
- Error handling edge cases: When env.admitAgent or env.dispatchAction throws, spawnAgent and executeAgentTick wrap these calls and either propagate errors (spawn) or record and update agent state (tick). Tests should cover env failures, MemoryIO.write failures (persistExecutionMemory logs and records an event but does not throw), and safe* wrapper behavior.
- Testing recommendations: unit tests should mock EnvironmentHost and MemoryIO to verify branching: successful actions, dispatch failures, thrown exceptions, auto-pause threshold behavior, swarm orchestration halting, and proper event recording. Also test spawnSwarmFromTemplate with continueOnError true/false and duplicate agentId handling.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/apps/omnigentic/src/runtime/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
