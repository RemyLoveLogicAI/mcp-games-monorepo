import { Action, AgentLifecycle, RuntimeContext, RuntimeSignal } from './AgentContract.js';
import { ActionResult, EnvironmentHost } from './EnvironmentContract.js';
import { MemoryFragment, MemoryIO } from './MemoryContract.js';

export type AgentRunState = 'active' | 'paused' | 'terminating' | 'terminated' | 'errored';
export type RuntimeEventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeHostOptions {
    autoTick?: boolean;
    tickIntervalMs?: number;
    maxParallelTicks?: number;
    maxRuntimeEvents?: number;
    maxAgentErrorsBeforePause?: number;
}

export interface RuntimeHostEvent {
    type: string;
    level: RuntimeEventLevel;
    timestamp: number;
    details: Record<string, unknown>;
}

export interface ManagedAgentSnapshot {
    agentId: string;
    environmentId: string;
    swarmId: string | null;
    parentAgentId: string | null;
    role: string | null;
    state: AgentRunState;
    mountedAt: number;
    lastTickAt: number | null;
    tickCount: number;
    actionCount: number;
    errorCount: number;
    lastError: string | null;
    lastActionType: string | null;
}

interface ManagedAgent extends ManagedAgentSnapshot {
    lifecycle: AgentLifecycle;
    config: Record<string, unknown>;
}

export interface RuntimeSnapshot {
    running: boolean;
    tickInProgress: boolean;
    tickIntervalMs: number;
    startedAt: number | null;
    environments: string[];
    templates: string[];
    totals: {
        agents: number;
        active: number;
        paused: number;
        errored: number;
        swarms: number;
    };
    agents: ManagedAgentSnapshot[];
    recentEvents: RuntimeHostEvent[];
}

export interface SpawnAgentOptions {
    config?: Record<string, unknown>;
    swarmId?: string;
    parentAgentId?: string;
    role?: string;
    environmentConfig?: unknown;
}

export interface AgentTemplateContext {
    agentId: string;
    environmentId: string;
    swarmId: string | null;
    parentAgentId: string | null;
    role: string | null;
    index: number;
    config: Record<string, unknown>;
}

export type AgentTemplateFactory = (context: AgentTemplateContext) => AgentLifecycle;

export interface SpawnAgentFromTemplateRequest {
    templateType: string;
    agentId: string;
    environmentId: string;
    config?: Record<string, unknown>;
    swarmId?: string;
    parentAgentId?: string;
    role?: string;
    environmentConfig?: unknown;
}

export interface SpawnSwarmFromTemplateRequest {
    templateType: string;
    swarmId: string;
    environmentId: string;
    size: number;
    agentIdPrefix?: string;
    parentAgentId?: string;
    sharedConfig?: Record<string, unknown>;
    roles?: string[];
    continueOnError?: boolean;
}

export interface SwarmSpawnFailure {
    index: number;
    agentId: string;
    reason: string;
}

export interface SpawnSwarmResult {
    swarmId: string;
    requested: number;
    spawned: number;
    failed: number;
    members: ManagedAgentSnapshot[];
    failures: SwarmSpawnFailure[];
}

export type TickOutcomeStatus = 'acted' | 'idle' | 'failed' | 'skipped';
export type TickExecutionStatus = 'executed' | 'skipped';

export interface AgentTickOutcome {
    agentId: string;
    status: TickOutcomeStatus;
    actionType: string | null;
    dispatchSuccess: boolean | null;
    feedback: string | null;
    error: string | null;
}

export interface TickSummary {
    status: TickExecutionStatus;
    reason: string | null;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    targetedAgents: number;
    processedAgents: number;
    actedAgents: number;
    idleAgents: number;
    failedAgents: number;
    skippedAgents: number;
    outcomes: AgentTickOutcome[];
}

export interface OrchestrateSwarmRequest {
    swarmId: string;
    iterations?: number;
    stopOnFailure?: boolean;
    delayBetweenRoundsMs?: number;
}

export interface OrchestrateSwarmResult {
    swarmId: string;
    requestedIterations: number;
    completedIterations: number;
    halted: boolean;
    haltReason: string | null;
    totals: {
        actedAgents: number;
        idleAgents: number;
        failedAgents: number;
        skippedAgents: number;
    };
    rounds: TickSummary[];
}

export interface BroadcastSignalResult {
    signal: RuntimeSignal;
    targeted: number;
    succeeded: number;
    failed: number;
    failures: Array<{ agentId: string; reason: string }>;
}

const DEFAULT_OPTIONS: Required<RuntimeHostOptions> = {
    autoTick: true,
    tickIntervalMs: 1000,
    maxParallelTicks: 24,
    maxRuntimeEvents: 500,
    maxAgentErrorsBeforePause: 3,
};

export class RuntimeHost {
    private readonly agents: Map<string, ManagedAgent> = new Map();
    private readonly environments: Map<string, EnvironmentHost> = new Map();
    private readonly agentTemplates: Map<string, AgentTemplateFactory> = new Map();
    private readonly runtimeEvents: RuntimeHostEvent[] = [];
    private readonly memory: MemoryIO;
    private readonly options: Required<RuntimeHostOptions>;

    private heartbeatTimer: NodeJS.Timeout | null = null;
    private running = false;
    private tickInProgress = false;
    private startedAt: number | null = null;

    constructor(memory: MemoryIO, options: RuntimeHostOptions = {}) {
        this.memory = memory;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Boot the runtime and start heartbeat ticks.
     */
    async start(): Promise<void> {
        if (this.running) {
            this.recordEvent('runtime_start_skipped', 'debug', { reason: 'already_running' });
            return;
        }

        this.running = true;
        this.startedAt = Date.now();
        this.recordEvent('runtime_started', 'info', {
            tickIntervalMs: this.options.tickIntervalMs,
            autoTick: this.options.autoTick,
        });

        if (this.options.autoTick) {
            this.heartbeatTimer = setInterval(() => {
                void this.tick();
            }, this.options.tickIntervalMs);
        }
    }

    /**
     * Register an environment (e.g., game, chat, simulation).
     */
    registerEnvironment(env: EnvironmentHost): void {
        if (this.environments.has(env.id)) {
            throw new Error(`Environment '${env.id}' is already registered`);
        }
        this.environments.set(env.id, env);
        this.recordEvent('environment_registered', 'info', { environmentId: env.id });
    }

    /**
     * Remove an environment and expel any attached agents.
     */
    async unregisterEnvironment(envId: string, reason = 'environment_unregistered'): Promise<void> {
        const env = this.environments.get(envId);
        if (!env) {
            return;
        }

        const attachedAgents = this.getAgents().filter((agent) => agent.environmentId === envId);
        for (const agent of attachedAgents) {
            await this.despawnAgent(agent.agentId, reason);
        }

        this.environments.delete(envId);
        this.recordEvent('environment_unregistered', 'info', { environmentId: envId, reason });
    }

    /**
     * Register a factory used to instantiate agent templates.
     */
    registerAgentTemplate(templateType: string, factory: AgentTemplateFactory): void {
        const type = templateType.trim();
        if (!type) {
            throw new Error('Template type must be a non-empty string');
        }
        this.agentTemplates.set(type, factory);
        this.recordEvent('agent_template_registered', 'info', { templateType: type });
    }

    listAgentTemplates(): string[] {
        return Array.from(this.agentTemplates.keys()).sort((a, b) => a.localeCompare(b));
    }

    listEnvironmentIds(): string[] {
        return Array.from(this.environments.keys()).sort((a, b) => a.localeCompare(b));
    }

    /**
     * Spawn one agent instance in an environment.
     */
    async spawnAgent(
        agentId: string,
        envId: string,
        agentImpl: AgentLifecycle,
        options: SpawnAgentOptions = {}
    ): Promise<ManagedAgentSnapshot> {
        if (this.agents.has(agentId)) {
            throw new Error(`Agent '${agentId}' already exists`);
        }

        const env = this.environments.get(envId);
        if (!env) {
            throw new Error(`Environment '${envId}' not found`);
        }

        const context: RuntimeContext = {
            agentId,
            environmentId: envId,
            config: options.config ?? {},
        };

        await agentImpl.onMount(context);

        let admitted = false;
        try {
            admitted = await env.admitAgent(agentId, options.environmentConfig);
        } catch (error: unknown) {
            await this.safeSignal(agentImpl, 'TERMINATE');
            await this.safeUnmount(agentImpl);
            throw new Error(
                `Failed admitting agent '${agentId}' into environment '${envId}': ${this.errorToMessage(error)}`
            );
        }

        if (!admitted) {
            await this.safeSignal(agentImpl, 'TERMINATE');
            await this.safeUnmount(agentImpl);
            throw new Error(`Environment '${envId}' rejected agent '${agentId}'`);
        }

        const managed: ManagedAgent = {
            lifecycle: agentImpl,
            config: options.config ?? {},
            agentId,
            environmentId: envId,
            swarmId: options.swarmId ?? null,
            parentAgentId: options.parentAgentId ?? null,
            role: options.role ?? null,
            state: 'active',
            mountedAt: Date.now(),
            lastTickAt: null,
            tickCount: 0,
            actionCount: 0,
            errorCount: 0,
            lastError: null,
            lastActionType: null,
        };

        this.agents.set(agentId, managed);
        this.recordEvent('agent_spawned', 'info', {
            agentId,
            environmentId: envId,
            swarmId: managed.swarmId,
            parentAgentId: managed.parentAgentId,
            role: managed.role,
        });

        return this.toSnapshot(managed);
    }

    /**
     * Spawn one agent using a registered template type.
     */
    async spawnAgentFromTemplate(request: SpawnAgentFromTemplateRequest): Promise<ManagedAgentSnapshot> {
        const template = this.agentTemplates.get(request.templateType);
        if (!template) {
            throw new Error(`Template '${request.templateType}' not found`);
        }

        const agent = template({
            agentId: request.agentId,
            environmentId: request.environmentId,
            swarmId: request.swarmId ?? null,
            parentAgentId: request.parentAgentId ?? null,
            role: request.role ?? null,
            index: 0,
            config: request.config ?? {},
        });

        return this.spawnAgent(request.agentId, request.environmentId, agent, {
            config: request.config,
            swarmId: request.swarmId,
            parentAgentId: request.parentAgentId,
            role: request.role,
            environmentConfig: request.environmentConfig,
        });
    }

    /**
     * Spawn a large swarm of sub-agents using one template.
     */
    async spawnSwarmFromTemplate(request: SpawnSwarmFromTemplateRequest): Promise<SpawnSwarmResult> {
        const template = this.agentTemplates.get(request.templateType);
        if (!template) {
            throw new Error(`Template '${request.templateType}' not found`);
        }

        if (!Number.isInteger(request.size) || request.size <= 0) {
            throw new Error(`Swarm size must be a positive integer. Received '${request.size}'`);
        }

        const members: ManagedAgentSnapshot[] = [];
        const failures: SwarmSpawnFailure[] = [];
        const prefix = request.agentIdPrefix ?? request.swarmId;
        const sharedConfig = request.sharedConfig ?? {};
        const continueOnError = request.continueOnError ?? true;

        for (let index = 0; index < request.size; index += 1) {
            const agentId = `${prefix}-${index + 1}`;
            const role = request.roles?.[index] ?? null;
            try {
                const agent = template({
                    agentId,
                    environmentId: request.environmentId,
                    swarmId: request.swarmId,
                    parentAgentId: request.parentAgentId ?? null,
                    role,
                    index,
                    config: sharedConfig,
                });

                const snapshot = await this.spawnAgent(agentId, request.environmentId, agent, {
                    config: sharedConfig,
                    swarmId: request.swarmId,
                    parentAgentId: request.parentAgentId,
                    role: role ?? undefined,
                });
                members.push(snapshot);
            } catch (error: unknown) {
                const reason = this.errorToMessage(error);
                failures.push({ index, agentId, reason });
                this.recordEvent('swarm_member_spawn_failed', 'warn', {
                    swarmId: request.swarmId,
                    agentId,
                    reason,
                });
                if (!continueOnError) {
                    break;
                }
            }
        }

        const result: SpawnSwarmResult = {
            swarmId: request.swarmId,
            requested: request.size,
            spawned: members.length,
            failed: failures.length,
            members,
            failures,
        };

        this.recordEvent('swarm_spawn_completed', 'info', {
            swarmId: result.swarmId,
            requested: result.requested,
            spawned: result.spawned,
            failed: result.failed,
        });

        return result;
    }

    /**
     * Remove an agent from runtime and environment.
     */
    async despawnAgent(agentId: string, reason = 'despawn_requested'): Promise<boolean> {
        const managed = this.agents.get(agentId);
        if (!managed) {
            return false;
        }

        managed.state = 'terminating';

        await this.safeSignal(managed.lifecycle, 'TERMINATE');
        await this.safeUnmount(managed.lifecycle);

        const env = this.environments.get(managed.environmentId);
        if (env) {
            await this.safeExpel(env, agentId, reason);
        }

        managed.state = 'terminated';
        this.agents.delete(agentId);

        this.recordEvent('agent_despawned', 'info', {
            agentId,
            reason,
            environmentId: managed.environmentId,
        });
        return true;
    }

    /**
     * Send a control signal to one agent.
     */
    async signalAgent(agentId: string, signal: RuntimeSignal): Promise<void> {
        const managed = this.agents.get(agentId);
        if (!managed) {
            throw new Error(`Agent '${agentId}' not found`);
        }

        if (signal === 'TERMINATE') {
            await this.despawnAgent(agentId, 'terminate_signal');
            return;
        }

        await managed.lifecycle.onSignal(signal);

        if (signal === 'PAUSE') {
            managed.state = 'paused';
        } else if (signal === 'RESUME') {
            managed.state = 'active';
        }

        this.recordEvent('agent_signaled', 'info', { agentId, signal });
    }

    /**
     * Broadcast a signal to all agents or one swarm.
     */
    async broadcastSignal(
        signal: RuntimeSignal,
        filter: { swarmId?: string; environmentId?: string } = {}
    ): Promise<BroadcastSignalResult> {
        const targets = this.getAgents().filter((agent) => {
            if (filter.swarmId && agent.swarmId !== filter.swarmId) {
                return false;
            }
            if (filter.environmentId && agent.environmentId !== filter.environmentId) {
                return false;
            }
            return true;
        });

        const failures: Array<{ agentId: string; reason: string }> = [];
        let succeeded = 0;

        for (const target of targets) {
            try {
                await this.signalAgent(target.agentId, signal);
                succeeded += 1;
            } catch (error: unknown) {
                failures.push({
                    agentId: target.agentId,
                    reason: this.errorToMessage(error),
                });
            }
        }

        const result: BroadcastSignalResult = {
            signal,
            targeted: targets.length,
            succeeded,
            failed: failures.length,
            failures,
        };

        this.recordEvent('signal_broadcast', failures.length > 0 ? 'warn' : 'info', {
            signal,
            targeted: result.targeted,
            succeeded: result.succeeded,
            failed: result.failed,
            filter,
        });

        return result;
    }

    /**
     * Heartbeat tick for all active agents (or a subset).
     */
    async tick(agentIds?: string[]): Promise<TickSummary> {
        const startedAt = Date.now();
        if (this.tickInProgress) {
            return {
                status: 'skipped',
                reason: 'tick_in_progress',
                startedAt,
                finishedAt: startedAt,
                durationMs: 0,
                targetedAgents: 0,
                processedAgents: 0,
                actedAgents: 0,
                idleAgents: 0,
                failedAgents: 0,
                skippedAgents: 0,
                outcomes: [],
            };
        }

        this.tickInProgress = true;
        try {
            const targets = this.resolveTickTargets(agentIds);
            const outcomes: AgentTickOutcome[] = [];

            await this.runWithConcurrency(targets, this.options.maxParallelTicks, async (managed) => {
                const outcome = await this.executeAgentTick(managed);
                outcomes.push(outcome);
            });

            const finishedAt = Date.now();
            const summary: TickSummary = {
                status: 'executed',
                reason: null,
                startedAt,
                finishedAt,
                durationMs: finishedAt - startedAt,
                targetedAgents: targets.length,
                processedAgents: outcomes.length,
                actedAgents: outcomes.filter((o) => o.status === 'acted').length,
                idleAgents: outcomes.filter((o) => o.status === 'idle').length,
                failedAgents: outcomes.filter((o) => o.status === 'failed').length,
                skippedAgents: outcomes.filter((o) => o.status === 'skipped').length,
                outcomes,
            };

            this.recordEvent('tick_completed', summary.failedAgents > 0 ? 'warn' : 'debug', {
                targetedAgents: summary.targetedAgents,
                actedAgents: summary.actedAgents,
                failedAgents: summary.failedAgents,
                durationMs: summary.durationMs,
            });

            return summary;
        } finally {
            this.tickInProgress = false;
        }
    }

    /**
     * Run focused orchestration rounds against one swarm.
     */
    async orchestrateSwarm(request: OrchestrateSwarmRequest): Promise<OrchestrateSwarmResult> {
        const iterations = request.iterations ?? 1;
        if (!Number.isInteger(iterations) || iterations <= 0) {
            throw new Error(`Iterations must be a positive integer. Received '${iterations}'`);
        }

        const memberIds = this.getAgents()
            .filter((agent) => agent.swarmId === request.swarmId)
            .map((agent) => agent.agentId);

        if (memberIds.length === 0) {
            throw new Error(`Swarm '${request.swarmId}' has no registered members`);
        }

        const rounds: TickSummary[] = [];
        let completedIterations = 0;
        let halted = false;
        let haltReason: string | null = null;

        for (let round = 0; round < iterations; round += 1) {
            const summary = await this.tick(memberIds);
            rounds.push(summary);

            if (summary.status === 'skipped') {
                halted = true;
                haltReason = summary.reason ?? 'tick_skipped';
                break;
            }

            completedIterations += 1;
            if (request.stopOnFailure && summary.failedAgents > 0) {
                halted = true;
                haltReason = 'failure_detected';
                break;
            }

            if (request.delayBetweenRoundsMs && request.delayBetweenRoundsMs > 0) {
                await this.sleep(request.delayBetweenRoundsMs);
            }
        }

        const result: OrchestrateSwarmResult = {
            swarmId: request.swarmId,
            requestedIterations: iterations,
            completedIterations,
            halted,
            haltReason,
            totals: {
                actedAgents: rounds.reduce((acc, round) => acc + round.actedAgents, 0),
                idleAgents: rounds.reduce((acc, round) => acc + round.idleAgents, 0),
                failedAgents: rounds.reduce((acc, round) => acc + round.failedAgents, 0),
                skippedAgents: rounds.reduce((acc, round) => acc + round.skippedAgents, 0),
            },
            rounds,
        };

        this.recordEvent('swarm_orchestration_completed', result.halted ? 'warn' : 'info', {
            swarmId: result.swarmId,
            requestedIterations: result.requestedIterations,
            completedIterations: result.completedIterations,
            halted: result.halted,
            haltReason: result.haltReason,
            totals: result.totals,
        });

        return result;
    }

    getAgent(agentId: string): ManagedAgentSnapshot | null {
        const managed = this.agents.get(agentId);
        return managed ? this.toSnapshot(managed) : null;
    }

    getAgents(): ManagedAgentSnapshot[] {
        return Array.from(this.agents.values()).map((managed) => this.toSnapshot(managed));
    }

    getSwarmMembers(swarmId: string): ManagedAgentSnapshot[] {
        return this.getAgents().filter((agent) => agent.swarmId === swarmId);
    }

    getRuntimeSnapshot(): RuntimeSnapshot {
        const agents = this.getAgents();
        const swarms = new Set(
            agents
                .map((agent) => agent.swarmId)
                .filter((swarmId): swarmId is string => swarmId !== null)
        );

        return {
            running: this.running,
            tickInProgress: this.tickInProgress,
            tickIntervalMs: this.options.tickIntervalMs,
            startedAt: this.startedAt,
            environments: this.listEnvironmentIds(),
            templates: this.listAgentTemplates(),
            totals: {
                agents: agents.length,
                active: agents.filter((agent) => agent.state === 'active').length,
                paused: agents.filter((agent) => agent.state === 'paused').length,
                errored: agents.filter((agent) => agent.state === 'errored').length,
                swarms: swarms.size,
            },
            agents,
            recentEvents: [...this.runtimeEvents],
        };
    }

    async stop(): Promise<void> {
        if (!this.running && this.agents.size === 0) {
            return;
        }

        this.running = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        const agentIds = Array.from(this.agents.keys());
        for (const agentId of agentIds) {
            await this.despawnAgent(agentId, 'runtime_stop');
        }

        this.recordEvent('runtime_stopped', 'info', {
            remainingAgents: this.agents.size,
        });
    }

    private resolveTickTargets(agentIds?: string[]): ManagedAgent[] {
        if (!agentIds || agentIds.length === 0) {
            return Array.from(this.agents.values());
        }

        const targets: ManagedAgent[] = [];
        const seen = new Set<string>();
        for (const agentId of agentIds) {
            if (seen.has(agentId)) {
                continue;
            }
            seen.add(agentId);
            const managed = this.agents.get(agentId);
            if (managed) {
                targets.push(managed);
            }
        }
        return targets;
    }

    private async executeAgentTick(managed: ManagedAgent): Promise<AgentTickOutcome> {
        const baseOutcome: AgentTickOutcome = {
            agentId: managed.agentId,
            status: 'skipped',
            actionType: null,
            dispatchSuccess: null,
            feedback: null,
            error: null,
        };

        if (managed.state !== 'active') {
            return baseOutcome;
        }

        const env = this.environments.get(managed.environmentId);
        if (!env) {
            managed.errorCount += 1;
            managed.lastError = `Environment '${managed.environmentId}' not found`;
            managed.state = 'errored';
            return {
                ...baseOutcome,
                status: 'failed',
                error: managed.lastError,
            };
        }

        try {
            const perception = await env.getPerception(managed.agentId);
            const action = await managed.lifecycle.tick(perception);

            managed.lastTickAt = Date.now();
            managed.tickCount += 1;

            if (!action) {
                return {
                    ...baseOutcome,
                    status: 'idle',
                };
            }

            const dispatchResult = await env.dispatchAction(managed.agentId, action);
            managed.lastActionType = action.type;

            if (!dispatchResult.success) {
                managed.errorCount += 1;
                managed.lastError = dispatchResult.error ?? 'dispatch_failed';
                await this.persistExecutionMemory(managed, action, dispatchResult);
                await this.autoPauseOnRepeatedFailure(managed);
                return {
                    ...baseOutcome,
                    status: 'failed',
                    actionType: action.type,
                    dispatchSuccess: false,
                    feedback: dispatchResult.feedback,
                    error: managed.lastError,
                };
            }

            managed.actionCount += 1;
            managed.lastError = null;
            await this.persistExecutionMemory(managed, action, dispatchResult);

            return {
                ...baseOutcome,
                status: 'acted',
                actionType: action.type,
                dispatchSuccess: true,
                feedback: dispatchResult.feedback,
            };
        } catch (error: unknown) {
            managed.errorCount += 1;
            managed.lastError = this.errorToMessage(error);
            await this.autoPauseOnRepeatedFailure(managed);

            return {
                ...baseOutcome,
                status: 'failed',
                error: managed.lastError,
            };
        }
    }

    private async autoPauseOnRepeatedFailure(managed: ManagedAgent): Promise<void> {
        if (managed.errorCount < this.options.maxAgentErrorsBeforePause) {
            return;
        }

        if (managed.state !== 'active') {
            return;
        }

        managed.state = 'paused';
        await this.safeSignal(managed.lifecycle, 'PAUSE');
        this.recordEvent('agent_auto_paused', 'warn', {
            agentId: managed.agentId,
            errorCount: managed.errorCount,
            threshold: this.options.maxAgentErrorsBeforePause,
        });
    }

    private async persistExecutionMemory(
        managed: ManagedAgent,
        action: Action,
        dispatchResult: ActionResult
    ): Promise<void> {
        const fragment: MemoryFragment = {
            agentId: managed.agentId,
            content: JSON.stringify({
                environmentId: managed.environmentId,
                actionType: action.type,
                confidence: action.confidence,
                dispatch: {
                    success: dispatchResult.success,
                    feedback: dispatchResult.feedback,
                    error: dispatchResult.error ?? null,
                },
            }),
            tags: [
                'runtime',
                'action',
                `env:${managed.environmentId}`,
                dispatchResult.success ? 'success' : 'failure',
            ],
            created: Date.now(),
            importance: dispatchResult.success ? 0.4 : 0.75,
            type: 'episodic',
        };

        try {
            await this.memory.write(fragment);
        } catch (error: unknown) {
            this.recordEvent('memory_write_failed', 'warn', {
                agentId: managed.agentId,
                reason: this.errorToMessage(error),
            });
        }
    }

    private async runWithConcurrency<T>(
        items: T[],
        maxParallel: number,
        worker: (item: T) => Promise<void>
    ): Promise<void> {
        if (items.length === 0) {
            return;
        }

        const concurrency = Math.max(1, Math.min(maxParallel, items.length));
        let cursor = 0;

        const runners = Array.from({ length: concurrency }, async () => {
            while (cursor < items.length) {
                const currentIndex = cursor;
                cursor += 1;
                await worker(items[currentIndex]);
            }
        });

        await Promise.all(runners);
    }

    private toSnapshot(managed: ManagedAgent): ManagedAgentSnapshot {
        return {
            agentId: managed.agentId,
            environmentId: managed.environmentId,
            swarmId: managed.swarmId,
            parentAgentId: managed.parentAgentId,
            role: managed.role,
            state: managed.state,
            mountedAt: managed.mountedAt,
            lastTickAt: managed.lastTickAt,
            tickCount: managed.tickCount,
            actionCount: managed.actionCount,
            errorCount: managed.errorCount,
            lastError: managed.lastError,
            lastActionType: managed.lastActionType,
        };
    }

    private recordEvent(type: string, level: RuntimeEventLevel, details: Record<string, unknown>): void {
        this.runtimeEvents.push({
            type,
            level,
            timestamp: Date.now(),
            details,
        });

        while (this.runtimeEvents.length > this.options.maxRuntimeEvents) {
            this.runtimeEvents.shift();
        }
    }

    private async safeSignal(agent: AgentLifecycle, signal: RuntimeSignal): Promise<void> {
        try {
            await agent.onSignal(signal);
        } catch (error: unknown) {
            this.recordEvent('agent_signal_failed', 'warn', {
                signal,
                reason: this.errorToMessage(error),
            });
        }
    }

    private async safeUnmount(agent: AgentLifecycle): Promise<void> {
        try {
            await agent.onUnmount();
        } catch (error: unknown) {
            this.recordEvent('agent_unmount_failed', 'warn', {
                reason: this.errorToMessage(error),
            });
        }
    }

    private async safeExpel(env: EnvironmentHost, agentId: string, reason: string): Promise<void> {
        try {
            await env.expelAgent(agentId, reason);
        } catch (error: unknown) {
            this.recordEvent('environment_expel_failed', 'warn', {
                environmentId: env.id,
                agentId,
                reason: this.errorToMessage(error),
            });
        }
    }

    private errorToMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error';
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
}
