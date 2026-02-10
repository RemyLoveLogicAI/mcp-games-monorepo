import { telemetryBus, TelemetryEvent } from '@omnigents/shared';
import { logger } from '@omnigents/shared';
import { trace, context } from '@opentelemetry/api';

export class Tier1Emitter {
    constructor(private serviceName: string = 'mcp-games-server') { }

    emit(
        event: string,
        payload: Record<string, unknown>,
        level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO'
    ) {
        const span = trace.getSpan(context.active());
        const traceId = span?.spanContext().traceId || 'no-trace';
        const requestId = 'req-' + Date.now(); // TODO: get from context storage

        // 1. Log locally (Structured)
        logger[level.toLowerCase() as 'info']({
            event,
            traceId,
            requestId,
            ...payload
        }, event);

        // 2. Emit to shared bus (Inter-process)
        // We strictly type the stream based on shared types, defaulting to tier0:telemetry for general events
        telemetryBus.emit('tier0:telemetry', {
            service: this.serviceName,
            event,
            level,
            traceId,
            requestId,
            payload,
            health: { status: 'OK' } // Default, override if needed
        });
    }
}

export const telemetry = new Tier1Emitter();
