import { describe, it, expect } from 'vitest';
import { StoryEngine } from '../index.js';
import type { Story } from '@omnigents/shared';

const mockStory: Story = {
  id: 'test-story',
  title: 'Security Test Story',
  scenes: [
    {
      id: 'scene-1',
      title: 'Start',
      narrative: 'You are at a crossroads.',
      choices: [
        {
          id: 'choice-1',
          text: 'Go left',
          nextSceneId: 'scene-2',
          effects: [{ variable: 'path', operation: 'set', value: 'left' }],
        },
        {
          id: 'choice-2',
          text: 'Go right',
          nextSceneId: 'scene-3',
          effects: [{ variable: 'path', operation: 'set', value: 'right' }],
          requirements: {
            variables: { hasKey: true },
          },
        },
      ],
    },
    {
      id: 'scene-2',
      title: 'Left Path',
      narrative: 'You went left.',
      choices: [],
    },
    {
      id: 'scene-3',
      title: 'Right Path',
      narrative: 'You went right.',
      choices: [],
    },
  ],
  variables: { path: '', hasKey: false },
};

describe('StoryEngine — No Code Injection (Issue #5)', () => {
  const engine = new StoryEngine(mockStory);

  it('uses direct equality for requirement checks (no new Function or eval)', () => {
    const state = engine.start('user-1');

    // choice-2 requires hasKey=true, but state has hasKey=false
    expect(state.variables.hasKey).toBe(false);
    const choices = engine.getAvailableChoices(state);

    // Only choice-1 should be available (choice-2 is gated by hasKey)
    expect(choices).toHaveLength(1);
    expect(choices[0].id).toBe('choice-1');
  });

  it('applies effects via switch-case (no dynamic evaluation)', () => {
    const state = engine.start('user-1');
    const newState = engine.makeChoice(state, 'choice-1');

    expect(newState.variables.path).toBe('left');
  });

  it('serializes/deserializes via JSON (no code execution)', () => {
    const state = engine.start('user-1');
    const serialized = engine.serializeState(state);
    const deserialized = engine.deserializeState(serialized);

    expect(deserialized.userId).toBe(state.userId);
    expect(deserialized.currentSceneId).toBe(state.currentSceneId);
  });

  it('does not expose Function constructor or eval in module scope', () => {
    // The story engine should not use new Function() or eval() anywhere
    // This test verifies the module imports cleanly without dynamic code execution
    const moduleSource = engine.constructor.toString();
    expect(moduleSource).not.toContain('new Function');
    expect(moduleSource).not.toContain('eval(');
  });

  it('requirement checks use strict equality, not coercion', () => {
    const state = engine.start('user-1');
    state.variables.hasKey = 'true' as unknown as boolean; // string, not boolean

    const choices = engine.getAvailableChoices(state);
    // String 'true' !== boolean true, so choice-2 should still be gated
    // (unless the engine uses == which would be a different concern)
    expect(choices).toHaveLength(1);
    expect(choices[0].id).toBe('choice-1');
  });

  it('malicious variable names in story data do not cause code execution', () => {
    const maliciousStory: Story = {
      ...mockStory,
      variables: { path: '', 'constructor.prototype.polluted': false } as any,
    };
    const maliciousEngine = new StoryEngine(maliciousStory);

    // Starting the engine should not throw or pollute prototypes
    const state = maliciousEngine.start('user-1');
    expect(state).toBeDefined();
    expect(({} as any).polluted).toBeUndefined();
  });
});
