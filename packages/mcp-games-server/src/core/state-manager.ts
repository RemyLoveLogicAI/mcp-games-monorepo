import { Session } from '@omnigents/shared';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface StateStore {
    saveSession(session: Session): Promise<void>;
    getSession(sessionId: string): Promise<Session | null>;
    createSession(gameId: string, playerId: string): Promise<Session>;
    logHistoryEntry(params: {
        sessionId: string;
        sceneId: string;
        choiceId?: string;
        freeformInput?: string;
        contextInjected?: Record<string, string>;
        effectsApplied?: any[];
        traceId: string;
        durationMs?: number;
    }): Promise<void>;
}

export interface HistoryEntry {
    sessionId: string;
    sceneId: string;
    choiceId?: string;
    freeformInput?: string;
    contextInjected: Record<string, string>;
    effectsApplied: any[];
    traceId: string;
    durationMs?: number;
    timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// IN-MEMORY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════

export class InMemoryStateStore implements StateStore {
    private sessions = new Map<string, Session>();
    private history = new Map<string, HistoryEntry[]>();

    async saveSession(session: Session): Promise<void> {
        this.sessions.set(session.id, session);
        telemetry.emit('session:saved', { sessionId: session.id });
    }

    async getSession(sessionId: string): Promise<Session | null> {
        return this.sessions.get(sessionId) || null;
    }

    async createSession(gameId: string, playerId: string): Promise<Session> {
        const session: Session = {
            id: uuidv4(),
            gameId,
            playerId,
            currentSceneId: 'start',
            variables: {},
            contextPermissions: {},
            voiceMode: false,
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            traceId: 'todo-trace-id'
        };
        this.sessions.set(session.id, session);
        this.history.set(session.id, []);
        telemetry.emit('session:created', { sessionId: session.id, gameId, playerId });
        return session;
    }

    async logHistoryEntry(params: {
        sessionId: string;
        sceneId: string;
        choiceId?: string;
        freeformInput?: string;
        contextInjected?: Record<string, string>;
        effectsApplied?: any[];
        traceId: string;
        durationMs?: number;
    }): Promise<void> {
        const entry: HistoryEntry = {
            ...params,
            contextInjected: params.contextInjected || {},
            effectsApplied: params.effectsApplied || [],
            timestamp: new Date().toISOString()
        };
        const history = this.history.get(params.sessionId) || [];
        history.push(entry);
        this.history.set(params.sessionId, history);
    }
}

// ═══════════════════════════════════════════════════════════
// STATE MANAGER - MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════

export class StateManager {
    private store: StateStore;
    private agent: SelfAwareAgent | null;

    constructor(store: StateStore, agent?: SelfAwareAgent) {
        this.store = store;
        this.agent = agent || null;
    }

    // ───────────────────────────────────────────────────────
    // SESSION LIFECYCLE
    // ───────────────────────────────────────────────────────

    async createSession(gameId: string, playerId: string, traceId: string): Promise<Session> {
        const start = Date.now();
        try {
            const session = await this.store.createSession(gameId, playerId);
            const duration = Date.now() - start;

            if (this.agent) {
                await this.agent.track({
                    operation: 'createSession',
                    status: 'success',
                    durationMs: duration,
                    traceId
                });
            }

            return session;
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'createSession',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    async getSession(sessionId: string, traceId: string): Promise<Session | null> {
        const start = Date.now();
        try {
            const session = await this.store.getSession(sessionId);
            const duration = Date.now() - start;

            if (this.agent) {
                await this.agent.track({
                    operation: 'getSession',
                    status: 'success',
                    durationMs: duration,
                    traceId
                });
            }

            return session;
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'getSession',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    async saveSession(session: Session, traceId: string): Promise<void> {
        const start = Date.now();
        try {
            await this.store.saveSession(session);
            const duration = Date.now() - start;

            if (this.agent) {
                await this.agent.track({
                    operation: 'saveSession',
                    status: 'success',
                    durationMs: duration,
                    traceId
                });
            }
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'saveSession',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    async completeSession(sessionId: string, traceId: string): Promise<void> {
        const session = await this.getSession(sessionId, traceId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        session.completedAt = new Date().toISOString();
        session.lastActivityAt = new Date().toISOString();

        await this.saveSession(session, traceId);
        telemetry.emit('session:completed', { sessionId, traceId });
    }

    // ───────────────────────────────────────────────────────
    // VARIABLES
    // ───────────────────────────────────────────────────────

    async setVariable(
        sessionId: string,
        key: string,
        value: any,
        traceId: string
    ): Promise<void> {
        const session = await this.getSession(sessionId, traceId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        session.variables[key] = value;
        session.lastActivityAt = new Date().toISOString();

        await this.saveSession(session, traceId);
        telemetry.emit('variable:set', { sessionId, key, traceId });
    }

    async getVariable(sessionId: string, key: string, traceId: string): Promise<any> {
        const session = await this.getSession(sessionId, traceId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        return session.variables[key];
    }

    // ───────────────────────────────────────────────────────
    // HEALTH MANAGEMENT
    // ───────────────────────────────────────────────────────

    async updateHealthScore(
        sessionId: string,
        delta: number,
        traceId: string
    ): Promise<number> {
        const session = await this.getSession(sessionId, traceId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        const oldHealth = session.voiceMode ? 100 : 100; // Default to 100 if not set
        const newHealth = Math.max(0, Math.min(100, oldHealth + delta));

        session.voiceMode = newHealth === oldHealth; // Placeholder for health_score field
        session.lastActivityAt = new Date().toISOString();

        await this.saveSession(session, traceId);
        telemetry.emit('health:updated', { sessionId, delta, newHealth, traceId });

        return newHealth;
    }

    isSessionHealthy(healthScore: number): boolean {
        return healthScore > 70;
    }

    isSessionDegraded(healthScore: number): boolean {
        return healthScore > 30 && healthScore <= 70;
    }

    isSessionCritical(healthScore: number): boolean {
        return healthScore <= 30;
    }

    // ───────────────────────────────────────────────────────
    // SCENE NAVIGATION
    // ───────────────────────────────────────────────────────

    async navigateToScene(
        sessionId: string,
        sceneId: string,
        traceId: string
    ): Promise<void> {
        const session = await this.getSession(sessionId, traceId);
        if (!session) throw new Error(`Session not found: ${sessionId}`);

        session.currentSceneId = sceneId;
        session.lastActivityAt = new Date().toISOString();

        await this.saveSession(session, traceId);
        telemetry.emit('scene:navigated', { sessionId, sceneId, traceId });
    }

    // ───────────────────────────────────────────────────────
    // HISTORY TRACKING
    // ───────────────────────────────────────────────────────

    async logAction(
        sessionId: string,
        sceneId: string,
        action: { choiceId?: string; freeformInput?: string; effectsApplied?: any[] },
        contextInjected: Record<string, string>,
        durationMs: number,
        traceId: string
    ): Promise<void> {
        const start = Date.now();
        try {
            await this.store.logHistoryEntry({
                sessionId,
                sceneId,
                choiceId: action.choiceId,
                freeformInput: action.freeformInput,
                contextInjected,
                effectsApplied: action.effectsApplied || [],
                traceId,
                durationMs
            });

            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'logAction',
                    status: 'success',
                    durationMs: duration,
                    traceId
                });
            }
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'logAction',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════

export const inMemoryStore = new InMemoryStateStore();

export function createStateManager(store: StateStore, agent?: SelfAwareAgent): StateManager {
    return new StateManager(store, agent);
}

export const defaultStateManager = createStateManager(inMemoryStore);
