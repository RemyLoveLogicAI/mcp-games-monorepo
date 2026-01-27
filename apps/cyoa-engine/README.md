# CYOA Engine 🎮

Next.js frontend application for the Choose Your Own Adventure engine.

## Features

- Interactive story interface with choice selection
- Real-time narrative updates
- MCP connection management
- User profile and preferences
- Save/load game states
- Progress tracking

## Development

```bash
pnpm dev
```

Runs on `http://localhost:3000`

## Architecture

- **Framework**: Next.js 14 (App Router)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Styling**: Tailwind CSS
- **Type Safety**: TypeScript with shared-types package

## Environment Variables

Create a `.env.local` file:

```env
MCP_CONNECTOR_URL=http://localhost:3001
NARRATIVE_AI_URL=http://localhost:8000
```
