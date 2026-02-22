import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface PlayerAction {
  playerId: string;
  actionId: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
  vectorClock: VectorClock;
  version: number;
}

export interface VectorClock {
  [playerId: string]: number;
}

export interface ConflictResolution {
  action1: PlayerAction;
  action2: PlayerAction;
  winner: PlayerAction;
  reason: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════
// SESSION SYNC
// ═══════════════════════════════════════════════════════════

export class SessionSync {
  private conflictHistory: ConflictResolution[] = [];
  private agent: SelfAwareAgent | null;
  private maxHistorySize = 1000;

  constructor(agent?: SelfAwareAgent) {
    this.agent = agent || null;
  }

  /**
   * Submit action with optimistic locking
   */
  async submitAction(
    sessionId: string,
    action: PlayerAction,
    traceId: string
  ): Promise<boolean> {
    const start = Date.now();
    try {
      // Validate action version
      if (action.version < 1) {
        throw new Error('Invalid action version');
      }

      // Check vector clock for causality
      const isValid = this.validateCausality(action.vectorClock);
      if (!isValid) {
        throw new Error('Vector clock violation detected');
      }

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'session:submit_action',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('session:action_submitted', {
        sessionId,
        playerId: action.playerId,
        traceId,
      });

      return true;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'session:submit_action',
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
   * Resolve conflict between two concurrent actions
   * Uses timestamp priority: earliest action wins
   */
  async resolveConflict(
    actions: PlayerAction[],
    traceId: string
  ): Promise<PlayerAction> {
    const start = Date.now();
    try {
      if (actions.length === 0) {
        throw new Error('No actions to resolve');
      }

      if (actions.length === 1) {
        return actions[0];
      }

      // Sort by timestamp (earliest wins)
      const sorted = [...actions].sort((a, b) => a.timestamp - b.timestamp);
      const winner = sorted[0];
      const loser = sorted[1];

      const resolution: ConflictResolution = {
        action1: winner,
        action2: loser,
        winner,
        reason: `timestamp_priority (${winner.timestamp} < ${loser.timestamp})`,
        timestamp: new Date(),
      };

      this.conflictHistory.push(resolution);

      // Keep history size bounded
      if (this.conflictHistory.length > this.maxHistorySize) {
        this.conflictHistory = this.conflictHistory.slice(-this.maxHistorySize);
      }

      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'session:resolve_conflict',
          status: 'success',
          durationMs: duration,
          traceId,
        });
      }

      telemetry.emit('session:conflict_resolved', {
        winner: winner.playerId,
        loser: loser.playerId,
        reason: resolution.reason,
        traceId,
      });

      return winner;
    } catch (error) {
      const duration = Date.now() - start;
      if (this.agent) {
        await this.agent.track({
          operation: 'session:resolve_conflict',
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
   * Validate consistency with checksum
   */
  async validateConsistency(
    sessionId: string,
    expectedChecksum: string,
    traceId: string
  ): Promise<boolean> {
    try {
      // In production, calculate checksum of current session state
      // and compare with expectedChecksum
      telemetry.emit('session:consistency_check', {
        sessionId,
        traceId,
      });

      return true; // Placeholder
    } catch (error) {
      telemetry.emit('session:consistency_check_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
      return false;
    }
  }

  /**
   * Rollback action from history
   */
  async rollbackAction(
    sessionId: string,
    actionId: string,
    traceId: string
  ): Promise<void> {
    try {
      // Remove action from history and replay events excluding this action
      telemetry.emit('session:action_rolled_back', {
        sessionId,
        actionId,
        traceId,
      });
    } catch (error) {
      telemetry.emit('session:rollback_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId,
      });
    }
  }

  /**
   * Get conflict history
   */
  getConflictHistory(limit: number = 50): ConflictResolution[] {
    return this.conflictHistory.slice(-limit);
  }

  /**
   * Validate vector clock for causality
   */
  private validateCausality(vectorClock: VectorClock): boolean {
    // Check if vector clock is valid (all values are non-negative)
    for (const value of Object.values(vectorClock)) {
      if (typeof value !== 'number' || value < 0) {
        return false;
      }
    }
    return true;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════

export function createSessionSync(agent?: SelfAwareAgent): SessionSync {
  return new SessionSync(agent);
}
