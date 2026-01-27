/**
 * Global session management for CYOA game instances
 *
 * In production, this should be replaced with Redis or similar
 * distributed session store for scalability.
 */

import { GameStateMachine, createGameStateMachine, createInMemorySaveManager } from 'story-engine';
import type { Story } from 'shared-types';

// Global session store using Node.js global object for persistence across hot reloads
declare global {
  // eslint-disable-next-line no-var
  var __activeSessions: Map<string, GameStateMachine> | undefined;
  // eslint-disable-next-line no-var
  var __saveManager: ReturnType<typeof createInMemorySaveManager> | undefined;
}

/**
 * Get the global sessions map
 */
export function getActiveSessions(): Map<string, GameStateMachine> {
  if (!global.__activeSessions) {
    global.__activeSessions = new Map();
  }
  return global.__activeSessions;
}

/**
 * Get the global save manager
 */
export function getSaveManager() {
  if (!global.__saveManager) {
    global.__saveManager = createInMemorySaveManager({
      maxSlots: 10,
      keyPrefix: 'cyoa_',
      autoBackup: true,
    });
  }
  return global.__saveManager;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create a game session
 */
export function getOrCreateSession(
  story: Story,
  sessionId: string | null,
  userId: string
): { session: GameStateMachine; sessionId: string } {
  const sessions = getActiveSessions();

  if (sessionId && sessions.has(sessionId)) {
    return { session: sessions.get(sessionId)!, sessionId };
  }

  const newSessionId = sessionId ?? generateSessionId();
  const session = createGameStateMachine(story, {
    autoSave: true,
    debug: process.env.NODE_ENV === 'development',
  });

  sessions.set(newSessionId, session);
  return { session, sessionId: newSessionId };
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupExpiredSessions(maxAgeMs = 24 * 60 * 60 * 1000): number {
  const sessions = getActiveSessions();
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions) {
    const gameState = session.getGameState();
    if (gameState) {
      const lastActive = new Date(gameState.timestamp).getTime();
      if (now - lastActive > maxAgeMs) {
        session.dispose();
        sessions.delete(sessionId);
        cleaned++;
      }
    }
  }

  return cleaned;
}
