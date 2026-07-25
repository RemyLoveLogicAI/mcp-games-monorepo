# MCP Connector 🔌

Express.js boundary between the flagship MCP Games website and Model Context
Protocol services.

## Features

- Browser-safe health and readiness discovery
- Real local MCP Games transport over stdio
- Runtime connection management for Games, GitHub, Linear, and Notion
- MCP tool discovery plus typed load, session, choice, and realtime-mesh actions
- Auditable execution receipts with response-only persistence metadata
- Validated semantic-query and user-context response contracts
- Configurable CORS allowlist for the flagship website

The Games transport launches the built `@omnigents/mcp-games-server` process and
uses the official Model Context Protocol client. Other remote adapters and
context aggregation remain follow-up work.

## Development

```bash
cp .env.example .env
pnpm --filter @omnigents/mcp-games-server build
pnpm dev:connector
```

Runs on `http://localhost:3001`

From the repository root, `pnpm dev` starts this connector and the flagship
website together.

## API Endpoints

### MCP Management

- `GET /api/mcp/connections` - List connected MCP servers
- `POST /api/mcp/connect/:serverId` - Connect to an MCP server
- `DELETE /api/mcp/disconnect/:serverId` - Disconnect from an MCP server

### Games Execution

- `GET /api/games/health` - Run the server `health_check` tool
- `GET /api/games/capabilities` - Discover the server's MCP tools
- `POST /api/games/load` - Load an allowlisted game by `gameId`
- `POST /api/games/sessions` - Start a game for a `playerId`
- `POST /api/games/sessions/:sessionId/choices` - Execute a `choiceId`
- `POST /api/games/mesh/plan` - Validate and plan a realtime session mesh

Action responses include an execution receipt. Receipts are returned to the
caller but are not persisted by the connector.

### Semantic Queries

- `POST /api/mcp/query` - Execute semantic query across MCPs
- `GET /api/mcp/context/:userId` - Get aggregated user context

## Environment Variables

Create a `.env` file:

```env
PORT=3001
NODE_ENV=development
MCP_CONNECTOR_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
MCP_GAMES_SERVER_ENTRY=/absolute/path/to/packages/mcp-games-server/dist/index.js
MCP_GAMES_ROOT=/absolute/path/to/games
MCP_GAMES_WORKDIR=/absolute/path/to/mcp-games-monorepo
```

`MCP_CONNECTOR_PORT` may be used instead of `PORT`, and `CORS_ORIGINS` is
accepted as a shorter alias for `MCP_CONNECTOR_ALLOWED_ORIGINS`. The Games entry
and root variables are optional when the repository layout is unchanged.
