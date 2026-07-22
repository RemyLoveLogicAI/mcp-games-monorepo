/**
 * ClarificationHandler - manages the clarification round-trip that follows an
 * ambiguous player response (Issue #15). It stores the pending question per
 * session, generates a human-readable prompt, and resolves the follow-up reply
 * (either a numbered selection or a rephrased answer) back to a single Choice.
 */

import type { Choice } from 'shared-types';
import { AmbiguityDetector } from './AmbiguityDetector';

export interface ClarificationRequest {
  id: string;
  originalInput: string;
  ambiguousChoices: Choice[];
  prompt: string;
  timestamp: Date;
}

/** Requests older than this are considered stale and dropped. */
const EXPIRATION_MS = 5 * 60 * 1000;

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `clarify_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export class ClarificationHandler {
  private pendingClarifications = new Map<string, ClarificationRequest>();
  private detector = new AmbiguityDetector();

  /**
   * Create a clarification request when ambiguity is detected.
   */
  async requestClarification(
    sessionId: string,
    playerInput: string,
    ambiguousChoices: Choice[]
  ): Promise<ClarificationRequest> {
    const request: ClarificationRequest = {
      id: generateId(),
      originalInput: playerInput,
      ambiguousChoices,
      prompt: this.generateClarificationPrompt(playerInput, ambiguousChoices),
      timestamp: new Date(),
    };

    this.pendingClarifications.set(sessionId, request);

    return request;
  }

  private generateClarificationPrompt(
    playerInput: string,
    choices: Choice[]
  ): string {
    const intro = `Your response "${playerInput}" could match multiple choices. Please clarify:`;

    const options = choices
      .map((choice, index) => `${index + 1}. ${choice.text}`)
      .join('\n');

    return `${intro}\n\n${options}\n\nPlease choose a number (1-${choices.length}) or rephrase your choice.`;
  }

  /**
   * Resolve a clarification with the player's follow-up response. Returns the
   * selected Choice, or null if the response is still ambiguous/invalid (in
   * which case the request stays pending).
   */
  async resolveClarification(
    sessionId: string,
    clarificationResponse: string
  ): Promise<Choice | null> {
    const request = this.pendingClarifications.get(sessionId);
    if (!request) {
      return null;
    }

    const numberMatch = clarificationResponse.trim().match(/^(\d+)$/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10) - 1;
      if (index >= 0 && index < request.ambiguousChoices.length) {
        this.pendingClarifications.delete(sessionId);
        return request.ambiguousChoices[index];
      }
      return null;
    }

    const result = this.detector.detectAmbiguity(
      clarificationResponse,
      request.ambiguousChoices
    );

    if (!result.isAmbiguous && result.matchedChoices.length === 1) {
      this.pendingClarifications.delete(sessionId);
      return result.matchedChoices[0];
    }

    return null;
  }

  hasPendingClarification(sessionId: string): boolean {
    return this.pendingClarifications.has(sessionId);
  }

  getPendingClarification(sessionId: string): ClarificationRequest | undefined {
    return this.pendingClarifications.get(sessionId);
  }

  clearClarification(sessionId: string): void {
    this.pendingClarifications.delete(sessionId);
  }

  /**
   * Clear expired clarification requests (older than 5 minutes).
   */
  clearExpiredRequests(): void {
    const now = Date.now();
    for (const [sessionId, request] of this.pendingClarifications.entries()) {
      if (now - request.timestamp.getTime() > EXPIRATION_MS) {
        this.pendingClarifications.delete(sessionId);
      }
    }
  }
}
