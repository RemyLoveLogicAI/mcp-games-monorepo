import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export type GamesRuntimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GamesRuntime {
  getStatus(): GamesRuntimeStatus;
  connect(): Promise<Record<string, unknown>>;
  disconnect(): Promise<void>;
  listCapabilities(): Promise<Array<Record<string, unknown>>>;
  health(): Promise<Record<string, unknown>>;
  loadGame(gamePath: string): Promise<Record<string, unknown>>;
  startSession(playerId: string): Promise<Record<string, unknown>>;
  makeChoice(sessionId: string, choiceId: string): Promise<Record<string, unknown>>;
  planRealtimeMesh(request: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ExecutionReceipt {
  id: string;
  source: 'mcp-games-server';
  transport: 'stdio';
  tool: 'load_game' | 'start_game' | 'make_choice' | 'plan_realtime_mesh';
  status: 'completed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  payloadSummary: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  persistence: 'response-only';
}

export async function executeWithReceipt<T>(
  tool: ExecutionReceipt['tool'],
  payload: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<{ result: T; receipt: ExecutionReceipt }> {
  const startedAt = new Date();
  const result = await operation();
  const completedAt = new Date();

  return {
    result,
    receipt: {
      id: `exec_${randomUUID()}`,
      source: 'mcp-games-server',
      transport: 'stdio',
      tool,
      status: 'completed',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      payloadSummary: summarizePayload(payload),
      resultSummary: summarizeResult(result),
      persistence: 'response-only',
    },
  };
}

function summarizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const scalarKeys = [
    'gameId',
    'playerId',
    'sessionId',
    'choiceId',
    'actorId',
    'hostPlayerId',
    'enableVideoToVideo',
    'enableAvatarAgent',
    'enableTerminalAccess',
    'enableSkillPlugins',
  ];
  const summary = Object.fromEntries(
    scalarKeys
      .filter((key) => ['string', 'number', 'boolean'].includes(typeof payload[key]))
      .map((key) => [key, payload[key]]),
  );
  for (const key of ['playerIds', 'preferredRegions', 'availableNodes']) {
    if (Array.isArray(payload[key])) summary[`${key}Count`] = payload[key].length;
  }
  return summary;
}

function summarizeResult(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return { value };
  }
  const result = value as Record<string, unknown>;
  const keys = [
    'sessionId',
    'gameId',
    'gameTitle',
    'sceneId',
    'sceneTitle',
    'completed',
    'completedAt',
  ];
  return Object.fromEntries(keys.filter((key) => key in result).map((key) => [key, result[key]]));
}

function environment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string';
    }),
  );
}

export function resolveGamesServerEntry(): string {
  const candidates = [
    process.env.MCP_GAMES_SERVER_ENTRY,
    path.resolve(process.cwd(), 'packages/mcp-games-server/dist/index.js'),
    path.resolve(process.cwd(), '../../packages/mcp-games-server/dist/index.js'),
    path.resolve(__dirname, '../../../packages/mcp-games-server/dist/index.js'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const entry = candidates.find((candidate) => existsSync(candidate));
  if (!entry) {
    throw new Error(
      'The MCP Games server build is unavailable. Run "pnpm --filter @omnigents/mcp-games-server build" or set MCP_GAMES_SERVER_ENTRY.',
    );
  }
  return entry;
}

function parseToolResult(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): Record<string, unknown> {
  const text = result.content?.find(
    (item): item is { type: string; text: string } =>
      item.type === 'text' && typeof item.text === 'string',
  )?.text;

  let parsed: Record<string, unknown>;
  if (!text) {
    parsed = {};
  } else {
    try {
      const value: unknown = JSON.parse(text);
      parsed =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)
          : { value };
    } catch {
      parsed = { message: text };
    }
  }

  if (result.isError) {
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.message === 'string'
          ? parsed.message
          : 'The MCP Games server rejected the tool call.';
    throw new Error(message);
  }
  return parsed;
}

export class StdioGamesRuntime implements GamesRuntime {
  private status: GamesRuntimeStatus = 'disconnected';
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<void> | null = null;

  getStatus(): GamesRuntimeStatus {
    return this.status;
  }

  async connect(): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('health_check', {});
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.connecting = null;
    this.status = 'disconnected';

    if (client) {
      await client.close().catch(() => undefined);
    } else if (transport) {
      await transport.close().catch(() => undefined);
    }
  }

  async health(): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('health_check', {});
  }

  async listCapabilities(): Promise<Array<Record<string, unknown>>> {
    await this.ensureConnected();
    if (!this.client) throw new Error('The MCP Games server is not connected.');
    const result = await this.client.listTools(undefined, { timeout: 15_000 });
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async loadGame(gamePath: string): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('load_game', { path: gamePath });
  }

  async startSession(playerId: string): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('start_game', { playerId });
  }

  async makeChoice(sessionId: string, choiceId: string): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('make_choice', { sessionId, choiceId });
  }

  async planRealtimeMesh(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    return this.callConnectedTool('plan_realtime_mesh', request);
  }

  private async ensureConnected(): Promise<void> {
    if (this.client && this.status === 'connected') return;
    if (this.connecting) return this.connecting;

    this.status = 'connecting';
    this.connecting = this.open();
    try {
      await this.connecting;
      this.status = 'connected';
    } catch (error) {
      this.status = 'error';
      this.client = null;
      this.transport = null;
      throw error;
    } finally {
      this.connecting = null;
    }
  }

  private async open(): Promise<void> {
    const entry = resolveGamesServerEntry();
    const workspaceRoot =
      process.env.MCP_GAMES_WORKDIR ?? path.resolve(path.dirname(entry), '../../..');
    const defaultGamePath =
      process.env.DEFAULT_GAME_PATH ?? path.resolve(workspaceRoot, 'games/morning-decision.yaml');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      cwd: workspaceRoot,
      env: {
        ...environment(),
        MCP_STDIO: '1',
        DEFAULT_GAME_PATH: defaultGamePath,
      },
      stderr: 'inherit',
    });
    const client = new Client(
      { name: 'mcp-games-connector', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw error;
    }

    this.transport = transport;
    this.client = client;
  }

  private async callConnectedTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.client || this.status !== 'connected') {
      throw new Error('The MCP Games server is not connected.');
    }

    try {
      const result = await this.client.callTool({ name, arguments: args }, undefined, {
        timeout: 15_000,
      });
      return parseToolResult(
        result as unknown as {
          content?: Array<{ type: string; text?: string }>;
          isError?: boolean;
        },
      );
    } catch (error) {
      if (this.transport?.pid === null) {
        this.status = 'error';
        this.client = null;
        this.transport = null;
      }
      throw error;
    }
  }
}
