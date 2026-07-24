import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index';

describe('MCP Connector', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('reports health and readiness', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: 'healthy',
      service: 'mcp-connector',
    });

    expect((await fetch(`${baseUrl}/ready`)).status).toBe(200);
  });

  it('connects and disconnects an MCP server', async () => {
    const connect = await fetch(`${baseUrl}/api/mcp/connect/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serverUrl: 'http://games-server:3000',
        capabilities: ['tools'],
        metadata: { transport: 'stdio' },
      }),
    });
    expect(connect.status).toBe(201);

    const connections = await fetch(`${baseUrl}/api/mcp/connections`);
    expect(await connections.json()).toMatchObject({
      connections: expect.arrayContaining([
        expect.objectContaining({ id: 'games', status: 'connected' }),
      ]),
    });

    expect(
      (
        await fetch(`${baseUrl}/api/mcp/disconnect/games`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204);
  });

  it('validates semantic query input', async () => {
    const invalid = await fetch(`${baseUrl}/api/mcp/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server: 'games', query: '' }),
    });
    expect(invalid.status).toBe(400);

    const valid = await fetch(`${baseUrl}/api/mcp/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server: 'games', query: 'Suggest the next move' }),
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      result: { metadata: { source: 'games', cached: false } },
    });
  });
});
