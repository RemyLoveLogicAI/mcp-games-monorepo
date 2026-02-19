import assert from 'node:assert/strict';
import test from 'node:test';
import { MCPBridge } from '../mcp/MCPBridge.js';
import { Action, AgentLifecycle, Perception, RuntimeContext, RuntimeSignal } from './AgentContract.js';
import { ActionResult, EnvironmentCapabilities, EnvironmentHost } from './EnvironmentContract.js';
import { MemoryFragment, MemoryIO, MemoryQuery } from './MemoryContract.js';
import { RuntimeHost } from './RuntimeHost.js';

class InMemoryMemory implements MemoryIO {
    private seq = 0;
    private readonly data: Map<string, MemoryFragment> = new Map();

    async write(fragment: MemoryFragment): Promise<string> {
        const id = fragment.id ?? `mem-${++this.seq}`;
        this.data.set(id, { ...fragment, id });
        return id;
    }

    async search(query: MemoryQuery): Promise<MemoryFragment[]> {
        const limit = query.limit ?? 25;
        const fragments = Array.from(this.data.values()).filter((item) => {
            if (query.tags && query.tags.length > 0) {
                const allTagsPresent = query.tags.every((tag) => item.tags.includes(tag));
                if (!allTagsPresent) {
                    return false;
                }
            }
            if (query.text) {
                return item.content.toLowerCase().includes(query.text.toLowerCase());
            }
            return true;
        });
        return fragments.slice(0, limit);
    }

    async read(id: string): Promise<MemoryFragment | null> {
        return this.data.get(id) ?? null;
    }

    async update(id: string, update: Partial<MemoryFragment>): Promise<void> {
        const current = this.data.get(id);
        if (!current) {
            return;
        }
        this.data.set(id, { ...current, ...update, id });
    }

    async forget(id: string): Promise<void> {
        this.data.delete(id);
    }
}

class TestEnvironment implements EnvironmentHost {
    readonly capabilities: EnvironmentCapabilities = {
        supportsVoice: false,
        supportsVisuals: false,
        timeDilation: 1,
        physicsEngine: false,
    };

    readonly dispatches: Array<{ agentId: string; action: Action }> = [];
    private readonly admitted: Set<string> = new Set();

    constructor(readonly id: string) { }

    async admitAgent(agentId: string): Promise<boolean> {
        this.admitted.add(agentId);
        return true;
    }

    async expelAgent(agentId: string): Promise<void> {
        this.admitted.delete(agentId);
    }

    async getPerception(agentId: string): Promise<Perception> {
        if (!this.admitted.has(agentId)) {
            throw new Error(`Agent '${agentId}' is not admitted`);
        }
        return {
            timestamp: Date.now(),
            environmentState: { zone: this.id, agentId },
            messages: [],
            events: [],
        };
    }

    async dispatchAction(agentId: string, action: Action): Promise<ActionResult> {
        this.dispatches.push({ agentId, action });
        return {
            success: true,
            feedback: `applied:${action.type}`,
            newState: { actionType: action.type },
        };
    }
}

class WorkerAgent implements AgentLifecycle {
    private mounted = false;

    constructor(private readonly actionType: string) { }

    async onMount(_context: RuntimeContext): Promise<void> {
        this.mounted = true;
    }

    async tick(_perception: Perception): Promise<Action | null> {
        if (!this.mounted) {
            throw new Error('Agent not mounted');
        }

        return {
            type: this.actionType,
            payload: { task: this.actionType },
            confidence: 0.98,
        };
    }

    async onUnmount(): Promise<void> {
        this.mounted = false;
    }

    async onSignal(_signal: RuntimeSignal): Promise<void> {
        return;
    }
}

test('RuntimeHost can spawn and orchestrate a mass swarm', async () => {
    const memory = new InMemoryMemory();
    const runtime = new RuntimeHost(memory, { autoTick: false, maxParallelTicks: 12 });
    const env = new TestEnvironment('sim');

    runtime.registerEnvironment(env);
    runtime.registerAgentTemplate('worker', (ctx) => new WorkerAgent(`work:${ctx.index + 1}`));

    const spawnResult = await runtime.spawnSwarmFromTemplate({
        templateType: 'worker',
        swarmId: 'swarm-alpha',
        environmentId: 'sim',
        size: 20,
        agentIdPrefix: 'alpha',
    });

    assert.equal(spawnResult.spawned, 20);
    assert.equal(spawnResult.failed, 0);
    assert.equal(runtime.getSwarmMembers('swarm-alpha').length, 20);

    const orchestration = await runtime.orchestrateSwarm({
        swarmId: 'swarm-alpha',
        iterations: 3,
    });

    assert.equal(orchestration.completedIterations, 3);
    assert.equal(orchestration.halted, false);
    assert.equal(orchestration.totals.actedAgents, 60);
    assert.equal(env.dispatches.length, 60);
    assert.equal(runtime.getRuntimeSnapshot().totals.swarms, 1);

    await runtime.stop();
});

test('RuntimeHost pause/resume/terminate signals control agent execution', async () => {
    const memory = new InMemoryMemory();
    const runtime = new RuntimeHost(memory, { autoTick: false });
    const env = new TestEnvironment('control');

    runtime.registerEnvironment(env);
    runtime.registerAgentTemplate('worker', () => new WorkerAgent('solo-work'));
    await runtime.spawnAgentFromTemplate({
        templateType: 'worker',
        agentId: 'solo-1',
        environmentId: 'control',
    });

    await runtime.signalAgent('solo-1', 'PAUSE');
    const pausedTick = await runtime.tick(['solo-1']);
    assert.equal(pausedTick.skippedAgents, 1);
    assert.equal(env.dispatches.length, 0);

    await runtime.signalAgent('solo-1', 'RESUME');
    const resumedTick = await runtime.tick(['solo-1']);
    assert.equal(resumedTick.actedAgents, 1);
    assert.equal(env.dispatches.length, 1);

    await runtime.signalAgent('solo-1', 'TERMINATE');
    assert.equal(runtime.getAgent('solo-1'), null);

    await runtime.stop();
});

test('MCPBridge orchestrates swarm operations through tool calls', async () => {
    const memory = new InMemoryMemory();
    const runtime = new RuntimeHost(memory, { autoTick: false });
    const env = new TestEnvironment('ops');
    runtime.registerEnvironment(env);
    runtime.registerAgentTemplate('worker', () => new WorkerAgent('bridge-work'));

    const bridge = new MCPBridge(runtime);
    const spawnResponse = await bridge.handleToolCall('spawn_swarm', {
        type: 'worker',
        swarmId: 'bridge-swarm',
        environmentId: 'ops',
        size: 6,
    });
    const spawnPayload = JSON.parse(spawnResponse.content[0].text) as {
        result: { spawned: number; failed: number };
    };
    assert.equal(spawnPayload.result.spawned, 6);
    assert.equal(spawnPayload.result.failed, 0);

    const orchestrateResponse = await bridge.handleToolCall('orchestrate_swarm', {
        swarmId: 'bridge-swarm',
        iterations: 2,
    });
    const orchestrationPayload = JSON.parse(orchestrateResponse.content[0].text) as {
        result: { completedIterations: number; totals: { actedAgents: number } };
    };
    assert.equal(orchestrationPayload.result.completedIterations, 2);
    assert.equal(orchestrationPayload.result.totals.actedAgents, 12);

    const inspectResponse = await bridge.handleToolCall('inspect_runtime', {});
    const inspectPayload = JSON.parse(inspectResponse.content[0].text) as {
        snapshot: { totals: { agents: number; swarms: number } };
    };
    assert.equal(inspectPayload.snapshot.totals.agents, 6);
    assert.equal(inspectPayload.snapshot.totals.swarms, 1);

    await assert.rejects(
        async () => bridge.handleToolCall('spawn_agent', { agentId: 'x', environmentId: 'ops' }),
        /Field 'type'/
    );

    await runtime.stop();
});
