import { GameDefinition, SceneDefinition as Scene, ChoiceDefinition as Choice, Session } from '@omnigents/shared';
import { StateStore } from './state.js';
import { contextEngine } from './context.js';
import { telemetry } from '../observability/index.js';

export class GameEngine {
    constructor(private stateStore: StateStore) { }

    async startGame(game: GameDefinition, playerId: string): Promise<{ session: Session, scene: Scene }> {
        const session = await this.stateStore.createSession(game.id, playerId);
        session.currentSceneId = game.startScene;

        await this.stateStore.saveSession(session);

        let scene = game.scenes[session.currentSceneId];
        if (!scene) {
            throw new Error(`Start scene '${game.startScene}' not found in game '${game.id}'`);
        }

        // Context Injection
        const contextData = await contextEngine.resolveContext(scene, session.id);
        session.variables = { ...session.variables, ...contextData };
        await this.stateStore.saveSession(session); // Save context variables

        return { session, scene };
    }

    async makeChoice(game: GameDefinition, sessionId: string, choiceId: string): Promise<{ session: Session, scene: Scene, narrative: string }> {
        const session = await this.stateStore.getSession(sessionId);
        if (!session) {
            throw new Error(`Session '${sessionId}' not found`);
        }

        let currentScene = game.scenes[session.currentSceneId];
        const choice = currentScene.choices.find(c => c.id === choiceId);

        if (!choice) {
            throw new Error(`Choice '${choiceId}' not valid for scene '${session.currentSceneId}'`);
        }

        // Apply effects logic here (future)

        // Check conditions logic here (future)

        // Navigate
        session.currentSceneId = choice.targetScene;
        session.lastActivityAt = new Date().toISOString();

        const nextScene = game.scenes[session.currentSceneId];
        if (!nextScene) {
            // Check if it's an ending
            if (game.endings && game.endings[session.currentSceneId]) {
                const ending = game.endings[session.currentSceneId];
                // Mark session complete
                session.completedAt = new Date().toISOString();
                await this.stateStore.saveSession(session);

                return {
                    session,
                    scene: { id: ending.id, title: ending.title, narrative: ending.narrative, choices: [] } as Scene, // Treat ending as scene with no choices
                    narrative: ending.narrative
                };
            }
            throw new Error(`Target scene '${choice.targetScene}' not found`);
        }

        await this.stateStore.saveSession(session);

        return { session, scene: nextScene, narrative: nextScene.narrative };
    }
}
