import {
  createRealtimeMeshSessionPlanner,
  parseRealtimeMeshSessionRequest,
} from '../session-blueprint.js';
import type { RealtimeMeshSessionRequest } from '../session-blueprint.js';
import { telemetry } from '../../observability/index.js';

describe('RealtimeMeshSessionPlanner', () => {
  const request: RealtimeMeshSessionRequest = {
    sessionId: 'session-1',
    gameId: 'game-1',
    hostPlayerId: 'player-1',
    playerIds: ['player-1', 'player-2'],
    preferredRegions: [
      {
        id: 'iad',
        label: 'US East',
        priority: 1,
      },
    ],
    availableNodes: [
      {
        id: 'node-a',
        regionId: 'iad',
        roles: ['signal', 'relay', 'state'],
        capacityScore: 90,
        observedRttMs: 24,
      },
      {
        id: 'node-b',
        regionId: 'iad',
        roles: ['media', 'agent'],
        capacityScore: 95,
        observedRttMs: 32,
      },
      {
        id: 'node-c',
        regionId: 'sfo',
        roles: ['media', 'agent', 'relay'],
        capacityScore: 60,
        observedRttMs: 85,
      },
    ],
    enableVideoToVideo: true,
    enableAvatarAgent: true,
    enableTerminalAccess: true,
    enableSkillPlugins: true,
  };

  it('creates a full voice/video/game mesh blueprint', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const blueprint = planner.createBlueprint(request);

    expect(blueprint.sessionId).toBe('session-1');
    expect(blueprint.game.voiceCommandMode).toBe('vad-gated');
    expect(blueprint.game.stateSyncHz).toBe(30);
    expect(blueprint.avatarAgent?.persona).toBe('pika-self-agent');
    expect(blueprint.avatarAgent?.toolAccess).toContain('skill:invoke');
    expect(blueprint.avatarAgent?.toolAccess).toContain('plugin:invoke');
    expect(blueprint.topology.status).toBe('ready');
    expect(blueprint.topology.missingRoles).toEqual([]);
    expect(blueprint.topology.roleAssignments.map(({ role }) => role)).toEqual([
      'signal',
      'relay',
      'media',
      'agent',
      'state',
    ]);

    const channelKinds = blueprint.channels.map((channel) => channel.kind);
    expect(channelKinds).toEqual(
      expect.arrayContaining([
        'game-state',
        'voice',
        'video',
        'avatar-video',
        'terminal',
        'agent-control',
        'skill-bridge',
        'plugin-bridge',
      ]),
    );
  });

  it('keeps media channels under the realtime latency ceiling', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const blueprint = planner.createBlueprint(request);
    const mediaChannels = blueprint.channels.filter(
      (channel) => channel.kind === 'voice' || channel.kind === 'video',
    );

    expect(mediaChannels.length).toBeGreaterThan(0);
    expect(mediaChannels.every((channel) => channel.latency.maxMs <= 180)).toBe(true);
  });

  it.each([
    ['blank session ID', { ...request, sessionId: '' }],
    ['blank game ID', { ...request, gameId: '' }],
    ['empty player list', { ...request, playerIds: [] }],
    ['host missing from player list', { ...request, hostPlayerId: 'missing-player' }],
    [
      'duplicate node IDs',
      {
        ...request,
        availableNodes: [
          request.availableNodes[0],
          { ...request.availableNodes[1], id: request.availableNodes[0].id },
        ],
      },
    ],
    [
      'node without roles',
      {
        ...request,
        availableNodes: [{ ...request.availableNodes[0], roles: [] }],
      },
    ],
  ])('rejects %s', (_label, invalidRequest) => {
    expect(() => parseRealtimeMeshSessionRequest(invalidRequest)).toThrow();
  });

  it('validates direct planner calls at runtime', () => {
    const invalidRequest = { ...request, sessionId: '' } as RealtimeMeshSessionRequest;

    expect(() => createRealtimeMeshSessionPlanner().createBlueprint(invalidRequest)).toThrow();
  });

  it.each([
    [
      'more than 64 players',
      {
        ...request,
        hostPlayerId: 'player-0',
        playerIds: Array.from({ length: 65 }, (_, index) => `player-${index}`),
      },
    ],
    [
      'more than 32 preferred regions',
      {
        ...request,
        preferredRegions: Array.from({ length: 33 }, (_, index) => ({
          id: `region-${index}`,
          label: `Region ${index}`,
          priority: index,
        })),
      },
    ],
    [
      'more than 256 available nodes',
      {
        ...request,
        availableNodes: Array.from({ length: 257 }, (_, index) => ({
          id: `node-${index}`,
          regionId: 'iad',
          roles: ['signal'] as const,
          capacityScore: 1,
        })),
      },
    ],
    ['duplicate player IDs', { ...request, playerIds: ['player-1', 'player-1'] }],
    [
      'duplicate preferred-region IDs',
      {
        ...request,
        preferredRegions: [request.preferredRegions[0], request.preferredRegions[0]],
      },
    ],
  ])('rejects %s', (_label, invalidRequest) => {
    expect(() => parseRealtimeMeshSessionRequest(invalidRequest)).toThrow();
  });

  it('uses preferred regions before capacity and RTT tie-breakers', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const blueprint = planner.createBlueprint({
      ...request,
      availableNodes: [
        {
          id: 'preferred-slower',
          regionId: 'iad',
          roles: ['agent'],
          capacityScore: 80,
          observedRttMs: 40,
        },
        {
          id: 'preferred-faster',
          regionId: 'iad',
          roles: ['agent'],
          capacityScore: 80,
          observedRttMs: 20,
        },
        {
          id: 'remote-capacity',
          regionId: 'sfo',
          roles: ['agent'],
          capacityScore: 500,
          observedRttMs: 5,
        },
        {
          id: 'foundation',
          regionId: 'iad',
          roles: ['signal', 'relay', 'media', 'state'],
          capacityScore: 70,
        },
      ],
    });

    expect(blueprint.topology.roleAssignments.find(({ role }) => role === 'agent')?.nodeId).toBe(
      'preferred-faster',
    );
  });

  it('reports degraded topology instead of pretending missing roles are ready', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const blueprint = planner.createBlueprint({
      ...request,
      availableNodes: [
        {
          id: 'signal-only',
          regionId: 'iad',
          roles: ['signal'],
          capacityScore: 100,
        },
      ],
    });

    expect(blueprint.topology.status).toBe('degraded');
    expect(blueprint.topology.missingRoles).toEqual(['relay', 'media', 'agent', 'state']);
  });

  it('creates deterministic selections and failover ordering', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const first = planner.createBlueprint(request);
    const second = planner.createBlueprint(request);

    expect(first.selectedNodes.map(({ id }) => id)).toEqual(
      second.selectedNodes.map(({ id }) => id),
    );
    expect(first.failoverNodeIds).toEqual(second.failoverNodeIds);
    expect(first.failoverNodeIds).not.toEqual(
      expect.arrayContaining(first.selectedNodes.map(({ id }) => id)),
    );
  });

  it('creates deterministic role-aware failover routes', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const first = planner.createBlueprint(request);
    const second = planner.createBlueprint(request);

    expect(first.topology.failoverRoutes).toEqual(second.topology.failoverRoutes);
    expect(first.topology.failoverRoutes.map(({ role }) => role)).toEqual([
      'signal',
      'relay',
      'media',
      'agent',
      'state',
    ]);

    for (const route of first.topology.failoverRoutes) {
      expect(route.failoverNodeIds).not.toContain(route.primaryNodeId);
      expect(
        route.failoverNodeIds.every((nodeId) =>
          request.availableNodes.find(({ id }) => id === nodeId)?.roles.includes(route.role),
        ),
      ).toBe(true);
    }
  });

  it('separates ready topology from at-risk failover resilience', () => {
    const blueprint = createRealtimeMeshSessionPlanner().createBlueprint({
      ...request,
      availableNodes: [
        {
          id: 'only-node',
          regionId: 'iad',
          roles: ['signal', 'relay', 'media', 'agent', 'state'],
          capacityScore: 100,
        },
      ],
    });

    expect(blueprint.topology.status).toBe('ready');
    expect(blueprint.topology.resilience).toBe('at-risk');
    expect(blueprint.topology.unprotectedRoles).toEqual([
      'signal',
      'relay',
      'media',
      'agent',
      'state',
    ]);
  });

  it('omits optional channels when every feature gate is disabled', () => {
    const planner = createRealtimeMeshSessionPlanner();
    const blueprint = planner.createBlueprint({
      ...request,
      enableVideoToVideo: false,
      enableAvatarAgent: false,
      enableTerminalAccess: false,
      enableSkillPlugins: false,
    });

    expect(blueprint.channels.map(({ kind }) => kind)).toEqual([
      'game-state',
      'voice',
      'agent-control',
    ]);
    expect(blueprint.avatarAgent).toBeNull();
  });

  it('keeps base channel permissions least-authority and exact', () => {
    const blueprint = createRealtimeMeshSessionPlanner().createBlueprint({
      ...request,
      enableVideoToVideo: false,
      enableAvatarAgent: false,
      enableTerminalAccess: false,
      enableSkillPlugins: false,
    });

    expect(
      Object.fromEntries(blueprint.channels.map(({ kind, permissions }) => [kind, permissions])),
    ).toEqual({
      'game-state': ['game:read', 'game:write'],
      voice: ['voice:transcribe', 'voice:command'],
      'agent-control': ['agent:delegate'],
    });
  });

  it('emits readiness in blueprint telemetry', () => {
    const emit = jest.spyOn(telemetry, 'emit').mockImplementation(() => undefined);

    createRealtimeMeshSessionPlanner().createBlueprint(request);

    expect(emit).toHaveBeenCalledWith(
      'realtime_mesh:blueprint_created',
      expect.objectContaining({ topologyStatus: 'ready', missingRoles: [] }),
    );
    emit.mockRestore();
  });
});
