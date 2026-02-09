/**
 * The standard lifecycle of an agent within the Universal Runtime.
 * Agents are not process-bound; they are state-bound.
 */
export interface AgentLifecycle {
    /**
     * Called when the agent is first loaded into the runtime.
     * Logic: Hydrate state, connect to memory, verify environment compatibility.
     */
    onMount(context: RuntimeContext): Promise<void>;

    /**
     * The core cognitive tick.
     * Input: Current perception of the environment.
     * Output: A decision/action (or null/wait).
     */
    tick(perception: Perception): Promise<Action | null>;

    /**
     * Called before the agent is unloaded or serialized.
     * Logic: Flush short-term memory to long-term storage, release locks.
     */
    onUnmount(): Promise<void>;

    /**
     * Handle direct signals from the runtime (e.g., "Pause", "Debug").
     */
    onSignal(signal: RuntimeSignal): Promise<void>;
}

export interface RuntimeContext {
    agentId: string;
    environmentId: string;
    config: Record<string, unknown>;
}

export interface Perception {
    timestamp: number;
    environmentState: unknown; // Typed by environment
    messages: Message[];
    events: RuntimeEvent[];
}

export interface Action {
    type: string;
    payload: unknown;
    confidence: number;
}

export interface Message {
    from: string;
    content: string;
    timestamp: number;
}

export type RuntimeSignal = 'PAUSE' | 'RESUME' | 'TERMINATE' | 'SNAPSHOT';
export type RuntimeEvent = { type: string; payload: unknown };
