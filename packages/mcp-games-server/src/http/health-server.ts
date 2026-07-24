import { createServer, type Server } from 'node:http';

export interface HealthServerOptions {
  port: number;
  host?: string;
  isReady: () => boolean;
  version?: string;
}

export function startHealthServer(options: HealthServerOptions): Promise<Server> {
  const startedAt = Date.now();
  const host = options.host ?? '0.0.0.0';
  const version = options.version ?? '0.1.0';

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const ready = options.isReady();
    const payload = {
      service: 'mcp-games-server',
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      transport: 'stdio',
      status: ready ? 'ready' : 'starting',
    };

    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');

    if (request.method !== 'GET') {
      response.statusCode = 405;
      response.setHeader('allow', 'GET');
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    if (path === '/health') {
      response.statusCode = 200;
      response.end(JSON.stringify({ ...payload, status: 'healthy' }));
      return;
    }

    if (path === '/ready') {
      response.statusCode = ready ? 200 : 503;
      response.end(JSON.stringify(payload));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
