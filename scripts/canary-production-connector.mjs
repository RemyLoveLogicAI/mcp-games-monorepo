#!/usr/bin/env node

const connectorUrl = process.env.MCP_CONNECTOR_URL?.replace(/\/$/, '');
const authToken = process.env.MCP_CONNECTOR_AUTH_TOKEN;
const flagshipOrigin = process.env.MCP_GAMES_FLAGSHIP_URL;

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(response, label) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (!isObject(payload)) throw new Error(`${label} did not return a JSON object.`);
  return payload;
}

function assertReceipt(receipt, tool) {
  if (
    !isObject(receipt) ||
    receipt.tool !== tool ||
    receipt.status !== 'completed' ||
    receipt.source !== 'mcp-games-server' ||
    receipt.transport !== 'stdio' ||
    typeof receipt.id !== 'string' ||
    !receipt.id.startsWith('exec_')
  ) {
    throw new Error(`${tool} did not return a real completed stdio execution receipt.`);
  }
}

async function main() {
  const baseUrl = requireValue(connectorUrl, 'MCP_CONNECTOR_URL');
  const token = requireValue(authToken, 'MCP_CONNECTOR_AUTH_TOKEN');
  const origin = requireValue(flagshipOrigin, 'MCP_GAMES_FLAGSHIP_URL');
  const actorId = `canary:${crypto.randomUUID()}`;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-mcp-actor-id': actorId,
  };

  const liveness = await readJson(await fetch(`${baseUrl}/health`), 'liveness');
  if (liveness.status !== 'healthy') throw new Error('Connector liveness is not healthy.');

  const readiness = await readJson(await fetch(`${baseUrl}/ready`), 'readiness');
  if (
    readiness.status !== 'ready' ||
    !isObject(readiness.games) ||
    readiness.games.required !== true ||
    !isObject(readiness.games.server)
  ) {
    throw new Error('Readiness did not prove the required MCP Games dependency.');
  }

  const allowedPreflight = await fetch(`${baseUrl}/api/games/sessions`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,x-mcp-actor-id',
    },
  });
  if (
    !allowedPreflight.ok ||
    allowedPreflight.headers.get('access-control-allow-origin') !== new URL(origin).origin
  ) {
    throw new Error('The flagship origin did not pass the connector CORS preflight.');
  }

  const deniedPreflight = await fetch(`${baseUrl}/api/games/sessions`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://not-the-flagship.invalid',
      'access-control-request-method': 'POST',
    },
  });
  if (deniedPreflight.status !== 403) {
    throw new Error('A non-flagship origin was not rejected by CORS.');
  }

  const started = await readJson(
    await fetch(`${baseUrl}/api/games/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ playerId: actorId }),
    }),
    'start_game',
  );
  assertReceipt(started.receipt, 'start_game');
  if (
    !isObject(started.session) ||
    typeof started.session.sessionId !== 'string' ||
    typeof started.session.gameId !== 'string' ||
    typeof started.session.sceneId !== 'string' ||
    !Array.isArray(started.session.choices) ||
    started.session.choices.length === 0 ||
    !isObject(started.session.choices[0]) ||
    typeof started.session.choices[0].id !== 'string'
  ) {
    throw new Error('start_game returned an incomplete session or no executable choice.');
  }

  const sessionId = started.session.sessionId;
  const initialSceneId = started.session.sceneId;
  const choiceId = started.session.choices[0].id;
  const chosen = await readJson(
    await fetch(`${baseUrl}/api/games/sessions/${encodeURIComponent(sessionId)}/choices`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ choiceId }),
    }),
    'make_choice',
  );
  assertReceipt(chosen.receipt, 'make_choice');
  if (
    !isObject(chosen.turn) ||
    chosen.turn.sessionId !== sessionId ||
    typeof chosen.turn.sceneId !== 'string' ||
    chosen.turn.sceneId === initialSceneId
  ) {
    throw new Error('make_choice did not advance the same real MCP game session.');
  }

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        connectorUrl: baseUrl,
        liveness: liveness.status,
        readiness: readiness.status,
        cors: 'flagship-only',
        gameId: started.session.gameId,
        sessionId,
        choiceId,
        fromSceneId: initialSceneId,
        toSceneId: chosen.turn.sceneId,
        receipts: [started.receipt.id, chosen.receipt.id],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
