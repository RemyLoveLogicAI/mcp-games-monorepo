// ═══════════════════════════════════════════════════════════════════════════
// TELEMETRY BUS - Redis Streams for Inter-Tier Communication
// ═══════════════════════════════════════════════════════════════════════════

import Redis from 'ioredis';
import { TelemetryStream, TelemetryEvent } from './types';

type Callback<T = unknown> = (data: T) => void | Promise<void>;

export class TelemetryBus {
  private redis: Redis;
  private subscribers: Map<TelemetryStream, Callback[]> = new Map();
  private consumerRunning: Map<TelemetryStream, boolean> = new Map();
  private consumerGroup = 'omnigents';
  private consumerName: string;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.consumerName = `consumer-${process.pid}-${Date.now()}`;

    this.redis.on('error', (err) => {
      console.error('[TelemetryBus] Redis error:', err.message);
    });

    this.redis.on('connect', () => {
      console.log('[TelemetryBus] Connected to Redis');
    });
  }

  /**
   * Emit an event to a telemetry stream
   */
  async emit<T>(stream: TelemetryStream, data: T): Promise<string> {
    const event: TelemetryEvent<T> = {
      stream,
      data,
      timestamp: Date.now(),
    };

    try {
      const id = await this.redis.xadd(
        stream,
        '*',
        'event', JSON.stringify(event)
      ) as string;

      // Also notify local subscribers
      const subs = this.subscribers.get(stream) || [];
      for (const callback of subs) {
        try {
          await callback(data);
        } catch (err) {
          console.error(`[TelemetryBus] Local subscriber error on ${stream}:`, err);
        }
      }

      return id;
    } catch (err) {
      console.error(`[TelemetryBus] Failed to emit to ${stream}:`, err);
      throw err;
    }
  }

  /**
   * Subscribe to a telemetry stream
   */
  subscribe<T>(stream: TelemetryStream, callback: Callback<T>): () => void {
    const subs = this.subscribers.get(stream) || [];
    subs.push(callback as Callback);
    this.subscribers.set(stream, subs);

    // Start consumer if not already running
    if (!this.consumerRunning.get(stream)) {
      this.startConsumer(stream);
    }

    // Return unsubscribe function
    return () => {
      const currentSubs = this.subscribers.get(stream) || [];
      const idx = currentSubs.indexOf(callback as Callback);
      if (idx > -1) {
        currentSubs.splice(idx, 1);
        this.subscribers.set(stream, currentSubs);
      }
    };
  }

  /**
   * Start a consumer for a stream using Redis consumer groups
   */
  private async startConsumer(stream: TelemetryStream): Promise<void> {
    if (this.consumerRunning.get(stream)) return;
    this.consumerRunning.set(stream, true);

    // Ensure consumer group exists
    try {
      await this.redis.xgroup('CREATE', stream, this.consumerGroup, '0', 'MKSTREAM');
    } catch (err: any) {
      // Group already exists - that's fine
      if (!err.message.includes('BUSYGROUP')) {
        console.error(`[TelemetryBus] Error creating consumer group for ${stream}:`, err);
      }
    }

    // Start consuming
    this.consumeStream(stream);
  }

  /**
   * Consume messages from a stream
   */
  private async consumeStream(stream: TelemetryStream): Promise<void> {
    while (this.consumerRunning.get(stream)) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP', this.consumerGroup, this.consumerName,
          'COUNT', 10,
          'BLOCK', 5000,
          'STREAMS', stream, '>'
        ) as [string, [string, string[]][]][] | null;

        if (results) {
          for (const [streamName, messages] of results) {
            for (const [id, fields] of messages) {
              await this.processMessage(stream, id, fields as unknown as string[]);
            }
          }
        }
      } catch (err) {
        console.error(`[TelemetryBus] Error consuming ${stream}:`, err);
        await this.sleep(1000); // Back off on error
      }
    }
  }

  /**
   * Process a message from a stream
   */
  private async processMessage(
    stream: TelemetryStream,
    id: string,
    fields: string[]
  ): Promise<void> {
    try {
      // Parse event data
      const eventJson = fields[1]; // ['event', '{"..."}']
      const event: TelemetryEvent = JSON.parse(eventJson);

      // Notify subscribers
      const subs = this.subscribers.get(stream) || [];
      for (const callback of subs) {
        try {
          await callback(event.data);
        } catch (err) {
          console.error(`[TelemetryBus] Subscriber error on ${stream}:`, err);
        }
      }

      // Acknowledge message
      await this.redis.xack(stream, this.consumerGroup, id);
    } catch (err) {
      console.error(`[TelemetryBus] Error processing message ${id}:`, err);
    }
  }

  /**
   * Get recent events from a stream (for debugging/replay)
   */
  async getRecent<T>(stream: TelemetryStream, count = 100): Promise<TelemetryEvent<T>[]> {
    const results = await this.redis.xrevrange(stream, '+', '-', 'COUNT', count);

    return results.map(([id, fields]) => {
      const event: TelemetryEvent<T> = JSON.parse(fields[1]);
      return event;
    });
  }

  /**
   * Get stream info
   */
  async getStreamInfo(stream: TelemetryStream): Promise<{
    length: number;
    firstEntry: string | null;
    lastEntry: string | null;
  }> {
    const info = await this.redis.xinfo('STREAM', stream);
    const infoMap = this.parseXInfo(info as unknown as any[]);

    return {
      length: infoMap.get('length') as number || 0,
      firstEntry: infoMap.get('first-entry')?.[0] || null,
      lastEntry: infoMap.get('last-entry')?.[0] || null,
    };
  }

  /**
   * Trim stream to max length (for retention)
   */
  async trimStream(stream: TelemetryStream, maxLength: number): Promise<number> {
    return this.redis.xtrim(stream, 'MAXLEN', '~', maxLength);
  }

  /**
   * Clean up old entries (run periodically)
   */
  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const streams: TelemetryStream[] = [
      'tier0:telemetry',
      'tier0:health',
      'tier0:state',
      'tier1:escalation',
      'tier1:recovery',
      'tier2:status',
      'tier3:hitl',
    ];

    const cutoffTime = Date.now() - maxAge;

    for (const stream of streams) {
      try {
        // Get entries older than cutoff
        const entries = await this.redis.xrange(stream, '-', cutoffTime.toString());

        if (entries.length > 0) {
          const ids = entries.map(([id]) => id);
          await this.redis.xdel(stream, ...ids);
          console.log(`[TelemetryBus] Cleaned ${ids.length} entries from ${stream}`);
        }
      } catch (err) {
        // Stream might not exist yet
      }
    }
  }

  /**
   * Stop all consumers
   */
  async stop(): Promise<void> {
    for (const stream of this.consumerRunning.keys()) {
      this.consumerRunning.set(stream, false);
    }
    await this.redis.quit();
  }

  private parseXInfo(info: any[]): Map<string, any> {
    const map = new Map();
    for (let i = 0; i < info.length; i += 2) {
      map.set(info[i], info[i + 1]);
    }
    return map;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let instance: TelemetryBus | null = null;

export function getTelemetryBus(): TelemetryBus {
  if (!instance) {
    instance = new TelemetryBus();
  }
  return instance;
}

export const telemetryBus = getTelemetryBus();
