import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import { MCPClient } from 'mcp-sdk';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { executeWithReceipt, StdioGamesRuntime, type GamesRuntime } from './games-bridge';

dotenv.config();

const knownServers = [
  { id: 'games', name: 'MCP Games Super Server' },
  { id: 'github', name: 'GitHub' },
  { id: 'linear', name: 'Linear' },
  { id: 'notion', name: 'Notion' },
] as const;

const connectSchema = z.object({
  serverUrl: z.string().url().optional(),
  authToken: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const querySchema = z.object({
  server: z.string().min(1),
  query: z.string().min(1),
  filters: z.record(z.unknown()).optional(),
  options: z
    .object({
      maxResults: z.number().int().positive().max(100).optional(),
      includeMetadata: z.boolean().optional(),
      cachePolicy: z.enum(['no-cache', 'cache-first', 'network-first']).optional(),
    })
    .optional(),
});

const sessionSchema = z.object({
  playerId: z.string().trim().min(1).max(128),
});

const choiceSchema = z.object({
  choiceId: z.string().trim().min(1).max(128),
});

const loadGameSchema = z.object({
  gameId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
});

const meshSchema = z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, {
  message: 'A realtime mesh request is required.',
});

export interface ConnectorOptions {
  gamesTimeoutMs?: number;
  authToken?: string;
  allowedOrigins?: string[];
  production?: boolean;
}

function configuredOrigins(): string[] {
  return (process.env.MCP_CONNECTOR_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`Invalid connector origin: ${value}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Connector origins must not include a path, query, or fragment: ${value}`);
  }
  return url.origin;
}

function resolveSecurity(options: ConnectorOptions): {
  authToken: string | undefined;
  origins: string[];
} {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const authToken = options.authToken ?? process.env.MCP_CONNECTOR_AUTH_TOKEN;
  const configured = options.allowedOrigins ?? configuredOrigins();
  const origins = [...new Set(configured.map(normalizeOrigin))];

  if (!production) return { authToken, origins };

  if (!authToken || authToken.length < 32) {
    throw new Error('MCP_CONNECTOR_AUTH_TOKEN must contain at least 32 characters in production.');
  }

  const flagship = process.env.MCP_GAMES_FLAGSHIP_URL;
  if (!flagship) {
    throw new Error('MCP_GAMES_FLAGSHIP_URL is required in production.');
  }
  const flagshipOrigin = normalizeOrigin(flagship);
  if (origins.length !== 1 || origins[0] !== flagshipOrigin) {
    throw new Error('Production CORS must contain exactly the MCP_GAMES_FLAGSHIP_URL origin.');
  }

  return { authToken, origins };
}

function tokensMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

class GamesTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The MCP Games server did not respond within ${timeoutMs}ms.`);
    this.name = 'GamesTimeoutError';
  }
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new GamesTimeoutError(timeoutMs)), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function gamesUnavailable(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'The MCP Games server is unavailable.';
  const timedOut = error instanceof GamesTimeoutError;
  res.status(timedOut ? 504 : 503).json({
    error: timedOut ? 'games_timeout' : 'games_unavailable',
    message,
    recovery: {
      command: 'pnpm --filter @omnigents/mcp-games-server build',
      environment: 'MCP_GAMES_SERVER_ENTRY',
    },
  });
}

export function createApp(
  client: MCPClient = new MCPClient(),
  gamesRuntime: GamesRuntime = new StdioGamesRuntime(),
  options: ConnectorOptions = {},
): Express {
  const app = express();
  const { authToken, origins } = resolveSecurity(options);
  const gamesTimeoutMs = options.gamesTimeoutMs ?? 15_000;
  const gamesRoot = process.env.MCP_GAMES_ROOT ?? path.resolve(__dirname, '../../../games');
  const callGames = <T>(operation: Promise<T>): Promise<T> =>
    withDeadline(operation, gamesTimeoutMs);

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || (!origins.length && !authToken) || origins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed by the MCP connector.'));
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'mcp-connector',
      status: 'online',
      docs: '/api',
      health: '/health',
    });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'mcp-connector',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      capabilities: [
        'connection-management',
        'semantic-query',
        'context-contract',
        'games-tool-execution',
      ],
      games: { status: gamesRuntime.getStatus(), transport: 'stdio' },
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      const server = await callGames(gamesRuntime.health());
      res.json({
        status: 'ready',
        service: 'mcp-connector',
        games: { status: gamesRuntime.getStatus(), required: true, server },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The Games runtime is unavailable.';
      res.status(503).json({
        status: 'not_ready',
        service: 'mcp-connector',
        games: { status: gamesRuntime.getStatus(), required: true, message },
      });
    }
  });

  app.use('/api', (req: Request, res: Response, next) => {
    if (authToken) {
      const authorization = req.header('authorization') ?? '';
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!supplied || !tokensMatch(supplied, authToken)) {
        res
          .status(401)
          .json({ error: 'unauthorized', message: 'A valid bearer token is required.' });
        return;
      }
    }

    const actorId = req.header('x-mcp-actor-id')?.trim();
    if (!actorId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actorId)) {
      res.status(400).json({
        error: 'invalid_actor',
        message: 'x-mcp-actor-id is required and must be a stable opaque actor identifier.',
      });
      return;
    }
    res.locals.actorId = actorId;
    res.setHeader('x-mcp-actor-id', actorId);
    next();
  });

  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      service: 'mcp-connector',
      endpoints: {
        health: 'GET /health',
        readiness: 'GET /ready',
        connections: 'GET /api/mcp/connections',
        connect: 'POST /api/mcp/connect/:serverId',
        disconnect: 'DELETE /api/mcp/disconnect/:serverId',
        query: 'POST /api/mcp/query',
        context: 'GET /api/mcp/context/:userId',
        gamesCapabilities: 'GET /api/games/capabilities',
        gamesHealth: 'GET /api/games/health',
        loadGame: 'POST /api/games/load',
        startGame: 'POST /api/games/sessions',
        makeChoice: 'POST /api/games/sessions/:sessionId/choices',
        planRealtimeMesh: 'POST /api/games/mesh/plan',
      },
    });
  });

  app.get('/api/mcp/connections', (_req: Request, res: Response) => {
    const active = new Map(
      client.getConnections().map((connection) => [connection.id, connection]),
    );
    res.json({
      connections: knownServers.map((server) => ({
        ...server,
        status:
          server.id === 'games'
            ? gamesRuntime.getStatus()
            : (active.get(server.id)?.status ?? 'disconnected'),
      })),
    });
  });

  app.post('/api/mcp/connect/:serverId', async (req: Request, res: Response) => {
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }

    if (req.params.serverId === 'games') {
      try {
        const health = await callGames(gamesRuntime.connect());
        res.status(201).json({
          connection: {
            id: 'games',
            name: 'MCP Games Super Server',
            status: 'connected',
            transport: 'stdio',
            capabilities: [
              'health_check',
              'load_game',
              'start_game',
              'make_choice',
              'plan_realtime_mesh',
            ],
            health,
          },
        });
      } catch (error) {
        gamesUnavailable(res, error);
      }
      return;
    }

    const result = await client.connect(req.params.serverId, parsed.data);
    if (!result.success) {
      res.status(502).json({ error: 'connection_failed', message: result.error.message });
      return;
    }
    res.status(201).json({ connection: result.value });
  });

  app.delete('/api/mcp/disconnect/:serverId', async (req: Request, res: Response) => {
    if (req.params.serverId === 'games') {
      await gamesRuntime.disconnect();
      res.status(204).end();
      return;
    }

    const result = await client.disconnect(req.params.serverId);
    if (!result.success) {
      res.status(500).json({ error: 'disconnect_failed', message: result.error.message });
      return;
    }
    res.status(204).end();
  });

  app.post('/api/mcp/query', async (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }

    if (parsed.data.server === 'games') {
      res.status(422).json({
        error: 'unsupported_operation',
        message:
          'Free-form semantic queries are not implemented by the Games server. Use the typed game session endpoints.',
        endpoints: {
          start: 'POST /api/games/sessions',
          choice: 'POST /api/games/sessions/:sessionId/choices',
        },
      });
      return;
    }

    const result = await client.executeQuery(parsed.data);
    if (!result.success) {
      res.status(502).json({ error: 'query_failed', message: result.error.message });
      return;
    }
    res.json({ result: result.value });
  });

  app.get('/api/mcp/context/:userId', (req: Request, res: Response) => {
    res.json({
      userId: req.params.userId,
      context: {},
      sources: client.getConnections().map((connection) => connection.id),
    });
  });

  app.get('/api/games/health', async (_req: Request, res: Response) => {
    try {
      const server = await callGames(gamesRuntime.health());
      res.json({
        status: 'available',
        server,
        capabilities: [
          'health_check',
          'load_game',
          'start_game',
          'make_choice',
          'plan_realtime_mesh',
        ],
        provenance: {
          source: 'local-process',
          transport: 'stdio',
          checkedBy: 'health_check',
          persistence: 'none',
        },
      });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.get('/api/games/capabilities', async (_req: Request, res: Response) => {
    try {
      const tools = await callGames(gamesRuntime.listCapabilities());
      res.json({
        tools,
        provenance: {
          source: 'local-process',
          transport: 'stdio',
          checkedBy: 'tools/list',
          persistence: 'none',
        },
      });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.post('/api/games/load', async (req: Request, res: Response) => {
    const parsed = loadGameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const gamePath = path.resolve(gamesRoot, `${parsed.data.gameId}.yaml`);
    if (!gamePath.startsWith(`${path.resolve(gamesRoot)}${path.sep}`) || !existsSync(gamePath)) {
      res.status(404).json({ error: 'game_not_found', gameId: parsed.data.gameId });
      return;
    }

    try {
      const execution = await executeWithReceipt(
        'load_game',
        { gameId: parsed.data.gameId, actorId: res.locals.actorId },
        () => callGames(gamesRuntime.loadGame(gamePath)),
      );
      res.json({ game: execution.result, receipt: execution.receipt });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.post('/api/games/sessions', async (req: Request, res: Response) => {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }

    try {
      const execution = await executeWithReceipt(
        'start_game',
        { playerId: parsed.data.playerId, actorId: res.locals.actorId },
        () => callGames(gamesRuntime.startSession(parsed.data.playerId)),
      );
      res.status(201).json({ session: execution.result, receipt: execution.receipt });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.post('/api/games/sessions/:sessionId/choices', async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId.trim();
    const parsed = choiceSchema.safeParse(req.body);
    if (!sessionId || !parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        issues: parsed.success
          ? [{ path: ['sessionId'], message: 'Required' }]
          : parsed.error.issues,
      });
      return;
    }

    try {
      const execution = await executeWithReceipt(
        'make_choice',
        { sessionId, choiceId: parsed.data.choiceId, actorId: res.locals.actorId },
        () => callGames(gamesRuntime.makeChoice(sessionId, parsed.data.choiceId)),
      );
      res.json({ turn: execution.result, receipt: execution.receipt });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.post('/api/games/mesh/plan', async (req: Request, res: Response) => {
    const parsed = meshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }

    try {
      const execution = await executeWithReceipt(
        'plan_realtime_mesh',
        { ...parsed.data, actorId: res.locals.actorId },
        () => callGames(gamesRuntime.planRealtimeMesh(parsed.data)),
      );
      res.json({ blueprint: execution.result, receipt: execution.receipt });
    } catch (error) {
      gamesUnavailable(res, error);
    }
  });

  app.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
    if (error.message === 'Origin is not allowed by the MCP connector.') {
      res.status(403).json({ error: 'origin_forbidden', message: error.message });
      return;
    }
    next(error);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

export function startConnector(): ReturnType<Express['listen']> {
  const rawPort = process.env.MCP_CONNECTOR_PORT || process.env.PORT || '3001';
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid connector port: ${rawPort}`);
  }
  const gamesRuntime = new StdioGamesRuntime();
  const server = createApp(new MCPClient(), gamesRuntime).listen(port, () => {
    console.log(`MCP Connector listening on http://0.0.0.0:${port}`);
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void gamesRuntime.disconnect().finally(() => server.close());
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.once('close', () => {
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGINT', shutdown);
  });
  return server;
}

if (require.main === module) {
  startConnector();
}
