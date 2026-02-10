// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: FAILURE CLASSIFIER
// Classifies failures and suggests recovery strategies
// ═══════════════════════════════════════════════════════════════════════════

import {
    OperationTelemetry,
    FailureClassification,
    FailureType,
    Severity,
    RecoveryStrategy,
} from '@omnigents/shared';

/**
 * Classifies operation failures and recommends recovery strategies.
 * In production, this would use an LLM (Claude) for intelligent classification.
 * For Sprint 1, we use pattern-matching heuristics.
 */
export class FailureClassifier {

    /**
     * Classify a failed operation and suggest recovery strategies.
     */
    async classify(operation: OperationTelemetry): Promise<FailureClassification> {
        const error = operation.error;
        if (!error) {
            return this.unknownClassification('No error info available');
        }

        const failureType = this.detectFailureType(error.code, error.message);
        const severity = this.assessSeverity(failureType, operation);
        const strategies = this.getStrategies(failureType, operation);

        return {
            type: failureType,
            severity,
            rootCause: this.inferRootCause(failureType, error.message),
            confidence: this.calculateConfidence(failureType, error),
            strategies,
        };
    }

    private detectFailureType(code: string, message: string): FailureType {
        // Network errors
        if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) {
            return 'NETWORK';
        }

        // Timeout
        if (code === 'TIMEOUT' || message.toLowerCase().includes('timeout')) {
            return 'TIMEOUT';
        }

        // Memory
        if (code === 'ERR_MEMORY' || message.includes('heap') || message.includes('memory')) {
            return 'MEMORY';
        }

        // Rate limiting
        if (code === '429' || message.toLowerCase().includes('rate limit')) {
            return 'RATE_LIMITED';
        }

        // Dependency failure
        if (message.includes('ECONNREFUSED') || message.includes('service unavailable')) {
            return 'DEPENDENCY';
        }

        // Code errors (syntax, type, reference)
        if (['TypeError', 'ReferenceError', 'SyntaxError'].some(t => message.includes(t))) {
            return 'CODE_ERROR';
        }

        return 'UNKNOWN';
    }

    private assessSeverity(type: FailureType, operation: OperationTelemetry): Severity {
        // Critical operations always escalate
        if (operation.operationType.includes('auth') || operation.operationType.includes('payment')) {
            return 'CRITICAL';
        }

        switch (type) {
            case 'MEMORY':
                return 'CRITICAL';
            case 'DEPENDENCY':
            case 'NETWORK':
                return 'HIGH';
            case 'TIMEOUT':
            case 'RATE_LIMITED':
                return 'MEDIUM';
            case 'CODE_ERROR':
                return 'HIGH';
            default:
                return 'MEDIUM';
        }
    }

    private getStrategies(type: FailureType, operation: OperationTelemetry): RecoveryStrategy[] {
        const strategies: RecoveryStrategy[] = [];

        switch (type) {
            case 'TIMEOUT':
                strategies.push(
                    {
                        name: 'retry_with_backoff',
                        commands: [`retry:${operation.operationType}:exponential`],
                        timeout: 30000,
                        successProbability: 0.7,
                        sideEffects: ['Increased latency for this request'],
                        requiresApproval: false,
                    },
                    {
                        name: 'increase_timeout',
                        commands: [`config:timeout:${operation.operationType}:double`],
                        timeout: 5000,
                        successProbability: 0.5,
                        sideEffects: ['Higher timeout globally for this operation'],
                        requiresApproval: false,
                    }
                );
                break;

            case 'MEMORY':
                strategies.push(
                    {
                        name: 'force_gc',
                        commands: ['runtime:gc:force'],
                        timeout: 5000,
                        successProbability: 0.6,
                        sideEffects: ['Brief pause during GC'],
                        requiresApproval: false,
                    },
                    {
                        name: 'restart_service',
                        commands: [`service:restart:${operation.service}`],
                        timeout: 30000,
                        successProbability: 0.9,
                        sideEffects: ['Brief downtime', 'In-flight requests dropped'],
                        requiresApproval: true,
                    }
                );
                break;

            case 'NETWORK':
            case 'DEPENDENCY':
                strategies.push(
                    {
                        name: 'retry_with_backoff',
                        commands: [`retry:${operation.operationType}:exponential`],
                        timeout: 30000,
                        successProbability: 0.6,
                        sideEffects: [],
                        requiresApproval: false,
                    },
                    {
                        name: 'switch_to_fallback',
                        commands: [`fallback:${operation.service}:enable`],
                        timeout: 10000,
                        successProbability: 0.8,
                        sideEffects: ['Degraded functionality'],
                        requiresApproval: false,
                    },
                    {
                        name: 'restart_dependency',
                        commands: [`service:restart:${operation.service}`],
                        timeout: 60000,
                        successProbability: 0.7,
                        sideEffects: ['Brief downtime'],
                        requiresApproval: true,
                    }
                );
                break;

            case 'RATE_LIMITED':
                strategies.push(
                    {
                        name: 'wait_and_retry',
                        commands: [`wait:60000`, `retry:${operation.operationType}`],
                        timeout: 90000,
                        successProbability: 0.9,
                        sideEffects: ['Delayed response'],
                        requiresApproval: false,
                    },
                    {
                        name: 'reduce_concurrency',
                        commands: [`config:concurrency:${operation.service}:halve`],
                        timeout: 5000,
                        successProbability: 0.7,
                        sideEffects: ['Reduced throughput'],
                        requiresApproval: false,
                    }
                );
                break;

            case 'CODE_ERROR':
                strategies.push(
                    {
                        name: 'log_and_escalate',
                        commands: [`log:error:${operation.operationType}`],
                        timeout: 5000,
                        successProbability: 0.1,
                        sideEffects: [],
                        requiresApproval: false,
                    }
                );
                break;

            default:
                strategies.push(
                    {
                        name: 'retry_once',
                        commands: [`retry:${operation.operationType}:once`],
                        timeout: 15000,
                        successProbability: 0.3,
                        sideEffects: [],
                        requiresApproval: false,
                    }
                );
        }

        return strategies;
    }

    private inferRootCause(type: FailureType, message: string): string {
        switch (type) {
            case 'TIMEOUT':
                return `Operation exceeded time limit. Possible causes: slow downstream service, network congestion, large payload.`;
            case 'MEMORY':
                return `Memory pressure detected. Possible causes: memory leak, large dataset processing, insufficient heap allocation.`;
            case 'NETWORK':
                return `Network connectivity issue. Possible causes: DNS failure, service down, firewall blockage.`;
            case 'DEPENDENCY':
                return `Downstream dependency unavailable. The target service may be down or overloaded.`;
            case 'RATE_LIMITED':
                return `API rate limit exceeded. Need to reduce request frequency or increase quota.`;
            case 'CODE_ERROR':
                return `Application code error: ${message}`;
            default:
                return `Unknown failure: ${message}`;
        }
    }

    private calculateConfidence(type: FailureType, error: { code: string; message: string }): number {
        // Higher confidence for clear error codes
        if (['ECONNREFUSED', 'ETIMEDOUT', '429'].includes(error.code)) {
            return 0.95;
        }
        if (type !== 'UNKNOWN') {
            return 0.75;
        }
        return 0.3;
    }

    private unknownClassification(reason: string): FailureClassification {
        return {
            type: 'UNKNOWN',
            severity: 'MEDIUM',
            rootCause: reason,
            confidence: 0.1,
            strategies: [],
        };
    }
}
