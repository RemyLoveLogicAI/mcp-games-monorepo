import { GameDefinition, SceneDefinition as Scene, ChoiceDefinition as Choice, Session } from '@omnigents/shared';
import { StateStore } from './state-manager.js';
import { ContextEngine } from './context-engine.js';
import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface GameAction {
    type: 'choice' | 'freeform';
    choiceId?: string;
    freeformInput?: string;
}

export interface ActionResult {
    session: Session;
    scene: Scene;
    narrative: string;
    contextInjected: Record<string, any>;
    effectsApplied: string[];
}

// ═══════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════

export class GameEngine {
    private agent: SelfAwareAgent | null;

    constructor(
        private stateStore: StateStore,
        private contextEngine: ContextEngine,
        agent?: SelfAwareAgent
    ) {
        this.agent = agent || null;
    }

    // ───────────────────────────────────────────────────────
    // GAME LIFECYCLE
    // ───────────────────────────────────────────────────────

    async startGame(
        game: GameDefinition,
        playerId: string,
        traceId: string
    ): Promise<{ session: Session; scene: Scene }> {
        const start = Date.now();
        try {
            const session = await this.stateStore.createSession(game.id, playerId, traceId);
            session.currentSceneId = game.startScene;

            const scene = game.scenes[session.currentSceneId];
            if (!scene) {
                throw new Error(`Start scene '${game.startScene}' not found in game '${game.id}'`);
            }

            // Inject context from MCPs
            const contextInjected = await this.injectContextForScene(scene, session, traceId);
            session.variables = { ...session.variables, ...contextInjected };

            await this.stateStore.saveSession(session, traceId);

            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'game:start',
                    status: 'success',
                    durationMs: duration,
                    traceId
                });
            }

            telemetry.emit('game:started', { gameId: game.id, playerId, traceId, duration });
            return { session, scene };
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'game:start',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    // ───────────────────────────────────────────────────────
    // ACTION PROCESSING
    // ───────────────────────────────────────────────────────

    async executeAction(
        game: GameDefinition,
        sessionId: string,
        action: GameAction,
        traceId: string
    ): Promise<ActionResult> {
        const start = Date.now();
        const actionStart = Date.now();

        try {
            const session = await this.stateStore.getSession(sessionId, traceId);
            if (!session) {
                throw new Error(`Session '${sessionId}' not found`);
            }

            const currentScene = game.scenes[session.currentSceneId];
            if (!currentScene) {
                throw new Error(`Current scene '${session.currentSceneId}' not found`);
            }

            // Validate action
            if (action.type === 'choice' && action.choiceId) {
                const choice = currentScene.choices.find(c => c.id === action.choiceId);
                if (!choice) {
                    throw new Error(`Choice '${action.choiceId}' not valid for scene '${session.currentSceneId}'`);
                }

                // Check conditions
                const conditionsMet = this.evaluateConditions(choice.conditions, session.variables);
                if (!conditionsMet) {
                    throw new Error(`Conditions not met for choice '${action.choiceId}'`);
                }

                // Navigate to next scene
                const nextSceneId = choice.targetScene;
                const effectsApplied = await this.applyEffects(choice.effects || [], session, traceId);

                session.currentSceneId = nextSceneId;
                session.lastActivityAt = new Date().toISOString();

                // Log this action to history
                await this.stateStore.logAction(
                    sessionId,
                    currentScene.id,
                    { choiceId: action.choiceId, effectsApplied },
                    session.variables,
                    Date.now() - actionStart,
                    traceId
                );

                // Fetch next scene
                const nextScene = game.scenes[nextSceneId];
                if (!nextScene) {
                    // Check if it's an ending
                    if (game.endings && game.endings[nextSceneId]) {
                        const ending = game.endings[nextSceneId];
                        session.completedAt = new Date().toISOString();
                        await this.stateStore.saveSession(session, traceId);

                        const endingScene: Scene = {
                            id: ending.id,
                            title: ending.title,
                            narrative: ending.narrative,
                            choices: []
                        };

                        return {
                            session,
                            scene: endingScene,
                            narrative: ending.narrative,
                            contextInjected: {},
                            effectsApplied
                        };
                    }
                    throw new Error(`Target scene '${nextSceneId}' not found`);
                }

                // Inject context for next scene
                const contextInjected = await this.injectContextForScene(nextScene, session, traceId);
                session.variables = { ...session.variables, ...contextInjected };

                await this.stateStore.saveSession(session, traceId);

                const duration = Date.now() - start;
                if (this.agent) {
                    await this.agent.track({
                        operation: 'game:action',
                        status: 'success',
                        durationMs: duration,
                        traceId
                    });
                }

                telemetry.emit('action:executed', {
                    sessionId,
                    sceneId: currentScene.id,
                    choiceId: action.choiceId,
                    effectsCount: effectsApplied.length,
                    traceId
                });

                return {
                    session,
                    scene: nextScene,
                    narrative: nextScene.narrative,
                    contextInjected,
                    effectsApplied
                };
            }

            throw new Error(`Unsupported action type: ${action.type}`);
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                await this.agent.track({
                    operation: 'game:action',
                    status: 'failure',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    // ───────────────────────────────────────────────────────
    // EFFECTS SYSTEM
    // ───────────────────────────────────────────────────────

    private async applyEffects(
        effects: any[] | undefined,
        session: Session,
        traceId: string
    ): Promise<string[]> {
        if (!effects || effects.length === 0) {
            return [];
        }

        const applied: string[] = [];

        for (const effect of effects) {
            try {
                if (effect.type === 'variable_set') {
                    await this.stateStore.setVariable(
                        session.id,
                        effect.key,
                        effect.value,
                        traceId
                    );
                    applied.push(`set variable ${effect.key}`);
                } else if (effect.type === 'health_damage') {
                    await this.stateStore.updateHealthScore(
                        session.id,
                        -effect.amount,
                        traceId
                    );
                    applied.push(`health damage -${effect.amount}`);
                } else if (effect.type === 'health_heal') {
                    await this.stateStore.updateHealthScore(
                        session.id,
                        effect.amount,
                        traceId
                    );
                    applied.push(`health heal +${effect.amount}`);
                }

                telemetry.emit('effect:applied', {
                    effectType: effect.type,
                    sessionId: session.id,
                    traceId
                });
            } catch (error) {
                telemetry.emit('effect:failed', {
                    effectType: effect.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    traceId
                });
            }
        }

        return applied;
    }

    // ───────────────────────────────────────────────────────
    // CONDITIONS EVALUATION
    // ───────────────────────────────────────────────────────

    private evaluateConditions(
        conditions: any[] | undefined,
        variables: Record<string, any>
    ): boolean {
        if (!conditions || conditions.length === 0) {
            return true;
        }

        return conditions.every(condition => {
            if (condition.type === 'variable_equals') {
                return variables[condition.key] === condition.value;
            }
            if (condition.type === 'variable_gt') {
                return (variables[condition.key] as number) > condition.value;
            }
            if (condition.type === 'variable_lt') {
                return (variables[condition.key] as number) < condition.value;
            }
            return true;
        });
    }

    // ───────────────────────────────────────────────────────
    // CONTEXT INJECTION
    // ───────────────────────────────────────────────────────

    private async injectContextForScene(
        scene: Scene,
        session: Session,
        traceId: string
    ): Promise<Record<string, any>> {
        try {
            // Parse scene for context requests
            // Format: @calendar:today, @notes:search, etc.
            const contextRequests: Array<{ source: string; query: string }> = [];

            const narrativeMatch = scene.narrative.match(/@(\w+):([^\s,\.]+)/g);
            if (narrativeMatch) {
                for (const match of narrativeMatch) {
                    const [source, query] = match.slice(1).split(':');
                    if (source && query) {
                        contextRequests.push({ source, query });
                    }
                }
            }

            if (contextRequests.length === 0) {
                return {};
            }

            const context = await this.contextEngine.injectContext(contextRequests, traceId);
            return context.sources || {};
        } catch (error) {
            telemetry.emit('context:injection:failed', {
                sceneId: scene.id,
                error: error instanceof Error ? error.message : 'Unknown error',
                traceId
            });
            return {};
        }
    }

    // ───────────────────────────────────────────────────────
    // NARRATIVE GENERATION
    // ───────────────────────────────────────────────────────

    getNarrativeWithContext(scene: Scene, context: Record<string, any>): string {
        let narrative = scene.narrative;

        // Replace context placeholders with actual values
        for (const [key, value] of Object.entries(context)) {
            narrative = narrative.replace(`@${key}`, JSON.stringify(value));
        }

        return narrative;
    }
}
