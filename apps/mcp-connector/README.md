# MCP Connector 🔌

Express.js boundary between the flagship MCP Games website and Model Context
Protocol services.

## Features

- Browser-safe health and readiness discovery
- Runtime connection management for Games, GitHub, Linear, and Notion
- Validated semantic-query and user-context response contracts
- Configurable CORS allowlist for the flagship website

The local client currently manages connection state and stable query contracts.
Remote transport adapters and context aggregation remain follow-up work.

## Development

```bash
cp .env.example .env
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

### Semantic Queries
- `POST /api/mcp/query` - Execute semantic query across MCPs
- `GET /api/mcp/context/:userId` - Get aggregated user context

## Environment Variables

Create a `.env` file:

```env
PORT=3001
NODE_ENV=development
MCP_CONNECTOR_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

`MCP_CONNECTOR_PORT` may be used instead of `PORT`, and `CORS_ORIGINS` is
accepted as a shorter alias for `MCP_CONNECTOR_ALLOWED_ORIGINS`.
