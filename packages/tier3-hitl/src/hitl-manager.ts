// ═══════════════════════════════════════════════════════════════════════════
// TIER 3: HUMAN-IN-THE-LOOP MANAGER
// Absolute last resort — when Tier 0, 1, and 2 all fail,
// ask a human for a decision with full pre-analyzed context.
// ═══════════════════════════════════════════════════════════════════════════

import {
    telemetryBus,
    HitlRequest,
    HitlOption,
    CreateHitlParams,
    Tier1Escalation,
    generateId,
} from '@omnigents/shared';

import { NotificationSender, NotificationConfig } from './notification-sender.js';

export class HitlManager {
    private pendingRequests: Map<string, HitlRequest> = new Map();
    private sender: NotificationSender;
    private running = false;

    private readonly DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
    private readonly CHECK_INTERVAL_MS = 15000;   // Check timeouts every 15s

    constructor(notificationConfig?: NotificationConfig) {
        this.sender = new NotificationSender(notificationConfig);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════════

    start(): void {
        if (this.running) return;
        this.running = true;

        // Listen for Tier 1 escalations (watchdog couldn't fix it)
        telemetryBus.subscribe<Tier1Escalation>(
            'tier1:escalation',
            (data) => this.handleEscalation(data)
        );

        // Listen for direct HITL requests from Tier 2
        telemetryBus.subscribe<CreateHitlParams>(
            'tier3:hitl',
            (data) => this.createRequest(data)
        );

        // Periodically check for timed-out requests
        setInterval(() => this.checkTimeouts(), this.CHECK_INTERVAL_MS);

        console.log('[TIER3] HITL Manager started. Listening for escalations...');
    }

    stop(): void {
        this.running = false;
        console.log('[TIER3] HITL Manager stopped.');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ESCALATION HANDLING
    // ═══════════════════════════════════════════════════════════════════════════

    private async handleEscalation(escalation: Tier1Escalation): Promise<void> {
        console.log(`[TIER3] Received escalation for agent ${escalation.agentId}`);

        const options: HitlOption[] = [
            {
                id: 1,
                label: 'Retry Recovery',
                description: 'Reset recovery attempts and let Tier 1 try again.',
                action: 'RETRY',
            },
            {
                id: 2,
                label: 'Restart Service',
                description: `Force restart ${escalation.operation.service}.`,
                action: 'RESTART',
            },
            {
                id: 3,
                label: 'Disable Service',
                description: `Temporarily disable ${escalation.operation.service} and use fallbacks.`,
                action: 'DISABLE',
            },
            {
                id: 4,
                label: 'Acknowledge & Monitor',
                description: 'Acknowledge the issue and continue monitoring without action.',
                action: 'ACKNOWLEDGE',
            },
        ];

        await this.createRequest({
            priority: escalation.classification?.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            situation: `Service ${escalation.operation.service} failed on ${escalation.operation.operationType}`,
            aiAnalysis: escalation.classification?.rootCause || 'Unable to classify failure.',
            aiRecommendation: escalation.recommendation,
            options,
            defaultOption: 4, // Auto-acknowledge on timeout
            triggerData: escalation,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REQUEST MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    async createRequest(params: CreateHitlParams): Promise<HitlRequest> {
        const request: HitlRequest = {
            id: generateId(12),
            priority: params.priority,
            situation: params.situation,
            aiAnalysis: params.aiAnalysis,
            aiRecommendation: params.aiRecommendation,
            options: params.options,
            defaultOption: params.defaultOption,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.DEFAULT_TIMEOUT_MS).toISOString(),
            triggerData: params.triggerData,
        };

        this.pendingRequests.set(request.id, request);
        console.log(`[TIER3] Created HITL request ${request.id} (priority: ${request.priority})`);

        // Send notification
        await this.sender.send(request);

        return request;
    }

    /**
     * Respond to a pending HITL request (called by human via CLI, Telegram, or API)
     */
    respond(requestId: string, optionId: number, respondedBy: string = 'human'): HitlRequest | null {
        const request = this.pendingRequests.get(requestId);
        if (!request) {
            console.warn(`[TIER3] Request ${requestId} not found or already handled.`);
            return null;
        }

        const option = request.options.find((o) => o.id === optionId);
        if (!option) {
            console.warn(`[TIER3] Invalid option ${optionId} for request ${requestId}.`);
            return null;
        }

        request.selectedOption = optionId;
        request.respondedBy = respondedBy;
        request.respondedAt = new Date().toISOString();
        request.autoSelected = false;

        this.pendingRequests.delete(requestId);
        console.log(`[TIER3] Request ${requestId} resolved: option ${optionId} (${option.label}) by ${respondedBy}`);

        // Execute the selected action
        this.executeAction(option.action, request);

        return request;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIMEOUT & AUTO-SELECT
    // ═══════════════════════════════════════════════════════════════════════════

    private checkTimeouts(): void {
        const now = new Date();

        for (const [id, request] of this.pendingRequests.entries()) {
            const expiresAt = new Date(request.expiresAt);

            if (now >= expiresAt) {
                console.log(`[TIER3] Request ${id} timed out.`);

                if (request.defaultOption !== undefined) {
                    // Auto-select the default option
                    request.selectedOption = request.defaultOption;
                    request.respondedAt = now.toISOString();
                    request.autoSelected = true;
                    request.respondedBy = 'auto-timeout';

                    const option = request.options.find((o) => o.id === request.defaultOption);
                    console.log(`[TIER3] Auto-selected option ${request.defaultOption}: ${option?.label || 'unknown'}`);

                    if (option) {
                        this.executeAction(option.action, request);
                    }
                } else {
                    console.log(`[TIER3] No default option. Request ${id} expired without action.`);
                }

                this.pendingRequests.delete(id);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTION EXECUTION
    // ═══════════════════════════════════════════════════════════════════════════

    private async executeAction(action: string, request: HitlRequest): Promise<void> {
        console.log(`[TIER3] Executing action: ${action}`);

        switch (action) {
            case 'RETRY':
                // Signal Tier 1 to reset recovery attempts
                await telemetryBus.emit('tier1:recovery', {
                    action: 'reset_attempts',
                    requestId: request.id,
                    timestamp: Date.now(),
                });
                break;

            case 'RESTART':
                // Signal service restart via Tier 1
                await telemetryBus.emit('tier1:recovery', {
                    action: 'force_restart',
                    requestId: request.id,
                    timestamp: Date.now(),
                });
                break;

            case 'DISABLE':
                // Signal service disable
                await telemetryBus.emit('tier2:status', {
                    action: 'disable_service',
                    requestId: request.id,
                    timestamp: Date.now(),
                });
                break;

            case 'ACKNOWLEDGE':
                console.log(`[TIER3] Issue acknowledged. Continuing to monitor.`);
                break;

            default:
                console.warn(`[TIER3] Unknown action: ${action}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    getPendingRequests(): HitlRequest[] {
        return Array.from(this.pendingRequests.values());
    }

    getPendingCount(): number {
        return this.pendingRequests.size;
    }

    getOldestPending(): HitlRequest | null {
        let oldest: HitlRequest | null = null;
        for (const request of this.pendingRequests.values()) {
            if (!oldest || request.createdAt < oldest.createdAt) {
                oldest = request;
            }
        }
        return oldest;
    }
}
