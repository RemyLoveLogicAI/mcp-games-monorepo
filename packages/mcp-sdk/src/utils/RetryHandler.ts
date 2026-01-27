/**
 * Retry Handler - Robust error handling with exponential backoff
 *
 * Features:
 * - Configurable retry strategies
 * - Exponential backoff with jitter
 * - Error classification for retryable vs non-retryable errors
 * - Circuit breaker pattern support
 * - Detailed retry logging
 */

import type {
  RetryConfig,
  MCPError,
  MCPErrorCode,
} from 'shared-types';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Retry context passed to callbacks
 */
export interface RetryContext {
  attemptNumber: number;
  totalAttempts: number;
  lastError?: Error;
  elapsedMs: number;
}

/**
 * Options for retry operation
 */
export interface RetryOptions extends Partial<RetryConfig> {
  onRetry?: (context: RetryContext) => void | Promise<void>;
  shouldRetry?: (error: Error, context: RetryContext) => boolean;
  abortSignal?: AbortSignal;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure?: Date;
  state: 'closed' | 'open' | 'half-open';
  successesInHalfOpen: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold: number;
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenSuccessThreshold: 3,
};

/**
 * Classify error codes as retryable or not
 */
export function isRetryableError(errorCode: MCPErrorCode): boolean {
  const retryableErrors: MCPErrorCode[] = [
    'CONNECTION_FAILED',
    'TIMEOUT',
    'SERVER_ERROR',
    'NETWORK_ERROR',
    'RATE_LIMITED',
  ];
  return retryableErrors.includes(errorCode);
}

/**
 * Create an MCP error from a standard error
 */
export function createMCPError(
  error: Error | unknown,
  serverId?: string
): MCPError {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = classifyError(err);

  return {
    code,
    message: err.message,
    serverId,
    details: {
      name: err.name,
      stack: err.stack,
    },
    retryable: isRetryableError(code),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Classify an error into an MCP error code
 */
function classifyError(error: Error): MCPErrorCode {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes('timeout') || name.includes('timeout')) {
    return 'TIMEOUT';
  }

  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
    return 'NETWORK_ERROR';
  }

  if (message.includes('unauthorized') || message.includes('401')) {
    return 'AUTHENTICATION_FAILED';
  }

  if (message.includes('forbidden') || message.includes('403')) {
    return 'AUTHORIZATION_FAILED';
  }

  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return 'RATE_LIMITED';
  }

  if (message.includes('not found') || message.includes('404')) {
    return 'NOT_FOUND';
  }

  if (message.includes('invalid') || message.includes('bad request') || message.includes('400')) {
    return 'INVALID_QUERY';
  }

  if (message.includes('500') || message.includes('internal server')) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoff(
  attemptNumber: number,
  config: RetryConfig
): number {
  // Calculate exponential delay
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);

  // Apply max delay cap
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±25% randomization)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Operation aborted'));
      });
    }
  });
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options,
  };

  let lastError: Error | undefined;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      // Check if operation was aborted
      if (options.abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const context: RetryContext = {
        attemptNumber: attempt,
        totalAttempts: config.maxAttempts,
        lastError,
        elapsedMs: Date.now() - startTime,
      };

      // Check if we should retry
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(lastError, context)
        : isRetryableError(classifyError(lastError));

      if (!shouldRetry || attempt >= config.maxAttempts) {
        throw lastError;
      }

      // Call onRetry callback
      if (options.onRetry) {
        await options.onRetry(context);
      }

      // Wait before retrying
      const delay = calculateBackoff(attempt, config);
      await sleep(delay, options.abortSignal);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Circuit breaker implementation for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    serverId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const state = this.getOrCreateState(serverId);

    // Check circuit state
    if (state.state === 'open') {
      if (this.shouldAttemptReset(state)) {
        state.state = 'half-open';
        state.successesInHalfOpen = 0;
      } else {
        throw new Error(`Circuit breaker is open for server: ${serverId}`);
      }
    }

    try {
      const result = await fn();
      this.recordSuccess(serverId);
      return result;
    } catch (error) {
      this.recordFailure(serverId);
      throw error;
    }
  }

  /**
   * Check if circuit is open for a server
   */
  isOpen(serverId: string): boolean {
    const state = this.state.get(serverId);
    return state?.state === 'open';
  }

  /**
   * Get circuit state for a server
   */
  getState(serverId: string): CircuitBreakerState | undefined {
    return this.state.get(serverId);
  }

  /**
   * Manually reset circuit for a server
   */
  reset(serverId: string): void {
    this.state.delete(serverId);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.state.clear();
  }

  private getOrCreateState(serverId: string): CircuitBreakerState {
    let state = this.state.get(serverId);
    if (!state) {
      state = {
        failures: 0,
        state: 'closed',
        successesInHalfOpen: 0,
      };
      this.state.set(serverId, state);
    }
    return state;
  }

  private recordSuccess(serverId: string): void {
    const state = this.getOrCreateState(serverId);

    if (state.state === 'half-open') {
      state.successesInHalfOpen++;
      if (state.successesInHalfOpen >= this.config.halfOpenSuccessThreshold) {
        // Circuit recovered
        state.state = 'closed';
        state.failures = 0;
        state.successesInHalfOpen = 0;
      }
    } else {
      // Reset failures on success in closed state
      state.failures = 0;
    }
  }

  private recordFailure(serverId: string): void {
    const state = this.getOrCreateState(serverId);
    state.failures++;
    state.lastFailure = new Date();

    if (state.state === 'half-open') {
      // Immediately open on failure in half-open state
      state.state = 'open';
    } else if (state.failures >= this.config.failureThreshold) {
      state.state = 'open';
    }
  }

  private shouldAttemptReset(state: CircuitBreakerState): boolean {
    if (!state.lastFailure) return true;
    const elapsed = Date.now() - state.lastFailure.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }
}

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private limits: Map<string, RateLimitConfig> = new Map();

  /**
   * Configure rate limit for a server
   */
  setLimit(serverId: string, config: RateLimitConfig): void {
    this.limits.set(serverId, config);
  }

  /**
   * Check if a request can be made
   */
  canRequest(serverId: string): boolean {
    const config = this.limits.get(serverId);
    if (!config) return true;

    const now = Date.now();
    const requests = this.getRequests(serverId);
    const windowStart = now - config.windowMs;

    // Remove old requests
    const validRequests = requests.filter(time => time > windowStart);
    this.requests.set(serverId, validRequests);

    return validRequests.length < config.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest(serverId: string): void {
    const requests = this.getRequests(serverId);
    requests.push(Date.now());
    this.requests.set(serverId, requests);
  }

  /**
   * Get time until next request is allowed
   */
  getWaitTime(serverId: string): number {
    const config = this.limits.get(serverId);
    if (!config) return 0;
    if (this.canRequest(serverId)) return 0;

    const requests = this.getRequests(serverId);
    if (requests.length === 0) return 0;

    const oldestRequest = Math.min(...requests);
    const windowEnd = oldestRequest + config.windowMs;
    return Math.max(0, windowEnd - Date.now());
  }

  /**
   * Wait until request is allowed and record it
   */
  async waitAndRecord(serverId: string): Promise<void> {
    const waitTime = this.getWaitTime(serverId);
    if (waitTime > 0) {
      await sleep(waitTime);
    }
    this.recordRequest(serverId);
  }

  private getRequests(serverId: string): number[] {
    return this.requests.get(serverId) ?? [];
  }
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}
