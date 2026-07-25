FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mcp-connector... build
RUN pnpm --filter @omnigents/mcp-games-server... build
RUN pnpm deploy --filter mcp-connector --prod /runtime/connector
RUN pnpm deploy --filter @omnigents/mcp-games-server --prod /runtime/games-server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV MCP_GAMES_SERVER_ENTRY=/app/games-server/dist/index.js
ENV MCP_GAMES_ROOT=/app/games
ENV MCP_GAMES_WORKDIR=/app
ENV DEFAULT_GAME_PATH=/app/games/morning-decision.yaml
WORKDIR /app/connector
COPY --from=build /runtime/connector ./
COPY --from=build /runtime/games-server /app/games-server
COPY --from=build /app/games /app/games
EXPOSE 3001
CMD ["node", "dist/index.js"]
