# CYOA Engine

Next.js frontend for the MCP Games Choose Your Own Adventure engine.

## Play the demo

A live static demo is deployed here:

**[https://mcp-games-pyqtlryc.devinapps.com](https://mcp-games-pyqtlryc.devinapps.com)**

The demo is a self-contained story called **Activation**. It branches through the three LoveLogic AI flagship projects — Agentic OS, MCP Games, and Quantico AI Agency — and ends with a direct link to each repo.

## Features

- Static-exportable Next.js frontend
- Interactive story interface with choice selection
- Real-time narrative updates
- Shareable game URL
- Foundation for MCP-connected narrative generation

## Development

```bash
# From the monorepo root
npx pnpm@8.12.0 install
npx pnpm@8.12.0 --filter cyoa-engine dev
```

Runs on `http://localhost:3000`.

## Build for static deployment

```bash
npx pnpm@8.12.0 --filter cyoa-engine build
```

This outputs to `apps/cyoa-engine/dist/`, which is ready for any static host.

## Architecture

- **Framework**: Next.js 15 (App Router)
- **State Management**: React `useState` (with Zustand wired for future state)
- **Data Fetching**: TanStack Query (ready for future API integration)
- **Styling**: Tailwind CSS
- **Type Safety**: TypeScript

## Environment Variables

Create a `.env.local` file for local backend development:

```env
MCP_CONNECTOR_URL=http://localhost:3001
NARRATIVE_AI_URL=http://localhost:8000
```

The static demo does not require these to be set.
