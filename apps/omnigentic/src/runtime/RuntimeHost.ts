import { AgentLifecycle, RuntimeContext, Perception, Action, RuntimeSignal } from './AgentContract.js';
import { EnvironmentHost } from './EnvironmentContract.js';
import { MemoryIO } from './MemoryContract.js';

export class RuntimeHost {
    private agents: Map<string, AgentLifecycle> = new Map();
    private environments: Map<string, EnvironmentHost> = new Map();
    private memory: MemoryIO;

    constructor(memory: MemoryIO) {
        this.memory = memory;
    }

    /**
     * Boot the runtime.
     */
    async start() {
        console.log('[RuntimeHost] Starting Universal Agent Runtime...');
        // TODO: Load config, initialize subsystems
    }

    /**
     * Register an environment (e.g., a Game, a Chat interface).
     */
    registerEnvironment(env: EnvironmentHost) {
        this.environments.set(env.id, env);
        console.log(`[RuntimeHost] Registered environment: ${env.id}`);
    }

    /**
     * Spawn an agent into an environment.
     */
    async spawnAgent(agentId: string, envId: string, agentImpl: AgentLifecycle) {
        const env = this.environments.get(envId);
        if (!env) throw new Error(`Environment ${envId} not found`);

        this.agents.set(agentId, agentImpl);

        const context: RuntimeContext = {
            agentId,
            environmentId: envId,
            config: {}
        };

        await agentImpl.onMount(context);
        await env.admitAgent(agentId);
        console.log(`[RuntimeHost] Spawned agent ${agentId} in ${envId}`);
    }

    /**
     * The Heartbeat.
     * Schedules ticks for all active agents.
     */
    async tick() {
        for (const [agentId, agent] of this.agents) {
            // 1. Get Perception
            // 2. Agent.tick(Perception) -> Action
            // 3. Environment.dispatch(Action)
            // This is the core loop.
        }
    }

    async stop() {
        for (const agent of this.agents.values()) {
            await agent.onSignal('TERMINATE');
            await agent.onUnmount();
        }
        console.log('[RuntimeHost] Runtime stopped.');
    }
}
