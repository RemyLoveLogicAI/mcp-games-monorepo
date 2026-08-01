/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  MCP_CONNECTOR_URL?: string;
  MCP_CONNECTOR_AUTH_TOKEN?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const connectorRoutes = [
  { method: "GET", pattern: /^\/api\/connector\/api\/games\/health$/, target: "/api/games/health" },
  {
    method: "POST",
    pattern: /^\/api\/connector\/api\/games\/sessions$/,
    target: "/api/games/sessions",
  },
] as const;

function connectorTarget(request: Request): URL | null {
  const url = new URL(request.url);
  const staticRoute = connectorRoutes.find(
    (route) => route.method === request.method && route.pattern.test(url.pathname),
  );
  if (staticRoute) return new URL(staticRoute.target, "https://connector.invalid");

  const choice = url.pathname.match(/^\/api\/connector\/api\/games\/sessions\/([^/]+)\/choices$/);
  if (request.method === "POST" && choice) {
    return new URL(
      `/api/games/sessions/${choice[1]}/choices`,
      "https://connector.invalid",
    );
  }
  return null;
}

async function proxyConnector(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_CONNECTOR_URL || !env.MCP_CONNECTOR_AUTH_TOKEN) {
    return Response.json(
      {
        error: "connector_not_configured",
        message: "The production connector binding is unavailable.",
      },
      { status: 503 },
    );
  }

  const target = connectorTarget(request);
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  const connectorBase = new URL(env.MCP_CONNECTOR_URL);
  target.protocol = connectorBase.protocol;
  target.host = connectorBase.host;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${env.MCP_CONNECTOR_AUTH_TOKEN}`);
  headers.set("origin", new URL(request.url).origin);
  headers.delete("cookie");
  headers.delete("host");

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control", "x-mcp-actor-id"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/connector/")) {
      return proxyConnector(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
