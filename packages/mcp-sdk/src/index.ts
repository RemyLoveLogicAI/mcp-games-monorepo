/**
 * MCP SDK - Type-safe client library for Model Context Protocol
 *
 * This SDK provides:
 * - Fluent query builder for semantic searches across multiple MCP servers
 * - Pluggable authentication providers (OAuth2, API Key, Bearer Token, etc.)
 * - Robust error handling with exponential backoff retry
 * - In-memory caching with configurable TTL and eviction policies
 * - Rate limiting and circuit breaker protection
 *
 * @example Basic Usage
 * ```typescript
 * import { MCPClient } from 'mcp-sdk';
 *
 * const client = new MCPClient({ debug: true });
 *
 * // Connect to servers
 * await client.connect('github', {
 *   serverUrl: 'https://api.github.com',
 *   capabilities: ['read', 'search'],
 * }, {
 *   type: 'bearer_token',
 *   token: process.env.GITHUB_TOKEN,
 * });
 *
 * await client.connect('notion', {
 *   serverUrl: 'https://api.notion.com/v1',
 *   capabilities: ['read', 'search'],
 * }, {
 *   type: 'bearer_token',
 *   token: process.env.NOTION_TOKEN,
 * });
 *
 * // Execute semantic search across multiple servers
 * const results = await client
 *   .from(['github', 'notion'])
 *   .semanticSearch('project roadmap and milestones')
 *   .timeframe('this_month')
 *   .format('markdown')
 *   .maxResults(10)
 *   .execute();
 *
 * console.log(results.aggregated);
 * ```
 *
 * @example With Caching Configuration
 * ```typescript
 * const client = new MCPClient({
 *   cache: {
 *     enabled: true,
 *     defaultTtlMs: 5 * 60 * 1000, // 5 minutes
 *     maxEntries: 500,
 *     evictionPolicy: 'lru',
 *   },
 *   retry: {
 *     maxAttempts: 3,
 *     baseDelayMs: 1000,
 *     maxDelayMs: 30000,
 *     backoffMultiplier: 2,
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Client
// =============================================================================

export {
  MCPClient,
  createMCPClient,
  type MCPClientConfig,
  type HTTPClient,
  type HTTPRequestConfig,
  type HTTPResponse,
} from './client/MCPClient';

// =============================================================================
// Query Builder
// =============================================================================

export {
  SemanticQueryBuilder,
  createQueryBuilder,
  QueryBuilderError,
  type QueryExecutor,
} from './query/SemanticQueryBuilder';

// =============================================================================
// Cache
// =============================================================================

export { MCPCache } from './cache/MCPCache';

// =============================================================================
// Authentication
// =============================================================================

export {
  BaseAuthProvider,
  APIKeyAuthProvider,
  BearerTokenAuthProvider,
  OAuth2AuthProvider,
  BasicAuthProvider,
  CustomAuthProvider,
  AuthProviderRegistry,
  createAuthProvider,
  type AuthProviderConfig,
} from './auth/AuthProviders';

// =============================================================================
// Retry & Error Handling
// =============================================================================

export {
  withRetry,
  createMCPError,
  isRetryableError,
  calculateBackoff,
  sleep,
  CircuitBreaker,
  RateLimiter,
  DEFAULT_RETRY_CONFIG,
  type RetryContext,
  type RetryOptions,
  type CircuitBreakerConfig,
  type RateLimitConfig,
} from './utils/RetryHandler';

// =============================================================================
// Omni Agent (Multi-channel, Always-on)
// =============================================================================

export {
  OmniAgentClient,
  createOmniAgent,
  createMockChannelAdapter,
  InMemoryPersistence,
  type ChannelType,
  type OmniMessage,
  type UserContext,
  type UserPreferences,
  type ConversationEntry,
  type ScheduledTask,
  type PendingAction,
  type ChannelAdapter,
  type ChannelStatus,
  type RichMessage,
  type MessageHandler,
  type OmniAgentConfig,
  type PersistenceAdapter,
} from './omni/OmniAgentClient';

// =============================================================================
// Re-export all types from shared-types
// =============================================================================

export * from 'shared-types';
