import { Context } from 'telegraf';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface VoiceCallState {
  callId: string;
  initiatorId: string;
  recipientId: string;
  sessionId: string;
  status: 'pending' | 'active' | 'completed' | 'rejected' | 'failed';
  initiatedAt: Date;
  acceptedAt?: Date;
  endedAt?: Date;
  duration?: number; // seconds
  reason?: string; // rejection reason
}

// ═══════════════════════════════════════════════════════════
// VOICE CALL HANDLER
// ═══════════════════════════════════════════════════════════

export class VoiceCallHandler {
  private redis: Redis;
  private callTTL = 5 * 60; // 5 minutes
  private agent: SelfAwareAgent | null;

  constructor(redis: Redis, agent?: SelfAwareAgent) {
    this.redis = redis;
    this.agent = agent || null;
    this.startTimeoutMonitor();
  }

  /**
   * Initialize a voice call (initiator calls recipient)
   */
  async initializeCall(
    initiatorId: string,
    recipientId: string,
    sessionId: string,
    traceId: string
  ): Promise<VoiceCallState> {
    const start = Date.now();
    try {
      const callId = uuidv4();
      const now = new Date();

      const callState: VoiceCallState = {
        callId,
        initiatorId,
        recipientId,
        sessionId,
        status: 'pending',
        initiatedAt: now,
      };

      // Store in Redis with TTL
      const key = `voice_call:${callId}`;
      await this.redis.setex(key, this.callTTL, JSON.stringify(callState));

      // Track in user's active calls
      await this.redis.sadd(`user_calls:${initiatorId}`, callId);
      await this.redis.sadd(`user_calls:${recipientId}`, callId);

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:initialize_call',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('voice:call:initiated', { callId, initiatorId, recipientId, traceId });
      return callState;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:initialize_call',
          status: 'failure',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Accept a pending call
   */
  async acceptCall(callId: string, traceId: string): Promise<VoiceCallState> {
    const start = Date.now();
    try {
      const key = `voice_call:${callId}`;
      const data = await this.redis.get(key);

      if (!data) {
        throw new Error(`Call ${callId} not found or expired`);
      }

      const callState: VoiceCallState = JSON.parse(data);

      if (callState.status !== 'pending') {
        throw new Error(`Call is already ${callState.status}`);
      }

      callState.status = 'active';
      callState.acceptedAt = new Date();

      // Update in Redis
      await this.redis.setex(key, this.callTTL, JSON.stringify(callState));

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:accept_call',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('voice:call:accepted', { callId, traceId });
      return callState;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:accept_call',
          status: 'failure',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Reject a pending call
   */
  async rejectCall(callId: string, reason: string = 'User declined', traceId: string): Promise<VoiceCallState> {
    const start = Date.now();
    try {
      const key = `voice_call:${callId}`;
      const data = await this.redis.get(key);

      if (!data) {
        throw new Error(`Call ${callId} not found or expired`);
      }

      const callState: VoiceCallState = JSON.parse(data);

      if (callState.status !== 'pending') {
        throw new Error(`Cannot reject call with status ${callState.status}`);
      }

      callState.status = 'rejected';
      callState.endedAt = new Date();
      callState.reason = reason;

      // Keep in Redis briefly for history
      await this.redis.setex(key, 60, JSON.stringify(callState));

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:reject_call',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('voice:call:rejected', { callId, reason, traceId });
      return callState;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:reject_call',
          status: 'failure',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * End an active call
   */
  async endCall(callId: string, traceId: string): Promise<VoiceCallState> {
    const start = Date.now();
    try {
      const key = `voice_call:${callId}`;
      const data = await this.redis.get(key);

      if (!data) {
        throw new Error(`Call ${callId} not found or expired`);
      }

      const callState: VoiceCallState = JSON.parse(data);

      if (callState.status !== 'active') {
        throw new Error(`Cannot end call with status ${callState.status}`);
      }

      callState.status = 'completed';
      callState.endedAt = new Date();
      callState.duration = Math.floor(
        (callState.endedAt.getTime() - (callState.acceptedAt?.getTime() || callState.initiatedAt.getTime())) /
          1000
      );

      // Keep in Redis briefly for history
      await this.redis.setex(key, 60, JSON.stringify(callState));

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:end_call',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('voice:call:ended', { callId, duration: callState.duration, traceId });
      return callState;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'voice:end_call',
          status: 'failure',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs: duration,
          traceId,
        });
      }
      throw error;
    }
  }

  /**
   * Handle call timeout (auto-disconnect after 5 min inactivity)
   */
  private startTimeoutMonitor(): void {
    setInterval(async () => {
      try {
        const keys = await this.redis.keys('voice_call:*');
        const now = Date.now();

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            const callState: VoiceCallState = JSON.parse(data);

            // Check if call is stale (older than 5 minutes)
            if (now - callState.initiatedAt.getTime() > this.callTTL * 1000) {
              if (callState.status === 'active') {
                callState.status = 'failed';
                callState.endedAt = new Date();
                callState.reason = 'Timeout';
                callState.duration = Math.floor(
                  (callState.endedAt.getTime() - (callState.acceptedAt?.getTime() || callState.initiatedAt.getTime())) /
                    1000
                );

                await this.redis.setex(key, 60, JSON.stringify(callState));
                telemetry.emit('voice:call:timeout', { callId: callState.callId });
              }
            }
          }
        }
      } catch (error) {
        telemetry.emit('voice:timeout_monitor:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get call history for user
   */
  async getCallHistory(userId: string, limit: number = 50, traceId: string): Promise<VoiceCallState[]> {
    try {
      const callIds = await this.redis.smembers(`user_calls:${userId}`);
      const calls: VoiceCallState[] = [];

      for (const callId of callIds.slice(0, limit)) {
        const key = `voice_call:${callId}`;
        const data = await this.redis.get(key);

        if (data) {
          calls.push(JSON.parse(data));
        }
      }

      return calls.sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
    } catch (error) {
      telemetry.emit('voice:get_history:error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createVoiceCallHandler(redis: Redis, agent?: SelfAwareAgent): VoiceCallHandler {
  return new VoiceCallHandler(redis, agent);
}
