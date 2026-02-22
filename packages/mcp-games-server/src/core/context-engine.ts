import { telemetry } from '../observability/index.js';
import { SelfAwareAgent } from '@omnigents/tier0-runtime';

export interface ContextSource {
    name: string;
    fetch(query: string, traceId: string): Promise<any>;
}

export interface ContextData {
    source: string;
    query: string;
    result: any;
    timestamp: string;
    durationMs: number;
}

export interface InjectionContext {
    [key: string]: any;
}

export class CalendarContextSource implements ContextSource {
    name = 'calendar';
    private agent: SelfAwareAgent | null;

    constructor(agent?: SelfAwareAgent) {
        this.agent = agent || null;
    }

    async fetch(query: string, traceId: string): Promise<any> {
        const start = Date.now();
        try {
            const result = {
                source: 'calendar',
                query,
                events: [],
                parsed: this.parseCalendarQuery(query),
                timestamp: new Date().toISOString()
            };

            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('calendar:fetch:success', {
                    durationMs: duration,
                    traceId
                });
            }

            telemetry.emit('context:calendar:fetched', { query, traceId, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('calendar:fetch:error', {
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }

    private parseCalendarQuery(query: string): Record<string, string> {
        if (query.includes('today')) return { timeframe: 'today', type: 'events' };
        if (query.includes('week')) return { timeframe: 'week', type: 'events' };
        if (query.includes('month')) return { timeframe: 'month', type: 'events' };
        return { timeframe: 'today', type: 'events' };
    }
}

export class NotesContextSource implements ContextSource {
    name = 'notes';
    private agent: SelfAwareAgent | null;

    constructor(agent?: SelfAwareAgent) {
        this.agent = agent || null;
    }

    async fetch(query: string, traceId: string): Promise<any> {
        const start = Date.now();
        try {
            const result = {
                source: 'notes',
                query,
                notes: [],
                timestamp: new Date().toISOString()
            };

            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('notes:fetch:success', {
                    durationMs: duration,
                    traceId
                });
            }

            telemetry.emit('context:notes:fetched', { query, traceId, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit('notes:fetch:error', {
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            throw error;
        }
    }
}

export class ContextEngine {
    private sources = new Map<string, ContextSource>();
    private agent: SelfAwareAgent | null;
    private contextCache = new Map<string, ContextData>();
    private cacheMaxAge = 5 * 60 * 1000;

    constructor(agent?: SelfAwareAgent) {
        this.agent = agent || null;
        this.registerDefaultSources();
    }

    private registerDefaultSources(): void {
        this.registerSource(new CalendarContextSource(this.agent || undefined));
        this.registerSource(new NotesContextSource(this.agent || undefined));
    }

    registerSource(source: ContextSource): void {
        this.sources.set(source.name, source);
        telemetry.emit('context:source:registered', { source: source.name });
    }

    async fetchContext(sourceName: string, query: string, traceId: string, skipCache = false): Promise<ContextData | null> {
        const start = Date.now();
        const cacheKey = `${sourceName}:${query}`;

        if (!skipCache) {
            const cached = this.contextCache.get(cacheKey);
            if (cached && Date.now() - new Date(cached.timestamp).getTime() < this.cacheMaxAge) {
                telemetry.emit('context:cache:hit', { source: sourceName, query });
                return cached;
            }
        }

        const source = this.sources.get(sourceName);
        if (!source) {
            telemetry.emit('context:source:notfound', { source: sourceName, traceId });
            return null;
        }

        try {
            const result = await source.fetch(query, traceId);
            const duration = Date.now() - start;

            const contextData: ContextData = {
                source: sourceName,
                query,
                result,
                timestamp: new Date().toISOString(),
                durationMs: duration
            };

            this.contextCache.set(cacheKey, contextData);

            if (this.agent) {
                telemetry.emit(`context:fetch:${sourceName}:success`, {
                    durationMs: duration,
                    traceId
                });
            }

            return contextData;
        } catch (error) {
            const duration = Date.now() - start;
            if (this.agent) {
                telemetry.emit(`context:fetch:${sourceName}:error`, {
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    durationMs: duration,
                    traceId
                });
            }
            return null;
        }
    }

    async injectContext(contextRequests: Array<{ source: string; query: string }>, traceId: string): Promise<InjectionContext> {
        const start = Date.now();
        const injectionContext: InjectionContext = {
            timestamp: new Date().toISOString(),
            sources: {}
        };

        const promises = contextRequests.map(req => this.fetchContext(req.source, req.query, traceId));
        const results = await Promise.all(promises);

        for (const result of results) {
            if (result) {
                injectionContext.sources[result.source] = result.result;
            }
        }

        const duration = Date.now() - start;
        if (this.agent) {
            telemetry.emit('context:inject:success', {
                durationMs: duration,
                traceId
            });
        }

        telemetry.emit('context:injected', {
            sourceCount: contextRequests.length,
            resultCount: results.filter(r => r).length,
            duration,
            traceId
        });

        return injectionContext;
    }

    transformForNarrative(context: InjectionContext): string {
        const parts: string[] = [];
        if (context.sources.calendar?.events?.length > 0) {
            parts.push(`You have ${context.sources.calendar.events.length} upcoming events.`);
        }
        if (context.sources.notes?.length > 0) {
            parts.push(`You have ${context.sources.notes.length} relevant notes.`);
        }
        return parts.join(' ');
    }

    clearCache(sourceName?: string): void {
        if (sourceName) {
            const keysToDelete: string[] = [];
            for (const [key] of this.contextCache) {
                if (key.startsWith(`${sourceName}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.contextCache.delete(key));
            telemetry.emit('context:cache:cleared', { source: sourceName });
        } else {
            this.contextCache.clear();
            telemetry.emit('context:cache:cleared', { source: 'all' });
        }
    }
}

export function createContextEngine(agent?: SelfAwareAgent): ContextEngine {
    return new ContextEngine(agent);
}

export const defaultContextEngine = createContextEngine();