import { SceneDefinition as Scene, ContextInjection } from '@omnigents/shared';
import { telemetry } from '../observability/index.js';

export class ContextEngine {
    async resolveContext(scene: Scene, sessionId: string): Promise<Record<string, string>> {
        const contextData: Record<string, string> = {};

        if (!scene.contextQuery || scene.contextQuery.length === 0) {
            return contextData;
        }

        telemetry.emit('context:resolve_start', { sessionId, sceneId: scene.id, count: scene.contextQuery.length });

        for (const query of scene.contextQuery) {
            try {
                // In a real implementation, this would call an MCP client or external service
                // For Sprint 1, we mock common context types
                const value = await this.fetchContext(query);
                contextData[query.targetVariable] = value;
            } catch (error) {
                telemetry.emit('context:error', {
                    sessionId,
                    query: query.query,
                    error: error instanceof Error ? error.message : String(error)
                }, 'WARN');
                contextData[query.targetVariable] = query.fallbackValue;
            }
        }

        telemetry.emit('context:resolved', { sessionId, keys: Object.keys(contextData) });
        return contextData;
    }

    private async fetchContext(query: ContextInjection): Promise<string> {
        // Mock implementation
        switch (query.contextType) {
            case 'calendar':
                return "No upcoming events today.";
            case 'weather':
                return "Sunny, 25°C.";
            case 'location':
                return "San Francisco, CA.";
            case 'notes':
                return "Note: Remember to buy milk.";
            case 'contacts':
                return "Alice, Bob, Charlie.";
            default:
                return query.fallbackValue;
        }
    }
}

export const contextEngine = new ContextEngine();
