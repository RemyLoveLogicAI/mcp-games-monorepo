/**
 * Game State Machine Integration Tests
 *
 * Tests the CYOA state machine functionality including:
 * - Game lifecycle (start, play, end)
 * - State transitions
 * - Choice processing
 * - Variable effects
 * - Save/load functionality
 * - MCP integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GameStateMachine,
  createGameStateMachine,
  SaveManager,
  createInMemorySaveManager,
  type MCPQueryExecutor,
} from '../index';
import type { Story, Scene, GameState } from 'shared-types';

// Test story fixture
const createTestStory = (): Story => ({
  id: 'test-story',
  title: 'Test Adventure',
  description: 'A test story for unit testing',
  scenes: [
    {
      id: 'scene-1',
      narrative: 'You are at the beginning of your journey.',
      choices: [
        {
          id: 'choice-1a',
          text: 'Go left',
          nextSceneId: 'scene-2',
          effects: [
            { variable: 'direction', operation: 'set', value: 'left' },
            { variable: 'steps', operation: 'increment', value: 1 }
          ]
        },
        {
          id: 'choice-1b',
          text: 'Go right',
          nextSceneId: 'scene-3',
          effects: [
            { variable: 'direction', operation: 'set', value: 'right' }
          ],
          requirements: {
            variables: { hasKey: true }
          }
        }
      ],
      consequences: []
    },
    {
      id: 'scene-2',
      narrative: 'You went left and found a key.',
      choices: [
        {
          id: 'choice-2a',
          text: 'Pick up the key',
          nextSceneId: 'scene-1',
          effects: [
            { variable: 'hasKey', operation: 'set', value: true },
            { variable: 'inventory', operation: 'append', value: 'key' }
          ]
        },
        {
          id: 'choice-2b',
          text: 'Continue forward',
          nextSceneId: 'scene-end',
          effects: []
        }
      ],
      consequences: []
    },
    {
      id: 'scene-3',
      narrative: 'You went right and found treasure!',
      choices: [],
      consequences: []
    },
    {
      id: 'scene-end',
      narrative: 'The adventure ends here.',
      choices: [],
      consequences: []
    }
  ],
  variables: {
    direction: '',
    hasKey: false,
    steps: 0,
    inventory: []
  },
  metadata: {
    author: 'Test',
    version: '1.0.0',
    tags: ['test'],
    mcpIntegrations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
});

// Mock MCP executor
const createMockMCPExecutor = (): MCPQueryExecutor => ({
  executeQueries: vi.fn(async (queries) => {
    const result: Record<string, unknown> = {};
    for (const query of queries) {
      result[query.resultVariable] = { mockData: true };
    }
    return result;
  })
});

describe('GameStateMachine', () => {
  let story: Story;
  let stateMachine: GameStateMachine;

  beforeEach(() => {
    story = createTestStory();
    stateMachine = createGameStateMachine(story, { autoSave: false, debug: false });
  });

  afterEach(() => {
    stateMachine.dispose();
  });

  describe('Game Lifecycle', () => {
    it('should start in idle state', () => {
      expect(stateMachine.getStateType()).toBe('idle');
    });

    it('should transition to choosing state when game starts', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      expect(stateMachine.getStateType()).toBe('choosing');
      expect(stateMachine.getGameState()?.userId).toBe('player1');
      expect(stateMachine.getGameState()?.currentSceneId).toBe('scene-1');
    });

    it('should initialize variables from story', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      const gameState = stateMachine.getGameState();
      expect(gameState?.variables.hasKey).toBe(false);
      expect(gameState?.variables.steps).toBe(0);
    });

    it('should return current scene', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      const scene = stateMachine.getCurrentScene();
      expect(scene?.id).toBe('scene-1');
      expect(scene?.narrative).toContain('beginning');
    });

    it('should return available choices', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      const choices = stateMachine.getAvailableChoices();
      // Only choice-1a should be available (choice-1b requires hasKey)
      expect(choices).toHaveLength(1);
      expect(choices[0].id).toBe('choice-1a');
    });
  });

  describe('Choice Processing', () => {
    beforeEach(async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
    });

    it('should process a valid choice', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      expect(stateMachine.getStateType()).toBe('choosing');
      expect(stateMachine.getCurrentScene()?.id).toBe('scene-2');
    });

    it('should apply variable effects', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      const gameState = stateMachine.getGameState();
      expect(gameState?.variables.direction).toBe('left');
      expect(gameState?.variables.steps).toBe(1);
    });

    it('should record choice in history', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      const gameState = stateMachine.getGameState();
      expect(gameState?.choiceHistory).toHaveLength(1);
      expect(gameState?.choiceHistory[0].choiceId).toBe('choice-1a');
    });

    it('should reject choices that do not meet requirements', async () => {
      const state = await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1b' });
      expect(state.type).toBe('error');
      expect(state.error?.code).toBe('REQUIREMENTS_NOT_MET');
    });

    it('should reject invalid choice IDs', async () => {
      const state = await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'invalid-choice' });
      expect(state.type).toBe('error');
      expect(state.error?.code).toBe('INVALID_CHOICE');
    });

    it('should unlock choices when requirements are met', async () => {
      // Go left and pick up key
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-2a' });

      // Now back at scene-1, choice-1b should be available
      const choices = stateMachine.getAvailableChoices();
      expect(choices).toHaveLength(2);
      expect(choices.some(c => c.id === 'choice-1b')).toBe(true);
    });
  });

  describe('Variable Effects', () => {
    beforeEach(async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
    });

    it('should handle set operation', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      expect(stateMachine.getGameState()?.variables.direction).toBe('left');
    });

    it('should handle increment operation', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      expect(stateMachine.getGameState()?.variables.steps).toBe(1);
    });

    it('should handle append operation', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-2a' });

      const inventory = stateMachine.getGameState()?.variables.inventory;
      expect(inventory).toContain('key');
    });
  });

  describe('Game Ending', () => {
    beforeEach(async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
    });

    it('should detect game end (no more choices)', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-2b' });

      expect(stateMachine.isEnded()).toBe(true);
      expect(stateMachine.getStateType()).toBe('ended');
    });

    it('should return empty choices at end scene', async () => {
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-2b' });

      expect(stateMachine.getAvailableChoices()).toHaveLength(0);
    });
  });

  describe('Save/Load', () => {
    it('should serialize game state', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      const serialized = stateMachine.serialize();
      expect(serialized).toBeTruthy();

      const parsed = JSON.parse(serialized!);
      expect(parsed.currentSceneId).toBe('scene-2');
      expect(parsed.variables.direction).toBe('left');
    });

    it('should load saved game state', async () => {
      // Start and make a choice
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      const saveData = stateMachine.serialize()!;

      // Create new state machine and load
      const newStateMachine = createGameStateMachine(story);
      await newStateMachine.transition({ type: 'LOAD_GAME', saveData });

      expect(newStateMachine.getCurrentScene()?.id).toBe('scene-2');
      expect(newStateMachine.getGameState()?.variables.direction).toBe('left');

      newStateMachine.dispose();
    });

    it('should trigger save game', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      const state = await stateMachine.transition({ type: 'SAVE_GAME' });

      expect(state.type).toBe('choosing'); // Returns to playable state after save
    });
  });

  describe('Restart', () => {
    it('should restart the game', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      await stateMachine.transition({ type: 'RESTART_GAME' });

      expect(stateMachine.getCurrentScene()?.id).toBe('scene-1');
      expect(stateMachine.getGameState()?.variables.direction).toBe('');
      expect(stateMachine.getGameState()?.choiceHistory).toHaveLength(0);
    });
  });

  describe('Progress Tracking', () => {
    it('should calculate progress percentage', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      let progress = stateMachine.getProgress();
      expect(progress.scenesVisited).toBe(1);

      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      progress = stateMachine.getProgress();
      expect(progress.scenesVisited).toBe(2);
      expect(progress.choicesMade).toBe(1);
    });
  });

  describe('Event System', () => {
    it('should emit game_started event', async () => {
      const handler = vi.fn();
      stateMachine.on('game_started', handler);

      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'game_started',
          userId: 'player1'
        })
      );
    });

    it('should emit choice_made event', async () => {
      const handler = vi.fn();
      stateMachine.on('choice_made', handler);

      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'choice_made',
          choiceId: 'choice-1a'
        })
      );
    });

    it('should allow unsubscribing from events', async () => {
      const handler = vi.fn();
      const unsubscribe = stateMachine.on('game_started', handler);

      unsubscribe();
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid state transitions', async () => {
      // Try to make choice before starting
      const state = await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'choice-1a' });
      expect(state.type).toBe('error');
    });

    it('should recover from error state', async () => {
      await stateMachine.transition({ type: 'START_GAME', userId: 'player1' });
      await stateMachine.transition({ type: 'MAKE_CHOICE', choiceId: 'invalid' }); // Trigger error

      const state = await stateMachine.transition({ type: 'RECOVER_ERROR' });
      expect(state.type).toBe('choosing');
    });
  });
});

describe('SaveManager', () => {
  let saveManager: SaveManager;

  beforeEach(() => {
    saveManager = createInMemorySaveManager();
  });

  it('should save and load game state', async () => {
    const gameState: GameState = {
      storyId: 'test-story',
      userId: 'player1',
      currentSceneId: 'scene-1',
      variables: { test: true },
      choiceHistory: [],
      mcpContext: { lastQueried: {}, cachedData: {}, connectionStatus: {} },
      timestamp: new Date().toISOString()
    };

    const saveResult = await saveManager.save(gameState);
    expect(saveResult.success).toBe(true);

    const loadResult = await saveManager.load(saveResult.value!);
    expect(loadResult.success).toBe(true);
    expect(loadResult.value?.storyId).toBe('test-story');
  });

  it('should list saves for a user', async () => {
    const gameState: GameState = {
      storyId: 'test-story',
      userId: 'player1',
      currentSceneId: 'scene-1',
      variables: {},
      choiceHistory: [],
      mcpContext: { lastQueried: {}, cachedData: {}, connectionStatus: {} },
      timestamp: new Date().toISOString()
    };

    await saveManager.save(gameState, undefined, 'Save 1');
    await saveManager.save(gameState, undefined, 'Save 2');

    const slots = await saveManager.listSlots('player1');
    expect(slots).toHaveLength(2);
  });

  it('should delete saves', async () => {
    const gameState: GameState = {
      storyId: 'test-story',
      userId: 'player1',
      currentSceneId: 'scene-1',
      variables: {},
      choiceHistory: [],
      mcpContext: { lastQueried: {}, cachedData: {}, connectionStatus: {} },
      timestamp: new Date().toISOString()
    };

    const saveResult = await saveManager.save(gameState);
    await saveManager.delete(saveResult.value!, 'player1');

    const loadResult = await saveManager.load(saveResult.value!);
    expect(loadResult.success).toBe(false);
  });
});
