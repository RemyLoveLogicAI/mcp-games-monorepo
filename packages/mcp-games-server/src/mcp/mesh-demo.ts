import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import type { RealtimeMeshSessionBlueprint } from '../realtime-mesh/index.js';

const serverEntry = path.resolve(__dirname, '../index.js');

const request = {
  sessionId: 'demo-session-001',
  gameId: 'imagination-enemies',
  hostPlayerId: 'player-pika',
  playerIds: ['player-pika', 'player-echo'],
  preferredRegions: [
    { id: 'lax-edge', label: 'Los Angeles Edge', priority: 0 },
    { id: 'sea-edge', label: 'Seattle Edge', priority: 1 },
  ],
  availableNodes: [
    {
      id: 'lax-orchestrator',
      regionId: 'lax-edge',
      roles: ['signal', 'state'],
      capacityScore: 92,
      observedRttMs: 14,
    },
    {
      id: 'lax-presence',
      regionId: 'lax-edge',
      roles: ['media', 'agent'],
      capacityScore: 88,
      observedRttMs: 18,
    },
    {
      id: 'sea-relay',
      regionId: 'sea-edge',
      roles: ['relay', 'media'],
      capacityScore: 95,
      observedRttMs: 28,
    },
    {
      id: 'den-failover',
      regionId: 'den-edge',
      roles: ['signal', 'relay', 'media', 'agent', 'state'],
      capacityScore: 99,
      observedRttMs: 42,
    },
  ],
  enableVideoToVideo: true,
  enableAvatarAgent: true,
  enableTerminalAccess: false,
  enableSkillPlugins: true,
};

function getText(result: unknown): string {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('content' in result) ||
    !Array.isArray(result.content)
  ) {
    throw new Error('MCP tool returned invalid content');
  }

  const text = result.content.find(
    (item: unknown): item is { type: 'text'; text: string } =>
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      item.type === 'text' &&
      'text' in item &&
      typeof item.text === 'string',
  );
  if (!text) {
    throw new Error('MCP tool returned no text content');
  }

  return text.text;
}

async function run(): Promise<void> {
  const client = new Client({ name: 'mesh-demo', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: {
      ...getDefaultEnvironment(),
      LOG_LEVEL: 'silent',
      MCP_STDIO: '1',
      NODE_ENV: 'test',
      OTEL_SDK_DISABLED: 'true',
    },
    stderr: 'ignore',
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const meshTool = tools.tools.find(({ name }) => name === 'plan_realtime_mesh');
    if (!meshTool) {
      throw new Error('plan_realtime_mesh was not discoverable');
    }
    const requiredIdentityFields = ['sessionId', 'gameId', 'hostPlayerId', 'playerIds'];
    if (!requiredIdentityFields.every((field) => meshTool.inputSchema.required?.includes(field))) {
      throw new Error('mesh tool schema does not require session identity');
    }
    const schemaProperties = meshTool.inputSchema.properties as
      | Record<string, { maxItems?: number }>
      | undefined;
    const collectionLimits = { playerIds: 64, preferredRegions: 32, availableNodes: 256 };
    if (
      !schemaProperties ||
      Object.entries(collectionLimits).some(
        ([field, maxItems]) => schemaProperties[field]?.maxItems !== maxItems,
      )
    ) {
      throw new Error('mesh tool schema does not publish parser collection limits');
    }

    const result = await client.callTool({
      name: 'plan_realtime_mesh',
      arguments: request,
    });
    if (result.isError) {
      throw new Error(`valid mesh request failed: ${getText(result)}`);
    }

    const blueprint = JSON.parse(getText(result)) as RealtimeMeshSessionBlueprint;
    const invalidResult = await client.callTool({
      name: 'plan_realtime_mesh',
      arguments: { ...request, sessionId: '' },
    });
    if (!invalidResult.isError) {
      throw new Error('invalid mesh request was not rejected');
    }

    const assignments = blueprint.topology.roleAssignments
      .map(({ role, nodeId }) => `${role.padEnd(6)} -> ${nodeId}`)
      .join('\n  ');

    console.log(
      [
        'MCP REALTIME MESH // LIVE PROTOCOL PROOF',
        `  discovery   ${tools.tools.length} tools; plan_realtime_mesh READY`,
        `  schema      ${requiredIdentityFields.length} identity fields required`,
        `  limits      ${collectionLimits.playerIds} players; ${collectionLimits.preferredRegions} regions; ${collectionLimits.availableNodes} nodes`,
        `  topology    ${blueprint.topology.status.toUpperCase()} (${blueprint.topology.roleAssignments.length}/5 roles)`,
        `  resilience  ${blueprint.topology.resilience.toUpperCase()} (${blueprint.topology.unprotectedRoles.length} unprotected roles)`,
        `  channels    ${blueprint.channels.length} secure lanes`,
        `  failover    ${blueprint.failoverNodeIds.join(', ') || 'none required'}`,
        `  ${assignments}`,
        '  guardrail    invalid request rejected as MCP error result',
        'PROOF COMPLETE',
      ].join('\n'),
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('MESH PROOF FAILED', error);
  process.exitCode = 1;
});
