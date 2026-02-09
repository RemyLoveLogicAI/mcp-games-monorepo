// ═══════════════════════════════════════════════════════════════════════════
// UNRESTRICTED OMNIGENTS - SHARED TYPES
// Four-Tier Self-Healing Architecture
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// TIER 0: Agent Runtime Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentState {
  id: string;
  service: string;
  uptime: number;
  memory: MemoryUsage;
  cpu: CpuUsage;
  healthScore: number;
  activeOperations: number;
  errorCount: number;
  lastError: ErrorInfo | null;
  avgLatency: number;
  errorRate: number;
  throughput: number;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

export interface CpuUsage {
  user: number;
  system: number;
}

export interface ErrorInfo {
  message: string;
  code: string;
  stack?: string;
  recoverable: boolean;
  timestamp?: number;
}

export interface OperationTelemetry {
  operationId: string;
  operationType: string;
  service: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'in_progress' | 'success' | 'failure' | 'timeout';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: ErrorInfo;
  memoryDelta?: number;
  context: OperationContext;
}

export interface OperationContext {
  traceId: string;
  parentId?: string;
  sessionId?: string;
}

export interface Tier0TelemetryBatch {
  agentId: string;
  agentState: AgentState;
  operations: OperationTelemetry[];
  timestamp: number;
}

export interface Tier0HealthEvent {
  agentId: string;
  service: string;
  eventType: string;
  status: 'OK' | 'DEGRADED' | 'CRITICAL';
  healthScore: number;
  data: Record<string, unknown>;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: AI Watchdog Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FailureClassification {
  type: FailureType;
  severity: Severity;
  rootCause: string;
  confidence: number;
  strategies: RecoveryStrategy[];
}

export type FailureType = 
  | 'TIMEOUT'
  | 'MEMORY'
  | 'DEPENDENCY'
  | 'CODE_ERROR'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RecoveryStrategy {
  name: string;
  commands: string[];
  timeout: number;
  successProbability: number;
  sideEffects: string[];
  requiresApproval: boolean;
}

export interface RecoveryAttempt {
  strategy: string;
  startTime: number;
  endTime?: number;
  status: 'in_progress' | 'success' | 'failed';
  result?: string;
  error?: string;
}

export interface Tier1Escalation {
  agentId: string;
  operation: OperationTelemetry;
  classification?: FailureClassification;
  recoveryAttempts: RecoveryAttempt[];
  recommendation: string;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2: Systems Check Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemsStatus {
  timestamp: string;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  services: ServiceStatus[];
  watchdogStatus: WatchdogStatus;
  hitlQueue: HitlQueueStatus;
  keyMetrics: KeyMetrics;
}

export interface ServiceStatus {
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

export interface WatchdogStatus {
  activeRecoveries: number;
  successRate24h: number;
  lastAction: string | null;
  lastActionTime: string | null;
}

export interface HitlQueueStatus {
  pending: number;
  oldest: string | null;
}

export interface KeyMetrics {
  requestsPerMinute: number;
  errorRate: number;
  p99Latency: number;
  activeUsers: number;
}

export interface Incident {
  id: string;
  severity: Severity;
  service: string;
  summary: string;
  startTime: string;
  status: 'ACTIVE' | 'RECOVERING' | 'RESOLVED';
  recoveryAttempts: number;
}

export interface CoordinatedRecoveryPlan {
  viable: boolean;
  rootCause: string;
  steps: CoordinatedRecoveryStep[];
  rollback: CoordinatedRecoveryStep[];
  estimatedTime: number;
}

export interface CoordinatedRecoveryStep {
  service: string;
  action: string;
  order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3: Human-in-the-Loop Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HitlRequest {
  id: string;
  priority: HitlPriority;
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
  triggerData?: unknown;
}

export type HitlPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface HitlOption {
  id: number;
  label: string;
  description: string;
  action: string;
}

export interface CreateHitlParams {
  priority: HitlPriority;
  situation: string;
  aiAnalysis: string;
  aiRecommendation: string;
  options: HitlOption[];
  defaultOption?: number;
  triggerData?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Games Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GameDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  author: string;
  startScene: string;
  scenes: Record<string, SceneDefinition>;
  endings: Record<string, EndingDefinition>;
  contextPermissions: ContextPermissions;
}

export interface SceneDefinition {
  id: string;
  title: string;
  narrative: string;
  choices: ChoiceDefinition[];
  contextQuery?: ContextInjection[];
}

export interface ChoiceDefinition {
  id: string;
  text: string;
  targetScene: string;
  effects?: Effect[];
  conditions?: Condition[];
}

export interface Effect {
  type: 'set' | 'increment' | 'decrement' | 'toggle';
  variable: string;
  value?: unknown;
}

export interface Condition {
  variable: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';
  value: unknown;
}

export interface EndingDefinition {
  id: string;
  title: string;
  narrative: string;
  type: 'good' | 'bad' | 'neutral' | 'secret';
}

export interface ContextPermissions {
  calendar?: boolean;
  notes?: boolean;
  weather?: boolean;
  location?: boolean;
  contacts?: boolean;
}

export interface ContextInjection {
  contextType: keyof ContextPermissions;
  query: string;
  targetVariable: string;
  transform: 'verbatim' | 'summarize' | 'extract_names' | 'extract_dates';
  fallbackValue: string;
}

export interface Session {
  id: string;
  gameId: string;
  playerId: string;
  currentSceneId: string;
  variables: Record<string, unknown>;
  contextPermissions: ContextPermissions;
  voiceMode: boolean;
  voicePersona?: string;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
  traceId: string;
}

export interface SceneWithContext {
  id: string;
  title: string;
  narrative: string;
  choices: { id: string; text: string }[];
  contextSources: ContextSource[];
}

export interface ContextSource {
  source: string;
  status: 'success' | 'timeout' | 'error' | 'permission_denied' | 'no_adapter';
  latency: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NarrationRequest {
  sessionId: string;
  sceneId: string;
  narrative: string;
  voicePersona: string;
  style: 'dramatic' | 'casual' | 'mysterious' | 'neutral';
  traceId: string;
}

export interface NarrationResponse {
  audio: Buffer;
  duration: number;
  latency: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────────────────────────

export type TelemetryStream = 
  | 'tier0:telemetry'
  | 'tier0:health'
  | 'tier0:state'
  | 'tier1:escalation'
  | 'tier1:recovery'
  | 'tier2:status'
  | 'tier3:hitl';

export interface TelemetryEvent<T = unknown> {
  stream: TelemetryStream;
  data: T;
  timestamp: number;
}
