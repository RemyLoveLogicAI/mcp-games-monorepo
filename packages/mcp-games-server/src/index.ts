import { startServer, stopServer } from "./mcp/server.js";
import { startHealthServer } from "./http/health-server.js";
import { telemetry } from "./observability/index.js";
import { Telemetry, logger, telemetryBus } from "@omnigents/shared";
import type { Server as HttpServer } from "node:http";

const tracing = new Telemetry({
    serviceName: "mcp-games-server",
    serviceVersion: "0.1.0",
});

async function main() {
    let mcpReady = false;
    let shuttingDown = false;
    let healthServer: HttpServer | null = null;
    const healthPort = Number.parseInt(process.env.HEALTH_PORT ?? '', 10);

    try {
        await tracing.start();
        if (Number.isInteger(healthPort) && healthPort >= 0 && healthPort <= 65535) {
            healthServer = await startHealthServer({
                port: healthPort,
                host: process.env.HEALTH_HOST,
                isReady: () => mcpReady,
            });
            const address = healthServer.address();
            const listeningPort = typeof address === 'object' && address ? address.port : healthPort;
            logger.info({ port: listeningPort }, "Health server listening");
        }

        const shutdown = async (signal: NodeJS.Signals) => {
            if (shuttingDown) return;
            shuttingDown = true;
            mcpReady = false;
            logger.info({ signal }, "Graceful shutdown started");
            const forceExit = setTimeout(() => process.exit(1), 5000);
            forceExit.unref();
            await Promise.race([
                Promise.allSettled([
                    stopServer(),
                    tracing.shutdown(),
                    telemetryBus.stop(),
                    healthServer
                        ? new Promise<void>((resolve) => healthServer?.close(() => resolve()))
                        : Promise.resolve(),
                ]),
                new Promise<void>((resolve) => setTimeout(resolve, 2000)),
            ]);
            clearTimeout(forceExit);
            process.exit(0);
        };
        process.once("SIGINT", () => void shutdown("SIGINT"));
        process.once("SIGTERM", () => void shutdown("SIGTERM"));

        await startServer();
        mcpReady = true;
    } catch (error) {
        logger.error({ err: error }, "Server fatal error");
        telemetry.emit('server:fatal', { error: error instanceof Error ? error.message : String(error) }, 'ERROR');
        process.exit(1);
    }
}

main();
