/**
 * MCP Subscription Manager - Real-time data subscriptions
 *
 * Provides real-time data updates from MCP servers:
 * - WebSocket-based subscriptions
 * - Polling fallback for servers without WebSocket support
 * - Automatic reconnection with exponential backoff
 * - Subscription multiplexing
 * - Delta updates and change detection
 * - Heartbeat monitoring
 *
 * @example
 * ```typescript
 * const subscription = await mcpClient.subscribe({
 *   servers: ['github', 'linear'],
 *   query: 'active issues assigned to me',
 *   onData: (data) => console.log('New data:', data),
 *   onError: (error) => console.error('Error:', error),
 *   pollingIntervalMs: 30000,
 * });
 *
 * // Later...
 * subscription.unsubscribe();
 * ```
 */

import { EventEmitter } from 'events';
import type {
  SemanticQuery,
  QueryResult,
  MCPError,
  QueryFilters,
} from 'shared-types';

// =============================================================================
// Types
// =============================================================================

/**
 * Subscription configuration
 */
export interface SubscriptionConfig {
  /** Servers to subscribe to */
  servers: string[];
  /** Query to monitor */
  query: string;
  /** Query filters */
  filters?: QueryFilters;
  /** Data handler */
  onData: (data: SubscriptionData) => void;
  /** Error handler */
  onError?: (error: MCPError) => void;
  /** Connection state handler */
  onStateChange?: (state: SubscriptionState) => void;
  /** Polling interval for servers without WebSocket (ms) */
  pollingIntervalMs?: number;
  /** Enable delta updates only */
  deltaOnly?: boolean;
  /** Custom comparison function for change detection */
  comparator?: (oldData: unknown, newData: unknown) => boolean;
  /** Debounce updates (ms) */
  debounceMs?: number;
  /** Batch multiple updates */
  batchUpdates?: boolean;
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Batch timeout (ms) */
  batchTimeoutMs?: number;
}

/**
 * Subscription data payload
 */
export interface SubscriptionData<T = unknown> {
  serverId: string;
  query: string;
  data: T;
  delta?: DataDelta<T>;
  timestamp: string;
  sequenceNumber: number;
}

/**
 * Data delta representing changes
 */
export interface DataDelta<T = unknown> {
  added: T[];
  removed: T[];
  modified: Array<{ old: T; new: T }>;
}

/**
 * Subscription state
 */
export type SubscriptionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'
  | 'paused';

/**
 * Subscription handle for managing active subscriptions
 */
export interface Subscription {
  id: string;
  config: SubscriptionConfig;
  state: SubscriptionState;
  /** Pause the subscription */
  pause(): void;
  /** Resume the subscription */
  resume(): void;
  /** Unsubscribe and cleanup */
  unsubscribe(): void;
  /** Get current cached data */
  getCurrentData(): unknown;
  /** Get subscription statistics */
  getStats(): SubscriptionStats;
}

/**
 * Subscription statistics
 */
export interface SubscriptionStats {
  messagesReceived: number;
  errorsCount: number;
  reconnectCount: number;
  lastDataAt?: string;
  averageLatencyMs: number;
  uptime: number;
}

/**
 * WebSocket message types
 */
export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'data'
  | 'delta'
  | 'error'
  | 'heartbeat'
  | 'ack';

/**
 * WebSocket message structure
 */
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  subscriptionId: string;
  payload?: T;
  timestamp: string;
  sequenceNumber?: number;
}

/**
 * Server connection info
 */
interface ServerConnection {
  serverId: string;
  type: 'websocket' | 'polling';
  ws?: WebSocket;
  pollingTimer?: NodeJS.Timeout;
  lastData?: unknown;
  sequenceNumber: number;
  reconnectAttempts: number;
  connected: boolean;
}

/**
 * Subscription manager configuration
 */
export interface SubscriptionManagerConfig {
  /** Default polling interval (ms) */
  defaultPollingIntervalMs: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Reconnection base delay (ms) */
  reconnectBaseDelayMs: number;
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;
  /** Connection timeout (ms) */
  connectionTimeoutMs: number;
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: SubscriptionManagerConfig = {
  defaultPollingIntervalMs: 30000,
  maxReconnectAttempts: 10,
  reconnectBaseDelayMs: 1000,
  heartbeatIntervalMs: 30000,
  connectionTimeoutMs: 10000,
  debug: false,
};

// =============================================================================
// Query Executor Interface
// =============================================================================

/**
 * Interface for executing queries (implemented by MCPClient)
 */
export interface SubscriptionQueryExecutor {
  executeQuery<T>(query: SemanticQuery): Promise<{ success: true; value: QueryResult<T> } | { success: false; error: unknown }>;
  getServerWebSocketUrl?(serverId: string): string | null;
}

// =============================================================================
// Subscription Manager
// =============================================================================

/**
 * Manages real-time subscriptions to MCP data
 */
export class MCPSubscriptionManager extends EventEmitter {
  private config: SubscriptionManagerConfig;
  private executor: SubscriptionQueryExecutor;
  private subscriptions: Map<string, InternalSubscription> = new Map();
  private serverConnections: Map<string, ServerConnection> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    executor: SubscriptionQueryExecutor,
    config: Partial<SubscriptionManagerConfig> = {}
  ) {
    super();
    this.executor = executor;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new subscription
   */
  async subscribe(config: SubscriptionConfig): Promise<Subscription> {
    const subscriptionId = this.generateSubscriptionId();

    const internal: InternalSubscription = {
      id: subscriptionId,
      config,
      state: 'connecting',
      currentData: new Map(),
      stats: {
        messagesReceived: 0,
        errorsCount: 0,
        reconnectCount: 0,
        averageLatencyMs: 0,
        uptime: 0,
      },
      startedAt: Date.now(),
      sequenceNumber: 0,
      updateBuffer: [],
      debounceTimer: undefined,
      batchTimer: undefined,
    };

    this.subscriptions.set(subscriptionId, internal);

    // Setup connections for each server
    for (const serverId of config.servers) {
      await this.setupServerConnection(serverId, internal);
    }

    internal.state = 'connected';
    config.onStateChange?.('connected');

    this.log(`Subscription created: ${subscriptionId}`);

    // Return subscription handle
    return this.createSubscriptionHandle(internal);
  }

  /**
   * Unsubscribe all subscriptions for a server
   */
  unsubscribeFromServer(serverId: string): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.config.servers.includes(serverId)) {
        this.unsubscribe(id);
      }
    }
  }

  /**
   * Unsubscribe a specific subscription
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Cleanup timers
    if (subscription.debounceTimer) {
      clearTimeout(subscription.debounceTimer);
    }
    if (subscription.batchTimer) {
      clearTimeout(subscription.batchTimer);
    }

    // Cleanup server connections if no other subscriptions use them
    for (const serverId of subscription.config.servers) {
      const otherSubs = Array.from(this.subscriptions.values()).filter(
        s => s.id !== subscriptionId && s.config.servers.includes(serverId)
      );

      if (otherSubs.length === 0) {
        this.closeServerConnection(serverId);
      }
    }

    this.subscriptions.delete(subscriptionId);
    this.log(`Subscription removed: ${subscriptionId}`);
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values()).map(s =>
      this.createSubscriptionHandle(s)
    );
  }

  /**
   * Cleanup all subscriptions and connections
   */
  dispose(): void {
    // Clear heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Unsubscribe all
    for (const id of this.subscriptions.keys()) {
      this.unsubscribe(id);
    }

    // Close all server connections
    for (const serverId of this.serverConnections.keys()) {
      this.closeServerConnection(serverId);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Setup connection to a server
   */
  private async setupServerConnection(
    serverId: string,
    subscription: InternalSubscription
  ): Promise<void> {
    // Check if connection already exists
    let connection = this.serverConnections.get(serverId);

    if (!connection) {
      // Try WebSocket first
      const wsUrl = this.executor.getServerWebSocketUrl?.(serverId);

      if (wsUrl) {
        connection = await this.createWebSocketConnection(serverId, wsUrl);
      } else {
        // Fallback to polling
        connection = this.createPollingConnection(serverId);
      }

      this.serverConnections.set(serverId, connection);
    }

    // Start polling/subscribe for this subscription
    if (connection.type === 'polling') {
      this.startPolling(connection, subscription);
    } else if (connection.ws) {
      this.sendWebSocketSubscribe(connection.ws, subscription);
    }
  }

  /**
   * Create WebSocket connection
   */
  private async createWebSocketConnection(
    serverId: string,
    wsUrl: string
  ): Promise<ServerConnection> {
    return new Promise((resolve, reject) => {
      const connection: ServerConnection = {
        serverId,
        type: 'websocket',
        sequenceNumber: 0,
        reconnectAttempts: 0,
        connected: false,
      };

      // In Node.js environment, we'd use 'ws' package
      // For browser compatibility, using native WebSocket
      if (typeof WebSocket !== 'undefined') {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          connection.connected = true;
          connection.ws = ws;
          this.log(`WebSocket connected to ${serverId}`);
          resolve(connection);
        };

        ws.onmessage = (event) => {
          this.handleWebSocketMessage(serverId, event.data);
        };

        ws.onerror = (error) => {
          this.log(`WebSocket error for ${serverId}: ${error}`);
          this.handleConnectionError(serverId, error);
        };

        ws.onclose = () => {
          connection.connected = false;
          this.handleConnectionClose(serverId);
        };

        // Timeout
        setTimeout(() => {
          if (!connection.connected) {
            ws.close();
            // Fallback to polling
            resolve(this.createPollingConnection(serverId));
          }
        }, this.config.connectionTimeoutMs);
      } else {
        // No WebSocket support, use polling
        resolve(this.createPollingConnection(serverId));
      }
    });
  }

  /**
   * Create polling connection
   */
  private createPollingConnection(serverId: string): ServerConnection {
    return {
      serverId,
      type: 'polling',
      sequenceNumber: 0,
      reconnectAttempts: 0,
      connected: true,
    };
  }

  /**
   * Start polling for a subscription
   */
  private startPolling(
    connection: ServerConnection,
    subscription: InternalSubscription
  ): void {
    const poll = async () => {
      if (subscription.state === 'paused') return;

      try {
        const result = await this.executor.executeQuery({
          server: connection.serverId,
          query: subscription.config.query,
          filters: subscription.config.filters,
        });

        if (result.success) {
          this.handleDataUpdate(connection.serverId, subscription, result.value.data);
        }
      } catch (error) {
        subscription.stats.errorsCount++;
        subscription.config.onError?.({
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Polling failed',
          serverId: connection.serverId,
          retryable: true,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // Initial poll
    poll();

    // Setup interval
    const intervalMs =
      subscription.config.pollingIntervalMs ?? this.config.defaultPollingIntervalMs;

    connection.pollingTimer = setInterval(poll, intervalMs);
  }

  /**
   * Send WebSocket subscribe message
   */
  private sendWebSocketSubscribe(ws: WebSocket, subscription: InternalSubscription): void {
    const message: WSMessage = {
      type: 'subscribe',
      subscriptionId: subscription.id,
      payload: {
        query: subscription.config.query,
        filters: subscription.config.filters,
        deltaOnly: subscription.config.deltaOnly,
      },
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(serverId: string, rawData: string): void {
    try {
      const message: WSMessage = JSON.parse(rawData);

      switch (message.type) {
        case 'data':
        case 'delta': {
          const subscription = this.subscriptions.get(message.subscriptionId);
          if (subscription) {
            this.handleDataUpdate(serverId, subscription, message.payload, message.type === 'delta');
          }
          break;
        }

        case 'error': {
          const subscription = this.subscriptions.get(message.subscriptionId);
          if (subscription) {
            subscription.stats.errorsCount++;
            subscription.config.onError?.(message.payload as MCPError);
          }
          break;
        }

        case 'heartbeat':
          // Update connection health
          break;

        case 'ack':
          // Subscription acknowledged
          break;
      }
    } catch (error) {
      this.log(`Failed to parse WebSocket message: ${error}`);
    }
  }

  /**
   * Handle data update from server
   */
  private handleDataUpdate(
    serverId: string,
    subscription: InternalSubscription,
    newData: unknown,
    isDelta = false
  ): void {
    const oldData = subscription.currentData.get(serverId);
    subscription.sequenceNumber++;

    // Check for changes if deltaOnly mode
    if (subscription.config.deltaOnly && !isDelta) {
      const hasChanges = subscription.config.comparator
        ? !subscription.config.comparator(oldData, newData)
        : JSON.stringify(oldData) !== JSON.stringify(newData);

      if (!hasChanges) {
        return;
      }
    }

    // Calculate delta
    const delta = isDelta ? (newData as DataDelta) : this.calculateDelta(oldData, newData);

    // Update cached data
    subscription.currentData.set(serverId, newData);
    subscription.stats.messagesReceived++;
    subscription.stats.lastDataAt = new Date().toISOString();

    // Create subscription data
    const subscriptionData: SubscriptionData = {
      serverId,
      query: subscription.config.query,
      data: newData,
      delta,
      timestamp: new Date().toISOString(),
      sequenceNumber: subscription.sequenceNumber,
    };

    // Handle debouncing
    if (subscription.config.debounceMs) {
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }
      subscription.debounceTimer = setTimeout(() => {
        this.deliverUpdate(subscription, subscriptionData);
      }, subscription.config.debounceMs);
      return;
    }

    // Handle batching
    if (subscription.config.batchUpdates) {
      subscription.updateBuffer.push(subscriptionData);

      if (subscription.updateBuffer.length >= (subscription.config.maxBatchSize ?? 10)) {
        this.flushUpdateBuffer(subscription);
      } else if (!subscription.batchTimer) {
        subscription.batchTimer = setTimeout(() => {
          this.flushUpdateBuffer(subscription);
        }, subscription.config.batchTimeoutMs ?? 100);
      }
      return;
    }

    // Deliver immediately
    this.deliverUpdate(subscription, subscriptionData);
  }

  /**
   * Deliver update to subscription handler
   */
  private deliverUpdate(subscription: InternalSubscription, data: SubscriptionData): void {
    try {
      subscription.config.onData(data);
    } catch (error) {
      this.log(`Error in subscription handler: ${error}`);
    }
  }

  /**
   * Flush batched updates
   */
  private flushUpdateBuffer(subscription: InternalSubscription): void {
    if (subscription.batchTimer) {
      clearTimeout(subscription.batchTimer);
      subscription.batchTimer = undefined;
    }

    if (subscription.updateBuffer.length === 0) return;

    // Deliver all buffered updates
    for (const data of subscription.updateBuffer) {
      this.deliverUpdate(subscription, data);
    }

    subscription.updateBuffer = [];
  }

  /**
   * Calculate delta between old and new data
   */
  private calculateDelta(oldData: unknown, newData: unknown): DataDelta {
    const delta: DataDelta = {
      added: [],
      removed: [],
      modified: [],
    };

    if (!oldData || !newData) {
      if (newData && Array.isArray(newData)) {
        delta.added = newData;
      }
      return delta;
    }

    // Simple array comparison
    if (Array.isArray(oldData) && Array.isArray(newData)) {
      const oldSet = new Set(oldData.map(i => JSON.stringify(i)));
      const newSet = new Set(newData.map(i => JSON.stringify(i)));

      for (const item of newData) {
        const key = JSON.stringify(item);
        if (!oldSet.has(key)) {
          delta.added.push(item);
        }
      }

      for (const item of oldData) {
        const key = JSON.stringify(item);
        if (!newSet.has(key)) {
          delta.removed.push(item);
        }
      }
    }

    return delta;
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(serverId: string, error: unknown): void {
    const connection = this.serverConnections.get(serverId);
    if (!connection) return;

    connection.connected = false;

    // Notify affected subscriptions
    for (const sub of this.subscriptions.values()) {
      if (sub.config.servers.includes(serverId)) {
        sub.state = 'error';
        sub.config.onStateChange?.('error');
      }
    }

    // Attempt reconnection
    this.attemptReconnection(serverId);
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(serverId: string): void {
    const connection = this.serverConnections.get(serverId);
    if (!connection) return;

    connection.connected = false;

    // Attempt reconnection
    this.attemptReconnection(serverId);
  }

  /**
   * Attempt to reconnect to server
   */
  private async attemptReconnection(serverId: string): Promise<void> {
    const connection = this.serverConnections.get(serverId);
    if (!connection) return;

    if (connection.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log(`Max reconnection attempts reached for ${serverId}`);
      return;
    }

    connection.reconnectAttempts++;

    // Update subscription states
    for (const sub of this.subscriptions.values()) {
      if (sub.config.servers.includes(serverId)) {
        sub.state = 'reconnecting';
        sub.config.onStateChange?.('reconnecting');
        sub.stats.reconnectCount++;
      }
    }

    // Exponential backoff
    const delay =
      this.config.reconnectBaseDelayMs * Math.pow(2, connection.reconnectAttempts - 1);

    this.log(`Reconnecting to ${serverId} in ${delay}ms (attempt ${connection.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    // Try to reconnect
    if (connection.type === 'websocket' && this.executor.getServerWebSocketUrl) {
      const wsUrl = this.executor.getServerWebSocketUrl(serverId);
      if (wsUrl) {
        try {
          const newConnection = await this.createWebSocketConnection(serverId, wsUrl);
          this.serverConnections.set(serverId, newConnection);

          // Re-subscribe all subscriptions
          for (const sub of this.subscriptions.values()) {
            if (sub.config.servers.includes(serverId) && newConnection.ws) {
              this.sendWebSocketSubscribe(newConnection.ws, sub);
              sub.state = 'connected';
              sub.config.onStateChange?.('connected');
            }
          }
        } catch (error) {
          this.handleConnectionError(serverId, error);
        }
      }
    }
  }

  /**
   * Close server connection
   */
  private closeServerConnection(serverId: string): void {
    const connection = this.serverConnections.get(serverId);
    if (!connection) return;

    if (connection.ws) {
      connection.ws.close();
    }

    if (connection.pollingTimer) {
      clearInterval(connection.pollingTimer);
    }

    this.serverConnections.delete(serverId);
  }

  /**
   * Create subscription handle
   */
  private createSubscriptionHandle(internal: InternalSubscription): Subscription {
    return {
      id: internal.id,
      config: internal.config,
      state: internal.state,

      pause: () => {
        internal.state = 'paused';
        internal.config.onStateChange?.('paused');
      },

      resume: () => {
        internal.state = 'connected';
        internal.config.onStateChange?.('connected');
      },

      unsubscribe: () => {
        this.unsubscribe(internal.id);
      },

      getCurrentData: () => {
        return Object.fromEntries(internal.currentData);
      },

      getStats: () => ({
        ...internal.stats,
        uptime: Date.now() - internal.startedAt,
      }),
    };
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[MCPSubscriptionManager] ${message}`);
    }
  }
}

/**
 * Internal subscription state
 */
interface InternalSubscription {
  id: string;
  config: SubscriptionConfig;
  state: SubscriptionState;
  currentData: Map<string, unknown>;
  stats: SubscriptionStats;
  startedAt: number;
  sequenceNumber: number;
  updateBuffer: SubscriptionData[];
  debounceTimer?: NodeJS.Timeout;
  batchTimer?: NodeJS.Timeout;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a subscription manager
 */
export function createSubscriptionManager(
  executor: SubscriptionQueryExecutor,
  config?: Partial<SubscriptionManagerConfig>
): MCPSubscriptionManager {
  return new MCPSubscriptionManager(executor, config);
}
