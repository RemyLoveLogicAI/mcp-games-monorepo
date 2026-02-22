import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { telemetry } from '../observability/index.js';
import os from 'os';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RateLimitConfig {
  defaultLimit: number; // requests per window
  windowSize: number; // seconds
  burstAllowance: number; // % over limit (e.g., 0.2 = 20%)
  adaptiveThresholds: {
    cpuHigh: number; // 80%
    cpuLow: number; // 50%
    scaleUp: number; // 1.5x limit
    scaleDown: number; // 0.8x limit
  };
  endpointLimits: {
    [endpoint: string]: number;
  };
}

export interface RateLimitState {
  userId: string;
  endpoint: string;
  requestCount: number;
  windowStart: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

// ═══════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;
  private cpuUsageCache: number = 50; // Start at 50%

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
    this.startCPUMonitoring();
  }

  /**
   * Monitor CPU usage and adjust limits dynamically
   */
  private startCPUMonitoring(): void {
    setInterval(async () => {
      try {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (const cpu of cpus) {
          for (const type in cpu.times) {
            totalTick += cpu.times[type as keyof typeof cpu.times];
          }
          totalIdle += cpu.times.idle;
        }

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        this.cpuUsageCache = 100 - ~~(100 * idle / total);

        // Adjust limits dynamically
        await this.adjustLimitsDynamic(this.cpuUsageCache);
      } catch (error) {
        // Silently ignore CPU monitoring errors
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Adjust rate limits based on CPU usage
   */
  async adjustLimitsDynamic(cpuUsage: number): Promise<void> {
    const scaler =
      cpuUsage > this.config.adaptiveThresholds.cpuHigh
        ? this.config.adaptiveThresholds.scaleDown
        : cpuUsage < this.config.adaptiveThresholds.cpuLow
        ? this.config.adaptiveThresholds.scaleUp
        : 1.0;

    await this.redis.set(
      'rate_limit:cpu_scaler',
      scaler.toString(),
      'EX',
      300 // 5 minutes
    );
  }

  /**
   * Check rate limit for user and endpoint
   */
  async checkLimit(userId: string, endpoint: string, traceId: string): Promise<RateLimitState> {
    const key = `rate_limit:${userId}:${endpoint}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - this.config.windowSize;

    // Remove old entries (outside window)
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const requestCount = await this.redis.zcard(key);

    // Get current limit (with adaptive scaling)
    const scaler = parseFloat(
      (await this.redis.get('rate_limit:cpu_scaler')) || '1.0'
    );
    const baseLimit = this.config.endpointLimits[endpoint] || this.config.defaultLimit;
    const scaledLimit = Math.floor(baseLimit * scaler);
    const allowedLimit = Math.floor(scaledLimit * (1 + this.config.burstAllowance));

    // Calculate reset time
    const resetAt = now + this.config.windowSize;

    return {
      userId,
      endpoint,
      requestCount,
      windowStart,
      limit: scaledLimit,
      remaining: Math.max(0, allowedLimit - requestCount),
      resetAt,
    };
  }

  /**
   * Record a request for rate limiting
   */
  async recordRequest(userId: string, endpoint: string, traceId: string): Promise<void> {
    const key = `rate_limit:${userId}:${endpoint}`;
    const now = Date.now();

    // Add timestamp to sorted set
    await this.redis.zadd(key, now, `${now}:${traceId}`);

    // Set expiration to window size + 60 seconds
    await this.redis.expire(key, this.config.windowSize + 60);
  }

  /**
   * Check if request should be allowed
   */
  async isAllowed(userId: string, endpoint: string, traceId: string): Promise<boolean> {
    const state = await this.checkLimit(userId, endpoint, traceId);
    return state.requestCount < Math.floor(state.limit * (1 + this.config.burstAllowance));
  }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

export function createRateLimitMiddleware(rateLimiter: RateLimiter) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const traceId = req.headers['x-trace-id'] as string || 'unknown';
    const userId = (req as any).auth?.userId || req.ip || 'anonymous';
    const endpoint = req.route?.path || req.path;

    try {
      // Check rate limit
      const state = await rateLimiter.checkLimit(userId, endpoint, traceId);
      const allowed = await rateLimiter.isAllowed(userId, endpoint, traceId);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', state.limit);
      res.setHeader('X-RateLimit-Remaining', state.remaining);
      res.setHeader('X-RateLimit-Reset', state.resetAt);

      if (!allowed) {
        telemetry.emit('rate_limit:exceeded', {
          userId,
          endpoint,
          limit: state.limit,
          traceId,
        });

        const retryAfter = state.resetAt - Math.floor(Date.now() / 1000);
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter,
        });
      }

      // Record successful request
      await rateLimiter.recordRequest(userId, endpoint, traceId);

      telemetry.emit('rate_limit:allowed', {
        userId,
        endpoint,
        remaining: state.remaining,
        traceId,
      });

      next();
    } catch (error) {
      // Graceful degradation: allow request if rate limiter fails
      telemetry.emit('rate_limit:error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      next();
    }
  };
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createRateLimiter(redis: Redis): RateLimiter {
  const config: RateLimitConfig = {
    defaultLimit: 100, // 100 requests per minute
    windowSize: 60, // 1 minute
    burstAllowance: 0.2, // 20% burst allowance
    adaptiveThresholds: {
      cpuHigh: 80,
      cpuLow: 50,
      scaleUp: 1.5,
      scaleDown: 0.8,
    },
    endpointLimits: {
      '/api/games/list': 1000,
      '/api/agents/execute': 100,
      '/api/sessions/create': 50,
      '/api/voice/call': 200,
    },
  };

  return new RateLimiter(redis, config);
}
