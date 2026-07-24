import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import { MCPClient } from 'mcp-sdk';

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

function allowedOrigins(): string[] {
  return (process.env.MCP_CONNECTOR_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp(client: MCPClient = new MCPClient()): Express {
  const app = express();
  const origins = allowedOrigins();

  app.disable('x-powered-by');
  app.use(cors({ origin: origins.length > 0 ? origins : true }));
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
      capabilities: ['connection-management', 'semantic-query', 'context-contract'],
    });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    res.json({ status: 'ready', service: 'mcp-connector' });
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
      },
    });
  });

  app.get('/api/mcp/connections', (_req: Request, res: Response) => {
    const active = new Map(client.getConnections().map((connection) => [connection.id, connection]));
    res.json({
      connections: knownServers.map((server) => ({
        ...server,
        status: active.get(server.id)?.status ?? 'disconnected',
      })),
    });
  });

  app.post('/api/mcp/connect/:serverId', async (req: Request, res: Response) => {
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
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
  return createApp().listen(port, () => {
    console.log(`MCP Connector listening on http://0.0.0.0:${port}`);
  });
}

if (require.main === module) {
  startConnector();
}
