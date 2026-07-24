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
    /** Set when the input was ambiguous and clarification is needed. */
    clarificationNeeded?: boolean;
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
            return { session, scene };
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
                    scene: nextScene,
                    narrative: nextScene.narrative,
                    contextInjected,
                    effectsApplied
                };
            }

            if (action.type === 'freeform' && action.freeformInput !== undefined) {
                return await this.handleFreeformInput(game, session, currentScene, action.freeformInput, traceId);
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
    // FREEFORM / AMBIGUOUS INPUT HANDLING  (Issue #12)
    // ───────────────────────────────────────────────────────

    /**
     * Handle a freeform text input from the player.
     * Attempts to match the text to an available choice; if ambiguous or
     * unrecognised, returns the current scene with a clarification prompt
     * instead of throwing an error.
     */
    private async handleFreeformInput(
        game: GameDefinition,
        session: Session,
        currentScene: Scene,
        input: string,
        traceId: string
    ): Promise<ActionResult> {
        const normalised = input.trim().toLowerCase();

        // Classify the input to detect ambiguous responses early.
        const intentType = this.classifyFreeformIntent(normalised);

        if (intentType !== 'clear') {
            // Return the current scene with a clarification prompt so the
            // client can ask the player to be more specific.
            const clarificationNarrative = this.buildClarificationNarrative(intentType, currentScene);

            telemetry.emit('game:freeform:clarification_needed', {
                sessionId: session.id,
                intentType,
                traceId,
            });

            return {
                session,
                scene: { ...currentScene, narrative: clarificationNarrative },
                narrative: clarificationNarrative,
                contextInjected: {},
                effectsApplied: [],
                clarificationNeeded: true,
            };
        }

        // Try to match the freeform text to one of the available choices.
        const matchedChoice = this.matchFreeformToChoice(normalised, currentScene.choices);

        if (!matchedChoice) {
            // No matching choice found – present the available options clearly.
            const choiceList = currentScene.choices
                .map((c, i) => `${i + 1}. ${c.text}`)
                .join('\n');
            const narrative =
                `I didn't quite understand "${input}". Please choose one of the available options:\n\n${choiceList}`;

            telemetry.emit('game:freeform:no_match', {
                sessionId: session.id,
                input,
                traceId,
            });

            return {
                session,
                scene: { ...currentScene, narrative },
                narrative,
                contextInjected: {},
                effectsApplied: [],
                clarificationNeeded: true,
            };
        }

        // A clear match was found – delegate to the existing choice path.
        return this.executeAction(game, session.id, { type: 'choice', choiceId: matchedChoice.id }, traceId);
    }

    /**
     * Classify the player's intent to detect ambiguous or uncertain phrasing.
     */
    private classifyFreeformIntent(
        input: string
    ): 'uncertain' | 'conditional' | 'deflection' | 'request_info' | 'clear' {
        const UNCERTAINTY_PATTERNS = [
            'maybe', 'perhaps', 'possibly', 'might', 'could be',
            "i'm not sure", "don't know", 'uncertain', 'not sure',
        ];
        const CONDITIONAL_PATTERNS = [
            'depends', 'it depends', 'that depends', 'only if', 'depends on',
        ];
        const DEFLECTION_PATTERNS = [
            'whatever', "doesn't matter", "i don't care", 'your choice',
        ];
        const REQUEST_INFO_PATTERNS = [
            'tell me more', 'explain', 'what do you mean', 'clarify',
            'can you elaborate', 'more info', 'what is',
        ];

        if (UNCERTAINTY_PATTERNS.some(p => input.includes(p))) return 'uncertain';
        if (CONDITIONAL_PATTERNS.some(p => input.includes(p))) return 'conditional';
        if (DEFLECTION_PATTERNS.some(p => input.includes(p))) return 'deflection';
        if (REQUEST_INFO_PATTERNS.some(p => input.includes(p))) return 'request_info';
        return 'clear';
    }

    /**
     * Build a context-appropriate clarification message based on the detected intent.
     */
    private buildClarificationNarrative(
        intentType: 'uncertain' | 'conditional' | 'deflection' | 'request_info',
        scene: Scene
    ): string {
        const choiceList = scene.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n');

        switch (intentType) {
            case 'uncertain':
                return (
                    `I understand you're uncertain. Here are your options:\n\n${choiceList}\n\n` +
                    `Take your time – which of these feels right?`
                );
            case 'conditional':
                return (
                    `It sounds like your choice depends on certain factors. ` +
                    `Here are the options available to you:\n\n${choiceList}\n\n` +
                    `Which would you like to explore?`
                );
            case 'deflection':
                return (
                    `I'll let you choose! Here are your options:\n\n${choiceList}\n\n` +
                    `Which would you prefer?`
                );
            case 'request_info':
                return (
                    `Happy to help clarify! Your current options are:\n\n${choiceList}\n\n` +
                    `Would you like more details about any of these before deciding?`
                );
        }
    }

    /**
     * Attempt to match freeform text to an available choice by checking whether
     * the normalised input contains the normalised choice text or vice-versa.
     */
    private matchFreeformToChoice(
        normalisedInput: string,
        choices: Choice[]
    ): Choice | undefined {
        for (const choice of choices) {
            const normalisedChoice = choice.text.toLowerCase().trim();
            if (
                normalisedInput === normalisedChoice ||
                normalisedInput.includes(normalisedChoice) ||
                normalisedChoice.includes(normalisedInput)
            ) {
                return choice;
            }
        }

        // Secondary pass: check if the input contains a numeric index (e.g. "1", "2").
        const indexMatch = normalisedInput.match(/^\s*(\d+)\s*$/);
        if (indexMatch) {
            const idx = parseInt(indexMatch[1], 10) - 1;
            if (idx >= 0 && idx < choices.length) {
                return choices[idx];
            }
        }

        return undefined;
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
