import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { telemetry } from '../observability/index.js';
import {
  createRealtimeMeshSessionPlanner,
  parseRealtimeMeshSessionRequest,
} from '../realtime-mesh/index.js';

// Define the server
const server = new Server(
  {
    name: 'omnigents-mcp-games',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const realtimeMeshTool = {
  name: 'plan_realtime_mesh',
  description:
    'Plan a validated realtime game session topology with role assignments, readiness, channels, and failover nodes',
  annotations: {
    title: 'Plan realtime mesh',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object' as const,
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      gameId: { type: 'string', minLength: 1 },
      hostPlayerId: { type: 'string', minLength: 1 },
      playerIds: {
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: { type: 'string', minLength: 1 },
      },
      preferredRegions: {
        type: 'array',
        maxItems: 32,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
            label: { type: 'string', minLength: 1 },
            priority: { type: 'integer', minimum: 0 },
          },
          required: ['id', 'label', 'priority'],
          additionalProperties: false,
        },
      },
      availableNodes: {
        type: 'array',
        minItems: 1,
        maxItems: 256,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
            regionId: { type: 'string', minLength: 1 },
            roles: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                enum: ['signal', 'relay', 'media', 'agent', 'state'],
              },
            },
            capacityScore: { type: 'number', minimum: 0 },
            observedRttMs: { type: 'number', minimum: 0 },
          },
          required: ['id', 'regionId', 'roles', 'capacityScore'],
          additionalProperties: false,
        },
      },
      enableVideoToVideo: { type: 'boolean' },
      enableAvatarAgent: { type: 'boolean' },
      enableTerminalAccess: { type: 'boolean' },
      enableSkillPlugins: { type: 'boolean' },
    },
    required: [
      'sessionId',
      'gameId',
      'hostPlayerId',
      'playerIds',
      'preferredRegions',
      'availableNodes',
      'enableVideoToVideo',
      'enableAvatarAgent',
      'enableTerminalAccess',
      'enableSkillPlugins',
    ],
    additionalProperties: false,
  },
};

import { GameDefinition } from '@omnigents/shared';
import { getStateStore, GameEngine, gameParser } from '../core/index.js';
import { createStateManager } from '../core/state-manager.js';
import path from 'path';
import { existsSync } from 'node:fs';

// Initialize Engine
const stateStore = createStateManager(getStateStore());
let engine: GameEngine;

// Temporary: Load a default game for testing
// In robust implementation, we might have a GameRegistry
let loadedGame: GameDefinition | null = null;

export function resolveDefaultGamePath(): string {
  const configuredPath = process.env.DEFAULT_GAME_PATH;
  const candidates = [
    configuredPath,
    path.resolve(process.cwd(), 'games/morning-decision.yaml'),
    path.resolve(process.cwd(), '../../games/morning-decision.yaml'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const gamePath = candidates.find((candidate) => existsSync(candidate));
  if (!gamePath) {
    throw new Error(
      `Default game not found. Set DEFAULT_GAME_PATH or provide games/morning-decision.yaml.`,
    );
  }
  return gamePath;
}

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'health_check',
        description: 'Basic health check for the MCP Games Server',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'load_game',
        description: 'Load a game definition from file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
      {
        name: 'start_game',
        description: 'Start a new game session',
        inputSchema: {
          type: 'object',
          properties: {
            playerId: { type: 'string' },
          },
          required: ['playerId'],
        },
      },
      {
        name: 'make_choice',
        description: 'Make a choice in the current game session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            choiceId: { type: 'string' },
          },
          required: ['sessionId', 'choiceId'],
        },
      },
      realtimeMeshTool,
    ],
  };
});

// Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  telemetry.emit('tool:call', { tool: name, args });
  const traceId = `trace-${Date.now()}`;

  try {
    if (name === 'health_check') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'OK',
              timestamp: new Date().toISOString(),
              game: loadedGame
                ? { id: loadedGame.id, title: loadedGame.title, ready: true }
                : { ready: false },
            }),
          },
        ],
      };
    }

    if (name === 'load_game') {
      const filePath = String(args?.path);
      loadedGame = await gameParser.parse(filePath);
      return {
        content: [{ type: 'text', text: `Loaded game: ${loadedGame.title} (${loadedGame.id})` }],
      };
    }

    if (name === 'start_game') {
      if (!loadedGame) throw new Error('No game loaded. Use load_game first.');
      const game = loadedGame;
      const playerId = String(args?.playerId);
      const { session, scene } = await engine.startGame(game, playerId, traceId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId: session.id,
                gameId: game.id,
                gameTitle: game.title,
                sceneId: scene.id,
                sceneTitle: scene.title,
                narrative: scene.narrative,
                choices: scene.choices,
                variables: session.variables,
                completed: Boolean(session.completedAt),
                completedAt: session.completedAt ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === 'make_choice') {
      if (!loadedGame) throw new Error('No game loaded.');
      const game = loadedGame;
      const sessionId = String(args?.sessionId);
      const choiceId = String(args?.choiceId);
      const { session, scene, narrative, effectsApplied, contextInjected } =
        await engine.executeAction(
        game,
        sessionId,
        { type: 'choice', choiceId },
        traceId,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                gameId: game.id,
                sceneId: scene.id,
                sceneTitle: scene.title,
                narrative: narrative,
                choices: scene.choices,
                sessionId: session.id,
                variables: session.variables,
                effectsApplied,
                contextInjected,
                completed: Boolean(session.completedAt),
                completedAt: session.completedAt ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === 'plan_realtime_mesh') {
      const meshRequest = parseRealtimeMeshSessionRequest(args);
      const blueprint = createRealtimeMeshSessionPlanner().createBlueprint(meshRequest);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(blueprint, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.emit('tool:error', { tool: name, error: message }, 'ERROR');
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

export async function startServer() {
  const { ContextEngine } = await import('../core/context-engine.js');
  const contextEngine = new ContextEngine();
  engine = new GameEngine(stateStore, contextEngine);
  const defaultGamePath = resolveDefaultGamePath();
  loadedGame = await gameParser.parse(defaultGamePath);
  telemetry.emit('game:default_loaded', {
    gameId: loadedGame.id,
    title: loadedGame.title,
    path: defaultGamePath,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  telemetry.emit('server:start', { transport: 'stdio' });
  console.error('MCP Games Server running on stdio');
}

export async function stopServer(): Promise<void> {
  await server.close();
}
