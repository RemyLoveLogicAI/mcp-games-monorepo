# Audio Processing & Voice Streaming Guide

## Overview

The MCP Games Server implements a production-grade audio processing pipeline for real-time voice communication. The system combines Opus codec, voice activity detection (VAD), automatic gain control (AGC), and intelligent audio frame buffering to deliver high-quality, low-latency voice streaming with bandwidth optimization.

## Architecture

```
PCM Audio Input (Float32Array)
         ↓
┌─ Voice Activity Detection (VAD)
│  - Energy measurement
│  - Spectral analysis
│  - Zero-crossing detection
│  └→ Skip if silence → Return null
│
├─ Automatic Gain Control (AGC)
│  - Input level measurement
│  - Gain calculation with compression
│  - Attack/release smoothing
│  - Clipping prevention
│
├─ Echo Cancellation (placeholder)
│  - Configured for WebRTC integration
│
├─ Opus Codec Encoding
│  - 16-bit PCM → Opus compressed
│  - Bitrate: 6-510 kbps
│  - Frame size: 2.5-60ms
│  - FEC enabled for resilience
│
├─ Audio Frame Buffering
│  - Jitter buffer for ordering
│  - Out-of-sequence handling
│  - Priority-based frame dropping
│
└─ Bitrate & Metrics
   - Statistics collection
   - Network diagnostics
   - Quality assessment
```

## Quick Start

### Basic Audio Processing

```typescript
import { createAudioProcessor } from '@mcp-games/server/audio';

// Initialize processor with full pipeline
const processor = createAudioProcessor({
  opus: {
    sampleRate: 16000,
    channels: 1,
    bitrate: 24, // 24 kbps
    complexity: 5, // Balance of CPU vs quality
    useFEC: true, // Forward Error Correction
    useDTX: true, // Discontinuous Transmission (silence suppression)
  },
  vad: {
    sampleRate: 16000,
    frameSize: 320, // 20ms at 16kHz
    threshold: 0.5,
    minVoiceDuration: 100, // ms
    maxSilenceDuration: 1000,
    noiseFloor: 0.02,
  },
  agc: {
    targetLevel: 0.75,
    attackTime: 10, // ms
    releaseTime: 100, // ms
    maxGain: 40, // dB
    compression: 0.5,
    noiseGateThreshold: 0.01,
    lookAhead: 10,
  },
  buffer: {
    maxBufferSize: 30,
    targetLatency: 200, // ms
    sampleRate: 16000,
    frameSize: 320,
  },
  enableEchoCancellation: true,
  enableVAD: true,
  enableAGC: true,
  enableFrameBuffering: true,
});

// Listen for voice activity
processor.on('voice-start', () => {
  console.log('User started speaking');
});

processor.on('voice-stop', () => {
  console.log('User stopped speaking');
});
```

### Processing Audio Frames

```typescript
// Get PCM audio from microphone
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioContext = new AudioContext({ sampleRate: 16000 });
const mediaStream = audioContext.createMediaStreamSource(stream);
const processor = audioContext.createScriptProcessor(320, 1, 1); // 320 samples = 20ms

processor.onaudioprocess = async (event) => {
  const pcmData = event.inputBuffer.getChannelData(0);

  // Process audio
  const result = await audioProcessor.processAudioFrame(
    new Float32Array(pcmData)
  );

  if (result) {
    // Encoded frame with metrics
    console.log('Encoded:', result.encoded.data.length, 'bytes');
    console.log('VAD confidence:', result.vad?.confidence);
    console.log('Gain applied:', result.agc?.gainApplied, 'dB');
    console.log('Processing time:', result.metrics.processingTimeMs, 'ms');

    // Send encoded frame to peer
    await sendEncodedAudioToPeer(result.encoded);
  } else {
    // Silent frame skipped
    console.log('Silence detected, frame skipped');
  }
};
```

### Receiving & Decoding Audio

```typescript
// Receive encoded frame from peer
async function receiveAndDecodeAudio(encodedFrame: EncodedAudioFrame) {
  try {
    // Decode Opus to PCM
    const decoded = await audioProcessor.decodeAudioFrame(encodedFrame);

    // Play audio
    const audioContext = new AudioContext();
    const source = audioContext.createBufferSource();

    const audioBuffer = audioContext.createBuffer(
      decoded.channelCount,
      decoded.pcm.length,
      decoded.sampleRate
    );

    audioBuffer.copyToChannel(decoded.pcm, 0);
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (error) {
    console.error('Failed to decode audio:', error);
  }
}
```

## Component Details

### Opus Codec

Encodes PCM audio to Opus format with configurable bitrate.

**Configuration:**
```typescript
interface OpusConfig {
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000;
  channels: 1 | 2;
  bitrate: number; // 6-510 kbps
  complexity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  useFEC: boolean; // Forward Error Correction
  useDTX: boolean; // Silence suppression
}
```

**Recommended Settings:**
- **High Quality**: 24-48 kbps, complexity 7-10, FEC enabled
- **Balanced**: 16-24 kbps, complexity 5-7, FEC enabled
- **Low Bandwidth**: 8-16 kbps, complexity 3-5, DTX enabled

**Bitrate Guidelines:**
- 6 kbps: Minimum, speech only
- 12-16 kbps: Mobile/weak networks
- 24-32 kbps: Recommended for games
- 48+ kbps: High quality, office/conference

### Voice Activity Detection (VAD)

Detects voice presence and skips silent frames to save bandwidth.

**How It Works:**
1. **Energy Analysis**: RMS level measurement
2. **Spectral Analysis**: Frequency content analysis (speech has 800-4000 Hz centroid)
3. **Zero-Crossing Rate**: Distinguishes voice from noise

**Results:**
```typescript
interface VADResult {
  isVoiceActive: boolean;
  confidence: number; // 0-1
  energyLevel: number; // 0-1, normalized
  spectralCentroid: number; // Hz
  zeroCrossingRate: number; // 0-1
}
```

**Bandwidth Savings:**
- Typical voice: 30-40% of frames are silence
- VAD can reduce bandwidth by 25-35%
- Combined with DTX (Opus silence suppression): 40-50% reduction

**Voice Start/Stop Events:**
```typescript
processor.on('voice-start', () => {
  // User started speaking
});

processor.on('voice-stop', () => {
  // User stopped speaking (after max silence duration)
});
```

### Automatic Gain Control (AGC)

Normalizes microphone levels and prevents clipping.

**Features:**
- **Target Level**: Brings input to consistent output level
- **Attack/Release**: Time-based smoothing prevents artifacts
- **Compression**: Reduces gain above target for better dynamics
- **Clipping Prevention**: Soft limiting to prevent distortion

**Configuration:**
```typescript
interface AGCConfig {
  targetLevel: number; // 0-1, typically 0.75
  attackTime: number; // ms, 1-100ms for responsive adjustment
  releaseTime: number; // ms, 50-500ms for smooth reduction
  maxGain: number; // dB, typically 30-40dB
  compression: number; // 0-1, compression above threshold
  noiseGateThreshold: number; // 0-1, minimum level to process
}
```

**Typical Results:**
- Quiet input (0.1): +30dB gain
- Normal input (0.7): ±2dB adjustment
- Loud input (0.95): -5dB compression

**Clipping Detection:**
```typescript
const result = agc.processFrame(pcmData);
console.log('Clipping:', result.clipping, '%');
```

### Audio Frame Buffer

Manages out-of-order frames and implements jitter buffering.

**Features:**
- **Order Correction**: Handles out-of-sequence frames
- **Priority Queuing**: Preserves high-priority frames on overflow
- **Latency Tracking**: Measures end-to-end delay
- **Underrun Detection**: Signals when frames unavailable

**Configuration:**
```typescript
interface BufferConfig {
  maxBufferSize: number; // 20-50 frames
  targetLatency: number; // 100-300ms
  sampleRate: number;
  frameSize: number; // samples per frame
}
```

**Buffer Dynamics:**
```
Normal operation: 100-150ms buffer
High packet loss: 150-200ms buffer
Low bandwidth: 200-300ms buffer
```

**Statistics:**
```typescript
const stats = buffer.getStats();
console.log('Buffered frames:', stats.bufferedFrames);
console.log('Utilization:', (stats.bufferUtilization * 100).toFixed(1), '%');
console.log('Average latency:', stats.averageLatency.toFixed(1), 'ms');
console.log('Underruns:', stats.underruns);
console.log('Overruns:', stats.overruns);
```

## Processing Pipeline

### Encode Path (Local → Peer)

```
1. Microphone Audio (48kHz)
   ↓
2. Resample to 16kHz
   ↓
3. Voice Activity Detection
   → Skip silent frames
   ↓
4. Automatic Gain Control
   - Normalize levels
   - Prevent clipping
   ↓
5. Echo Cancellation (WebRTC)
   - Remove speaker echo
   ↓
6. Opus Encoding
   - 20ms frames
   - 24kbps typical
   ↓
7. Frame Buffer
   - Order verification
   - Jitter handling
   ↓
8. Send to Peer via WebRTC Data Channel
```

### Decode Path (Peer → Local)

```
1. Receive Encoded Audio from Peer
   ↓
2. Frame Buffer Management
   - Handle packet loss
   - Reorder out-of-sequence
   ↓
3. Opus Decoding
   - Reconstruct PCM
   - FEC recovery if available
   ↓
4. Audio Output
   - Play through speakers
   - 16kHz, 20ms frames
```

## Performance Optimization

### Bandwidth Optimization

```typescript
// Strategy: Reduce bitrate on poor networks
processor.on('network-quality-change', (metrics) => {
  if (metrics.quality === 'poor') {
    // Switch to low bitrate
    processor.config.opus.bitrate = 12; // 12 kbps
  } else if (metrics.quality === 'excellent') {
    // Use higher bitrate
    processor.config.opus.bitrate = 32; // 32 kbps
  }
});
```

### CPU Optimization

```typescript
// Lower complexity on weak devices
const processor = createAudioProcessor({
  opus: {
    sampleRate: 16000,
    channels: 1,
    bitrate: 24,
    complexity: 3, // Low CPU
    useFEC: true,
    useDTX: true,
  },
  // ... rest of config
});
```

### Latency Optimization

```typescript
// Shorter target latency for gaming
buffer: {
  maxBufferSize: 15, // Fewer frames buffered
  targetLatency: 100, // 100ms target
  sampleRate: 16000,
  frameSize: 320,
}
```

## Error Handling

### Packet Loss Recovery

```typescript
// Add lost frame marker
const lostFrameId = buffer.addLostFrame(
  timestamp,
  20, // duration
  expectedSequence
);

// Processor handles loss gracefully with FEC
const decoded = await processor.decodeAudioFrame(
  encodedFrame,
  true // packetLoss = true
);
```

### Clipping Prevention

```typescript
const result = agc.processFrame(pcmData);

if (result.clipping > 0.5) {
  // More than 0.5% clipping - reduce gain
  console.warn('High clipping detected, microphone too loud');
  // Adjust AGC parameters
}
```

### Buffer Underrun Handling

```typescript
const frame = processor.getNextBufferedFrame();

if (!frame) {
  // Buffer underrun - send silence
  playbackContext.playSilence(20);
}
```

## Statistics & Monitoring

### Real-time Metrics

```typescript
const stats = processor.getDetailedStats();

console.log('Processing:');
console.log('- Frames:', stats.processor.framesProcessed);
console.log('- Avg time:', stats.processor.averageProcessingTimeMs, 'ms');
console.log('- Bitrate:', stats.processor.bitrateMbps, 'Mbps');
console.log('- Voice %:', stats.processor.voiceActivityPercentage, '%');

console.log('Codec:');
console.log('- Compression:', stats.opus.encode.compressionRatio);
console.log('- Decode errors:', stats.opus.decode.decodingErrors);

console.log('VAD:');
console.log('- Voice frames:', stats.vad.voiceFrames);
console.log('- Silence frames:', stats.vad.silenceFrames);

console.log('AGC:');
console.log('- Avg gain:', stats.agc.averageGain, 'dB');
console.log('- Clipping %:', stats.agc.clippingPercentage);

console.log('Buffer:');
console.log('- Buffered:', stats.buffer.bufferedFrames);
console.log('- Latency:', stats.buffer.averageLatency, 'ms');
console.log('- Underruns:', stats.buffer.underruns);
```

## Quality Assessment

### Network Quality Factors

| Metric | Excellent | Good | Fair | Poor |
|--------|-----------|------|------|------|
| RTT | <50ms | 50-100ms | 100-150ms | >150ms |
| Loss | <1% | 1-2% | 2-5% | >5% |
| Jitter | <10ms | 10-30ms | 30-50ms | >50ms |

### Opus Quality vs Bitrate

| Bitrate | Quality | Use Case |
|---------|---------|----------|
| 6 kbps | Poor | Emergency only |
| 8-12 kbps | Fair | Low bandwidth (satellite, 3G) |
| 12-16 kbps | Good | Mobile networks |
| 16-24 kbps | Very Good | Gaming, standard calls |
| 24-32 kbps | Excellent | High-quality calls |
| 48+ kbps | HD | Conference, studio |

## Integration with WebRTC

### Connect Audio to WebRTC Peer

```typescript
// Get processed audio from buffer
const bufferedFrame = processor.getNextBufferedFrame();

if (bufferedFrame) {
  // Send via WebRTC data channel
  peerConnection.sendData('audio-stream', bufferedFrame.data);
}

// Receive from peer
peerConnection.on('data-channel-message', async (event) => {
  if (event.label === 'audio-stream') {
    const encodedFrame = JSON.parse(event.data);
    const decoded = await processor.decodeAudioFrame(encodedFrame);

    // Play audio
    playAudio(decoded.pcm, decoded.sampleRate);
  }
});
```

## Troubleshooting

### High Clipping / Distortion

**Cause**: Microphone too loud or AGC too aggressive
**Solution**:
```typescript
agc.config.targetLevel = 0.6; // Lower target
agc.config.maxGain = 20; // Reduce max gain
```

### Echo / Feedback

**Cause**: Echo cancellation disabled
**Solution**:
```typescript
processor.config.enableEchoCancellation = true;
// Use WebRTC's built-in echo cancellation
```

### Delay / Latency

**Cause**: Buffer too large or processing too slow
**Solution**:
```typescript
buffer.config.targetLatency = 100; // Reduce target
buffer.config.maxBufferSize = 15; // Fewer frames
```

### Missing Audio / Underruns

**Cause**: Network loss or processing delays
**Solution**:
```typescript
// Increase buffer
buffer.config.maxBufferSize = 40;
buffer.config.targetLatency = 300;

// Use FEC
opus.useFEC = true;
```

### High CPU Usage

**Cause**: Complexity too high
**Solution**:
```typescript
opus.complexity = 3; // Lower complexity
vad.threshold = 0.6; // Skip more frames
```

## API Reference

### AudioProcessor

```typescript
// Lifecycle
createAudioProcessor(config): AudioProcessor

// Processing
async processAudioFrame(pcm: Float32Array): ProcessedAudioFrame | null
async decodeAudioFrame(encoded: EncodedAudioFrame, packetLoss?: boolean): DecodedAudioFrame

// Buffer
getNextBufferedFrame(): BufferedFrame | null

// Statistics
getStats(): AudioProcessorStats
getDetailedStats(): { processor, opus, vad, agc, buffer }
resetStats(): void

// Cleanup
async close(): Promise<void>

// Events
on('voice-start', handler)
on('voice-stop', handler)
```

### Configuration Presets

```typescript
// Ultra-low bandwidth
const ultraLow: AudioProcessorConfig = {
  opus: { bitrate: 8, complexity: 1, sampleRate: 8000, ... },
  vad: { threshold: 0.7, ... },
  agc: { targetLevel: 0.6, maxGain: 30, ... },
  buffer: { targetLatency: 300, ... },
};

// Gaming (recommended)
const gaming: AudioProcessorConfig = {
  opus: { bitrate: 24, complexity: 5, ... },
  vad: { threshold: 0.5, ... },
  agc: { targetLevel: 0.75, ... },
  buffer: { targetLatency: 150, ... },
};

// High quality
const highQuality: AudioProcessorConfig = {
  opus: { bitrate: 48, complexity: 9, ... },
  vad: { threshold: 0.4, ... },
  agc: { targetLevel: 0.8, ... },
  buffer: { targetLatency: 200, ... },
};
```

## Production Deployment Checklist

- [ ] Configure bitrate based on expected network
- [ ] Test echo cancellation with real hardware
- [ ] Validate VAD sensitivity on target noise levels
- [ ] Set appropriate buffer latency targets
- [ ] Monitor clipping events in production
- [ ] Track statistics for quality metrics
- [ ] Handle packet loss gracefully
- [ ] Implement fallback for underruns
- [ ] Test on target devices (mobile, desktop)
- [ ] Profile CPU usage under load

## References

- [Opus Codec Specification (RFC 6716)](https://tools.ietf.org/html/rfc6716)
- [WebRTC Audio Processing](https://webrtc.org//)
- [VAD Techniques](https://en.wikipedia.org/wiki/Voice_activity_detection)
- [Automatic Gain Control](https://en.wikipedia.org/wiki/Automatic_gain_control)
- [Audio Jitter Buffer](https://en.wikipedia.org/wiki/Jitter_buffer)
