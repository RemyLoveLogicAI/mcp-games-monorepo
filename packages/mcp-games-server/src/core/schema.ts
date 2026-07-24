import { z } from 'zod';

export const EffectSchema = z.object({
    type: z.enum(['set', 'increment', 'decrement', 'toggle']),
    variable: z.string(),
    value: z.unknown().optional(),
});

export const ConditionSchema = z.object({
    variable: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte']),
    value: z.any(),
});

export const ChoiceSchema = z.object({
    id: z.string(),
    text: z.string(),
    targetScene: z.string(),
    effects: z.array(EffectSchema).optional(),
    conditions: z.array(ConditionSchema).optional(),
});

export const ContextInjectionSchema = z.object({
    contextType: z.enum(['calendar', 'notes', 'weather', 'location', 'contacts']),
    query: z.string(),
    targetVariable: z.string(),
    transform: z.enum(['verbatim', 'summarize', 'extract_names', 'extract_dates']),
    fallbackValue: z.string(),
});

export const SceneSchema = z.object({
    id: z.string(),
    title: z.string(),
    narrative: z.string(),
    choices: z.array(ChoiceSchema),
    contextQuery: z.array(ContextInjectionSchema).optional(),
});

export const EndingSchema = z.object({
    id: z.string(),
    title: z.string(),
    narrative: z.string(),
    type: z.enum(['good', 'bad', 'neutral', 'secret']),
});

export const ContextPermissionsSchema = z.object({
    calendar: z.boolean().optional(),
    notes: z.boolean().optional(),
    weather: z.boolean().optional(),
    location: z.boolean().optional(),
    contacts: z.boolean().optional(),
});

export const GameDefinitionSchema = z.object({
    id: z.string(),
    version: z.string(),
    title: z.string(),
    description: z.string(),
    author: z.string(),
    startScene: z.string(),
    scenes: z.record(SceneSchema),
    endings: z.record(EndingSchema).optional(),
    contextPermissions: ContextPermissionsSchema.default({}),
}).superRefine((game, context) => {
    if (!game.scenes[game.startScene]) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['startScene'],
            message: `Start scene '${game.startScene}' does not exist`,
        });
    }

    for (const [sceneKey, scene] of Object.entries(game.scenes)) {
        if (scene.id !== sceneKey) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['scenes', sceneKey, 'id'],
                message: `Scene id '${scene.id}' must match its key '${sceneKey}'`,
            });
        }

        const choiceIds = new Set<string>();
        for (const [choiceIndex, choice] of scene.choices.entries()) {
            if (choiceIds.has(choice.id)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['scenes', sceneKey, 'choices', choiceIndex, 'id'],
                    message: `Duplicate choice id '${choice.id}' in scene '${sceneKey}'`,
                });
            }
            choiceIds.add(choice.id);

            if (!game.scenes[choice.targetScene] && !game.endings?.[choice.targetScene]) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['scenes', sceneKey, 'choices', choiceIndex, 'targetScene'],
                    message: `Target '${choice.targetScene}' does not exist`,
                });
            }
        }
    }

    for (const [endingKey, ending] of Object.entries(game.endings ?? {})) {
        if (ending.id !== endingKey) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endings', endingKey, 'id'],
                message: `Ending id '${ending.id}' must match its key '${endingKey}'`,
            });
        }
    }

    const reachable = new Set<string>();
    const pending = [game.startScene];
    while (pending.length > 0) {
        const sceneId = pending.pop()!;
        if (reachable.has(sceneId) || !game.scenes[sceneId]) continue;
        reachable.add(sceneId);
        for (const choice of game.scenes[sceneId].choices) {
            if (game.scenes[choice.targetScene]) pending.push(choice.targetScene);
        }
    }

    for (const sceneId of Object.keys(game.scenes)) {
        if (!reachable.has(sceneId)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['scenes', sceneId],
                message: `Scene '${sceneId}' is unreachable from '${game.startScene}'`,
            });
        }
    }

    const scenesThatCanEnd = new Set<string>();
    let discoveredEndingPath = true;
    while (discoveredEndingPath) {
        discoveredEndingPath = false;
        for (const [sceneId, scene] of Object.entries(game.scenes)) {
            if (scenesThatCanEnd.has(sceneId)) continue;
            if (scene.choices.some(choice =>
                Boolean(game.endings?.[choice.targetScene]) ||
                scenesThatCanEnd.has(choice.targetScene)
            )) {
                scenesThatCanEnd.add(sceneId);
                discoveredEndingPath = true;
            }
        }
    }

    for (const sceneId of reachable) {
        if (!scenesThatCanEnd.has(sceneId)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['scenes', sceneId],
                message: `Scene '${sceneId}' has no path to a declared ending`,
            });
        }
    }
});

export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
