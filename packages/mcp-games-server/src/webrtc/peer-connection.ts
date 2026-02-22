import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ICECandidate {
  candidate: string;
  sdpMLineIndex: number;
  sdpMid: string;
}

export interface ConnectionStats {
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
  availableOutgoingBitrate: number;
  currentRoundTripTime: number;
  timestamp: number;
}

export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  signalingState?: RTCSignalingState;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: ICECandidate;
  timestamp: number;
  messageId: string;
}

export enum ConnectionState {
  Idle = 'idle',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
  Closed = 'closed',
}

// ═══════════════════════════════════════════════════════════
// PEER CONNECTION MANAGER
// ═══════════════════════════════════════════════════════════

export class PeerConnectionManager extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private connectionId: string = uuidv4();
  private connectionState: ConnectionState = ConnectionState.Idle;
  private config: PeerConnectionConfig;
  private statsInterval: NodeJS.Timeout | null = null;
  private lastStats: ConnectionStats | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start at 1 second
  private maxReconnectDelay: number = 30000; // Cap at 30 seconds
  private iceCandidates: ICECandidate[] = [];
  private localDescription: RTCSessionDescription | null = null;
  private remoteDescription: RTCSessionDescription | null = null;
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private audioTracks: MediaStreamTrack[] = [];
  private videoTracks: MediaStreamTrack[] = [];
  private iceConnectionTimeout: NodeJS.Timeout | null = null;
  private readonly ICE_CONNECTION_TIMEOUT = 15000; // 15 seconds

  constructor(config: PeerConnectionConfig) {
    super();
    this.config = config;
    telemetry.emit('webrtc:peer_manager_created', {
      connectionId: this.connectionId,
      iceServersCount: config.iceServers.length,
    });
  }

  /**
   * Initialize peer connection with ICE servers
   */
  async initialize(): Promise<void> {
    try {
      if (this.peerConnection) {
        throw new Error('Peer connection already initialized');
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        bundlePolicy: this.config.bundlePolicy || 'max-bundle',
        rtcpMuxPolicy: this.config.rtcpMuxPolicy || 'require',
      });

      // Setup event handlers
      peerConnection.addEventListener('icecandidate', (event) => {
        this.handleICECandidate(event);
      });

      peerConnection.addEventListener('iceconnectionstatechange', () => {
        this.handleICEConnectionStateChange();
      });

      peerConnection.addEventListener('connectionstatechange', () => {
        this.handleConnectionStateChange();
      });

      peerConnection.addEventListener('signalingstatechange', () => {
        this.handleSignalingStateChange();
      });

      peerConnection.addEventListener('datachannel', (event) => {
        this.handleDataChannel(event.channel);
      });

      peerConnection.addEventListener('track', (event) => {
        this.handleRemoteTrack(event);
      });

      this.peerConnection = peerConnection;
      this.setConnectionState(ConnectionState.Idle);

      // Start stats monitoring
      this.startStatsMonitoring();

      telemetry.emit('webrtc:peer_connection_initialized', {
        connectionId: this.connectionId,
      });
    } catch (error) {
      telemetry.emit('webrtc:initialization_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  /**
   * Create offer for peer connection
   */
  async createOffer(): Promise<SignalingMessage> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      this.setConnectionState(ConnectionState.Connecting);
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);
      this.localDescription = offer;

      const message: SignalingMessage = {
        type: 'offer',
        sdp: offer.sdp,
        timestamp: Date.now(),
        messageId: uuidv4(),
      };

      telemetry.emit('webrtc:offer_created', {
        connectionId: this.connectionId,
        sdpLength: offer.sdp?.length || 0,
      });

      return message;
    } catch (error) {
      this.setConnectionState(ConnectionState.Failed);
      telemetry.emit('webrtc:offer_creation_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  /**
   * Create answer in response to offer
   */
  async createAnswer(offerSdp: string): Promise<SignalingMessage> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      const offer = new RTCSessionDescription({
        type: 'offer',
        sdp: offerSdp,
      });

      await this.peerConnection.setRemoteDescription(offer);
      this.remoteDescription = offer;

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.localDescription = answer;

      const message: SignalingMessage = {
        type: 'answer',
        sdp: answer.sdp,
        timestamp: Date.now(),
        messageId: uuidv4(),
      };

      telemetry.emit('webrtc:answer_created', {
        connectionId: this.connectionId,
        sdpLength: answer.sdp?.length || 0,
      });

      return message;
    } catch (error) {
      this.setConnectionState(ConnectionState.Failed);
      telemetry.emit('webrtc:answer_creation_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  /**
   * Handle remote answer
   */
  async handleRemoteAnswer(answerSdp: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      await this.peerConnection.setRemoteDescription(answer);
      this.remoteDescription = answer;

      telemetry.emit('webrtc:remote_answer_handled', {
        connectionId: this.connectionId,
      });
    } catch (error) {
      telemetry.emit('webrtc:answer_handling_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  /**
   * Add ICE candidate
   */
  async addICECandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      const rtcCandidate = new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
      });

      await this.peerConnection.addIceCandidate(rtcCandidate);

      telemetry.emit('webrtc:ice_candidate_added', {
        connectionId: this.connectionId,
        candidateType: this.getCandidateType(candidate.candidate),
      });
    } catch (error) {
      telemetry.emit('webrtc:ice_candidate_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      // Non-fatal error - continue without throwing
    }
  }

  /**
   * Create data channel
   */
  createDataChannel(label: string): RTCDataChannel {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const dataChannel = this.peerConnection.createDataChannel(label, {
      ordered: true,
      maxRetransmits: 3,
    });

    this.setupDataChannelHandlers(dataChannel);
    this.dataChannels.set(label, dataChannel);

    telemetry.emit('webrtc:data_channel_created', {
      connectionId: this.connectionId,
      label,
    });

    return dataChannel;
  }

  /**
   * Send data on channel
   */
  sendData(label: string, data: string | ArrayBuffer): void {
    const dataChannel = this.dataChannels.get(label);
    if (!dataChannel) {
      throw new Error(`Data channel '${label}' not found`);
    }

    if (dataChannel.readyState !== 'open') {
      throw new Error(`Data channel '${label}' is not open`);
    }

    dataChannel.send(data);

    telemetry.emit('webrtc:data_sent', {
      connectionId: this.connectionId,
      label,
      size: typeof data === 'string' ? data.length : data.byteLength,
    });
  }

  /**
   * Add audio track
   */
  async addAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.addTrack(track);
      this.audioTracks.push(track);

      telemetry.emit('webrtc:audio_track_added', {
        connectionId: this.connectionId,
        trackId: track.id,
      });
    } catch (error) {
      telemetry.emit('webrtc:audio_track_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  /**
   * Remove audio track
   */
  removeAudioTrack(trackId: string): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const trackIndex = this.audioTracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) {
      throw new Error(`Audio track '${trackId}' not found`);
    }

    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.id === trackId);
    if (sender) {
      this.peerConnection.removeTrack(sender);
    }

    this.audioTracks.splice(trackIndex, 1);

    telemetry.emit('webrtc:audio_track_removed', {
      connectionId: this.connectionId,
      trackId,
    });
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection stats
   */
  getStats(): ConnectionStats | null {
    return this.lastStats;
  }

  /**
   * Close peer connection
   */
  async close(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    if (this.iceConnectionTimeout) {
      clearTimeout(this.iceConnectionTimeout);
    }

    // Close all data channels
    this.dataChannels.forEach((dc) => {
      if (dc.readyState !== 'closed') {
        dc.close();
      }
    });
    this.dataChannels.clear();

    // Stop all tracks
    this.audioTracks.forEach((track) => track.stop());
    this.videoTracks.forEach((track) => track.stop());
    this.audioTracks = [];
    this.videoTracks = [];

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.setConnectionState(ConnectionState.Closed);

    telemetry.emit('webrtc:peer_connection_closed', {
      connectionId: this.connectionId,
    });
  }

  /**
   * Get collected ICE candidates
   */
  getICECandidates(): ICECandidate[] {
    return [...this.iceCandidates];
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private handleICECandidate(event: RTCPeerConnectionIceEvent): void {
    if (event.candidate) {
      const candidate: ICECandidate = {
        candidate: event.candidate.candidate,
        sdpMLineIndex: event.candidate.sdpMLineIndex || 0,
        sdpMid: event.candidate.sdpMid || '',
      };

      this.iceCandidates.push(candidate);

      this.emit('ice-candidate', {
        candidate,
        messageId: uuidv4(),
      });

      telemetry.emit('webrtc:ice_candidate_collected', {
        connectionId: this.connectionId,
        candidateType: this.getCandidateType(event.candidate.candidate),
        totalCandidates: this.iceCandidates.length,
      });
    }
  }

  private handleICEConnectionStateChange(): void {
    if (!this.peerConnection) return;

    const state = this.peerConnection.iceConnectionState;
    telemetry.emit('webrtc:ice_connection_state_change', {
      connectionId: this.connectionId,
      state,
    });

    switch (state) {
      case 'connected':
      case 'completed':
        this.resetReconnectDelay();
        if (this.connectionState === ConnectionState.Reconnecting) {
          this.setConnectionState(ConnectionState.Connected);
        }
        break;

      case 'disconnected':
        this.setConnectionState(ConnectionState.Reconnecting);
        this.scheduleReconnect();
        break;

      case 'failed':
        this.setConnectionState(ConnectionState.Failed);
        this.scheduleReconnect();
        break;
    }
  }

  private handleConnectionStateChange(): void {
    if (!this.peerConnection) return;

    const state = this.peerConnection.connectionState;
    telemetry.emit('webrtc:connection_state_change', {
      connectionId: this.connectionId,
      state,
    });

    switch (state) {
      case 'connected':
        this.setConnectionState(ConnectionState.Connected);
        this.resetReconnectDelay();
        break;

      case 'disconnected':
        this.setConnectionState(ConnectionState.Reconnecting);
        this.scheduleReconnect();
        break;

      case 'failed':
        this.setConnectionState(ConnectionState.Failed);
        this.scheduleReconnect();
        break;

      case 'closed':
        this.setConnectionState(ConnectionState.Closed);
        break;
    }
  }

  private handleSignalingStateChange(): void {
    if (!this.peerConnection) return;

    telemetry.emit('webrtc:signaling_state_change', {
      connectionId: this.connectionId,
      state: this.peerConnection.signalingState,
    });
  }

  private handleDataChannel(dataChannel: RTCDataChannel): void {
    this.setupDataChannelHandlers(dataChannel);
    this.dataChannels.set(dataChannel.label, dataChannel);

    telemetry.emit('webrtc:remote_data_channel_opened', {
      connectionId: this.connectionId,
      label: dataChannel.label,
    });

    this.emit('data-channel-open', {
      label: dataChannel.label,
    });
  }

  private setupDataChannelHandlers(dataChannel: RTCDataChannel): void {
    dataChannel.addEventListener('open', () => {
      telemetry.emit('webrtc:data_channel_open', {
        connectionId: this.connectionId,
        label: dataChannel.label,
      });

      this.emit('data-channel-open', {
        label: dataChannel.label,
      });
    });

    dataChannel.addEventListener('close', () => {
      telemetry.emit('webrtc:data_channel_close', {
        connectionId: this.connectionId,
        label: dataChannel.label,
      });

      this.dataChannels.delete(dataChannel.label);
      this.emit('data-channel-close', {
        label: dataChannel.label,
      });
    });

    dataChannel.addEventListener('message', (event) => {
      this.emit('data-channel-message', {
        label: dataChannel.label,
        data: event.data,
      });
    });

    dataChannel.addEventListener('error', (event) => {
      telemetry.emit('webrtc:data_channel_error', {
        connectionId: this.connectionId,
        label: dataChannel.label,
        error: event.error?.message || 'Unknown error',
      });
    });
  }

  private handleRemoteTrack(event: RTCTrackEvent): void {
    const track = event.track;

    if (track.kind === 'audio') {
      this.audioTracks.push(track);
    } else if (track.kind === 'video') {
      this.videoTracks.push(track);
    }

    telemetry.emit('webrtc:remote_track_received', {
      connectionId: this.connectionId,
      trackKind: track.kind,
      trackId: track.id,
    });

    this.emit('remote-track', {
      track,
      kind: track.kind,
    });
  }

  private startStatsMonitoring(): void {
    this.statsInterval = setInterval(async () => {
      await this.collectStats();
    }, 1000);
  }

  private async collectStats(): Promise<void> {
    if (!this.peerConnection) return;

    try {
      const stats = await this.peerConnection.getStats();
      const inboundRtpStats = Array.from(stats.values()).find(
        (report) => report.type === 'inbound-rtp'
      );

      if (inboundRtpStats) {
        this.lastStats = {
          bytesReceived: inboundRtpStats.bytesReceived || 0,
          bytesSent: inboundRtpStats.bytesSent || 0,
          packetsLost: inboundRtpStats.packetsLost || 0,
          jitter: inboundRtpStats.jitter || 0,
          roundTripTime: inboundRtpStats.roundTripTime || 0,
          availableOutgoingBitrate:
            inboundRtpStats.availableOutgoingBitrate || 0,
          currentRoundTripTime: inboundRtpStats.currentRoundTripTime || 0,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      telemetry.emit('webrtc:stats_collection_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: this.connectionId,
      });
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;

    this.connectionState = state;

    telemetry.emit('webrtc:connection_state_set', {
      connectionId: this.connectionId,
      state,
    });

    this.emit('connection-state-change', { state });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState(ConnectionState.Failed);
      telemetry.emit('webrtc:max_reconnect_attempts_reached', {
        connectionId: this.connectionId,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    telemetry.emit('webrtc:reconnect_scheduled', {
      connectionId: this.connectionId,
      attempt: this.reconnectAttempts + 1,
      delayMs: delay,
    });

    setTimeout(() => {
      this.reconnectAttempts++;
      this.emit('reconnect-attempt', {
        attempt: this.reconnectAttempts,
      });
    }, delay);
  }

  private resetReconnectDelay(): void {
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }

  private getCandidateType(candidate: string): string {
    if (candidate.includes('host')) return 'host';
    if (candidate.includes('srflx')) return 'srflx';
    if (candidate.includes('prflx')) return 'prflx';
    if (candidate.includes('relay')) return 'relay';
    return 'unknown';
  }

  /**
   * Get connection ID
   */
  getConnectionId(): string {
    return this.connectionId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createPeerConnectionManager(
  config: PeerConnectionConfig
): PeerConnectionManager {
  return new PeerConnectionManager(config);
}
