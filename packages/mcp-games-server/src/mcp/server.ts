import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { telemetry } from "../observability/index.js";

// Define the server
const server = new Server(
    {
        name: "omnigents-mcp-games",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

import { GameDefinition } from '@omnigents/shared';
import { getStateStore, GameEngine, gameParser } from "../core/index.js";
import path from 'path';

// Initialize Engine
const stateStore = getStateStore();
const engine = new GameEngine(stateStore);

// Temporary: Load a default game for testing
// In robust implementation, we might have a GameRegistry
let loadedGame: GameDefinition | null = null;

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "health_check",
                description: "Basic health check for the MCP Games Server",
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: "load_game",
                description: "Load a game definition from file",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: { type: "string" }
                    },
                    required: ["path"]
                }
            },
            {
                name: "start_game",
                description: "Start a new game session",
                inputSchema: {
                    type: "object",
                    properties: {
                        playerId: { type: "string" }
                    },
                    required: ["playerId"]
                }
            },
            {
                name: "make_choice",
                description: "Make a choice in the current game session",
                inputSchema: {
                    type: "object",
                    properties: {
                        sessionId: { type: "string" },
                        choiceId: { type: "string" }
                    },
                    required: ["sessionId", "choiceId"]
                }
            }
        ]
    };
});

// Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    telemetry.emit('tool:call', { tool: name, args });

    try {
        if (name === "health_check") {
            return {
                content: [{ type: "text", text: JSON.stringify({ status: "OK", timestamp: new Date().toISOString() }) }]
            };
        }

        if (name === "load_game") {
            const filePath = String(args?.path);
            loadedGame = await gameParser.parse(filePath);
            return {
                content: [{ type: "text", text: `Loaded game: ${loadedGame.title} (${loadedGame.id})` }]
            };
        }

        if (name === "start_game") {
            if (!loadedGame) throw new Error("No game loaded. Use load_game first.");
            const game = loadedGame;
            const playerId = String(args?.playerId);
            const { session, scene } = await engine.startGame(game, playerId);
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        sessionId: session.id,
                        sceneTitle: scene.title,
                        narrative: scene.narrative,
                        choices: scene.choices
                    }, null, 2)
                }]
            };
        }

        if (name === "make_choice") {
            if (!loadedGame) throw new Error("No game loaded.");
            const game = loadedGame;
            const sessionId = String(args?.sessionId);
            const choiceId = String(args?.choiceId);
            const { session, scene, narrative } = await engine.makeChoice(game, sessionId, choiceId);
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        sceneTitle: scene.title,
                        narrative: narrative,
                        choices: scene.choices,
                        sessionId: session.id
                    }, null, 2)
                }]
            };
        }

        throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
        telemetry.emit('tool:error', { tool: name, error: error instanceof Error ? error.message : String(error) }, 'ERROR');
        throw error;
    }
});

export async function startServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    telemetry.emit('server:start', { transport: 'stdio' });
    console.error("MCP Games Server running on stdio");
}
