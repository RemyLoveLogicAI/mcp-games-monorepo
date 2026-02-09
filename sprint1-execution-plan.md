# Sprint 1 Execution Plan: Unrestricted OmniAgents
## MCP Games v1 Foundation (30 Days) — Observability-First

**Version:** 1.0  
**Duration:** 30 calendar days (4 weeks)  
**Start Date:** January 27, 2026  
**End Date:** February 26, 2026  
**Category:** Phase 1 Foundation  
**Author:** Remy Sr / LoveLogicAI  

---

## Executive Summary

Sprint 1 delivers a **production-instrumented** MCP Games server running "The Morning Decision" game across Telegram (text + voice via PersonaPlex). Every component ships with comprehensive observability: structured logging, distributed tracing, event telemetry, state snapshots, and debugging interfaces.

**Non-negotiable:** Observability is not an afterthought. It ships with feature parity.

---

## Observability Philosophy

### Principle 1: Verbose by Default
Every significant operation logs structured data:
- **What** happened (operation type, input, output)
- **Why** it happened (decision logic, condition checks)
- **When** it happened (timestamp with nanosecond precision)
- **How long** it took (latency / duration)
- **Traces** connecting it to related operations

### Principle 2: No Blind Spots
- Context injection failures → logged with full query + response
- State mutations → before/after snapshots
- MCP tool calls → request/response bodies
- PersonaPlex latency → per-segment timing
- Telegram message delivery → success/failure with error codes

### Principle 3: Actionable Insights
Logs are searchable, filterable, and exportable for analysis.

---

## Architecture Diagram (Observability Layers)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP GAMES SERVER v1.0                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │          APPLICATION LAYER (Business Logic)               │   │
│  │  ┌──────────────┐  ┌──────────┐  ┌────────────────┐      │   │
│  │  │ Games Router │  │ Sequencer│  │ Context Engine │      │   │
│  │  └──────┬───────┘  └────┬─────┘  └────────┬───────┘      │   │
│  └─────────┼────────────────┼────────────────┼──────────────┘   │
│            │                │                │                  │
├────────────┼────────────────┼────────────────┼──────────────────┤
│  INSTRUMENTATION LAYER (Observability Backbone)                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Structured Logger  │ Tracer  │ Metrics  │ Events Emitter│ │
│  │ (Pino + bunyan)    │ (OTEL)  │ (Metrics)│ (Event stream)│ │
│  └────────┬───────────┴────┬────┴────┬─────┴────────┬──────┘ │
│           │                │        │               │        │
├───────────┼────────────────┼────────┼───────────────┼────────┤
│  STORAGE LAYER (Persistence)                                  │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Supabase    │  │ Supabase Logs│  │ S3 / Backup  │      │
│  │  (Game State)│  │  (Audit Log) │  │  (Archives)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Sprint 1 Task Breakdown

### Week 1: Foundation + Instrumentation Setup

#### Task 1.1: Project Skeleton + Observability Infrastructure
**Objective:** Initialize MCP Games server with logging, tracing, and telemetry wired in.

**Deliverables:**
```
mcp-games-server/
├── src/
│   ├── observability/
│   │   ├── logger.ts              # Pino + bunyan setup
│   │   ├── tracer.ts              # OpenTelemetry init
│   │   ├── metrics.ts             # Prometheus metrics
│   │   ├── events.ts              # Event emitter
│   │   ├── context.ts             # Request context (trace IDs)
│   │   └── index.ts               # Observability barrel export
│   ├── core/
│   │   ├── game-engine.ts         # CYOA sequencer
│   │   ├── state-manager.ts       # Session/variable state
│   │   └── context-engine.ts      # MCP context queries
│   ├── platforms/
│   │   └── telegram/
│   │       ├── bot.ts             # Telegram bot handler
│   │       ├── message-processor.ts
│   │       └── voice-handler.ts   # PersonaPlex integration
│   ├── mcp/
│   │   ├── server.ts              # MCP server init
│   │   ├── tools.ts               # Tool definitions (games/list, games/start, etc)
│   │   └── resources.ts           # Game definitions as resources
│   ├── adapters/
│   │   ├── supabase.ts            # State persistence
│   │   ├── personaplex.ts         # Voice engine client
│   │   └── mcp-client.ts          # For context queries
│   ├── config/
│   │   └── environments.ts        # Dev/staging/prod configs
│   └── index.ts
├── docs/
│   ├── OBSERVABILITY.md           # Verbose observability guide
│   ├── ARCHITECTURE.md            # System design
│   ├── API.md                     # MCP tools reference
│   ├── DEPLOYMENT.md              # Docker, environment setup
│   └── DEBUGGING.md               # Troubleshooting guide
├── docker-compose.yml             # Local dev environment
├── Dockerfile
├── .env.example
└── package.json
```

**Observability Checklist:**
- [ ] Logger initialized with request context propagation
- [ ] OpenTelemetry SDK configured (Node.js auto-instrumentation)
- [ ] Custom metrics registered (game starts, choices made, context queries)
- [ ] Trace sampler configured (100% for dev, configurable for prod)
- [ ] Event emitter wired to log stream
- [ ] Request context middleware capturing trace IDs

**Documentation:**
- `OBSERVABILITY.md` (2,000+ words) — Complete guide to logging, tracing, metrics
- `ARCHITECTURE.md` (2,000+ words) — System design with observability hooks
- `.env.example` with all observability flags

**Estimated Time:** 16 hours

---

#### Task 1.2: Game Definition Parser + Validator
**Objective:** Parse YAML game definitions and validate structure with extensive error reporting.

**Deliverables:**
```typescript
// src/core/game-definition-loader.ts
interface GameDefinitionLoader {
  // Load from file or string
  load(source: string | Buffer): Promise<LoadResult>;
  
  // Comprehensive validation with detailed errors
  validate(definition: GameDefinition): ValidationResult;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];      // Detailed error messages
  warnings: ValidationWarning[];   // Non-fatal issues
  metadata: {
    scenesCount: number;
    contextInjectionPoints: number;
    achievementsCount: number;
    estimatedPlayTime: number;
  };
  executionPlan: {
    startScene: string;
    possibleEndingPaths: string[];
    contextMcpsRequired: string[];
    contextMcpsOptional: string[];
  };
}

interface ValidationError {
  code: string;                    // "MISSING_SCENE", "INVALID_REFERENCE", etc
  path: string;                    // "scenes.wake_up.choices[0].targetScene"
  message: string;                 // Human-readable message
  suggestion?: string;             // How to fix it
  severity: "error" | "warning";
}
```

**Observability Hooks:**
```typescript
// Every validation step is logged
logger.info('game-definition:loading', {
  traceId: ctx.traceId,
  source: 'file',
  size: source.length,
  startTime: Date.now()
});

logger.debug('game-definition:parsing', {
  traceId: ctx.traceId,
  linesParsed: lines.length
});

logger.info('game-definition:validation-complete', {
  traceId: ctx.traceId,
  isValid: result.isValid,
  errorsCount: result.errors.length,
  warningsCount: result.warnings.length,
  duration: Date.now() - startTime
});

// Trace span for full operation
const span = tracer.startSpan('game-definition:load-and-validate');
try {
  const definition = await loader.load(source);
  const validation = loader.validate(definition);
  span.setAttributes({
    'game.id': definition.id,
    'game.scenesCount': validation.metadata.scenesCount,
    'validation.isValid': validation.isValid
  });
} finally {
  span.end();
}
```

**Test Cases (with observability assertions):**
- Valid game definition parses successfully
- Missing scene references are caught with helpful errors
- Context injection points are validated
- Invalid YAML syntax produces clear error messages
- Large game definitions (100+ scenes) parse with performance metadata

**Documentation:**
- `GAME_FORMAT.md` (3,000 words) — Complete YAML schema with examples
- Examples: `games/morning-decision.yaml` with inline documentation

**Estimated Time:** 12 hours

---

#### Task 1.3: Supabase Schema + RLS Policies
**Objective:** Design and deploy production-ready schema with observability audit tables.

**Deliverables:**

```sql
-- Session state table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) NOT NULL,
  player_id TEXT NOT NULL,
  
  -- Current state
  current_scene_id TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  context_permissions JSONB NOT NULL,
  
  -- Voice settings
  voice_mode BOOLEAN DEFAULT FALSE,
  voice_persona TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- RLS
  ENABLE ROW LEVEL SECURITY
);

-- Session history with granular logging
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) NOT NULL,
  
  -- What happened
  event_type TEXT NOT NULL,  -- 'scene_entered', 'choice_made', 'context_injected', 'effect_applied'
  scene_id TEXT NOT NULL,
  choice_id TEXT,
  freeform_input TEXT,
  
  -- Context and effects
  context_injected JSONB,     -- {source: MCP, result: ..., latency_ms: ...}
  context_query JSONB,        -- {query: ..., mcpTargets: [...]}
  effects_applied JSONB,      -- [{type: 'set', variable: ..., value: ...}]
  
  -- Observability
  trace_id TEXT NOT NULL,
  parent_trace_id TEXT,
  request_id TEXT NOT NULL,
  duration_ms INTEGER,        -- How long the operation took
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_session_history_session (session_id, created_at DESC),
  INDEX idx_session_history_trace (trace_id),
  INDEX idx_session_history_type (event_type, created_at DESC)
);

-- MCP context query log (for debugging context integration)
CREATE TABLE context_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  
  -- Query details
  mcp_server TEXT NOT NULL,           -- "calendar", "notes", "weather"
  semantic_query TEXT NOT NULL,
  query_context JSONB,
  
  -- Response
  result_status TEXT NOT NULL,        -- 'success', 'partial', 'timeout', 'error'
  result_data JSONB,
  result_latency_ms INTEGER,
  error_message TEXT,
  
  -- Observability
  trace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_context_log_session (session_id, created_at DESC),
  INDEX idx_context_log_mcp (mcp_server, result_status, created_at DESC),
  INDEX idx_context_log_trace (trace_id)
);

-- Audit log (for compliance + debugging)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What changed
  entity_type TEXT NOT NULL,           -- 'session', 'game_definition'
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,           -- 'created', 'updated', 'deleted'
  
  -- Details
  old_state JSONB,
  new_state JSONB,
  changed_fields TEXT[],
  
  -- Who/why
  actor TEXT,
  reason TEXT,
  
  -- Observability
  trace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_audit_entity (entity_type, entity_id, created_at DESC),
  INDEX idx_audit_trace (trace_id),
  INDEX idx_audit_actor (actor, created_at DESC)
);

-- Voice interaction log (for improving PersonaPlex integration)
CREATE TABLE voice_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  
  -- Request
  persona_prompt TEXT NOT NULL,
  narrative_text TEXT NOT NULL,
  voice_style TEXT,
  
  -- Response
  audio_duration_ms INTEGER,
  personaplex_latency_ms INTEGER,
  audio_quality_score NUMERIC,        -- User-rated or computed
  
  -- Observability
  trace_id TEXT NOT NULL,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_voice_session (session_id, created_at DESC),
  INDEX idx_voice_latency (personaplex_latency_ms, created_at DESC)
);

-- RLS Policies
CREATE POLICY sessions_player_policy ON sessions
  FOR ALL USING (player_id = current_setting('app.player_id'));

CREATE POLICY session_history_player_policy ON session_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE id = session_id 
        AND player_id = current_setting('app.player_id')
    )
  );
```

**Observability Checklist:**
- [ ] All tables have trace_id + request_id for correlation
- [ ] Latency columns on context queries and voice interactions
- [ ] Audit log for state mutations
- [ ] Indexes on trace_id, request_id for debugging
- [ ] RLS policies prevent data leakage

**Documentation:**
- `DATABASE.md` (4,000 words) — Schema walkthrough, observability columns, query examples
- Migration scripts with rollback procedures
- Supabase setup instructions (dev + staging + prod)

**Estimated Time:** 14 hours

---

### Week 2: Core Engine + Context Integration

#### Task 2.1: Game Engine (Scene Navigation)
**Objective:** Implement scene sequencing logic with tracing for every transition.

**Deliverables:**

```typescript
// src/core/game-engine.ts
interface GameEngine {
  // Start a new game
  startGame(request: StartGameRequest): Promise<StartGameResponse>;
  
  // Navigate to a scene
  getScene(sessionId: string, sceneId: string): Promise<SceneResponse>;
  
  // Make a choice
  makeChoice(request: MakeChoiceRequest): Promise<MakeChoiceResponse>;
  
  // Resume game
  resumeGame(sessionId: string): Promise<SceneResponse>;
}

// Every method is instrumented
async startGame(request: StartGameRequest): Promise<StartGameResponse> {
  const span = tracer.startSpan('game-engine:start-game', {
    attributes: {
      'game.id': request.gameId,
      'session.player_id': request.playerId,
      'voice.enabled': request.voiceMode
    }
  });
  
  const traceId = ctx.traceId;
  const startTime = performance.now();
  
  try {
    logger.info('game-engine:start-game:begin', {
      traceId,
      gameId: request.gameId,
      playerId: request.playerId,
      contextPermissions: Object.keys(request.contextPermissions)
    });
    
    // Validate game exists
    const game = await gameRegistry.getGame(request.gameId);
    if (!game) {
      logger.warn('game-engine:start-game:game-not-found', {
        traceId,
        gameId: request.gameId
      });
      throw new GameNotFoundError(request.gameId);
    }
    
    // Create session
    const session = await stateManager.createSession({
      gameId: request.gameId,
      playerId: request.playerId,
      contextPermissions: request.contextPermissions,
      voiceMode: request.voiceMode,
      voicePersona: request.voicePersona
    });
    
    logger.info('game-engine:start-game:session-created', {
      traceId,
      sessionId: session.id,
      startScene: game.definition.startScene
    });
    
    // Get first scene
    const scene = await this.getScene(session.id, game.definition.startScene);
    
    // Log completion
    const duration = performance.now() - startTime;
    logger.info('game-engine:start-game:complete', {
      traceId,
      sessionId: session.id,
      duration,
      contextUsed: scene.contextUsed?.length || 0
    });
    
    span.setAttributes({
      'session.id': session.id,
      'scene.id': scene.scene.id,
      'context.sources': scene.contextUsed?.length || 0
    });
    
    return {
      sessionId: session.id,
      scene: scene.scene,
      contextUsed: scene.contextUsed
    };
  } catch (error) {
    logger.error('game-engine:start-game:error', {
      traceId,
      error: error.message,
      code: error.code
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

async makeChoice(request: MakeChoiceRequest): Promise<MakeChoiceResponse> {
  const span = tracer.startSpan('game-engine:make-choice', {
    attributes: {
      'session.id': request.sessionId,
      'choice.id': request.choiceId
    }
  });
  
  const traceId = ctx.traceId;
  const startTime = performance.now();
  
  try {
    logger.info('game-engine:make-choice:begin', {
      traceId,
      sessionId: request.sessionId,
      choiceId: request.choiceId,
      freeformInput: !!request.freeformInput
    });
    
    // Get current state
    const session = await stateManager.getSession(request.sessionId);
    if (!session) {
      logger.warn('game-engine:make-choice:session-not-found', {
        traceId,
        sessionId: request.sessionId
      });
      throw new SessionNotFoundError(request.sessionId);
    }
    
    // Get current scene
    const currentScene = await gameRegistry.getScene(session.gameId, session.currentSceneId);
    
    // Validate choice exists
    const choice = currentScene.choices.find(c => c.id === request.choiceId);
    if (!choice) {
      logger.warn('game-engine:make-choice:invalid-choice', {
        traceId,
        sessionId: request.sessionId,
        choiceId: request.choiceId,
        availableChoices: currentScene.choices.map(c => c.id)
      });
      throw new InvalidChoiceError(request.choiceId);
    }
    
    // Apply effects
    const effects = choice.effects || [];
    const stateMutations = [];
    
    for (const effect of effects) {
      logger.debug('game-engine:make-choice:applying-effect', {
        traceId,
        type: effect.type,
        variable: effect.variable,
        value: effect.value
      });
      
      const mutation = stateManager.applyEffect(session.id, effect);
      stateMutations.push(mutation);
    }
    
    // Navigate to next scene
    const nextSceneId = choice.targetScene;
    const nextScene = await this.getScene(session.id, nextSceneId);
    
    // Log completion
    const duration = performance.now() - startTime;
    logger.info('game-engine:make-choice:complete', {
      traceId,
      sessionId: request.sessionId,
      fromScene: session.currentSceneId,
      toScene: nextSceneId,
      effectsApplied: effects.length,
      duration
    });
    
    span.setAttributes({
      'scene.from': session.currentSceneId,
      'scene.to': nextSceneId,
      'effects.count': effects.length
    });
    
    return {
      scene: nextScene.scene,
      consequence: choice.text,
      contextUsed: nextScene.contextUsed,
      gameOver: false
    };
  } catch (error) {
    logger.error('game-engine:make-choice:error', {
      traceId,
      error: error.message
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

**Observability Features:**
- Every scene transition logged with before/after state
- Effects tracked individually
- Latency for each operation
- Context used per scene
- Error handling with full stack traces

**Tests:**
- Scene navigation follows definition
- Effects are applied correctly
- Invalid choices are caught
- Latency benchmarks (target: <100ms per transition)

**Documentation:**
- `GAME_ENGINE.md` (2,500 words) — Architecture, state machine, tracing

**Estimated Time:** 20 hours

---

#### Task 2.2: Context Engine (MCP Integration)
**Objective:** Implement semantic context querying with comprehensive error handling and latency tracking.

**Deliverables:**

```typescript
// src/core/context-engine.ts
interface ContextEngine {
  // Query a specific MCP for context
  queryMcp(request: ContextQueryRequest): Promise<ContextQueryResult>;
  
  // Inject context into narrative
  injectContext(narrative: string, variables: Record<string, string>): Promise<string>;
  
  // Get context for a scene (with all injection points)
  getSceneContext(sessionId: string, scene: SceneDefinition): Promise<SceneContextResult>;
}

async queryMcp(request: ContextQueryRequest): Promise<ContextQueryResult> {
  const span = tracer.startSpan('context-engine:query-mcp', {
    attributes: {
      'mcp.server': request.mcpServer,
      'query.length': request.query.length
    }
  });
  
  const traceId = ctx.traceId;
  const startTime = performance.now();
  
  try {
    logger.info('context-engine:query-mcp:begin', {
      traceId,
      mcpServer: request.mcpServer,
      query: request.query,
      timeout: request.timeout || 5000
    });
    
    // Route to appropriate MCP
    const mcpClient = await this.getMcpClient(request.mcpServer);
    if (!mcpClient) {
      logger.warn('context-engine:query-mcp:mcp-not-available', {
        traceId,
        mcpServer: request.mcpServer
      });
      return {
        status: 'not-available',
        data: null,
        error: `MCP server ${request.mcpServer} not available`,
        latency: performance.now() - startTime
      };
    }
    
    // Execute query with timeout
    const queryStart = performance.now();
    const result = await Promise.race([
      mcpClient.call(request.query),
      new Promise((_, reject) => 
        setTimeout(() => reject(new TimeoutError()), request.timeout || 5000)
      )
    ]);
    const queryLatency = performance.now() - queryStart;
    
    logger.info('context-engine:query-mcp:success', {
      traceId,
      mcpServer: request.mcpServer,
      resultSize: JSON.stringify(result).length,
      latency: queryLatency
    });
    
    span.setAttributes({
      'result.status': 'success',
      'result.latency_ms': Math.round(queryLatency)
    });
    
    return {
      status: 'success',
      data: result,
      latency: queryLatency
    };
  } catch (error) {
    const latency = performance.now() - startTime;
    
    if (error instanceof TimeoutError) {
      logger.warn('context-engine:query-mcp:timeout', {
        traceId,
        mcpServer: request.mcpServer,
        latency
      });
      
      return {
        status: 'timeout',
        data: null,
        error: `Query timed out after ${request.timeout}ms`,
        latency
      };
    }
    
    logger.error('context-engine:query-mcp:error', {
      traceId,
      mcpServer: request.mcpServer,
      error: error.message,
      latency
    });
    
    span.recordException(error);
    
    return {
      status: 'error',
      data: null,
      error: error.message,
      latency
    };
  } finally {
    span.end();
  }
}

async getSceneContext(sessionId: string, scene: SceneDefinition): Promise<SceneContextResult> {
  const span = tracer.startSpan('context-engine:get-scene-context', {
    attributes: {
      'session.id': sessionId,
      'scene.id': scene.id,
      'context.injectionPoints': scene.contextQuery?.length || 0
    }
  });
  
  const traceId = ctx.traceId;
  const startTime = performance.now();
  const contextResults = [];
  
  try {
    logger.info('context-engine:get-scene-context:begin', {
      traceId,
      sessionId,
      sceneId: scene.id,
      injectionPointsCount: scene.contextQuery?.length || 0
    });
    
    if (!scene.contextQuery || scene.contextQuery.length === 0) {
      logger.debug('context-engine:get-scene-context:no-injections', {
        traceId,
        sceneId: scene.id
      });
      
      return {
        sceneId: scene.id,
        contextVariables: {},
        contextSources: [],
        totalLatency: 0
      };
    }
    
    // Get session to check permissions
    const session = await stateManager.getSession(sessionId);
    
    // Execute all context queries in parallel with tracing
    const queryPromises = scene.contextQuery.map(async (injection) => {
      const queryStart = performance.now();
      
      logger.debug('context-engine:get-scene-context:executing-injection', {
        traceId,
        injectionId: injection.id,
        contextType: injection.contextType,
        query: injection.query
      });
      
      // Check permissions
      if (!session.contextPermissions[injection.contextType]) {
        logger.debug('context-engine:get-scene-context:permission-denied', {
          traceId,
          injectionId: injection.id,
          contextType: injection.contextType
        });
        
        return {
          injectionId: injection.id,
          variable: injection.targetVariable,
          status: 'permission-denied',
          value: injection.fallbackValue,
          latency: 0
        };
      }
      
      // Execute query
      const queryResult = await this.queryMcp({
        mcpServer: injection.contextType,
        query: injection.query,
        timeout: 3000
      });
      
      const queryLatency = performance.now() - queryStart;
      
      let value = injection.fallbackValue;
      let status = queryResult.status;
      
      if (queryResult.status === 'success' && queryResult.data) {
        // Transform result
        const transformed = await this.transformContext(queryResult.data, injection.transform);
        value = transformed;
        status = 'success';
      }
      
      logger.info('context-engine:get-scene-context:injection-complete', {
        traceId,
        injectionId: injection.id,
        status,
        latency: queryLatency,
        valueLength: JSON.stringify(value).length
      });
      
      return {
        injectionId: injection.id,
        variable: injection.targetVariable,
        status,
        value,
        source: injection.contextType,
        latency: queryLatency
      };
    });
    
    const results = await Promise.all(queryPromises);
    
    // Build context variables map
    const contextVariables: Record<string, string> = {};
    const contextSources = [];
    
    for (const result of results) {
      contextVariables[result.variable] = result.value;
      contextSources.push({
        source: result.source || 'fallback',
        status: result.status,
        latency: result.latency
      });
    }
    
    const totalLatency = performance.now() - startTime;
    
    logger.info('context-engine:get-scene-context:complete', {
      traceId,
      sceneId: scene.id,
      variablesInjected: Object.keys(contextVariables).length,
      successfulQueries: contextSources.filter(s => s.status === 'success').length,
      totalLatency
    });
    
    span.setAttributes({
      'context.variables.count': Object.keys(contextVariables).length,
      'context.totalLatency_ms': Math.round(totalLatency)
    });
    
    return {
      sceneId: scene.id,
      contextVariables,
      contextSources,
      totalLatency
    };
  } catch (error) {
    logger.error('context-engine:get-scene-context:error', {
      traceId,
      sceneId: scene.id,
      error: error.message
    });
    
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

**Observability Features:**
- Each MCP query timed and logged
- Permission checks logged
- Fallback decisions logged
- Parallel query execution tracked
- Total scene context latency aggregated
- Error handling with fallback logic

**Tests:**
- Successful context queries
- Timeout handling (inject fallback)
- Permission denial (inject fallback)
- Parallel query performance
- Context transformation accuracy

**Documentation:**
- `CONTEXT_ENGINE.md` (3,000 words) — How context injection works, MCP integration, debugging

**Estimated Time:** 24 hours

---

### Week 3: Voice + Platform Integration

#### Task 3.1: PersonaPlex Integration
**Objective:** Wire PersonaPlex voice narration with latency tracking and quality metrics.

**Deliverables:**

```typescript
// src/adapters/personaplex.ts
interface PersonaplexAdapter {
  // Generate narration for a scene
  narrate(request: NarrationRequest): Promise<NarrationResponse>;
  
  // Stream narration (for real-time voice)
  narrateStream(request: NarrationRequest): AsyncIterable<AudioChunk>;
}

async narrate(request: NarrationRequest): Promise<NarrationResponse> {
  const span = tracer.startSpan('personaplex:narrate', {
    attributes: {
      'scene.id': request.sceneId,
      'voice.persona': request.voicePersona,
      'narrative.length': request.narrative.length
    }
  });
  
  const traceId = ctx.traceId;
  const startTime = performance.now();
  
  try {
    logger.info('personaplex:narrate:begin', {
      traceId,
      sceneId: request.sceneId,
      narrativeLength: request.narrative.length,
      voicePersona: request.voicePersona,
      style: request.style
    });
    
    // Build PersonaPlex request
    const ppxRequest = {
      textPrompt: this.buildTextPrompt(request.voicePersona),
      voiceEmbedding: this.getVoiceEmbedding(request.voicePersona),
      content: request.narrative,
      style: request.style,
      interruptible: true
    };
    
    logger.debug('personaplex:narrate:request-prepared', {
      traceId,
      textPromptLength: ppxRequest.textPrompt.length,
      hasVoiceEmbedding: !!ppxRequest.voiceEmbedding
    });
    
    // Call PersonaPlex with timeout
    const ppxStart = performance.now();
    const audioBuffer = await Promise.race([
      this.personaplexClient.generateSpeech(ppxRequest),
      new Promise((_, reject) =>
        setTimeout(() => reject(new TimeoutError('PersonaPlex timeout')), 10000)
      )
    ]);
    const ppxLatency = performance.now() - ppxStart;
    
    logger.info('personaplex:narrate:audio-generated', {
      traceId,
      audioSize: audioBuffer.length,
      ppxLatency,
      estimatedDuration: this.estimateDuration(audioBuffer)
    });
    
    // Compute quality metrics
    const quality = await this.computeQualityMetrics(audioBuffer);
    
    span.setAttributes({
      'audio.size_bytes': audioBuffer.length,
      'personaplex.latency_ms': Math.round(ppxLatency),
      'audio.quality_score': quality.score,
      'audio.duration_seconds': quality.duration
    });
    
    const totalLatency = performance.now() - startTime;
    
    logger.info('personaplex:narrate:complete', {
      traceId,
      totalLatency,
      ppxLatency,
      quality: quality.score
    });
    
    return {
      audio: audioBuffer,
      duration: quality.duration,
      personaplexLatency: ppxLatency,
      qualityScore: quality.score,
      totalLatency
    };
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn('personaplex:narrate:timeout', {
        traceId,
        sceneId: request.sceneId
      });
      
      // Fallback: return silent audio or cached narration
      return {
        audio: null,
        error: 'PersonaPlex timeout',
        fallback: true,
        totalLatency: performance.now() - startTime
      };
    }
    
    logger.error('personaplex:narrate:error', {
      traceId,
      error: error.message,
      totalLatency: performance.now() - startTime
    });
    
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

async *narrateStream(request: NarrationRequest): AsyncIterable<AudioChunk> {
  const span = tracer.startSpan('personaplex:narrate-stream');
  const traceId = ctx.traceId;
  const startTime = performance.now();
  let chunkCount = 0;
  
  try {
    logger.info('personaplex:narrate-stream:begin', {
      traceId,
      sceneId: request.sceneId
    });
    
    const stream = await this.personaplexClient.generateSpeechStream({
      textPrompt: this.buildTextPrompt(request.voicePersona),
      voiceEmbedding: this.getVoiceEmbedding(request.voicePersona),
      content: request.narrative,
      style: request.style
    });
    
    for await (const chunk of stream) {
      chunkCount++;
      
      logger.debug('personaplex:narrate-stream:chunk', {
        traceId,
        chunkIndex: chunkCount,
        chunkSize: chunk.data.length,
        elapsed: performance.now() - startTime
      });
      
      yield chunk;
    }
    
    logger.info('personaplex:narrate-stream:complete', {
      traceId,
      totalChunks: chunkCount,
      totalLatency: performance.now() - startTime
    });
  } catch (error) {
    logger.error('personaplex:narrate-stream:error', {
      traceId,
      chunkCount,
      error: error.message
    });
    
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

**Observability Features:**
- PersonaPlex request/response logging
- Per-chunk timing in streaming
- Audio quality metrics
- Timeout handling with fallback
- Voice embedding validation

**Tests:**
- Narration generated successfully
- Audio quality metrics computed
- Stream chunks delivered on time
- Timeout handled gracefully
- Voice persona applied correctly

**Documentation:**
- `PERSONAPLEX_INTEGRATION.md` (2,500 words) — Setup, persona management, quality tuning

**Estimated Time:** 16 hours

---

#### Task 3.2: Telegram Bot Integration
**Objective:** Build Telegram bot handler with message routing and observability.

**Deliverables:**

```typescript
// src/platforms/telegram/bot.ts
class TelegramBot {
  async handleMessage(update: TelegramUpdate): Promise<void> {
    const span = tracer.startSpan('telegram:handle-message', {
      attributes: {
        'telegram.update_id': update.update_id,
        'telegram.chat_id': update.message?.chat.id
      }
    });
    
    const traceId = ctx.traceId;
    const startTime = performance.now();
    
    try {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id.toString();
      const text = update.message.text || '';
      
      logger.info('telegram:handle-message:received', {
        traceId,
        chatId,
        userId,
        messageType: update.message.voice ? 'voice' : 'text',
        textLength: text.length
      });
      
      // Route to appropriate handler
      if (update.message.voice) {
        await this.handleVoiceMessage(chatId, userId, update.message.voice, traceId);
      } else if (text.startsWith('/start')) {
        await this.handleStart(chatId, userId, traceId);
      } else if (text.startsWith('/games')) {
        await this.handleListGames(chatId, traceId);
      } else if (text.startsWith('/play')) {
        await this.handlePlayGame(chatId, userId, text, traceId);
      } else {
        // Assume it's a choice in an active game
        await this.handleGameChoice(chatId, userId, text, traceId);
      }
      
      const duration = performance.now() - startTime;
      logger.info('telegram:handle-message:complete', {
        traceId,
        chatId,
        duration
      });
      
      span.setAttributes({
        'message.processed': true,
        'duration_ms': Math.round(duration)
      });
    } catch (error) {
      logger.error('telegram:handle-message:error', {
        traceId,
        error: error.message,
        stack: error.stack
      });
      
      span.recordException(error);
      
      // Send error message to user
      try {
        await this.sendMessage(
          update.message.chat.id,
          `Sorry, something went wrong: ${error.message}`
        );
      } catch (sendError) {
        logger.error('telegram:send-error:failed', {
          traceId,
          error: sendError.message
        });
      }
    } finally {
      span.end();
    }
  }
  
  private async handlePlayGame(
    chatId: number,
    userId: string,
    command: string,
    traceId: string
  ): Promise<void> {
    const span = tracer.startSpan('telegram:handle-play-game');
    
    try {
      const gameId = command.split(' ')[1];
      
      logger.info('telegram:handle-play-game:begin', {
        traceId,
        chatId,
        userId,
        gameId
      });
      
      // Start game via MCP Games
      const startResponse = await mcpGamesClient.startGame({
        gameId,
        playerId: userId.toString(),
        contextPermissions: {
          allowCalendar: true,
          allowNotes: true,
          allowCustomMcps: []
        },
        voiceMode: false
      });
      
      logger.info('telegram:handle-play-game:game-started', {
        traceId,
        sessionId: startResponse.sessionId,
        scene: startResponse.scene.id
      });
      
      // Send first scene as Telegram message
      await this.sendGameScene(chatId, startResponse.scene, startResponse.sessionId, traceId);
      
      // Store session mapping
      await this.sessionManager.mapTelegramToGame(chatId, startResponse.sessionId);
      
    } catch (error) {
      logger.error('telegram:handle-play-game:error', {
        traceId,
        error: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  private async handleGameChoice(
    chatId: number,
    userId: string,
    choiceText: string,
    traceId: string
  ): Promise<void> {
    const span = tracer.startSpan('telegram:handle-game-choice');
    
    try {
      // Find active session
      const sessionId = await this.sessionManager.getTelegramSession(chatId);
      if (!sessionId) {
        await this.sendMessage(chatId, 'No active game. Type /games to start one.');
        return;
      }
      
      logger.info('telegram:handle-game-choice:begin', {
        traceId,
        chatId,
        sessionId,
        choice: choiceText
      });
      
      // Make choice via MCP Games
      const choiceResponse = await mcpGamesClient.makeChoice({
        sessionId,
        choiceId: choiceText.trim(),
        freeformInput: undefined
      });
      
      logger.info('telegram:handle-game-choice:choice-processed', {
        traceId,
        sessionId,
        nextScene: choiceResponse.scene.id,
        gameOver: choiceResponse.gameOver
      });
      
      // Send next scene
      await this.sendGameScene(chatId, choiceResponse.scene, sessionId, traceId);
      
      if (choiceResponse.gameOver) {
        logger.info('telegram:handle-game-choice:game-over', {
          traceId,
          sessionId
        });
        await this.sessionManager.clearTelegramSession(chatId);
      }
      
    } catch (error) {
      logger.error('telegram:handle-game-choice:error', {
        traceId,
        error: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  }
  
  private async sendGameScene(
    chatId: number,
    scene: Scene,
    sessionId: string,
    traceId: string
  ): Promise<void> {
    const span = tracer.startSpan('telegram:send-game-scene');
    
    try {
      logger.info('telegram:send-game-scene:begin', {
        traceId,
        chatId,
        sceneId: scene.id,
        choicesCount: scene.choices.length
      });
      
      // Format scene as Telegram message
      const message = this.formatSceneAsMessage(scene);
      
      // Send narration
      const sentMessage = await this.sendMessage(chatId, message);
      
      logger.info('telegram:send-game-scene:narration-sent', {
        traceId,
        chatId,
        messageId: sentMessage.message_id
      });
      
      // Send choices as inline keyboard
      const keyboard = this.formatChoicesAsKeyboard(scene.choices);
      await this.sendKeyboard(chatId, 'Choose:', keyboard);
      
      logger.info('telegram:send-game-scene:complete', {
        traceId,
        chatId,
        sceneId: scene.id
      });
    } catch (error) {
      logger.error('telegram:send-game-scene:error', {
        traceId,
        error: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  }
}
```

**Observability Features:**
- Every Telegram update logged
- Session lifecycle tracked
- Message routing decisions logged
- Error handling with user feedback
- Game state transitions logged

**Tests:**
- Message received and routed correctly
- Game started from Telegram command
- Choices processed correctly
- Error messages sent to user
- Session lifecycle managed

**Documentation:**
- `TELEGRAM_INTEGRATION.md` (2,000 words) — Bot setup, deployment, debugging

**Estimated Time:** 18 hours

---

### Week 4: Integration + Testing + Documentation

#### Task 4.1: End-to-End Integration Testing
**Objective:** Full game flow tests with observability assertions.

**Tests:**

```typescript
// test/integration/end-to-end.test.ts
describe('End-to-End: Start Game → Make Choices → Context Injection → Voice', () => {
  
  it('should start game with context injection', async () => {
    const traceId = generateTraceId();
    ctx.set('traceId', traceId);
    
    // Start game
    const startResponse = await mcpGamesServer.startGame({
      gameId: 'morning-decision-v1',
      playerId: 'test-user-123',
      contextPermissions: {
        allowCalendar: true,
        allowNotes: true
      },
      voiceMode: false
    });
    
    // Assertions
    expect(startResponse.sessionId).toBeDefined();
    expect(startResponse.scene.id).toBe('wake_up');
    expect(startResponse.scene.narrative).toContain('{{weather_light}}'); // Should be replaced
    
    // Check logs
    const logs = await logger.getLogsForTrace(traceId);
    expect(logs).toContainEvent('game-engine:start-game:complete');
    expect(logs).toContainEvent('context-engine:get-scene-context:complete');
    
    // Check context injection performance
    const contextLogs = logs.filter(l => l.event === 'context-engine:query-mcp:success');
    contextLogs.forEach(log => {
      expect(log.latency).toBeLessThan(3000); // Should be < 3s
    });
  });
  
  it('should handle choice with multiple effect applications', async () => {
    const traceId = generateTraceId();
    ctx.set('traceId', traceId);
    
    // Make choice
    const choiceResponse = await mcpGamesServer.makeChoice({
      sessionId: 'test-session-123',
      choiceId: 'energetic',
      freeformInput: undefined
    });
    
    // Assertions
    expect(choiceResponse.scene.id).toBe('energetic_morning');
    expect(choiceResponse.gameOver).toBe(false);
    
    // Check logs for effect application
    const logs = await logger.getLogsForTrace(traceId);
    const effectLogs = logs.filter(l => l.event === 'game-engine:make-choice:applying-effect');
    expect(effectLogs.length).toBeGreaterThan(0);
    
    // Verify state mutation
    const session = await db.getSession('test-session-123');
    expect(session.variables.morning_energy).toBe('high');
  });
  
  it('should generate voice narration with timing', async () => {
    const traceId = generateTraceId();
    ctx.set('traceId', traceId);
    
    const narrationResponse = await personaplexAdapter.narrate({
      sceneId: 'energetic_morning',
      narrative: 'You swing your legs out of bed before doubt can catch you.',
      voicePersona: 'NATF0',
      style: 'dramatic'
    });
    
    // Assertions
    expect(narrationResponse.audio).toBeDefined();
    expect(narrationResponse.personaplexLatency).toBeLessThan(3000);
    expect(narrationResponse.qualityScore).toBeGreaterThan(0.7);
    
    // Check logs
    const logs = await logger.getLogsForTrace(traceId);
    const ppxLog = logs.find(l => l.event === 'personaplex:narrate:complete');
    expect(ppxLog).toBeDefined();
    expect(ppxLog.ppxLatency).toBeLessThan(3000);
  });
  
  it('should handle timeout gracefully', async () => {
    const traceId = generateTraceId();
    ctx.set('traceId', traceId);
    
    // Mock slow MCP response
    mockMcpClient.delay = 10000; // 10 seconds
    
    const startResponse = await mcpGamesServer.startGame({
      gameId: 'morning-decision-v1',
      playerId: 'test-user-slow',
      contextPermissions: { allowCalendar: true }
    });
    
    // Should complete within 3s + MCP timeout = 8s total
    expect(startResponse).toBeDefined();
    
    // Check logs for timeout
    const logs = await logger.getLogsForTrace(traceId);
    const timeoutLog = logs.find(l => l.event === 'context-engine:query-mcp:timeout');
    expect(timeoutLog).toBeDefined();
    
    // Scene should still render with fallback
    expect(startResponse.scene.narrative).toContain('the uncertain future'); // Fallback value
  });
});
```

**Performance Benchmarks:**
- Game start: <500ms
- Make choice: <200ms
- Context injection per MCP: <3000ms
- Voice narration: <5000ms
- End-to-end game flow: <10000ms

**Documentation:**
- `TESTING.md` (2,000 words) — Test strategy, running tests, performance benchmarks

**Estimated Time:** 16 hours

---

#### Task 4.2: Comprehensive Observability Documentation
**Objective:** Write extensive guides on all observability features.

**Deliverables:**

```markdown
# OBSERVABILITY.md - 4,000+ words

## Table of Contents
1. Logging Strategy
2. Distributed Tracing
3. Metrics & Performance
4. Event Streams
5. Debugging Workflows
6. Observability Best Practices
7. Alert Rules
8. Dashboard Queries

## 1. Logging Strategy

### Log Levels
- **ERROR**: Game-breaking failures, system errors
- **WARN**: Degraded performance, timeouts, fallbacks used
- **INFO**: Major operations (game started, choice made, context injected)
- **DEBUG**: Detailed operation steps, variable assignments
- **TRACE**: Very detailed, reserved for deep debugging

### Structured Logging Format
Every log includes:
```json
{
  "timestamp": "2026-01-27T14:30:45.123Z",
  "level": "INFO",
  "event": "game-engine:make-choice:complete",
  "traceId": "abc123xyz",
  "requestId": "req-456",
  "sessionId": "sess-789",
  "duration": 145,
  "metadata": {
    "fromScene": "wake_up",
    "toScene": "energetic_morning",
    "effectsApplied": 2
  }
}
```

### Log Filtering Examples
```bash
# Find all game starts
jq 'select(.event == "game-engine:start-game:complete")' logs.jsonl

# Find all context timeouts
jq 'select(.event == "context-engine:query-mcp:timeout")' logs.jsonl

# Find slow operations (>1000ms)
jq 'select(.duration > 1000)' logs.jsonl

# Find specific player
jq 'select(.playerId == "user-123")' logs.jsonl

# Find specific trace
jq 'select(.traceId == "abc123xyz")' logs.jsonl
```

## 2. Distributed Tracing

### Trace Structure
Every operation creates a span:

```
game-engine:start-game (root span, 450ms)
├── gameRegistry:getGame (20ms)
├── stateManager:createSession (50ms)
├── game-engine:getScene (380ms)
│   ├── gameRegistry:getScene (10ms)
│   └── context-engine:get-scene-context (360ms)
│       ├── context-engine:query-mcp (140ms) - calendar
│       │   └── mcpClient:call (135ms)
│       └── context-engine:query-mcp (100ms) - notes
│           └── mcpClient:call (95ms)
└── db:persistSession (10ms)
```

### Trace Visualization
Available in observability dashboard:
- Flame graphs showing timing
- Critical path analysis
- Slow operation highlighting

### Tracing Best Practices
1. Always set trace ID at request boundary
2. Propagate trace ID through all calls
3. Use span attributes for filtering
4. Record exceptions with full context

---

[CONTINUE for 3,000+ more words covering Metrics, Events, Debugging, Alerts, Dashboards...]
```

**Other Documents to Create:**

1. **DEBUGGING.md** (2,500 words)
   - Common issues and solutions
   - Log-based debugging workflows
   - Trace analysis examples
   - Performance optimization

2. **ARCHITECTURE.md** (2,000 words)
   - System design
   - Data flow diagrams
   - Observability hooks in each component

3. **DEPLOYMENT.md** (2,000 words)
   - Environment setup
   - Logging infrastructure
   - Monitoring setup

4. **API.md** (1,500 words)
   - MCP Tools reference
   - Tool parameters
   - Response schemas
   - Error codes

**Estimated Time:** 24 hours

---

#### Task 4.3: Docker + Local Development Setup
**Objective:** reproducible dev environment with observability stack.

**Deliverables:**

```yaml
# docker-compose.yml
version: '3.9'

services:
  # MCP Games Server
  mcp-games:
    build: .
    ports:
      - "8000:8000"
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
      TRACE_ENABLED: "true"
      TRACE_SAMPLE_RATE: "1.0"  # 100% sampling in dev
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_KEY: ${SUPABASE_KEY}
      PERSONAPLEX_API_KEY: ${PERSONAPLEX_API_KEY}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
    depends_on:
      - postgres
      - jaeger
      - prometheus
    networks:
      - omnigents-net
    volumes:
      - ./src:/app/src  # Hot reload
      - ./logs:/app/logs

  # PostgreSQL (Supabase backend)
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: omnigents_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - omnigents-net

  # Jaeger (Distributed Tracing)
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP receiver
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
    networks:
      - omnigents-net

  # Prometheus (Metrics)
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - omnigents-net

  # Grafana (Dashboards)
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./observability/grafana-dashboards:/etc/grafana/provisioning/dashboards
    depends_on:
      - prometheus
    networks:
      - omnigents-net

  # Loki (Log aggregation)
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./observability/loki-config.yml:/etc/loki/local-config.yml
      - loki_data:/loki
    networks:
      - omnigents-net

  # Promtail (Log shipper)
  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./logs:/var/log/app
      - ./observability/promtail-config.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki
    networks:
      - omnigents-net

volumes:
  postgres_data:
  prometheus_data:
  grafana_data:
  loki_data:

networks:
  omnigents-net:
    driver: bridge
```

**Setup Instructions:**
```bash
# 1. Clone repo
git clone https://github.com/omnigents/mcp-games.git
cd mcp-games

# 2. Copy env file
cp .env.example .env
# Edit .env with your keys

# 3. Start stack
docker-compose up -d

# 4. Run migrations
docker-compose exec mcp-games npm run migrate

# 5. Check services
# Jaeger UI: http://localhost:16686
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
# Loki: http://localhost:3100

# 6. Run tests
docker-compose exec mcp-games npm test

# 7. Start development
docker-compose exec mcp-games npm run dev
```

**Estimated Time:** 12 hours

---

## Sprint 1 Summary

| Week | Task | Estimated Hours | Status |
|------|------|-----------------|--------|
| 1 | Project Skeleton + Infra | 16 | Ready |
| 1 | Game Definition Parser | 12 | Ready |
| 1 | Supabase Schema + RLS | 14 | Ready |
| 2 | Game Engine | 20 | Ready |
| 2 | Context Engine | 24 | Ready |
| 3 | PersonaPlex Integration | 16 | Ready |
| 3 | Telegram Bot | 18 | Ready |
| 4 | E2E Testing | 16 | Ready |
| 4 | Observability Docs | 24 | Ready |
| 4 | Docker Setup | 12 | Ready |
| **TOTAL** | | **172 hours** | |

**30-day calendar breakdown:** 5.7 hours/day = realistic solo founder pace

---

## Deliverables at Sprint 1 Completion

### Code
- ✅ Fully instrumented MCP Games server
- ✅ "The Morning Decision" game playable on Telegram (text mode)
- ✅ PersonaPlex voice narration integration
- ✅ All observability wired in (logs, traces, metrics)

### Observability
- ✅ Structured logs (Loki + Grafana)
- ✅ Distributed traces (Jaeger)
- ✅ Metrics dashboard (Prometheus + Grafana)
- ✅ Event stream (in Supabase)

### Documentation
- ✅ OBSERVABILITY.md (4,000+ words)
- ✅ ARCHITECTURE.md (2,000+ words)
- ✅ API.md (1,500+ words)
- ✅ DEBUGGING.md (2,500+ words)
- ✅ DEPLOYMENT.md (2,000+ words)
- ✅ GAME_FORMAT.md (3,000+ words)
- ✅ TELEGRAM_INTEGRATION.md (2,000+ words)
- ✅ PERSONAPLEX_INTEGRATION.md (2,500+ words)
- ✅ TESTING.md (2,000+ words)

### Success Metrics
- [ ] Game starts: <500ms
- [ ] Make choice: <200ms
- [ ] Context injection: <3000ms
- [ ] Voice narration: <5000ms
- [ ] 100% test coverage for game logic
- [ ] Zero unhandled errors in production

---

## Risk Mitigations (Built Into Sprint)

| Risk | Mitigation |
|------|-----------|
| PersonaPlex latency | Fallback to text, caching, timeout handling (3.1) |
| MCP query failures | Fallback values, timeout logic (2.2) |
| State inconsistency | Comprehensive logging + audit trail (1.3) |
| Context leakage | RLS policies + permission checks (1.3, 2.2) |
| Debugging complexity | Verbose logging + tracing (throughout) |

---

## Assumption Ledger (Updated)

| Assumption | Rationale | Validation |
|-----------|-----------|-----------|
| PersonaPlex self-hostable | Doc says MIT license + open source | ✅ Confirmed |
| 30-day timeline realistic | 172 hours ÷ 6 hours/day = 29 days | ⏳ Pending verification |
| Telegram API stable | Documented, widely used | ✅ Confirmed |
| Supabase RLS sufficient for game state | Standard PostgreSQL RLS patterns | ⏳ Testing in Week 1 |
| Observability overhead <10% | Async logging, sampled tracing | ⏳ Benchmark in Week 4 |

---

## Next Actions

1. **Approve Sprint 1 plan** → lock it
2. **Set up GitHub org** → create repos
3. **Initialize project structure** → start Task 1.1
4. **Deploy observability stack** → Task 1.1
5. **Begin development** → Jan 27, 2026

---

*Sprint 1 is locked and ready to execute. Every component has observability wired in from day one. No blind spots. No surprises.*

**Unrestricted OmniAgents. Built with precision. Observed completely.**
