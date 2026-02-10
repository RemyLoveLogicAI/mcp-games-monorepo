import { startServer } from "./mcp/server.js";
import { telemetry } from "./observability/index.js";
import { Telemetry, logger } from "@omnigents/shared";

const tracing = new Telemetry({
    serviceName: "mcp-games-server",
    serviceVersion: "0.1.0",
});

async function main() {
    try {
        await tracing.start();
        await startServer();
    } catch (error) {
        logger.error({ err: error }, "Server fatal error");
        telemetry.emit('server:fatal', { error: error instanceof Error ? error.message : String(error) }, 'ERROR');
        process.exit(1);
    }
}

main();
