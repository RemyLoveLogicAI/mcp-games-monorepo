/**
 * Save API Route - Save and load game state
 *
 * POST /api/game/save - Save current game state
 * GET /api/game/save - List saves or get specific save
 * DELETE /api/game/save - Delete a save
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse, SaveSlot } from 'shared-types';
import { GameStateMachine, SaveManager, createInMemorySaveManager } from 'story-engine';

// Shared save manager instance
const saveManager = createInMemorySaveManager({
  maxSlots: 10,
  keyPrefix: 'cyoa_',
  autoBackup: true,
});

// Session access helper
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
 * POST /api/game/save - Save current game state
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<{
  saveId: string;
  saveData: string;
}>>> {
  try {
    const body = await request.json();
    const { sessionId, saveName, slotId } = body;

    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'sessionId is required' }
      }, { status: 400 });
    }

    const sessions = getActiveSessions();
    const session = sessions.get(sessionId);

    if (!session) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      }, { status: 404 });
    }

    const gameState = session.getGameState();
    if (!gameState) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_STATE', message: 'No active game to save' }
      }, { status: 400 });
    }

    // Save using save manager
    const result = await saveManager.save(gameState, slotId, saveName);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: { code: 'SAVE_FAILED', message: result.error?.message ?? 'Failed to save' }
      }, { status: 500 });
    }

    // Also return serialized state for client-side backup
    const saveData = session.serialize() ?? '';

    return NextResponse.json({
      success: true,
      data: {
        saveId: result.value,
        saveData
      },
      metadata: { timestamp: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Save API error:', error);
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
 * GET /api/game/save - List saves or get specific save
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<SaveSlot[] | SaveSlot>>> {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const saveId = request.nextUrl.searchParams.get('saveId');

    if (saveId) {
      // Get specific save
      const slot = await saveManager.getSlot(saveId);

      if (!slot) {
        return NextResponse.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Save not found' }
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: slot,
        metadata: { timestamp: new Date().toISOString() }
      });
    }

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'userId or saveId is required' }
      }, { status: 400 });
    }

    // List all saves for user
    const saves = await saveManager.listSlots(userId);

    return NextResponse.json({
      success: true,
      data: saves,
      metadata: {
        timestamp: new Date().toISOString(),
        count: saves.length
      }
    });

  } catch (error) {
    console.error('Save API error:', error);
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
 * DELETE /api/game/save - Delete a save
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<APIResponse<void>>> {
  try {
    const saveId = request.nextUrl.searchParams.get('saveId');
    const userId = request.nextUrl.searchParams.get('userId');

    if (!saveId) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'saveId is required' }
      }, { status: 400 });
    }

    const result = await saveManager.delete(saveId, userId ?? undefined);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: { code: 'DELETE_FAILED', message: result.error?.message ?? 'Failed to delete' }
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: undefined,
      metadata: { timestamp: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Save API error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}
