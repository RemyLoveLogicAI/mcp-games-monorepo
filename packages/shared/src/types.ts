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

// ─────────────────────────────────────────────────────────────────────────────
// MCP Connection Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPConnection {
  id: string;
  name: string;
  type: 'github' | 'linear' | 'notion' | 'filesystem' | 'custom';
  status: 'connected' | 'disconnected' | 'error';
  config: MCPConfig;
}

export interface MCPConfig {
  serverUrl?: string;
  authToken?: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Query Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface SemanticQuery {
  server: string;
  query: string;
  filters?: QueryFilters;
  options?: QueryOptions;
}

export interface QueryFilters {
  timeframe?: string;
  status?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface QueryOptions {
  maxResults?: number;
  includeMetadata?: boolean;
  cachePolicy?: 'no-cache' | 'cache-first' | 'network-first';
}

export interface QueryResult<T = unknown> {
  data: T;
  metadata: {
    source: string;
    timestamp: string;
    cached: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Story Structure Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  title: string;
  description: string;
  scenes: Scene[];
  variables: StoryVariables;
  metadata: StoryMetadata;
}

export interface Scene {
  id: string;
  narrative: string;
  choices: Choice[];
  consequences: Consequence[];
  requiredContext?: string[];
}

export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
  requirements?: ChoiceRequirements;
  effects: VariableEffect[];
}

export interface ChoiceRequirements {
  variables?: Record<string, unknown>;
  mcpData?: string[];
}

export interface VariableEffect {
  variable: string;
  operation: 'set' | 'increment' | 'decrement' | 'append';
  value: unknown;
}

export interface Consequence {
  id: string;
  condition: string;
  text: string;
  effects: VariableEffect[];
}

export interface StoryVariables {
  [key: string]: unknown;
}

export interface StoryMetadata {
  author: string;
  version: string;
  tags: string[];
  mcpIntegrations: string[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Profile Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  preferences: UserPreferences;
  mcpConnections: MCPConnection[];
  progress: GameProgress[];
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  narrativeSpeed: 'slow' | 'medium' | 'fast';
  autoSave: boolean;
  privacyLevel: 'public' | 'private' | 'friends';
}

export interface GameProgress {
  storyId: string;
  currentSceneId: string;
  variables: StoryVariables;
  choices: string[];
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: Record<string, unknown>;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative Generation Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export interface NarrativeGenerationRequest {
  storyId: string;
  sceneTemplate: string;
  userContext: Record<string, unknown>;
  mcpData: Record<string, unknown>;
  previousChoices: string[];
}

export interface NarrativeGenerationResponse {
  narrative: string;
  choices: Choice[];
  metadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Types (merged from shared-types)
// ─────────────────────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
