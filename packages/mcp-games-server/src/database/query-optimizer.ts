import Redis from 'ioredis';
import DataLoader from 'dataloader';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CachedQueryConfig {
  key: string;
  ttl: number; // seconds
  fetcher: () => Promise<any>;
}

// ═══════════════════════════════════════════════════════════
// QUERY OPTIMIZER
// ═══════════════════════════════════════════════════════════

export class QueryOptimizer {
  private redis: Redis;
  private sessionLoader: DataLoader<string, any>;
  private playerLoader: DataLoader<string, any>;

  constructor(
    redis: Redis,
    private db: any // Database connection
  ) {
    this.redis = redis;

    // Initialize DataLoaders for N+1 prevention
    this.sessionLoader = new DataLoader(async (sessionIds: readonly string[]) => {
      return this.batchLoadSessions(Array.from(sessionIds));
    });

    this.playerLoader = new DataLoader(async (playerIds: readonly string[]) => {
      return this.batchLoadPlayers(Array.from(playerIds));
    });
  }

  /**
   * Batch load sessions (N+1 prevention)
   */
  private async batchLoadSessions(sessionIds: string[]): Promise<any[]> {
    const query = `
      SELECT id, game_id, player_id, current_scene_id, health_score, started_at, completed_at
      FROM sessions
      WHERE id = ANY($1)
    `;

    const result = await this.db.query(query, [sessionIds]);

    // Map results back to original order
    const resultMap = new Map(result.rows.map((row: any) => [row.id, row]));
    return sessionIds.map((id) => resultMap.get(id));
  }

  /**
   * Batch load players (N+1 prevention)
   */
  private async batchLoadPlayers(playerIds: string[]): Promise<any[]> {
    const query = `
      SELECT DISTINCT player_id, COUNT(*) as game_count
      FROM sessions
      WHERE player_id = ANY($1)
      GROUP BY player_id
    `;

    const result = await this.db.query(query, [playerIds]);

    const resultMap = new Map(result.rows.map((row: any) => [row.player_id, row]));
    return playerIds.map((id) => resultMap.get(id));
  }

  /**
   * Get session with caching and error handling
   */
  async getSessionById(sessionId: string, traceId: string): Promise<any> {
    const cacheKey = `session:${sessionId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      telemetry.emit('query:cache_hit', { key: cacheKey, traceId });
      return JSON.parse(cached);
    }

    // Use DataLoader for batch query
    const session = await this.sessionLoader.load(sessionId);

    if (session) {
      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(session));
      telemetry.emit('query:cache_miss', { key: cacheKey, traceId });
    }

    return session;
  }

  /**
   * Get sessions by player with caching
   */
  async getSessionsByPlayerId(playerId: string, limit: number = 50, traceId: string): Promise<any[]> {
    const cacheKey = `player_sessions:${playerId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      telemetry.emit('query:cache_hit', { key: cacheKey, traceId });
      return JSON.parse(cached);
    }

    // Query database
    const query = `
      SELECT id, game_id, current_scene_id, health_score, started_at, completed_at
      FROM sessions
      WHERE player_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [playerId, limit]);
    const sessions = result.rows;

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(sessions));
    telemetry.emit('query:cache_miss', { key: cacheKey, traceId });

    return sessions;
  }

  /**
   * Invalidate cache for a session (call on updates)
   */
  async invalidateSessionCache(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
    telemetry.emit('query:cache_invalidated', { key: `session:${sessionId}` });
  }

  /**
   * Invalidate player sessions cache (call on player updates)
   */
  async invalidatePlayerSessionsCache(playerId: string): Promise<void> {
    await this.redis.del(`player_sessions:${playerId}`);
    telemetry.emit('query:cache_invalidated', { key: `player_sessions:${playerId}` });
  }

  /**
   * Get leaderboard with caching (1-hour TTL)
   */
  async getLeaderboard(gameId: string, traceId: string): Promise<any[]> {
    const cacheKey = `leaderboard:${gameId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      telemetry.emit('query:cache_hit', { key: cacheKey, traceId });
      return JSON.parse(cached);
    }

    // Query database
    const query = `
      SELECT player_id, MAX(health_score) as max_health, COUNT(*) as play_count, MAX(completed_at) as last_played
      FROM sessions
      WHERE game_id = $1 AND completed_at IS NOT NULL
      GROUP BY player_id
      ORDER BY max_health DESC, play_count DESC
      LIMIT 100
    `;

    const result = await this.db.query(query, [gameId]);
    const leaderboard = result.rows;

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(leaderboard));
    telemetry.emit('query:cache_miss', { key: cacheKey, traceId });

    return leaderboard;
  }

  /**
   * Invalidate leaderboard cache (call on session completion)
   */
  async invalidateLeaderboardCache(gameId: string): Promise<void> {
    await this.redis.del(`leaderboard:${gameId}`);
    telemetry.emit('query:cache_invalidated', { key: `leaderboard:${gameId}` });
  }

  /**
   * Clear all DataLoader caches
   */
  clearDataLoaderCache(): void {
    this.sessionLoader.clearAll();
    this.playerLoader.clearAll();
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createQueryOptimizer(redis: Redis, db: any): QueryOptimizer {
  return new QueryOptimizer(redis, db);
}
