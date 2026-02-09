// ═══════════════════════════════════════════════════════════════════════════
// TIER 0: SELF-AWARE AGENT RUNTIME
// The foundation layer that observes itself and emits telemetry
// ═══════════════════════════════════════════════════════════════════════════

import { 
  AgentState, 
  MemoryUsage, 
  CpuUsage, 
  ErrorInfo,
  OperationTelemetry,
  OperationContext,
  Tier0HealthEvent,
  telemetryBus,
  generateId,
  generateTraceId,
  healthScoreToStatus
} from '@omnigents/shared';

export class SelfAwareAgent {
  private state: AgentState;
  private operations: Map<string, OperationTelemetry> = new Map();
  private telemetryBuffer: OperationTelemetry[] = [];
  private operationCounts = { total: 0, errors: 0 };
  private latencies: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;

  constructor(
    private readonly serviceId: string,
    private readonly serviceName: string
  ) {
    this.state = this.initializeState();
    this.startSelfMonitoring();
    console.log(`[TIER0] ${serviceName} agent initialized (${serviceId})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPERATION TRACKING: Wrap any async operation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Track an async operation with automatic telemetry
   */
  async track<T>(
    operationType: string,
    context: OperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    const opId = generateId(8);
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    this.state.activeOperations++;
    this.operationCounts.total++;

    const telemetry: OperationTelemetry = {
      operationId: opId,
      operationType,
      service: this.serviceName,
      startTime: Date.now(),
      status: 'in_progress',
      context,
    };

    this.operations.set(opId, telemetry);

    try {
      const result = await operation();

      const duration = performance.now() - startTime;
      telemetry.endTime = Date.now();
      telemetry.duration = duration;
      telemetry.status = 'success';
      telemetry.memoryDelta = process.memoryUsage().heapUsed - startMemory;

      this.recordLatency(duration);
      this.bufferTelemetry(telemetry);

      return result;

    } catch (error: any) {
      const duration = performance.now() - startTime;
      telemetry.endTime = Date.now();
      telemetry.duration = duration;
      telemetry.status = 'failure';
      telemetry.error = {
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN',
        stack: error.stack,
        recoverable: this.isRecoverable(error),
        timestamp: Date.now(),
      };

      this.operationCounts.errors++;
      this.state.errorCount++;
      this.state.lastError = telemetry.error;

      this.bufferTelemetry(telemetry);
      this.emitHealthEvent('OPERATION_FAILED', {
        operationType,
        error: telemetry.error,
        duration,
      });

      throw error;

    } finally {
      this.state.activeOperations--;
      this.operations.delete(opId);
    }
  }

  /**
   * Track a sync operation (wraps in async)
   */
  trackSync<T>(
    operationType: string,
    context: OperationContext,
    operation: () => T
  ): Promise<T> {
    return this.track(operationType, context, async () => operation());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-MONITORING: Continuous health checks
  // ═══════════════════════════════════════════════════════════════════════════

  private initializeState(): AgentState {
    return {
      id: this.serviceId,
      service: this.serviceName,
      uptime: 0,
      memory: this.getMemoryUsage(),
      cpu: this.getCpuUsage(),
      healthScore: 100,
      activeOperations: 0,
      errorCount: 0,
      lastError: null,
      avgLatency: 0,
      errorRate: 0,
      throughput: 0,
    };
  }

  private startSelfMonitoring(): void {
    // Health check every 5 seconds
    setInterval(() => {
      this.updateState();
      this.performSelfChecks();
      this.emitStateSnapshot();
    }, 5000);

    // Telemetry flush every 1 second
    setInterval(() => {
      this.flushTelemetryBuffer();
    }, 1000);

    // Metrics reset every minute (for per-minute calculations)
    setInterval(() => {
      this.resetPeriodicMetrics();
    }, 60000);
  }

  private updateState(): void {
    this.state = {
      ...this.state,
      uptime: process.uptime(),
      memory: this.getMemoryUsage(),
      cpu: this.getCpuUsage(),
      healthScore: this.calculateHealthScore(),
      avgLatency: this.calculateAvgLatency(),
      errorRate: this.calculateErrorRate(),
      throughput: this.operationCounts.total,
    };
  }

  private getMemoryUsage(): MemoryUsage {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    };
  }

  private getCpuUsage(): CpuUsage {
    const cpu = process.cpuUsage();
    return {
      user: cpu.user,
      system: cpu.system,
    };
  }

  /**
   * Calculate health score (0-100)
   */
  private calculateHealthScore(): number {
    let score = 100;

    // Memory pressure (-30 max)
    const memPercent = this.state.memory.heapUsed / this.state.memory.heapTotal;
    if (memPercent > 0.9) score -= 30;
    else if (memPercent > 0.8) score -= 15;
    else if (memPercent > 0.7) score -= 5;

    // Recent errors (-25 max)
    if (this.state.lastError) {
      const errorAge = Date.now() - (this.state.lastError.timestamp || 0);
      if (errorAge < 60000) score -= 25;        // Within 1 minute
      else if (errorAge < 300000) score -= 10;  // Within 5 minutes
    }

    // Active operations load (-15 max)
    if (this.state.activeOperations > 100) score -= 15;
    else if (this.state.activeOperations > 50) score -= 5;

    // Error rate (-30 max)
    const errorRate = this.calculateErrorRate();
    if (errorRate > 0.1) score -= 30;      // >10% errors
    else if (errorRate > 0.05) score -= 15; // >5% errors
    else if (errorRate > 0.01) score -= 5;  // >1% errors

    return Math.max(0, Math.min(100, score));
  }

  private calculateAvgLatency(): number {
    if (this.latencies.length === 0) return 0;
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    return sum / this.latencies.length;
  }

  private calculateErrorRate(): number {
    if (this.operationCounts.total === 0) return 0;
    return this.operationCounts.errors / this.operationCounts.total;
  }

  private recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > this.MAX_LATENCY_SAMPLES) {
      this.latencies.shift();
    }
  }

  private resetPeriodicMetrics(): void {
    this.operationCounts = { total: 0, errors: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-HEALING: Basic remediation at Tier 0
  // ═══════════════════════════════════════════════════════════════════════════

  private performSelfChecks(): void {
    // Check 1: Memory pressure → trigger GC
    const memPercent = this.state.memory.heapUsed / this.state.memory.heapTotal;
    if (memPercent > 0.85) {
      this.selfHeal('MEMORY_PRESSURE', () => {
        if (global.gc) {
          global.gc();
          console.log(`[TIER0] ${this.serviceName}: Triggered GC due to memory pressure`);
          return true;
        }
        return false;
      });
    }

    // Check 2: Too many active operations → signal backpressure
    if (this.state.activeOperations > 100) {
      this.emitHealthEvent('BACKPRESSURE_NEEDED', {
        activeOperations: this.state.activeOperations,
        suggestedAction: 'APPLY_BACKPRESSURE',
      });
    }

    // Check 3: Health score critical → alert Tier 1
    if (this.state.healthScore < 40) {
      this.emitHealthEvent('HEALTH_CRITICAL', {
        healthScore: this.state.healthScore,
        suggestedAction: 'TIER1_INTERVENTION',
      });
    }

    // Check 4: Health score degraded → early warning
    if (this.state.healthScore < 70 && this.state.healthScore >= 40) {
      this.emitHealthEvent('HEALTH_DEGRADED', {
        healthScore: this.state.healthScore,
        suggestedAction: 'MONITOR',
      });
    }
  }

  private selfHeal(issue: string, healFn: () => boolean): void {
    const startTime = Date.now();
    const success = healFn();

    const telemetry: OperationTelemetry = {
      operationId: generateId(8),
      operationType: `self_heal:${issue}`,
      service: this.serviceName,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      status: success ? 'success' : 'failure',
      context: { traceId: generateTraceId() },
    };

    this.bufferTelemetry(telemetry);
  }

  private isRecoverable(error: any): boolean {
    // Network errors are usually recoverable
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    // Rate limits are recoverable
    if (error.status === 429) {
      return true;
    }
    // Server errors might be recoverable
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    // Default to not recoverable
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY EMISSION: Send to Tier 1
  // ═══════════════════════════════════════════════════════════════════════════

  private bufferTelemetry(telemetry: OperationTelemetry): void {
    this.telemetryBuffer.push(telemetry);
  }

  private async flushTelemetryBuffer(): Promise<void> {
    if (this.telemetryBuffer.length === 0) return;

    const batch = [...this.telemetryBuffer];
    this.telemetryBuffer = [];

    try {
      for (const telemetry of batch) {
        await telemetryBus.emit('tier0:telemetry', {
          agentId: this.serviceId,
          agentState: this.state,
          operation: telemetry,
        });
      }
    } catch (err) {
      console.error(`[TIER0] Failed to flush telemetry:`, err);
      // Put back in buffer for retry
      this.telemetryBuffer = [...batch, ...this.telemetryBuffer];
    }
  }

  private async emitHealthEvent(
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const status = healthScoreToStatus(this.state.healthScore);

    const event: Tier0HealthEvent = {
      agentId: this.serviceId,
      service: this.serviceName,
      eventType,
      status,
      healthScore: this.state.healthScore,
      data,
      timestamp: Date.now(),
    };

    try {
      await telemetryBus.emit('tier0:health', event);
    } catch (err) {
      console.error(`[TIER0] Failed to emit health event:`, err);
    }
  }

  private async emitStateSnapshot(): Promise<void> {
    try {
      await telemetryBus.emit('tier0:state', {
        agentId: this.serviceId,
        state: this.state,
        timestamp: Date.now(),
      });
    } catch (err) {
      // Silently fail - don't spam logs
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get health score
   */
  getHealthScore(): number {
    return this.state.healthScore;
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(): boolean {
    return this.state.healthScore >= 70;
  }

  /**
   * Get active operation count
   */
  getActiveOperations(): number {
    return this.state.activeOperations;
  }
}

/**
 * Factory function for creating self-aware agents
 */
export function createSelfAwareAgent(
  serviceId: string,
  serviceName: string
): SelfAwareAgent {
  return new SelfAwareAgent(serviceId, serviceName);
}
