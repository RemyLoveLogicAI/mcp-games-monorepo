import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MCPClient } from 'mcp-sdk';
import { createApp } from '../index';
import type { GamesRuntime, GamesRuntimeStatus } from '../games-bridge';

class FakeGamesRuntime implements GamesRuntime {
  private status: GamesRuntimeStatus = 'disconnected';
  failure: Error | null = null;
  delayMs = 0;

  private async beforeCall(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failure) throw this.failure;
  }

  getStatus(): GamesRuntimeStatus {
    return this.status;
  }

  async connect(): Promise<Record<string, unknown>> {
    await this.beforeCall();
    this.status = 'connected';
    return {
      status: 'OK',
      game: { id: 'morning-decision', title: 'The Morning Decision', ready: true },
    };
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  async health(): Promise<Record<string, unknown>> {
    await this.beforeCall();
    this.status = 'connected';
    return {
      status: 'OK',
      game: { id: 'morning-decision', title: 'The Morning Decision', ready: true },
    };
  }

  async listCapabilities(): Promise<Array<Record<string, unknown>>> {
    await this.beforeCall();
    return [
      { name: 'health_check' },
      { name: 'load_game' },
      { name: 'start_game' },
      { name: 'make_choice' },
      { name: 'plan_realtime_mesh' },
    ];
  }

  async loadGame(gamePath: string): Promise<Record<string, unknown>> {
    await this.beforeCall();
    return { message: `Loaded ${gamePath}` };
  }

  async startSession(playerId: string): Promise<Record<string, unknown>> {
    await this.beforeCall();
    return {
      sessionId: `session-${playerId}`,
      gameId: 'morning-decision',
      sceneId: 'wake-up',
      sceneTitle: 'First move',
      narrative: 'Choose a deliberate start.',
      choices: [{ id: 'begin', text: 'Begin' }],
      completed: false,
    };
  }

  async makeChoice(sessionId: string, choiceId: string): Promise<Record<string, unknown>> {
    await this.beforeCall();
    return {
      sessionId,
      gameId: 'morning-decision',
      sceneId: 'complete',
      sceneTitle: 'In motion',
      narrative: `Executed ${choiceId}.`,
      choices: [],
      completed: true,
    };
  }

  async planRealtimeMesh(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.beforeCall();
    return { sessionId: request.sessionId, status: 'ready' };
  }
}

describe('MCP Connector', () => {
  let server: Server;
  let baseUrl: string;
  let gamesRuntime: FakeGamesRuntime;

  beforeAll(async () => {
    gamesRuntime = new FakeGamesRuntime();
    server = await new Promise<Server>((resolve) => {
      const listener = createApp(new MCPClient(), gamesRuntime, {
        gamesTimeoutMs: 10,
      }).listen(0, '127.0.0.1', () => resolve(listener));
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
      body: JSON.stringify({ capabilities: ['tools'] }),
    });
    expect(connect.status).toBe(201);
    expect(await connect.json()).toMatchObject({
      connection: {
        id: 'games',
        status: 'connected',
        transport: 'stdio',
        capabilities: [
          'health_check',
          'load_game',
          'start_game',
          'make_choice',
          'plan_realtime_mesh',
        ],
      },
    });

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

  it('reports live games health with honest provenance', async () => {
    const response = await fetch(`${baseUrl}/api/games/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'available',
      server: {
        status: 'OK',
        game: { id: 'morning-decision', ready: true },
      },
      provenance: {
        source: 'local-process',
        transport: 'stdio',
        checkedBy: 'health_check',
        persistence: 'none',
      },
    });
  });

  it('discovers actual MCP tool capabilities', async () => {
    const response = await fetch(`${baseUrl}/api/games/capabilities`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tools: expect.arrayContaining([
        { name: 'health_check' },
        { name: 'load_game' },
        { name: 'start_game' },
        { name: 'make_choice' },
        { name: 'plan_realtime_mesh' },
      ]),
      provenance: {
        checkedBy: 'tools/list',
        persistence: 'none',
      },
    });
  });

  it('loads allowlisted games and plans a realtime mesh with receipts', async () => {
    const load = await fetch(`${baseUrl}/api/games/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'morning-decision' }),
    });
    expect(load.status).toBe(200);
    expect(await load.json()).toMatchObject({
      receipt: {
        tool: 'load_game',
        status: 'completed',
        payloadSummary: { gameId: 'morning-decision' },
        persistence: 'response-only',
      },
    });

    const mesh = await fetch(`${baseUrl}/api/games/mesh/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'mesh-1' }),
    });
    expect(mesh.status).toBe(200);
    expect(await mesh.json()).toMatchObject({
      blueprint: { sessionId: 'mesh-1', status: 'ready' },
      receipt: {
        tool: 'plan_realtime_mesh',
        payloadSummary: { sessionId: 'mesh-1' },
        persistence: 'response-only',
      },
    });
  });

  it('executes a session and choice with auditable response-only receipts', async () => {
    const start = await fetch(`${baseUrl}/api/games/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: 'local-player' }),
    });
    expect(start.status).toBe(201);
    const startBody = (await start.json()) as {
      session: { sessionId: string };
      receipt: {
        id: string;
        startedAt: string;
        completedAt: string;
        durationMs: number;
      };
    };
    expect(startBody).toMatchObject({
      session: {
        sessionId: 'session-local-player',
        gameId: 'morning-decision',
        sceneId: 'wake-up',
      },
      receipt: {
        source: 'mcp-games-server',
        transport: 'stdio',
        tool: 'start_game',
        status: 'completed',
        payloadSummary: { playerId: 'local-player' },
        resultSummary: {
          sessionId: 'session-local-player',
          gameId: 'morning-decision',
          sceneId: 'wake-up',
        },
        persistence: 'response-only',
      },
    });
    expect(startBody.receipt.id).toMatch(/^exec_[0-9a-f-]+$/);
    expect(new Date(startBody.receipt.startedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(startBody.receipt.completedAt).toString()).not.toBe('Invalid Date');
    expect(startBody.receipt.durationMs).toEqual(expect.any(Number));

    const choice = await fetch(
      `${baseUrl}/api/games/sessions/${startBody.session.sessionId}/choices`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choiceId: 'begin' }),
      },
    );
    expect(choice.status).toBe(200);
    expect(await choice.json()).toMatchObject({
      turn: {
        sessionId: 'session-local-player',
        sceneId: 'complete',
        completed: true,
      },
      receipt: {
        tool: 'make_choice',
        status: 'completed',
        payloadSummary: { sessionId: 'session-local-player', choiceId: 'begin' },
        persistence: 'response-only',
      },
    });
  });

  it('validates semantic query input and does not fake a games result', async () => {
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
    expect(valid.status).toBe(422);
    expect(await valid.json()).toMatchObject({
      error: 'unsupported_operation',
      endpoints: {
        start: 'POST /api/games/sessions',
        choice: 'POST /api/games/sessions/:sessionId/choices',
      },
    });
  });

  it('rejects invalid typed game payloads', async () => {
    const session = await fetch(`${baseUrl}/api/games/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: '' }),
    });
    expect(session.status).toBe(400);

    const choice = await fetch(`${baseUrl}/api/games/sessions/session-1/choices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ choiceId: '' }),
    });
    expect(choice.status).toBe(400);
  });

  it('surfaces upstream failures without fabricating a result', async () => {
    gamesRuntime.failure = new Error('upstream process exited');
    const response = await fetch(`${baseUrl}/api/games/health`);
    gamesRuntime.failure = null;

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'games_unavailable',
      message: 'upstream process exited',
    });
  });

  it('returns a bounded timeout when the MCP process stalls', async () => {
    gamesRuntime.delayMs = 30;
    const response = await fetch(`${baseUrl}/api/games/health`);
    gamesRuntime.delayMs = 0;

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      error: 'games_timeout',
      message: expect.stringContaining('did not respond within 10ms'),
    });
  });
});
