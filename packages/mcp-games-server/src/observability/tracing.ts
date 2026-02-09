import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './logger.js';

// Configure the SDK
const sdk = new NodeSDK({
    // resource: new Resource({
    //     [SemanticResourceAttributes.SERVICE_NAME]: 'mcp-games-server',
    //     [SemanticResourceAttributes.SERVICE_VERSION]: '0.1.0',
    // }),
    // For development, we use Console exporter. In production, this would be OTLP.
    traceExporter: new ConsoleSpanExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
});

export async function initTracing() {
    try {
        sdk.start();
        logger.info('OpenTelemetry SDK started');

        // Gracefully shut down the SDK on process exit
        process.on('SIGTERM', () => {
            sdk.shutdown()
                .then(() => logger.info('Tracing terminated'))
                .catch((error) => logger.error('Error terminating tracing', error))
                .finally(() => process.exit(0));
        });
    } catch (error) {
        logger.error({ err: error }, 'Error initializing tracing');
    }
}
