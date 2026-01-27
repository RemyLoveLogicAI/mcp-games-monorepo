# MCP SDK 🔌

TypeScript client library for connecting to and querying Model Context Protocol servers.

## Features

- Type-safe MCP server connections
- Semantic query builder with fluent API
- Connection pooling and management
- Automatic retry logic with exponential backoff
- Query result caching
- Error handling and logging

## Usage

```typescript
import { MCPClient, SemanticQueryBuilder } from 'mcp-sdk';

// Initialize client
const client = new MCPClient({
  defaultTimeout: 5000,
  cacheEnabled: true,
});

// Connect to MCP servers
await client.connect('github', {
  serverUrl: 'http://localhost:3000',
  authToken: process.env.GITHUB_TOKEN,
});

// Semantic query
const query = new SemanticQueryBuilder()
  .server('github')
  .query('recent repositories and contributions')
  .filter('timeframe', '30days')
  .maxResults(10)
  .build();

const results = await client.executeQuery(query);
```
