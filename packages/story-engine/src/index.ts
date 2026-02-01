/**
 * Story Engine - Core game logic and state management
 */

import type {
  Story,
  Scene,
  Choice,
  StoryVariables,
  GameProgress,
  VariableEffect,
} from 'shared-types';

/**
 * Story state representation
 */
export interface StoryState {
  storyId: string;
  userId: string;
  currentSceneId: string;
  variables: StoryVariables;
  choiceHistory: string[];
  timestamp: string;
  /** Available MCP data keys that have been loaded for this session */
  mcpData?: Record<string, unknown>;
}

/**
 * Main story engine for managing game state
 */
export class StoryEngine {
  private story: Story;

  constructor(story: Story) {
    this.story = story;
  }

  /**
   * Initialize a new game state
   */
  start(userId: string): StoryState {
    const firstScene = this.story.scenes[0];
    if (!firstScene) {
      throw new Error('Story has no scenes');
    }

    return {
      storyId: this.story.id,
      userId,
      currentSceneId: firstScene.id,
      variables: { ...this.story.variables },
      choiceHistory: [],
      timestamp: new Date().toISOString(),
      mcpData: {},
    };
  }

  /**
   * Process a player's choice and return new state
   */
  makeChoice(state: StoryState, choiceId: string): StoryState {
    const currentScene = this.getScene(state.currentSceneId);
    const choice = currentScene.choices.find((c) => c.id === choiceId);

    if (!choice) {
      throw new Error(`Choice ${choiceId} not found in current scene`);
    }

    // Check requirements
    if (!this.meetsRequirements(state, choice)) {
      throw new Error('Choice requirements not met');
    }

    // Apply choice effects
    const newVariables = this.applyEffects(state.variables, choice.effects);

    // Create new state
    return {
      ...state,
      currentSceneId: choice.nextSceneId,
      variables: newVariables,
      choiceHistory: [...state.choiceHistory, choiceId],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the current scene
   */
  getCurrentScene(state: StoryState): Scene {
    return this.getScene(state.currentSceneId);
  }

  /**
   * Get available choices for current scene
   */
  getAvailableChoices(state: StoryState): Choice[] {
    const scene = this.getCurrentScene(state);
    return scene.choices.filter((choice) =>
      this.meetsRequirements(state, choice)
    );
  }

  /**
   * Check if the story has ended
   */
  isEnded(state: StoryState): boolean {
    const scene = this.getCurrentScene(state);
    return scene.choices.length === 0;
  }

  /**
   * Get story progress percentage
   */
  getProgress(state: StoryState): number {
    const totalScenes = this.story.scenes.length;
    const visitedScenes = new Set([
      ...state.choiceHistory.map((choiceId) => {
        // Find scene containing this choice
        const scene = this.story.scenes.find((s) =>
          s.choices.some((c) => c.id === choiceId)
        );
        return scene?.id;
      }),
      state.currentSceneId,
    ]).size;

    return (visitedScenes / totalScenes) * 100;
  }

  /**
   * Serialize state for saving
   */
  serializeState(state: StoryState): string {
    return JSON.stringify(state);
  }

  /**
   * Deserialize saved state
   */
  deserializeState(serialized: string): StoryState {
    return JSON.parse(serialized) as StoryState;
  }

  /**
   * Convert state to GameProgress format
   */
  toGameProgress(state: StoryState): GameProgress {
    return {
      storyId: state.storyId,
      currentSceneId: state.currentSceneId,
      variables: state.variables,
      choices: state.choiceHistory,
      timestamp: state.timestamp,
    };
  }

  /**
   * Update state with MCP data from external sources
   */
  setMcpData(
    state: StoryState,
    mcpData: Record<string, unknown>
  ): StoryState {
    return {
      ...state,
      mcpData: { ...state.mcpData, ...mcpData },
      timestamp: new Date().toISOString(),
    };
  }

  // Private helper methods

  private getScene(sceneId: string): Scene {
    const scene = this.story.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      throw new Error(`Scene ${sceneId} not found`);
    }
    return scene;
  }

  private meetsRequirements(state: StoryState, choice: Choice): boolean {
    if (!choice.requirements) {
      return true;
    }

    // Check variable requirements
    if (choice.requirements.variables) {
      for (const [key, value] of Object.entries(
        choice.requirements.variables
      )) {
        if (state.variables[key] !== value) {
          return false;
        }
      }
    }

    // Check MCP data requirements
    if (choice.requirements.mcpData) {
      for (const requiredKey of choice.requirements.mcpData) {
        if (!state.mcpData || !(requiredKey in state.mcpData)) {
          return false;
        }
      }
    }

    return true;
  }

  private applyEffects(
    variables: StoryVariables,
    effects: VariableEffect[]
  ): StoryVariables {
    const newVariables = { ...variables };

    for (const effect of effects) {
      switch (effect.operation) {
        case 'set':
          newVariables[effect.variable] = effect.value;
          break;
        case 'increment':
          newVariables[effect.variable] =
            (Number(newVariables[effect.variable]) || 0) +
            Number(effect.value);
          break;
        case 'decrement':
          newVariables[effect.variable] =
            (Number(newVariables[effect.variable]) || 0) -
            Number(effect.value);
          break;
        case 'append':
          if (Array.isArray(newVariables[effect.variable])) {
            (newVariables[effect.variable] as unknown[]).push(effect.value);
          } else {
            newVariables[effect.variable] = [effect.value];
          }
          break;
      }
    }

    return newVariables;
  }
}

export * from 'shared-types';
