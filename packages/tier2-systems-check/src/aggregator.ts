import { TelemetryBus, TelemetryEvent, SystemsStatus, ServiceStatus } from '@omnigents/shared';

export class StatusAggregator {
    private services = new Map<string, ServiceStatus>();
    private bus: TelemetryBus;

    constructor(redisUrl?: string) {
        this.bus = new TelemetryBus(redisUrl);
    }

    async start() {
        // Subscribe to telemetry stream
        // In a real CLI, we might use a dedicated consumer group or just listen as a simple subscriber
        // For CLI "snapshot", we might query latest state from a persistent store, 
        // but for "watch" mode, we subscribe.
        // For Sprint 2, let's implement a listener that updates local state.

        await this.bus.subscribe('tier0:telemetry', (event) => {
            this.processEvent(event as TelemetryEvent<any>);
        });

        await this.bus.subscribe('tier0:health', (event) => {
            this.processEvent(event as TelemetryEvent<any>);
        });
    }

    private processEvent(event: TelemetryEvent<any>) {
        // Infer service name from event data or metadata if available
        // Currently TelemetryEvent structure is generic. 
        // We might need to enforce a 'service' field in the data payload or look at the event type.
        // Let's assume the payload has 'service' field for now, as seen in Tier 1 emitter.

        const data = event.data as Record<string, any>;
        const serviceName = data.service || 'unknown-service';

        let state = this.services.get(serviceName);
        if (!state) {
            state = {
                name: serviceName,
                status: 'OK',
                uptime: '0s', // Todo: calculate
                lastCheck: new Date().toISOString(),
                metrics: {
                    errorRate: 0,
                    throughput: 0
                },
                activeIssues: []
            };
            this.services.set(serviceName, state);
        }

        state.lastCheck = new Date(event.timestamp).toISOString();

        // Simple heuristic for status
        if (event.stream === 'tier0:telemetry') {
            const eventName = data.event || '';
            state.metrics.throughput = (state.metrics.throughput || 0) + 1;

            if (eventName === 'error' || eventName.includes('error') || (data.level && data.level === 'ERROR')) {
                state.metrics.errorRate = (state.metrics.errorRate || 0) + 1;
                state.status = 'DEGRADED';
                const issue = typeof data.error === 'string' ? data.error : JSON.stringify(data.error) || 'Unknown error';
                if (!state.activeIssues.includes(issue)) {
                    state.activeIssues.push(issue);
                    // Keep only last 5 issues
                    if (state.activeIssues.length > 5) state.activeIssues.shift();
                }
            }
        }
    }

    getSystemStatus(): SystemsStatus {
        const services = Array.from(this.services.values());

        // Check for stale heartbeats (30s timeout)
        const now = Date.now();
        services.forEach(s => {
            const last = new Date(s.lastCheck).getTime();
            if (now - last > 30000) {
                s.status = 'CRITICAL';
                if (!s.activeIssues.includes('Offline / No Heartbeat')) {
                    s.activeIssues.push('Offline / No Heartbeat');
                }
            }
        });

        // Determine overall health
        let overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
        if (services.some(s => s.status === 'CRITICAL')) overallHealth = 'CRITICAL';
        else if (services.some(s => s.status === 'DEGRADED')) overallHealth = 'DEGRADED';

        return {
            timestamp: new Date().toISOString(),
            overallHealth,
            services,
            watchdogStatus: { // Mock for Sprint 2
                activeRecoveries: 0,
                successRate24h: 100,
                lastAction: null,
                lastActionTime: null
            },
            hitlQueue: { // Mock for Sprint 2
                pending: 0,
                oldest: null
            },
            keyMetrics: {
                requestsPerMinute: services.reduce((acc, s) => acc + (s.metrics.throughput || 0), 0), // Rough approx
                errorRate: services.reduce((acc, s) => acc + (s.metrics.errorRate || 0), 0),
                p99Latency: 0,
                activeUsers: 0
            }
        };
    }
}
