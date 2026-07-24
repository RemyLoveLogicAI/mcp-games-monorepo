FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @omnigents/mcp-games-server... build
RUN pnpm deploy --filter @omnigents/mcp-games-server --prod /runtime

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /runtime ./
COPY --from=build /app/games ./games
EXPOSE 3000
CMD ["node", "dist/index.js"]
