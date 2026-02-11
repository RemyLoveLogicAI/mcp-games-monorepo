/**
 * Omni MCP Integration - Unified layer connecting MCP and Omni Agent
 *
 * This integration layer provides:
 * - Context-aware MCP queries based on conversation history
 * - MCP data personalization for responses
 * - Proactive data fetching based on conversation patterns
 * - Real-time MCP subscriptions for live updates
 * - Unified state management across channels and MCP sources
 * - Intelligent caching with conversation context
 *
 * @example
 * ```typescript
 * const integration = new OmniMCPIntegration(mcpClient, omniAgent);
 *
 * // Process message with MCP-powered context
 * const response = await integration.processMessage(userId, message);
 *
 * // Subscribe to relevant MCP updates
 * await integration.subscribeToUserRelevantData(userId, {
 *   onUpdate: (data) => { /* send notification */ },
 * });
 *
 * // Get personalized response using MCP data
 * const personalizedResponse = await integration.generatePersonalizedResponse(
 *   userId,
 *   template,
 *   context
 * );
 * ```
 */

import { EventEmitter } from 'events';
import type {
  MultiQueryResult,
  QueryFilters,
  MCPConnection,
  OutputFormat,
} from 'shared-types';

import { MCPClient } from '../client/MCPClient';
import { MCPSubscriptionManager, type Subscription, type SubscriptionData } from '../realtime/MCPSubscriptionManager';
import { QueryOrchestrator, createQueryPipeline, type QueryPipeline, type PipelineResult } from '../orchestration/QueryOrchestrator';
import { OmniAgentClient, type UserContext, type OmniMessage } from './OmniAgentClient';
import { ConversationMemory, type MemoryEntry, type ExtractedEntity, type DetectedIntent } from './ConversationMemory';
import { DialogueManager, type DialogueFlow, type DialogueResponse, type ProcessedInput } from './DialogueManager';

// =============================================================================
// Types
// =============================================================================

/**
 * Integration configuration
 */
export interface OmniMCPIntegrationConfig {
  /** Enable proactive data fetching */
  enableProactiveFetching: boolean;
  /** Proactive fetch interval (ms) */
  proactiveFetchIntervalMs: number;
  /** Enable context-aware caching */
  enableContextAwareCache: boolean;
  /** Cache context window size */
  cacheContextWindowSize: number;
  /** Enable real-time subscriptions */
  enableSubscriptions: boolean;
  /** Maximum concurrent subscriptions per user */
  maxSubscriptionsPerUser: number;
  /** Enable personalization */
  enablePersonalization: boolean;
  /** Personalization relevance threshold */
  personalizationThreshold: number;
  /** Enable response templating */
  enableResponseTemplating: boolean;
  /** Debug mode */
  debug: boolean;
}

const DEFAULT_CONFIG: OmniMCPIntegrationConfig = {
  enableProactiveFetching: true,
  proactiveFetchIntervalMs: 5 * 60 * 1000, // 5 minutes
  enableContextAwareCache: true,
  cacheContextWindowSize: 10,
  enableSubscriptions: true,
  maxSubscriptionsPerUser: 5,
  enablePersonalization: true,
  personalizationThreshold: 0.5,
  enableResponseTemplating: true,
  debug: false,
};

/**
 * Message processing result
 */
export interface ProcessedMessage {
  response: string;
  mcpDataUsed: MCPDataUsage[];
  dialogueResponse?: DialogueResponse;
  suggestedActions?: SuggestedAction[];
  relatedData?: unknown;
  personalizationScore: number;
}

/**
 * MCP data usage tracking
 */
export interface MCPDataUsage {
  serverId: string;
  query: string;
  dataType: string;
  relevanceScore: number;
  timestamp: string;
}

/**
 * Suggested action
 */
export interface SuggestedAction {
  id: string;
  label: string;
  type: 'reply' | 'action' | 'link' | 'mcp-query';
  payload: unknown;
}

/**
 * Personalization context
 */
export interface PersonalizationContext {
  userId: string;
  preferences: Record<string, unknown>;
  recentTopics: string[];
  frequentEntities: string[];
  interactionHistory: {
    channelsUsed: string[];
    averageResponseTime: number;
    preferredResponseLength: 'short' | 'medium' | 'long';
  };
  mcpPreferences: {
    preferredServers: string[];
    dataCategories: string[];
  };
}

/**
 * Proactive notification
 */
export interface ProactiveNotification {
  id: string;
  userId: string;
  type: 'update' | 'reminder' | 'suggestion' | 'alert';
  title: string;
  message: string;
  data?: unknown;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: string[];
  scheduledFor?: string;
  expiresAt?: string;
}

/**
 * User MCP profile
 */
export interface UserMCPProfile {
  userId: string;
  connectedServers: string[];
  queryHistory: QueryHistoryEntry[];
  dataPreferences: DataPreference[];
  subscriptions: string[];
  lastUpdated: string;
}

/**
 * Query history entry
 */
export interface QueryHistoryEntry {
  query: string;
  servers: string[];
  timestamp: string;
  resultCount: number;
  relevanceScore: number;
}

/**
 * Data preference
 */
export interface DataPreference {
  category: string;
  servers: string[];
  weight: number;
  lastAccessed: string;
}

// =============================================================================
// Omni MCP Integration
// =============================================================================

/**
 * Unified integration layer for MCP and Omni Agent
 */
export class OmniMCPIntegration extends EventEmitter {
  private config: OmniMCPIntegrationConfig;
  private mcpClient: MCPClient;
  private omniAgent: OmniAgentClient;
  private subscriptionManager: MCPSubscriptionManager;
  private orchestrator: QueryOrchestrator;
  private dialogueManager: DialogueManager;

  private userMemories: Map<string, ConversationMemory> = new Map();
  private userProfiles: Map<string, UserMCPProfile> = new Map();
  private userSubscriptions: Map<string, Subscription[]> = new Map();
  private proactiveTimer?: NodeJS.Timeout;

  constructor(
    mcpClient: MCPClient,
    omniAgent: OmniAgentClient,
    config: Partial<OmniMCPIntegrationConfig> = {}
  ) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mcpClient = mcpClient;
    this.omniAgent = omniAgent;
    this.subscriptionManager = new MCPSubscriptionManager(mcpClient as any, { debug: config.debug });
    this.orchestrator = new QueryOrchestrator(mcpClient, { debug: config.debug });
    this.dialogueManager = new DialogueManager({ debug: config.debug });

    // Register default dialogue flows
    this.registerDefaultFlows();

    // Setup proactive fetching
    if (this.config.enableProactiveFetching) {
      this.startProactiveFetching();
    }
  }

  // ===========================================================================
  // Message Processing
  // ===========================================================================

  /**
   * Process an incoming message with full MCP integration
   */
  async processMessage(
    userId: string,
    message: string,
    channelType?: string
  ): Promise<ProcessedMessage> {
    const startTime = Date.now();
    this.log(`Processing message for user ${userId}`);

    // Get or create user memory
    const memory = this.getOrCreateMemory(userId);

    // Get user context from Omni Agent
    const userContext = await this.omniAgent.getOrCreateContext(userId);

    // Add message to memory
    const memoryEntry = await memory.addMessage({
      role: 'user',
      content: message,
      channelType,
    });

    // Process through dialogue manager if there's an active flow
    let dialogueResponse: DialogueResponse | undefined;
    if (this.dialogueManager.hasActiveFlow(userId) || this.shouldTriggerFlow(memoryEntry)) {
      dialogueResponse = await this.dialogueManager.process(
        userId,
        message,
        memoryEntry.intent,
        memoryEntry.entities
      );
    }

    // Fetch relevant MCP data
    const mcpData = await this.fetchContextualMCPData(userId, memoryEntry, userContext);

    // Generate personalized response
    const response = await this.generateResponse(
      userId,
      message,
      memoryEntry,
      mcpData,
      dialogueResponse,
      userContext
    );

    // Add response to memory
    await memory.addMessage({
      role: 'agent',
      content: response.response,
      mcpDataUsed: response.mcpDataUsed.map(d => d.serverId),
    });

    // Update user profile
    this.updateUserProfile(userId, mcpData);

    // Check for proactive notifications
    const notifications = await this.checkProactiveNotifications(userId, memoryEntry, mcpData);
    if (notifications.length > 0) {
      this.emit('proactive-notifications', { userId, notifications });
    }

    this.log(`Message processed in ${Date.now() - startTime}ms`);

    return response;
  }

  /**
   * Fetch MCP data based on conversation context
   */
  async fetchContextualMCPData(
    userId: string,
    memoryEntry: MemoryEntry,
    userContext: UserContext
  ): Promise<MCPQueryResultWithContext> {
    const mcpDataUsage: MCPDataUsage[] = [];
    let aggregatedData: unknown = null;

    // Determine which servers to query based on context
    const serversToQuery = this.determineRelevantServers(memoryEntry, userContext);

    if (serversToQuery.length === 0) {
      return { data: null, usage: mcpDataUsage };
    }

    // Build context-aware query
    const query = this.buildContextualQuery(memoryEntry, userContext);

    try {
      // Execute query with orchestration if complex
      if (this.shouldUseOrchestration(memoryEntry)) {
        const pipeline = this.buildQueryPipeline(memoryEntry, serversToQuery, query);
        const result = await this.orchestrator.execute(pipeline);

        if (result.success) {
          aggregatedData = result.data;
          mcpDataUsage.push(...this.trackDataUsage(serversToQuery, query, result));
        }
      } else {
        // Simple query
        const result = await this.mcpClient
          .from(serversToQuery)
          .semanticSearch(query)
          .timeframe('this_week')
          .maxResults(10)
          .execute();

        aggregatedData = result.aggregated;
        mcpDataUsage.push(...this.trackDataUsage(serversToQuery, query, { success: true, data: result }));
      }
    } catch (error) {
      this.log(`MCP query failed: ${error}`);
    }

    return { data: aggregatedData, usage: mcpDataUsage };
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to MCP updates relevant to user
   */
  async subscribeToUserRelevantData(
    userId: string,
    options: {
      onUpdate: (data: SubscriptionData) => void;
      onError?: (error: unknown) => void;
      topics?: string[];
    }
  ): Promise<Subscription[]> {
    if (!this.config.enableSubscriptions) {
      return [];
    }

    const userProfile = this.userProfiles.get(userId);
    const memory = this.userMemories.get(userId);

    // Determine what to subscribe to based on user's interaction history
    const subscriptionTopics = options.topics ?? this.inferSubscriptionTopics(userProfile, memory);

    const subscriptions: Subscription[] = [];

    for (const topic of subscriptionTopics.slice(0, this.config.maxSubscriptionsPerUser)) {
      const servers = this.getServersForTopic(topic, userProfile);

      const subscription = await this.subscriptionManager.subscribe({
        servers,
        query: topic,
        onData: (data) => {
          // Enrich with context
          const enrichedData = this.enrichSubscriptionData(data, userId);
          options.onUpdate(enrichedData);

          // Emit event for proactive handling
          this.emit('mcp-update', { userId, topic, data: enrichedData });
        },
        onError: options.onError,
        pollingIntervalMs: 60000,
        deltaOnly: true,
      });

      subscriptions.push(subscription);
    }

    // Track user subscriptions
    this.userSubscriptions.set(userId, subscriptions);

    return subscriptions;
  }

  /**
   * Unsubscribe user from all MCP updates
   */
  async unsubscribeUser(userId: string): Promise<void> {
    const subscriptions = this.userSubscriptions.get(userId) ?? [];

    for (const sub of subscriptions) {
      sub.unsubscribe();
    }

    this.userSubscriptions.delete(userId);
  }

  // ===========================================================================
  // Personalization
  // ===========================================================================

  /**
   * Generate a personalized response using MCP data
   */
  async generatePersonalizedResponse(
    userId: string,
    template: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    if (!this.config.enablePersonalization) {
      return template;
    }

    const personalization = await this.getPersonalizationContext(userId);
    const memory = this.userMemories.get(userId);
    const contextWindow = memory ? await memory.getContextWindow(5) : null;

    // Fetch relevant MCP data for personalization
    const mcpData = await this.fetchPersonalizationData(personalization);

    // Replace template variables
    let response = template;

    // Replace standard variables
    response = response.replace(/\{\{user\.name\}\}/g, personalization.userId);
    response = response.replace(/\{\{user\.preference\.(\w+)\}\}/g, (_, key) =>
      String(personalization.preferences[key] ?? '')
    );

    // Replace MCP data variables
    if (mcpData) {
      response = response.replace(/\{\{mcp\.(\w+)\.(\w+)\}\}/g, (_, server, field) => {
        const serverData = (mcpData as Record<string, Record<string, unknown>>)[server];
        return serverData ? String(serverData[field] ?? '') : '';
      });
    }

    // Replace context variables
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        response = response.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      }
    }

    // Add contextual information from conversation
    if (contextWindow?.activeTopics.length) {
      const topicsContext = contextWindow.activeTopics
        .map(t => t.name)
        .slice(0, 3)
        .join(', ');
      response = response.replace(/\{\{context\.topics\}\}/g, topicsContext);
    }

    return response;
  }

  /**
   * Get personalization context for a user
   */
  async getPersonalizationContext(userId: string): Promise<PersonalizationContext> {
    const userContext = await this.omniAgent.getOrCreateContext(userId);
    const memory = this.userMemories.get(userId);
    const profile = this.userProfiles.get(userId);

    // Analyze conversation patterns
    const recentMessages = memory?.getRecentMessages(20) ?? [];
    const topics = memory?.getTopics() ?? [];
    const entities = memory?.getTrackedEntities() ?? new Map();

    // Determine preferred response length
    const avgResponseLength = recentMessages
      .filter(m => m.role === 'agent')
      .reduce((acc, m) => acc + m.content.length, 0) / Math.max(1, recentMessages.length);

    const preferredLength: 'short' | 'medium' | 'long' =
      avgResponseLength < 100 ? 'short' :
      avgResponseLength < 300 ? 'medium' : 'long';

    return {
      userId,
      preferences: userContext.preferences as Record<string, unknown>,
      recentTopics: topics.filter(t => t.active).map(t => t.name),
      frequentEntities: Array.from(entities.keys()).slice(0, 10),
      interactionHistory: {
        channelsUsed: userContext.channels.map(c => c.type),
        averageResponseTime: 0, // Would need actual tracking
        preferredResponseLength: preferredLength,
      },
      mcpPreferences: {
        preferredServers: profile?.connectedServers ?? [],
        dataCategories: profile?.dataPreferences.map(d => d.category) ?? [],
      },
    };
  }

  // ===========================================================================
  // Dialogue Flows
  // ===========================================================================

  /**
   * Register a dialogue flow
   */
  registerDialogueFlow(flow: DialogueFlow): void {
    this.dialogueManager.registerFlow(flow);
  }

  /**
   * Register default MCP-powered dialogue flows
   */
  private registerDefaultFlows(): void {
    // Search flow
    this.dialogueManager.registerFlow({
      id: 'mcp-search',
      name: 'MCP Search',
      description: 'Search across connected MCP servers',
      slots: [
        { name: 'query', type: 'string', required: true, prompt: 'What would you like to search for?' },
        { name: 'servers', type: 'list', required: false, prompt: 'Which sources should I search? (or all)' },
      ],
      states: {
        start: {
          prompt: 'What would you like to search for?',
          next: 'collect-query',
        },
        'collect-query': {
          slot: 'query',
          next: 'execute-search',
        },
        'execute-search': {
          handler: async (input, context) => {
            const query = context.slots.get('query')?.value as string;
            const servers = (context.slots.get('servers')?.value as string[]) ??
              this.mcpClient.getConnections().map(c => c.id);

            const result = await this.mcpClient
              .from(servers)
              .semanticSearch(query)
              .maxResults(5)
              .format('markdown')
              .execute();

            return {
              response: `Found ${result.metadata.successfulServers} results:\n\n${result.aggregated ?? 'No results found.'}`,
              flowComplete: true,
            };
          },
          terminal: true,
        },
      },
      initialState: 'start',
      triggers: [
        { type: 'intent', value: 'query' },
        { type: 'keyword', value: 'search' },
        { type: 'keyword', value: 'find' },
        { type: 'pattern', value: /^(search|find|look for|show me)/i },
      ],
    });

    // Connect server flow
    this.dialogueManager.registerFlow({
      id: 'connect-server',
      name: 'Connect MCP Server',
      description: 'Connect to a new MCP server',
      slots: [
        { name: 'serverType', type: 'enum', required: true, prompt: 'Which service would you like to connect? (GitHub, Notion, Linear, etc.)' },
      ],
      states: {
        start: {
          prompt: 'Which service would you like to connect?',
          next: 'collect-server',
        },
        'collect-server': {
          slot: 'serverType',
          next: 'confirm-connect',
        },
        'confirm-connect': {
          prompt: (ctx) => `Connect to ${ctx.slots.get('serverType')?.value}? This will require authentication.`,
          next: 'execute-connect',
        },
        'execute-connect': {
          handler: async (input, context) => {
            if (!input.isConfirmation) {
              return { response: 'Connection cancelled.', flowComplete: true };
            }

            const serverType = context.slots.get('serverType')?.value as string;

            // In production, this would initiate OAuth flow
            return {
              response: `To connect ${serverType}, please authorize at: [Authorization Link]\n\nOnce authorized, I'll be able to search and access your ${serverType} data.`,
              flowComplete: true,
            };
          },
          terminal: true,
        },
      },
      initialState: 'start',
      triggers: [
        { type: 'keyword', value: 'connect' },
        { type: 'pattern', value: /^connect (to )?(github|notion|linear|slack)/i },
      ],
    });
  }

  // ===========================================================================
  // Proactive Features
  // ===========================================================================

  /**
   * Start proactive data fetching
   */
  private startProactiveFetching(): void {
    this.proactiveTimer = setInterval(
      () => this.performProactiveFetch(),
      this.config.proactiveFetchIntervalMs
    );
  }

  /**
   * Perform proactive data fetch for all active users
   */
  private async performProactiveFetch(): Promise<void> {
    for (const [userId, memory] of this.userMemories) {
      const recentActivity = memory.getRecentMessages(1)[0];
      if (!recentActivity) continue;

      // Check if user was recently active (within last hour)
      const lastActive = new Date(recentActivity.timestamp);
      if (Date.now() - lastActive.getTime() > 60 * 60 * 1000) continue;

      try {
        const notifications = await this.generateProactiveNotifications(userId, memory);
        if (notifications.length > 0) {
          this.emit('proactive-notifications', { userId, notifications });
        }
      } catch (error) {
        this.log(`Proactive fetch failed for ${userId}: ${error}`);
      }
    }
  }

  /**
   * Generate proactive notifications based on user context
   */
  private async generateProactiveNotifications(
    userId: string,
    memory: ConversationMemory
  ): Promise<ProactiveNotification[]> {
    const notifications: ProactiveNotification[] = [];
    const topics = memory.getTopics().filter(t => t.active);
    const profile = this.userProfiles.get(userId);

    if (!profile || topics.length === 0) return notifications;

    // Query MCP for updates on active topics
    for (const topic of topics.slice(0, 3)) {
      const servers = this.getServersForTopic(topic.name, profile);
      if (servers.length === 0) continue;

      try {
        const result = await this.mcpClient
          .from(servers)
          .semanticSearch(`updates on ${topic.name}`)
          .timeframe('today')
          .maxResults(3)
          .execute();

        if (result.aggregated && result.metadata.successfulServers > 0) {
          notifications.push({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            userId,
            type: 'update',
            title: `Updates on ${topic.name}`,
            message: `There are new updates related to ${topic.name} from your connected services.`,
            data: result.aggregated,
            priority: 'medium',
            channels: ['web'],
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      } catch (error) {
        // Ignore errors for proactive fetching
      }
    }

    return notifications;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getOrCreateMemory(userId: string): ConversationMemory {
    let memory = this.userMemories.get(userId);
    if (!memory) {
      memory = new ConversationMemory();
      this.userMemories.set(userId, memory);
    }
    return memory;
  }

  private shouldTriggerFlow(entry: MemoryEntry): boolean {
    return entry.intent?.name === 'query' ||
           entry.intent?.name === 'action' ||
           entry.content.toLowerCase().startsWith('search') ||
           entry.content.toLowerCase().startsWith('find') ||
           entry.content.toLowerCase().startsWith('connect');
  }

  private determineRelevantServers(entry: MemoryEntry, context: UserContext): string[] {
    const connectedServers = this.mcpClient.getConnections()
      .filter(c => c.status === 'connected')
      .map(c => c.id);

    if (connectedServers.length === 0) return [];

    // Use all connected servers if topics suggest broad search
    if (entry.topics.length > 2 || entry.intent?.name === 'query') {
      return connectedServers;
    }

    // Otherwise, select based on entity types and topics
    const relevantServers = new Set<string>();

    for (const entity of entry.entities) {
      switch (entity.type) {
        case 'url':
          if (entity.value.includes('github')) relevantServers.add('github');
          if (entity.value.includes('notion')) relevantServers.add('notion');
          break;
        case 'project':
        case 'task':
          connectedServers.forEach(s => relevantServers.add(s));
          break;
      }
    }

    // If no specific servers identified, use up to 3
    if (relevantServers.size === 0) {
      return connectedServers.slice(0, 3);
    }

    return Array.from(relevantServers).filter(s => connectedServers.includes(s));
  }

  private buildContextualQuery(entry: MemoryEntry, context: UserContext): string {
    let query = entry.content;

    // Extract key terms from entities
    const entityTerms = entry.entities
      .filter(e => ['project', 'task', 'person', 'organization'].includes(e.type))
      .map(e => e.value);

    if (entityTerms.length > 0) {
      query = `${entityTerms.join(' ')} ${query}`;
    }

    // Add topic context
    if (entry.topics.length > 0) {
      query = `${entry.topics.slice(0, 2).join(' ')} ${query}`;
    }

    return query.trim();
  }

  private shouldUseOrchestration(entry: MemoryEntry): boolean {
    // Use orchestration for complex queries
    return entry.entities.length > 3 ||
           entry.topics.length > 3 ||
           entry.content.includes(' and ') ||
           entry.content.includes(' then ');
  }

  private buildQueryPipeline(
    entry: MemoryEntry,
    servers: string[],
    query: string
  ): QueryPipeline {
    return createQueryPipeline('context-aware-query')
      .query('fetch-data', {
        servers,
        query,
        filters: { timeframe: { relative: 'this_week' } },
      })
      .transform('extract-relevant', (data) => {
        if (!Array.isArray(data)) return data;
        // Filter to most relevant items
        return data.slice(0, 10);
      })
      .aggregate('combine', { strategy: 'merge' })
      .build();
  }

  private trackDataUsage(
    servers: string[],
    query: string,
    result: PipelineResult | { success: boolean; data: MultiQueryResult }
  ): MCPDataUsage[] {
    return servers.map(serverId => ({
      serverId,
      query,
      dataType: 'search-result',
      relevanceScore: result.success ? 0.8 : 0,
      timestamp: new Date().toISOString(),
    }));
  }

  private async generateResponse(
    userId: string,
    message: string,
    entry: MemoryEntry,
    mcpData: MCPQueryResultWithContext,
    dialogueResponse: DialogueResponse | undefined,
    userContext: UserContext
  ): Promise<ProcessedMessage> {
    // If dialogue flow provided response, use it
    if (dialogueResponse?.response) {
      return {
        response: dialogueResponse.response,
        mcpDataUsed: mcpData.usage,
        dialogueResponse,
        personalizationScore: 0.7,
      };
    }

    // Generate response based on MCP data and context
    let response: string;

    if (mcpData.data && mcpData.usage.length > 0) {
      response = this.formatMCPResponse(mcpData.data, entry);
    } else if (entry.intent?.name === 'greeting') {
      response = 'Hello! How can I help you today?';
    } else if (entry.intent?.name === 'farewell') {
      response = 'Goodbye! Feel free to reach out anytime.';
    } else {
      response = "I'm here to help. What would you like to know?";
    }

    return {
      response,
      mcpDataUsed: mcpData.usage,
      suggestedActions: this.generateSuggestedActions(entry, mcpData),
      personalizationScore: this.calculatePersonalizationScore(entry, mcpData, userContext),
    };
  }

  private formatMCPResponse(data: unknown, entry: MemoryEntry): string {
    if (!data) return "I couldn't find relevant information.";

    if (Array.isArray(data)) {
      if (data.length === 0) return "No results found.";
      return `Here's what I found:\n\n${data.slice(0, 5).map((item, i) =>
        `${i + 1}. ${typeof item === 'object' ? JSON.stringify(item) : item}`
      ).join('\n')}`;
    }

    if (typeof data === 'string') {
      return data;
    }

    return `Found relevant data:\n\n${JSON.stringify(data, null, 2)}`;
  }

  private generateSuggestedActions(
    entry: MemoryEntry,
    mcpData: MCPQueryResultWithContext
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // Add topic-based suggestions
    for (const topic of entry.topics.slice(0, 2)) {
      actions.push({
        id: `action_${topic}`,
        label: `More about ${topic}`,
        type: 'mcp-query',
        payload: { query: topic },
      });
    }

    // Add entity-based suggestions
    for (const entity of entry.entities.slice(0, 2)) {
      if (['project', 'task', 'person'].includes(entity.type)) {
        actions.push({
          id: `action_${entity.type}_${entity.value}`,
          label: `Details on ${entity.value}`,
          type: 'mcp-query',
          payload: { query: entity.value },
        });
      }
    }

    return actions.slice(0, 4);
  }

  private calculatePersonalizationScore(
    entry: MemoryEntry,
    mcpData: MCPQueryResultWithContext,
    userContext: UserContext
  ): number {
    let score = 0.5;

    // Higher score if MCP data was used
    if (mcpData.usage.length > 0) {
      score += 0.2;
    }

    // Higher score if entities were recognized
    if (entry.entities.length > 0) {
      score += 0.1;
    }

    // Higher score if topics match user preferences
    if (userContext.preferences) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  private updateUserProfile(userId: string, mcpData: MCPQueryResultWithContext): void {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        connectedServers: [],
        queryHistory: [],
        dataPreferences: [],
        subscriptions: [],
        lastUpdated: new Date().toISOString(),
      };
      this.userProfiles.set(userId, profile);
    }

    // Update query history
    for (const usage of mcpData.usage) {
      profile.queryHistory.push({
        query: usage.query,
        servers: [usage.serverId],
        timestamp: usage.timestamp,
        resultCount: 1,
        relevanceScore: usage.relevanceScore,
      });
    }

    // Keep only recent history
    profile.queryHistory = profile.queryHistory.slice(-100);
    profile.lastUpdated = new Date().toISOString();
  }

  private async checkProactiveNotifications(
    userId: string,
    entry: MemoryEntry,
    mcpData: MCPQueryResultWithContext
  ): Promise<ProactiveNotification[]> {
    // Check if there are important updates to notify about
    return [];
  }

  private inferSubscriptionTopics(
    profile?: UserMCPProfile,
    memory?: ConversationMemory
  ): string[] {
    const topics: string[] = [];

    if (profile) {
      // Use most queried topics
      const topicCounts = new Map<string, number>();
      for (const entry of profile.queryHistory) {
        for (const word of entry.query.toLowerCase().split(/\s+/)) {
          if (word.length > 3) {
            topicCounts.set(word, (topicCounts.get(word) ?? 0) + 1);
          }
        }
      }

      topics.push(
        ...Array.from(topicCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([topic]) => topic)
      );
    }

    if (memory) {
      topics.push(...memory.getTopics().filter(t => t.active).map(t => t.name));
    }

    return [...new Set(topics)].slice(0, 5);
  }

  private getServersForTopic(topic: string, profile?: UserMCPProfile): string[] {
    // Map topics to likely servers
    const topicServerMap: Record<string, string[]> = {
      code: ['github'],
      project: ['github', 'linear', 'notion'],
      task: ['linear', 'notion'],
      document: ['notion'],
      issue: ['github', 'linear'],
    };

    const connectedServers = this.mcpClient.getConnections()
      .filter(c => c.status === 'connected')
      .map(c => c.id);

    for (const [keyword, servers] of Object.entries(topicServerMap)) {
      if (topic.toLowerCase().includes(keyword)) {
        return servers.filter(s => connectedServers.includes(s));
      }
    }

    return connectedServers.slice(0, 2);
  }

  private enrichSubscriptionData(data: SubscriptionData, userId: string): SubscriptionData {
    // Add user context to subscription data
    return {
      ...data,
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchPersonalizationData(context: PersonalizationContext): Promise<unknown> {
    if (context.mcpPreferences.preferredServers.length === 0) {
      return null;
    }

    try {
      const result = await this.mcpClient
        .from(context.mcpPreferences.preferredServers)
        .semanticSearch(context.recentTopics.join(' '))
        .maxResults(5)
        .execute();

      return result.aggregated;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
    }

    this.subscriptionManager.dispose();
    this.userMemories.clear();
    this.userProfiles.clear();
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[OmniMCPIntegration] ${message}`);
    }
  }
}

/**
 * MCP query result with context
 */
interface MCPQueryResultWithContext {
  data: unknown;
  usage: MCPDataUsage[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Omni MCP Integration instance
 */
export function createOmniMCPIntegration(
  mcpClient: MCPClient,
  omniAgent: OmniAgentClient,
  config?: Partial<OmniMCPIntegrationConfig>
): OmniMCPIntegration {
  return new OmniMCPIntegration(mcpClient, omniAgent, config);
}
