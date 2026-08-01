# Production MCP Connector

The production boundary is a Railway-hosted connector plus the OpenAI Sites
worker. Browsers call the same-origin `/api/connector` proxy. The worker adds a
secret bearer token; the connector validates that credential and the opaque
`x-mcp-actor-id` before any `/api` request reaches the MCP stdio runtime.

## Required production values

Connector service:

```env
NODE_ENV=production
MCP_CONNECTOR_AUTH_TOKEN=<at least 32 random characters>
MCP_CONNECTOR_ALLOWED_ORIGINS=https://mcp-games-command-center.lovelogic-ai.chatgpt.site
MCP_GAMES_FLAGSHIP_URL=https://mcp-games-command-center.lovelogic-ai.chatgpt.site
```

Sites runtime:

```env
MCP_CONNECTOR_URL=https://<connector-domain>
MCP_CONNECTOR_AUTH_TOKEN=<the same secret bearer token>
```

The bearer token is never stored in a `NEXT_PUBLIC_*` variable. The browser
supplies only a device-local opaque actor ID. The Sites worker removes cookies,
sets the single production `Origin`, and forwards only health, start-session,
and choice routes.

## Health contract

- `GET /health` is process liveness. It does not claim that MCP execution works.
- `GET /ready` calls the real `health_check` tool over stdio. It returns HTTP 503
  when the required Games process cannot answer.
- Railway deploys use `/ready`, so an image cannot become active on process-only
  health.

## Deploy and verify

The repository's `railway.json` selects the connector Dockerfile, `/ready`, and
graceful overlap/draining. After setting the connector variables and generating
a Railway domain, update the two Sites runtime values and deploy the exact saved
site version.

Current production connector:

```text
https://mcp-games-connector-production.up.railway.app
```

Run the canary with secrets in the environment, never as command arguments:

```bash
MCP_CONNECTOR_URL=https://<connector-domain> \
MCP_GAMES_FLAGSHIP_URL=https://mcp-games-command-center.lovelogic-ai.chatgpt.site \
MCP_CONNECTOR_AUTH_TOKEN=<secret> \
node scripts/canary-production-connector.mjs
```

The canary fails unless all of these are true:

1. liveness and real dependency readiness pass;
2. the flagship CORS preflight is allowed and a foreign origin is rejected;
3. `start_game` returns a real session, at least one real choice, and a completed
   stdio receipt;
4. `make_choice` advances that same session and returns its own completed stdio
   receipt.

## Rollback

Keep the previous connector deployment ID and previous Sites version ID in the
release record before publishing.

1. In Railway, open the connector service's **Deployments** tab, choose the last
   known-good deployment, and select **Rollback**. Railway restores that
   deployment's image and variables. If it has aged out of rollback retention,
   redeploy the corresponding Git commit instead.
2. In Sites, deploy the last known-good saved version. Site versions and
   connector deployments are independent; roll back both when the proxy contract
   changed.
3. Re-run the production canary against the restored connector, then perform one
   start and choice from the live Sites URL.
4. If the credential may be compromised, rotate it in Railway and Sites as one
   change, deploy both surfaces, and invalidate the old value only after the new
   canary passes.

Do not point the frontend at an unauthenticated connector as a rollback shortcut.
