/**
 * Omni Agent Client - Revolutionary multi-channel MCP client
 *
 * Inspired by InteractionCo's poke.com and ClawdBot, this client enables:
 * - Multi-channel communication (phone, SMS, iMessage, web, etc.)
 * - Always-on persistent state with real-time synchronization
 * - Event-driven architecture for reactive interactions
 * - Pluggable channel adapters for extensibility
 * - Intelligent context preservation across sessions
 * - Background task processing and scheduling
 *
 * @example
 * ```typescript
 * const omni = new OmniAgentClient({ agentId: 'my-agent' });
 *
 * // Register communication channels
 * omni.registerChannel('sms', new TwilioSMSAdapter(config));
 * omni.registerChannel('imessage', new iMessageAdapter(config));
 * omni.registerChannel('voice', new VoiceAdapter(config));
 *
 * // Handle incoming messages from any channel
 * omni.onMessage(async (message, channel) => {
 *   const context = await omni.getContext(message.userId);
 *   const response = await omni.processWithMCP(message, context);
 *   await channel.send(response);
 * });
 *
 * // Query MCP with context preservation
 * const results = await omni
 *   .from(['notion', 'github'])
 *   .withContext(userContext)
 *   .semanticSearch('project updates')
 *   .execute();
 * ```
 */

import { EventEmitter } from 'events';
import type {
  MCPConnection,
  MCPConfig,
  MultiQueryResult,
  Result,
  CacheConfig,
  RetryConfig,
  AuthCredentials,
} from 'shared-types';
import { MCPClient } from '../client/MCPClient';
import { MCPCache } from '../cache/MCPCache';
import { AuthProviderRegistry, createAuthProvider, type AuthProviderConfig } from '../auth/AuthProviders';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Supported communication channels
 */
export type ChannelType = 'sms' | 'imessage' | 'voice' | 'web' | 'slack' | 'discord' | 'telegram' | 'email' | 'custom';

/**
 * Message structure for cross-channel communication
 */
export interface OmniMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;
  userId: string;
  content: string;
  contentType: 'text' | 'voice' | 'image' | 'file';
  metadata?: Record<string, unknown>;
  timestamp: string;
  replyTo?: string;
}

/**
 * User context that persists across sessions
 */
export interface UserContext {
  userId: string;
  displayName?: string;
  preferences: UserPreferences;
  conversationHistory: ConversationEntry[];
  mcpData: Record<string, unknown>;
  lastActiveAt: string;
  channels: ConnectedChannel[];
  state: UserState;
}

/**
 * User preferences
 */
export interface UserPreferences {
  preferredChannel: ChannelType;
  language: string;
  timezone: string;
  notificationSettings: NotificationSettings;
  privacyLevel: 'minimal' | 'standard' | 'full';
}

/**
 * Notification settings
 */
export interface NotificationSettings {
  enabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  allowedChannels: ChannelType[];
}

/**
 * Conversation history entry
 */
export interface ConversationEntry {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  channelType: ChannelType;
  timestamp: string;
  mcpDataUsed?: string[];
}

/**
 * Connected channel for a user
 */
export interface ConnectedChannel {
  type: ChannelType;
  identifier: string;
  connectedAt: string;
  lastUsedAt: string;
  verified: boolean;
}

/**
 * User state for persistence
 */
export interface UserState {
  currentTask?: string;
  pendingActions: PendingAction[];
  scheduledTasks: ScheduledTask[];
  variables: Record<string, unknown>;
}

/**
 * Pending action awaiting user response
 */
export interface PendingAction {
  id: string;
  type: string;
  prompt: string;
  options?: string[];
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Scheduled task for background processing
 */
export interface ScheduledTask {
  id: string;
  type: string;
  scheduledFor: string;
  recurring?: {
    interval: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    time?: string;
  };
  payload: Record<string, unknown>;
}

/**
 * Channel adapter interface
 */
export interface ChannelAdapter {
  type: ChannelType;
  name: string;

  /** Initialize the channel */
  initialize(): Promise<void>;

  /** Send a message */
  send(userId: string, content: string, options?: SendOptions): Promise<void>;

  /** Send a rich message with attachments */
  sendRich(userId: string, message: RichMessage): Promise<void>;

  /** Subscribe to incoming messages */
  onMessage(handler: MessageHandler): void;

  /** Get channel status */
  getStatus(): ChannelStatus;

  /** Disconnect */
  disconnect(): Promise<void>;
}

/**
 * Send options
 */
export interface SendOptions {
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Rich message with attachments
 */
export interface RichMessage {
  content: string;
  attachments?: Attachment[];
  buttons?: MessageButton[];
  quickReplies?: string[];
}

/**
 * Message attachment
 */
export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  name?: string;
  mimeType?: string;
}

/**
 * Interactive button
 */
export interface MessageButton {
  id: string;
  label: string;
  action: string;
  data?: unknown;
}

/**
 * Message handler function
 */
export type MessageHandler = (message: OmniMessage) => void | Promise<void>;

/**
 * Channel status
 */
export interface ChannelStatus {
  connected: boolean;
  lastPingAt?: string;
  error?: string;
}

/**
 * Omni Agent configuration
 */
export interface OmniAgentConfig {
  agentId: string;
  agentName?: string;
  mcpConfig?: {
    cache?: Partial<CacheConfig>;
    retry?: Partial<RetryConfig>;
  };
  persistence?: {
    adapter: PersistenceAdapter;
  };
  maxConversationHistory?: number;
  contextTtlMs?: number;
  debug?: boolean;
}

/**
 * Persistence adapter interface
 */
export interface PersistenceAdapter {
  getContext(userId: string): Promise<UserContext | null>;
  saveContext(context: UserContext): Promise<void>;
  deleteContext(userId: string): Promise<void>;
  listUsers(filter?: { lastActiveAfter?: string }): Promise<string[]>;
}

/**
 * In-memory persistence adapter
 */
export class InMemoryPersistence implements PersistenceAdapter {
  private contexts: Map<string, UserContext> = new Map();

  async getContext(userId: string): Promise<UserContext | null> {
    return this.contexts.get(userId) ?? null;
  }

  async saveContext(context: UserContext): Promise<void> {
    this.contexts.set(context.userId, context);
  }

  async deleteContext(userId: string): Promise<void> {
    this.contexts.delete(userId);
  }

  async listUsers(filter?: { lastActiveAfter?: string }): Promise<string[]> {
    const users = Array.from(this.contexts.values());
    if (filter?.lastActiveAfter) {
      const threshold = new Date(filter.lastActiveAfter);
      return users
        .filter(u => new Date(u.lastActiveAt) >= threshold)
        .map(u => u.userId);
    }
    return users.map(u => u.userId);
  }
}

// =============================================================================
// Omni Agent Client
// =============================================================================

/**
 * Revolutionary multi-channel MCP client for Omni Agents
 */
export class OmniAgentClient extends EventEmitter {
  private config: Required<OmniAgentConfig>;
  private mcpClient: MCPClient;
  private channels: Map<ChannelType, ChannelAdapter> = new Map();
  private persistence: PersistenceAdapter;
  private messageHandlers: Set<(message: OmniMessage, context: UserContext) => Promise<void>> = new Set();
  private isRunning = false;
  private taskScheduler?: NodeJS.Timeout;

  constructor(config: OmniAgentConfig) {
    super();

    this.config = {
      agentId: config.agentId,
      agentName: config.agentName ?? 'Omni Agent',
      mcpConfig: config.mcpConfig ?? {},
      persistence: config.persistence ?? { adapter: new InMemoryPersistence() },
      maxConversationHistory: config.maxConversationHistory ?? 100,
      contextTtlMs: config.contextTtlMs ?? 24 * 60 * 60 * 1000, // 24 hours
      debug: config.debug ?? false,
    };

    this.mcpClient = new MCPClient({
      ...this.config.mcpConfig,
      debug: this.config.debug,
    });

    this.persistence = this.config.persistence.adapter;
  }

  // ===========================================================================
  // Channel Management
  // ===========================================================================

  /**
   * Register a communication channel
   */
  async registerChannel(type: ChannelType, adapter: ChannelAdapter): Promise<void> {
    this.log(`Registering channel: ${type}`);

    await adapter.initialize();

    adapter.onMessage(async (message) => {
      await this.handleIncomingMessage(message);
    });

    this.channels.set(type, adapter);
    this.emit('channel:registered', { type, status: adapter.getStatus() });
  }

  /**
   * Unregister a channel
   */
  async unregisterChannel(type: ChannelType): Promise<void> {
    const adapter = this.channels.get(type);
    if (adapter) {
      await adapter.disconnect();
      this.channels.delete(type);
      this.emit('channel:unregistered', { type });
    }
  }

  /**
   * Get registered channels
   */
  getChannels(): Map<ChannelType, ChannelStatus> {
    const status = new Map<ChannelType, ChannelStatus>();
    for (const [type, adapter] of this.channels) {
      status.set(type, adapter.getStatus());
    }
    return status;
  }

  // ===========================================================================
  // MCP Connection
  // ===========================================================================

  /**
   * Connect to an MCP server
   */
  async connectMCP(
    serverId: string,
    config: MCPConfig,
    authConfig?: AuthProviderConfig
  ): Promise<Result<MCPConnection>> {
    return this.mcpClient.connect(serverId, config, authConfig);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectMCP(serverId: string): Promise<Result<void>> {
    return this.mcpClient.disconnect(serverId);
  }

  /**
   * Start building a contextual MCP query
   */
  from<T = unknown>(servers: string | string[]) {
    return new ContextualQueryBuilder<T>(this.mcpClient, servers);
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  /**
   * Register a message handler
   */
  onMessage(handler: (message: OmniMessage, context: UserContext) => Promise<void>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Send a message to a user via their preferred channel
   */
  async sendMessage(
    userId: string,
    content: string,
    options?: { channel?: ChannelType; replyTo?: string }
  ): Promise<void> {
    const context = await this.getOrCreateContext(userId);
    const channelType = options?.channel ?? context.preferences.preferredChannel;
    const adapter = this.channels.get(channelType);

    if (!adapter) {
      throw new Error(`Channel ${channelType} is not registered`);
    }

    await adapter.send(userId, content, { replyTo: options?.replyTo });

    // Record in conversation history
    await this.addToHistory(context, {
      id: this.generateId(),
      role: 'agent',
      content,
      channelType,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a rich message with buttons/attachments
   */
  async sendRichMessage(
    userId: string,
    message: RichMessage,
    options?: { channel?: ChannelType }
  ): Promise<void> {
    const context = await this.getOrCreateContext(userId);
    const channelType = options?.channel ?? context.preferences.preferredChannel;
    const adapter = this.channels.get(channelType);

    if (!adapter) {
      throw new Error(`Channel ${channelType} is not registered`);
    }

    await adapter.sendRich(userId, message);
  }

  /**
   * Handle incoming message from any channel
   */
  private async handleIncomingMessage(message: OmniMessage): Promise<void> {
    this.log(`Received message from ${message.channelType}: ${message.userId}`);

    try {
      // Get or create user context
      const context = await this.getOrCreateContext(message.userId);

      // Update last active time
      context.lastActiveAt = new Date().toISOString();

      // Add to conversation history
      await this.addToHistory(context, {
        id: message.id,
        role: 'user',
        content: message.content,
        channelType: message.channelType,
        timestamp: message.timestamp,
      });

      // Emit event
      this.emit('message:received', { message, context });

      // Call registered handlers
      for (const handler of this.messageHandlers) {
        try {
          await handler(message, context);
        } catch (error) {
          this.log(`Handler error: ${error}`);
          this.emit('handler:error', { message, error });
        }
      }

    } catch (error) {
      this.log(`Error handling message: ${error}`);
      this.emit('message:error', { message, error });
    }
  }

  // ===========================================================================
  // Context Management
  // ===========================================================================

  /**
   * Get or create user context
   */
  async getOrCreateContext(userId: string): Promise<UserContext> {
    let context = await this.persistence.getContext(userId);

    if (!context) {
      context = this.createDefaultContext(userId);
      await this.persistence.saveContext(context);
    }

    return context;
  }

  /**
   * Update user context
   */
  async updateContext(userId: string, updates: Partial<UserContext>): Promise<UserContext> {
    const context = await this.getOrCreateContext(userId);
    const updated = { ...context, ...updates };
    await this.persistence.saveContext(updated);
    return updated;
  }

  /**
   * Get MCP data for context
   */
  async enrichContextWithMCP(
    context: UserContext,
    servers: string[],
    query: string
  ): Promise<UserContext> {
    try {
      const result = await this.mcpClient
        .from(servers)
        .semanticSearch(query)
        .maxResults(10)
        .execute();

      context.mcpData = {
        ...context.mcpData,
        lastQuery: {
          query,
          result: result.aggregated,
          timestamp: new Date().toISOString(),
        },
      };

      await this.persistence.saveContext(context);
    } catch (error) {
      this.log(`MCP enrichment failed: ${error}`);
    }

    return context;
  }

  /**
   * Create default context for new user
   */
  private createDefaultContext(userId: string): UserContext {
    return {
      userId,
      preferences: {
        preferredChannel: 'web',
        language: 'en',
        timezone: 'UTC',
        notificationSettings: {
          enabled: true,
          allowedChannels: ['web', 'email'],
        },
        privacyLevel: 'standard',
      },
      conversationHistory: [],
      mcpData: {},
      lastActiveAt: new Date().toISOString(),
      channels: [],
      state: {
        pendingActions: [],
        scheduledTasks: [],
        variables: {},
      },
    };
  }

  /**
   * Add entry to conversation history
   */
  private async addToHistory(context: UserContext, entry: ConversationEntry): Promise<void> {
    context.conversationHistory.push(entry);

    // Trim history if needed
    if (context.conversationHistory.length > this.config.maxConversationHistory) {
      context.conversationHistory = context.conversationHistory.slice(
        -this.config.maxConversationHistory
      );
    }

    await this.persistence.saveContext(context);
  }

  // ===========================================================================
  // Task Scheduling
  // ===========================================================================

  /**
   * Schedule a task for a user
   */
  async scheduleTask(
    userId: string,
    task: Omit<ScheduledTask, 'id'>
  ): Promise<string> {
    const context = await this.getOrCreateContext(userId);
    const id = this.generateId();

    context.state.scheduledTasks.push({ id, ...task });
    await this.persistence.saveContext(context);

    this.emit('task:scheduled', { userId, taskId: id });
    return id;
  }

  /**
   * Cancel a scheduled task
   */
  async cancelTask(userId: string, taskId: string): Promise<boolean> {
    const context = await this.getOrCreateContext(userId);
    const initialLength = context.state.scheduledTasks.length;

    context.state.scheduledTasks = context.state.scheduledTasks.filter(
      t => t.id !== taskId
    );

    if (context.state.scheduledTasks.length < initialLength) {
      await this.persistence.saveContext(context);
      this.emit('task:cancelled', { userId, taskId });
      return true;
    }

    return false;
  }

  /**
   * Set a pending action awaiting user response
   */
  async setPendingAction(
    userId: string,
    action: Omit<PendingAction, 'id'>
  ): Promise<string> {
    const context = await this.getOrCreateContext(userId);
    const id = this.generateId();

    context.state.pendingActions.push({ id, ...action });
    await this.persistence.saveContext(context);

    return id;
  }

  /**
   * Resolve a pending action
   */
  async resolvePendingAction(
    userId: string,
    actionId: string,
    response: string
  ): Promise<PendingAction | null> {
    const context = await this.getOrCreateContext(userId);
    const actionIndex = context.state.pendingActions.findIndex(
      a => a.id === actionId
    );

    if (actionIndex === -1) return null;

    const [action] = context.state.pendingActions.splice(actionIndex, 1);
    await this.persistence.saveContext(context);

    this.emit('action:resolved', { userId, action, response });
    return action;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start the Omni Agent
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.log('Starting Omni Agent...');
    this.isRunning = true;

    // Start task scheduler
    this.taskScheduler = setInterval(() => this.processScheduledTasks(), 60000);

    this.emit('agent:started', { agentId: this.config.agentId });
    this.log('Omni Agent started');
  }

  /**
   * Stop the Omni Agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.log('Stopping Omni Agent...');
    this.isRunning = false;

    if (this.taskScheduler) {
      clearInterval(this.taskScheduler);
    }

    // Disconnect all channels
    for (const [type, adapter] of this.channels) {
      try {
        await adapter.disconnect();
      } catch (error) {
        this.log(`Error disconnecting ${type}: ${error}`);
      }
    }

    this.emit('agent:stopped', { agentId: this.config.agentId });
    this.log('Omni Agent stopped');
  }

  /**
   * Process scheduled tasks
   */
  private async processScheduledTasks(): Promise<void> {
    const now = new Date();
    const users = await this.persistence.listUsers();

    for (const userId of users) {
      const context = await this.persistence.getContext(userId);
      if (!context) continue;

      const dueTasks = context.state.scheduledTasks.filter(
        task => new Date(task.scheduledFor) <= now
      );

      for (const task of dueTasks) {
        this.emit('task:due', { userId, task });

        // Remove or reschedule task
        if (task.recurring) {
          // Reschedule for next occurrence
          const nextDate = this.calculateNextOccurrence(task);
          task.scheduledFor = nextDate.toISOString();
        } else {
          // Remove one-time task
          context.state.scheduledTasks = context.state.scheduledTasks.filter(
            t => t.id !== task.id
          );
        }
      }

      if (dueTasks.length > 0) {
        await this.persistence.saveContext(context);
      }
    }
  }

  /**
   * Calculate next occurrence for recurring task
   */
  private calculateNextOccurrence(task: ScheduledTask): Date {
    const current = new Date(task.scheduledFor);
    const next = new Date(current);

    switch (task.recurring?.interval) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
    }

    return next;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[OmniAgent:${this.config.agentId}] ${message}`);
    }
  }
}

// =============================================================================
// Contextual Query Builder
// =============================================================================

/**
 * Query builder with context support
 */
class ContextualQueryBuilder<T = unknown> {
  private mcpClient: MCPClient;
  private servers: string[];
  private userContext?: UserContext;

  constructor(mcpClient: MCPClient, servers: string | string[]) {
    this.mcpClient = mcpClient;
    this.servers = Array.isArray(servers) ? servers : [servers];
  }

  /**
   * Add user context to the query
   */
  withContext(context: UserContext): this {
    this.userContext = context;
    return this;
  }

  /**
   * Execute semantic search with context
   */
  semanticSearch(query: string) {
    // Enhance query with context if available
    let enhancedQuery = query;
    if (this.userContext) {
      // Add relevant context to query
      const preferences = this.userContext.preferences;
      enhancedQuery = `${query} [user_preference: ${preferences.language}, ${preferences.timezone}]`;
    }

    return this.mcpClient.from<T>(this.servers).semanticSearch(enhancedQuery);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Omni Agent client
 */
export function createOmniAgent(config: OmniAgentConfig): OmniAgentClient {
  return new OmniAgentClient(config);
}

/**
 * Create a basic channel adapter for testing
 */
export function createMockChannelAdapter(type: ChannelType): ChannelAdapter {
  const messageHandlers: MessageHandler[] = [];

  return {
    type,
    name: `Mock ${type} Channel`,

    async initialize() {
      console.log(`Mock ${type} channel initialized`);
    },

    async send(userId: string, content: string) {
      console.log(`[Mock ${type}] To ${userId}: ${content}`);
    },

    async sendRich(userId: string, message: RichMessage) {
      console.log(`[Mock ${type}] Rich message to ${userId}:`, message);
    },

    onMessage(handler: MessageHandler) {
      messageHandlers.push(handler);
    },

    getStatus() {
      return { connected: true, lastPingAt: new Date().toISOString() };
    },

    async disconnect() {
      console.log(`Mock ${type} channel disconnected`);
    },
  };
}
