# Sprint 1 Execution Plan v2.0
## Unrestricted OmniAgents — MCP Games Foundation + Four-Tier Self-Healing

**Version:** 2.0  
**Duration:** 35 calendar days (5 weeks)  
**Start Date:** January 27, 2026  
**End Date:** March 2, 2026  
**Author:** Remy Sr / LoveLogicAI  

---

## Executive Summary

Sprint 1 delivers a **self-healing** MCP Games server with the complete Four-Tier Observability stack. The system monitors itself, heals itself, and only escalates to humans when absolutely necessary.

**Core Deliverables:**
1. MCP Games CYOA engine ("The Morning Decision")
2. PersonaPlex voice integration
3. Telegram bot interface
4. **Four-Tier Self-Healing Stack** (Tier 0-3)

**Philosophy:** By the time a human sees an issue, the system has already attempted 15-20 automated recovery actions.

---

## Four-Tier Architecture Recap

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 3: HUMAN-IN-THE-LOOP                                         │
│  • Absolute intervention only                                       │
│  • Push notification + simple buttons                              │
│  • Human approves/denies/redirects                                 │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Escalation (rare)
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 2: SYSTEMS CHECK                                             │
│  • Human-glanceable dashboard                                      │
│  • Also consumed by Tier 1 for cross-service correlation          │
│  • Secondary healing: coordinated multi-service recovery          │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Aggregated status
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1: AI WATCHDOG                                               │
│  • Reads all Tier 0 verbose telemetry                             │
│  • Primary healing: 5+ recovery strategies per failure            │
│  • Recursive retry, lint, fix, restart loops                      │
│  • Humans only see pre-analyzed handoffs                          │
└─────────────────────────────────────────────────────────────────────┘
                            ▲ Verbose telemetry
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 0: AGENT RUNTIME (Self-Aware)                                │
│  • The actual operating OmniAgent                                  │
│  • Self-monitors: memory, CPU, latency, errors                    │
│  • Emits telemetry about everything it does                       │
│  • Basic self-checks before escalating                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
omnigents/
├── packages/
│   ├── mcp-games-server/          # Core game engine
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── game-engine.ts
│   │   │   │   ├── state-manager.ts
│   │   │   │   └── context-engine.ts
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts
│   │   │   │   ├── tools.ts
│   │   │   │   └── resources.ts
│   │   │   ├── adapters/
│   │   │   │   ├── supabase.ts
│   │   │   │   ├── personaplex.ts
│   │   │   │   └── mcp-client.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── tier0-runtime/             # Self-aware agent wrapper
│   │   ├── src/
│   │   │   ├── self-aware-agent.ts
│   │   │   ├── telemetry-emitter.ts
│   │   │   ├── health-monitor.ts
│   │   │   └── operation-tracker.ts
│   │   └── package.json
│   │
│   ├── tier1-watchdog/            # AI Watchdog
│   │   ├── src/
│   │   │   ├── watchdog.ts
│   │   │   ├── failure-classifier.ts
│   │   │   ├── recovery-executor.ts
│   │   │   ├── lint-fix-loop.ts
│   │   │   └── ai-client.ts
│   │   └── package.json
│   │
│   ├── tier2-systems-check/       # Dashboard + Aggregator
│   │   ├── src/
│   │   │   ├── aggregator.ts
│   │   │   ├── cli.ts
│   │   │   ├── web-dashboard.ts
│   │   │   ├── telegram-status.ts
│   │   │   └── coordinated-recovery.ts
│   │   └── package.json
│   │
│   ├── tier3-hitl/                # Human-in-the-Loop
│   │   ├── src/
│   │   │   ├── hitl-manager.ts
│   │   │   ├── notification-sender.ts
│   │   │   ├── response-handler.ts
│   │   │   └── timeout-manager.ts
│   │   └── package.json
│   │
│   ├── telegram-bot/              # Telegram interface
│   │   ├── src/
│   │   │   ├── bot.ts
│   │   │   ├── game-handler.ts
│   │   │   ├── voice-handler.ts
│   │   │   └── status-handler.ts
│   │   └── package.json
│   │
│   └── shared/                    # Shared utilities
│       ├── src/
│       │   ├── telemetry-bus.ts
│       │   ├── types.ts
│       │   └── utils.ts
│       └── package.json
│
├── games/
│   └── morning-decision.yaml      # First game
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── FOUR_TIER_OBSERVABILITY.md
│   ├── GAME_FORMAT.md
│   ├── DEPLOYMENT.md
│   └── DEBUGGING.md
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── turbo.json                     # Monorepo config
└── package.json
```

---

## Sprint 1 Task Breakdown

### Week 1: Foundation + Tier 0 (Self-Aware Runtime)

**Goal:** Project skeleton with self-aware agent wrapper emitting telemetry.

---

#### Task 1.1: Monorepo Setup + Shared Infrastructure
**Time:** 8 hours

**Deliverables:**
- Turborepo monorepo structure
- Shared types package
- Telemetry bus (Redis Streams)
- Environment configuration

```typescript
// packages/shared/src/telemetry-bus.ts
import Redis from 'ioredis';

interface TelemetryEvent {
  stream: string;
  data: Record<string, unknown>;
  timestamp: number;
}

class TelemetryBus {
  private redis: Redis;
  private subscribers: Map<string, ((data: unknown) => void)[]> = new Map();
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }
  
  async emit(stream: string, data: Record<string, unknown>): Promise<void> {
    const event: TelemetryEvent = {
      stream,
      data,
      timestamp: Date.now()
    };
    
    // Write to Redis Stream
    await this.redis.xadd(
      stream,
      '*',
      'data', JSON.stringify(event)
    );
    
    // Notify local subscribers
    const subs = this.subscribers.get(stream) || [];
    subs.forEach(cb => cb(data));
  }
  
  subscribe(stream: string, callback: (data: unknown) => void): void {
    const subs = this.subscribers.get(stream) || [];
    subs.push(callback);
    this.subscribers.set(stream, subs);
    
    // Start consuming from Redis Stream
    this.startConsumer(stream);
  }
  
  private async startConsumer(stream: string): Promise<void> {
    let lastId = '$';
    
    while (true) {
      const results = await this.redis.xread(
        'BLOCK', 0,
        'STREAMS', stream, lastId
      );
      
      if (results) {
        for (const [, messages] of results) {
          for (const [id, fields] of messages) {
            lastId = id;
            const data = JSON.parse(fields[1]);
            const subs = this.subscribers.get(stream) || [];
            subs.forEach(cb => cb(data.data));
          }
        }
      }
    }
  }
}

export const telemetryBus = new TelemetryBus();
```

**Verification:**
- [ ] `pnpm install` succeeds
- [ ] Packages can import from `@omnigents/shared`
- [ ] Redis connection established
- [ ] Telemetry bus emits and receives events

---

#### Task 1.2: Tier 0 — Self-Aware Agent Runtime
**Time:** 16 hours

**Deliverables:**
- Self-monitoring wrapper for any service
- Operation tracking with automatic telemetry
- Health score calculation
- Basic self-healing (GC, backpressure)

```typescript
// packages/tier0-runtime/src/self-aware-agent.ts
import { telemetryBus } from '@omnigents/shared';

interface AgentState {
  id: string;
  service: string;
  uptime: number;
  memory: MemoryUsage;
  cpu: CpuUsage;
  healthScore: number;
  activeOperations: number;
  errorCount: number;
  lastError: ErrorInfo | null;
}

interface OperationContext {
  traceId: string;
  parentId?: string;
  sessionId?: string;
}

export class SelfAwareAgent {
  private state: AgentState;
  private operations: Map<string, OperationTelemetry> = new Map();
  
  constructor(private serviceId: string, private serviceName: string) {
    this.state = this.initializeState();
    this.startSelfMonitoring();
  }
  
  // ═══════════════════════════════════════════════════════════
  // OPERATION TRACKING: Wrap any async operation
  // ═══════════════════════════════════════════════════════════
  
  async track<T>(
    operationType: string,
    context: OperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    const opId = this.generateOpId();
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    this.state.activeOperations++;
    
    const telemetry: OperationTelemetry = {
      operationId: opId,
      operationType,
      service: this.serviceName,
      startTime: Date.now(),
      status: 'in_progress',
      context
    };
    
    this.operations.set(opId, telemetry);
    
    try {
      const result = await operation();
      
      telemetry.endTime = Date.now();
      telemetry.duration = performance.now() - startTime;
      telemetry.status = 'success';
      telemetry.memoryDelta = process.memoryUsage().heapUsed - startMemory;
      
      this.emitTelemetry(telemetry);
      
      return result;
      
    } catch (error) {
      telemetry.endTime = Date.now();
      telemetry.duration = performance.now() - startTime;
      telemetry.status = 'failure';
      telemetry.error = {
        message: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack,
        recoverable: this.isRecoverable(error)
      };
      
      this.state.errorCount++;
      this.state.lastError = telemetry.error;
      
      this.emitTelemetry(telemetry);
      this.emitHealthEvent('OPERATION_FAILED', telemetry);
      
      throw error;
      
    } finally {
      this.state.activeOperations--;
      this.operations.delete(opId);
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // SELF-MONITORING: Continuous health checks
  // ═══════════════════════════════════════════════════════════
  
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
  }
  
  private updateState(): void {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    this.state = {
      ...this.state,
      uptime: process.uptime(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external
      },
      cpu: {
        user: cpu.user,
        system: cpu.system
      },
      healthScore: this.calculateHealthScore()
    };
  }
  
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
      if (errorAge < 60000) score -= 25;
      else if (errorAge < 300000) score -= 10;
    }
    
    // Active operations (-15 max)
    if (this.state.activeOperations > 100) score -= 15;
    else if (this.state.activeOperations > 50) score -= 5;
    
    // Error rate (-30 max)
    const errorRate = this.calculateErrorRate();
    if (errorRate > 0.1) score -= 30;
    else if (errorRate > 0.05) score -= 15;
    else if (errorRate > 0.01) score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }
  
  // ═══════════════════════════════════════════════════════════
  // SELF-HEALING: Basic remediation at Tier 0
  // ═══════════════════════════════════════════════════════════
  
  private performSelfChecks(): void {
    // Check 1: Memory pressure → trigger GC
    if (this.state.memory.heapUsed / this.state.memory.heapTotal > 0.85) {
      this.selfHeal('MEMORY_PRESSURE', () => {
        if (global.gc) {
          global.gc();
          return true;
        }
        return false;
      });
    }
    
    // Check 2: Too many active operations → apply backpressure
    if (this.state.activeOperations > 100) {
      this.emitHealthEvent('BACKPRESSURE_NEEDED', {
        activeOperations: this.state.activeOperations,
        suggestedAction: 'APPLY_BACKPRESSURE'
      });
    }
    
    // Check 3: Health score critical → alert Tier 1
    if (this.state.healthScore < 40) {
      this.emitHealthEvent('HEALTH_CRITICAL', {
        healthScore: this.state.healthScore,
        suggestedAction: 'TIER1_INTERVENTION'
      });
    }
  }
  
  private selfHeal(issue: string, healFn: () => boolean): void {
    const success = healFn();
    
    this.emitTelemetry({
      operationId: this.generateOpId(),
      operationType: `self_heal:${issue}`,
      service: this.serviceName,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 0,
      status: success ? 'success' : 'failure',
      context: { traceId: this.generateTraceId() }
    });
  }
  
  // ═══════════════════════════════════════════════════════════
  // TELEMETRY EMISSION: Send to Tier 1
  // ═══════════════════════════════════════════════════════════
  
  private emitTelemetry(telemetry: OperationTelemetry): void {
    telemetryBus.emit('tier0:telemetry', {
      agentId: this.serviceId,
      agentState: this.state,
      operation: telemetry
    });
  }
  
  private emitHealthEvent(eventType: string, data: Record<string, unknown>): void {
    const status = this.state.healthScore > 70 ? 'OK' :
                   this.state.healthScore > 40 ? 'DEGRADED' : 'CRITICAL';
    
    telemetryBus.emit('tier0:health', {
      agentId: this.serviceId,
      service: this.serviceName,
      eventType,
      status,
      healthScore: this.state.healthScore,
      data,
      timestamp: Date.now()
    });
  }
  
  private emitStateSnapshot(): void {
    telemetryBus.emit('tier0:state', {
      agentId: this.serviceId,
      state: this.state,
      timestamp: Date.now()
    });
  }
}

// Factory function for easy wrapping
export function createSelfAwareAgent(serviceId: string, serviceName: string): SelfAwareAgent {
  return new SelfAwareAgent(serviceId, serviceName);
}
```

**Usage in MCP Games:**
```typescript
// packages/mcp-games-server/src/index.ts
import { createSelfAwareAgent } from '@omnigents/tier0-runtime';

const agent = createSelfAwareAgent('mcp-games-001', 'mcp-games');

// Wrap every operation
async function startGame(request: StartGameRequest): Promise<StartGameResponse> {
  return agent.track(
    'game:start',
    { traceId: request.traceId, sessionId: request.playerId },
    async () => {
      // Actual game logic here
      const session = await createSession(request);
      const scene = await getFirstScene(session);
      return { sessionId: session.id, scene };
    }
  );
}
```

**Verification:**
- [ ] Agent tracks operations with timing
- [ ] Health score updates every 5 seconds
- [ ] Memory pressure triggers GC
- [ ] Telemetry emits to Redis Stream
- [ ] Health events fire on degraded state

---

#### Task 1.3: Supabase Schema + Game Definition Parser
**Time:** 12 hours

**Deliverables:**
- Database schema (sessions, history, audit)
- YAML game parser with validation
- "The Morning Decision" game file

```sql
-- Session state
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  current_scene_id TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  context_permissions JSONB NOT NULL,
  voice_mode BOOLEAN DEFAULT FALSE,
  voice_persona TEXT,
  health_score INTEGER DEFAULT 100,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Session history (for game replay + debugging)
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  scene_id TEXT,
  choice_id TEXT,
  context_injected JSONB,
  effects_applied JSONB,
  trace_id TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tier 0 telemetry log (hot storage, 24h retention)
CREATE TABLE tier0_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  service TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  error_code TEXT,
  trace_id TEXT NOT NULL,
  health_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast queries
CREATE INDEX idx_tier0_telemetry_agent ON tier0_telemetry(agent_id, created_at DESC);
CREATE INDEX idx_tier0_telemetry_status ON tier0_telemetry(status, created_at DESC);

-- Auto-delete old telemetry (24h retention)
CREATE OR REPLACE FUNCTION delete_old_telemetry()
RETURNS void AS $$
BEGIN
  DELETE FROM tier0_telemetry WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Watchdog recovery log
CREATE TABLE recovery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL,  -- 'tier0', 'tier1', 'tier2'
  agent_id TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  recovery_strategy TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'success', 'failed'
  duration_ms INTEGER,
  commands_executed JSONB,
  error_message TEXT,
  trace_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HITL request log
CREATE TABLE hitl_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority TEXT NOT NULL,
  situation TEXT NOT NULL,
  ai_analysis TEXT NOT NULL,
  ai_recommendation TEXT NOT NULL,
  options JSONB NOT NULL,
  selected_option INTEGER,
  responded_by TEXT,
  auto_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);
```

**Verification:**
- [ ] Migrations run successfully
- [ ] Game YAML parses and validates
- [ ] "The Morning Decision" loads without errors
- [ ] Session CRUD works

---

### Week 2: Tier 1 — AI Watchdog + Core Game Engine

**Goal:** AI Watchdog reading Tier 0, autonomous recovery, plus core game logic.

---

#### Task 2.1: Tier 1 — AI Watchdog Core
**Time:** 20 hours

**Deliverables:**
- Watchdog service consuming Tier 0 telemetry
- Failure classification (via Claude API)
- Recovery strategy selection
- Execution + verification loop

```typescript
// packages/tier1-watchdog/src/watchdog.ts
import { telemetryBus } from '@omnigents/shared';
import { FailureClassifier } from './failure-classifier';
import { RecoveryExecutor } from './recovery-executor';

interface RecoveryAttempt {
  strategy: string;
  startTime: number;
  endTime?: number;
  status: 'in_progress' | 'success' | 'failed';
  error?: string;
}

export class Tier1Watchdog {
  private classifier: FailureClassifier;
  private executor: RecoveryExecutor;
  private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map();
  private readonly MAX_ATTEMPTS = 5;
  private readonly COOLDOWN_MS = 30000;
  
  constructor() {
    this.classifier = new FailureClassifier();
    this.executor = new RecoveryExecutor();
    this.subscribe();
  }
  
  private subscribe(): void {
    // Listen to Tier 0 telemetry
    telemetryBus.subscribe('tier0:telemetry', (data) => this.processTelemetry(data));
    telemetryBus.subscribe('tier0:health', (data) => this.processHealthEvent(data));
    
    // Listen to Tier 2 for cross-service context
    telemetryBus.subscribe('tier2:status', (data) => this.updateSystemContext(data));
    
    console.log('[TIER1] Watchdog started. Listening for telemetry...');
  }
  
  // ═══════════════════════════════════════════════════════════
  // PRIMARY HEALING LOOP
  // ═══════════════════════════════════════════════════════════
  
  private async processTelemetry(data: Tier0Telemetry): Promise<void> {
    if (data.operation.status !== 'failure') return;
    
    console.log(`[TIER1] Failure: ${data.operation.operationType} - ${data.operation.error?.message}`);
    
    await this.handleFailure(data.agentId, data.operation);
  }
  
  private async processHealthEvent(event: Tier0HealthEvent): Promise<void> {
    if (event.status === 'OK') return;
    
    console.log(`[TIER1] Health event: ${event.eventType} (${event.status})`);
    
    if (event.data.suggestedAction === 'TIER1_INTERVENTION') {
      await this.handleDegradedAgent(event.agentId, event);
    }
  }
  
  private async handleFailure(agentId: string, operation: OperationTelemetry): Promise<void> {
    const failureKey = `${agentId}:${operation.operationType}`;
    
    // Check cooldown
    const recentAttempts = this.getRecentAttempts(failureKey);
    if (recentAttempts.some(a => a.status === 'in_progress')) {
      console.log(`[TIER1] Recovery in progress for ${failureKey}`);
      return;
    }
    
    // Check max attempts
    if (recentAttempts.length >= this.MAX_ATTEMPTS) {
      console.log(`[TIER1] Max attempts reached for ${failureKey}. Escalating to Tier 2.`);
      await this.escalateToTier2(agentId, operation, recentAttempts);
      return;
    }
    
    // Classify failure
    const classification = await this.classifier.classify(operation);
    console.log(`[TIER1] Classification: ${classification.type} (confidence: ${classification.confidence})`);
    
    // Select strategy (exclude already-tried strategies)
    const triedStrategies = new Set(recentAttempts.map(a => a.strategy));
    const strategy = classification.strategies.find(s => !triedStrategies.has(s.name));
    
    if (!strategy) {
      console.log(`[TIER1] No untried strategies. Escalating.`);
      await this.escalateToTier2(agentId, operation, recentAttempts);
      return;
    }
    
    // Execute recovery
    await this.executeRecovery(failureKey, agentId, strategy, operation);
  }
  
  private async executeRecovery(
    failureKey: string,
    agentId: string,
    strategy: RecoveryStrategy,
    operation: OperationTelemetry
  ): Promise<void> {
    console.log(`[TIER1] Executing: ${strategy.name}`);
    
    const attempt: RecoveryAttempt = {
      strategy: strategy.name,
      startTime: Date.now(),
      status: 'in_progress'
    };
    
    this.recordAttempt(failureKey, attempt);
    
    try {
      // Execute recovery commands
      for (const cmd of strategy.commands) {
        console.log(`[TIER1] Running: ${cmd}`);
        await this.executor.execute(cmd, strategy.timeout);
      }
      
      // Wait for stabilization
      await this.sleep(5000);
      
      // Verify recovery
      const healthy = await this.verifyRecovery(agentId);
      
      if (healthy) {
        attempt.status = 'success';
        attempt.endTime = Date.now();
        console.log(`[TIER1] ✅ Recovery successful: ${strategy.name}`);
        
        // Report to Tier 2
        await this.reportSuccess(agentId, strategy, attempt);
        
      } else {
        throw new Error('Verification failed');
      }
      
    } catch (error) {
      attempt.status = 'failed';
      attempt.endTime = Date.now();
      attempt.error = error.message;
      console.log(`[TIER1] ❌ Recovery failed: ${strategy.name}`);
      
      // Log failure
      await this.logRecovery(agentId, strategy, attempt);
      
      // Recursive: try again with next strategy
      await this.handleFailure(agentId, operation);
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // LINT + AUTO-FIX LOOP
  // ═══════════════════════════════════════════════════════════
  
  async attemptLintFix(agentId: string): Promise<boolean> {
    console.log(`[TIER1] Attempting lint + auto-fix`);
    
    for (let i = 0; i < 3; i++) {
      // Run linter
      const lintResult = await this.executor.execute('npm run lint --json', 30000);
      
      if (!lintResult.errors || lintResult.errors.length === 0) {
        console.log(`[TIER1] Lint passed on attempt ${i + 1}`);
        return true;
      }
      
      // Ask AI to fix
      const fixes = await this.classifier.generateFixes(lintResult.errors);
      
      // Apply fixes
      await this.executor.applyFixes(fixes);
      
      console.log(`[TIER1] Applied ${fixes.length} fixes. Retrying...`);
    }
    
    console.log(`[TIER1] Lint fix failed after 3 attempts`);
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════
  // ESCALATION
  // ═══════════════════════════════════════════════════════════
  
  private async escalateToTier2(
    agentId: string,
    operation: OperationTelemetry,
    attempts: RecoveryAttempt[]
  ): Promise<void> {
    console.log(`[TIER1] Escalating to Tier 2`);
    
    const recommendation = await this.classifier.generateRecommendation(operation, attempts);
    
    await telemetryBus.emit('tier1:escalation', {
      agentId,
      operation,
      recoveryAttempts: attempts,
      recommendation,
      timestamp: Date.now()
    });
  }
  
  // Helper methods...
  private getRecentAttempts(key: string): RecoveryAttempt[] {
    const attempts = this.recoveryHistory.get(key) || [];
    const cutoff = Date.now() - this.COOLDOWN_MS;
    return attempts.filter(a => a.startTime > cutoff);
  }
  
  private recordAttempt(key: string, attempt: RecoveryAttempt): void {
    const attempts = this.recoveryHistory.get(key) || [];
    attempts.push(attempt);
    this.recoveryHistory.set(key, attempts);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start watchdog
export const watchdog = new Tier1Watchdog();
```

**Verification:**
- [ ] Watchdog receives Tier 0 events
- [ ] Failures are classified via AI
- [ ] Recovery strategies execute in order
- [ ] Failed strategies are not retried
- [ ] Escalation fires after MAX_ATTEMPTS

---

#### Task 2.2: Failure Classifier (AI-Powered)
**Time:** 12 hours

**Deliverables:**
- Claude API integration for classification
- Recovery strategy generation
- Lint fix generation

```typescript
// packages/tier1-watchdog/src/failure-classifier.ts
import Anthropic from '@anthropic-ai/sdk';

interface FailureClassification {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rootCause: string;
  confidence: number;
  strategies: RecoveryStrategy[];
}

interface RecoveryStrategy {
  name: string;
  commands: string[];
  timeout: number;
  successProbability: number;
  requiresApproval: boolean;
}

export class FailureClassifier {
  private client: Anthropic;
  
  constructor() {
    this.client = new Anthropic();
  }
  
  async classify(operation: OperationTelemetry): Promise<FailureClassification> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Classify this failure and suggest recovery strategies.

Operation: ${operation.operationType}
Service: ${operation.service}
Error: ${operation.error?.message}
Error Code: ${operation.error?.code}
Duration: ${operation.duration}ms
Recoverable: ${operation.error?.recoverable}

Return JSON only:
{
  "type": "TIMEOUT|MEMORY|DEPENDENCY|CODE_ERROR|NETWORK|UNKNOWN",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "rootCause": "your analysis",
  "confidence": 0.0-1.0,
  "strategies": [
    {
      "name": "strategy_name",
      "commands": ["cmd1", "cmd2"],
      "timeout": 30,
      "successProbability": 0.0-1.0,
      "requiresApproval": false
    }
  ]
}`
      }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text);
  }
  
  async generateFixes(lintErrors: LintError[]): Promise<CodeFix[]> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Fix these lint errors. Return JSON array of fixes.

Errors:
${JSON.stringify(lintErrors, null, 2)}

Return:
[
  {
    "file": "path/to/file.ts",
    "line": 42,
    "original": "original code",
    "fixed": "fixed code"
  }
]`
      }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text);
  }
  
  async generateRecommendation(
    operation: OperationTelemetry,
    attempts: RecoveryAttempt[]
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Recovery attempts exhausted. What should happen next?

Failure: ${operation.operationType} - ${operation.error?.message}

Attempts tried:
${attempts.map(a => `- ${a.strategy}: ${a.status} ${a.error || ''}`).join('\n')}

Options:
1. Escalate to human (explain why)
2. Try coordinated multi-service recovery
3. Enable graceful degradation
4. Wait and retry later

Recommend one with brief explanation.`
      }]
    });
    
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
}
```

**Verification:**
- [ ] Claude API called successfully
- [ ] Classification JSON parses correctly
- [ ] Strategies ordered by probability
- [ ] Lint fixes generate valid code

---

#### Task 2.3: Game Engine (Wrapped with Tier 0)
**Time:** 16 hours

**Deliverables:**
- Scene navigation with self-aware tracking
- Effect application
- Context injection hooks

```typescript
// packages/mcp-games-server/src/core/game-engine.ts
import { SelfAwareAgent } from '@omnigents/tier0-runtime';
import { ContextEngine } from './context-engine';
import { StateManager } from './state-manager';

export class GameEngine {
  constructor(
    private agent: SelfAwareAgent,
    private context: ContextEngine,
    private state: StateManager
  ) {}
  
  async startGame(request: StartGameRequest): Promise<StartGameResponse> {
    return this.agent.track(
      'game:start',
      { traceId: request.traceId, sessionId: request.playerId },
      async () => {
        // Load game definition
        const game = await this.loadGame(request.gameId);
        
        // Create session
        const session = await this.state.createSession({
          gameId: request.gameId,
          playerId: request.playerId,
          contextPermissions: request.contextPermissions,
          voiceMode: request.voiceMode
        });
        
        // Get first scene with context
        const scene = await this.getSceneWithContext(session, game.startScene);
        
        return {
          sessionId: session.id,
          scene,
          contextUsed: scene.contextSources
        };
      }
    );
  }
  
  async makeChoice(request: MakeChoiceRequest): Promise<MakeChoiceResponse> {
    return this.agent.track(
      'game:choice',
      { traceId: request.traceId, sessionId: request.sessionId },
      async () => {
        // Get session
        const session = await this.state.getSession(request.sessionId);
        
        // Validate choice
        const game = await this.loadGame(session.gameId);
        const currentScene = game.scenes[session.currentSceneId];
        const choice = currentScene.choices.find(c => c.id === request.choiceId);
        
        if (!choice) {
          throw new InvalidChoiceError(request.choiceId);
        }
        
        // Apply effects
        if (choice.effects) {
          for (const effect of choice.effects) {
            await this.state.applyEffect(session.id, effect);
          }
        }
        
        // Navigate to next scene
        const nextScene = await this.getSceneWithContext(session, choice.targetScene);
        
        // Update session
        await this.state.updateSession(session.id, {
          currentSceneId: choice.targetScene,
          lastActivityAt: new Date()
        });
        
        // Check for game over
        const isEnding = game.endings[choice.targetScene] !== undefined;
        
        return {
          scene: nextScene,
          consequence: choice.text,
          contextUsed: nextScene.contextSources,
          gameOver: isEnding,
          ending: isEnding ? game.endings[choice.targetScene] : undefined
        };
      }
    );
  }
  
  private async getSceneWithContext(
    session: Session,
    sceneId: string
  ): Promise<SceneWithContext> {
    return this.agent.track(
      'game:get_scene',
      { traceId: session.traceId, sessionId: session.id },
      async () => {
        const game = await this.loadGame(session.gameId);
        const sceneDef = game.scenes[sceneId];
        
        // Get context if scene has injection points
        let contextVars: Record<string, string> = {};
        let contextSources: ContextSource[] = [];
        
        if (sceneDef.contextQuery && sceneDef.contextQuery.length > 0) {
          const contextResult = await this.context.getSceneContext(
            session,
            sceneDef
          );
          contextVars = contextResult.variables;
          contextSources = contextResult.sources;
        }
        
        // Inject context into narrative
        const narrative = this.injectContext(sceneDef.narrative, contextVars);
        
        return {
          id: sceneId,
          title: sceneDef.title,
          narrative,
          choices: sceneDef.choices.map(c => ({
            id: c.id,
            text: this.injectContext(c.text, contextVars)
          })),
          contextSources
        };
      }
    );
  }
  
  private injectContext(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return vars[varName] || match;
    });
  }
}
```

**Verification:**
- [ ] Game starts with session created
- [ ] Choices navigate to correct scenes
- [ ] Effects apply to session variables
- [ ] All operations tracked via Tier 0
- [ ] Errors propagate with proper telemetry

---

### Week 3: Context Engine + PersonaPlex + Telegram

**Goal:** Full game playable via Telegram with voice narration.

---

#### Task 3.1: Context Engine (MCP Integration)
**Time:** 16 hours

**Deliverables:**
- Semantic context queries to MCPs
- Calendar, Notes, Weather adapters
- Fallback handling
- Transformation pipeline

```typescript
// packages/mcp-games-server/src/core/context-engine.ts
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

export class ContextEngine {
  private adapters: Map<string, McpAdapter> = new Map();
  
  constructor(private agent: SelfAwareAgent) {
    this.registerAdapters();
  }
  
  private registerAdapters(): void {
    this.adapters.set('calendar', new CalendarMcpAdapter());
    this.adapters.set('notes', new NotesMcpAdapter());
    this.adapters.set('weather', new WeatherMcpAdapter());
  }
  
  async getSceneContext(
    session: Session,
    scene: SceneDefinition
  ): Promise<ContextResult> {
    return this.agent.track(
      'context:get_scene',
      { traceId: session.traceId, sessionId: session.id },
      async () => {
        const results: ContextResult = {
          variables: {},
          sources: []
        };
        
        if (!scene.contextQuery) return results;
        
        // Execute all queries in parallel
        const queries = scene.contextQuery.map(async (injection) => {
          return this.executeQuery(session, injection);
        });
        
        const queryResults = await Promise.all(queries);
        
        for (const result of queryResults) {
          results.variables[result.variable] = result.value;
          results.sources.push({
            source: result.source,
            status: result.status,
            latency: result.latency
          });
        }
        
        return results;
      }
    );
  }
  
  private async executeQuery(
    session: Session,
    injection: ContextInjection
  ): Promise<QueryResult> {
    return this.agent.track(
      `context:query:${injection.contextType}`,
      { traceId: session.traceId, sessionId: session.id },
      async () => {
        // Check permission
        if (!session.contextPermissions[injection.contextType]) {
          return {
            variable: injection.targetVariable,
            value: injection.fallbackValue,
            source: injection.contextType,
            status: 'permission_denied',
            latency: 0
          };
        }
        
        // Get adapter
        const adapter = this.adapters.get(injection.contextType);
        if (!adapter) {
          return {
            variable: injection.targetVariable,
            value: injection.fallbackValue,
            source: injection.contextType,
            status: 'no_adapter',
            latency: 0
          };
        }
        
        // Execute with timeout
        const startTime = performance.now();
        
        try {
          const result = await Promise.race([
            adapter.query(injection.query),
            this.timeout(3000)
          ]);
          
          const latency = performance.now() - startTime;
          
          // Transform result
          const transformed = await this.transform(result, injection.transform);
          
          return {
            variable: injection.targetVariable,
            value: transformed,
            source: injection.contextType,
            status: 'success',
            latency
          };
          
        } catch (error) {
          const latency = performance.now() - startTime;
          
          return {
            variable: injection.targetVariable,
            value: injection.fallbackValue,
            source: injection.contextType,
            status: error.message === 'timeout' ? 'timeout' : 'error',
            latency
          };
        }
      }
    );
  }
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    });
  }
  
  private async transform(data: unknown, transform: string): Promise<string> {
    switch (transform) {
      case 'verbatim':
        return String(data);
      case 'summarize':
        return this.summarize(data);
      case 'extract_names':
        return this.extractNames(data);
      default:
        return String(data);
    }
  }
}
```

**Verification:**
- [ ] Calendar queries return upcoming events
- [ ] Weather queries return conditions
- [ ] Timeouts return fallback values
- [ ] Permission denied returns fallback
- [ ] All queries tracked via Tier 0

---

#### Task 3.2: PersonaPlex Voice Integration
**Time:** 14 hours

**Deliverables:**
- PersonaPlex client
- Narration generation
- Streaming support
- Quality metrics

```typescript
// packages/mcp-games-server/src/adapters/personaplex.ts
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

export class PersonaplexAdapter {
  private readonly baseUrl: string;
  
  constructor(
    private agent: SelfAwareAgent,
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl || process.env.PERSONAPLEX_URL || 'http://localhost:8080';
  }
  
  async narrate(request: NarrationRequest): Promise<NarrationResponse> {
    return this.agent.track(
      'voice:narrate',
      { traceId: request.traceId, sessionId: request.sessionId },
      async () => {
        const startTime = performance.now();
        
        // Build PersonaPlex request
        const ppxRequest = {
          text_prompt: this.buildTextPrompt(request.voicePersona, request.style),
          voice_embedding: this.getVoiceEmbedding(request.voicePersona),
          content: request.narrative
        };
        
        // Call PersonaPlex
        const response = await fetch(`${this.baseUrl}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ppxRequest),
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          throw new Error(`PersonaPlex error: ${response.status}`);
        }
        
        const audioBuffer = await response.arrayBuffer();
        const ppxLatency = performance.now() - startTime;
        
        return {
          audio: Buffer.from(audioBuffer),
          duration: this.estimateDuration(audioBuffer.byteLength),
          latency: ppxLatency
        };
      }
    );
  }
  
  private buildTextPrompt(persona: string, style: string): string {
    const personas: Record<string, string> = {
      'storyteller': 'A warm, wise storyteller with a gentle voice. Speak clearly and engagingly.',
      'dramatic': 'A dramatic narrator with gravitas. Build tension and emphasize key moments.',
      'casual': 'A friendly, casual narrator. Keep it conversational and approachable.',
      'mysterious': 'A mysterious narrator with an air of intrigue. Speak softly with purpose.'
    };
    
    return personas[persona] || personas['storyteller'];
  }
  
  private getVoiceEmbedding(persona: string): string {
    const embeddings: Record<string, string> = {
      'storyteller': 'NATF0',
      'dramatic': 'NATM1',
      'casual': 'NATF2',
      'mysterious': 'VARM0'
    };
    
    return embeddings[persona] || 'NATF0';
  }
  
  private estimateDuration(bytes: number): number {
    // Rough estimate: 24kHz, 16-bit mono = ~48KB per second
    return bytes / 48000;
  }
}
```

**Verification:**
- [ ] PersonaPlex generates audio
- [ ] Voice personas apply correctly
- [ ] Latency tracked
- [ ] Timeout handling works

---

#### Task 3.3: Telegram Bot Integration
**Time:** 16 hours

**Deliverables:**
- Telegram bot with game commands
- Voice message handling
- Status command (Tier 2 integration)
- HITL response handling

```typescript
// packages/telegram-bot/src/bot.ts
import { Telegraf } from 'telegraf';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';
import { GameEngine } from '@omnigents/mcp-games-server';
import { PersonaplexAdapter } from '@omnigents/mcp-games-server';

export class OmniGentTelegramBot {
  private bot: Telegraf;
  private agent: SelfAwareAgent;
  private gameEngine: GameEngine;
  private voice: PersonaplexAdapter;
  private sessions: Map<number, string> = new Map(); // chatId -> sessionId
  
  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
    this.agent = new SelfAwareAgent('telegram-bot-001', 'telegram-bot');
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // Commands
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('games', (ctx) => this.handleListGames(ctx));
    this.bot.command('play', (ctx) => this.handlePlayGame(ctx));
    this.bot.command('status', (ctx) => this.handleStatus(ctx));
    this.bot.command('voice', (ctx) => this.handleToggleVoice(ctx));
    
    // Game choices (callback queries)
    this.bot.on('callback_query', (ctx) => this.handleChoice(ctx));
    
    // Text messages (for freeform input)
    this.bot.on('text', (ctx) => this.handleText(ctx));
    
    // Voice messages
    this.bot.on('voice', (ctx) => this.handleVoiceMessage(ctx));
    
    // HITL responses
    this.bot.action(/^hitl:(.+):(\d+)$/, (ctx) => this.handleHitlResponse(ctx));
  }
  
  private async handlePlayGame(ctx: any): Promise<void> {
    await this.agent.track(
      'telegram:play_game',
      { traceId: this.generateTraceId(), sessionId: String(ctx.chat.id) },
      async () => {
        const gameId = ctx.message.text.split(' ')[1] || 'morning-decision-v1';
        
        const response = await this.gameEngine.startGame({
          gameId,
          playerId: String(ctx.from.id),
          contextPermissions: {
            calendar: true,
            notes: true,
            weather: true
          },
          voiceMode: false,
          traceId: this.generateTraceId()
        });
        
        // Store session mapping
        this.sessions.set(ctx.chat.id, response.sessionId);
        
        // Send scene
        await this.sendScene(ctx, response.scene, response.sessionId);
      }
    );
  }
  
  private async handleChoice(ctx: any): Promise<void> {
    await this.agent.track(
      'telegram:choice',
      { traceId: this.generateTraceId(), sessionId: String(ctx.chat.id) },
      async () => {
        const sessionId = this.sessions.get(ctx.chat.id);
        if (!sessionId) {
          await ctx.reply('No active game. Use /play to start one.');
          return;
        }
        
        const choiceId = ctx.callbackQuery.data;
        
        const response = await this.gameEngine.makeChoice({
          sessionId,
          choiceId,
          traceId: this.generateTraceId()
        });
        
        // Edit previous message to remove buttons
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        
        // Send next scene
        await this.sendScene(ctx, response.scene, sessionId);
        
        // Handle game over
        if (response.gameOver) {
          this.sessions.delete(ctx.chat.id);
          await ctx.reply('🎮 Game complete! Use /play to start another.');
        }
      }
    );
  }
  
  private async sendScene(ctx: any, scene: Scene, sessionId: string): Promise<void> {
    // Check if voice mode
    const session = await this.gameEngine.getSession(sessionId);
    
    if (session.voiceMode) {
      // Generate voice narration
      const narration = await this.voice.narrate({
        sessionId,
        sceneId: scene.id,
        narrative: scene.narrative,
        voicePersona: session.voicePersona || 'storyteller',
        style: 'dramatic',
        traceId: this.generateTraceId()
      });
      
      // Send voice message
      await ctx.replyWithVoice({ source: narration.audio });
    }
    
    // Send text
    await ctx.reply(`*${scene.title}*\n\n${scene.narrative}`, {
      parse_mode: 'Markdown'
    });
    
    // Send choices as inline keyboard
    const keyboard = scene.choices.map(choice => [{
      text: choice.text,
      callback_data: choice.id
    }]);
    
    await ctx.reply('What do you do?', {
      reply_markup: { inline_keyboard: keyboard }
    });
  }
  
  private async handleStatus(ctx: any): Promise<void> {
    // Get Tier 2 status
    const status = await this.getSystemStatus();
    
    const emoji = {
      HEALTHY: '🟢',
      DEGRADED: '🟡',
      CRITICAL: '🔴'
    };
    
    let msg = `${emoji[status.overallHealth]} *Systems Check*\n\n`;
    
    for (const svc of status.services) {
      const e = { OK: '✅', DEGRADED: '⚠️', CRITICAL: '🔴', UNKNOWN: '❓' };
      msg += `${e[svc.status]} ${svc.name} (${svc.uptime})\n`;
    }
    
    msg += `\nWatchdog: ${Math.round(status.watchdogStatus.successRate24h * 100)}% success\n`;
    msg += `HITL Queue: ${status.hitlQueue.pending} pending`;
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  private async handleHitlResponse(ctx: any): Promise<void> {
    const [, requestId, optionId] = ctx.match;
    
    await this.agent.track(
      'telegram:hitl_response',
      { traceId: this.generateTraceId() },
      async () => {
        // Forward to HITL manager
        await hitlManager.handleResponse(requestId, parseInt(optionId), String(ctx.from.id));
        
        await ctx.answerCbQuery('Response recorded. Executing...');
        await ctx.editMessageText('✅ Action executed. Monitoring for stability...');
      }
    );
  }
  
  start(): void {
    this.bot.launch();
    console.log('[TELEGRAM] Bot started');
  }
}
```

**Verification:**
- [ ] `/play` starts a game
- [ ] Choices navigate correctly
- [ ] Voice mode sends audio
- [ ] `/status` shows Tier 2 dashboard
- [ ] HITL responses are handled

---

### Week 4: Tier 2 (Systems Check) + Tier 3 (HITL)

**Goal:** Complete the four-tier stack with aggregation and human escalation.

---

#### Task 4.1: Tier 2 — Systems Check Aggregator
**Time:** 16 hours

**Deliverables:**
- Status aggregation from all services
- Coordinated recovery logic
- CLI, Web, and Telegram interfaces
- Escalation to Tier 3

```typescript
// packages/tier2-systems-check/src/aggregator.ts
import { telemetryBus } from '@omnigents/shared';

interface SystemsStatus {
  timestamp: string;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  services: ServiceStatus[];
  watchdogStatus: WatchdogStatus;
  hitlQueue: { pending: number; oldest: string | null };
  keyMetrics: KeyMetrics;
}

export class Tier2Aggregator {
  private status: SystemsStatus;
  private serviceStates: Map<string, Tier0State> = new Map();
  private escalations: Tier1Escalation[] = [];
  
  constructor() {
    this.subscribe();
    this.startAggregation();
  }
  
  private subscribe(): void {
    // Receive Tier 0 state snapshots
    telemetryBus.subscribe('tier0:state', (data) => {
      this.serviceStates.set(data.agentId, data.state);
    });
    
    // Receive Tier 1 escalations
    telemetryBus.subscribe('tier1:escalation', (data) => {
      this.handleEscalation(data);
    });
    
    // Receive Tier 1 recovery reports
    telemetryBus.subscribe('tier1:recovery', (data) => {
      this.handleRecoveryReport(data);
    });
    
    console.log('[TIER2] Systems Check started');
  }
  
  private startAggregation(): void {
    // Aggregate every 10 seconds
    setInterval(() => this.aggregate(), 10000);
  }
  
  private aggregate(): void {
    const services = this.aggregateServices();
    const watchdog = this.aggregateWatchdog();
    const metrics = this.aggregateMetrics();
    
    this.status = {
      timestamp: new Date().toISOString(),
      overallHealth: this.computeOverallHealth(services),
      services,
      watchdogStatus: watchdog,
      hitlQueue: hitlManager.getQueueStatus(),
      keyMetrics: metrics
    };
    
    // Emit for Tier 1 to consume (cross-service correlation)
    telemetryBus.emit('tier2:status', this.status);
  }
  
  private aggregateServices(): ServiceStatus[] {
    return Array.from(this.serviceStates.entries()).map(([id, state]) => ({
      name: state.service || id,
      status: this.healthScoreToStatus(state.healthScore),
      uptime: this.formatUptime(state.uptime),
      lastCheck: new Date().toISOString(),
      metrics: {
        latency: state.avgLatency,
        errorRate: state.errorRate,
        throughput: state.throughput
      },
      activeIssues: this.getActiveIssues(id)
    }));
  }
  
  private healthScoreToStatus(score: number): 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN' {
    if (score === undefined) return 'UNKNOWN';
    if (score >= 70) return 'OK';
    if (score >= 40) return 'DEGRADED';
    return 'CRITICAL';
  }
  
  // ═══════════════════════════════════════════════════════════
  // SECONDARY HEALING: Coordinated multi-service recovery
  // ═══════════════════════════════════════════════════════════
  
  private async handleEscalation(escalation: Tier1Escalation): Promise<void> {
    console.log(`[TIER2] Received escalation: ${escalation.operation.operationType}`);
    
    // Check for correlated issues
    const correlated = this.findCorrelatedIssues(escalation);
    
    if (correlated.length > 0) {
      console.log(`[TIER2] Found ${correlated.length} correlated issues`);
      
      // Attempt coordinated recovery
      const plan = await this.planCoordinatedRecovery(escalation, correlated);
      
      if (plan.viable) {
        const success = await this.executeCoordinatedRecovery(plan);
        if (success) return;
      }
    }
    
    // If coordinated recovery failed or not applicable, escalate to Tier 3
    if (this.shouldEscalateToHuman(escalation)) {
      await this.escalateToTier3(escalation);
    }
  }
  
  private findCorrelatedIssues(escalation: Tier1Escalation): Incident[] {
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    return this.escalations
      .filter(e => 
        Math.abs(now - e.timestamp) < timeWindow &&
        e.agentId !== escalation.agentId
      )
      .map(e => ({
        service: e.agentId,
        type: e.operation.operationType,
        error: e.operation.error?.message
      }));
  }
  
  private async planCoordinatedRecovery(
    escalation: Tier1Escalation,
    correlated: Incident[]
  ): Promise<CoordinatedRecoveryPlan> {
    // Use AI to plan coordinated recovery
    const response = await aiClient.analyze(`
      Plan coordinated recovery for these correlated issues:
      
      Primary: ${escalation.agentId} - ${escalation.operation.error?.message}
      
      Correlated:
      ${correlated.map(c => `- ${c.service}: ${c.error}`).join('\n')}
      
      Return JSON with:
      - viable: boolean
      - rootCause: string
      - steps: [{ service, action, order }]
      - rollback: [{ service, action }]
    `);
    
    return JSON.parse(response);
  }
  
  private async executeCoordinatedRecovery(plan: CoordinatedRecoveryPlan): Promise<boolean> {
    console.log(`[TIER2] Executing coordinated recovery: ${plan.rootCause}`);
    
    const steps = plan.steps.sort((a, b) => a.order - b.order);
    
    for (const step of steps) {
      try {
        console.log(`[TIER2] Step ${step.order}: ${step.service} - ${step.action}`);
        await this.executeStep(step);
        await this.sleep(2000);
      } catch (error) {
        console.log(`[TIER2] Coordinated recovery failed at step ${step.order}`);
        await this.executeRollback(plan.rollback, step.order);
        return false;
      }
    }
    
    console.log(`[TIER2] Coordinated recovery successful`);
    return true;
  }
  
  private shouldEscalateToHuman(escalation: Tier1Escalation): boolean {
    // Escalate if:
    // 1. Critical severity
    // 2. Novel failure (AI confidence < 50%)
    // 3. Recommendation mentions "human"
    // 4. Security-related
    
    const classification = escalation.classification;
    
    if (classification?.severity === 'CRITICAL') return true;
    if (classification?.confidence < 0.5) return true;
    if (escalation.recommendation?.toLowerCase().includes('human')) return true;
    if (escalation.operation.operationType.includes('security')) return true;
    
    return false;
  }
  
  private async escalateToTier3(escalation: Tier1Escalation): Promise<void> {
    console.log(`[TIER2] Escalating to Tier 3 (Human)`);
    
    await hitlManager.createRequest({
      priority: this.determinePriority(escalation),
      situation: this.formatSituation(escalation),
      aiAnalysis: escalation.recommendation || 'Unable to determine root cause',
      aiRecommendation: this.generateRecommendation(escalation),
      options: this.generateOptions(escalation),
      triggerData: escalation
    });
  }
  
  // ═══════════════════════════════════════════════════════════
  // INTERFACES: CLI, Web, Telegram
  // ═══════════════════════════════════════════════════════════
  
  getStatus(): SystemsStatus {
    return this.status;
  }
  
  formatForCli(): string {
    const s = this.status;
    if (!s) return 'Status not available yet.';
    
    const healthEmoji = { HEALTHY: '🟢', DEGRADED: '🟡', CRITICAL: '🔴' };
    
    let output = `
${healthEmoji[s.overallHealth]} UNRESTRICTED OMNIGENTS — SYSTEMS CHECK
Updated: ${s.timestamp}

SERVICES
`;
    
    for (const svc of s.services) {
      const e = { OK: '✅', DEGRADED: '⚠️', CRITICAL: '🔴', UNKNOWN: '❓' };
      output += `  ${e[svc.status]} ${svc.name.padEnd(20)} ${svc.uptime.padEnd(10)}`;
      if (svc.metrics.latency) output += ` ${svc.metrics.latency}ms`;
      output += '\n';
    }
    
    output += `
WATCHDOG
  Active recoveries: ${s.watchdogStatus.activeRecoveries}
  Success rate (24h): ${Math.round(s.watchdogStatus.successRate24h * 100)}%
  Last action: ${s.watchdogStatus.lastAction || 'None'}

HITL QUEUE: ${s.hitlQueue.pending} pending
`;
    
    return output;
  }
}

export const aggregator = new Tier2Aggregator();
```

---

#### Task 4.2: Tier 3 — Human-in-the-Loop Manager
**Time:** 14 hours

**Deliverables:**
- HITL request creation
- Telegram notification with buttons
- Response handling
- Timeout management

```typescript
// packages/tier3-hitl/src/hitl-manager.ts
import { Telegraf } from 'telegraf';
import { supabase } from '@omnigents/shared';

interface HitlRequest {
  id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  situation: string;
  aiAnalysis: string;
  aiRecommendation: string;
  options: HitlOption[];
  defaultOption?: number;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
  selectedOption?: number;
  respondedBy?: string;
  autoSelected?: boolean;
}

interface HitlOption {
  id: number;
  label: string;
  description: string;
  action: string;
}

export class Tier3HitlManager {
  private bot: Telegraf;
  private pending: Map<string, HitlRequest> = new Map();
  private readonly ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
  
  constructor(bot: Telegraf) {
    this.bot = bot;
    this.loadPendingRequests();
  }
  
  async createRequest(params: CreateHitlParams): Promise<string> {
    const id = this.generateId();
    const timeout = this.getTimeout(params.priority);
    
    const request: HitlRequest = {
      id,
      priority: params.priority,
      situation: params.situation,
      aiAnalysis: params.aiAnalysis,
      aiRecommendation: params.aiRecommendation,
      options: params.options,
      defaultOption: params.defaultOption,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + timeout).toISOString()
    };
    
    // Store in database
    await supabase.from('hitl_requests').insert(request);
    
    // Store in memory
    this.pending.set(id, request);
    
    // Send notification
    await this.notifyHuman(request);
    
    // Start timeout
    this.startTimeout(request);
    
    console.log(`[TIER3] Created HITL request: ${id}`);
    
    return id;
  }
  
  async handleResponse(requestId: string, optionId: number, respondedBy: string): Promise<void> {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new Error(`HITL request ${requestId} not found`);
    }
    
    const option = request.options.find(o => o.id === optionId);
    if (!option) {
      throw new Error(`Invalid option ${optionId}`);
    }
    
    console.log(`[TIER3] Human selected: ${option.label}`);
    
    // Update request
    request.respondedAt = new Date().toISOString();
    request.selectedOption = optionId;
    request.respondedBy = respondedBy;
    request.autoSelected = false;
    
    // Update database
    await supabase.from('hitl_requests')
      .update({
        responded_at: request.respondedAt,
        selected_option: optionId,
        responded_by: respondedBy,
        auto_selected: false
      })
      .eq('id', requestId);
    
    // Execute action
    await this.executeAction(option.action, request);
    
    // Remove from pending
    this.pending.delete(requestId);
    
    // Notify outcome
    await this.notifyOutcome(request, option);
  }
  
  private async notifyHuman(request: HitlRequest): Promise<void> {
    const emoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🔴' };
    
    const message = `${emoji[request.priority]} *OMNIGENT NEEDS INPUT*

*Priority:* ${request.priority}
*Expires:* ${new Date(request.expiresAt).toLocaleTimeString()}

*SITUATION:*
${request.situation}

*AI ANALYSIS:*
${request.aiAnalysis}

*AI RECOMMENDS:*
${request.aiRecommendation}

Select an option:`;
    
    const keyboard = request.options.map(opt => [{
      text: `${opt.id}️⃣ ${opt.label}`,
      callback_data: `hitl:${request.id}:${opt.id}`
    }]);
    
    await this.bot.telegram.sendMessage(this.ADMIN_CHAT_ID, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }
  
  private startTimeout(request: HitlRequest): void {
    const timeout = new Date(request.expiresAt).getTime() - Date.now();
    
    setTimeout(async () => {
      if (this.pending.has(request.id)) {
        await this.handleTimeout(request);
      }
    }, timeout);
  }
  
  private async handleTimeout(request: HitlRequest): Promise<void> {
    console.log(`[TIER3] Request ${request.id} timed out`);
    
    if (request.defaultOption !== undefined) {
      // Auto-select default
      const option = request.options.find(o => o.id === request.defaultOption);
      
      request.respondedAt = new Date().toISOString();
      request.selectedOption = request.defaultOption;
      request.autoSelected = true;
      
      await supabase.from('hitl_requests')
        .update({
          responded_at: request.respondedAt,
          selected_option: request.defaultOption,
          auto_selected: true
        })
        .eq('id', request.id);
      
      await this.executeAction(option!.action, request);
      
      // Notify human of auto-decision
      await this.bot.telegram.sendMessage(
        this.ADMIN_CHAT_ID,
        `⏰ *Auto-selected:* ${option!.label}\n\n(Request timed out)`,
        { parse_mode: 'Markdown' }
      );
    } else if (request.priority === 'HIGH') {
      // Re-notify for HIGH priority
      await this.notifyHuman(request);
    }
    
    this.pending.delete(request.id);
  }
  
  private async executeAction(action: string, request: HitlRequest): Promise<void> {
    console.log(`[TIER3] Executing: ${action}`);
    
    // Parse and execute action
    // Actions are like: "restart:mcp-games", "scale:personaplex:2", "rollback:telegram-bot"
    const [cmd, ...args] = action.split(':');
    
    switch (cmd) {
      case 'restart':
        await this.restartService(args[0]);
        break;
      case 'scale':
        await this.scaleService(args[0], parseInt(args[1]));
        break;
      case 'rollback':
        await this.rollbackService(args[0]);
        break;
      case 'disable':
        await this.disableService(args[0]);
        break;
      case 'approve':
        // Just approval, no action needed
        break;
      default:
        console.log(`[TIER3] Unknown action: ${cmd}`);
    }
  }
  
  getQueueStatus(): { pending: number; oldest: string | null } {
    const pending = this.pending.size;
    const oldest = pending > 0 
      ? Array.from(this.pending.values())
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
          .createdAt
      : null;
    
    return { pending, oldest };
  }
}
```

**Verification:**
- [ ] HITL requests create and store
- [ ] Telegram notification sends with buttons
- [ ] Button response executes action
- [ ] Timeout auto-selects default
- [ ] HIGH priority re-notifies

---

### Week 5: Integration Testing + Documentation + Launch Prep

**Goal:** Full system integration, comprehensive docs, launch ready.

---

#### Task 5.1: End-to-End Integration Tests
**Time:** 16 hours

**Deliverables:**
- Full game flow tests
- Four-tier healing tests
- Performance benchmarks

```typescript
// test/integration/four-tier.test.ts
describe('Four-Tier Self-Healing', () => {
  
  describe('Tier 0 → Tier 1 Flow', () => {
    it('should detect failure and trigger Tier 1 recovery', async () => {
      // Inject failure
      await injectFailure('mcp-games', 'TIMEOUT');
      
      // Wait for Tier 0 to emit
      await waitForEvent('tier0:health', { status: 'DEGRADED' });
      
      // Wait for Tier 1 to attempt recovery
      await waitForEvent('tier1:recovery', { status: 'in_progress' });
      
      // Verify recovery
      const status = await getServiceStatus('mcp-games');
      expect(status).toBe('OK');
    });
    
    it('should retry with different strategies', async () => {
      // Inject persistent failure
      await injectPersistentFailure('mcp-games', 'MEMORY');
      
      // Wait for multiple recovery attempts
      const attempts = await waitForRecoveryAttempts('mcp-games', 3);
      
      // Verify different strategies were tried
      const strategies = new Set(attempts.map(a => a.strategy));
      expect(strategies.size).toBeGreaterThan(1);
    });
  });
  
  describe('Tier 1 → Tier 2 Escalation', () => {
    it('should escalate after max attempts', async () => {
      // Inject unrecoverable failure
      await injectUnrecoverableFailure('personaplex');
      
      // Wait for Tier 1 to exhaust attempts
      await waitForRecoveryAttempts('personaplex', 5);
      
      // Verify escalation to Tier 2
      await waitForEvent('tier1:escalation', { agentId: 'personaplex' });
    });
    
    it('should attempt coordinated recovery for correlated failures', async () => {
      // Inject correlated failures
      await injectFailure('mcp-games', 'DEPENDENCY');
      await injectFailure('context-engine', 'TIMEOUT');
      
      // Wait for Tier 2 to detect correlation
      await waitForEvent('tier2:coordinated_recovery', { services: 2 });
    });
  });
  
  describe('Tier 2 → Tier 3 Escalation', () => {
    it('should escalate critical failures to human', async () => {
      // Inject critical failure
      await injectCriticalFailure('mcp-games');
      
      // Wait for HITL request
      const hitl = await waitForHitlRequest();
      
      expect(hitl.priority).toBe('HIGH');
      expect(hitl.options.length).toBeGreaterThan(0);
    });
    
    it('should handle human response', async () => {
      // Create HITL request
      const requestId = await createHitlRequest({
        priority: 'MEDIUM',
        situation: 'Test failure',
        options: [
          { id: 1, label: 'Restart', action: 'restart:mcp-games' },
          { id: 2, label: 'Ignore', action: 'approve' }
        ]
      });
      
      // Simulate human response
      await hitlManager.handleResponse(requestId, 1, 'test-user');
      
      // Verify action executed
      const logs = await getRecoveryLogs();
      expect(logs).toContainEqual(expect.objectContaining({
        action: 'restart:mcp-games',
        source: 'tier3'
      }));
    });
  });
  
  describe('Performance Benchmarks', () => {
    it('should start game in <500ms', async () => {
      const start = performance.now();
      await gameEngine.startGame({ gameId: 'morning-decision-v1', playerId: 'bench' });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(500);
    });
    
    it('should make choice in <200ms', async () => {
      const session = await createTestSession();
      
      const start = performance.now();
      await gameEngine.makeChoice({ sessionId: session.id, choiceId: 'energetic' });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(200);
    });
    
    it('should detect and start recovery in <5s', async () => {
      const start = performance.now();
      
      await injectFailure('mcp-games', 'TIMEOUT');
      await waitForEvent('tier1:recovery', { status: 'in_progress' });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5000);
    });
  });
});
```

**Verification:**
- [ ] All tier flows work end-to-end
- [ ] Recovery loops function correctly
- [ ] Escalations reach appropriate tiers
- [ ] Performance meets benchmarks

---

#### Task 5.2: Documentation
**Time:** 20 hours

**Deliverables:**
- ARCHITECTURE.md (3,000 words)
- FOUR_TIER_OBSERVABILITY.md (4,000 words)
- GAME_FORMAT.md (2,500 words)
- DEPLOYMENT.md (2,000 words)
- DEBUGGING.md (2,000 words)

**Documentation Outline:**

```markdown
# ARCHITECTURE.md

## Overview
- Four-tier self-healing architecture
- Package structure
- Data flow diagrams

## Tier 0: Self-Aware Runtime
- SelfAwareAgent class
- Operation tracking
- Health score calculation
- Self-healing capabilities

## Tier 1: AI Watchdog
- Failure classification
- Recovery strategies
- Lint + auto-fix loop
- Escalation criteria

## Tier 2: Systems Check
- Status aggregation
- Coordinated recovery
- Interfaces (CLI, Web, Telegram)

## Tier 3: Human-in-the-Loop
- Trigger conditions
- Notification flow
- Response handling
- Timeout behavior

## MCP Games Engine
- Game definition format
- Scene navigation
- Context injection
- Voice integration
```

---

#### Task 5.3: Docker + Deployment Setup
**Time:** 12 hours

**Deliverables:**
- docker-compose.yml (full stack)
- docker-compose.dev.yml (local dev)
- Deployment scripts
- Environment templates

```yaml
# docker-compose.yml
version: '3.9'

services:
  # Core Services
  mcp-games:
    build: ./packages/mcp-games-server
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    
  telegram-bot:
    build: ./packages/telegram-bot
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mcp-games
      - redis
    restart: unless-stopped
    
  personaplex:
    image: nvidia/personaplex:7b-v1
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    ports:
      - "8080:8080"
    restart: unless-stopped
    
  # Tier 1: Watchdog
  tier1-watchdog:
    build: ./packages/tier1-watchdog
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped
    
  # Tier 2: Systems Check
  tier2-systems-check:
    build: ./packages/tier2-systems-check
    environment:
      - REDIS_URL=redis://redis:6379
      - SUPABASE_URL=${SUPABASE_URL}
    ports:
      - "3000:3000"  # Dashboard
    depends_on:
      - redis
    restart: unless-stopped
    
  # Tier 3: HITL
  tier3-hitl:
    build: ./packages/tier3-hitl
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - ADMIN_TELEGRAM_CHAT_ID=${ADMIN_TELEGRAM_CHAT_ID}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - telegram-bot
      - redis
    restart: unless-stopped
    
  # Infrastructure
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=omnigents
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
```

---

## Sprint 1 v2.0 Summary

### Timeline: 35 days (5 weeks)

| Week | Focus | Hours |
|------|-------|-------|
| 1 | Foundation + Tier 0 | 36 |
| 2 | Tier 1 + Game Engine | 48 |
| 3 | Context + Voice + Telegram | 46 |
| 4 | Tier 2 + Tier 3 | 30 |
| 5 | Integration + Docs + Deploy | 48 |
| **Total** | | **208 hours** |

### Deliverables

**Code:**
- ✅ MCP Games server (game engine, context, voice)
- ✅ Telegram bot (games, status, HITL)
- ✅ Tier 0: Self-aware runtime
- ✅ Tier 1: AI Watchdog
- ✅ Tier 2: Systems Check
- ✅ Tier 3: HITL Manager
- ✅ "The Morning Decision" game

**Self-Healing:**
- ✅ 15-20 automated recovery attempts before human
- ✅ Recursive retry loops
- ✅ Lint + auto-fix
- ✅ Coordinated multi-service recovery
- ✅ Push notification escalation

**Documentation:**
- ✅ ARCHITECTURE.md
- ✅ FOUR_TIER_OBSERVABILITY.md
- ✅ GAME_FORMAT.md
- ✅ DEPLOYMENT.md
- ✅ DEBUGGING.md

### Success Metrics

| Metric | Target |
|--------|--------|
| Game start latency | <500ms |
| Choice latency | <200ms |
| Failure detection | <5s |
| Recovery success rate | >90% |
| Human escalations | <5% of failures |
| Uptime | 99.9% |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| PersonaPlex GPU cost | CPU fallback mode, batch narration |
| AI API costs (Tier 1 classifier) | Cache classifications, rate limit |
| False positive recoveries | Confidence thresholds, cooldowns |
| Notification fatigue | Strict escalation criteria, batching |
| Recursive recovery loops | Max attempts, circuit breakers |

---

## Next Actions

1. **Approve Sprint 1 v2.0 plan**
2. **Create GitHub org** (`omnigents` or `unrestricted-omnigents`)
3. **Initialize monorepo** with Turborepo
4. **Start Task 1.1** — Shared infrastructure
5. **Go.**

Ready to execute?
