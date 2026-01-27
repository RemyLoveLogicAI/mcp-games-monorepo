/**
 * MCP API Route - Query MCP servers for personalized content
 *
 * POST /api/mcp/query - Execute semantic query across MCP servers
 * GET /api/mcp/status - Get MCP connection status
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse, MultiQueryResult } from 'shared-types';
import { MCPClient, createMCPClient } from 'mcp-sdk';

// Global MCP client instance
let mcpClient: MCPClient | null = null;

/**
 * Initialize MCP client with configured servers
 */
async function initializeMCPClient(): Promise<MCPClient> {
  if (mcpClient) return mcpClient;

  mcpClient = createMCPClient({
    debug: process.env.NODE_ENV === 'development',
    cache: {
      enabled: true,
      defaultTtlMs: 5 * 60 * 1000, // 5 minutes
      maxEntries: 500,
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
  });

  // Configure servers from environment variables
  const servers = [
    {
      id: 'github',
      url: process.env.GITHUB_MCP_URL,
      token: process.env.GITHUB_TOKEN,
    },
    {
      id: 'notion',
      url: process.env.NOTION_MCP_URL,
      token: process.env.NOTION_TOKEN,
    },
    {
      id: 'linear',
      url: process.env.LINEAR_MCP_URL,
      token: process.env.LINEAR_TOKEN,
    },
  ];

  for (const server of servers) {
    if (server.url) {
      await mcpClient.connect(server.id, {
        serverUrl: server.url,
        capabilities: ['read', 'search'],
        metadata: {},
      }, server.token ? {
        type: 'bearer_token',
        token: server.token,
      } : undefined);
    }
  }

  return mcpClient;
}

/**
 * POST /api/mcp/query - Execute semantic query
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<MultiQueryResult>>> {
  try {
    const body = await request.json();
    const {
      servers,
      query,
      filters,
      format = 'json',
      maxResults = 10,
      cachePolicy = 'cache-first'
    } = body;

    if (!servers || servers.length === 0) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'At least one server is required' }
      }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'query is required' }
      }, { status: 400 });
    }

    const client = await initializeMCPClient();

    // Build and execute query using fluent API
    const result = await client
      .from(servers)
      .semanticSearch(query)
      .filter(filters ?? {})
      .format(format)
      .maxResults(maxResults)
      .cache(cachePolicy)
      .execute();

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
        serversQueried: servers.length,
        cacheHits: result.results.filter(r => r.metadata?.cached).length,
      }
    });

  } catch (error) {
    console.error('MCP query error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}

/**
 * GET /api/mcp/status - Get connection status
 */
export async function GET(): Promise<NextResponse<APIResponse<{
  connections: Array<{ id: string; status: string; type: string }>;
  cacheStats: { hits: number; misses: number; hitRate: number };
}>>> {
  try {
    const client = await initializeMCPClient();
    const connections = client.getConnections();
    const cacheStats = client.getCacheStats();

    return NextResponse.json({
      success: true,
      data: {
        connections: connections.map(c => ({
          id: c.id,
          status: c.status,
          type: c.type
        })),
        cacheStats: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          hitRate: cacheStats.hitRate
        }
      },
      metadata: { timestamp: new Date().toISOString() }
    });

  } catch (error) {
    console.error('MCP status error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}
