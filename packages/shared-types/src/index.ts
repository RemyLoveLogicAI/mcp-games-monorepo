/**
 * Shared TypeScript type definitions for MCP Games
 *
 * This package provides comprehensive type definitions for:
 * - MCP connections and semantic queries
 * - Story structure and game state
 * - User profiles and preferences
 * - API responses and error handling
 */

// =============================================================================
// MCP Connection Types
// =============================================================================

export type MCPServerType = 'github' | 'linear' | 'notion' | 'filesystem' | 'slack' | 'jira' | 'custom';

export interface MCPConnection {
  id: string;
  name: string;
  type: MCPServerType;
  status: MCPConnectionStatus;
  config: MCPConfig;
  lastConnectedAt?: string;
  errorMessage?: string;
}

export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'rate_limited';

export interface MCPConfig {
  serverUrl?: string;
  authToken?: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
  timeout?: number;
  retryConfig?: RetryConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// =============================================================================
// Authentication Provider Types
// =============================================================================

export type AuthProviderType = 'oauth2' | 'api_key' | 'bearer_token' | 'basic' | 'custom';

export interface AuthCredentials {
  type: AuthProviderType;
  token?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  oauth?: OAuthCredentials;
  customHeaders?: Record<string, string>;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType: string;
  scope?: string[];
}

export interface AuthProvider {
  type: AuthProviderType;
  name: string;
  getCredentials(): Promise<AuthCredentials>;
  refreshCredentials?(): Promise<AuthCredentials>;
  isExpired?(): boolean;
}

// =============================================================================
// Semantic Query Types
// =============================================================================

export interface SemanticQuery {
  server: string;
  query: string;
  filters?: QueryFilters;
  options?: QueryOptions;
}

export interface MultiServerQuery {
  servers: string[];
  query: string;
  filters?: QueryFilters;
  options?: MultiQueryOptions;
  format?: OutputFormat;
}

export type OutputFormat = 'json' | 'markdown' | 'text' | 'html';

export interface QueryFilters {
  timeframe?: TimeframeFilter;
  status?: string[];
  tags?: string[];
  authors?: string[];
  types?: string[];
  [key: string]: unknown;
}

export interface TimeframeFilter {
  start?: string;
  end?: string;
  relative?: RelativeTimeframe;
}

export type RelativeTimeframe = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year';

export interface QueryOptions {
  maxResults?: number;
  includeMetadata?: boolean;
  cachePolicy?: CachePolicy;
  timeout?: number;
}

export interface MultiQueryOptions extends QueryOptions {
  aggregationStrategy?: AggregationStrategy;
  parallelExecution?: boolean;
  failureStrategy?: FailureStrategy;
}

export type CachePolicy = 'no-cache' | 'cache-first' | 'network-first' | 'stale-while-revalidate';
export type AggregationStrategy = 'merge' | 'separate' | 'ranked';
export type FailureStrategy = 'fail-fast' | 'partial-results' | 'retry-all';

export interface QueryResult<T = unknown> {
  data: T;
  metadata: QueryResultMetadata;
}

export interface QueryResultMetadata {
  source: string;
  timestamp: string;
  cached: boolean;
  ttl?: number;
  queryDurationMs?: number;
}

export interface MultiQueryResult<T = unknown> {
  results: ServerQueryResult<T>[];
  aggregated?: T;
  metadata: MultiQueryResultMetadata;
}

export interface ServerQueryResult<T = unknown> {
  serverId: string;
  success: boolean;
  data?: T;
  error?: MCPError;
  metadata?: QueryResultMetadata;
}

export interface MultiQueryResultMetadata {
  totalServers: number;
  successfulServers: number;
  failedServers: number;
  totalDurationMs: number;
  aggregationStrategy?: AggregationStrategy;
}

// =============================================================================
// MCP Error Types
// =============================================================================

export interface MCPError {
  code: MCPErrorCode;
  message: string;
  serverId?: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  timestamp: string;
}

export type MCPErrorCode =
  | 'CONNECTION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'INVALID_QUERY'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'CACHE_ERROR'
  | 'UNKNOWN_ERROR';

// =============================================================================
// Cache Types
// =============================================================================

export interface CacheEntry<T = unknown> {
  data: T;
  metadata: CacheMetadata;
}

export interface CacheMetadata {
  key: string;
  createdAt: string;
  expiresAt: string;
  ttlMs: number;
  hitCount: number;
  size?: number;
}

export interface CacheConfig {
  enabled: boolean;
  defaultTtlMs: number;
  maxEntries: number;
  maxSizeBytes?: number;
  evictionPolicy: EvictionPolicy;
}

export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'ttl';

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  sizeBytes: number;
  hitRate: number;
}

// =============================================================================
// Story Structure Types
// =============================================================================

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
  mcpQueries?: SceneMCPQuery[];
  dynamicNarrative?: boolean;
}

export interface SceneMCPQuery {
  id: string;
  servers: string[];
  queryTemplate: string;
  resultVariable: string;
  required: boolean;
  fallback?: unknown;
}

export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
  requirements?: ChoiceRequirements;
  effects: VariableEffect[];
  dynamicText?: boolean;
  mcpConditions?: MCPCondition[];
}

export interface ChoiceRequirements {
  variables?: Record<string, unknown>;
  mcpData?: MCPDataRequirement[];
}

export interface MCPDataRequirement {
  serverId: string;
  query: string;
  condition: string; // JavaScript expression to evaluate
  fallback?: boolean;
}

export interface MCPCondition {
  query: string;
  operator: ConditionOperator;
  value: unknown;
}

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'not_exists';

export interface VariableEffect {
  variable: string;
  operation: VariableOperation;
  value: unknown;
}

export type VariableOperation = 'set' | 'increment' | 'decrement' | 'append' | 'remove' | 'toggle' | 'merge';

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
  estimatedPlayTime?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  genres?: string[];
}

// =============================================================================
// Game State Types
// =============================================================================

export interface GameState {
  storyId: string;
  userId: string;
  currentSceneId: string;
  variables: StoryVariables;
  choiceHistory: ChoiceHistoryEntry[];
  mcpContext: MCPContext;
  timestamp: string;
  checksum?: string;
}

export interface ChoiceHistoryEntry {
  choiceId: string;
  sceneId: string;
  timestamp: string;
  mcpDataUsed?: string[];
}

export interface MCPContext {
  lastQueried: Record<string, string>;
  cachedData: Record<string, unknown>;
  connectionStatus: Record<string, MCPConnectionStatus>;
}

// =============================================================================
// State Machine Types
// =============================================================================

export type GameStateType =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'choosing'
  | 'transitioning'
  | 'fetching_mcp'
  | 'saving'
  | 'loading_save'
  | 'ended'
  | 'error';

export interface StateMachineState {
  type: GameStateType;
  gameState?: GameState;
  currentScene?: Scene;
  availableChoices?: Choice[];
  error?: GameError;
  pendingMCPQueries?: string[];
}

export interface GameError {
  code: GameErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export type GameErrorCode =
  | 'INVALID_CHOICE'
  | 'SCENE_NOT_FOUND'
  | 'MCP_QUERY_FAILED'
  | 'SAVE_FAILED'
  | 'LOAD_FAILED'
  | 'STATE_CORRUPTED'
  | 'REQUIREMENTS_NOT_MET';

export type StateTransition =
  | { type: 'START_GAME'; userId: string }
  | { type: 'LOAD_GAME'; saveData: string }
  | { type: 'MAKE_CHOICE'; choiceId: string }
  | { type: 'FETCH_MCP_DATA'; queries: SceneMCPQuery[] }
  | { type: 'MCP_DATA_RECEIVED'; data: Record<string, unknown> }
  | { type: 'MCP_DATA_FAILED'; error: MCPError }
  | { type: 'SAVE_GAME' }
  | { type: 'SAVE_COMPLETE'; saveId: string }
  | { type: 'SAVE_FAILED'; error: GameError }
  | { type: 'RESTART_GAME' }
  | { type: 'RECOVER_ERROR' };

// =============================================================================
// User Profile Types
// =============================================================================

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  preferences: UserPreferences;
  mcpConnections: MCPConnection[];
  progress: GameProgress[];
  createdAt: string;
  lastActiveAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  narrativeSpeed: 'slow' | 'medium' | 'fast';
  autoSave: boolean;
  autoSaveInterval?: number;
  privacyLevel: 'public' | 'private' | 'friends';
  enableMCPPersonalization: boolean;
  textSize?: 'small' | 'medium' | 'large';
  soundEnabled?: boolean;
}

export interface GameProgress {
  storyId: string;
  currentSceneId: string;
  variables: StoryVariables;
  choices: string[];
  timestamp: string;
  completionPercentage?: number;
  playTimeSeconds?: number;
}

// =============================================================================
// Save/Load Types
// =============================================================================

export interface SaveData {
  id: string;
  userId: string;
  storyId: string;
  gameState: GameState;
  metadata: SaveMetadata;
  compressed?: boolean;
}

export interface SaveMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  sceneTitle: string;
  thumbnailUrl?: string;
  playTimeSeconds: number;
  choiceCount: number;
}

export interface SaveSlot {
  id: string;
  isEmpty: boolean;
  saveData?: SaveData;
  lastModified?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: APIResponseMetadata;
}

export interface APIResponseMetadata {
  requestId: string;
  timestamp: string;
  durationMs: number;
  version?: string;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// =============================================================================
// Narrative Generation Types
// =============================================================================

export interface NarrativeGenerationRequest {
  storyId: string;
  sceneTemplate: string;
  userContext: UserContext;
  mcpData: Record<string, unknown>;
  previousChoices: ChoiceHistoryEntry[];
  style?: NarrativeStyle;
}

export interface UserContext {
  userId: string;
  preferences: UserPreferences;
  variables: StoryVariables;
  sessionData?: Record<string, unknown>;
}

export interface NarrativeStyle {
  tone: 'dramatic' | 'casual' | 'mysterious' | 'humorous' | 'professional';
  perspective: 'first_person' | 'second_person' | 'third_person';
  verbosity: 'concise' | 'moderate' | 'elaborate';
}

export interface NarrativeGenerationResponse {
  narrative: string;
  choices: Choice[];
  metadata: NarrativeMetadata;
}

export interface NarrativeMetadata {
  model: string;
  tokensUsed: number;
  generationTime: number;
  mcpDataUsed: string[];
  personalizationScore?: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type GameEvent =
  | { type: 'game_started'; storyId: string; userId: string; timestamp: string }
  | { type: 'choice_made'; choiceId: string; sceneId: string; timestamp: string }
  | { type: 'scene_entered'; sceneId: string; timestamp: string }
  | { type: 'mcp_query_executed'; serverId: string; query: string; timestamp: string }
  | { type: 'game_saved'; saveId: string; timestamp: string }
  | { type: 'game_loaded'; saveId: string; timestamp: string }
  | { type: 'game_ended'; endingId: string; timestamp: string }
  | { type: 'error_occurred'; error: GameError; timestamp: string };

export interface EventHandler {
  (event: GameEvent): void | Promise<void>;
}

// =============================================================================
// Utility Types
// =============================================================================

export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Type guard helpers
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success === true;
}

export function isError<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

// MCP Query helper types
export interface MCPQueryContext {
  userId: string;
  sessionId: string;
  preferences: UserPreferences;
  activeConnections: string[];
}

export interface FormattedQueryResult {
  format: OutputFormat;
  content: string;
  rawData?: unknown;
}
