/**
 * Choice API Route - Process player choices
 *
 * POST /api/game/choice - Make a choice in the game
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse, StateMachineState, Choice } from 'shared-types';
import { GameStateMachine } from 'story-engine';

// Reference to active sessions (shared with main game route)
// In production, use a proper session store
declare const activeSessions: Map<string, GameStateMachine>;

// This is a workaround for sharing state between route files in development
// In production, use Redis or a database
const getActiveSessions = (): Map<string, GameStateMachine> => {
  if (typeof global !== 'undefined') {
    const g = global as typeof globalThis & { __activeSessions?: Map<string, GameStateMachine> };
    if (!g.__activeSessions) {
      g.__activeSessions = new Map();
    }
    return g.__activeSessions;
  }
  return new Map();
};

/**
 * POST /api/game/choice - Make a choice
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<{
  state: StateMachineState;
  narrative: string;
  availableChoices: Choice[];
  isEnded: boolean;
  progress: { percentage: number; choicesMade: number };
}>>> {
  try {
    const body = await request.json();
    const { sessionId, choiceId } = body;

    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'sessionId is required' }
      }, { status: 400 });
    }

    if (!choiceId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'choiceId is required' }
      }, { status: 400 });
    }

    const sessions = getActiveSessions();
    const session = sessions.get(sessionId);

    if (!session) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found. Please start a new game.' }
      }, { status: 404 });
    }

    // Process the choice
    const state = await session.transition({ type: 'MAKE_CHOICE', choiceId });

    // Get current scene and available choices
    const currentScene = session.getCurrentScene();
    const availableChoices = session.getAvailableChoices();
    const isEnded = session.isEnded();
    const progress = session.getProgress();

    return NextResponse.json({
      success: true,
      data: {
        state,
        narrative: currentScene?.narrative ?? '',
        availableChoices,
        isEnded,
        progress: {
          percentage: progress.percentage,
          choicesMade: progress.choicesMade
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        sceneId: currentScene?.id
      }
    });

  } catch (error) {
    console.error('Choice API error:', error);

    // Check for specific game errors
    if (error instanceof Error) {
      if (error.message.includes('requirements not met')) {
        return NextResponse.json({
          success: false,
          error: { code: 'REQUIREMENTS_NOT_MET', message: 'Choice requirements not met' }
        }, { status: 400 });
      }

      if (error.message.includes('not found')) {
        return NextResponse.json({
          success: false,
          error: { code: 'INVALID_CHOICE', message: error.message }
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}
