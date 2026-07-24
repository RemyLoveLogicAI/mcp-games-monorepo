import path from 'node:path';
import { GameParser } from '../parser.js';
import { GameDefinitionSchema } from '../schema.js';
import { GameEngine } from '../game-engine.js';
import { ContextEngine } from '../context-engine.js';
import { InMemoryStateStore, StateManager } from '../state-manager.js';

describe('GameParser', () => {
    const gamePath = path.resolve(process.cwd(), '../../games/morning-decision.yaml');

    it('parses the flagship game and validates every navigation target', async () => {
        const parser = new GameParser();

        const game = await parser.parse(gamePath);

        expect(game.startScene).toBe('wake_up');
        expect(Object.keys(game.scenes).length).toBeGreaterThan(10);
        expect(Object.keys(game.endings).length).toBeGreaterThan(10);
    });

    it('plays the flagship game from first light through a complete ending', async () => {
        const game = await new GameParser().parse(gamePath);
        const engine = new GameEngine(
            new StateManager(new InMemoryStateStore()),
            new ContextEngine()
        );
        const started = await engine.startGame(game, 'player-1', 'trace-playthrough');

        expect(started.scene.narrative).not.toContain('{{');

        let session = started.session;
        for (const choiceId of [
            'energetic',
            'healthy_breakfast',
            'leave_early',
            'embrace'
        ]) {
            const result = await engine.executeAction(
                game,
                session.id,
                { type: 'choice', choiceId },
                'trace-playthrough'
            );
            session = result.session;
        }

        expect(session.currentSceneId).toBe('ending_ahead');
        expect(session.completedAt).toBeDefined();
        expect(session.variables).toMatchObject({
            morning_mood: 'energetic',
            energy: 90
        });
    });

    it('rejects dangling choice targets before a game can start', () => {
        const invalidGame = {
            id: 'broken',
            version: '1.0.0',
            title: 'Broken',
            description: 'Broken graph',
            author: 'Test',
            startScene: 'start',
            scenes: {
                start: {
                    id: 'start',
                    title: 'Start',
                    narrative: 'Start',
                    choices: [{
                        id: 'leave',
                        text: 'Leave',
                        targetScene: 'missing'
                    }]
                }
            },
            endings: {},
            contextPermissions: {}
        };

        expect(() => GameDefinitionSchema.parse(invalidGame)).toThrow(
            "Target 'missing' does not exist"
        );
    });
});
