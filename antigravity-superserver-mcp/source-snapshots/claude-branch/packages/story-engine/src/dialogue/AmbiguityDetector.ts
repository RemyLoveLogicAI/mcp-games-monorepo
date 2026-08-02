/**
 * AmbiguityDetector - detects when a free-text player response could map to
 * more than one available choice, so the game can ask for clarification
 * instead of silently guessing (Issue #15).
 */

import type { Choice } from 'shared-types-snapshot';

export interface AmbiguityDetectionResult {
  isAmbiguous: boolean;
  matchedChoices: Choice[];
  confidence: number;
  reason?: string;
}

interface ScoredChoice {
  choice: Choice;
  confidence: number;
}

/** Words that signal the player is unsure and needs disambiguation. */
const AMBIGUOUS_KEYWORDS = ['maybe', 'either', 'both', 'not sure', 'dunno'];

/** Minimum confidence for a match to be considered strong. */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/** Two strong matches within this gap are treated as ambiguous. */
const CLOSE_SCORE_GAP = 0.15;

export class AmbiguityDetector {
  /**
   * Detect if player input matches multiple choices.
   */
  detectAmbiguity(
    playerInput: string,
    availableChoices: Choice[]
  ): AmbiguityDetectionResult {
    const matches = this.scoreChoices(playerInput, availableChoices);

    const highConfidenceMatches = matches.filter(
      m => m.confidence >= HIGH_CONFIDENCE_THRESHOLD
    );

    if (highConfidenceMatches.length > 1) {
      const topScores = highConfidenceMatches
        .map(m => m.confidence)
        .sort((a, b) => b - a);

      if (topScores[0] - topScores[1] < CLOSE_SCORE_GAP) {
        return {
          isAmbiguous: true,
          matchedChoices: highConfidenceMatches.map(m => m.choice),
          confidence: topScores[0],
          reason: 'Multiple choices match with similar confidence',
        };
      }
    }

    const hasAmbiguousKeyword = AMBIGUOUS_KEYWORDS.some(keyword =>
      playerInput.toLowerCase().includes(keyword)
    );

    if (hasAmbiguousKeyword && matches.length > 0) {
      return {
        isAmbiguous: true,
        matchedChoices: matches.map(m => m.choice),
        confidence: 0.5,
        reason: 'Player expressed uncertainty',
      };
    }

    return {
      isAmbiguous: false,
      matchedChoices: matches.length > 0 ? [matches[0].choice] : [],
      confidence: matches.length > 0 ? matches[0].confidence : 0,
    };
  }

  private scoreChoices(playerInput: string, choices: Choice[]): ScoredChoice[] {
    return choices
      .map(choice => ({
        choice,
        confidence: this.calculateSimilarity(playerInput, choice.text),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Similarity as the fraction of the player's input words that are covered by
   * a choice. Coverage (rather than symmetric overlap) keeps short commands
   * such as "go" strongly matching every "Go ..." choice, which is exactly the
   * situation that must be flagged as ambiguous.
   */
  private calculateSimilarity(input: string, choiceText: string): number {
    const inputWords = this.tokenize(input);
    if (inputWords.length === 0) return 0;

    const choiceWords = this.tokenize(choiceText);

    const matched = inputWords.filter(word =>
      choiceWords.some(cWord => this.wordsMatch(word, cWord))
    );

    return matched.length / inputWords.length;
  }

  /**
   * Short words (articles, "to", "go", single letters) only match on exact
   * equality; substring matching for them produces spurious hits such as
   * "i" matching "village". Longer words may match as substrings either way.
   */
  private wordsMatch(word: string, choiceWord: string): boolean {
    if (word === choiceWord) return true;
    if (word.length < 3 || choiceWord.length < 3) return false;
    return choiceWord.includes(word) || word.includes(choiceWord);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 0);
  }
}
