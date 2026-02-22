import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import type { SignalingMessage, ICECandidate } from './peer-connection.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface SignalingContext {
  sessionId: string;
  localPlayerId: string;
  remotePlayerId: string;
  chatId: number;
}

export interface TelegramSignalingMessage {
  id: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  payload: SignalingMessage;
  sentAt: number;
  ackId?: string;
  sequenceNumber: number;
}

export interface SignalingAck {
  id: string;
  messageId: string;
  receivedAt: number;
}

// ═══════════════════════════════════════════════════════════
// TELEGRAM SIGNALING HANDLER
// ═══════════════════════════════════════════════════════════

export class TelegramSignalingHandler extends EventEmitter {
  private signalingId: string = uuidv4();
  private context: SignalingContext;
  private sequenceNumber: number = 0;
  private pendingMessages: Map<string, TelegramSignalingMessage> = new Map();
  private receivedMessages: Set<string> = new Set();
  private ackTimeout: Map<string, NodeJS.Timeout> = new Map();
  private readonly ACK_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private retryAttempts: Map<string, number> = new Map();
  private messageHandlers: Map<
    string,
    (message: TelegramSignalingMessage) => Promise<void>
  > = new Map();
  private processingQueue: TelegramSignalingMessage[] = [];
  private isProcessing: boolean = false;

  constructor(context: SignalingContext) {
    super();
    this.context = context;

    telemetry.emit('webrtc:telegram_signaling_initialized', {
      signalingId: this.signalingId,
      sessionId: context.sessionId,
      localPlayerId: context.localPlayerId,
      remotePlayerId: context.remotePlayerId,
    });
  }

  /**
   * Send signaling message via Telegram
   */
  async sendMessage(message: SignalingMessage): Promise<void> {
    const telegramMessage: TelegramSignalingMessage = {
      id: uuidv4(),
      type: message.type,
      payload: message,
      sentAt: Date.now(),
      sequenceNumber: this.sequenceNumber++,
    };

    this.pendingMessages.set(telegramMessage.id, telegramMessage);
    this.retryAttempts.set(telegramMessage.id, 0);

    try {
      await this.transmitMessage(telegramMessage);

      // Setup acknowledgment timeout
      const timeoutId = setTimeout(() => {
        this.handleAckTimeout(telegramMessage.id);
      }, this.ACK_TIMEOUT);

      this.ackTimeout.set(telegramMessage.id, timeoutId);

      telemetry.emit('webrtc:signaling_message_sent', {
        signalingId: this.signalingId,
        messageId: telegramMessage.id,
        type: message.type,
        sequenceNumber: telegramMessage.sequenceNumber,
      });
    } catch (error) {
      this.pendingMessages.delete(telegramMessage.id);
      this.retryAttempts.delete(telegramMessage.id);

      telemetry.emit('webrtc:signaling_send_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signalingId: this.signalingId,
        messageId: telegramMessage.id,
      });

      throw error;
    }
  }

  /**
   * Handle incoming signaling message
   */
  async handleIncomingMessage(
    message: TelegramSignalingMessage
  ): Promise<void> {
    // Check for duplicates (idempotency)
    if (this.receivedMessages.has(message.id)) {
      telemetry.emit('webrtc:signaling_duplicate_message', {
        signalingId: this.signalingId,
        messageId: message.id,
      });
      return;
    }

    this.receivedMessages.add(message.id);

    // Queue message for ordered processing
    this.processingQueue.push(message);
    await this.processQueue();

    // Send acknowledgment
    this.sendAck(message.id);
  }

  /**
   * Handle acknowledgment from remote peer
   */
  handleAck(ack: SignalingAck): void {
    const timeoutId = this.ackTimeout.get(ack.messageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.ackTimeout.delete(ack.messageId);
    }

    this.pendingMessages.delete(ack.messageId);
    this.retryAttempts.delete(ack.messageId);

    telemetry.emit('webrtc:signaling_ack_received', {
      signalingId: this.signalingId,
      messageId: ack.messageId,
      latencyMs: ack.receivedAt - Date.now(),
    });
  }

  /**
   * Handle acknowledgment timeout (retry logic)
   */
  private async handleAckTimeout(messageId: string): Promise<void> {
    const message = this.pendingMessages.get(messageId);
    if (!message) return;

    const attempts = this.retryAttempts.get(messageId) || 0;

    if (attempts >= this.MAX_RETRY_ATTEMPTS) {
      this.pendingMessages.delete(messageId);
      this.retryAttempts.delete(messageId);

      telemetry.emit('webrtc:signaling_max_retries_exceeded', {
        signalingId: this.signalingId,
        messageId,
        attempts,
      });

      this.emit('signaling-error', {
        messageId,
        error: 'Max retries exceeded',
      });

      return;
    }

    telemetry.emit('webrtc:signaling_retrying', {
      signalingId: this.signalingId,
      messageId,
      attempt: attempts + 1,
    });

    this.retryAttempts.set(messageId, attempts + 1);

    try {
      await this.transmitMessage(message);

      // Reschedule timeout
      const timeoutId = setTimeout(() => {
        this.handleAckTimeout(messageId);
      }, this.ACK_TIMEOUT);

      this.ackTimeout.set(messageId, timeoutId);
    } catch (error) {
      telemetry.emit('webrtc:signaling_retry_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signalingId: this.signalingId,
        messageId,
      });

      this.handleAckTimeout(messageId);
    }
  }

  /**
   * Process queued messages in order
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        const message = this.processingQueue.shift();
        if (message) {
          await this.handleMessage(message);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Internal message handler
   */
  private async handleMessage(
    message: TelegramSignalingMessage
  ): Promise<void> {
    try {
      // Validate message sequence
      if (
        message.sequenceNumber < this.sequenceNumber - 1000 &&
        this.sequenceNumber > 1000
      ) {
        telemetry.emit('webrtc:signaling_out_of_sequence', {
          signalingId: this.signalingId,
          messageId: message.id,
          expectedMin: this.sequenceNumber - 1000,
          received: message.sequenceNumber,
        });
        return;
      }

      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        await handler(message);
      }

      this.emit('signaling-message', {
        type: message.type,
        payload: message.payload,
        messageId: message.id,
      });

      telemetry.emit('webrtc:signaling_message_processed', {
        signalingId: this.signalingId,
        messageId: message.id,
        type: message.type,
      });
    } catch (error) {
      telemetry.emit('webrtc:signaling_processing_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signalingId: this.signalingId,
        messageId: message.id,
        type: message.type,
      });

      this.emit('signaling-error', {
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Register message handler
   */
  onMessageType(
    type: string,
    handler: (message: TelegramSignalingMessage) => Promise<void>
  ): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Send acknowledgment back to peer
   */
  private async sendAck(messageId: string): Promise<void> {
    try {
      this.emit('signaling-ack', {
        messageId,
        receivedAt: Date.now(),
      });

      telemetry.emit('webrtc:signaling_ack_sent', {
        signalingId: this.signalingId,
        messageId,
      });
    } catch (error) {
      telemetry.emit('webrtc:signaling_ack_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signalingId: this.signalingId,
        messageId,
      });
    }
  }

  /**
   * Transmit message to peer via Telegram
   * This is the abstraction point where the actual Telegram bot API call happens
   */
  private async transmitMessage(
    message: TelegramSignalingMessage
  ): Promise<void> {
    // This method should be overridden or injected with actual Telegram transmission logic
    // For now, we emit an event that the application layer handles
    this.emit('transmit-message', {
      chatId: this.context.chatId,
      message,
    });
  }

  /**
   * Get signaling ID
   */
  getSignalingId(): string {
    return this.signalingId;
  }

  /**
   * Get pending messages count
   */
  getPendingMessageCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Get received messages count
   */
  getReceivedMessageCount(): number {
    return this.receivedMessages.size;
  }

  /**
   * Close signaling handler
   */
  async close(): Promise<void> {
    // Clear all timeouts
    this.ackTimeout.forEach((timeoutId) => clearTimeout(timeoutId));
    this.ackTimeout.clear();

    // Clear queues
    this.processingQueue = [];
    this.pendingMessages.clear();
    this.receivedMessages.clear();
    this.retryAttempts.clear();

    telemetry.emit('webrtc:telegram_signaling_closed', {
      signalingId: this.signalingId,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createTelegramSignalingHandler(
  context: SignalingContext
): TelegramSignalingHandler {
  return new TelegramSignalingHandler(context);
}
