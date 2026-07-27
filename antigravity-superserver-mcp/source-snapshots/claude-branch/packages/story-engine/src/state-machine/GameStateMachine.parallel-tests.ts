/**
 * Parallel / concurrency test suite for the GameStateMachine.
 *
 * These tests reproduce the defects tracked in:
 *   - Issue #14: race conditions in concurrent transitions & async MCP queries,
 *     plus memory leaks in event handlers and the auto-save timer.
 *   - Issue #15: missing ambiguity detection and clarification flow for
 *     free-text player responses.
 *
 * They are intentionally kept in a dedicated `*.parallel-tests.ts` file so the
 * concurrency-focused suite can be run and reasoned about independently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Story, Choice, SceneMCPQuery } from 'shared-types-snapshot';
import { GameStateMachine, createGameStateMachine } from './GameStateMachine';
import { AmbiguityDetector } from '../dialogue/AmbiguityDetector';
import { ClarificationHandler } from '../dialogue/ClarificationHandler';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeStory(): Story {
  return {
    id: 'test-story',
    title: 'Test Story',
    description: 'A story for concurrency tests',
    variables: {},
    metadata: {
      author: 'test',
      version: '1.0.0',
      tags: [],
      mcpIntegrations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    scenes: [
      {
        id: 'start',
        narrative: 'You stand at a crossroads.',
        consequences: [],
        choices: [
          { id: '1', text: 'Go north to the castle', nextSceneId: 'ending', effects: [] },
          { id: '2', text: 'Go south to the village', nextSceneId: 'ending', effects: [] },
        ],
      },
      {
        id: 'ending',
        narrative: 'The end.',
        consequences: [],
        choices: [],
      },
    ],
  };
}

const mcpQuery: SceneMCPQuery = {
  id: 'q1',
  servers: ['test'],
  queryTemplate: 'noop',
  resultVariable: 'weather',
  required: false,
  fallback: 'sunny',
};

// ---------------------------------------------------------------------------
// Issue #14 - Race conditions
// ---------------------------------------------------------------------------

describe('Issue #14: Race conditions in concurrent transitions', () => {
  it('serializes concurrent transitions so async MCP queries never overlap', async () => {
    let active = 0;
    let maxConcurrent = 0;

    const executor = {
      async executeQueries(): Promise<Record<string, unknown>> {
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
        return { weather: 'sunny' };
      },
    };

    const machine = createGameStateMachine(makeStory(), { autoSave: false }, executor);
    await machine.transition({ type: 'START_GAME', userId: 'user1' });

    // Fire several MCP-backed transitions at once. Without a transition lock
    // they run concurrently and corrupt shared state.
    await Promise.all([
      machine.transition({ type: 'FETCH_MCP_DATA', queries: [mcpQuery] }),
      machine.transition({ type: 'FETCH_MCP_DATA', queries: [mcpQuery] }),
      machine.transition({ type: 'FETCH_MCP_DATA', queries: [mcpQuery] }),
    ]);

    expect(maxConcurrent).toBe(1);
    machine.dispose();
  });

  it('keeps a consistent, non-error state after concurrent transitions', async () => {
    const machine = createGameStateMachine(makeStory(), { autoSave: false });

    await machine.transition({ type: 'START_GAME', userId: 'user1' });

    await Promise.all([
      machine.transition({ type: 'SAVE_GAME' }),
      machine.transition({ type: 'SAVE_GAME' }),
      machine.transition({ type: 'SAVE_GAME' }),
    ]);

    expect(machine.getStateType()).not.toBe('error');
    machine.dispose();
  });
});

// ---------------------------------------------------------------------------
// Issue #14 - Memory leaks
// ---------------------------------------------------------------------------

describe('Issue #14: Memory leaks', () => {
  it('does not leak event handlers after subscribe/unsubscribe cycles', () => {
    const machine = createGameStateMachine(makeStory(), { autoSave: false });
    const handler = vi.fn();

    for (let i = 0; i < 1000; i++) {
      const unsubscribe = machine.on('game_started', handler);
      unsubscribe();
    }

    const handlerMap = (machine as unknown as {
      eventHandlers: Map<string, Set<unknown>>;
    }).eventHandlers;

    expect(handlerMap.size).toBe(0);
    machine.dispose();
  });

  it('caps the number of handlers registered per event', () => {
    const machine = createGameStateMachine(makeStory(), { autoSave: false });

    for (let i = 0; i < 150; i++) {
      machine.on('game_started', vi.fn());
    }

    const handlers = (machine as unknown as {
      eventHandlers: Map<string, Set<unknown>>;
    }).eventHandlers.get('game_started');

    expect(handlers?.size ?? 0).toBeLessThanOrEqual(100);
    machine.dispose();
  });

  it('clears the auto-save timer on dispose', () => {
    const machine = createGameStateMachine(makeStory(), {
      autoSave: true,
      autoSaveInterval: 1000,
    });

    (machine as unknown as { startAutoSave(): void }).startAutoSave();
    expect(
      (machine as unknown as { autoSaveTimer?: unknown }).autoSaveTimer
    ).toBeDefined();

    machine.dispose();
    expect(
      (machine as unknown as { autoSaveTimer?: unknown }).autoSaveTimer
    ).toBeUndefined();
  });

  it('does not keep the process alive via the auto-save timer', () => {
    const machine = createGameStateMachine(makeStory(), {
      autoSave: true,
      autoSaveInterval: 1000,
    });

    (machine as unknown as { startAutoSave(): void }).startAutoSave();
    const timer = (machine as unknown as {
      autoSaveTimer?: { hasRef?: () => boolean };
    }).autoSaveTimer;

    // Timer must be unref'd so it never blocks process exit.
    expect(timer?.hasRef?.()).toBe(false);
    machine.dispose();
  });
});

// ---------------------------------------------------------------------------
// Issue #15 - Ambiguity detection
// ---------------------------------------------------------------------------

describe('Issue #15: Ambiguity detection', () => {
  let detector: AmbiguityDetector;

  beforeEach(() => {
    detector = new AmbiguityDetector();
  });

  it('detects ambiguous input matching multiple choices', () => {
    const choices: Choice[] = [
      { id: '1', text: 'Go to the forest', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Go to the beach', nextSceneId: 'b', effects: [] },
    ];

    const result = detector.detectAmbiguity('go', choices);

    expect(result.isAmbiguous).toBe(true);
    expect(result.matchedChoices).toHaveLength(2);
  });

  it('is not ambiguous for a clear single match', () => {
    const choices: Choice[] = [
      { id: '1', text: 'Attack the dragon', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Run away', nextSceneId: 'b', effects: [] },
    ];

    const result = detector.detectAmbiguity('attack', choices);

    expect(result.isAmbiguous).toBe(false);
    expect(result.matchedChoices).toHaveLength(1);
    expect(result.matchedChoices[0].id).toBe('1');
  });

  it('detects uncertainty keywords', () => {
    const choices: Choice[] = [
      { id: '1', text: 'Option A', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Option B', nextSceneId: 'b', effects: [] },
    ];

    const result = detector.detectAmbiguity('maybe A', choices);

    expect(result.isAmbiguous).toBe(true);
    expect(result.reason).toContain('uncertainty');
  });
});

// ---------------------------------------------------------------------------
// Issue #15 - Clarification flow
// ---------------------------------------------------------------------------

describe('Issue #15: Clarification flow', () => {
  let clarificationHandler: ClarificationHandler;

  beforeEach(() => {
    clarificationHandler = new ClarificationHandler();
  });

  it('creates a clarification request for ambiguous input', async () => {
    const choices: Choice[] = [
      { id: '1', text: 'Go north', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Go south', nextSceneId: 'b', effects: [] },
    ];

    const request = await clarificationHandler.requestClarification(
      'session123',
      'go',
      choices
    );

    expect(request.ambiguousChoices).toHaveLength(2);
    expect(request.prompt).toContain('1. Go north');
    expect(request.prompt).toContain('2. Go south');
  });

  it('resolves a clarification with a number selection', async () => {
    const choices: Choice[] = [
      { id: '1', text: 'Go north', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Go south', nextSceneId: 'b', effects: [] },
    ];

    await clarificationHandler.requestClarification('session123', 'go', choices);
    const resolved = await clarificationHandler.resolveClarification('session123', '1');

    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('1');
  });

  it('resolves a rephrased response', async () => {
    const choices: Choice[] = [
      { id: '1', text: 'Go north to the castle', nextSceneId: 'a', effects: [] },
      { id: '2', text: 'Go south to the village', nextSceneId: 'b', effects: [] },
    ];

    await clarificationHandler.requestClarification('session123', 'go', choices);
    const resolved = await clarificationHandler.resolveClarification(
      'session123',
      'I want to go to the castle'
    );

    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Issue #15 - Game flow integration
// ---------------------------------------------------------------------------

describe('Issue #15: Game flow integration', () => {
  let machine: GameStateMachine;

  beforeEach(() => {
    machine = createGameStateMachine(
      makeStory(),
      { autoSave: false },
      undefined,
      undefined,
      new ClarificationHandler()
    );
  });

  afterEach(() => {
    machine.dispose();
  });

  it('requests clarification for an ambiguous natural-language choice', async () => {
    await machine.transition({ type: 'START_GAME', userId: 'user1' });

    const result = await machine.handleNaturalLanguageChoice('go');

    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('ambiguousChoices');
  });

  it('proceeds after the ambiguity is clarified', async () => {
    await machine.transition({ type: 'START_GAME', userId: 'user1' });

    await machine.handleNaturalLanguageChoice('go');
    const state = await machine.transition({ type: 'MAKE_CHOICE', choiceId: '1' });

    expect(state.type).not.toBe('choosing');
  });
});
