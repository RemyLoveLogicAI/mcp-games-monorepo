// ═══════════════════════════════════════════════════════════════════════════
// Shared Utilities
// ═══════════════════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';

/**
 * Generate a unique ID
 */
export function generateId(length = 12): string {
  return nanoid(length);
}

/**
 * Generate a trace ID for distributed tracing
 */
export function generateTraceId(): string {
  return `trace-${nanoid(16)}`;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format uptime in human-readable format
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Calculate error rate from counts
 */
export function calculateErrorRate(errors: number, total: number): number {
  if (total === 0) return 0;
  return errors / total;
}

/**
 * Health score to status mapping
 */
export function healthScoreToStatus(score: number): 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN' {
  if (score === undefined || score === null) return 'UNKNOWN';
  if (score >= 70) return 'OK';
  if (score >= 40) return 'DEGRADED';
  return 'CRITICAL';
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 30000 } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      await sleep(delay + jitter);
    }
  }
  
  throw lastError;
}

/**
 * Timeout a promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
}
