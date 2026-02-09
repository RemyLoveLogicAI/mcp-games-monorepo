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
    contextPermissions: ContextPermissionsSchema.optional(),
});

export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
