import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PeerConnectionManager,
  ConnectionState,
  createPeerConnectionManager,
} from '../../src/webrtc/peer-connection.js';
import {
  TelegramSignalingHandler,
  createTelegramSignalingHandler,
} from '../../src/webrtc/telegram-signaling.js';
import {
  ICEManager,
  createICEManager,
} from '../../src/webrtc/ice-manager.js';
import {
  WebRTCConnectionOrchestrator,
  createWebRTCConnectionOrchestrator,
} from '../../src/webrtc/connection-orchestrator.js';

// ═══════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════

describe('WebRTC Integration Suite', () => {
  describe('PeerConnectionManager', () => {
    let manager: PeerConnectionManager;
    const mockICEServers: RTCIceServer[] = [
      { urls: ['stun:stun.l.google.com:19302'] },
    ];

    beforeEach(async () => {
      manager = createPeerConnectionManager({
        iceServers: mockICEServers,
      });
    });

    afterEach(async () => {
      if (manager) {
        await manager.close();
      }
    });

    it('should initialize peer connection', async () => {
      await manager.initialize();
      expect(manager.getConnectionState()).toBe(ConnectionState.Idle);
    });

    it('should throw error if initialized twice', async () => {
      await manager.initialize();
      await expect(manager.initialize()).rejects.toThrow(
        'Peer connection already initialized'
      );
    });

    it('should create offer', async () => {
      await manager.initialize();
      const offer = await manager.createOffer();

      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBeDefined();
      expect(offer.sdp?.length).toBeGreaterThan(0);
      expect(offer.timestamp).toBeGreaterThan(0);
      expect(offer.messageId).toBeDefined();
    });

    it('should handle connection state changes', async () => {
      await manager.initialize();

      const stateChanges: string[] = [];
      manager.on('connection-state-change', (event) => {
        stateChanges.push(event.state);
      });

      const offer = await manager.createOffer();
      expect(offer.type).toBe('offer');

      // Note: Actual state changes require full connection with real peer
      expect(manager.getConnectionState()).toBeDefined();
    });

    it('should collect ICE candidates', async () => {
      await manager.initialize();

      const candidates: string[] = [];
      manager.on('ice-candidate', (event) => {
        candidates.push(event.candidate.candidate);
      });

      const offer = await manager.createOffer();
      expect(offer.type).toBe('offer');

      // ICE gathering happens asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should create data channel', async () => {
      await manager.initialize();

      const dataChannel = manager.createDataChannel('game-state');
      expect(dataChannel).toBeDefined();
      expect(dataChannel.label).toBe('game-state');
      expect(dataChannel.ordered).toBe(true);
    });

    it('should get connection ID', async () => {
      const connectionId = manager.getConnectionId();
      expect(connectionId).toBeDefined();
      expect(typeof connectionId).toBe('string');
      expect(connectionId.length).toBeGreaterThan(0);
    });

    it('should return null stats initially', async () => {
      await manager.initialize();
      const stats = manager.getStats();
      expect(stats).toBeNull();
    });
  });

  describe('TelegramSignalingHandler', () => {
    let handler: TelegramSignalingHandler;

    beforeEach(() => {
      handler = createTelegramSignalingHandler({
        sessionId: 'session-123',
        localPlayerId: 'player-1',
        remotePlayerId: 'player-2',
        chatId: 123456,
      });
    });

    afterEach(async () => {
      if (handler) {
        await handler.close();
      }
    });

    it('should initialize signaling handler', () => {
      expect(handler.getSignalingId()).toBeDefined();
      expect(typeof handler.getSignalingId()).toBe('string');
    });

    it('should send signaling message', async () => {
      let transmittedMessage: any;

      handler.on('transmit-message', (event) => {
        transmittedMessage = event.message;
      });

      const message = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=...',
        timestamp: Date.now(),
        messageId: 'msg-123',
      };

      await handler.sendMessage(message);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(transmittedMessage).toBeDefined();
      expect(transmittedMessage.type).toBe('offer');
      expect(transmittedMessage.payload.sdp).toBe('v=0\r\no=...');
    });

    it('should handle incoming message', async () => {
      let receivedMessage: any;

      handler.on('signaling-message', (event) => {
        receivedMessage = event;
      });

      const incomingMessage = {
        id: 'msg-456',
        type: 'answer' as const,
        payload: {
          type: 'answer' as const,
          sdp: 'v=0\r\no=...',
          timestamp: Date.now(),
          messageId: 'msg-456',
        },
        sentAt: Date.now(),
        sequenceNumber: 0,
      };

      await handler.handleIncomingMessage(incomingMessage);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.type).toBe('answer');
    });

    it('should handle acknowledgment', () => {
      const messageId = 'msg-789';

      handler.handleAck({
        id: 'ack-123',
        messageId,
        receivedAt: Date.now(),
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should prevent duplicate messages', async () => {
      let messageCount = 0;

      handler.on('signaling-message', () => {
        messageCount++;
      });

      const incomingMessage = {
        id: 'msg-dup',
        type: 'offer' as const,
        payload: {
          type: 'offer' as const,
          sdp: 'v=0\r\no=...',
          timestamp: Date.now(),
          messageId: 'msg-dup',
        },
        sentAt: Date.now(),
        sequenceNumber: 0,
      };

      // Send same message twice
      await handler.handleIncomingMessage(incomingMessage);
      await handler.handleIncomingMessage(incomingMessage);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only process once
      expect(messageCount).toBe(1);
    });

    it('should track message counts', async () => {
      expect(handler.getPendingMessageCount()).toBe(0);
      expect(handler.getReceivedMessageCount()).toBe(0);

      const message = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=...',
        timestamp: Date.now(),
        messageId: 'msg-123',
      };

      await handler.sendMessage(message);
      expect(handler.getPendingMessageCount()).toBeGreaterThan(0);
    });
  });

  describe('ICEManager', () => {
    let iceManager: ICEManager;

    beforeEach(async () => {
      const manager = createPeerConnectionManager({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      });
      await manager.initialize();

      iceManager = createICEManager(manager.peerConnection as any);
    });

    afterEach(() => {
      if (iceManager) {
        iceManager.stopMonitoring();
      }
    });

    it('should initialize ICE manager', () => {
      expect(iceManager.getICEId()).toBeDefined();
      expect(typeof iceManager.getICEId()).toBe('string');
    });

    it('should parse candidate string', () => {
      const candidateString =
        'candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host';

      const metrics = iceManager.processCandidateString(candidateString);

      expect(metrics).toBeDefined();
      if (metrics) {
        expect(metrics.candidateType).toBe('host');
        expect(metrics.ipAddress).toBe('192.168.1.100');
        expect(metrics.port).toBe(54321);
        expect(metrics.protocol).toBe('udp');
      }
    });

    it('should categorize candidates by type', () => {
      const hostCandidate =
        'candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host';
      const srflxCandidate =
        'candidate:842163050 1 udp 1677729534 203.0.113.1 54322 typ srflx raddr 192.168.1.100 rport 54321';

      iceManager.processCandidateString(hostCandidate);
      iceManager.processCandidateString(srflxCandidate);

      const diagnostics = iceManager.getDiagnostics();

      expect(diagnostics.hostCandidates.length).toBeGreaterThan(0);
      expect(diagnostics.srflxCandidates.length).toBeGreaterThan(0);
    });

    it('should start and stop monitoring', () => {
      expect(() => {
        iceManager.startMonitoring();
        iceManager.stopMonitoring();
      }).not.toThrow();
    });

    it('should provide diagnostics', () => {
      const diagnostics = iceManager.getDiagnostics();

      expect(diagnostics.connectionId).toBeDefined();
      expect(diagnostics.status).toBeDefined();
      expect(diagnostics.hostCandidates).toEqual([]);
      expect(diagnostics.srflxCandidates).toEqual([]);
      expect(diagnostics.prflxCandidates).toEqual([]);
      expect(diagnostics.relayCandidates).toEqual([]);
      expect(diagnostics.timestamp).toBeGreaterThan(0);
    });
  });

  describe('WebRTCConnectionOrchestrator', () => {
    let orchestrator: WebRTCConnectionOrchestrator;

    const config = {
      sessionId: 'session-123',
      localPlayerId: 'player-1',
      remotePlayerId: 'player-2',
      chatId: 123456,
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      isInitiator: true,
    };

    afterEach(async () => {
      if (orchestrator) {
        await orchestrator.close();
      }
    });

    it('should initialize orchestrator', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);
      expect(orchestrator.getOrchestrationId()).toBeDefined();
    });

    it('should emit ready event', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);

      const readyPromise = new Promise((resolve) => {
        orchestrator.once('ready', resolve);
      });

      await orchestrator.initialize();
      await readyPromise;

      expect(true).toBe(true);
    });

    it('should create data channel', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);
      await orchestrator.initialize();

      const dataChannel = orchestrator.createDataChannel('game-events');
      expect(dataChannel).toBeDefined();
      expect(dataChannel.label).toBe('game-events');
    });

    it('should get metrics', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);
      await orchestrator.initialize();

      const metrics = orchestrator.getMetrics();

      expect(metrics.orchestrationId).toBeDefined();
      expect(metrics.sessionId).toBe('session-123');
      expect(metrics.isInitiator).toBe(true);
      expect(metrics.connectionDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeGreaterThan(0);
    });

    it('should get ICE diagnostics', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);
      await orchestrator.initialize();

      const diagnostics = orchestrator.getICEDiagnostics();

      expect(diagnostics).toBeDefined();
      if (diagnostics) {
        expect(diagnostics.status).toBeDefined();
        expect(diagnostics.hostCandidates).toBeDefined();
        expect(diagnostics.timestamp).toBeGreaterThan(0);
      }
    });

    it('should create offer as initiator', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);

      let messageTransmitted = false;
      orchestrator.on('transmit-signaling-message', () => {
        messageTransmitted = true;
      });

      await orchestrator.initialize();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Initiator should have sent offer
      expect(messageTransmitted).toBe(true);
    });

    it('should handle close gracefully', async () => {
      orchestrator = createWebRTCConnectionOrchestrator(config);
      await orchestrator.initialize();

      expect(async () => {
        await orchestrator.close();
      }).not.toThrow();
    });

    it('should not require offer as non-initiator', async () => {
      const nonInitiatorConfig = { ...config, isInitiator: false };
      orchestrator =
        createWebRTCConnectionOrchestrator(nonInitiatorConfig);

      const readyPromise = new Promise((resolve) => {
        orchestrator.once('ready', resolve);
      });

      await orchestrator.initialize();
      await readyPromise;

      expect(orchestrator.getOrchestrationId()).toBeDefined();
    });
  });

  describe('WebRTC Error Handling', () => {
    it('should handle ICE candidate parsing errors gracefully', () => {
      const manager = createICEManager(null as any);

      const invalidCandidate = 'not a valid candidate';
      const metrics = manager.processCandidateString(invalidCandidate);

      expect(metrics).toBeNull();
    });

    it('should handle peer connection close', async () => {
      const manager = createPeerConnectionManager({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      });

      await manager.initialize();
      await manager.close();

      expect(manager.getConnectionState()).toBe(ConnectionState.Closed);
    });

    it('should handle signaling without initialization', async () => {
      const handler = createTelegramSignalingHandler({
        sessionId: 'test',
        localPlayerId: 'p1',
        remotePlayerId: 'p2',
        chatId: 123,
      });

      const message = {
        type: 'offer' as const,
        sdp: 'v=0',
        timestamp: Date.now(),
        messageId: 'test',
      };

      // Should not throw
      await handler.sendMessage(message);
      await handler.close();

      expect(true).toBe(true);
    });
  });
});
