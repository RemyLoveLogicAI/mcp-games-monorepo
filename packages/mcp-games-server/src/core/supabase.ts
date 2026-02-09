import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Session } from '@omnigents/shared';
import { StateStore, InMemoryStateStore } from './state.js';
import { telemetry } from '../observability/index.js';
import { v4 as uuidv4 } from 'uuid';

export class SupabaseStateStore implements StateStore {
    private client: SupabaseClient;

    constructor(url: string, key: string) {
        this.client = createClient(url, key);
    }

    async saveSession(session: Session): Promise<void> {
        const { error } = await this.client
            .from('sessions')
            .upsert({
                id: session.id,
                game_id: session.gameId,
                player_id: session.playerId,
                current_scene_id: session.currentSceneId,
                variables: session.variables,
                context_permissions: session.contextPermissions,
                voice_mode: session.voiceMode,
                started_at: session.startedAt,
                last_activity_at: session.lastActivityAt,
                completed_at: session.completedAt,
                trace_id: session.traceId
            });

        if (error) {
            telemetry.emit('db:error', { operation: 'saveSession', error: error.message }, 'ERROR');
            throw new Error(`Failed to save session: ${error.message}`);
        }

        telemetry.emit('session:saved', { sessionId: session.id, backend: 'supabase' });
    }

    async getSession(sessionId: string): Promise<Session | null> {
        const { data, error } = await this.client
            .from('sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            telemetry.emit('db:error', { operation: 'getSession', error: error.message }, 'ERROR');
            throw new Error(`Failed to get session: ${error.message}`);
        }

        // Map DB fields back to Session object (snake_case -> camelCase)
        return {
            id: data.id,
            gameId: data.game_id,
            playerId: data.player_id,
            currentSceneId: data.current_scene_id,
            variables: data.variables,
            contextPermissions: data.context_permissions,
            voiceMode: data.voice_mode,
            startedAt: data.started_at,
            lastActivityAt: data.last_activity_at,
            completedAt: data.completed_at,
            traceId: data.trace_id
        };
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
        await this.saveSession(session);
        return session;
    }
}

// Factory to choose store based on env
export function getStateStore(): StateStore {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        return new SupabaseStateStore(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    }
    console.warn('SUPABASE_URL not set, falling back to InMemoryStateStore');
    return new InMemoryStateStore();
}
