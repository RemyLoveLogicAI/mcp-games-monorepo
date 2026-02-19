<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "apps/omnigentic/src/runtime/RuntimeHost.test.ts",
  "source_hash": "edcb65ce6a24116b6553bd1eddafa170beddc6cda8cbbd7fe2e27335192149f3",
  "last_updated": "2026-02-19T18:54:32.888189+00:00",
  "tokens_used": 21107,
  "complexity_score": 3,
  "estimated_review_time_minutes": 15,
  "external_dependencies": []
}
```

</details>

[Documentation Home](../../../../README.md) > [apps](../../../README.md) > [omnigentic](../../README.md) > [src](../README.md) > [runtime](./README.md) > **RuntimeHost.test**

---

# RuntimeHost.test.ts

> **File:** `apps/omnigentic/src/runtime/RuntimeHost.test.ts`

![Complexity: Low](https://img.shields.io/badge/Complexity-Low-green) ![Review Time: 15min](https://img.shields.io/badge/Review_Time-15min-blue)

## 📑 Table of Contents


- [Overview](#overview)
- [Dependencies](#dependencies)
- [Architecture Notes](#architecture-notes)
- [Usage Examples](#usage-examples)
- [Maintenance Notes](#maintenance-notes)
- [Functions and Classes](#functions-and-classes)

---

## Overview

This test module uses Node's built-in test runner (node:test) and assert (node:assert/strict) to validate RuntimeHost behavior. It defines three lightweight test doubles in-file: InMemoryMemory (implements MemoryIO) to simulate persistent memory fragments, TestEnvironment (implements EnvironmentHost) to simulate an environment that admits agents, returns Perception objects, and records dispatched actions, and WorkerAgent (implements AgentLifecycle) which emits a deterministic Action on each tick. The tests register these doubles with a RuntimeHost instance (imported from './RuntimeHost.js') and assert behaviors around swarm spawning, orchestration, agent control signals (PAUSE / RESUME / TERMINATE), and integration with the MCPBridge tool adapter (imported from '../mcp/MCPBridge.js').

The file contains three explicit test cases (declared via test(...)), each exercising a distinct area: 1) 'RuntimeHost can spawn and orchestrate a mass swarm' verifies spawning a swarm from a template, orchestrating multiple iterations, and validating totals (spawned/failed, acted agents, environment dispatch count, and runtime snapshot totals); 2) 'RuntimeHost pause/resume/terminate signals control agent execution' validates signaling an individual agent (PAUSE, RESUME, TERMINATE) and observing tick behavior and environment dispatches; 3) 'MCPBridge orchestrates swarm operations through tool calls' verifies the MCPBridge.handleToolCall integration for spawn_swarm, orchestrate_swarm, inspect_runtime and validates expected payloads and error conditions. Tests consistently call runtime.stop() to ensure resources are cleaned up at the end of each test. The test code uses async/await throughout and exercises the RuntimeHost public API surface such as registerEnvironment, registerAgentTemplate, spawnSwarmFromTemplate, spawnAgentFromTemplate, orchestrateSwarm, tick, signalAgent, getAgent, getSwarmMembers, and getRuntimeSnapshot.

## Dependencies

### Internal Dependencies

| Module | Usage |
| --- | --- |
| [node:assert/strict](../node:assert/strict.md) | Provides the assert API used in tests. The file calls assert.equal(...) to check expected values and assert.rejects(...) to validate error conditions when invoking MCPBridge.handleToolCall with invalid payloads. Marked as language standard library (is_external=false). |
| `node:test` | Provides the test(...) function used to define test cases. The file uses test(...) to register three async test functions that execute runtime scenarios. Marked as language standard library (is_external=false). |
| [../mcp/MCPBridge.js](../../mcp/MCPBridge.js.md) | Imports the MCPBridge class. The tests instantiate new MCPBridge(runtime) and call bridge.handleToolCall(...) with tool names 'spawn_swarm', 'orchestrate_swarm', 'inspect_runtime' and also exercise failure behavior when required fields are missing. This is an internal project module (is_external=false). |
| [./AgentContract.js](.././AgentContract.js.md) | Imports types used by in-file agent and test doubles: Action, AgentLifecycle, Perception, RuntimeContext, RuntimeSignal. These types are referenced in class signatures and method parameters/returns for WorkerAgent and TestEnvironment definitions (e.g., WorkerAgent implements AgentLifecycle and defines onMount(ctx: RuntimeContext), tick(perception: Perception), onSignal(signal: RuntimeSignal)). Marked as internal (is_external=false). |
| [./EnvironmentContract.js](.././EnvironmentContract.js.md) | Imports ActionResult, EnvironmentCapabilities, EnvironmentHost used by TestEnvironment. The TestEnvironment class declares capabilities: EnvironmentCapabilities and implements EnvironmentHost methods getPerception, admitAgent, expelAgent, dispatchAction that return ActionResult and Perception shapes. Marked as internal (is_external=false). |
| [./MemoryContract.js](.././MemoryContract.js.md) | Imports MemoryFragment, MemoryIO, MemoryQuery used by InMemoryMemory. The class implements MemoryIO methods write(fragment: MemoryFragment): Promise<string>, search(query: MemoryQuery): Promise<MemoryFragment[]>, read(id: string): Promise<MemoryFragment|null>, update(id: string, update: Partial<MemoryFragment>): Promise<void>, forget(id: string): Promise<void>. Marked as internal (is_external=false). |
| [./RuntimeHost.js](.././RuntimeHost.js.md) | Imports the RuntimeHost class which is the primary system under test. Tests construct new RuntimeHost(memory, options) and call its methods such as registerEnvironment(env), registerAgentTemplate(...), spawnSwarmFromTemplate(...), getSwarmMembers(...), orchestrateSwarm(...), spawnAgentFromTemplate(...), signalAgent(...), tick(...), getAgent(...), getRuntimeSnapshot(...), and stop(). Marked as internal (is_external=false). |

## 📁 Directory

This file is part of the **runtime** directory. View the [directory index](_docs/apps/omnigentic/src/runtime/README.md) to see all files in this module.

## Architecture Notes

- Test doubles are defined inline (InMemoryMemory, TestEnvironment, WorkerAgent) to isolate RuntimeHost behavior without external dependencies. InMemoryMemory implements synchronous in-memory Map-based storage with async method signatures matching MemoryIO; it supports write, search (with simple tag and text filtering), read, update, and forget.
- Tests use async/await and Node's native test harness (node:test), so the file is non-blocking and exercises asynchronous runtime flows. RuntimeHost is treated as an orchestrator: the tests register environments and agent templates, spawn agents or swarms, then call orchestrateSwarm or tick to drive agent actions and inspect results via runtime.getRuntimeSnapshot() and the TestEnvironment.dispatches array.
- MCPBridge is tested as an adapter that translates 'tool calls' into RuntimeHost operations. The tests assert that handleToolCall returns content fields containing JSON strings which are parsed and inspected. One test also asserts that missing required fields cause the bridge to reject with an error (assert.rejects).

## Usage Examples

### Mass swarm spawning and orchestration

Create an InMemoryMemory instance and a RuntimeHost instance: runtime = new RuntimeHost(memory, { autoTick: false, maxParallelTicks: 12 }). Register a TestEnvironment (env) with runtime.registerEnvironment(env) and register an agent template with runtime.registerAgentTemplate('worker', (ctx) => new WorkerAgent(...)). Call runtime.spawnSwarmFromTemplate({ templateType: 'worker', swarmId: 'swarm-alpha', environmentId: 'sim', size: 20, agentIdPrefix: 'alpha' }) and assert spawnResult.spawned equals 20. Then call runtime.orchestrateSwarm({ swarmId: 'swarm-alpha', iterations: 3 }) and validate orchestration.completedIterations, orchestration.totals.actedAgents, and that env.dispatches length matches expected acted agent count. Finally call runtime.stop() to terminate the runtime.

### Agent control signals (pause/resume/terminate)

Register a single agent via runtime.spawnAgentFromTemplate({ templateType: 'worker', agentId: 'solo-1', environmentId: 'control' }). Signal the agent to 'PAUSE' using runtime.signalAgent('solo-1', 'PAUSE') and then invoke runtime.tick(['solo-1']) to drive a tick; expect pausedTick.skippedAgents to be 1 and no environment dispatches. Resume with runtime.signalAgent('solo-1', 'RESUME') and call runtime.tick(['solo-1']) again to observe an acted agent and one environment dispatch. Terminate with runtime.signalAgent('solo-1', 'TERMINATE') and verify runtime.getAgent('solo-1') returns null.

### Using MCPBridge to exercise runtime via tool calls

Construct bridge = new MCPBridge(runtime). Call bridge.handleToolCall('spawn_swarm', payload) where payload includes type (agent template type), swarmId, environmentId, size; the returned tool response contains JSON text in content[0].text which can be parsed to validate spawned/failed counts. Similarly call bridge.handleToolCall('orchestrate_swarm', { swarmId, iterations }) and parse returned JSON to validate completedIterations and totals. Call bridge.handleToolCall('inspect_runtime', {}) to get a snapshot that includes totals.agents and totals.swarms. Finally, verify invalid tool calls (e.g., missing required fields) cause handleToolCall to reject (assert.rejects).

## Maintenance Notes

- InMemoryMemory is ephemeral and not suitable for persistence tests; it uses a simple Map and incremental mem- IDs. Search implements case-insensitive substring search and tag matching; it does not implement scoring or full-text features. Tests that rely on persistence across process restarts will fail with this in-memory implementation.
- Concurrency/parallelism in tests: runtime is created with autoTick disabled to control tick invocation deterministically. When testing real parallel ticks, be aware of RuntimeHost's maxParallelTicks option (the mass swarm test sets it to 12). If RuntimeHost uses worker threads or concurrency, additional synchronization might be needed in more aggressive tests.
- Timing: TestEnvironment.getPerception uses Date.now() and tests do not assert timestamp values, but any assertions added against time should account for non-determinism. Similarly, WorkerAgent.tick returns deterministic actions but relies on onMount having been called; ensure lifecycle order (onMount before tick) is respected when writing new tests.
- MCPBridge tests parse JSON from content[0].text. If MCPBridge changes its response format, these tests will break; consider adding a small helper to validate tool response schemas or use JSON schema validation. Also validate error messages exactly when asserting rejects (/Field 'type'/ in current test).

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/apps/omnigentic/src/runtime/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
