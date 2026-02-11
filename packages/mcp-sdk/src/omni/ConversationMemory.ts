/**
 * Conversation Memory - Intelligent conversation state management
 *
 * Provides sophisticated conversation memory including:
 * - Short-term and long-term memory separation
 * - Semantic search over conversation history
 * - Entity extraction and tracking
 * - Topic modeling and context switching
 * - Memory compression for long conversations
 * - Cross-session memory persistence
 *
 * @example
 * ```typescript
 * const memory = new ConversationMemory({ maxShortTermEntries: 20 });
 *
 * // Add messages
 * await memory.addMessage({ role: 'user', content: 'Tell me about project X' });
 * await memory.addMessage({ role: 'agent', content: 'Project X is...' });
 *
 * // Semantic search
 * const relevant = await memory.searchRelevant('project status', 5);
 *
 * // Get context for LLM
 * const context = await memory.getContextWindow(10);
 * ```
 */

import type { ConversationEntry, UserPreferences } from 'shared-types';

// =============================================================================
// Types
// =============================================================================

/**
 * Memory entry with enhanced metadata
 */
export interface MemoryEntry {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  channelType?: string;

  /** Extracted entities */
  entities: ExtractedEntity[];
  /** Detected intent */
  intent?: DetectedIntent;
  /** Topic/context tags */
  topics: string[];
  /** Sentiment score (-1 to 1) */
  sentiment?: number;
  /** Embedding vector for semantic search */
  embedding?: number[];
  /** References to other entries */
  references?: string[];
  /** Importance score (0 to 1) */
  importance: number;
  /** Has been compressed/summarized */
  compressed: boolean;
  /** Original content if compressed */
  originalContent?: string;
  /** MCP data used in response */
  mcpDataUsed?: string[];
}

/**
 * Extracted entity from text
 */
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalizedValue?: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, unknown>;
}

/**
 * Entity types
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'time'
  | 'money'
  | 'percentage'
  | 'email'
  | 'phone'
  | 'url'
  | 'project'
  | 'task'
  | 'product'
  | 'custom';

/**
 * Detected intent from user message
 */
export interface DetectedIntent {
  name: string;
  confidence: number;
  slots: Record<string, SlotValue>;
  subIntents?: DetectedIntent[];
}

/**
 * Slot value in intent
 */
export interface SlotValue {
  value: unknown;
  confidence: number;
  source: 'extracted' | 'inferred' | 'default';
}

/**
 * Conversation topic/context
 */
export interface ConversationTopic {
  id: string;
  name: string;
  keywords: string[];
  firstMentionedAt: string;
  lastMentionedAt: string;
  messageCount: number;
  active: boolean;
}

/**
 * Memory summary for compression
 */
export interface MemorySummary {
  id: string;
  startTime: string;
  endTime: string;
  messageCount: number;
  summary: string;
  keyPoints: string[];
  entities: ExtractedEntity[];
  topics: string[];
  importance: number;
}

/**
 * Context window for LLM
 */
export interface ContextWindow {
  messages: MemoryEntry[];
  summary?: MemorySummary;
  relevantMemories?: MemoryEntry[];
  entities: Map<string, ExtractedEntity[]>;
  activeTopics: ConversationTopic[];
  tokenCount: number;
}

/**
 * Memory configuration
 */
export interface ConversationMemoryConfig {
  /** Maximum short-term memory entries */
  maxShortTermEntries: number;
  /** Maximum long-term memory entries */
  maxLongTermEntries: number;
  /** Compression threshold (messages before compression) */
  compressionThreshold: number;
  /** Enable semantic search */
  enableSemanticSearch: boolean;
  /** Embedding dimension */
  embeddingDimension: number;
  /** Entity extraction enabled */
  enableEntityExtraction: boolean;
  /** Intent detection enabled */
  enableIntentDetection: boolean;
  /** Topic modeling enabled */
  enableTopicModeling: boolean;
  /** Memory importance decay rate per hour */
  importanceDecayRate: number;
  /** Minimum importance to retain */
  minImportanceToRetain: number;
}

const DEFAULT_CONFIG: ConversationMemoryConfig = {
  maxShortTermEntries: 50,
  maxLongTermEntries: 1000,
  compressionThreshold: 100,
  enableSemanticSearch: true,
  embeddingDimension: 384,
  enableEntityExtraction: true,
  enableIntentDetection: true,
  enableTopicModeling: true,
  importanceDecayRate: 0.1,
  minImportanceToRetain: 0.1,
};

// =============================================================================
// Entity Extractor
// =============================================================================

/**
 * Extract entities from text using pattern matching
 * In production, use NER model or API
 */
export class EntityExtractor {
  private patterns: Map<EntityType, RegExp[]> = new Map([
    ['email', [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi]],
    ['phone', [/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, /\+\d{1,3}[-.\s]?\d{1,14}/g]],
    ['url', [/https?:\/\/[^\s]+/gi]],
    ['date', [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{4}\b/gi,
      /\b(today|tomorrow|yesterday)\b/gi,
      /\b(next|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    ]],
    ['time', [
      /\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi,
      /\b(morning|afternoon|evening|night)\b/gi,
    ]],
    ['money', [/\$\d+(?:,\d{3})*(?:\.\d{2})?/g, /\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(USD|EUR|GBP|JPY)\b/gi]],
    ['percentage', [/\b\d+(?:\.\d+)?%/g]],
  ]);

  /**
   * Extract entities from text
   */
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const [type, patterns] of this.patterns) {
      for (const pattern of patterns) {
        let match;
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          entities.push({
            type,
            value: match[0],
            confidence: 0.9,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
        }
      }
    }

    // Sort by position and remove overlaps
    entities.sort((a, b) => a.startIndex - b.startIndex);
    return this.removeOverlaps(entities);
  }

  /**
   * Add custom pattern
   */
  addPattern(type: EntityType, pattern: RegExp): void {
    const existing = this.patterns.get(type) ?? [];
    existing.push(pattern);
    this.patterns.set(type, existing);
  }

  private removeOverlaps(entities: ExtractedEntity[]): ExtractedEntity[] {
    const result: ExtractedEntity[] = [];
    let lastEnd = -1;

    for (const entity of entities) {
      if (entity.startIndex >= lastEnd) {
        result.push(entity);
        lastEnd = entity.endIndex;
      }
    }

    return result;
  }
}

// =============================================================================
// Intent Detector
// =============================================================================

/**
 * Detect user intent using keyword matching and patterns
 * In production, use intent classification model
 */
export class IntentDetector {
  private intents: Map<string, IntentDefinition> = new Map();

  constructor() {
    // Default intents
    this.registerIntent({
      name: 'greeting',
      patterns: [/^(hi|hello|hey|good morning|good afternoon|good evening)/i],
      keywords: ['hi', 'hello', 'hey', 'greetings'],
      priority: 1,
    });

    this.registerIntent({
      name: 'farewell',
      patterns: [/^(bye|goodbye|see you|talk later|gotta go)/i],
      keywords: ['bye', 'goodbye', 'later', 'farewell'],
      priority: 1,
    });

    this.registerIntent({
      name: 'help',
      patterns: [/^(help|how do i|can you help|i need help)/i],
      keywords: ['help', 'assist', 'support', 'guidance'],
      priority: 2,
    });

    this.registerIntent({
      name: 'query',
      patterns: [/^(what|where|when|who|why|how|tell me|show me|find)/i],
      keywords: ['what', 'where', 'when', 'who', 'why', 'how'],
      priority: 3,
    });

    this.registerIntent({
      name: 'action',
      patterns: [/^(create|make|add|update|delete|remove|change|set|send)/i],
      keywords: ['create', 'make', 'add', 'update', 'delete', 'remove', 'send'],
      priority: 3,
    });

    this.registerIntent({
      name: 'confirmation',
      patterns: [/^(yes|yeah|yep|sure|ok|okay|correct|right|confirm)/i],
      keywords: ['yes', 'yeah', 'sure', 'ok', 'confirm', 'agree'],
      priority: 1,
    });

    this.registerIntent({
      name: 'negation',
      patterns: [/^(no|nope|nah|cancel|never|dont|don't)/i],
      keywords: ['no', 'nope', 'cancel', 'stop', 'dont'],
      priority: 1,
    });
  }

  /**
   * Register a new intent
   */
  registerIntent(definition: IntentDefinition): void {
    this.intents.set(definition.name, definition);
  }

  /**
   * Detect intent from text
   */
  detect(text: string): DetectedIntent | undefined {
    const normalizedText = text.toLowerCase().trim();
    const matches: Array<{ intent: string; confidence: number; slots: Record<string, SlotValue> }> = [];

    for (const [name, definition] of this.intents) {
      let confidence = 0;

      // Check patterns
      for (const pattern of definition.patterns) {
        if (pattern.test(normalizedText)) {
          confidence = Math.max(confidence, 0.9);
          break;
        }
      }

      // Check keywords
      if (confidence < 0.9) {
        const words = normalizedText.split(/\s+/);
        const keywordMatches = words.filter(w =>
          definition.keywords.some(kw => w.includes(kw) || kw.includes(w))
        ).length;

        if (keywordMatches > 0) {
          confidence = Math.max(confidence, Math.min(0.8, keywordMatches * 0.3));
        }
      }

      if (confidence > 0.3) {
        // Extract slots if defined
        const slots: Record<string, SlotValue> = {};
        if (definition.slots) {
          for (const [slotName, slotDef] of Object.entries(definition.slots)) {
            const match = normalizedText.match(slotDef.pattern);
            if (match) {
              slots[slotName] = {
                value: match[1] ?? match[0],
                confidence: 0.8,
                source: 'extracted',
              };
            }
          }
        }

        matches.push({ intent: name, confidence, slots });
      }
    }

    if (matches.length === 0) {
      return undefined;
    }

    // Return highest confidence match
    matches.sort((a, b) => {
      const defA = this.intents.get(a.intent)!;
      const defB = this.intents.get(b.intent)!;
      // Higher priority wins ties
      if (Math.abs(a.confidence - b.confidence) < 0.1) {
        return (defB.priority ?? 0) - (defA.priority ?? 0);
      }
      return b.confidence - a.confidence;
    });

    const best = matches[0];
    return {
      name: best.intent,
      confidence: best.confidence,
      slots: best.slots,
    };
  }
}

/**
 * Intent definition
 */
export interface IntentDefinition {
  name: string;
  patterns: RegExp[];
  keywords: string[];
  priority?: number;
  slots?: Record<string, { pattern: RegExp; required?: boolean }>;
}

// =============================================================================
// Topic Modeler
// =============================================================================

/**
 * Simple topic modeling using keyword extraction
 * In production, use LDA or embedding-based clustering
 */
export class TopicModeler {
  private stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'can', 'now', 'also', 'like', 'get', 'got', 'make', 'made',
  ]);

  /**
   * Extract topics from text
   */
  extractTopics(text: string, maxTopics = 5): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.has(w));

    // Count word frequency
    const frequency = new Map<string, number>();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }

    // Get top words as topics
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTopics)
      .map(([word]) => word);
  }

  /**
   * Calculate topic similarity between two texts
   */
  calculateSimilarity(topics1: string[], topics2: string[]): number {
    if (topics1.length === 0 || topics2.length === 0) return 0;

    const set1 = new Set(topics1);
    const set2 = new Set(topics2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}

// =============================================================================
// Conversation Memory
// =============================================================================

/**
 * Intelligent conversation memory manager
 */
export class ConversationMemory {
  private config: ConversationMemoryConfig;
  private shortTermMemory: MemoryEntry[] = [];
  private longTermMemory: MemoryEntry[] = [];
  private summaries: MemorySummary[] = [];
  private topics: Map<string, ConversationTopic> = new Map();
  private entityTracker: Map<string, ExtractedEntity[]> = new Map();

  private entityExtractor: EntityExtractor;
  private intentDetector: IntentDetector;
  private topicModeler: TopicModeler;

  constructor(config: Partial<ConversationMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entityExtractor = new EntityExtractor();
    this.intentDetector = new IntentDetector();
    this.topicModeler = new TopicModeler();
  }

  /**
   * Add a message to memory
   */
  async addMessage(
    message: Pick<MemoryEntry, 'role' | 'content' | 'channelType' | 'mcpDataUsed'>
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      ...message,
      timestamp: new Date().toISOString(),
      entities: [],
      topics: [],
      importance: 1.0,
      compressed: false,
    };

    // Extract entities
    if (this.config.enableEntityExtraction) {
      entry.entities = this.entityExtractor.extract(message.content);
      this.trackEntities(entry.entities);
    }

    // Detect intent (for user messages)
    if (this.config.enableIntentDetection && message.role === 'user') {
      entry.intent = this.intentDetector.detect(message.content);
    }

    // Extract topics
    if (this.config.enableTopicModeling) {
      entry.topics = this.topicModeler.extractTopics(message.content);
      this.updateTopics(entry.topics);
    }

    // Calculate importance based on content
    entry.importance = this.calculateImportance(entry);

    // Add to short-term memory
    this.shortTermMemory.push(entry);

    // Check if compression needed
    if (this.shortTermMemory.length >= this.config.compressionThreshold) {
      await this.compressOldMemories();
    }

    // Prune if needed
    this.pruneMemory();

    return entry;
  }

  /**
   * Search for relevant memories using semantic similarity
   */
  async searchRelevant(query: string, limit = 5): Promise<MemoryEntry[]> {
    // Extract query topics for matching
    const queryTopics = this.topicModeler.extractTopics(query);

    // Score all memories
    const scored = [...this.shortTermMemory, ...this.longTermMemory].map(entry => ({
      entry,
      score: this.calculateRelevanceScore(entry, query, queryTopics),
    }));

    // Sort by score and return top results
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }

  /**
   * Get context window for LLM
   */
  async getContextWindow(maxMessages = 10, maxTokens = 4000): Promise<ContextWindow> {
    // Get recent messages
    const recentMessages = this.shortTermMemory.slice(-maxMessages);

    // Estimate token count (rough approximation)
    let tokenCount = 0;
    const messages: MemoryEntry[] = [];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgTokens = Math.ceil(msg.content.length / 4);

      if (tokenCount + msgTokens > maxTokens) break;

      messages.unshift(msg);
      tokenCount += msgTokens;
    }

    // Get most recent summary if available
    const summary = this.summaries[this.summaries.length - 1];

    // Get active topics
    const activeTopics = Array.from(this.topics.values())
      .filter(t => t.active)
      .sort((a, b) => b.messageCount - a.messageCount);

    return {
      messages,
      summary,
      entities: new Map(this.entityTracker),
      activeTopics,
      tokenCount,
    };
  }

  /**
   * Get recent messages
   */
  getRecentMessages(count = 10): MemoryEntry[] {
    return this.shortTermMemory.slice(-count);
  }

  /**
   * Get all tracked entities
   */
  getTrackedEntities(): Map<string, ExtractedEntity[]> {
    return new Map(this.entityTracker);
  }

  /**
   * Get conversation topics
   */
  getTopics(): ConversationTopic[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    return {
      shortTermCount: this.shortTermMemory.length,
      longTermCount: this.longTermMemory.length,
      summaryCount: this.summaries.length,
      topicCount: this.topics.size,
      entityCount: this.entityTracker.size,
      totalMessages:
        this.shortTermMemory.length +
        this.longTermMemory.length +
        this.summaries.reduce((acc, s) => acc + s.messageCount, 0),
    };
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.shortTermMemory = [];
    this.longTermMemory = [];
    this.summaries = [];
    this.topics.clear();
    this.entityTracker.clear();
  }

  /**
   * Export memory for persistence
   */
  export(): ExportedMemory {
    return {
      shortTermMemory: this.shortTermMemory,
      longTermMemory: this.longTermMemory,
      summaries: this.summaries,
      topics: Array.from(this.topics.entries()),
      entityTracker: Array.from(this.entityTracker.entries()),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import memory from persisted data
   */
  import(data: ExportedMemory): void {
    this.shortTermMemory = data.shortTermMemory;
    this.longTermMemory = data.longTermMemory;
    this.summaries = data.summaries;
    this.topics = new Map(data.topics);
    this.entityTracker = new Map(data.entityTracker);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Calculate importance score for a message
   */
  private calculateImportance(entry: MemoryEntry): number {
    let importance = 0.5;

    // Entities increase importance
    importance += Math.min(0.2, entry.entities.length * 0.05);

    // Questions are important
    if (entry.content.includes('?')) {
      importance += 0.1;
    }

    // Actions/commands are important
    if (entry.intent?.name === 'action') {
      importance += 0.15;
    }

    // Longer messages tend to be more important (up to a point)
    const wordCount = entry.content.split(/\s+/).length;
    importance += Math.min(0.1, wordCount * 0.005);

    return Math.min(1.0, importance);
  }

  /**
   * Calculate relevance score for search
   */
  private calculateRelevanceScore(
    entry: MemoryEntry,
    query: string,
    queryTopics: string[]
  ): number {
    let score = 0;

    // Topic similarity
    const topicSimilarity = this.topicModeler.calculateSimilarity(
      entry.topics,
      queryTopics
    );
    score += topicSimilarity * 0.4;

    // Keyword matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = entry.content.toLowerCase();
    const keywordMatches = queryWords.filter(w => contentLower.includes(w)).length;
    score += (keywordMatches / queryWords.length) * 0.3;

    // Recency bonus
    const ageHours =
      (Date.now() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.exp(-ageHours / 24);
    score += recencyScore * 0.2;

    // Importance
    score += entry.importance * 0.1;

    return score;
  }

  /**
   * Track entities across conversation
   */
  private trackEntities(entities: ExtractedEntity[]): void {
    for (const entity of entities) {
      const key = `${entity.type}:${entity.value.toLowerCase()}`;
      const existing = this.entityTracker.get(key) ?? [];
      existing.push(entity);
      this.entityTracker.set(key, existing);
    }
  }

  /**
   * Update topic tracking
   */
  private updateTopics(topics: string[]): void {
    const now = new Date().toISOString();

    // Mark all topics as potentially inactive
    for (const topic of this.topics.values()) {
      topic.active = false;
    }

    // Update/create topics
    for (const topicName of topics) {
      const existing = this.topics.get(topicName);

      if (existing) {
        existing.lastMentionedAt = now;
        existing.messageCount++;
        existing.active = true;
      } else {
        this.topics.set(topicName, {
          id: this.generateId(),
          name: topicName,
          keywords: [topicName],
          firstMentionedAt: now,
          lastMentionedAt: now,
          messageCount: 1,
          active: true,
        });
      }
    }
  }

  /**
   * Compress old memories into summaries
   */
  private async compressOldMemories(): Promise<void> {
    // Get messages to compress (keep last 20 in short-term)
    const toCompress = this.shortTermMemory.slice(0, -20);
    if (toCompress.length < 10) return;

    // Create summary
    const summary: MemorySummary = {
      id: this.generateId(),
      startTime: toCompress[0].timestamp,
      endTime: toCompress[toCompress.length - 1].timestamp,
      messageCount: toCompress.length,
      summary: this.createSummaryText(toCompress),
      keyPoints: this.extractKeyPoints(toCompress),
      entities: toCompress.flatMap(m => m.entities),
      topics: [...new Set(toCompress.flatMap(m => m.topics))],
      importance: toCompress.reduce((acc, m) => acc + m.importance, 0) / toCompress.length,
    };

    this.summaries.push(summary);

    // Move important messages to long-term, discard others
    for (const entry of toCompress) {
      if (entry.importance >= this.config.minImportanceToRetain) {
        entry.compressed = true;
        this.longTermMemory.push(entry);
      }
    }

    // Remove compressed messages from short-term
    this.shortTermMemory = this.shortTermMemory.slice(-20);
  }

  /**
   * Create summary text from messages
   */
  private createSummaryText(messages: MemoryEntry[]): string {
    // Simple summary - in production use LLM
    const topics = [...new Set(messages.flatMap(m => m.topics))].slice(0, 5);
    const userMsgs = messages.filter(m => m.role === 'user').length;
    const agentMsgs = messages.filter(m => m.role === 'agent').length;

    return `Conversation with ${userMsgs} user messages and ${agentMsgs} agent responses. ` +
           `Topics discussed: ${topics.join(', ')}.`;
  }

  /**
   * Extract key points from messages
   */
  private extractKeyPoints(messages: MemoryEntry[]): string[] {
    // Get messages with intents or high importance
    return messages
      .filter(m => m.intent || m.importance > 0.7)
      .slice(0, 5)
      .map(m => m.content.slice(0, 100));
  }

  /**
   * Prune memory to stay within limits
   */
  private pruneMemory(): void {
    // Prune short-term
    if (this.shortTermMemory.length > this.config.maxShortTermEntries) {
      const toRemove = this.shortTermMemory.length - this.config.maxShortTermEntries;
      this.shortTermMemory = this.shortTermMemory.slice(toRemove);
    }

    // Prune long-term (remove lowest importance)
    if (this.longTermMemory.length > this.config.maxLongTermEntries) {
      this.longTermMemory.sort((a, b) => b.importance - a.importance);
      this.longTermMemory = this.longTermMemory.slice(0, this.config.maxLongTermEntries);
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  shortTermCount: number;
  longTermCount: number;
  summaryCount: number;
  topicCount: number;
  entityCount: number;
  totalMessages: number;
}

/**
 * Exported memory for persistence
 */
export interface ExportedMemory {
  shortTermMemory: MemoryEntry[];
  longTermMemory: MemoryEntry[];
  summaries: MemorySummary[];
  topics: [string, ConversationTopic][];
  entityTracker: [string, ExtractedEntity[]][];
  exportedAt: string;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a conversation memory instance
 */
export function createConversationMemory(
  config?: Partial<ConversationMemoryConfig>
): ConversationMemory {
  return new ConversationMemory(config);
}
