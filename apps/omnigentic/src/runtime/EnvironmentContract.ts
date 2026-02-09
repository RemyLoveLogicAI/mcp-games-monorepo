import { Action, Perception } from './AgentContract.js';

/**
 * Universal Contract for any Environment (Simulation, Game, Chat, Voice).
 * Environments must adapt their internal logic to this interface.
 */
export interface EnvironmentHost {
    /**
     * Unique identifier for this environment instance.
     */
    id: string;

    /**
     * Metadata describing the environment's capabilities.
     */
    capabilities: EnvironmentCapabilities;

    /**
     * Register an agent into this environment.
     */
    admitAgent(agentId: string, config?: unknown): Promise<boolean>;

    /**
     * Eject an agent from this environment.
     */
    expelAgent(agentId: string, reason?: string): Promise<void>;

    /**
     * Get the current state as perceived by a specific agent.
     * Used to generate the `Perception` object for the Agent's tick.
     */
    getPerception(agentId: string): Promise<Perception>;

    /**
     * Execute an action performed by an agent.
     * Returns validation result and effects.
     */
    dispatchAction(agentId: string, action: Action): Promise<ActionResult>;
}

export interface EnvironmentCapabilities {
    supportsVoice: boolean;
    supportsVisuals: boolean;
    timeDilation: number; // 1.0 = realtime, >1.0 = faster
    physicsEngine: boolean;
}

export interface ActionResult {
    success: boolean;
    feedback: string;
    newState?: unknown;
    error?: string;
}
