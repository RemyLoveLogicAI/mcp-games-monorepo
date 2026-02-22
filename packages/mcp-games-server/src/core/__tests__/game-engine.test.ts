import { GameEngine } from '../game-engine.js';
import { ContextEngine } from '../context-engine.js';
import { StateManager, InMemoryStateStore } from '../state-manager.js';
import { GameDefinition, Action } from '@omnigents/shared';

describe('GameEngine', () => {
    let engine: GameEngine;
    let mockGame: GameDefinition;

    beforeEach(() => {
        const stateManager = new StateManager(new InMemoryStateStore());
        const contextEngine = new ContextEngine();
        engine = new GameEngine(stateManager, contextEngine);

        mockGame = {
            id: 'test-game',
            title: 'Test Game',
            version: '1.0.0',
            scenes: [
                {
                    id: 'start',
                    title: 'Start Scene',
                    narrative: 'You start here.',
                    choices: [
                        { id: 'c1', text: 'Go forward' }
                    ]
                },
                {
                    id: 'end',
                    title: 'End Scene',
                    narrative: 'You ended here.',
                    choices: []
                }
            ],
            globalStateSchema: {},
            initialState: {}
        };
    });

    it('should start a game successfully', async () => {
        const { session, scene } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        expect(session).toBeDefined();
        expect(session.playerId).toBe('player-1');
        expect(scene.id).toBe('start');
    });

    it('should throw error when unknown action is taken', async () => {
        const { session } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        const invalidAction: Action = { type: 'choice', choiceId: 'unknown' };

        await expect(
            engine.executeAction(mockGame, session.id, invalidAction, 'trace-id')
        ).rejects.toThrow();
    });

    it('should make a choice successfully', async () => {
        const { session } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        const action: Action = { type: 'choice', choiceId: 'c1' };

        const result = await engine.executeAction(mockGame, session.id, action, 'trace-id');

        expect(result.scene.id).toBe('end');
    });
});
