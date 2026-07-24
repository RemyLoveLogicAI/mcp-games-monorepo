import { GameDefinition, SceneDefinition as Scene, ChoiceDefinition as Choice, Session } from '@omnigents/shared';
import { StateManager } from './state-manager.js';
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
        private stateStore: StateManager,
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
            session.contextPermissions = { ...game.contextPermissions };

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
                telemetry.emit('game:start:success', {
                    durationMs: duration,
                    traceId
                });
            }

            telemetry.emit('game:started', { gameId: game.id, playerId, traceId, duration });
            return {
                session,
                scene: {
                    ...scene,
                    narrative: this.getNarrativeWithContext(scene, contextInjected)
                }
            };
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('game:start:error', {
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
            if (action.type === 'choice') {
                if (!action.choiceId) {
                    throw new Error('A choiceId is required for choice actions');
                }
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
                    session.variables as any,
                    Date.now() - actionStart,
                    traceId
                );

                // Fetch next scene
                const nextScene = game.scenes[nextSceneId];
                if (!nextScene) {
                    // Check if it's an ending
                    if (game.endings && game.endings[nextSceneId]) {
                        const ending = game.endings[nextSceneId];
                        session.currentSceneId = nextSceneId;
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
                    telemetry.emit('game:action:success', {
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
                    scene: {
                        ...nextScene,
                        narrative: this.getNarrativeWithContext(nextScene, contextInjected)
                    },
                    narrative: this.getNarrativeWithContext(nextScene, contextInjected),
                    contextInjected,
                    effectsApplied
                };
            }

            throw new Error(`Unsupported action type: ${action.type}`);
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('game:action:error', {
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
                const currentValue = session.variables[effect.variable];
                if (effect.type === 'set') {
                    session.variables[effect.variable] = effect.value;
                } else if (effect.type === 'increment') {
                    session.variables[effect.variable] =
                        (Number(currentValue) || 0) + Number(effect.value);
                } else if (effect.type === 'decrement') {
                    session.variables[effect.variable] =
                        (Number(currentValue) || 0) - Number(effect.value);
                } else if (effect.type === 'toggle') {
                    session.variables[effect.variable] = !Boolean(currentValue);
                } else {
                    throw new Error(`Unsupported effect type '${effect.type}'`);
                }
                applied.push(`${effect.type} variable ${effect.variable}`);

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
                throw error;
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
            const actual = variables[condition.variable];
            switch (condition.operator) {
                case 'eq': return actual === condition.value;
                case 'ne': return actual !== condition.value;
                case 'gt': return Number(actual) > Number(condition.value);
                case 'lt': return Number(actual) < Number(condition.value);
                case 'gte': return Number(actual) >= Number(condition.value);
                case 'lte': return Number(actual) <= Number(condition.value);
                default: return false;
            }
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
            const permittedRequests = (scene.contextQuery ?? []).filter(
                request => session.contextPermissions[request.contextType] === true
            );

            if (permittedRequests.length === 0) {
                return {};
            }

            const context = await this.contextEngine.injectContext(
                permittedRequests.map(request => ({
                    source: request.contextType,
                    query: request.query
                })),
                traceId
            );

            const injected: Record<string, unknown> = {};
            for (const request of permittedRequests) {
                const result = context.sources?.[request.contextType];
                injected[request.targetVariable] = this.transformContextResult(
                    result,
                    request.transform,
                    request.fallbackValue
                );
            }
            return injected;
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
        return scene.narrative.replace(/\{\{(\w+)\}\}/g, (placeholder, key) => {
            const value = context[key];
            if (value === undefined || value === null || value === '') {
                return placeholder;
            }
            return typeof value === 'string' ? value : JSON.stringify(value);
        });
    }

    private transformContextResult(
        result: unknown,
        transform: 'verbatim' | 'summarize' | 'extract_names' | 'extract_dates',
        fallbackValue: string
    ): string {
        if (result === undefined || result === null) {
            return fallbackValue;
        }

        if (typeof result === 'object') {
            const values = Object.values(result as Record<string, unknown>);
            const hasUsefulCollection = values.some(
                value => Array.isArray(value) && value.length > 0
            );
            if (!hasUsefulCollection) {
                return fallbackValue;
            }
        }

        if (typeof result === 'string') {
            return result.trim() || fallbackValue;
        }

        if (transform === 'extract_names' || transform === 'extract_dates') {
            const candidate = (result as Record<string, unknown>)[
                transform === 'extract_names' ? 'names' : 'dates'
            ];
            return Array.isArray(candidate) && candidate.length > 0
                ? candidate.join(', ')
                : fallbackValue;
        }

        return JSON.stringify(result);
    }
}
