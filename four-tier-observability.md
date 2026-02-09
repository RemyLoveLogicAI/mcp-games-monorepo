# Four-Tier Observability Architecture
## Unrestricted OmniAgents Self-Healing Stack

**Version:** 2.0  
**Date:** January 26, 2026  
**Philosophy:** Three layers of AI self-healing before human intervention.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TIER 3: HUMAN-IN-THE-LOOP                                            │
│   ══════════════════════════                                            │
│   • Absolute intervention only                                          │
│   • Problem fully diagnosed by lower tiers                              │
│   • Human approves/denies/redirects                                     │
│   • Rare — system designed to minimize this                             │
│                                                                         │
│   Interface: Push notification (Telegram) + simple buttons             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Escalation
                                    │ (exhausted all self-healing)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TIER 2: SYSTEMS CHECK DASHBOARD                                      │
│   ═══════════════════════════════                                       │
│   • Human-readable status overview                                      │
│   • ALSO consumed by Tier 1 Watchdog                                   │
│   • Pre-formatted, organized, summarized                               │
│   • Cross-service health correlation                                   │
│   • Secondary healing loop (multi-service coordination)                │
│                                                                         │
│   Interface: CLI (`omnigent status`) + Web + Telegram bot              │
│                                                                         │
│   SECONDARY HEALING LOOP:                                              │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  Tier 1 Watchdog reads Tier 2 aggregated state                 │ │
│   │  → Correlates failures across services                          │ │
│   │  → Identifies cascading issues                                  │ │
│   │  → Coordinates multi-service recovery                           │ │
│   │  → Tries system-wide remediation                                │ │
│   │  → If still failing → escalate to Tier 3                       │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Aggregated + Formatted
                                    │ (status, metrics, recovery history)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TIER 1: AI WATCHDOG                                                  │
│   ═══════════════════                                                   │
│   • Reads all Tier 0 verbose telemetry                                 │
│   • Pattern detection, anomaly analysis                                │
│   • Autonomous recovery execution                                       │
│   • Recursive self-healing loops                                       │
│   • Lint + auto-fix cycles                                             │
│   • Humans see this ONLY via handoff (pre-analyzed)                    │
│                                                                         │
│   PRIMARY HEALING LOOP:                                                │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  Detect anomaly in Tier 0 telemetry                            │ │
│   │  → Classify failure type                                        │ │
│   │  → Select recovery strategy                                     │ │
│   │  → Execute recovery action                                      │ │
│   │  → Verify recovery success                                      │ │
│   │  → If failed: retry with different strategy                    │ │
│   │  → If exhausted: log to Tier 2, try secondary loop             │ │
│   │                                                                 │ │
│   │  RECURSIVE ACTIONS:                                             │ │
│   │  • Restart service (with backoff)                              │ │
│   │  • Clear cache / flush state                                   │ │
│   │  • Retry operation (with jitter)                               │ │
│   │  • Lint + auto-fix code issues                                 │ │
│   │  • Scale resources up/down                                      │ │
│   │  • Switch to fallback path                                     │ │
│   │  • Rollback to previous version                                │ │
│   │  • Isolate failing component                                   │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Verbose telemetry
                                    │ (every operation, every state change)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TIER 0: AGENT RUNTIME (Self-Aware)                                   │
│   ══════════════════════════════════                                    │
│   • The actual operating OmniAgent                                     │
│   • Self-aware of its own state and actions                            │
│   • Observes its own environment                                        │
│   • Emits telemetry about everything                                   │
│   • First layer of self-observation                                    │
│   • Basic self-checks before emitting to Tier 1                        │
│                                                                         │
│   SELF-AWARENESS CAPABILITIES:                                         │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │  • Memory usage monitoring                                      │ │
│   │  • CPU/GPU utilization tracking                                │ │
│   │  • Request latency measurement                                 │ │
│   │  • Error rate calculation                                       │ │
│   │  • Context window management                                   │ │
│   │  • State consistency validation                                │ │
│   │  • Dependency health checks                                    │ │
│   │  • Operation success/failure logging                           │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tier Responsibilities Matrix

| Tier | Name | Primary Consumer | Output | Healing Capability |
|------|------|------------------|--------|-------------------|
| **0** | Agent Runtime | Self + Tier 1 | Verbose telemetry | Basic self-checks |
| **1** | AI Watchdog | Tier 2 + (Humans via handoff) | Recovery actions + analysis | Full autonomous healing |
| **2** | Systems Check | Tier 1 + Humans | Formatted status | Multi-service coordination |
| **3** | Human-in-the-Loop | Human operator | Decisions | Final authority |

---

## Tier 0: Agent Runtime (Self-Aware)

### Purpose
The actual operating agent that is aware of itself, its environment, and emits telemetry about everything it does.

### Self-Awareness Implementation

```typescript
// tier0/self-aware-agent.ts
interface AgentState {
  id: string;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  activeOperations: number;
  pendingRequests: number;
  lastError: string | null;
  lastErrorTime: string | null;
  healthScore: number;  // 0-100
}

interface OperationTelemetry {
  operationId: string;
  operationType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'in_progress' | 'success' | 'failure' | 'timeout';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: {
    message: string;
    code: string;
    stack?: string;
    recoverable: boolean;
  };
  resourceUsage: {
    memoryDelta: number;
    cpuTime: number;
  };
  context: {
    traceId: string;
    parentOperationId?: string;
    sessionId?: string;
  };
}

class SelfAwareAgent {
  private state: AgentState;
  private telemetryBuffer: OperationTelemetry[] = [];
  private readonly BUFFER_FLUSH_INTERVAL = 1000; // 1 second
  private readonly HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
  
  constructor(agentId: string) {
    this.state = this.initializeState(agentId);
    this.startHealthMonitoring();
    this.startTelemetryFlushing();
  }
  
  // ═══════════════════════════════════════════════════════════
  // SELF-OBSERVATION: Agent watches itself
  // ═══════════════════════════════════════════════════════════
  
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.updateSelfState();
      this.performSelfChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }
  
  private updateSelfState(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.state = {
      ...this.state,
      uptime: process.uptime(),
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      healthScore: this.calculateHealthScore()
    };
  }
  
  private calculateHealthScore(): number {
    let score = 100;
    
    // Memory pressure
    const memoryPercent = this.state.memory.heapUsed / this.state.memory.heapTotal;
    if (memoryPercent > 0.9) score -= 30;
    else if (memoryPercent > 0.8) score -= 15;
    else if (memoryPercent > 0.7) score -= 5;
    
    // Recent errors
    if (this.state.lastError && this.state.lastErrorTime) {
      const errorAge = Date.now() - new Date(this.state.lastErrorTime).getTime();
      if (errorAge < 60000) score -= 20;  // Error in last minute
      else if (errorAge < 300000) score -= 10;  // Error in last 5 minutes
    }
    
    // Pending operations
    if (this.state.pendingRequests > 100) score -= 15;
    else if (this.state.pendingRequests > 50) score -= 5;
    
    return Math.max(0, score);
  }
  
  private performSelfChecks(): void {
    // Check 1: Memory pressure
    if (this.state.memory.heapUsed / this.state.memory.heapTotal > 0.9) {
      this.emitHealthEvent('MEMORY_PRESSURE', 'DEGRADED', {
        heapUsed: this.state.memory.heapUsed,
        heapTotal: this.state.memory.heapTotal,
        suggestedAction: 'TRIGGER_GC'
      });
      
      // Tier 0 self-healing: trigger garbage collection
      if (global.gc) {
        global.gc();
        this.emitHealthEvent('SELF_HEAL_GC', 'OK', { action: 'garbage_collection' });
      }
    }
    
    // Check 2: Operation queue depth
    if (this.state.pendingRequests > 100) {
      this.emitHealthEvent('QUEUE_DEPTH_HIGH', 'DEGRADED', {
        pendingRequests: this.state.pendingRequests,
        suggestedAction: 'APPLY_BACKPRESSURE'
      });
    }
    
    // Check 3: Health score threshold
    if (this.state.healthScore < 50) {
      this.emitHealthEvent('LOW_HEALTH_SCORE', 'DEGRADED', {
        healthScore: this.state.healthScore,
        suggestedAction: 'WATCHDOG_INTERVENTION'
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // TELEMETRY EMISSION: Everything goes to Tier 1
  // ═══════════════════════════════════════════════════════════
  
  trackOperation<T>(
    operationType: string,
    input: Record<string, unknown>,
    operation: () => Promise<T>,
    context: { traceId: string; sessionId?: string }
  ): Promise<T> {
    const operationId = generateId();
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    this.state.activeOperations++;
    this.state.pendingRequests++;
    
    const telemetry: OperationTelemetry = {
      operationId,
      operationType,
      startTime,
      status: 'in_progress',
      input,
      resourceUsage: { memoryDelta: 0, cpuTime: 0 },
      context: { traceId: context.traceId, sessionId: context.sessionId }
    };
    
    return operation()
      .then((result) => {
        const endTime = performance.now();
        telemetry.endTime = endTime;
        telemetry.duration = endTime - startTime;
        telemetry.status = 'success';
        telemetry.output = this.sanitizeOutput(result);
        telemetry.resourceUsage.memoryDelta = process.memoryUsage().heapUsed - startMemory;
        
        this.bufferTelemetry(telemetry);
        this.state.activeOperations--;
        this.state.pendingRequests--;
        
        return result;
      })
      .catch((error) => {
        const endTime = performance.now();
        telemetry.endTime = endTime;
        telemetry.duration = endTime - startTime;
        telemetry.status = 'failure';
        telemetry.error = {
          message: error.message,
          code: error.code || 'UNKNOWN',
          stack: error.stack,
          recoverable: this.isRecoverableError(error)
        };
        
        this.state.lastError = error.message;
        this.state.lastErrorTime = new Date().toISOString();
        this.state.activeOperations--;
        this.state.pendingRequests--;
        
        this.bufferTelemetry(telemetry);
        
        throw error;
      });
  }
  
  private bufferTelemetry(telemetry: OperationTelemetry): void {
    this.telemetryBuffer.push(telemetry);
  }
  
  private startTelemetryFlushing(): void {
    setInterval(() => {
      if (this.telemetryBuffer.length > 0) {
        const batch = this.telemetryBuffer.splice(0);
        this.flushToTier1(batch);
      }
    }, this.BUFFER_FLUSH_INTERVAL);
  }
  
  private async flushToTier1(batch: OperationTelemetry[]): Promise<void> {
    // Send to Tier 1 AI Watchdog via telemetry bus
    await telemetryBus.emit('tier0:telemetry', {
      agentId: this.state.id,
      agentState: this.state,
      operations: batch,
      timestamp: Date.now()
    });
  }
  
  private emitHealthEvent(
    eventType: string, 
    status: 'OK' | 'DEGRADED' | 'CRITICAL',
    data: Record<string, unknown>
  ): void {
    telemetryBus.emit('tier0:health', {
      agentId: this.state.id,
      eventType,
      status,
      data,
      agentState: this.state,
      timestamp: Date.now()
    });
  }
  
  private isRecoverableError(error: Error): boolean {
    const recoverableCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'RATE_LIMITED'];
    return recoverableCodes.includes((error as any).code);
  }
  
  private sanitizeOutput(result: unknown): Record<string, unknown> {
    // Remove sensitive data, truncate large payloads
    const str = JSON.stringify(result);
    if (str.length > 10000) {
      return { _truncated: true, _size: str.length };
    }
    return result as Record<string, unknown>;
  }
}

export const agent = new SelfAwareAgent('omnigent-primary');
```

---

## Tier 1: AI Watchdog

### Purpose
Reads all Tier 0 telemetry, performs autonomous healing, only hands off to humans with full analysis complete.

### Primary Healing Loop

```typescript
// tier1/watchdog.ts
interface FailureClassification {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rootCause: string;
  confidence: number;
  recoveryStrategies: RecoveryStrategy[];
}

interface RecoveryStrategy {
  name: string;
  commands: string[];
  estimatedTime: number;
  successProbability: number;
  sideEffects: string[];
  requiresApproval: boolean;
}

interface RecoveryAttempt {
  strategy: RecoveryStrategy;
  startTime: number;
  endTime?: number;
  status: 'in_progress' | 'success' | 'failed';
  result?: string;
  error?: string;
}

class Tier1Watchdog {
  private failureHistory: Map<string, FailureClassification[]> = new Map();
  private recoveryAttempts: Map<string, RecoveryAttempt[]> = new Map();
  private readonly MAX_RECOVERY_ATTEMPTS = 5;
  private readonly RECOVERY_COOLDOWN_MS = 30000;
  
  constructor() {
    this.subscribeTelemetry();
  }
  
  private subscribeTelemetry(): void {
    // Listen to Tier 0 telemetry
    telemetryBus.on('tier0:telemetry', (batch) => this.processTelemetryBatch(batch));
    telemetryBus.on('tier0:health', (event) => this.processHealthEvent(event));
    
    // Also listen to Tier 2 for cross-service correlation
    telemetryBus.on('tier2:status', (status) => this.processSystemStatus(status));
  }
  
  // ═══════════════════════════════════════════════════════════
  // PRIMARY HEALING LOOP
  // ═══════════════════════════════════════════════════════════
  
  private async processTelemetryBatch(batch: Tier0TelemetryBatch): Promise<void> {
    // Extract failures
    const failures = batch.operations.filter(op => op.status === 'failure');
    
    for (const failure of failures) {
      await this.handleFailure(batch.agentId, failure);
    }
    
    // Check agent health
    if (batch.agentState.healthScore < 70) {
      await this.handleDegradedAgent(batch.agentId, batch.agentState);
    }
  }
  
  private async handleFailure(agentId: string, operation: OperationTelemetry): Promise<void> {
    console.log(`[TIER1] Failure detected: ${operation.operationType} - ${operation.error?.message}`);
    
    // Step 1: Classify failure
    const classification = await this.classifyFailure(operation);
    this.recordFailure(agentId, classification);
    
    console.log(`[TIER1] Classification: ${classification.type} (${classification.severity}) - ${classification.rootCause}`);
    
    // Step 2: Check if already in recovery
    const recentAttempts = this.getRecentRecoveryAttempts(agentId, classification.type);
    if (recentAttempts.some(a => a.status === 'in_progress')) {
      console.log(`[TIER1] Recovery already in progress for ${classification.type}`);
      return;
    }
    
    // Step 3: Check attempt count
    if (recentAttempts.length >= this.MAX_RECOVERY_ATTEMPTS) {
      console.log(`[TIER1] Max recovery attempts reached. Escalating to Tier 2.`);
      await this.escalateToTier2(agentId, classification, recentAttempts);
      return;
    }
    
    // Step 4: Select recovery strategy
    const strategy = this.selectRecoveryStrategy(classification, recentAttempts);
    
    if (!strategy) {
      console.log(`[TIER1] No viable recovery strategy. Escalating.`);
      await this.escalateToTier2(agentId, classification, recentAttempts);
      return;
    }
    
    // Step 5: Execute recovery
    await this.executeRecovery(agentId, classification, strategy);
  }
  
  private async classifyFailure(operation: OperationTelemetry): Promise<FailureClassification> {
    // Use AI to classify failure and determine root cause
    const analysis = await aiClient.analyze({
      prompt: `Classify this failure and determine recovery strategies:

Operation: ${operation.operationType}
Error: ${operation.error?.message}
Error Code: ${operation.error?.code}
Duration: ${operation.duration}ms
Context: ${JSON.stringify(operation.context)}

Return JSON with:
- type: string (e.g., "TIMEOUT", "MEMORY", "DEPENDENCY", "CODE_ERROR")
- severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
- rootCause: string (your analysis)
- confidence: number (0-1)
- recoveryStrategies: array of strategies, ordered by likelihood of success`,
      responseFormat: 'json'
    });
    
    return analysis;
  }
  
  private selectRecoveryStrategy(
    classification: FailureClassification,
    previousAttempts: RecoveryAttempt[]
  ): RecoveryStrategy | null {
    // Filter out strategies already tried
    const triedStrategies = new Set(previousAttempts.map(a => a.strategy.name));
    const availableStrategies = classification.recoveryStrategies.filter(
      s => !triedStrategies.has(s.name)
    );
    
    if (availableStrategies.length === 0) return null;
    
    // Select highest probability strategy that doesn't require approval
    const autoStrategies = availableStrategies.filter(s => !s.requiresApproval);
    if (autoStrategies.length > 0) {
      return autoStrategies.sort((a, b) => b.successProbability - a.successProbability)[0];
    }
    
    // All remaining strategies require approval — will escalate
    return null;
  }
  
  private async executeRecovery(
    agentId: string,
    classification: FailureClassification,
    strategy: RecoveryStrategy
  ): Promise<void> {
    console.log(`[TIER1] Executing recovery: ${strategy.name}`);
    
    const attempt: RecoveryAttempt = {
      strategy,
      startTime: Date.now(),
      status: 'in_progress'
    };
    
    this.recordRecoveryAttempt(agentId, classification.type, attempt);
    
    try {
      // Execute commands
      for (const command of strategy.commands) {
        console.log(`[TIER1] Running: ${command}`);
        await this.executeCommand(command, strategy.estimatedTime * 1000);
      }
      
      // Wait for stabilization
      await sleep(5000);
      
      // Verify recovery
      const healthy = await this.verifyRecovery(agentId);
      
      if (healthy) {
        attempt.status = 'success';
        attempt.endTime = Date.now();
        attempt.result = 'Recovery successful';
        console.log(`[TIER1] Recovery successful: ${strategy.name}`);
        
        // Emit to Tier 2
        await this.reportRecoveryToTier2(agentId, classification, attempt);
      } else {
        throw new Error('Verification failed');
      }
      
    } catch (error) {
      attempt.status = 'failed';
      attempt.endTime = Date.now();
      attempt.error = error.message;
      console.log(`[TIER1] Recovery failed: ${strategy.name} - ${error.message}`);
      
      // Recursive: try next strategy
      await this.handleFailure(agentId, {
        operationId: 'recovery-retry',
        operationType: `recovery:${classification.type}`,
        startTime: Date.now(),
        status: 'failure',
        input: {},
        error: {
          message: `Recovery strategy ${strategy.name} failed`,
          code: 'RECOVERY_FAILED',
          recoverable: true
        },
        resourceUsage: { memoryDelta: 0, cpuTime: 0 },
        context: { traceId: generateTraceId() }
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // LINT + AUTO-FIX LOOP (for code-related failures)
  // ═══════════════════════════════════════════════════════════
  
  private async attemptLintFix(agentId: string, error: string): Promise<boolean> {
    console.log(`[TIER1] Attempting lint + auto-fix for code error`);
    
    for (let attempt = 0; attempt < 3; attempt++) {
      // Run linter
      const lintResult = await this.runLinter();
      
      if (lintResult.errors.length === 0) {
        console.log(`[TIER1] Lint passed on attempt ${attempt + 1}`);
        return true;
      }
      
      // AI fix
      const fixes = await aiClient.analyze({
        prompt: `Fix these lint errors:\n\n${JSON.stringify(lintResult.errors)}`,
        context: await this.getRelevantCode(lintResult.errors)
      });
      
      await this.applyFixes(fixes);
      
      console.log(`[TIER1] Applied fixes, retrying lint (attempt ${attempt + 1})`);
    }
    
    console.log(`[TIER1] Lint fix failed after 3 attempts`);
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════
  // ESCALATION TO TIER 2
  // ═══════════════════════════════════════════════════════════
  
  private async escalateToTier2(
    agentId: string,
    classification: FailureClassification,
    attempts: RecoveryAttempt[]
  ): Promise<void> {
    console.log(`[TIER1] Escalating to Tier 2: ${classification.type}`);
    
    await telemetryBus.emit('tier1:escalation', {
      agentId,
      classification,
      recoveryAttempts: attempts,
      recommendation: await this.generateRecommendation(classification, attempts),
      timestamp: Date.now()
    });
  }
  
  private async generateRecommendation(
    classification: FailureClassification,
    attempts: RecoveryAttempt[]
  ): Promise<string> {
    const analysis = await aiClient.analyze({
      prompt: `Given these failed recovery attempts, what should happen next?

Failure: ${classification.type} - ${classification.rootCause}
Attempts: ${JSON.stringify(attempts.map(a => ({ name: a.strategy.name, error: a.error })))}

Options:
1. Escalate to human (explain why)
2. Try system-wide remediation (specify action)
3. Wait and retry (specify timeout)
4. Graceful degradation (specify what to disable)`
    });
    
    return analysis;
  }
}

export const watchdog = new Tier1Watchdog();
```

---

## Tier 2: Systems Check Dashboard

### Purpose
Human-readable status + consumed by Tier 1 for cross-service correlation.

### Dual-Consumer Design

```typescript
// tier2/systems-check.ts
interface SystemsStatus {
  timestamp: string;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  
  services: ServiceStatus[];
  
  watchdogStatus: {
    activeRecoveries: number;
    successRate24h: number;
    lastAction: string;
    lastActionTime: string;
  };
  
  recentIncidents: Incident[];
  
  hitlQueue: {
    pending: number;
    oldest: string | null;
  };
  
  keyMetrics: {
    requestsPerMinute: number;
    errorRate: number;
    p99Latency: number;
    activeUsers: number;
  };
}

interface ServiceStatus {
  name: string;
  status: 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  uptime: string;
  lastCheck: string;
  metrics: {
    latency?: number;
    errorRate?: number;
    throughput?: number;
  };
  activeIssues: string[];
}

interface Incident {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  service: string;
  summary: string;
  startTime: string;
  status: 'ACTIVE' | 'RECOVERING' | 'RESOLVED';
  recoveryAttempts: number;
}

class Tier2SystemsCheck {
  private status: SystemsStatus;
  
  constructor() {
    this.startAggregation();
    this.exposeEndpoints();
  }
  
  // ═══════════════════════════════════════════════════════════
  // AGGREGATION: Collect from Tier 0 + Tier 1
  // ═══════════════════════════════════════════════════════════
  
  private startAggregation(): void {
    // Aggregate every 10 seconds
    setInterval(() => this.aggregateStatus(), 10000);
    
    // Listen for Tier 1 escalations
    telemetryBus.on('tier1:escalation', (data) => this.handleEscalation(data));
    telemetryBus.on('tier1:recovery', (data) => this.handleRecoveryReport(data));
  }
  
  private async aggregateStatus(): Promise<void> {
    const [services, watchdog, incidents, metrics] = await Promise.all([
      this.aggregateServiceStatuses(),
      this.aggregateWatchdogStatus(),
      this.aggregateIncidents(),
      this.aggregateKeyMetrics()
    ]);
    
    this.status = {
      timestamp: new Date().toISOString(),
      overallHealth: this.computeOverallHealth(services, incidents),
      services,
      watchdogStatus: watchdog,
      recentIncidents: incidents,
      hitlQueue: await this.getHitlQueueStatus(),
      keyMetrics: metrics
    };
    
    // Emit for Tier 1 to consume
    await telemetryBus.emit('tier2:status', this.status);
  }
  
  private computeOverallHealth(
    services: ServiceStatus[],
    incidents: Incident[]
  ): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
    const criticalServices = services.filter(s => s.status === 'CRITICAL');
    const criticalIncidents = incidents.filter(i => i.severity === 'CRITICAL' && i.status === 'ACTIVE');
    
    if (criticalServices.length > 0 || criticalIncidents.length > 0) return 'CRITICAL';
    
    const degradedServices = services.filter(s => s.status === 'DEGRADED');
    const activeIncidents = incidents.filter(i => i.status === 'ACTIVE');
    
    if (degradedServices.length > 0 || activeIncidents.length > 0) return 'DEGRADED';
    
    return 'HEALTHY';
  }
  
  // ═══════════════════════════════════════════════════════════
  // SECONDARY HEALING: Cross-service coordination
  // ═══════════════════════════════════════════════════════════
  
  private async handleEscalation(escalation: Tier1Escalation): Promise<void> {
    console.log(`[TIER2] Received escalation: ${escalation.classification.type}`);
    
    // Check if this correlates with other service issues
    const correlatedIssues = this.findCorrelatedIssues(escalation);
    
    if (correlatedIssues.length > 0) {
      console.log(`[TIER2] Found ${correlatedIssues.length} correlated issues. Attempting coordinated recovery.`);
      
      const coordinatedRecovery = await this.planCoordinatedRecovery(escalation, correlatedIssues);
      
      if (coordinatedRecovery.viable) {
        await this.executeCoordinatedRecovery(coordinatedRecovery);
        return;
      }
    }
    
    // If no coordinated recovery possible, escalate to Tier 3
    if (this.shouldEscalateToHuman(escalation)) {
      await this.escalateToTier3(escalation);
    }
  }
  
  private findCorrelatedIssues(escalation: Tier1Escalation): Incident[] {
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const escalationTime = escalation.timestamp;
    
    return this.status.recentIncidents.filter(incident => {
      const incidentTime = new Date(incident.startTime).getTime();
      return Math.abs(escalationTime - incidentTime) < timeWindow &&
             incident.status === 'ACTIVE' &&
             incident.service !== escalation.agentId;
    });
  }
  
  private async planCoordinatedRecovery(
    escalation: Tier1Escalation,
    correlatedIssues: Incident[]
  ): Promise<CoordinatedRecoveryPlan> {
    const analysis = await aiClient.analyze({
      prompt: `Plan coordinated recovery for these correlated issues:

Primary failure:
${JSON.stringify(escalation.classification)}

Correlated issues:
${JSON.stringify(correlatedIssues)}

Current system status:
${JSON.stringify(this.status.services)}

Consider:
1. Is there a common root cause?
2. What's the correct recovery order?
3. Are there dependencies between services?
4. What's the risk of cascading failures?

Return JSON with:
- viable: boolean
- rootCause: string
- recoverySteps: array of { service, action, order }
- estimatedTime: number (seconds)
- rollbackPlan: array of steps if recovery fails`
    });
    
    return analysis;
  }
  
  private async executeCoordinatedRecovery(plan: CoordinatedRecoveryPlan): Promise<void> {
    console.log(`[TIER2] Executing coordinated recovery: ${plan.rootCause}`);
    
    // Sort by order
    const steps = plan.recoverySteps.sort((a, b) => a.order - b.order);
    
    for (const step of steps) {
      console.log(`[TIER2] Step ${step.order}: ${step.service} - ${step.action}`);
      
      try {
        await this.executeRecoveryStep(step);
        await sleep(2000); // Brief pause between steps
      } catch (error) {
        console.log(`[TIER2] Coordinated recovery failed at step ${step.order}. Rolling back.`);
        await this.executeRollback(plan.rollbackPlan, step.order);
        
        // Escalate to Tier 3
        await this.escalateToTier3({
          type: 'COORDINATED_RECOVERY_FAILED',
          plan,
          failedStep: step,
          error: error.message
        });
        return;
      }
    }
    
    console.log(`[TIER2] Coordinated recovery successful`);
  }
  
  private shouldEscalateToHuman(escalation: Tier1Escalation): boolean {
    // Escalate if:
    // 1. Critical severity
    // 2. Novel failure (not seen before)
    // 3. Requires authorization
    // 4. Watchdog explicitly recommends it
    
    if (escalation.classification.severity === 'CRITICAL') return true;
    if (escalation.classification.confidence < 0.5) return true;  // Novel/uncertain
    if (escalation.recommendation.includes('human')) return true;
    
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════
  // INTERFACES: CLI, Web, Telegram, API
  // ═══════════════════════════════════════════════════════════
  
  private exposeEndpoints(): void {
    // HTTP API for dashboard + Tier 1
    app.get('/api/status', (req, res) => {
      res.json(this.status);
    });
    
    // CLI command
    registerCommand('status', () => this.formatForCli());
    
    // Telegram bot command
    telegramBot.onCommand('/status', () => this.formatForTelegram());
  }
  
  formatForCli(): string {
    const s = this.status;
    const healthEmoji = {
      HEALTHY: '🟢',
      DEGRADED: '🟡',
      CRITICAL: '🔴'
    };
    
    let output = `
${healthEmoji[s.overallHealth]} UNRESTRICTED OMNIGENTS — SYSTEMS CHECK
Updated: ${s.timestamp}

SERVICES
`;
    
    for (const svc of s.services) {
      const statusEmoji = { OK: '✅', DEGRADED: '⚠️', CRITICAL: '🔴', UNKNOWN: '❓' };
      output += `  ${statusEmoji[svc.status]} ${svc.name.padEnd(18)} ${svc.uptime}`;
      if (svc.metrics.latency) output += `  ${svc.metrics.latency}ms`;
      output += '\n';
    }
    
    output += `
WATCHDOG
  Active recoveries: ${s.watchdogStatus.activeRecoveries}
  Success rate (24h): ${(s.watchdogStatus.successRate24h * 100).toFixed(0)}%
  Last action: ${s.watchdogStatus.lastAction} (${s.watchdogStatus.lastActionTime})

METRICS (24h)
  Requests/min: ${s.keyMetrics.requestsPerMinute}
  Error rate: ${(s.keyMetrics.errorRate * 100).toFixed(2)}%
  p99 latency: ${s.keyMetrics.p99Latency}ms

HITL QUEUE: ${s.hitlQueue.pending} pending
`;
    
    return output;
  }
  
  formatForTelegram(): string {
    const s = this.status;
    const healthEmoji = { HEALTHY: '🟢', DEGRADED: '🟡', CRITICAL: '🔴' };
    
    let msg = `${healthEmoji[s.overallHealth]} *Systems Check*\n\n`;
    
    for (const svc of s.services) {
      const e = { OK: '✅', DEGRADED: '⚠️', CRITICAL: '🔴', UNKNOWN: '❓' };
      msg += `${e[svc.status]} ${svc.name}\n`;
    }
    
    msg += `\nWatchdog: ${s.watchdogStatus.successRate24h * 100}% success\n`;
    msg += `HITL: ${s.hitlQueue.pending} pending`;
    
    return msg;
  }
  
  // ═══════════════════════════════════════════════════════════
  // ESCALATION TO TIER 3
  // ═══════════════════════════════════════════════════════════
  
  private async escalateToTier3(data: unknown): Promise<void> {
    await hitlManager.createRequest({
      priority: 'HIGH',
      situation: this.formatSituation(data),
      aiAnalysis: this.formatAnalysis(data),
      aiRecommendation: this.formatRecommendation(data),
      options: this.generateOptions(data),
      triggerData: data
    });
  }
}

export const systemsCheck = new Tier2SystemsCheck();
```

---

## Tier 3: Human-in-the-Loop

### Purpose
Final authority when AI exhausts all options.

### Triggers (Rare)

| Trigger | Why Human Needed |
|---------|------------------|
| **Critical + unresolved** | All recovery attempts failed |
| **Novel failure** | AI confidence <50%, can't classify |
| **Authorization required** | Cost approval, security action |
| **Cascading failure** | Coordinated recovery failed |
| **Data action** | GDPR deletion, privacy request |

### Implementation

```typescript
// tier3/hitl-manager.ts
class Tier3HitlManager {
  async createRequest(params: HitlRequestParams): Promise<string> {
    const request: HitlRequest = {
      id: generateId(),
      priority: params.priority,
      createdAt: new Date().toISOString(),
      expiresAt: this.calculateExpiry(params.priority),
      
      situation: params.situation,
      aiAnalysis: params.aiAnalysis,
      aiRecommendation: params.aiRecommendation,
      
      options: params.options,
      defaultOption: params.defaultOption,
      
      tierPath: ['Tier 0 → Tier 1 → Tier 2 → Tier 3'],
      recoveryHistory: await this.gatherRecoveryHistory(params.triggerData)
    };
    
    await this.store(request);
    await this.notifyHuman(request);
    this.startExpiryTimer(request);
    
    return request.id;
  }
  
  private async notifyHuman(request: HitlRequest): Promise<void> {
    const message = this.formatMessage(request);
    
    // Push via Telegram (primary)
    await telegramBot.sendMessage(ADMIN_CHAT_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: request.options.map(opt => [{
          text: `${opt.id}️⃣ ${opt.label}`,
          callback_data: `hitl:${request.id}:${opt.id}`
        }])
      }
    });
  }
  
  private formatMessage(request: HitlRequest): string {
    const emoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🔴' };
    
    return `${emoji[request.priority]} *OMNIGENT NEEDS INPUT*

*Priority:* ${request.priority}
*Expires:* ${request.expiresAt}

*SITUATION:*
${request.situation}

*AI ANALYSIS:*
${request.aiAnalysis}

*AI RECOMMENDS:*
${request.aiRecommendation}

*RECOVERY PATH:*
${request.recoveryHistory.slice(-3).map(r => `• ${r}`).join('\n')}

Select an option below:`;
  }
  
  async handleResponse(requestId: string, optionId: number): Promise<void> {
    const request = await this.get(requestId);
    const option = request.options.find(o => o.id === optionId);
    
    console.log(`[TIER3] Human selected: ${option.label}`);
    
    // Execute chosen action
    await this.executeAction(option.action);
    
    // Log decision
    await this.logDecision(request, option, 'HUMAN');
    
    // Notify outcome
    await telegramBot.sendMessage(ADMIN_CHAT_ID, 
      `✅ Action executed: ${option.label}\n\nMonitoring for stability...`
    );
    
    // Clean up
    await this.remove(requestId);
  }
}

export const hitlManager = new Tier3HitlManager();
```

---

## Flow Summary

```
ISSUE OCCURS
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 0: Agent detects issue via self-monitoring            │
│ → Emits telemetry to Tier 1                                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: Watchdog receives, classifies, attempts recovery   │
│                                                             │
│ RECOVERY LOOP (up to 5 attempts):                          │
│   → Restart service                                        │
│   → Clear cache                                            │
│   → Lint + auto-fix                                        │
│   → Scale resources                                        │
│   → Try fallback path                                      │
│                                                             │
│ If resolved → Done                                         │
│ If exhausted → Escalate to Tier 2                         │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: Systems Check receives escalation                  │
│                                                             │
│ SECONDARY LOOP:                                            │
│   → Check for correlated issues                            │
│   → Plan coordinated recovery                              │
│   → Execute cross-service remediation                      │
│                                                             │
│ If resolved → Done                                         │
│ If failed or needs auth → Escalate to Tier 3              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: Human receives notification                        │
│                                                             │
│ Context provided:                                          │
│   → Full recovery history                                  │
│   → AI analysis + recommendation                           │
│   → Simple choice buttons                                  │
│                                                             │
│ Human taps button → AI executes → Done                    │
└─────────────────────────────────────────────────────────────┘
```

**By the time human sees it: problem is diagnosed, multiple recoveries attempted, AI has a recommendation. Human just approves.**

---

## Key Insight: Recursive Healing Depth

Between the agent doing something and human intervention, there are:

1. **Tier 0 self-checks** (basic)
2. **Tier 1 primary loop** (5 attempts × multiple strategies)
3. **Tier 2 secondary loop** (cross-service coordination)

That's potentially **15-20 automated recovery attempts** before human is bothered.

---

Does this capture the four-tier model correctly?
