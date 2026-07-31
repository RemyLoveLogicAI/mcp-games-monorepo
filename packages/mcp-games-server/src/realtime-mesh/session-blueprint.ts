import { telemetry } from '../observability/index.js';
import { z } from 'zod';

export type RealtimeChannelKind =
  | 'game-state'
  | 'voice'
  | 'video'
  | 'avatar-video'
  | 'terminal'
  | 'agent-control'
  | 'skill-bridge'
  | 'plugin-bridge';

export type RealtimeTransport = 'webrtc' | 'webtransport' | 'websocket' | 'mcp';

export type PermissionScope =
  | 'game:read'
  | 'game:write'
  | 'voice:transcribe'
  | 'voice:command'
  | 'video:read'
  | 'video:render-avatar'
  | 'terminal:read'
  | 'terminal:write'
  | 'skill:invoke'
  | 'plugin:invoke'
  | 'agent:delegate';

export interface LatencyBudget {
  targetMs: number;
  maxMs: number;
  jitterBufferMs: number;
}

export interface MeshRegion {
  id: string;
  label: string;
  priority: number;
}

export interface MeshNode {
  id: string;
  regionId: string;
  roles: MeshRole[];
  capacityScore: number;
  observedRttMs?: number;
}

export type MeshRole = 'signal' | 'relay' | 'media' | 'agent' | 'state';

export interface MeshRoleAssignment {
  role: MeshRole;
  nodeId: string;
  regionId: string;
  score: number;
}

export interface MeshFailoverRoute {
  role: MeshRole;
  primaryNodeId: string | null;
  failoverNodeIds: string[];
}

export interface MeshTopologyReadiness {
  status: 'ready' | 'degraded';
  resilience: 'resilient' | 'at-risk' | 'unavailable';
  missingRoles: MeshRole[];
  unprotectedRoles: MeshRole[];
  roleAssignments: MeshRoleAssignment[];
  failoverRoutes: MeshFailoverRoute[];
}

export interface RealtimeChannelPlan {
  id: string;
  kind: RealtimeChannelKind;
  transport: RealtimeTransport;
  ordered: boolean;
  reliable: boolean;
  latency: LatencyBudget;
  permissions: PermissionScope[];
}

export interface AvatarAgentPlan {
  agentId: string;
  displayName: string;
  persona: 'pika-self-agent' | 'guide' | 'npc' | 'operator';
  videoMode: 'video-to-video' | 'avatar-render' | 'audio-reactive';
  toolAccess: PermissionScope[];
}

export interface GameIntegrationPlan {
  gameId: string;
  sessionId: string;
  voiceCommandMode: 'push-to-talk' | 'vad-gated' | 'always-on';
  stateSyncHz: number;
  maxPlayers: number;
}

export interface RealtimeMeshSessionRequest {
  sessionId: string;
  gameId: string;
  hostPlayerId: string;
  playerIds: string[];
  preferredRegions: MeshRegion[];
  availableNodes: MeshNode[];
  enableVideoToVideo: boolean;
  enableAvatarAgent: boolean;
  enableTerminalAccess: boolean;
  enableSkillPlugins: boolean;
}

export interface RealtimeMeshSessionBlueprint {
  sessionId: string;
  game: GameIntegrationPlan;
  topology: MeshTopologyReadiness;
  selectedNodes: MeshNode[];
  channels: RealtimeChannelPlan[];
  avatarAgent: AvatarAgentPlan | null;
  failoverNodeIds: string[];
  createdAt: string;
}

const meshRoleSchema = z.enum(['signal', 'relay', 'media', 'agent', 'state']);

const meshRegionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  priority: z.number().int().nonnegative(),
});

const meshNodeSchema = z.object({
  id: z.string().trim().min(1),
  regionId: z.string().trim().min(1),
  roles: z.array(meshRoleSchema).min(1),
  capacityScore: z.number().finite().nonnegative(),
  observedRttMs: z.number().finite().nonnegative().optional(),
});

export const realtimeMeshSessionRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    gameId: z.string().trim().min(1),
    hostPlayerId: z.string().trim().min(1),
    playerIds: z.array(z.string().trim().min(1)).min(1).max(64),
    preferredRegions: z.array(meshRegionSchema).max(32),
    availableNodes: z.array(meshNodeSchema).min(1).max(256),
    enableVideoToVideo: z.boolean(),
    enableAvatarAgent: z.boolean(),
    enableTerminalAccess: z.boolean(),
    enableSkillPlugins: z.boolean(),
  })
  .superRefine((request, context) => {
    if (!request.playerIds.includes(request.hostPlayerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hostPlayerId'],
        message: 'hostPlayerId must be included in playerIds',
      });
    }

    if (new Set(request.playerIds).size !== request.playerIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerIds'],
        message: 'playerIds must be unique',
      });
    }

    const regionIds = request.preferredRegions.map((region) => region.id);
    if (new Set(regionIds).size !== regionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferredRegions'],
        message: 'preferredRegions must use unique region IDs',
      });
    }

    const nodeIds = request.availableNodes.map((node) => node.id);
    if (new Set(nodeIds).size !== nodeIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['availableNodes'],
        message: 'availableNodes must use unique node IDs',
      });
    }
  });

export function parseRealtimeMeshSessionRequest(value: unknown): RealtimeMeshSessionRequest {
  return realtimeMeshSessionRequestSchema.parse(value);
}

const LOW_LATENCY: LatencyBudget = {
  targetMs: 50,
  maxMs: 120,
  jitterBufferMs: 20,
};

const MEDIA_LATENCY: LatencyBudget = {
  targetMs: 80,
  maxMs: 180,
  jitterBufferMs: 40,
};

const CONTROL_LATENCY: LatencyBudget = {
  targetMs: 120,
  maxMs: 300,
  jitterBufferMs: 0,
};

const REQUIRED_ROLES: MeshRole[] = ['signal', 'relay', 'media', 'agent', 'state'];

export class RealtimeMeshSessionPlanner {
  createBlueprint(request: RealtimeMeshSessionRequest): RealtimeMeshSessionBlueprint {
    const validatedRequest = parseRealtimeMeshSessionRequest(request);
    const roleAssignments = this.assignRoles(validatedRequest);
    const selectedNodeIds = new Set(roleAssignments.map((assignment) => assignment.nodeId));
    const selectedNodes = validatedRequest.availableNodes.filter((node) =>
      selectedNodeIds.has(node.id),
    );
    const assignedRoles = new Set(roleAssignments.map((assignment) => assignment.role));
    const missingRoles = REQUIRED_ROLES.filter((role) => !assignedRoles.has(role));
    const failoverRoutes = this.createFailoverRoutes(validatedRequest, roleAssignments);
    const unprotectedRoles = failoverRoutes
      .filter((route) => route.failoverNodeIds.length === 0)
      .map((route) => route.role);
    const topology: MeshTopologyReadiness = {
      status: missingRoles.length === 0 ? 'ready' : 'degraded',
      resilience:
        missingRoles.length > 0
          ? 'unavailable'
          : unprotectedRoles.length === 0
            ? 'resilient'
            : 'at-risk',
      missingRoles,
      unprotectedRoles,
      roleAssignments,
      failoverRoutes,
    };
    const channels = this.createChannels(validatedRequest);
    const avatarAgent = validatedRequest.enableAvatarAgent
      ? this.createAvatarAgentPlan(validatedRequest)
      : null;

    const blueprint: RealtimeMeshSessionBlueprint = {
      sessionId: validatedRequest.sessionId,
      game: {
        gameId: validatedRequest.gameId,
        sessionId: validatedRequest.sessionId,
        voiceCommandMode: 'vad-gated',
        stateSyncHz: 30,
        maxPlayers: validatedRequest.playerIds.length,
      },
      topology,
      selectedNodes,
      channels,
      avatarAgent,
      failoverNodeIds: validatedRequest.availableNodes
        .filter((node) => !selectedNodeIds.has(node.id))
        .sort((a, b) => this.compareNodes(a, b, validatedRequest.preferredRegions))
        .slice(0, 3)
        .map((node) => node.id),
      createdAt: new Date().toISOString(),
    };

    telemetry.emit('realtime_mesh:blueprint_created', {
      sessionId: validatedRequest.sessionId,
      channelCount: blueprint.channels.length,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      avatarEnabled: Boolean(avatarAgent),
      topologyStatus: topology.status,
      resilience: topology.resilience,
      missingRoles,
      unprotectedRoles,
    });

    return blueprint;
  }

  private assignRoles(request: RealtimeMeshSessionRequest): MeshRoleAssignment[] {
    return REQUIRED_ROLES.map((role) => {
      const node = request.availableNodes
        .filter((node) => node.roles.includes(role))
        .sort((a, b) => this.compareNodes(a, b, request.preferredRegions))[0];

      if (!node) {
        return null;
      }

      return {
        role,
        nodeId: node.id,
        regionId: node.regionId,
        score: this.scoreNode(node, request.preferredRegions),
      };
    }).filter((assignment): assignment is MeshRoleAssignment => assignment !== null);
  }

  private createFailoverRoutes(
    request: RealtimeMeshSessionRequest,
    roleAssignments: MeshRoleAssignment[],
  ): MeshFailoverRoute[] {
    const primaryByRole = new Map(
      roleAssignments.map((assignment) => [assignment.role, assignment.nodeId]),
    );

    return REQUIRED_ROLES.map((role) => {
      const primaryNodeId = primaryByRole.get(role) ?? null;
      const failoverNodeIds = request.availableNodes
        .filter((node) => node.id !== primaryNodeId && node.roles.includes(role))
        .sort((a, b) => this.compareNodes(a, b, request.preferredRegions))
        .slice(0, 3)
        .map((node) => node.id);

      return { role, primaryNodeId, failoverNodeIds };
    });
  }

  private compareNodes(left: MeshNode, right: MeshNode, preferredRegions: MeshRegion[]): number {
    const scoreDelta =
      this.scoreNode(right, preferredRegions) - this.scoreNode(left, preferredRegions);

    return scoreDelta || left.id.localeCompare(right.id);
  }

  private scoreNode(node: MeshNode, preferredRegions: MeshRegion[]): number {
    const region = preferredRegions.find((item) => item.id === node.regionId);
    const regionBonus = region ? 1_000 - region.priority : 0;
    const rttPenalty = (node.observedRttMs ?? 0) / 10;
    return Number((regionBonus + node.capacityScore - rttPenalty).toFixed(2));
  }

  private createChannels(request: RealtimeMeshSessionRequest): RealtimeChannelPlan[] {
    const channels: RealtimeChannelPlan[] = [
      {
        id: `${request.sessionId}:game-state`,
        kind: 'game-state',
        transport: 'webtransport',
        ordered: true,
        reliable: true,
        latency: LOW_LATENCY,
        permissions: ['game:read', 'game:write'],
      },
      {
        id: `${request.sessionId}:voice`,
        kind: 'voice',
        transport: 'webrtc',
        ordered: false,
        reliable: false,
        latency: LOW_LATENCY,
        permissions: ['voice:transcribe', 'voice:command'],
      },
      {
        id: `${request.sessionId}:agent-control`,
        kind: 'agent-control',
        transport: 'mcp',
        ordered: true,
        reliable: true,
        latency: CONTROL_LATENCY,
        permissions: ['agent:delegate'],
      },
    ];

    if (request.enableVideoToVideo) {
      channels.push({
        id: `${request.sessionId}:video`,
        kind: 'video',
        transport: 'webrtc',
        ordered: false,
        reliable: false,
        latency: MEDIA_LATENCY,
        permissions: ['video:read'],
      });
    }

    if (request.enableAvatarAgent) {
      channels.push({
        id: `${request.sessionId}:avatar-video`,
        kind: 'avatar-video',
        transport: 'webrtc',
        ordered: false,
        reliable: false,
        latency: MEDIA_LATENCY,
        permissions: ['video:render-avatar', 'agent:delegate'],
      });
    }

    if (request.enableTerminalAccess) {
      channels.push({
        id: `${request.sessionId}:terminal`,
        kind: 'terminal',
        transport: 'websocket',
        ordered: true,
        reliable: true,
        latency: CONTROL_LATENCY,
        permissions: ['terminal:read', 'terminal:write'],
      });
    }

    if (request.enableSkillPlugins) {
      channels.push(
        {
          id: `${request.sessionId}:skill-bridge`,
          kind: 'skill-bridge',
          transport: 'mcp',
          ordered: true,
          reliable: true,
          latency: CONTROL_LATENCY,
          permissions: ['skill:invoke'],
        },
        {
          id: `${request.sessionId}:plugin-bridge`,
          kind: 'plugin-bridge',
          transport: 'mcp',
          ordered: true,
          reliable: true,
          latency: CONTROL_LATENCY,
          permissions: ['plugin:invoke'],
        },
      );
    }

    return channels;
  }

  private createAvatarAgentPlan(request: RealtimeMeshSessionRequest): AvatarAgentPlan {
    const toolAccess: PermissionScope[] = [
      'game:read',
      'voice:transcribe',
      'voice:command',
      'video:render-avatar',
      'agent:delegate',
    ];

    if (request.enableTerminalAccess) {
      toolAccess.push('terminal:read');
    }

    if (request.enableSkillPlugins) {
      toolAccess.push('skill:invoke', 'plugin:invoke');
    }

    return {
      agentId: `${request.sessionId}:pika-self-agent`,
      displayName: 'Pika Self Agent',
      persona: 'pika-self-agent',
      videoMode: request.enableVideoToVideo ? 'video-to-video' : 'avatar-render',
      toolAccess,
    };
  }
}

export function createRealtimeMeshSessionPlanner(): RealtimeMeshSessionPlanner {
  return new RealtimeMeshSessionPlanner();
}
