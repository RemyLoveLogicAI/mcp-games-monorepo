/**
 * Game State Machine - Finite state machine for CYOA game flow
 *
 * Manages all game state transitions including:
 * - Starting and loading games
 * - Processing player choices
 * - Fetching MCP data for personalization
 * - Saving and loading game progress
 * - Error recovery
 *
 * State Diagram:
 * ```
 * idle -> loading -> playing <-> choosing
 *                       |           |
 *                       v           v
 *                 fetching_mcp  transitioning
 *                       |           |
 *                       +--> playing <--+
 *                              |
 *                        +-----+-----+
 *                        v     v     v
 *                      saving ended error
 * ```
 */

import type {
  Story,
  Scene,
  Choice,
  GameState,
  GameStateType,
  StateMachineState,
  StateTransition,
  GameError,
  GameErrorCode,
  ChoiceHistoryEntry,
  MCPContext,
  SceneMCPQuery,
  StoryVariables,
  VariableEffect,
  VariableOperation,
  GameEvent,
  EventHandler,
  MCPError,
} from 'shared-types';

/**
 * State machine configuration
 */
export interface StateMachineConfig {
  /** Enable auto-save after each choice */
  autoSave?: boolean;
  /** Auto-save interval in milliseconds */
  autoSaveInterval?: number;
  /** Maximum history length to store */
  maxHistoryLength?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Default state machine configuration
 */
const DEFAULT_CONFIG: Required<StateMachineConfig> = {
  autoSave: true,
  autoSaveInterval: 60000,
  maxHistoryLength: 1000,
  debug: false,
};

/**
 * MCP query executor interface - implemented by external MCP client
 */
export interface MCPQueryExecutor {
  executeQueries(queries: SceneMCPQuery[]): Promise<Record<string, unknown>>;
}

/**
 * Save manager interface - implemented by storage layer
 */
export interface SaveManager {
  save(state: GameState): Promise<string>;
  load(saveId: string): Promise<GameState>;
  list(userId: string): Promise<string[]>;
  delete(saveId: string): Promise<void>;
}

/**
 * Finite state machine for CYOA game management
 */
export class GameStateMachine {
  private story: Story;
  private state: StateMachineState;
  private config: Required<StateMachineConfig>;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private mcpExecutor?: MCPQueryExecutor;
  private saveManager?: SaveManager;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(
    story: Story,
    config: StateMachineConfig = {},
    mcpExecutor?: MCPQueryExecutor,
    saveManager?: SaveManager
  ) {
    this.story = story;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mcpExecutor = mcpExecutor;
    this.saveManager = saveManager;

    // Initialize to idle state
    this.state = {
      type: 'idle',
    };
  }

  // ==========================================================================
  // State Getters
  // ==========================================================================

  /**
   * Get current state type
   */
  getStateType(): GameStateType {
    return this.state.type;
  }

  /**
   * Get full state machine state
   */
  getState(): StateMachineState {
    return { ...this.state };
  }

  /**
   * Get current game state
   */
  getGameState(): GameState | undefined {
    return this.state.gameState ? { ...this.state.gameState } : undefined;
  }

  /**
   * Get current scene
   */
  getCurrentScene(): Scene | undefined {
    return this.state.currentScene;
  }

  /**
   * Get available choices
   */
  getAvailableChoices(): Choice[] {
    return this.state.availableChoices ?? [];
  }

  /**
   * Get last error
   */
  getError(): GameError | undefined {
    return this.state.error;
  }

  /**
   * Check if game is in a playable state
   */
  isPlayable(): boolean {
    return ['playing', 'choosing'].includes(this.state.type);
  }

  /**
   * Check if game has ended
   */
  isEnded(): boolean {
    return this.state.type === 'ended';
  }

  // ==========================================================================
  // State Transitions
  // ==========================================================================

  /**
   * Process a state transition
   */
  async transition(action: StateTransition): Promise<StateMachineState> {
    this.log(`Transition: ${action.type} from state: ${this.state.type}`);

    try {
      switch (action.type) {
        case 'START_GAME':
          return this.handleStartGame(action.userId);

        case 'LOAD_GAME':
          return this.handleLoadGame(action.saveData);

        case 'MAKE_CHOICE':
          return this.handleMakeChoice(action.choiceId);

        case 'FETCH_MCP_DATA':
          return this.handleFetchMCPData(action.queries);

        case 'MCP_DATA_RECEIVED':
          return this.handleMCPDataReceived(action.data);

        case 'MCP_DATA_FAILED':
          return this.handleMCPDataFailed(action.error);

        case 'SAVE_GAME':
          return this.handleSaveGame();

        case 'SAVE_COMPLETE':
          return this.handleSaveComplete(action.saveId);

        case 'SAVE_FAILED':
          return this.handleSaveFailed(action.error);

        case 'RESTART_GAME':
          return this.handleRestartGame();

        case 'RECOVER_ERROR':
          return this.handleRecoverError();

        default:
          throw this.createError('INVALID_CHOICE', `Unknown action type`);
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ==========================================================================
  // Transition Handlers
  // ==========================================================================

  private async handleStartGame(userId: string): Promise<StateMachineState> {
    this.assertState(['idle', 'ended', 'error']);

    this.updateState({ type: 'loading' });

    // Get first scene
    const firstScene = this.story.scenes[0];
    if (!firstScene) {
      throw this.createError('SCENE_NOT_FOUND', 'Story has no scenes');
    }

    // Initialize game state
    const gameState: GameState = {
      storyId: this.story.id,
      userId,
      currentSceneId: firstScene.id,
      variables: { ...this.story.variables },
      choiceHistory: [],
      mcpContext: {
        lastQueried: {},
        cachedData: {},
        connectionStatus: {},
      },
      timestamp: new Date().toISOString(),
    };

    // Check for MCP queries in first scene
    if (firstScene.mcpQueries && firstScene.mcpQueries.length > 0 && this.mcpExecutor) {
      this.updateState({
        type: 'fetching_mcp',
        gameState,
        currentScene: firstScene,
        pendingMCPQueries: firstScene.mcpQueries.map(q => q.id),
      });

      // Trigger MCP data fetch
      return this.transition({
        type: 'FETCH_MCP_DATA',
        queries: firstScene.mcpQueries,
      });
    }

    // No MCP queries, go directly to playing
    const availableChoices = this.filterAvailableChoices(firstScene.choices, gameState);

    this.updateState({
      type: firstScene.choices.length > 0 ? 'choosing' : 'ended',
      gameState,
      currentScene: firstScene,
      availableChoices,
    });

    this.emit({
      type: 'game_started',
      storyId: this.story.id,
      userId,
      timestamp: new Date().toISOString(),
    });

    this.startAutoSave();

    return this.state;
  }

  private async handleLoadGame(saveData: string): Promise<StateMachineState> {
    this.assertState(['idle', 'ended', 'error']);

    this.updateState({ type: 'loading_save' });

    try {
      // Parse save data
      const gameState: GameState = JSON.parse(saveData);

      // Validate state
      if (gameState.storyId !== this.story.id) {
        throw this.createError('STATE_CORRUPTED', 'Save data is for a different story');
      }

      // Get current scene
      const scene = this.getSceneById(gameState.currentSceneId);
      if (!scene) {
        throw this.createError('SCENE_NOT_FOUND', `Scene ${gameState.currentSceneId} not found`);
      }

      // Validate checksum if present
      if (gameState.checksum) {
        const expectedChecksum = this.calculateChecksum(gameState);
        if (gameState.checksum !== expectedChecksum) {
          throw this.createError('STATE_CORRUPTED', 'Save data checksum mismatch');
        }
      }

      const availableChoices = this.filterAvailableChoices(scene.choices, gameState);

      this.updateState({
        type: scene.choices.length > 0 ? 'choosing' : 'ended',
        gameState,
        currentScene: scene,
        availableChoices,
      });

      this.emit({
        type: 'game_loaded',
        saveId: 'loaded',
        timestamp: new Date().toISOString(),
      });

      this.startAutoSave();

      return this.state;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('LOAD_FAILED', `Failed to load save: ${error}`);
    }
  }

  private async handleMakeChoice(choiceId: string): Promise<StateMachineState> {
    this.assertState(['choosing', 'playing']);

    if (!this.state.gameState || !this.state.currentScene) {
      throw this.createError('STATE_CORRUPTED', 'No active game state');
    }

    // Find the choice
    const choice = this.state.currentScene.choices.find(c => c.id === choiceId);
    if (!choice) {
      throw this.createError('INVALID_CHOICE', `Choice ${choiceId} not found`);
    }

    // Verify requirements are met
    if (!this.meetsRequirements(choice, this.state.gameState)) {
      throw this.createError('REQUIREMENTS_NOT_MET', 'Choice requirements not met');
    }

    this.updateState({ type: 'transitioning' });

    // Apply variable effects
    const newVariables = this.applyEffects(
      this.state.gameState.variables,
      choice.effects
    );

    // Record choice in history
    const historyEntry: ChoiceHistoryEntry = {
      choiceId,
      sceneId: this.state.currentScene.id,
      timestamp: new Date().toISOString(),
      mcpDataUsed: Object.keys(this.state.gameState.mcpContext.cachedData),
    };

    // Get next scene
    const nextScene = this.getSceneById(choice.nextSceneId);
    if (!nextScene) {
      throw this.createError('SCENE_NOT_FOUND', `Scene ${choice.nextSceneId} not found`);
    }

    // Update game state
    const newGameState: GameState = {
      ...this.state.gameState,
      currentSceneId: nextScene.id,
      variables: newVariables,
      choiceHistory: [...this.state.gameState.choiceHistory, historyEntry].slice(
        -this.config.maxHistoryLength
      ),
      timestamp: new Date().toISOString(),
    };

    this.emit({
      type: 'choice_made',
      choiceId,
      sceneId: this.state.currentScene.id,
      timestamp: new Date().toISOString(),
    });

    // Check for MCP queries in next scene
    if (nextScene.mcpQueries && nextScene.mcpQueries.length > 0 && this.mcpExecutor) {
      this.updateState({
        type: 'fetching_mcp',
        gameState: newGameState,
        currentScene: nextScene,
        pendingMCPQueries: nextScene.mcpQueries.map(q => q.id),
      });

      return this.transition({
        type: 'FETCH_MCP_DATA',
        queries: nextScene.mcpQueries,
      });
    }

    // Transition to next scene
    const availableChoices = this.filterAvailableChoices(nextScene.choices, newGameState);
    const isEnded = nextScene.choices.length === 0;

    this.updateState({
      type: isEnded ? 'ended' : 'choosing',
      gameState: newGameState,
      currentScene: nextScene,
      availableChoices,
    });

    this.emit({
      type: 'scene_entered',
      sceneId: nextScene.id,
      timestamp: new Date().toISOString(),
    });

    if (isEnded) {
      this.emit({
        type: 'game_ended',
        endingId: nextScene.id,
        timestamp: new Date().toISOString(),
      });
      this.stopAutoSave();
    }

    // Auto-save if enabled
    if (this.config.autoSave && !isEnded) {
      this.transition({ type: 'SAVE_GAME' }).catch(e => {
        this.log(`Auto-save failed: ${e}`);
      });
    }

    return this.state;
  }

  private async handleFetchMCPData(queries: SceneMCPQuery[]): Promise<StateMachineState> {
    if (!this.mcpExecutor) {
      // No MCP executor, use fallbacks
      const fallbackData: Record<string, unknown> = {};
      for (const query of queries) {
        if (query.fallback !== undefined) {
          fallbackData[query.resultVariable] = query.fallback;
        }
      }
      return this.transition({ type: 'MCP_DATA_RECEIVED', data: fallbackData });
    }

    try {
      const mcpData = await this.mcpExecutor.executeQueries(queries);
      return this.transition({ type: 'MCP_DATA_RECEIVED', data: mcpData });
    } catch (error) {
      const mcpError: MCPError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'MCP query failed',
        retryable: true,
        timestamp: new Date().toISOString(),
      };
      return this.transition({ type: 'MCP_DATA_FAILED', error: mcpError });
    }
  }

  private async handleMCPDataReceived(data: Record<string, unknown>): Promise<StateMachineState> {
    if (!this.state.gameState || !this.state.currentScene) {
      throw this.createError('STATE_CORRUPTED', 'No active game state');
    }

    // Update MCP context
    const updatedMCPContext: MCPContext = {
      ...this.state.gameState.mcpContext,
      cachedData: {
        ...this.state.gameState.mcpContext.cachedData,
        ...data,
      },
      lastQueried: {
        ...this.state.gameState.mcpContext.lastQueried,
        ...Object.fromEntries(Object.keys(data).map(k => [k, new Date().toISOString()])),
      },
    };

    // Update variables with MCP data
    const updatedVariables = { ...this.state.gameState.variables };
    for (const [key, value] of Object.entries(data)) {
      updatedVariables[`mcp_${key}`] = value;
    }

    const newGameState: GameState = {
      ...this.state.gameState,
      variables: updatedVariables,
      mcpContext: updatedMCPContext,
    };

    const availableChoices = this.filterAvailableChoices(
      this.state.currentScene.choices,
      newGameState
    );

    this.updateState({
      type: this.state.currentScene.choices.length > 0 ? 'choosing' : 'ended',
      gameState: newGameState,
      currentScene: this.state.currentScene,
      availableChoices,
      pendingMCPQueries: undefined,
    });

    return this.state;
  }

  private async handleMCPDataFailed(error: MCPError): Promise<StateMachineState> {
    if (!this.state.gameState || !this.state.currentScene) {
      throw this.createError('STATE_CORRUPTED', 'No active game state');
    }

    // Use fallbacks for required queries that failed
    const fallbackData: Record<string, unknown> = {};
    const queries = this.state.currentScene.mcpQueries ?? [];

    for (const query of queries) {
      if (query.required && query.fallback === undefined) {
        // Required query with no fallback - this is an error
        const gameError = this.createError(
          'MCP_QUERY_FAILED',
          `Required MCP query failed: ${error.message}`
        );
        this.updateState({
          type: 'error',
          gameState: this.state.gameState,
          currentScene: this.state.currentScene,
          error: gameError,
        });

        this.emit({
          type: 'error_occurred',
          error: gameError,
          timestamp: new Date().toISOString(),
        });

        return this.state;
      }

      if (query.fallback !== undefined) {
        fallbackData[query.resultVariable] = query.fallback;
      }
    }

    // All queries have fallbacks, continue with fallback data
    return this.transition({ type: 'MCP_DATA_RECEIVED', data: fallbackData });
  }

  private async handleSaveGame(): Promise<StateMachineState> {
    if (!this.state.gameState) {
      throw this.createError('STATE_CORRUPTED', 'No game state to save');
    }

    const previousState = this.state.type;
    this.updateState({ type: 'saving' });

    try {
      // Add checksum
      const stateToSave: GameState = {
        ...this.state.gameState,
        checksum: this.calculateChecksum(this.state.gameState),
      };

      if (this.saveManager) {
        const saveId = await this.saveManager.save(stateToSave);
        return this.transition({ type: 'SAVE_COMPLETE', saveId });
      }

      // No save manager, return serialized state
      return this.transition({
        type: 'SAVE_COMPLETE',
        saveId: JSON.stringify(stateToSave),
      });
    } catch (error) {
      const gameError = this.createError(
        'SAVE_FAILED',
        `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return this.transition({ type: 'SAVE_FAILED', error: gameError });
    }
  }

  private async handleSaveComplete(saveId: string): Promise<StateMachineState> {
    // Return to previous playable state
    if (this.state.currentScene && this.state.gameState) {
      const availableChoices = this.filterAvailableChoices(
        this.state.currentScene.choices,
        this.state.gameState
      );

      this.updateState({
        type: this.state.currentScene.choices.length > 0 ? 'choosing' : 'ended',
        availableChoices,
      });
    }

    this.emit({
      type: 'game_saved',
      saveId,
      timestamp: new Date().toISOString(),
    });

    return this.state;
  }

  private async handleSaveFailed(error: GameError): Promise<StateMachineState> {
    // Return to previous playable state but keep error
    if (this.state.currentScene && this.state.gameState) {
      const availableChoices = this.filterAvailableChoices(
        this.state.currentScene.choices,
        this.state.gameState
      );

      this.updateState({
        type: this.state.currentScene.choices.length > 0 ? 'choosing' : 'ended',
        availableChoices,
        error,
      });
    }

    return this.state;
  }

  private async handleRestartGame(): Promise<StateMachineState> {
    this.stopAutoSave();

    const userId = this.state.gameState?.userId ?? 'anonymous';

    this.updateState({
      type: 'idle',
      gameState: undefined,
      currentScene: undefined,
      availableChoices: undefined,
      error: undefined,
    });

    return this.transition({ type: 'START_GAME', userId });
  }

  private async handleRecoverError(): Promise<StateMachineState> {
    if (this.state.type !== 'error' || !this.state.gameState) {
      throw this.createError('STATE_CORRUPTED', 'Cannot recover from non-error state');
    }

    // Try to return to last known good state
    const scene = this.getSceneById(this.state.gameState.currentSceneId);
    if (!scene) {
      // Can't recover, restart
      return this.handleRestartGame();
    }

    const availableChoices = this.filterAvailableChoices(scene.choices, this.state.gameState);

    this.updateState({
      type: scene.choices.length > 0 ? 'choosing' : 'ended',
      currentScene: scene,
      availableChoices,
      error: undefined,
    });

    return this.state;
  }

  private handleError(error: unknown): StateMachineState {
    const gameError: GameError =
      error instanceof Error && 'code' in error
        ? (error as GameError)
        : this.createError(
            'STATE_CORRUPTED',
            error instanceof Error ? error.message : 'Unknown error'
          );

    this.updateState({
      type: 'error',
      error: gameError,
    });

    this.emit({
      type: 'error_occurred',
      error: gameError,
      timestamp: new Date().toISOString(),
    });

    return this.state;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getSceneById(sceneId: string): Scene | undefined {
    return this.story.scenes.find(s => s.id === sceneId);
  }

  private meetsRequirements(choice: Choice, gameState: GameState): boolean {
    if (!choice.requirements) return true;

    // Check variable requirements
    if (choice.requirements.variables) {
      for (const [key, value] of Object.entries(choice.requirements.variables)) {
        if (gameState.variables[key] !== value) {
          return false;
        }
      }
    }

    // Check MCP data requirements
    if (choice.requirements.mcpData) {
      for (const req of choice.requirements.mcpData) {
        const data = gameState.mcpContext.cachedData[req.serverId];
        if (!data && !req.fallback) {
          return false;
        }
        // Evaluate condition if data exists
        if (data && req.condition) {
          try {
            // Safe evaluation of simple conditions
            const result = this.evaluateCondition(req.condition, { data, variables: gameState.variables });
            if (!result) return false;
          } catch {
            if (!req.fallback) return false;
          }
        }
      }
    }

    return true;
  }

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    // Simple condition evaluation - supports basic comparisons
    // For production, use a proper expression evaluator
    const { data, variables } = context;
    try {
      // Create a safe evaluation context
      const fn = new Function('data', 'variables', `return ${condition}`);
      return !!fn(data, variables);
    } catch {
      return false;
    }
  }

  private filterAvailableChoices(choices: Choice[], gameState: GameState): Choice[] {
    return choices.filter(choice => this.meetsRequirements(choice, gameState));
  }

  private applyEffects(variables: StoryVariables, effects: VariableEffect[]): StoryVariables {
    const newVariables = { ...variables };

    for (const effect of effects) {
      const operation = effect.operation as VariableOperation;

      switch (operation) {
        case 'set':
          newVariables[effect.variable] = effect.value;
          break;

        case 'increment':
          newVariables[effect.variable] =
            (Number(newVariables[effect.variable]) || 0) + Number(effect.value);
          break;

        case 'decrement':
          newVariables[effect.variable] =
            (Number(newVariables[effect.variable]) || 0) - Number(effect.value);
          break;

        case 'append':
          if (Array.isArray(newVariables[effect.variable])) {
            (newVariables[effect.variable] as unknown[]).push(effect.value);
          } else {
            newVariables[effect.variable] = [effect.value];
          }
          break;

        case 'remove':
          if (Array.isArray(newVariables[effect.variable])) {
            newVariables[effect.variable] = (newVariables[effect.variable] as unknown[])
              .filter(v => v !== effect.value);
          }
          break;

        case 'toggle':
          newVariables[effect.variable] = !newVariables[effect.variable];
          break;

        case 'merge':
          if (typeof newVariables[effect.variable] === 'object' && typeof effect.value === 'object') {
            newVariables[effect.variable] = {
              ...(newVariables[effect.variable] as Record<string, unknown>),
              ...(effect.value as Record<string, unknown>),
            };
          }
          break;
      }
    }

    return newVariables;
  }

  private calculateChecksum(state: GameState): string {
    // Simple checksum based on state content
    const content = JSON.stringify({
      storyId: state.storyId,
      currentSceneId: state.currentSceneId,
      variables: state.variables,
      choiceHistory: state.choiceHistory.map(h => h.choiceId),
    });

    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }

  private assertState(allowedStates: GameStateType[]): void {
    if (!allowedStates.includes(this.state.type)) {
      throw this.createError(
        'STATE_CORRUPTED',
        `Invalid state transition. Current state: ${this.state.type}, allowed: ${allowedStates.join(', ')}`
      );
    }
  }

  private updateState(update: Partial<StateMachineState>): void {
    this.state = { ...this.state, ...update };
    this.log(`State updated to: ${this.state.type}`);
  }

  private createError(code: GameErrorCode, message: string): GameError {
    return {
      code,
      message,
      recoverable: ['INVALID_CHOICE', 'REQUIREMENTS_NOT_MET', 'MCP_QUERY_FAILED', 'SAVE_FAILED'].includes(code),
    };
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Subscribe to game events
   */
  on(eventType: GameEvent['type'], handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: GameEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          this.log(`Event handler error: ${error}`);
        }
      }
    }
  }

  // ==========================================================================
  // Auto-save
  // ==========================================================================

  private startAutoSave(): void {
    if (!this.config.autoSave || this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.isPlayable() && this.state.gameState) {
        this.transition({ type: 'SAVE_GAME' }).catch(e => {
          this.log(`Auto-save failed: ${e}`);
        });
      }
    }, this.config.autoSaveInterval);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize current game state for saving
   */
  serialize(): string | null {
    if (!this.state.gameState) return null;

    return JSON.stringify({
      ...this.state.gameState,
      checksum: this.calculateChecksum(this.state.gameState),
    });
  }

  /**
   * Get progress information
   */
  getProgress(): { percentage: number; scenesVisited: number; totalScenes: number; choicesMade: number } {
    if (!this.state.gameState) {
      return { percentage: 0, scenesVisited: 0, totalScenes: this.story.scenes.length, choicesMade: 0 };
    }

    const visitedScenes = new Set(
      this.state.gameState.choiceHistory.map(h => h.sceneId)
    );
    visitedScenes.add(this.state.gameState.currentSceneId);

    return {
      percentage: (visitedScenes.size / this.story.scenes.length) * 100,
      scenesVisited: visitedScenes.size,
      totalScenes: this.story.scenes.length,
      choicesMade: this.state.gameState.choiceHistory.length,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopAutoSave();
    this.eventHandlers.clear();
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[GameStateMachine] ${message}`);
    }
  }
}

/**
 * Create a new game state machine
 */
export function createGameStateMachine(
  story: Story,
  config?: StateMachineConfig,
  mcpExecutor?: MCPQueryExecutor,
  saveManager?: SaveManager
): GameStateMachine {
  return new GameStateMachine(story, config, mcpExecutor, saveManager);
}
