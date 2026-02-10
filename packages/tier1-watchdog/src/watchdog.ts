// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: AI WATCHDOG
// Primary healing loop — consumes Tier 0 telemetry, classifies failures,
// executes recovery strategies, and escalates to Tier 2 when exhausted.
// ═══════════════════════════════════════════════════════════════════════════

import {
    telemetryBus,
    OperationTelemetry,
    Tier0HealthEvent,
    RecoveryAttempt,
    RecoveryStrategy,
    Tier1Escalation,
    sleep,
} from '@omnigents/shared';

import { FailureClassifier } from './failure-classifier.js';
import { RecoveryExecutor } from './recovery-executor.js';

interface Tier0TelemetryPayload {
    agentId: string;
    agentState: unknown;
    operation: OperationTelemetry;
}

export class Tier1Watchdog {
    private classifier: FailureClassifier;
    private executor: RecoveryExecutor;
    private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map();
    private systemContext: Map<string, unknown> = new Map();
    private running = false;

    private readonly MAX_ATTEMPTS = 5;
    private readonly COOLDOWN_MS = 30000;
    private readonly HISTORY_RETENTION_MS = 300000; // 5 minutes

    constructor() {
        this.classifier = new FailureClassifier();
        this.executor = new RecoveryExecutor();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════════

    start(): void {
        if (this.running) return;
        this.running = true;

        // Listen to Tier 0 telemetry
        telemetryBus.subscribe<Tier0TelemetryPayload>(
            'tier0:telemetry',
            (data) => this.processTelemetry(data)
        );

        // Listen to Tier 0 health events
        telemetryBus.subscribe<Tier0HealthEvent>(
            'tier0:health',
            (data) => this.processHealthEvent(data)
        );

        // Listen to Tier 2 for cross-service context
        telemetryBus.subscribe(
            'tier2:status',
            (data) => this.updateSystemContext(data as Record<string, unknown>)
        );

        // Periodic cleanup of old recovery history
        setInterval(() => this.cleanupHistory(), 60000);

        console.log('[TIER1] Watchdog started. Listening for telemetry...');
    }

    stop(): void {
        this.running = false;
        console.log('[TIER1] Watchdog stopped.');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIMARY HEALING LOOP
    // ═══════════════════════════════════════════════════════════════════════════

    private async processTelemetry(data: Tier0TelemetryPayload): Promise<void> {
        if (data.operation.status !== 'failure') return;

        console.log(
            `[TIER1] Failure detected: ${data.operation.operationType} — ${data.operation.error?.message}`
        );

        await this.handleFailure(data.agentId, data.operation);
    }

    private async processHealthEvent(event: Tier0HealthEvent): Promise<void> {
        if (event.status === 'OK') return;

        console.log(`[TIER1] Health event: ${event.eventType} (${event.status})`);

        if (event.data?.suggestedAction === 'TIER1_INTERVENTION') {
            await this.handleDegradedAgent(event.agentId, event);
        }
    }

    private async handleFailure(
        agentId: string,
        operation: OperationTelemetry
    ): Promise<void> {
        const failureKey = `${agentId}:${operation.operationType}`;

        // Check if recovery is already in progress
        const recentAttempts = this.getRecentAttempts(failureKey);
        if (recentAttempts.some((a) => a.status === 'in_progress')) {
            console.log(`[TIER1] Recovery already in progress for ${failureKey}`);
            return;
        }

        // Check max attempts
        if (recentAttempts.length >= this.MAX_ATTEMPTS) {
            console.log(`[TIER1] Max recovery attempts reached for ${failureKey}. Escalating to Tier 2.`);
            await this.escalateToTier2(agentId, operation, recentAttempts);
            return;
        }

        // Classify the failure
        const classification = await this.classifier.classify(operation);
        console.log(
            `[TIER1] Classification: ${classification.type} (severity: ${classification.severity}, confidence: ${classification.confidence})`
        );

        // Select an untried strategy
        const triedStrategies = new Set(recentAttempts.map((a) => a.strategy));
        const strategy = classification.strategies.find(
            (s) => !triedStrategies.has(s.name) && !s.requiresApproval
        );

        if (!strategy) {
            // Check if there are approval-required strategies
            const approvalStrategy = classification.strategies.find(
                (s) => !triedStrategies.has(s.name) && s.requiresApproval
            );

            if (approvalStrategy) {
                console.log(`[TIER1] Remaining strategy requires approval: ${approvalStrategy.name}. Escalating.`);
                await this.escalateToTier2(agentId, operation, recentAttempts, classification);
            } else {
                console.log(`[TIER1] No untried strategies. Escalating to Tier 2.`);
                await this.escalateToTier2(agentId, operation, recentAttempts, classification);
            }
            return;
        }

        // Execute recovery
        await this.executeRecovery(failureKey, agentId, strategy, operation);
    }

    private async handleDegradedAgent(
        agentId: string,
        event: Tier0HealthEvent
    ): Promise<void> {
        console.log(`[TIER1] Agent ${agentId} is degraded (health: ${event.healthScore}). Monitoring...`);

        // For critical health, attempt a restart
        if (event.status === 'CRITICAL') {
            const failureKey = `${agentId}:health_critical`;
            const recentAttempts = this.getRecentAttempts(failureKey);

            if (recentAttempts.length < 2) {
                const strategy: RecoveryStrategy = {
                    name: 'health_restart',
                    commands: [`service:restart:${event.service}`],
                    timeout: 30000,
                    successProbability: 0.8,
                    sideEffects: ['Brief downtime'],
                    requiresApproval: false,
                };

                await this.executeRecovery(failureKey, agentId, strategy, {
                    operationId: 'health-check',
                    operationType: 'health_degraded',
                    service: event.service,
                    startTime: Date.now(),
                    status: 'failure',
                    context: { traceId: `health-${Date.now()}` },
                    error: {
                        message: `Health score critical: ${event.healthScore}`,
                        code: 'HEALTH_CRITICAL',
                        recoverable: true,
                    },
                });
            } else {
                await this.escalateToTier2(agentId, {
                    operationId: 'health-check',
                    operationType: 'health_degraded',
                    service: event.service,
                    startTime: Date.now(),
                    status: 'failure',
                    context: { traceId: `health-${Date.now()}` },
                }, recentAttempts);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECOVERY EXECUTION
    // ═══════════════════════════════════════════════════════════════════════════

    private async executeRecovery(
        failureKey: string,
        agentId: string,
        strategy: RecoveryStrategy,
        operation: OperationTelemetry
    ): Promise<void> {
        console.log(`[TIER1] Executing recovery: ${strategy.name}`);

        const attempt: RecoveryAttempt = {
            strategy: strategy.name,
            startTime: Date.now(),
            status: 'in_progress',
        };

        this.recordAttempt(failureKey, attempt);

        try {
            // Execute all commands in the strategy
            const { results, allSucceeded } = await this.executor.executeSequence(
                strategy.commands,
                strategy.timeout
            );

            // Wait for stabilization
            await sleep(3000);

            if (allSucceeded) {
                attempt.status = 'success';
                attempt.endTime = Date.now();
                attempt.result = `Recovery successful via ${strategy.name}`;
                console.log(`[TIER1] ✅ Recovery successful: ${strategy.name}`);

                // Report success to Tier 2
                await this.reportRecovery(agentId, strategy, attempt, 'success');
            } else {
                throw new Error(
                    `Command failures: ${results.filter((r) => !r.success).map((r) => r.error).join(', ')}`
                );
            }
        } catch (err: any) {
            attempt.status = 'failed';
            attempt.endTime = Date.now();
            attempt.error = err.message;
            console.log(`[TIER1] ❌ Recovery failed: ${strategy.name} — ${err.message}`);

            // Report failure to Tier 2
            await this.reportRecovery(agentId, strategy, attempt, 'failed');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ESCALATION & REPORTING
    // ═══════════════════════════════════════════════════════════════════════════

    private async escalateToTier2(
        agentId: string,
        operation: OperationTelemetry,
        attempts: RecoveryAttempt[],
        classification?: { type: string; rootCause: string; confidence: number }
    ): Promise<void> {
        const escalation: Tier1Escalation = {
            agentId,
            operation,
            classification: classification as any,
            recoveryAttempts: attempts,
            recommendation: this.generateRecommendation(attempts, classification),
            timestamp: Date.now(),
        };

        try {
            await telemetryBus.emit('tier1:escalation', escalation);
            console.log(`[TIER1] ⬆ Escalated to Tier 2: ${agentId}:${operation.operationType}`);
        } catch (err) {
            console.error(`[TIER1] Failed to escalate:`, err);
        }
    }

    private async reportRecovery(
        agentId: string,
        strategy: RecoveryStrategy,
        attempt: RecoveryAttempt,
        status: 'success' | 'failed'
    ): Promise<void> {
        try {
            await telemetryBus.emit('tier1:recovery', {
                agentId,
                strategy: strategy.name,
                status,
                attempt,
                timestamp: Date.now(),
            });
        } catch (err) {
            console.error(`[TIER1] Failed to report recovery:`, err);
        }
    }

    private generateRecommendation(
        attempts: RecoveryAttempt[],
        classification?: { type: string; rootCause: string; confidence: number }
    ): string {
        const failedStrategies = attempts.map((a) => a.strategy).join(', ');

        if (classification) {
            return `Failure type: ${classification.type}. Root cause: ${classification.rootCause}. ` +
                `Attempted strategies: ${failedStrategies}. ` +
                `Recommend: Manual investigation or coordinated multi-service recovery.`;
        }

        return `Exhausted ${attempts.length} recovery strategies (${failedStrategies}). ` +
            `Recommend: Human investigation.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    private getRecentAttempts(failureKey: string): RecoveryAttempt[] {
        const attempts = this.recoveryHistory.get(failureKey) || [];
        const cutoff = Date.now() - this.COOLDOWN_MS;
        return attempts.filter((a) => a.startTime > cutoff);
    }

    private recordAttempt(failureKey: string, attempt: RecoveryAttempt): void {
        const attempts = this.recoveryHistory.get(failureKey) || [];
        attempts.push(attempt);
        this.recoveryHistory.set(failureKey, attempts);
    }

    private updateSystemContext(data: Record<string, unknown>): void {
        // Store cross-service context from Tier 2 for smarter decisions
        if (data && typeof data === 'object' && 'service' in data) {
            this.systemContext.set(data.service as string, data);
        }
    }

    private cleanupHistory(): void {
        const cutoff = Date.now() - this.HISTORY_RETENTION_MS;

        for (const [key, attempts] of this.recoveryHistory.entries()) {
            const recent = attempts.filter((a) => a.startTime > cutoff);
            if (recent.length === 0) {
                this.recoveryHistory.delete(key);
            } else {
                this.recoveryHistory.set(key, recent);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    getRecoveryStats(): {
        totalAttempts: number;
        successCount: number;
        failureCount: number;
        activeRecoveries: number;
    } {
        let totalAttempts = 0;
        let successCount = 0;
        let failureCount = 0;
        let activeRecoveries = 0;

        for (const attempts of this.recoveryHistory.values()) {
            for (const attempt of attempts) {
                totalAttempts++;
                if (attempt.status === 'success') successCount++;
                if (attempt.status === 'failed') failureCount++;
                if (attempt.status === 'in_progress') activeRecoveries++;
            }
        }

        return { totalAttempts, successCount, failureCount, activeRecoveries };
    }
}
