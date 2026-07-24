import type { AddressInfo } from 'node:net';
import { startHealthServer } from '../health-server.js';

describe('health server', () => {
  it('separates liveness from MCP readiness', async () => {
    let ready = false;
    const server = await startHealthServer({ port: 0, host: '127.0.0.1', isReady: () => ready });
    const { port } = server.address() as AddressInfo;

    try {
      const liveResponse = await fetch(`http://127.0.0.1:${port}/health`);
      expect(liveResponse.status).toBe(200);
      expect(await liveResponse.json()).toMatchObject({
        service: 'mcp-games-server',
        status: 'healthy',
        transport: 'stdio',
      });

      const startingResponse = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(startingResponse.status).toBe(503);

      ready = true;
      const readyResponse = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(readyResponse.status).toBe(200);
      expect(await readyResponse.json()).toMatchObject({ status: 'ready' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
