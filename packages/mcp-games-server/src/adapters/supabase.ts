import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Session } from '@omnigents/shared';
import { StateStore, InMemoryStateStore } from '../core/state-manager.js';
import { telemetry } from '../observability/index.js';
import { v4 as uuidv4 } from 'uuid';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

export class SupabaseStateStore implements StateStore {
    private client: SupabaseClient;
    private agent: SelfAwareAgent | null;

    constructor(url: string, key: string, agent?: SelfAwareAgent) {
        this.client = createClient(url, key);
        this.agent = agent || null;
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

    // ═══════════════════════════════════════════════════════════
    // HISTORY TRACKING
    // ═══════════════════════════════════════════════════════════

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
        const { error } = await this.client.from('session_history').insert({
            id: uuidv4(),
            session_id: params.sessionId,
            scene_id: params.sceneId,
            choice_id: params.choiceId,
            freeform_input: params.freeformInput,
            context_injected: params.contextInjected || {},
            effects_applied: params.effectsApplied || [],
            trace_id: params.traceId,
            duration_ms: params.durationMs,
            created_at: new Date().toISOString(),
        });

        if (error) {
            console.warn(`[DB] Failed to log history: ${error.message}`);
        }
    }

    async getSessionHistory(sessionId: string, limit = 50): Promise<any[]> {
        const { data, error } = await this.client
            .from('session_history')
            .select()
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.warn(`[DB] Failed to get history: ${error.message}`);
            return [];
        }

        return data || [];
    }

    // ═══════════════════════════════════════════════════════════
    // RECOVERY & MONITORING
    // ═══════════════════════════════════════════════════════════

    async logRecovery(params: {
        tier: string;
        agentId: string;
        failureType: string;
        recoveryStrategy: string;
        status: 'success' | 'failed';
        durationMs: number;
        commandsExecuted?: string[];
        errorMessage?: string;
        traceId: string;
    }): Promise<void> {
        const { error } = await this.client.from('recovery_log').insert({
            id: uuidv4(),
            tier: params.tier,
            agent_id: params.agentId,
            failure_type: params.failureType,
            recovery_strategy: params.recoveryStrategy,
            status: params.status,
            duration_ms: params.durationMs,
            commands_executed: params.commandsExecuted || [],
            error_message: params.errorMessage,
            trace_id: params.traceId,
            created_at: new Date().toISOString(),
        });

        if (error) {
            console.warn(`[DB] Failed to log recovery: ${error.message}`);
        }
    }

    async createHitlRequest(params: {
        priority: 'LOW' | 'MEDIUM' | 'HIGH';
        situation: string;
        aiAnalysis: string;
        aiRecommendation: string;
        options: Record<string, any>;
        expiresAt: Date;
        traceId: string;
    }): Promise<string> {
        const requestId = uuidv4();

        const { error } = await this.client.from('hitl_requests').insert({
            id: requestId,
            priority: params.priority,
            situation: params.situation,
            ai_analysis: params.aiAnalysis,
            ai_recommendation: params.aiRecommendation,
            options: params.options,
            created_at: new Date().toISOString(),
            expires_at: params.expiresAt.toISOString(),
        });

        if (error) {
            throw new Error(`Failed to create HITL request: ${error.message}`);
        }

        return requestId;
    }

    async resolveHitlRequest(
        requestId: string,
        params: {
            selectedOption: number;
            respondedBy: string;
            autoSelected: boolean;
            traceId: string;
        }
    ): Promise<void> {
        const { error } = await this.client
            .from('hitl_requests')
            .update({
                selected_option: params.selectedOption,
                responded_by: params.respondedBy,
                auto_selected: params.autoSelected,
                responded_at: new Date().toISOString(),
            })
            .eq('id', requestId);

        if (error) {
            throw new Error(`Failed to resolve HITL request: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TIER 0 TELEMETRY
    // ═══════════════════════════════════════════════════════════

    async logTelemetry(params: {
        agentId: string;
        service: string;
        operationType: string;
        status: 'success' | 'failure';
        durationMs: number;
        errorMessage?: string;
        errorCode?: string;
        traceId: string;
        healthScore?: number;
    }): Promise<void> {
        // Fire and forget
        this.client
            .from('tier0_telemetry')
            .insert({
                id: uuidv4(),
                agent_id: params.agentId,
                service: params.service,
                operation_type: params.operationType,
                status: params.status,
                duration_ms: params.durationMs,
                error_message: params.errorMessage,
                error_code: params.errorCode,
                trace_id: params.traceId,
                health_score: params.healthScore,
                created_at: new Date().toISOString(),
            })
            .then(({ error }) => {
                if (error) {
                    console.warn(`[DB] Failed to log telemetry: ${error.message}`);
                }
            });
    }

    async getRecentErrors(
        agentId: string,
        limitMinutes = 60
    ): Promise<Array<{ operationType: string; errorMessage: string; count: number; lastSeen: string }>> {
        const since = new Date(Date.now() - limitMinutes * 60 * 1000);

        const { data, error } = await this.client
            .from('tier0_telemetry')
            .select('operation_type, error_message, created_at')
            .eq('agent_id', agentId)
            .eq('status', 'failure')
            .gt('created_at', since.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.warn(`[DB] Failed to get errors: ${error.message}`);
            return [];
        }

        // Group and aggregate
        const grouped = new Map<string, { count: number; lastSeen: string; errorMessage: string }>();

        for (const row of data || []) {
            const key = `${row.operation_type}:${row.error_message}`;
            const existing = grouped.get(key) || {
                count: 0,
                lastSeen: row.created_at,
                errorMessage: row.error_message,
            };

            existing.count++;
            existing.lastSeen = row.created_at;
            grouped.set(key, existing);
        }

        return Array.from(grouped.entries()).map(([key, value]) => {
            const [operationType] = key.split(':');
            return {
                operationType,
                errorMessage: value.errorMessage,
                count: value.count,
                lastSeen: value.lastSeen,
            };
        });
    }

    // ═══════════════════════════════════════════════════════════
    // HEALTH CHECKS
    // ═══════════════════════════════════════════════════════════

    async healthCheck(): Promise<boolean> {
        try {
            const { error } = await this.client.from('sessions').select('count()').limit(1);
            return !error;
        } catch {
            return false;
        }
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
