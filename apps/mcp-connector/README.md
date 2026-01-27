# MCP Connector 🔌

Express.js service for integrating with Model Context Protocol servers.

## Features

- Connect to multiple MCP servers (GitHub, Linear, Notion, etc.)
- Semantic query builder for context retrieval
- Data aggregation and normalization
- Connection pooling and caching
- Authentication management
- RESTful API for frontend consumption

## Development

```bash
pnpm dev
```

Runs on `http://localhost:3001`

## API Endpoints

### MCP Management
- `GET /api/mcp/connections` - List connected MCP servers
- `POST /api/mcp/connect` - Connect to an MCP server
- `DELETE /api/mcp/disconnect/:serverId` - Disconnect from MCP server

### Semantic Queries
- `POST /api/mcp/query` - Execute semantic query across MCPs
- `GET /api/mcp/context/:userId` - Get aggregated user context

## Environment Variables

Create a `.env` file:

```env
PORT=3001
NODE_ENV=development
MCP_CACHE_TTL=3600
```
