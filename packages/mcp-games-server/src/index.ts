import { startServer } from "./mcp/server.js";
import { telemetry } from "./observability/index.js";
import { initTracing } from "./observability/tracing.js";

async function main() {
    try {
        await initTracing();
        await startServer();
    } catch (error) {
        telemetry.emit('server:fatal', { error: error instanceof Error ? error.message : String(error) }, 'ERROR');
        process.exit(1);
    }
}

main();
