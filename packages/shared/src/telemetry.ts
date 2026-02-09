import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './logger.js';

export interface TelemetryConfig {
    serviceName: string;
    serviceVersion: string;
}

export class Telemetry {
    private sdk: NodeSDK | null = null;
    private serviceName: string;

    constructor(config: TelemetryConfig) {
        this.serviceName = config.serviceName;

        this.sdk = new NodeSDK({
            resource: new Resource({
                [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
                [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
            }),
            // For development, we use Console exporter. In production, this would be OTLP.
            traceExporter: new ConsoleSpanExporter(),
            instrumentations: [getNodeAutoInstrumentations()],
        });
    }

    public async start(): Promise<void> {
        if (!this.sdk) return;

        try {
            this.sdk.start();
            logger.info(`OpenTelemetry SDK started for ${this.serviceName}`);

            // Gracefully shut down the SDK on process exit
            process.on('SIGTERM', () => {
                this.shutdown();
            });
            process.on('SIGINT', () => {
                this.shutdown();
            });

        } catch (error) {
            logger.error({ err: error }, 'Error initializing tracing');
        }
    }

    public async shutdown(): Promise<void> {
        if (!this.sdk) return;

        try {
            await this.sdk.shutdown();
            logger.info('Tracing terminated');
        } catch (error) {
            logger.error('Error terminating tracing', error);
        }
    }
}
