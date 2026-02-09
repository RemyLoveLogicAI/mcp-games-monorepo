import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    base: {
        env: process.env.NODE_ENV,
    },
});

export type Logger = typeof logger;

export function createLogger(name: string, meta: Record<string, any> = {}): Logger {
    return logger.child({ name, ...meta });
}
