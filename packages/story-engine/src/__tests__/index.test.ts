import { StoryEngine } from '../index.js';
import type { Story } from '@omnigents/shared';

describe('Story Engine', () => {
    const story: Story = {
        id: 'story',
        title: 'Story',
        description: 'A story',
        variables: { inventory: ['key'] },
        metadata: {
            author: 'Test',
            version: '1.0.0',
            tags: [],
            mcpIntegrations: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
        },
        scenes: [
            {
                id: 'start',
                narrative: 'Start',
                consequences: [],
                choices: [{
                    id: 'go',
                    text: 'Go',
                    nextSceneId: 'end',
                    effects: [{
                        operation: 'append',
                        variable: 'inventory',
                        value: 'map'
                    }]
                }]
            },
            {
                id: 'end',
                narrative: 'End',
                consequences: [],
                choices: []
            }
        ]
    };

    it('plays a story without mutating the previous state', () => {
        const engine = new StoryEngine(story);
        const initial = engine.start('player');
        const next = engine.makeChoice(initial, 'go');

        expect(initial.variables.inventory).toEqual(['key']);
        expect(next.variables.inventory).toEqual(['key', 'map']);
        expect(engine.isEnded(next)).toBe(true);
        expect(engine.getProgress(next)).toBe(100);
    });
});
