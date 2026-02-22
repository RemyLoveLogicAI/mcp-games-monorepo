import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import {
  PeerConnectionManager,
  ConnectionState,
  createPeerConnectionManager,
  type PeerConnectionConfig,
  type SignalingMessage,
  type ICECandidate,
} from './peer-connection.js';
import {
  TelegramSignalingHandler,
  createTelegramSignalingHandler,
  type SignalingContext,
  type TelegramSignalingMessage,
} from './telegram-signaling.js';
import {
  ICEManager,
  createICEManager,
  type ICEConnectionDiagnostics,
} from './ice-manager.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface OrchestrationConfig {
  sessionId: string;
  localPlayerId: string;
  remotePlayerId: string;
  chatId: number;
  iceServers: RTCIceServer[];
  isInitiator: boolean;
  maxReconnectAttempts?: number;
}

export interface ConnectionMetrics {
  orchestrationId: string;
  sessionId: string;
  state: ConnectionState;
  isInitiator: boolean;
  connectionDuration: number;
  iceDiagnostics: ICEConnectionDiagnostics | null;
  dataChannelsOpen: number;
  audioTracksActive: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════
// CONNECTION ORCHESTRATOR
// ═══════════════════════════════════════════════════════════

export class WebRTCConnectionOrchestrator extends EventEmitter {
  private orchestrationId: string = uuidv4();
  private config: OrchestrationConfig;
  private peerConnectionManager: PeerConnectionManager | null = null;
  private signalingHandler: TelegramSignalingHandler | null = null;
  private iceManager: ICEManager | null = null;
  private initialisationPromise: Promise<void> | null = null;
  private startTime: number = Date.now();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private offerHandled: boolean = false;
  private answerHandled: boolean = false;

  constructor(config: OrchestrationConfig) {
    super();
    this.config = {
      maxReconnectAttempts: 5,
      ...config,
    };

    telemetry.emit('webrtc:orchestrator_created', {
      orchestrationId: this.orchestrationId,
      sessionId: config.sessionId,
      isInitiator: config.isInitiator,
    });
  }

  /**
   * Initialize WebRTC connection orchestration
   */
  async initialize(): Promise<void> {
    if (this.initialisationPromise) {
      return this.initialisationPromise;
    }

    this.initialisationPromise = this._performInitialization();
    return this.initialisationPromise;
  }

  private async _performInitialization(): Promise<void> {
    try {
      // Initialize peer connection
      const peerConfig: PeerConnectionConfig = {
        iceServers: this.config.iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      };

      this.peerConnectionManager = createPeerConnectionManager(peerConfig);
      await this.peerConnectionManager.initialize();

      // Initialize signaling
      const signalingContext: SignalingContext = {
        sessionId: this.config.sessionId,
        localPlayerId: this.config.localPlayerId,
        remotePlayerId: this.config.remotePlayerId,
        chatId: this.config.chatId,
      };

      this.signalingHandler =
        createTelegramSignalingHandler(signalingContext);
      this.setupSignalingHandlers();

      // Initialize ICE manager
      if (this.peerConnectionManager.peerConnectionInstance) {
        this.iceManager = createICEManager(this.peerConnectionManager.peerConnectionInstance as any);
        this.iceManager.startMonitoring();
        this.setupICEHandlers();
      }

      // Setup peer connection event handlers
      this.setupPeerConnectionHandlers();

      telemetry.emit('webrtc:orchestrator_initialized', {
        orchestrationId: this.orchestrationId,
      });

      // If initiator, create and send offer
      if (this.config.isInitiator) {
        await this.createAndSendOffer();
      }

      // Emit ready event
      this.emit('ready');
    } catch (error) {
      telemetry.emit('webrtc:orchestrator_initialization_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrationId: this.orchestrationId,
      });

      throw error;
    }
  }

  /**
   * Handle incoming signaling message from peer
   */
  async handleSignalingMessage(
    message: TelegramSignalingMessage
  ): Promise<void> {
    if (!this.signalingHandler) {
      throw new Error('Orchestrator not initialized');
    }

    try {
      await this.signalingHandler.handleIncomingMessage(message);
    } catch (error) {
      telemetry.emit('webrtc:orchestrator_signaling_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrationId: this.orchestrationId,
        messageType: message.type,
      });

      throw error;
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleICECandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnectionManager) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnectionManager.addICECandidate(candidate);

      if (this.iceManager) {
        this.iceManager.processCandidateString(candidate.candidate);
      }

      telemetry.emit('webrtc:orchestrator_ice_candidate_handled', {
        orchestrationId: this.orchestrationId,
      });
    } catch (error) {
      telemetry.emit('webrtc:orchestrator_ice_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrationId: this.orchestrationId,
      });

      throw error;
    }
  }

  /**
   * Send data through established data channel
   */
  sendData(label: string, data: string | ArrayBuffer): void {
    if (!this.peerConnectionManager) {
      throw new Error('Peer connection not initialized');
    }

    this.peerConnectionManager.sendData(label, data);
  }

  /**
   * Create data channel
   */
  createDataChannel(label: string): RTCDataChannel {
    if (!this.peerConnectionManager) {
      throw new Error('Peer connection not initialized');
    }

    return this.peerConnectionManager.createDataChannel(label);
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    if (!this.peerConnectionManager) {
      throw new Error('Peer connection not initialized');
    }

    return {
      orchestrationId: this.orchestrationId,
      sessionId: this.config.sessionId,
      state: this.peerConnectionManager.getConnectionState(),
      isInitiator: this.config.isInitiator,
      connectionDuration: Date.now() - this.startTime,
      iceDiagnostics: this.iceManager?.getDiagnostics() || null,
      dataChannelsOpen: this.peerConnectionManager
        .activeDataChannels?.size || 0,
      audioTracksActive: this.peerConnectionManager.activeAudioTracks?.length || 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Get ICE diagnostics
   */
  getICEDiagnostics(): ICEConnectionDiagnostics | null {
    return this.iceManager?.getDiagnostics() || null;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.iceManager) {
      this.iceManager.stopMonitoring();
    }

    if (this.signalingHandler) {
      await this.signalingHandler.close();
    }

    if (this.peerConnectionManager) {
      await this.peerConnectionManager.close();
    }

    telemetry.emit('webrtc:orchestrator_closed', {
      orchestrationId: this.orchestrationId,
      sessionId: this.config.sessionId,
    });
  }

  /**
   * Get orchestration ID
   */
  getOrchestrationId(): string {
    return this.orchestrationId;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnectionManager) return;

    this.peerConnectionManager.on('ice-candidate', (event) => {
      this.handleLocalICECandidate(event.candidate);
    });

    this.peerConnectionManager.on('connection-state-change', (event) => {
      this.handleConnectionStateChange(event.state);
    });

    this.peerConnectionManager.on('data-channel-open', (event) => {
      telemetry.emit('webrtc:orchestrator_data_channel_open', {
        orchestrationId: this.orchestrationId,
        label: event.label,
      });

      this.emit('data-channel-open', event);
    });

    this.peerConnectionManager.on('data-channel-message', (event) => {
      this.emit('data-channel-message', event);
    });

    this.peerConnectionManager.on('remote-track', (event) => {
      this.emit('remote-track', event);
    });

    this.peerConnectionManager.on('reconnect-attempt', (event) => {
      this.handleReconnectAttempt(event.attempt);
    });
  }

  private setupSignalingHandlers(): void {
    if (!this.signalingHandler) return;

    this.signalingHandler.on('signaling-message', async (event) => {
      await this.handleSignalingMessageType(event);
    });

    this.signalingHandler.on('transmit-message', (event) => {
      this.emit('transmit-signaling-message', event);
    });

    this.signalingHandler.on('signaling-error', (event) => {
      telemetry.emit('webrtc:orchestrator_signaling_error', {
        orchestrationId: this.orchestrationId,
        messageId: event.messageId,
        error: event.error,
      });

      this.emit('signaling-error', event);
    });
  }

  private setupICEHandlers(): void {
    if (!this.iceManager) return;

    this.iceManager.on('quality-change', (metrics) => {
      telemetry.emit('webrtc:orchestrator_quality_change', {
        orchestrationId: this.orchestrationId,
        quality: metrics.quality,
      });

      this.emit('network-quality-change', metrics);
    });
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnectionManager || !this.signalingHandler) {
      throw new Error('Components not initialized');
    }

    const offer = await this.peerConnectionManager.createOffer();
    await this.signalingHandler.sendMessage(offer);

    telemetry.emit('webrtc:orchestrator_offer_sent', {
      orchestrationId: this.orchestrationId,
    });
  }

  private async handleSignalingMessageType(event: any): Promise<void> {
    const { type, payload } = event;

    try {
      if (type === 'offer' && !this.offerHandled) {
        await this.handleRemoteOffer(payload);
        this.offerHandled = true;
      } else if (type === 'answer' && !this.answerHandled) {
        await this.handleRemoteAnswer(payload);
        this.answerHandled = true;
      } else if (type === 'ice-candidate') {
        await this.handleRemoteICECandidate(payload);
      }
    } catch (error) {
      telemetry.emit('webrtc:orchestrator_signaling_handle_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrationId: this.orchestrationId,
        type,
      });

      throw error;
    }
  }

  private async handleRemoteOffer(message: SignalingMessage): Promise<void> {
    if (!this.peerConnectionManager || !this.signalingHandler) {
      throw new Error('Components not initialized');
    }

    if (!message.sdp) {
      throw new Error('No SDP in offer');
    }

    const answer = await this.peerConnectionManager.createAnswer(message.sdp);
    await this.signalingHandler.sendMessage(answer);

    telemetry.emit('webrtc:orchestrator_answer_sent', {
      orchestrationId: this.orchestrationId,
    });
  }

  private async handleRemoteAnswer(message: SignalingMessage): Promise<void> {
    if (!this.peerConnectionManager) {
      throw new Error('Components not initialized');
    }

    if (!message.sdp) {
      throw new Error('No SDP in answer');
    }

    await this.peerConnectionManager.handleRemoteAnswer(message.sdp);

    telemetry.emit('webrtc:orchestrator_answer_received', {
      orchestrationId: this.orchestrationId,
    });
  }

  private async handleRemoteICECandidate(
    message: SignalingMessage
  ): Promise<void> {
    if (!message.candidate) {
      throw new Error('No candidate in message');
    }

    await this.handleICECandidate(message.candidate);
  }

  private handleLocalICECandidate(candidate: ICECandidate): void {
    if (!this.signalingHandler) return;

    const message: SignalingMessage = {
      type: 'ice-candidate',
      candidate,
      timestamp: Date.now(),
      messageId: uuidv4(),
    };

    this.signalingHandler.sendMessage(message).catch((error) => {
      telemetry.emit('webrtc:orchestrator_ice_send_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrationId: this.orchestrationId,
      });
    });
  }

  private handleConnectionStateChange(state: ConnectionState): void {
    telemetry.emit('webrtc:orchestrator_connection_state_change', {
      orchestrationId: this.orchestrationId,
      state,
    });

    this.emit('connection-state-change', { state });
  }

  private handleReconnectAttempt(attempt: number): void {
    telemetry.emit('webrtc:orchestrator_reconnect_attempt', {
      orchestrationId: this.orchestrationId,
      attempt,
    });

    this.emit('reconnect-attempt', { attempt });
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createWebRTCConnectionOrchestrator(
  config: OrchestrationConfig
): WebRTCConnectionOrchestrator {
  return new WebRTCConnectionOrchestrator(config);
}
