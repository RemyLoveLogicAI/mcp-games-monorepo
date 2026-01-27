/**
 * MCP Client Integration Tests
 *
 * Tests the core functionality of the MCP SDK including:
 * - Connection management
 * - Fluent query builder
 * - Caching behavior
 * - Retry logic
 * - Multi-server queries
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MCPClient,
  createMCPClient,
  MCPCache,
  SemanticQueryBuilder,
  withRetry,
  calculateBackoff,
  CircuitBreaker,
  RateLimiter,
  APIKeyAuthProvider,
  BearerTokenAuthProvider,
  OAuth2AuthProvider,
  AuthProviderRegistry,
} from '../index';

// Mock HTTP client for testing
const createMockHTTPClient = (responses: Map<string, unknown>) => ({
  request: vi.fn(async <T>(config: { url: string; method: string }) => {
    const response = responses.get(config.url);
    if (response) {
      return {
        status: 200,
        data: response as T,
        headers: {},
      };
    }
    return { status: 404, data: null as T, headers: {} };
  }),
});

describe('MCPClient', () => {
  let client: MCPClient;
  let mockHTTP: ReturnType<typeof createMockHTTPClient>;

  beforeEach(() => {
    mockHTTP = createMockHTTPClient(new Map([
      ['http://test-server/health', { status: 'ok' }],
      ['http://test-server/query', { results: [{ id: 1, title: 'Test Result' }] }],
    ]));

    client = createMCPClient({
      debug: false,
      httpClient: mockHTTP,
    });
  });

  afterEach(() => {
    client.clearCache();
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect to an MCP server', async () => {
      const result = await client.connect('test-server', {
        serverUrl: 'http://test-server',
        capabilities: ['read', 'search'],
        metadata: {},
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.id).toBe('test-server');
        expect(result.value.status).toBe('connected');
      }
    });

    it('should track multiple connections', async () => {
      await client.connect('server1', { capabilities: [], metadata: {} });
      await client.connect('server2', { capabilities: [], metadata: {} });

      const connections = client.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.map(c => c.id)).toContain('server1');
      expect(connections.map(c => c.id)).toContain('server2');
    });

    it('should disconnect from a server', async () => {
      await client.connect('test-server', { capabilities: [], metadata: {} });
      await client.disconnect('test-server');

      const connections = client.getConnections();
      expect(connections).toHaveLength(0);
    });

    it('should infer server type from ID', async () => {
      await client.connect('github-main', { capabilities: [], metadata: {} });
      const connection = client.getConnection('github-main');
      expect(connection?.type).toBe('github');
    });
  });

  describe('Fluent Query Builder', () => {
    beforeEach(async () => {
      await client.connect('notion', { capabilities: ['search'], metadata: {} });
      await client.connect('github', { capabilities: ['search'], metadata: {} });
    });

    it('should build queries with .from().semanticSearch()', async () => {
      const builder = client.from(['notion', 'github']).semanticSearch('project goals');
      const query = builder.build();

      expect(query.servers).toEqual(['notion', 'github']);
      expect(query.query).toBe('project goals');
    });

    it('should support filter chaining', () => {
      const builder = client
        .from('notion')
        .semanticSearch('tasks')
        .filter({ status: ['open'] })
        .timeframe('this_week')
        .tags(['important', 'urgent']);

      const query = builder.build();
      expect(query.filters?.status).toEqual(['open']);
      expect(query.filters?.tags).toEqual(['important', 'urgent']);
      expect(query.filters?.timeframe).toEqual({ relative: 'this_week' });
    });

    it('should support format specification', () => {
      const builder = client
        .from('github')
        .semanticSearch('pull requests')
        .format('markdown');

      const query = builder.build();
      expect(query.format).toBe('markdown');
    });

    it('should support cache policy options', () => {
      const builder = client
        .from('notion')
        .semanticSearch('docs')
        .noCache();

      const query = builder.build();
      expect(query.options?.cachePolicy).toBe('no-cache');
    });

    it('should throw error when no servers specified', () => {
      expect(() => {
        new SemanticQueryBuilder(client).semanticSearch('test').build();
      }).toThrow('No servers specified');
    });

    it('should throw error when no query specified', () => {
      expect(() => {
        client.from('notion').build();
      }).toThrow('No query specified');
    });
  });

  describe('Query Execution', () => {
    beforeEach(async () => {
      await client.connect('test-server', {
        serverUrl: 'http://test-server',
        capabilities: ['search'],
        metadata: {},
      });
    });

    it('should execute single server query', async () => {
      const result = await client.executeQuery({
        server: 'test-server',
        query: 'test query',
      });

      expect(result.success).toBe(true);
    });

    it('should execute multi-server query', async () => {
      await client.connect('server2', {
        serverUrl: 'http://test-server',
        capabilities: ['search'],
        metadata: {},
      });

      const result = await client.executeMultiQuery({
        servers: ['test-server', 'server2'],
        query: 'test query',
      });

      expect(result.results).toHaveLength(2);
      expect(result.metadata.totalServers).toBe(2);
    });
  });
});

describe('MCPCache', () => {
  let cache: MCPCache;

  beforeEach(() => {
    cache = new MCPCache({
      enabled: true,
      defaultTtlMs: 60000,
      maxEntries: 100,
      evictionPolicy: 'lru',
    });
  });

  afterEach(() => {
    cache.clear();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', { data: 'test' });
    const result = cache.get('key1');
    expect(result).toEqual({ data: 'test' });
  });

  it('should return null for missing keys', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should track cache statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('missing'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.entries).toBe(1);
  });

  it('should evict entries when max reached', () => {
    const smallCache = new MCPCache({
      enabled: true,
      defaultTtlMs: 60000,
      maxEntries: 3,
      evictionPolicy: 'fifo',
    });

    smallCache.set('a', 1);
    smallCache.set('b', 2);
    smallCache.set('c', 3);
    smallCache.set('d', 4); // Should trigger eviction

    expect(smallCache.getStats().entries).toBe(3);
    expect(smallCache.get('a')).toBeNull(); // First in, first out
  });

  it('should generate consistent cache keys', () => {
    const key1 = MCPCache.generateKey(['notion'], 'test', { a: 1 });
    const key2 = MCPCache.generateKey(['notion'], 'test', { a: 1 });
    expect(key1).toBe(key2);
  });
});

describe('RetryHandler', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary error');
      }
      return 'success';
    });

    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Permanent error');
    });

    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow('Permanent error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should calculate exponential backoff', () => {
    const config = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    };

    // Note: jitter adds randomness, so we test approximate values
    const delay1 = calculateBackoff(1, config);
    const delay2 = calculateBackoff(2, config);
    const delay3 = calculateBackoff(3, config);

    expect(delay1).toBeGreaterThan(500);
    expect(delay1).toBeLessThan(1500);
    expect(delay2).toBeGreaterThan(delay1 * 0.5);
    expect(delay3).toBeGreaterThan(delay2 * 0.5);
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100, // Short for testing
      halfOpenSuccessThreshold: 2,
    });
  });

  it('should open after failure threshold', async () => {
    const failingFn = async () => {
      throw new Error('fail');
    };

    // Trigger failures
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute('server1', failingFn)).rejects.toThrow();
    }

    expect(breaker.isOpen('server1')).toBe(true);
  });

  it('should block requests when open', async () => {
    // Force circuit to open
    for (let i = 0; i < 3; i++) {
      await breaker.execute('server1', async () => {
        throw new Error('fail');
      }).catch(() => {});
    }

    await expect(
      breaker.execute('server1', async () => 'success')
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('should reset manually', async () => {
    // Force circuit to open
    for (let i = 0; i < 3; i++) {
      await breaker.execute('server1', async () => {
        throw new Error('fail');
      }).catch(() => {});
    }

    breaker.reset('server1');
    expect(breaker.isOpen('server1')).toBe(false);
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('should allow requests within limit', () => {
    limiter.setLimit('server1', { maxRequests: 5, windowMs: 1000 });

    for (let i = 0; i < 5; i++) {
      expect(limiter.canRequest('server1')).toBe(true);
      limiter.recordRequest('server1');
    }
  });

  it('should block requests over limit', () => {
    limiter.setLimit('server1', { maxRequests: 2, windowMs: 10000 });

    limiter.recordRequest('server1');
    limiter.recordRequest('server1');

    expect(limiter.canRequest('server1')).toBe(false);
  });

  it('should allow requests to unlimited servers', () => {
    expect(limiter.canRequest('unlimited-server')).toBe(true);
  });
});

describe('AuthProviders', () => {
  describe('APIKeyAuthProvider', () => {
    it('should return API key credentials', async () => {
      const provider = new APIKeyAuthProvider('test', 'my-api-key');
      const creds = await provider.getCredentials();

      expect(creds.type).toBe('api_key');
      expect(creds.apiKey).toBe('my-api-key');
      expect(creds.customHeaders?.['X-API-Key']).toBe('my-api-key');
    });
  });

  describe('BearerTokenAuthProvider', () => {
    it('should return bearer token credentials', async () => {
      const provider = new BearerTokenAuthProvider('test', 'my-token');
      const creds = await provider.getCredentials();

      expect(creds.type).toBe('bearer_token');
      expect(creds.customHeaders?.['Authorization']).toBe('Bearer my-token');
    });

    it('should detect expired tokens', () => {
      const pastDate = new Date(Date.now() - 10000);
      const provider = new BearerTokenAuthProvider('test', 'token', pastDate);
      expect(provider.isExpired()).toBe(true);
    });
  });

  describe('OAuth2AuthProvider', () => {
    it('should return OAuth credentials', async () => {
      const provider = new OAuth2AuthProvider('test', {
        accessToken: 'access-token',
        tokenType: 'Bearer',
      });

      const creds = await provider.getCredentials();
      expect(creds.type).toBe('oauth2');
      expect(creds.oauth?.accessToken).toBe('access-token');
    });
  });

  describe('AuthProviderRegistry', () => {
    it('should register and retrieve providers', () => {
      const registry = new AuthProviderRegistry();
      const provider = new APIKeyAuthProvider('test', 'key');

      registry.register('server1', provider);
      expect(registry.has('server1')).toBe(true);
      expect(registry.get('server1')).toBe(provider);
    });

    it('should get credentials for registered servers', async () => {
      const registry = new AuthProviderRegistry();
      registry.register('server1', new APIKeyAuthProvider('test', 'my-key'));

      const creds = await registry.getCredentials('server1');
      expect(creds?.apiKey).toBe('my-key');
    });

    it('should return null for unregistered servers', async () => {
      const registry = new AuthProviderRegistry();
      const creds = await registry.getCredentials('unknown');
      expect(creds).toBeNull();
    });
  });
});
