/**
 * Game API Routes - Main game state management endpoints
 *
 * POST /api/game - Start a new game or load existing
 * GET /api/game - Get current game state
 */

import { NextRequest, NextResponse } from 'next/server';
import { GameStateMachine, createGameStateMachine, createInMemorySaveManager } from 'story-engine';
import type { Story, APIResponse, GameState, StateMachineState } from 'shared-types';

// In-memory store for active game sessions
// In production, use Redis or similar for session management
const activeSessions = new Map<string, GameStateMachine>();
const saveManager = createInMemorySaveManager();

// Demo story for development - in production, load from database
const demoStory: Story = {
  id: 'demo-story',
  title: 'The Developer\'s Quest',
  description: 'An interactive adventure through the world of software development',
  scenes: [
    {
      id: 'scene-1',
      narrative: 'You wake up to find your terminal blinking with an urgent message. A critical bug has been discovered in production. The entire engineering team is looking to you for guidance.',
      choices: [
        {
          id: 'choice-1-investigate',
          text: 'Investigate the logs immediately',
          nextSceneId: 'scene-2-logs',
          effects: [
            { variable: 'technical_skill', operation: 'increment', value: 1 }
          ]
        },
        {
          id: 'choice-1-alert',
          text: 'Alert the team and gather everyone for an emergency meeting',
          nextSceneId: 'scene-2-meeting',
          effects: [
            { variable: 'leadership', operation: 'increment', value: 1 }
          ]
        },
        {
          id: 'choice-1-coffee',
          text: 'Get coffee first - you need to think clearly',
          nextSceneId: 'scene-2-coffee',
          effects: [
            { variable: 'wisdom', operation: 'increment', value: 1 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-2-logs',
      narrative: 'You dive into the logs and discover a pattern - the error occurs every time a user with special characters in their name tries to save their profile. Classic SQL injection vector, but wait... the error message reveals something more sinister.',
      choices: [
        {
          id: 'choice-2-logs-fix',
          text: 'Deploy a hotfix immediately',
          nextSceneId: 'scene-3-hotfix',
          effects: [
            { variable: 'technical_skill', operation: 'increment', value: 2 },
            { variable: 'reputation', operation: 'increment', value: 1 }
          ]
        },
        {
          id: 'choice-2-logs-investigate',
          text: 'Investigate the sinister discovery further',
          nextSceneId: 'scene-3-mystery',
          effects: [
            { variable: 'curiosity', operation: 'increment', value: 2 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-2-meeting',
      narrative: 'Your team gathers in the war room. The senior architect looks worried, the junior dev is panicking, and the product manager is already on a call with the CEO.',
      choices: [
        {
          id: 'choice-2-meeting-delegate',
          text: 'Delegate tasks and create a rapid response plan',
          nextSceneId: 'scene-3-teamwork',
          effects: [
            { variable: 'leadership', operation: 'increment', value: 2 }
          ]
        },
        {
          id: 'choice-2-meeting-solo',
          text: 'Take charge and start debugging yourself',
          nextSceneId: 'scene-2-logs',
          effects: [
            { variable: 'independence', operation: 'increment', value: 1 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-2-coffee',
      narrative: 'While making your coffee, you overhear two colleagues discussing something about a "hidden endpoint" they discovered during a security audit. This might be related...',
      choices: [
        {
          id: 'choice-2-coffee-listen',
          text: 'Casually join the conversation',
          nextSceneId: 'scene-3-mystery',
          effects: [
            { variable: 'social_engineering', operation: 'increment', value: 1 }
          ]
        },
        {
          id: 'choice-2-coffee-focus',
          text: 'Focus on the task - back to debugging',
          nextSceneId: 'scene-2-logs',
          effects: [
            { variable: 'focus', operation: 'increment', value: 1 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-3-hotfix',
      narrative: 'Your hotfix is deployed and the immediate crisis is averted. The team celebrates, but you can\'t shake the feeling that there\'s more to this story.',
      choices: [
        {
          id: 'choice-3-hotfix-relax',
          text: 'Accept the win and document the fix',
          nextSceneId: 'scene-ending-good',
          effects: [
            { variable: 'reputation', operation: 'increment', value: 2 }
          ]
        },
        {
          id: 'choice-3-hotfix-dig',
          text: 'Something feels off - investigate deeper',
          nextSceneId: 'scene-3-mystery',
          effects: [
            { variable: 'curiosity', operation: 'increment', value: 1 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-3-teamwork',
      narrative: 'Working together, the team identifies and fixes the bug in record time. Your leadership is noted by management.',
      choices: [
        {
          id: 'choice-3-team-celebrate',
          text: 'Celebrate with the team',
          nextSceneId: 'scene-ending-good',
          effects: [
            { variable: 'team_morale', operation: 'increment', value: 3 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-3-mystery',
      narrative: 'Your investigation leads to a shocking discovery - someone has been testing the security of your application from the inside. The trail of breadcrumbs leads to an internal IP address.',
      choices: [
        {
          id: 'choice-3-mystery-report',
          text: 'Report to security immediately',
          nextSceneId: 'scene-ending-secure',
          effects: [
            { variable: 'integrity', operation: 'increment', value: 3 }
          ]
        },
        {
          id: 'choice-3-mystery-confront',
          text: 'Investigate the IP address yourself',
          nextSceneId: 'scene-ending-hero',
          effects: [
            { variable: 'bravery', operation: 'increment', value: 3 }
          ]
        }
      ],
      consequences: []
    },
    {
      id: 'scene-ending-good',
      narrative: 'You saved the day and the company. Your fix is now part of the security guidelines. Life goes on, but you\'ve made your mark.',
      choices: [],
      consequences: []
    },
    {
      id: 'scene-ending-secure',
      narrative: 'The security team uncovers an unauthorized penetration test by a well-meaning but misguided engineer. Policies are updated, and you\'re recognized for following protocol.',
      choices: [],
      consequences: []
    },
    {
      id: 'scene-ending-hero',
      narrative: 'You discover that it was actually the security team running authorized tests - but they\'re impressed by your detective skills. You\'re offered a position on the security team!',
      choices: [],
      consequences: []
    }
  ],
  variables: {
    technical_skill: 0,
    leadership: 0,
    wisdom: 0,
    curiosity: 0,
    reputation: 0,
    independence: 0,
    social_engineering: 0,
    focus: 0,
    team_morale: 0,
    integrity: 0,
    bravery: 0
  },
  metadata: {
    author: 'MCP Games',
    version: '1.0.0',
    tags: ['adventure', 'tech', 'debugging'],
    mcpIntegrations: ['github', 'linear'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create a game session
 */
function getOrCreateSession(sessionId: string | null, userId: string): { session: GameStateMachine; sessionId: string } {
  if (sessionId && activeSessions.has(sessionId)) {
    return { session: activeSessions.get(sessionId)!, sessionId };
  }

  const newSessionId = sessionId ?? generateSessionId();
  const session = createGameStateMachine(demoStory, {
    autoSave: true,
    debug: process.env.NODE_ENV === 'development',
  });

  activeSessions.set(newSessionId, session);
  return { session, sessionId: newSessionId };
}

/**
 * POST /api/game - Start a new game or load saved game
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<{ sessionId: string; state: StateMachineState }>>> {
  try {
    const body = await request.json();
    const { action, userId, sessionId, saveData } = body;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'userId is required' }
      }, { status: 400 });
    }

    const { session, sessionId: actualSessionId } = getOrCreateSession(sessionId, userId);

    let state: StateMachineState;

    switch (action) {
      case 'start':
        state = await session.transition({ type: 'START_GAME', userId });
        break;

      case 'load':
        if (!saveData) {
          return NextResponse.json({
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'saveData is required for load action' }
          }, { status: 400 });
        }
        state = await session.transition({ type: 'LOAD_GAME', saveData });
        break;

      case 'restart':
        state = await session.transition({ type: 'RESTART_GAME' });
        break;

      default:
        return NextResponse.json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: `Invalid action: ${action}` }
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { sessionId: actualSessionId, state },
      metadata: { timestamp: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Game API error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}

/**
 * GET /api/game - Get current game state
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<StateMachineState>>> {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId || !activeSessions.has(sessionId)) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      }, { status: 404 });
    }

    const session = activeSessions.get(sessionId)!;
    const state = session.getState();

    return NextResponse.json({
      success: true,
      data: state,
      metadata: { timestamp: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Game API error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}
