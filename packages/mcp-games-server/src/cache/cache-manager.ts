import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags?: string[];
}

export interface CacheStats {
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalRequests: number;
}

// ═══════════════════════════════════════════════════════════
// CACHE MANAGER
// ═══════════════════════════════════════════════════════════

export class CacheManager extends EventEmitter {
  private redis: Redis;
  private hitCount: number = 0;
  private missCount: number = 0;

  // Cache layer configurations
  private objectCacheTTL = 5 * 60; // 5 minutes
  private queryCacheTTL = 60 * 60; // 1 hour
  private httpCacheTTL = 30 * 60; // 30 minutes

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.startMonitoring();
  }

  /**
   * Start cache monitoring (track hit rates, memory usage)
   */
  private startMonitoring(): void {
    setInterval(async () => {
      const stats = this.getStats();
      telemetry.emit('cache:stats', {
        hitRate: stats.hitRate.toFixed(2),
        totalRequests: stats.totalRequests,
        hitCount: stats.hitCount,
        missCount: stats.missCount,
      });
    }, 60000); // Every 60 seconds
  }

  /**
   * Get from object cache layer
   */
  async getObject<T>(key: string, traceId: string): Promise<T | null> {
    try {
      const value = await this.redis.get(`obj:${key}`);

      if (value) {
        this.hitCount++;
        telemetry.emit('cache:hit', { layer: 'object', key, traceId });
        return JSON.parse(value) as T;
      }

      this.missCount++;
      telemetry.emit('cache:miss', { layer: 'object', key, traceId });
      return null;
    } catch (error) {
      telemetry.emit('cache:error', {
        layer: 'object',
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      return null;
    }
  }

  /**
   * Set object in cache layer
   */
  async setObject<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    try {
      const effectiveTTL = ttl || this.objectCacheTTL;
      const cacheValue: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + effectiveTTL * 1000,
        tags,
      };

      await this.redis.setex(`obj:${key}`, effectiveTTL, JSON.stringify(cacheValue));

      // Store tags for invalidation
      if (tags) {
        for (const tag of tags) {
          await this.redis.sadd(`cache:tag:${tag}`, `obj:${key}`);
        }
      }

      telemetry.emit('cache:set', { layer: 'object', key, ttl: effectiveTTL });
    } catch (error) {
      telemetry.emit('cache:error', {
        layer: 'object',
        operation: 'set',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get from query cache layer
   */
  async getQuery<T>(key: string, traceId: string): Promise<T | null> {
    try {
      const value = await this.redis.get(`query:${key}`);

      if (value) {
        this.hitCount++;
        telemetry.emit('cache:hit', { layer: 'query', key, traceId });
        return JSON.parse(value) as T;
      }

      this.missCount++;
      telemetry.emit('cache:miss', { layer: 'query', key, traceId });
      return null;
    } catch (error) {
      telemetry.emit('cache:error', {
        layer: 'query',
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      return null;
    }
  }

  /**
   * Set query result in cache layer
   */
  async setQuery<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    try {
      const effectiveTTL = ttl || this.queryCacheTTL;
      const cacheValue: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + effectiveTTL * 1000,
        tags,
      };

      await this.redis.setex(`query:${key}`, effectiveTTL, JSON.stringify(cacheValue));

      // Store tags for invalidation
      if (tags) {
        for (const tag of tags) {
          await this.redis.sadd(`cache:tag:${tag}`, `query:${key}`);
        }
      }

      telemetry.emit('cache:set', { layer: 'query', key, ttl: effectiveTTL });
    } catch (error) {
      telemetry.emit('cache:error', {
        layer: 'query',
        operation: 'set',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Invalidate cache entries by tag
   */
  async invalidateByTag(tag: string): Promise<void> {
    try {
      const cacheKeys = await this.redis.smembers(`cache:tag:${tag}`);

      if (cacheKeys.length > 0) {
        await this.redis.del(...cacheKeys);
        await this.redis.del(`cache:tag:${tag}`);

        telemetry.emit('cache:invalidate_by_tag', { tag, count: cacheKeys.length });
      }
    } catch (error) {
      telemetry.emit('cache:error', {
        operation: 'invalidate_by_tag',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Invalidate single cache entry
   */
  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(`obj:${key}`, `query:${key}`);
      telemetry.emit('cache:invalidate', { key });
    } catch (error) {
      telemetry.emit('cache:error', {
        operation: 'invalidate',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      const pattern = '*';
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      this.hitCount = 0;
      this.missCount = 0;

      telemetry.emit('cache:cleared', { keysDeleted: keys.length });
    } catch (error) {
      telemetry.emit('cache:error', {
        operation: 'clear',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests === 0 ? 0 : (this.hitCount / totalRequests) * 100;

    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate,
      totalRequests,
    };
  }

  /**
   * Warmup cache with hot data
   */
  async warmup(hotDataLoader: () => Promise<Map<string, any>>): Promise<void> {
    try {
      const hotData = await hotDataLoader();

      let count = 0;
      for (const [key, value] of hotData) {
        await this.setObject(key, value, this.objectCacheTTL, ['warmup']);
        count++;
      }

      telemetry.emit('cache:warmed', { entriesLoaded: count });
    } catch (error) {
      telemetry.emit('cache:error', {
        operation: 'warmup',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createCacheManager(redis: Redis): CacheManager {
  return new CacheManager(redis);
}
