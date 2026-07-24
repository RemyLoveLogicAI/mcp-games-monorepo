FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mcp-connector... build
RUN pnpm deploy --filter mcp-connector --prod /runtime

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /runtime ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
