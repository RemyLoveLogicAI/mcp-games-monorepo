# WebRTC Integration Guide

## Overview

The MCP Games Server implements a production-grade WebRTC peer connection system designed for low-latency voice communication and real-time data synchronization in multiplayer games. The system consists of four core components working together in a coordinated orchestration pattern.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│     WebRTCConnectionOrchestrator (Main Coordinator)         │
└──────────┬──────────────┬──────────────┬────────────────────┘
           │              │              │
      ┌────▼────┐  ┌─────▼─────┐  ┌────▼────────┐
      │  Peer   │  │ Telegram  │  │   ICE       │
      │ Connect │  │ Signaling │  │  Manager    │
      │ Manager │  │  Handler  │  │             │
      └─────────┘  └───────────┘  └─────────────┘
```

### Component Responsibilities

1. **PeerConnectionManager**: Manages RTCPeerConnection lifecycle
   - Creates/closes peer connections
   - Handles offer/answer SDP exchange
   - Manages tracks and data channels
   - Collects connection statistics

2. **TelegramSignalingHandler**: Manages peer-to-peer signaling via Telegram
   - Reliable message delivery with acknowledgments
   - Ordered message processing with sequence numbers
   - Automatic retry with exponential backoff
   - Duplicate detection for idempotency

3. **ICEManager**: Handles ICE candidate collection and network diagnostics
   - Parses and categorizes ICE candidates (host, srflx, prflx, relay)
   - Monitors network quality (RTT, packet loss, jitter)
   - Collects connection statistics
   - Provides diagnostics and quality assessment

4. **WebRTCConnectionOrchestrator**: Coordinates all components
   - Manages initialization flow
   - Handles signaling message routing
   - Emits high-level connection events
   - Provides metrics and diagnostics

## Quick Start

### Basic Connection Establishment

```typescript
import { createWebRTCConnectionOrchestrator } from '@mcp-games/server/webrtc';

// Initialize orchestrator as initiator
const orchestrator = createWebRTCConnectionOrchestrator({
  sessionId: 'game-session-123',
  localPlayerId: 'player-1',
  remotePlayerId: 'player-2',
  chatId: 123456789,
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
  ],
  isInitiator: true, // Set to false for non-initiator
});

// Initialize connection
await orchestrator.initialize();

// Listen for connection established
orchestrator.on('connection-state-change', (event) => {
  console.log('Connection state:', event.state);
});

// Create data channel for game state
const gameStateChannel = orchestrator.createDataChannel('game-state');

gameStateChannel.addEventListener('open', () => {
  console.log('Game state channel ready');
});

gameStateChannel.addEventListener('message', (event) => {
  console.log('Received game state:', event.data);
});
```

### Handling Incoming Signaling Messages

```typescript
// From Telegram bot handler
async function handleSignalingMessage(message: TelegramSignalingMessage) {
  try {
    await orchestrator.handleSignalingMessage(message);
  } catch (error) {
    console.error('Failed to handle signaling message:', error);
  }
}

// From Telegram bot: listen for messages to transmit back to peer
orchestrator.on('transmit-signaling-message', (event) => {
  // Serialize and send via Telegram bot API
  const signalingPayload = JSON.stringify(event.message);
  await telegramBot.sendMessage(event.chatId, signalingPayload);
});
```

### Handling ICE Candidates

```typescript
// From Telegram messages containing ICE candidates
orchestrator.on('transmit-signaling-message', (event) => {
  if (event.message.type === 'ice-candidate') {
    // Send ICE candidate to peer via Telegram
    // (Part of regular signaling message flow)
  }
});

// Network quality monitoring
orchestrator.on('network-quality-change', (metrics) => {
  console.log('Network quality:', metrics.quality);
  console.log('RTT:', metrics.rtt, 'ms');
  console.log('Packet loss:', metrics.packetLoss, '%');
  console.log('Jitter:', metrics.jitter, 'ms');
});
```

## Data Channel Communication

### Creating Data Channels

```typescript
// Game state synchronization channel
const gameStateChannel = orchestrator.createDataChannel('game-state', {
  ordered: true,
  maxRetransmits: 3,
});

// Game events channel (e.g., player actions)
const eventsChannel = orchestrator.createDataChannel('game-events', {
  ordered: true,
  maxRetransmits: 3,
});

// Voice stream channel (binary data)
const audioChannel = orchestrator.createDataChannel('audio-stream', {
  ordered: false,
  maxPacketLifeTime: 200, // 200ms max packet lifetime
});
```

### Sending Data

```typescript
// Send game state (JSON)
const gameState = {
  position: { x: 100, y: 200 },
  health: 95,
  ammunition: 30,
};

orchestrator.sendData('game-state', JSON.stringify(gameState));

// Send raw binary data (e.g., audio frames)
const audioFrame = new Uint8Array([...]);
orchestrator.sendData('audio-stream', audioFrame);
```

### Receiving Data

```typescript
// Listen for data channel messages
gameStateChannel.addEventListener('message', (event) => {
  const gameState = JSON.parse(event.data);
  console.log('Peer position:', gameState.position);
});

// Handle channel open
gameStateChannel.addEventListener('open', () => {
  console.log('Game state channel is ready');
});

// Handle channel close
gameStateChannel.addEventListener('close', () => {
  console.log('Game state channel closed');
});

// Handle errors
gameStateChannel.addEventListener('error', (event) => {
  console.error('Channel error:', event.error);
});
```

## Audio Track Management

### Adding Audio Tracks

```typescript
// Get user's microphone
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
});

// Add audio track to peer connection
const audioTrack = stream.getAudioTracks()[0];
await orchestrator.addAudioTrack(audioTrack);

// Listen for remote audio track
orchestrator.on('remote-track', (event) => {
  if (event.kind === 'audio') {
    console.log('Received remote audio track:', event.track.id);
    // Play remote audio
    const audioElement = new Audio();
    audioElement.srcObject = new MediaStream([event.track]);
    audioElement.play();
  }
});
```

### Removing Audio Tracks

```typescript
// Stop local audio
const trackId = audioTrack.id;
orchestrator.removeAudioTrack(trackId);

// Remote audio will be removed when peer closes connection
```

## Connection Metrics

### Getting Current Metrics

```typescript
const metrics = orchestrator.getMetrics();

console.log('Connection metrics:');
console.log('- State:', metrics.state);
console.log('- Duration:', metrics.connectionDuration, 'ms');
console.log('- Data channels open:', metrics.dataChannelsOpen);
console.log('- Audio tracks active:', metrics.audioTracksActive);
```

### ICE Diagnostics

```typescript
const diagnostics = orchestrator.getICEDiagnostics();

console.log('ICE Diagnostics:');
console.log('- Status:', diagnostics.status);
console.log('- Host candidates:', diagnostics.hostCandidates.length);
console.log('- SRFLX candidates:', diagnostics.srflxCandidates.length);
console.log('- Relay candidates:', diagnostics.relayCandidates.length);

if (diagnostics.selectedCandidatePair) {
  console.log('- Selected local IP:', diagnostics.selectedCandidatePair.local.ipAddress);
  console.log('- Selected remote IP:', diagnostics.selectedCandidatePair.remote.ipAddress);
}

if (diagnostics.networkQuality) {
  console.log('- Quality:', diagnostics.networkQuality.quality);
  console.log('- RTT:', diagnostics.networkQuality.rtt, 'ms');
}
```

## Error Handling & Recovery

### Connection State Monitoring

```typescript
orchestrator.on('connection-state-change', (event) => {
  switch (event.state) {
    case 'connecting':
      console.log('Establishing connection...');
      break;

    case 'connected':
      console.log('Connection established');
      break;

    case 'reconnecting':
      console.log('Connection lost, attempting to reconnect...');
      break;

    case 'failed':
      console.error('Connection failed, max retries exceeded');
      // Handle permanent failure
      break;

    case 'closed':
      console.log('Connection closed');
      break;
  }
});
```

### Reconnection Handling

```typescript
orchestrator.on('reconnect-attempt', (event) => {
  console.log(`Reconnection attempt ${event.attempt}`);

  // Exponential backoff is handled automatically
  // Current attempt number tells you how many retries have occurred
});

orchestrator.on('signaling-error', (event) => {
  console.error('Signaling error:', event.error);
  console.error('Message ID:', event.messageId);
});
```

## Network Diagnostics

### Quality Assessment

```typescript
orchestrator.on('network-quality-change', (metrics) => {
  const { quality, rtt, packetLoss, jitter, bandwidth } = metrics;

  console.log(`Network Quality: ${quality}`);
  console.log(`RTT: ${rtt.toFixed(1)}ms (${quality})`);
  console.log(`Packet Loss: ${packetLoss.toFixed(2)}%`);
  console.log(`Jitter: ${jitter.toFixed(1)}ms`);
  console.log(`Available Bandwidth: ${(bandwidth / 1000).toFixed(0)}Kbps`);

  // Adjust game settings based on quality
  if (quality === 'poor') {
    enableLowBandwidthMode();
  } else if (quality === 'excellent') {
    enableHighQualityMode();
  }
});
```

### ICE Candidate Collection

```typescript
const diagnostics = orchestrator.getICEDiagnostics();

// Analyze path selection
if (diagnostics.selectedCandidatePair) {
  const { local, remote } = diagnostics.selectedCandidatePair;

  console.log('Selected connection path:');
  console.log(`- Local: ${local.ipAddress}:${local.port} (${local.candidateType})`);
  console.log(`- Remote: ${remote.ipAddress}:${remote.port} (${remote.candidateType})`);

  // Direct connection (both host candidates = LAN)
  if (local.candidateType === 'host' && remote.candidateType === 'host') {
    console.log('✓ Direct LAN connection');
  }
  // NAT traversal (SRFLX)
  else if (local.candidateType === 'srflx' || remote.candidateType === 'srflx') {
    console.log('✓ NAT traversal via STUN');
  }
  // Relay through TURN server
  else if (local.candidateType === 'relay' || remote.candidateType === 'relay') {
    console.log('⚠ Using TURN relay (higher latency)');
  }
}
```

## Cleanup & Resource Management

### Proper Shutdown

```typescript
async function closeConnection() {
  // Stop audio tracks
  orchestrator.removeAudioTrack(audioTrackId);

  // Close data channels
  gameStateChannel.close();
  eventsChannel.close();

  // Close orchestrator (cleans up all resources)
  await orchestrator.close();

  console.log('Connection closed and resources cleaned up');
}
```

## Telegram Integration

### Signaling Message Format

```typescript
// Signaling messages are serialized as JSON in Telegram messages
interface TelegramSignalingMessage {
  id: string; // Unique message ID
  type: 'offer' | 'answer' | 'ice-candidate';
  payload: SignalingMessage; // Contains SDP or ICE candidate
  sentAt: number; // Timestamp
  sequenceNumber: number; // For ordering
}

// Example: Send via Telegram
const signalingJson = JSON.stringify(message);
await telegramBot.sendMessage(chatId, `SIG:${signalingJson}`);

// Parse received Telegram message
if (text.startsWith('SIG:')) {
  const signalingMessage = JSON.parse(text.substring(4));
  await orchestrator.handleSignalingMessage(signalingMessage);
}
```

## Configuration & ICE Servers

### STUN Servers (Free)

```typescript
const iceServers = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302'] },
  { urls: ['stun:stun3.l.google.com:19302'] },
  { urls: ['stun:stun4.l.google.com:19302'] },
];
```

### TURN Servers (Fallback)

```typescript
const iceServers = [
  {
    urls: ['stun:stun.l.google.com:19302'],
  },
  {
    urls: ['turn:your-turn-server.com:3478'],
    username: 'your-username',
    credential: 'your-password',
  },
];
```

## Performance Optimization

### Data Channel Configuration

```typescript
// For high-frequency updates (game state)
const highFrequencyChannel = orchestrator.createDataChannel(
  'high-frequency',
  {
    ordered: true,
    maxRetransmits: 1, // Lower retransmits = lower latency
  }
);

// For critical data (player actions)
const criticalChannel = orchestrator.createDataChannel('critical', {
  ordered: true,
  maxRetransmits: 3, // Higher retransmits = higher reliability
});
```

### Bandwidth Management

```typescript
// Monitor bandwidth and adjust send rate
orchestrator.on('network-quality-change', (metrics) => {
  const bandwidthMbps = metrics.bandwidth / 1000000;

  if (bandwidthMbps < 1) {
    // Low bandwidth: send less frequently
    gameUpdateInterval = 500; // Send every 500ms
  } else if (bandwidthMbps > 10) {
    // High bandwidth: send more frequently
    gameUpdateInterval = 50; // Send every 50ms
  }
});
```

## Troubleshooting

### Connection Fails to Establish

1. Check STUN/TURN server availability
2. Verify firewall/NAT settings
3. Check peer is actually receiving signaling messages
4. Enable debug logging to see ICE state transitions

### High Latency

1. Check ICE candidate types (relay vs direct)
2. Monitor packet loss and jitter
3. Reduce data channel message frequency
4. Consider using TURN server closer to geography

### Data Channel Not Opening

1. Verify both peers completed SDP exchange
2. Check ICE connection state is `connected`
3. Ensure data channel label matches on both sides
4. Verify connection state is not `failed` or `closed`

### Echo or Audio Issues

1. Enable echo cancellation:
   ```typescript
   const stream = await navigator.mediaDevices.getUserMedia({
     audio: {
       echoCancellation: true,
       noiseSuppression: true,
       autoGainControl: true,
     },
   });
   ```
2. Monitor jitter and packet loss
3. Consider audio codec configuration

## API Reference

### WebRTCConnectionOrchestrator

```typescript
// Lifecycle
async initialize(): Promise<void>
async close(): Promise<void>

// Data Channels
createDataChannel(label: string): RTCDataChannel
sendData(label: string, data: string | ArrayBuffer): void

// Audio Tracks
async addAudioTrack(track: MediaStreamTrack): Promise<void>
removeAudioTrack(trackId: string): void

// Signaling
async handleSignalingMessage(message: TelegramSignalingMessage): Promise<void>
async handleICECandidate(candidate: ICECandidate): Promise<void>

// Diagnostics
getMetrics(): ConnectionMetrics
getICEDiagnostics(): ICEConnectionDiagnostics | null
getOrchestrationId(): string

// Events
on('ready', handler)
on('connection-state-change', handler)
on('network-quality-change', handler)
on('reconnect-attempt', handler)
on('data-channel-open', handler)
on('data-channel-message', handler)
on('remote-track', handler)
on('signaling-error', handler)
on('transmit-signaling-message', handler)
```

## Production Deployment Checklist

- [ ] Configure production STUN/TURN servers
- [ ] Implement connection timeout handling
- [ ] Monitor connection failures and retry logic
- [ ] Log network quality metrics for analysis
- [ ] Implement graceful degradation for poor networks
- [ ] Test with real network conditions (VPN, mobile, etc.)
- [ ] Set up alerts for high failure rates
- [ ] Document custom signaling implementation
- [ ] Implement rate limiting on signaling messages
- [ ] Regular testing with real peers

## References

- [WebRTC Specification](https://www.w3.org/TR/webrtc/)
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [ICE Candidates and NAT Traversal](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate)
- [Data Channels](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
