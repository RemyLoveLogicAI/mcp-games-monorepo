import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface PlayerAction {
  playerId: string;
  actionId: string;
  type: 'choice' | 'inventory_use' | 'cast_spell';
  payload: Record<string, any>;
  timestamp: number;
  version: number;
}

export interface RoundState {
  roundNumber: number;
  status: 'waiting' | 'executing' | 'committed' | 'advancing';
  playersReady: Set<string>;
  roundStartedAt: number;
  executionOrder: string[]; // Randomized player order
  playerResponses: Map<string, PlayerAction>;
}

// ═══════════════════════════════════════════════════════════
// TURN EXECUTOR
// ═══════════════════════════════════════════════════════════

export class TurnExecutor {
  private redis: Redis;
  private roundStates: Map<string, RoundState> = new Map();
  private actionTimeout = 60 * 1000; // 60 seconds
  private agent: SelfAwareAgent | null;

  constructor(redis: Redis, agent?: SelfAwareAgent) {
    this.redis = redis;
    this.agent = agent || null;
    this.startTimeoutMonitor();
  }

  /**
   * Initialize a new round for a session
   */
  async initializeRound(sessionId: string, playerIds: string[], traceId: string): Promise<RoundState> {
    const start = Date.now();
    try {
      const roundNumber = await this.getNextRoundNumber(sessionId);

      // Randomize execution order (deterministically using round number as seed)
      const shuffledPlayers = this.shuffleArray([...playerIds], roundNumber);

      const roundState: RoundState = {
        roundNumber,
        status: 'waiting',
        playersReady: new Set(),
        roundStartedAt: Date.now(),
        executionOrder: shuffledPlayers,
        playerResponses: new Map(),
      };

      this.roundStates.set(sessionId, roundState);

      // Persist to Redis
      const key = `round:${sessionId}:${roundNumber}`;
      await this.redis.setex(key, 600, JSON.stringify({
        roundNumber,
        status: 'waiting',
        executionOrder: shuffledPlayers,
        startedAt: roundState.roundStartedAt,
      }));

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:initialize_round',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('turn:round_initialized', {
        sessionId,
        roundNumber,
        playerCount: playerIds.length,
        traceId,
      });

      return roundState;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:initialize_round',
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
   * Submit player action for current round
   */
  async submitAction(
    sessionId: string,
    playerId: string,
    action: PlayerAction,
    traceId: string
  ): Promise<boolean> {
    const start = Date.now();
    try {
      const roundState = this.roundStates.get(sessionId);

      if (!roundState) {
        throw new Error(`No active round for session ${sessionId}`);
      }

      if (roundState.status !== 'waiting') {
        throw new Error(`Round is in ${roundState.status} state, cannot accept actions`);
      }

      // Record action
      roundState.playerResponses.set(playerId, action);
      roundState.playersReady.add(playerId);

      // Store in Redis
      const key = `round_action:${sessionId}:${roundState.roundNumber}:${playerId}`;
      await this.redis.setex(key, 600, JSON.stringify(action));

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:submit_action',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('turn:action_submitted', {
        sessionId,
        playerId,
        actionType: action.type,
        traceId,
      });

      return true;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:submit_action',
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
   * Advance to next round (all players must have submitted)
   */
  async advanceRound(sessionId: string, playerIds: string[], traceId: string): Promise<RoundState> {
    const start = Date.now();
    try {
      const roundState = this.roundStates.get(sessionId);

      if (!roundState) {
        throw new Error(`No active round for session ${sessionId}`);
      }

      // Check if all players have submitted
      const allSubmitted = playerIds.every((id) => roundState.playersReady.has(id));

      if (!allSubmitted) {
        const pendingPlayers = playerIds.filter((id) => !roundState.playersReady.has(id));
        throw new Error(`Waiting for players: ${pendingPlayers.join(', ')}`);
      }

      // Mark round as committed
      roundState.status = 'committed';

      // Initialize next round
      const nextRound = await this.initializeRound(sessionId, playerIds, traceId);

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:advance_round',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('turn:round_advanced', {
        sessionId,
        previousRound: roundState.roundNumber,
        nextRound: nextRound.roundNumber,
        traceId,
      });

      return nextRound;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'turn:advance_round',
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
   * Handle player timeout (auto-submit default action)
   */
  async handlePlayerTimeout(sessionId: string, playerId: string, traceId: string): Promise<void> {
    try {
      const roundState = this.roundStates.get(sessionId);

      if (!roundState || roundState.playersReady.has(playerId)) {
        return; // Already submitted or no round
      }

      // Auto-submit default action (pass/do nothing)
      const defaultAction: PlayerAction = {
        playerId,
        actionId: uuidv4(),
        type: 'choice',
        payload: { choiceId: 'default_pass' },
        timestamp: Date.now(),
        version: 1,
      };

      await this.submitAction(sessionId, playerId, defaultAction, traceId);

      telemetry.emit('turn:player_timeout', {
        sessionId,
        playerId,
        traceId,
      });
    } catch (error) {
      telemetry.emit('turn:timeout_handler:error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
    }
  }

  /**
   * Get current round state
   */
  getRoundState(sessionId: string): RoundState | undefined {
    return this.roundStates.get(sessionId);
  }

  /**
   * Get player action from current round
   */
  getPlayerAction(sessionId: string, playerId: string): PlayerAction | undefined {
    const roundState = this.roundStates.get(sessionId);
    return roundState?.playerResponses.get(playerId);
  }

  /**
   * Get next round number
   */
  private async getNextRoundNumber(sessionId: string): Promise<number> {
    const key = `round_counter:${sessionId}`;
    const counter = await this.redis.incr(key);
    return counter;
  }

  /**
   * Shuffle array deterministically using seed
   */
  private shuffleArray(array: string[], seed: number): string[] {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const rng = Math.sin(seed + i) * 10000;
      const j = Math.floor((rng - Math.floor(rng)) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Monitor and handle player timeouts
   */
  private startTimeoutMonitor(): void {
    setInterval(async () => {
      try {
        const now = Date.now();

        for (const [sessionId, roundState] of this.roundStates.entries()) {
          if (roundState.status === 'waiting') {
            const elapsedMs = now - roundState.roundStartedAt;

            if (elapsedMs > this.actionTimeout) {
              // Timeout all non-responding players
              const allPlayers = Array.from(
                new Set([...roundState.playerResponses.keys(), ...roundState.playersReady])
              );

              for (const playerId of allPlayers) {
                if (!roundState.playersReady.has(playerId)) {
                  await this.handlePlayerTimeout(sessionId, playerId, 'timeout_monitor');
                }
              }
            }
          }
        }
      } catch (error) {
        telemetry.emit('turn:timeout_monitor:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 5000); // Check every 5 seconds
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createTurnExecutor(redis: Redis, agent?: SelfAwareAgent): TurnExecutor {
  return new TurnExecutor(redis, agent);
}
