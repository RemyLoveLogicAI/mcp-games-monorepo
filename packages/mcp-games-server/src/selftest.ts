import { GameDefinition, Telemetry, logger } from '@omnigents/shared';
import { GameEngine } from './core/engine.js';
import { InMemoryStateStore } from './core/state.js';
import { telemetry } from './observability/index.js';

const tracing = new Telemetry({
    serviceName: 'mcp-games-server-selftest',
    serviceVersion: '0.1.0',
});


const sampleGame: GameDefinition = {
    id: 'test-game',
    version: '1.0',
    title: 'Test Game',
    description: 'A test game',
    author: 'Test Author',
    startScene: 'start',
    scenes: {
        'start': {
            id: 'start',
            title: 'Start Scene',
            narrative: 'You are at the start.',
            choices: [
                { id: 'c1', text: 'Go next', targetScene: 'next' }
            ]
        },
        'next': {
            id: 'next',
            title: 'Next Scene',
            narrative: 'You are at the next scene.',
            choices: []
        }
    },
    endings: {},
    contextPermissions: {}
};

async function runTest() {
    await tracing.start();
    logger.info('Tracing initialized');

    const stateStore = new InMemoryStateStore();
    const engine = new GameEngine(stateStore);

    console.log('Testing Parser...');
    const { gameParser } = await import('./core/parser.js');
    const path = await import('path');
    const yamlPath = path.resolve(process.cwd(), 'data/sample.yaml');
    const parsedGame = await gameParser.parse(yamlPath);
    console.log(`Parsed game: ${parsedGame.title}`);

    if (parsedGame.id !== 'parsed-game') throw new Error('Parser failed');

    console.log('Starting game...');
    const { session, scene } = await engine.startGame(sampleGame, 'player-1');
    console.log(`Started session: ${session.id}, Scene: ${scene.title}`);

    if (scene.id !== 'start') throw new Error('Wrong start scene');

    console.log('Making choice...');
    const result = await engine.makeChoice(sampleGame, session.id, 'c1');
    console.log(`New Scene: ${result.scene.title}`);

    if (result.scene.id !== 'next') throw new Error('Wrong next scene');

    console.log('Test PASSED');

    // Allow telemetry to flush
    setTimeout(() => process.exit(0), 1000);
}

runTest().catch(err => {
    console.error('Test FAILED', err);
    process.exit(1);
});
