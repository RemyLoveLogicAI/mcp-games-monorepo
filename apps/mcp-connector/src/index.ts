import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'mcp-connector' });
});

// MCP Connections
app.get('/api/mcp/connections', (_req: Request, res: Response) => {
  res.json({
    connections: [
      { id: 'github', name: 'GitHub', status: 'disconnected' },
      { id: 'linear', name: 'Linear', status: 'disconnected' },
      { id: 'notion', name: 'Notion', status: 'disconnected' },
    ],
  });
});

// Semantic query endpoint
app.post('/api/mcp/query', async (req: Request, res: Response) => {
  const { server, query, filters } = req.body;
  
  // TODO: Implement actual MCP querying
  res.json({
    server,
    query,
    filters,
    results: [],
    message: 'MCP query endpoint - implementation pending',
  });
});

// User context aggregation
app.get('/api/mcp/context/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  // TODO: Implement context aggregation from multiple MCPs
  res.json({
    userId,
    context: {},
    message: 'Context aggregation endpoint - implementation pending',
  });
});

app.listen(port, () => {
  console.log(`🔌 MCP Connector running on port ${port}`);
});
