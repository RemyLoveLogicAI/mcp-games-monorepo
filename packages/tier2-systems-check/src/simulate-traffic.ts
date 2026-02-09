import { TelemetryBus, TelemetryEvent } from '@omnigents/shared';

const bus = new TelemetryBus();

async function run() {
    console.log('Simulating traffic...');

    // Simulate heartbeats
    await bus.emit('tier0:telemetry', { service: 'mcp-games-server', event: 'heartbeat', level: 'INFO' });
    await bus.emit('tier0:telemetry', { service: 'tier1-watchdog', event: 'heartbeat', level: 'INFO' });

    // Simulate operations
    for (let i = 0; i < 10; i++) {
        await bus.emit('tier0:telemetry', {
            service: 'mcp-games-server',
            event: 'tool:call',
            tool: 'make_choice',
            level: 'INFO'
        });
        await new Promise(r => setTimeout(r, 100));
    }

    // Simulate error
    await bus.emit('tier0:telemetry', {
        service: 'mcp-games-server',
        event: 'error',
        error: 'Database connection failed',
        level: 'ERROR'
    });

    console.log('Traffic simulation complete. Run "omnigent status" to view.');
    process.exit(0);
}

run().catch(console.error);
