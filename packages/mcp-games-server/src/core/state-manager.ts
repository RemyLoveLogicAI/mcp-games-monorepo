import { Session } from '@omnigents/shared';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

export interface StateStore {
    saveSession(session: Session): Promise<void>;
    getSession(sessionId: string): Promise<Session | null>;
    createSession(gameId: string, playerId: string): Promise<Session>;
}

export class InMemoryStateStore implements StateStore {
    private sessions = new Map<string, Session>();

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
            currentSceneId: 'start', // Placeholder, will be set by engine
            variables: {},
            contextPermissions: {},
            voiceMode: false,
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            traceId: 'todo-trace-id'
        };
        this.sessions.set(session.id, session);
        telemetry.emit('session:created', { sessionId: session.id, gameId, playerId });
        return session;
    }
}

export const stateStore = new InMemoryStateStore(); // Default to in-memory for Sprint 1 start
