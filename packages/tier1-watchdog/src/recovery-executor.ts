// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: RECOVERY EXECUTOR
// Executes recovery commands and verifies success
// ═══════════════════════════════════════════════════════════════════════════

import { sleep } from '@omnigents/shared';

export interface ExecutionResult {
  command: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

/**
 * Executes recovery commands.
 * In production, this would shell out to actual commands or call service APIs.
 * For Sprint 1, we simulate execution for safe local development.
 */
export class RecoveryExecutor {

  /**
   * Execute a recovery command with timeout
   */
  async execute(command: string, timeout: number): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await this.withTimeout(
        this.runCommand(command),
        timeout
      );

      return {
        command,
        success: true,
        output: result,
        durationMs: Date.now() - startTime,
      };

    } catch (err: any) {
      return {
        command,
        success: false,
        error: err.message || 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a sequence of commands, stopping on first failure
   */
  async executeSequence(
    commands: string[],
    timeout: number
  ): Promise<{ results: ExecutionResult[]; allSucceeded: boolean }> {
    const results: ExecutionResult[] = [];

    for (const cmd of commands) {
      const result = await this.execute(cmd, timeout);
      results.push(result);

      if (!result.success) {
        return { results, allSucceeded: false };
      }
    }

    return { results, allSucceeded: true };
  }

  /**
   * Simulate command execution (Sprint 1).
   * In production, this would fork a process or call an API.
   */
  private async runCommand(command: string): Promise<string> {
    const [action, ...args] = command.split(':');

    switch (action) {
      case 'retry':
        // Simulate retry logic
        await sleep(1000);
        return `Retried ${args.join(':')} successfully`;

      case 'runtime':
        if (args[0] === 'gc' && args[1] === 'force') {
          if (global.gc) {
            global.gc();
            return 'Forced GC completed';
          }
          return 'GC not available (run with --expose-gc)';
        }
        return `Runtime command: ${args.join(':')}`;

      case 'config':
        // Simulate config change
        await sleep(500);
        return `Config updated: ${args.join(':')}`;

      case 'service':
        if (args[0] === 'restart') {
          // In production: actually restart service
          await sleep(2000);
          return `Service ${args[1]} restart initiated`;
        }
        return `Service command: ${args.join(':')}`;

      case 'fallback':
        await sleep(500);
        return `Fallback enabled for ${args[0]}`;

      case 'wait':
        const waitMs = parseInt(args[0], 10) || 5000;
        // Cap wait at 10s for Sprint 1 testing
        await sleep(Math.min(waitMs, 10000));
        return `Waited ${waitMs}ms`;

      case 'log':
        console.log(`[RECOVERY] Log: ${args.join(':')}`);
        return `Logged: ${args.join(':')}`;

      default:
        return `Unknown command: ${command}`;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Command timed out after ${ms}ms`)), ms)
      ),
    ]);
  }
}
