import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isMcpStdio = process.env.MCP_STDIO === '1';

const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  transport:
    !isProduction && !isMcpStdio
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
};

// MCP reserves stdout for JSON-RPC frames. In stdio mode, operational logs
// must go to stderr or they corrupt the protocol stream.
export const logger = isMcpStdio ? pino(loggerOptions, pino.destination(2)) : pino(loggerOptions);

export type Logger = typeof logger;

export function createLogger(name: string, meta: Record<string, unknown> = {}): Logger {
  return logger.child({ name, ...meta });
}
