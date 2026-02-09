/**
 * Enhanced MCP Client - Core client for Model Context Protocol integration
 *
 * Features:
 * - Type-safe fluent query builder
 * - Multi-server semantic search
 * - Pluggable authentication
 * - Automatic retry with exponential backoff
 * - In-memory caching with TTL
 * - Rate limiting and circuit breaker protection
 *
 * Example usage:
 * ```typescript
 * const client = new MCPClient();
 *
 * // Configure servers
 * await client.connect('github', {
 *   serverUrl: 'https://api.github.com',
 *   authToken: 'token',
 *   capabilities: ['read', 'search'],
 * });
 *
 * // Execute semantic search across multiple servers
 * const results = await client
 *   .from(['notion', 'linear', 'github'])
 *   .semanticSearch('project goals and metrics')
 *   .format('markdown')
 *   .execute();
 * ```
 */

import type {
  MCPConnection,
  MCPConfig,
  MCPConnectionStatus,
  SemanticQuery,
  MultiServerQuery,
  QueryResult,
  MultiQueryResult,
  ServerQueryResult,
  Result,
  MCPError,
  CacheConfig,
  RetryConfig,
  AuthCredentials,
} from 'shared-types';

import { MCPCache } from '../cache/MCPCache';
import {
  AuthProviderRegistry,
  createAuthProvider,
  type AuthProviderConfig,
} from '../auth/AuthProviders';
import {
  withRetry,
  createMCPError,
  CircuitBreaker,
  RateLimiter,
  DEFAULT_RETRY_CONFIG,
  type RateLimitConfig,
} from '../utils/RetryHandler';
import {
  SemanticQueryBuilder,
  type QueryExecutor,
} from '../query/SemanticQueryBuilder';

/**
 * MCP Client configuration
 */
export interface MCPClientConfig {
  /** Default timeout for queries in milliseconds */
  defaultTimeout?: number;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom HTTP client (for testing) */
  httpClient?: HTTPClient;
}

/**
 * HTTP client interface for making requests
 */
export interface HTTPClient {
  request<T>(config: HTTPRequestConfig): Promise<HTTPResponse<T>>;
}

/**
 * HTTP request configuration
 */
export interface HTTPRequestConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: unknown;
  timeout?: number;
}

/**
 * HTTP response
 */
export interface HTTPResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

/**
 * Default HTTP client using fetch
 */
class DefaultHTTPClient implements HTTPClient {
  async request<T>(config: HTTPRequestConfig): Promise<HTTPResponse<T>> {
    const controller = new AbortController();
    const timeoutId = config.timeout
      ? setTimeout(() => controller.abort(), config.timeout)
      : null;

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.data ? JSON.stringify(config.data) : undefined,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data = await response.json() as T;

      return {
        status: response.status,
        data,
        headers: responseHeaders,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

/**
 * Enhanced MCP Client with fluent query builder
 */
export class MCPClient implements QueryExecutor {
  private connections: Map<string, MCPConnection> = new Map();
  private cache: MCPCache;
  private authRegistry: AuthProviderRegistry;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private config: Required<MCPClientConfig>;
  private httpClient: HTTPClient;

  constructor(config: MCPClientConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      cache: config.cache ?? {},
      retry: config.retry ?? DEFAULT_RETRY_CONFIG,
      debug: config.debug ?? false,
      httpClient: config.httpClient ?? new DefaultHTTPClient(),
    };

    this.cache = new MCPCache(this.config.cache);
    this.authRegistry = new AuthProviderRegistry();
    this.circuitBreaker = new CircuitBreaker();
    this.rateLimiter = new RateLimiter();
    this.httpClient = this.config.httpClient;
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to an MCP server
   */
  async connect(
    serverId: string,
    mcpConfig: MCPConfig,
    authConfig?: AuthProviderConfig
  ): Promise<Result<MCPConnection>> {
    try {
      this.log(`Connecting to server: ${serverId}`);

      // Register auth provider if provided
      if (authConfig) {
        const authProvider = createAuthProvider(serverId, authConfig);
        this.authRegistry.register(serverId, authProvider);
      }

      // Create connection object
      const connection: MCPConnection = {
        id: serverId,
        name: serverId,
        type: this.inferServerType(serverId),
        status: 'connecting',
        config: mcpConfig,
        lastConnectedAt: new Date().toISOString(),
      };

      // Test connection if serverUrl is provided
      if (mcpConfig.serverUrl) {
        try {
          await this.testConnection(serverId, mcpConfig);
          connection.status = 'connected';
        } catch (error) {
          connection.status = 'error';
          connection.errorMessage = error instanceof Error ? error.message : 'Connection failed';
          this.log(`Connection failed for ${serverId}: ${connection.errorMessage}`);
        }
      } else {
        connection.status = 'connected';
      }

      this.connections.set(serverId, connection);
      this.log(`Server ${serverId} status: ${connection.status}`);

      return { success: true, value: connection };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<Result<void>> {
    try {
      this.connections.delete(serverId);
      this.authRegistry.unregister(serverId);
      this.circuitBreaker.reset(serverId);
      this.log(`Disconnected from server: ${serverId}`);
      return { success: true, value: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }

  /**
   * Get all active connections
   */
  getConnections(): MCPConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a specific connection
   */
  getConnection(serverId: string): MCPConnection | undefined {
    return this.connections.get(serverId);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    const connection = this.connections.get(serverId);
    return connection?.status === 'connected';
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(serverId: string, status: MCPConnectionStatus): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.status = status;
    }
  }

  // ==========================================================================
  // Fluent Query Builder
  // ==========================================================================

  /**
   * Start building a query - specify servers to query
   */
  from<T = unknown>(servers: string | string[]): SemanticQueryBuilder<T> {
    return new SemanticQueryBuilder<T>(this).from(servers);
  }

  /**
   * Start building a query with a single server
   */
  server<T = unknown>(serverId: string): SemanticQueryBuilder<T> {
    return this.from<T>(serverId);
  }

  // ==========================================================================
  // Query Execution
  // ==========================================================================

  /**
   * Execute a semantic query on a single server
   */
  async executeQuery<T = unknown>(
    query: SemanticQuery
  ): Promise<Result<QueryResult<T>>> {
    const startTime = Date.now();

    try {
      // Check connection
      if (!this.isConnected(query.server)) {
        throw new Error(`Server ${query.server} is not connected`);
      }

      // Check circuit breaker
      if (this.circuitBreaker.isOpen(query.server)) {
        throw new Error(`Circuit breaker open for server: ${query.server}`);
      }

      // Check cache
      const cacheKey = MCPCache.generateKey([query.server], query.query, query.filters);
      const cachePolicy = query.options?.cachePolicy ?? 'cache-first';

      if (cachePolicy !== 'no-cache') {
        const cached = this.cache.get<T>(cacheKey);
        if (cached !== null) {
          this.log(`Cache hit for ${query.server}`);
          return {
            success: true,
            value: {
              data: cached,
              metadata: {
                source: query.server,
                timestamp: new Date().toISOString(),
                cached: true,
                queryDurationMs: Date.now() - startTime,
              },
            },
          };
        }
      }

      // Execute with retry and circuit breaker
      const result = await this.circuitBreaker.execute(query.server, async () => {
        return withRetry(
          async () => this.performQuery<T>(query),
          {
            ...this.config.retry,
            onRetry: (ctx) => {
              this.log(`Retrying ${query.server} (attempt ${ctx.attemptNumber})`);
            },
          }
        );
      });

      // Cache result
      if (cachePolicy !== 'no-cache') {
        this.cache.set(cacheKey, result);
      }

      return {
        success: true,
        value: {
          data: result,
          metadata: {
            source: query.server,
            timestamp: new Date().toISOString(),
            cached: false,
            queryDurationMs: Date.now() - startTime,
          },
        },
      };
    } catch (error) {
      const mcpError = createMCPError(error, query.server);
      return { success: false, error: mcpError };
    }
  }

  /**
   * Execute a multi-server query
   */
  async executeMultiQuery<T = unknown>(
    query: MultiServerQuery
  ): Promise<MultiQueryResult<T>> {
    const startTime = Date.now();
    const parallelExecution = query.options?.parallelExecution ?? true;
    const failureStrategy = query.options?.failureStrategy ?? 'partial-results';
    const aggregationStrategy = query.options?.aggregationStrategy ?? 'merge';

    this.log(`Executing multi-query across ${query.servers.length} servers`);

    // Build individual queries
    const singleQueries: SemanticQuery[] = query.servers.map(server => ({
      server,
      query: query.query,
      filters: query.filters,
      options: {
        maxResults: query.options?.maxResults,
        includeMetadata: query.options?.includeMetadata,
        cachePolicy: query.options?.cachePolicy,
        timeout: query.options?.timeout,
      },
    }));

    // Execute queries
    let results: ServerQueryResult<T>[];
    if (parallelExecution) {
      results = await this.executeParallel<T>(singleQueries, failureStrategy);
    } else {
      results = await this.executeSequential<T>(singleQueries, failureStrategy);
    }

    // Aggregate results
    const aggregated = this.aggregateResults<T>(results, aggregationStrategy);

    // Build metadata
    const successfulCount = results.filter(r => r.success).length;
    const failedCount = results.length - successfulCount;

    return {
      results,
      aggregated,
      metadata: {
        totalServers: query.servers.length,
        successfulServers: successfulCount,
        failedServers: failedCount,
        totalDurationMs: Date.now() - startTime,
        aggregationStrategy,
      },
    };
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Clear the query cache
   */
  clearCache(): void {
    this.cache.clear();
    this.log('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /**
   * Configure rate limit for a server
   */
  setRateLimit(serverId: string, config: RateLimitConfig): void {
    this.rateLimiter.setLimit(serverId, config);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Perform the actual query
   */
  private async performQuery<T>(query: SemanticQuery): Promise<T> {
    const connection = this.connections.get(query.server);
    if (!connection) {
      throw new Error(`No connection found for server: ${query.server}`);
    }

    // Wait for rate limit
    await this.rateLimiter.waitAndRecord(query.server);

    // Get auth credentials
    const credentials = await this.authRegistry.getCredentials(query.server);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...credentials?.customHeaders,
    };

    // Build request URL
    const baseUrl = connection.config.serverUrl ?? '';
    const url = `${baseUrl}/query`;

    // Execute request
    const response = await this.httpClient.request<T>({
      method: 'POST',
      url,
      headers,
      data: {
        query: query.query,
        filters: query.filters,
        options: query.options,
      },
      timeout: query.options?.timeout ?? this.config.defaultTimeout,
    });

    if (response.status >= 400) {
      throw new Error(`Query failed with status ${response.status}`);
    }

    return response.data;
  }

  /**
   * Execute queries in parallel
   */
  private async executeParallel<T>(
    queries: SemanticQuery[],
    failureStrategy: string
  ): Promise<ServerQueryResult<T>[]> {
    const promises = queries.map(async (query): Promise<ServerQueryResult<T>> => {
      const result = await this.executeQuery<T>(query);
      if (result.success) {
        return {
          serverId: query.server,
          success: true,
          data: result.value.data,
          metadata: result.value.metadata,
        };
      } else {
        if (failureStrategy === 'fail-fast') {
          throw result.error;
        }
        return {
          serverId: query.server,
          success: false,
          error: result.error as MCPError,
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Execute queries sequentially
   */
  private async executeSequential<T>(
    queries: SemanticQuery[],
    failureStrategy: string
  ): Promise<ServerQueryResult<T>[]> {
    const results: ServerQueryResult<T>[] = [];

    for (const query of queries) {
      const result = await this.executeQuery<T>(query);
      if (result.success) {
        results.push({
          serverId: query.server,
          success: true,
          data: result.value.data,
          metadata: result.value.metadata,
        });
      } else {
        if (failureStrategy === 'fail-fast') {
          throw result.error;
        }
        results.push({
          serverId: query.server,
          success: false,
          error: result.error as MCPError,
        });
      }
    }

    return results;
  }

  /**
   * Aggregate results from multiple servers
   */
  private aggregateResults<T>(
    results: ServerQueryResult<T>[],
    strategy: string
  ): T | undefined {
    const successfulResults = results
      .filter(r => r.success && r.data !== undefined)
      .map(r => r.data as T);

    if (successfulResults.length === 0) {
      return undefined;
    }

    switch (strategy) {
      case 'merge':
        return this.mergeResults(successfulResults);

      case 'separate':
        return successfulResults as unknown as T;

      case 'ranked':
        return this.rankResults(successfulResults);

      default:
        return successfulResults[0];
    }
  }

  /**
   * Merge results into a single object/array
   */
  private mergeResults<T>(results: T[]): T {
    // If all results are arrays, concatenate them
    if (results.every(r => Array.isArray(r))) {
      return results.flat() as unknown as T;
    }

    // If all results are objects, merge them
    if (results.every(r => typeof r === 'object' && r !== null && !Array.isArray(r))) {
      return Object.assign({}, ...results) as T;
    }

    // Otherwise, return as array
    return results as unknown as T;
  }

  /**
   * Rank and sort results
   */
  private rankResults<T>(results: T[]): T {
    // For arrays, flatten and deduplicate
    if (results.every(r => Array.isArray(r))) {
      const flattened = results.flat();
      // Remove duplicates based on id or content
      const seen = new Set<string>();
      const unique = flattened.filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique as unknown as T;
    }

    return this.mergeResults(results);
  }

  /**
   * Test connection to a server
   */
  private async testConnection(serverId: string, config: MCPConfig): Promise<void> {
    const credentials = await this.authRegistry.getCredentials(serverId);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...credentials?.customHeaders,
    };

    const response = await this.httpClient.request<{ status: string }>({
      method: 'GET',
      url: `${config.serverUrl}/health`,
      headers,
      timeout: 5000,
    });

    if (response.status >= 400) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
  }

  /**
   * Infer server type from server ID
   */
  private inferServerType(serverId: string): MCPConnection['type'] {
    const lowerServerId = serverId.toLowerCase();
    if (lowerServerId.includes('github')) return 'github';
    if (lowerServerId.includes('linear')) return 'linear';
    if (lowerServerId.includes('notion')) return 'notion';
    if (lowerServerId.includes('slack')) return 'slack';
    if (lowerServerId.includes('jira')) return 'jira';
    if (lowerServerId.includes('file') || lowerServerId.includes('fs')) return 'filesystem';
    return 'custom';
  }

  /**
   * Log debug messages
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[MCPClient] ${message}`);
    }
  }
}

/**
 * Create a pre-configured MCP client
 */
export function createMCPClient(config?: MCPClientConfig): MCPClient {
  return new MCPClient(config);
}
