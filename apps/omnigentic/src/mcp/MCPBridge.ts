import { RuntimeHost } from '../runtime/RuntimeHost.js';
import { RuntimeSignal } from '../runtime/AgentContract.js';

interface MCPTextBlock {
    type: 'text';
    text: string;
}

interface MCPToolResponse {
    content: MCPTextBlock[];
}

/**
 * Bridges the internal Universal Runtime events to the MCP Protocol.
 * This allows external tools (Claude, IDEs) to inspect and control the runtime.
 */
export class MCPBridge {
    constructor(private runtime: RuntimeHost) { }

    /**
     * Expose runtime capabilities as MCP Tools.
     */
    getTools() {
        return [
            {
                name: 'spawn_agent',
                description: 'Spawn one agent from a registered template',
                inputSchema: {
                    type: 'object',
                    properties: {
                        agentId: { type: 'string' },
                        environmentId: { type: 'string' },
                        type: { type: 'string' },
                        swarmId: { type: 'string' },
                        parentAgentId: { type: 'string' },
                        role: { type: 'string' },
                        config: { type: 'object' }
                    },
                    required: ['agentId', 'environmentId', 'type']
                }
            },
            {
                name: 'spawn_swarm',
                description: 'Spawn many sub-agents from one template',
                inputSchema: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        swarmId: { type: 'string' },
                        environmentId: { type: 'string' },
                        size: { type: 'integer' },
                        agentIdPrefix: { type: 'string' },
                        parentAgentId: { type: 'string' },
                        sharedConfig: { type: 'object' },
                        roles: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        continueOnError: { type: 'boolean' }
                    },
                    required: ['type', 'swarmId', 'environmentId', 'size']
                }
            },
            {
                name: 'signal_agent',
                description: 'Send PAUSE/RESUME/TERMINATE/SNAPSHOT to one agent',
                inputSchema: {
                    type: 'object',
                    properties: {
                        agentId: { type: 'string' },
                        signal: { type: 'string', enum: ['PAUSE', 'RESUME', 'TERMINATE', 'SNAPSHOT'] }
                    },
                    required: ['agentId', 'signal']
                }
            },
            {
                name: 'orchestrate_swarm',
                description: 'Run one or more orchestration rounds for a swarm',
                inputSchema: {
                    type: 'object',
                    properties: {
                        swarmId: { type: 'string' },
                        iterations: { type: 'integer' },
                        stopOnFailure: { type: 'boolean' },
                        delayBetweenRoundsMs: { type: 'integer' }
                    },
                    required: ['swarmId']
                }
            },
            {
                name: 'list_agent_templates',
                description: 'List registered runtime agent templates',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'inspect_runtime',
                description: 'Inspect runtime health, agents, swarms, and events',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'list_environments',
                description: 'List currently registered runtime environments',
                inputSchema: { type: 'object', properties: {} }
            }
        ];
    }

    /**
     * Handle MCP tool calls and map them to RuntimeHost methods.
     */
    async handleToolCall(name: string, args: unknown): Promise<MCPToolResponse> {
        switch (name) {
            case 'spawn_agent': {
                const params = this.expectObject(name, args);
                const type = this.requireString(params, 'type');
                const agentId = this.requireString(params, 'agentId');
                const environmentId = this.requireString(params, 'environmentId');
                const config = this.optionalRecord(params, 'config');
                const swarmId = this.optionalString(params, 'swarmId');
                const parentAgentId = this.optionalString(params, 'parentAgentId');
                const role = this.optionalString(params, 'role');

                const spawned = await this.runtime.spawnAgentFromTemplate({
                    templateType: type,
                    agentId,
                    environmentId,
                    config: config ?? undefined,
                    swarmId: swarmId ?? undefined,
                    parentAgentId: parentAgentId ?? undefined,
                    role: role ?? undefined,
                });

                return this.textResponse(this.asJson({
                    ok: true,
                    action: 'spawn_agent',
                    agent: spawned,
                }));
            }
            case 'spawn_swarm': {
                const params = this.expectObject(name, args);
                const type = this.requireString(params, 'type');
                const swarmId = this.requireString(params, 'swarmId');
                const environmentId = this.requireString(params, 'environmentId');
                const size = this.requirePositiveInteger(params, 'size');
                const agentIdPrefix = this.optionalString(params, 'agentIdPrefix');
                const parentAgentId = this.optionalString(params, 'parentAgentId');
                const sharedConfig = this.optionalRecord(params, 'sharedConfig');
                const roles = this.optionalStringArray(params, 'roles');
                const continueOnError = this.optionalBoolean(params, 'continueOnError');

                const result = await this.runtime.spawnSwarmFromTemplate({
                    templateType: type,
                    swarmId,
                    environmentId,
                    size,
                    agentIdPrefix: agentIdPrefix ?? undefined,
                    parentAgentId: parentAgentId ?? undefined,
                    sharedConfig: sharedConfig ?? undefined,
                    roles: roles ?? undefined,
                    continueOnError: continueOnError ?? undefined,
                });

                return this.textResponse(this.asJson({
                    ok: true,
                    action: 'spawn_swarm',
                    result,
                }));
            }
            case 'signal_agent': {
                const params = this.expectObject(name, args);
                const agentId = this.requireString(params, 'agentId');
                const signal = this.requireSignal(params, 'signal');

                await this.runtime.signalAgent(agentId, signal);

                return this.textResponse(this.asJson({
                    ok: true,
                    action: 'signal_agent',
                    agentId,
                    signal,
                }));
            }
            case 'orchestrate_swarm': {
                const params = this.expectObject(name, args);
                const swarmId = this.requireString(params, 'swarmId');
                const iterations = this.optionalPositiveInteger(params, 'iterations');
                const stopOnFailure = this.optionalBoolean(params, 'stopOnFailure');
                const delayBetweenRoundsMs = this.optionalPositiveInteger(params, 'delayBetweenRoundsMs');

                const result = await this.runtime.orchestrateSwarm({
                    swarmId,
                    iterations: iterations ?? undefined,
                    stopOnFailure: stopOnFailure ?? undefined,
                    delayBetweenRoundsMs: delayBetweenRoundsMs ?? undefined,
                });

                return this.textResponse(this.asJson({
                    ok: true,
                    action: 'orchestrate_swarm',
                    result,
                }));
            }
            case 'list_agent_templates':
                return this.textResponse(this.asJson({
                    ok: true,
                    templates: this.runtime.listAgentTemplates(),
                }));
            case 'inspect_runtime':
                return this.textResponse(this.asJson({
                    ok: true,
                    snapshot: this.runtime.getRuntimeSnapshot(),
                }));
            case 'list_environments':
                return this.textResponse(this.asJson({
                    ok: true,
                    environments: this.runtime.listEnvironmentIds(),
                }));
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    private textResponse(text: string): MCPToolResponse {
        return { content: [{ type: 'text', text }] };
    }

    private asJson(value: unknown): string {
        return JSON.stringify(value, null, 2);
    }

    private expectObject(toolName: string, value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Tool '${toolName}' expects an object input`);
        }
        return value as Record<string, unknown>;
    }

    private requireString(input: Record<string, unknown>, key: string): string {
        const value = input[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error(`Field '${key}' must be a non-empty string`);
        }
        return value.trim();
    }

    private optionalString(input: Record<string, unknown>, key: string): string | null {
        const value = input[key];
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error(`Field '${key}' must be a non-empty string when provided`);
        }
        return value.trim();
    }

    private optionalRecord(input: Record<string, unknown>, key: string): Record<string, unknown> | null {
        const value = input[key];
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Field '${key}' must be an object when provided`);
        }
        return value as Record<string, unknown>;
    }

    private requirePositiveInteger(input: Record<string, unknown>, key: string): number {
        const value = input[key];
        if (!Number.isInteger(value) || (value as number) <= 0) {
            throw new Error(`Field '${key}' must be a positive integer`);
        }
        return value as number;
    }

    private optionalPositiveInteger(input: Record<string, unknown>, key: string): number | null {
        const value = input[key];
        if (value === undefined || value === null) {
            return null;
        }
        if (!Number.isInteger(value) || (value as number) <= 0) {
            throw new Error(`Field '${key}' must be a positive integer when provided`);
        }
        return value as number;
    }

    private optionalBoolean(input: Record<string, unknown>, key: string): boolean | null {
        const value = input[key];
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value !== 'boolean') {
            throw new Error(`Field '${key}' must be a boolean when provided`);
        }
        return value;
    }

    private optionalStringArray(input: Record<string, unknown>, key: string): string[] | null {
        const value = input[key];
        if (value === undefined || value === null) {
            return null;
        }
        if (!Array.isArray(value)) {
            throw new Error(`Field '${key}' must be an array of strings when provided`);
        }

        const out: string[] = [];
        for (const item of value) {
            if (typeof item !== 'string' || item.trim().length === 0) {
                throw new Error(`Field '${key}' must contain only non-empty strings`);
            }
            out.push(item.trim());
        }
        return out;
    }

    private requireSignal(input: Record<string, unknown>, key: string): RuntimeSignal {
        const signal = this.requireString(input, key);
        if (signal === 'PAUSE' || signal === 'RESUME' || signal === 'TERMINATE' || signal === 'SNAPSHOT') {
            return signal;
        }
        throw new Error(`Invalid signal '${signal}'. Expected PAUSE|RESUME|TERMINATE|SNAPSHOT`);
    }
}
