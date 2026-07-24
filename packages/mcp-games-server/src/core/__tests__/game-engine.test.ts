import { GameEngine, GameAction } from '../game-engine.js';
import { ContextEngine } from '../context-engine.js';
import { StateManager, InMemoryStateStore } from '../state-manager.js';
import { GameDefinition } from '@omnigents/shared';

describe('GameEngine', () => {
    let engine: GameEngine;
    let stateManager: StateManager;
    let contextEngine: ContextEngine;
    let mockGame: GameDefinition;

    beforeEach(() => {
        stateManager = new StateManager(new InMemoryStateStore());
        contextEngine = new ContextEngine();
        engine = new GameEngine(stateManager, contextEngine);

        mockGame = {
            id: 'test-game',
            title: 'Test Game',
            description: 'A test game',
            author: 'Test Author',
            version: '1.0.0',
            startScene: 'start',
            endings: {
                end: {
                    id: 'end',
                    title: 'End',
                    narrative: 'The end.',
                    type: 'neutral'
                }
            },
            contextPermissions: {},
            scenes: {
                start: {
                    id: 'start',
                    title: 'Start Scene',
                    narrative: 'You start here.',
                    choices: [
                        {
                            id: 'c1',
                            text: 'Go forward',
                            targetScene: 'end',
                            effects: [
                                { type: 'set', variable: 'mood', value: 'ready' },
                                { type: 'increment', variable: 'energy', value: 10 }
                            ]
                        }
                    ]
                }
            }
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
        const invalidAction: GameAction = { type: 'choice', choiceId: 'unknown' };

        await expect(
            engine.executeAction(mockGame, session.id, invalidAction, 'trace-id')
        ).rejects.toThrow();
    });

    it('should make a choice successfully', async () => {
        const { session } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        const action: GameAction = { type: 'choice', choiceId: 'c1' };

        const result = await engine.executeAction(mockGame, session.id, action, 'trace-id');

        expect(result.scene.id).toBe('end');
        expect(result.session.currentSceneId).toBe('end');
        expect(result.session.completedAt).toBeDefined();
        expect(result.session.variables).toMatchObject({ mood: 'ready', energy: 10 });
        expect(result.effectsApplied).toEqual([
            'set variable mood',
            'increment variable energy'
        ]);
    });

    it('enforces all supported choice condition operators', async () => {
        mockGame.scenes.start.choices[0].conditions = [
            { variable: 'energy', operator: 'gte', value: 10 },
            { variable: 'mood', operator: 'ne', value: 'blocked' }
        ];
        const { session } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        session.variables = { energy: 10, mood: 'ready' };
        await stateManager.saveSession(session, 'trace-id');

        await expect(
            engine.executeAction(
                mockGame,
                session.id,
                { type: 'choice', choiceId: 'c1' },
                'trace-id'
            )
        ).resolves.toMatchObject({ scene: { id: 'end' } });
    });

    it('injects structured scene context and renders narrative placeholders', async () => {
        contextEngine.registerSource({
            name: 'weather',
            async fetch() {
                return { forecast: ['Clear and bright'] };
            }
        });
        mockGame.contextPermissions = { weather: true };
        mockGame.scenes.start.narrative = 'Outside: {{weather_description}}';
        mockGame.scenes.start.contextQuery = [{
            contextType: 'weather',
            query: 'current conditions',
            targetVariable: 'weather_description',
            transform: 'summarize',
            fallbackValue: 'Weather unavailable'
        }];

        const { session, scene } = await engine.startGame(
            mockGame,
            'player-1',
            'trace-id'
        );

        expect(scene.narrative).toBe('Outside: {"forecast":["Clear and bright"]}');
        expect(session.variables.weather_description).toBe(
            '{"forecast":["Clear and bright"]}'
        );
    });

    it('uses a context fallback when no adapter is registered', async () => {
        mockGame.contextPermissions = { weather: true };
        mockGame.scenes.start.narrative = 'Outside: {{weather_description}}';
        mockGame.scenes.start.contextQuery = [{
            contextType: 'weather',
            query: 'current conditions',
            targetVariable: 'weather_description',
            transform: 'summarize',
            fallbackValue: 'Weather unavailable'
        }];

        const { scene } = await engine.startGame(mockGame, 'player-1', 'trace-id');
        expect(scene.narrative).toBe('Outside: Weather unavailable');
    });
});
