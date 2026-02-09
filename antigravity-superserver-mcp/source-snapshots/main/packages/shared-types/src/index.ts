/**
 * Shared TypeScript type definitions for MCP Games
 */

// MCP Connection Types
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

// Semantic Query Types
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

// Story Structure Types
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

// User Profile Types
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

// API Response Types
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

// Narrative Generation Types
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

// Utility Types
export type Result<T, E = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
