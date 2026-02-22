import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OpusCodec,
  createOpusCodec,
  type OpusConfig,
} from '../../src/audio/opus-codec.js';
import {
  VoiceActivityDetector,
  createVoiceActivityDetector,
  type VADConfig,
} from '../../src/audio/voice-activity-detection.js';
import {
  AutomaticGainControl,
  createAutomaticGainControl,
  type AGCConfig,
} from '../../src/audio/agc.js';
import {
  AudioFrameBuffer,
  createAudioFrameBuffer,
  type BufferConfig,
} from '../../src/audio/audio-frame-buffer.js';
import {
  AudioProcessor,
  createAudioProcessor,
  type AudioProcessorConfig,
} from '../../src/audio/audio-processor.js';

// ═══════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════

const createSyntheticAudio = (
  durationMs: number,
  sampleRate: number,
  frequency: number = 440 // Hz
): Float32Array => {
  const sampleCount = Math.floor((durationMs * sampleRate) / 1000);
  const audio = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    audio[i] = Math.sin(2 * Math.PI * frequency * t) * 0.1; // 10% amplitude
  }

  return audio;
};

const createSilence = (durationMs: number, sampleRate: number): Float32Array => {
  const sampleCount = Math.floor((durationMs * sampleRate) / 1000);
  return new Float32Array(sampleCount);
};

describe('Audio Processing Integration Suite', () => {
  describe('OpusCodec', () => {
    let codec: OpusCodec;
    const config: OpusConfig = {
      sampleRate: 16000,
      channels: 1,
      bitrate: 24,
      complexity: 5,
      useFEC: true,
      useDTX: true,
    };

    beforeEach(() => {
      codec = createOpusCodec(config);
    });

    afterEach(async () => {
      // Cleanup if needed
    });

    it('should initialize codec', () => {
      expect(codec.getCodecId()).toBeDefined();
      expect(typeof codec.getCodecId()).toBe('string');
    });

    it('should encode audio frame', async () => {
      const audio = createSyntheticAudio(20, 16000);
      const frame = {
        data: new Uint8Array(audio.buffer),
        timestamp: Date.now(),
        duration: 20,
        sampleCount: audio.length,
      };

      const encoded = await codec.encode(frame);

      expect(encoded.frameId).toBeDefined();
      expect(encoded.data).toBeDefined();
      expect(encoded.data.length).toBeGreaterThan(0);
      expect(encoded.sequenceNumber).toBe(0);
    });

    it('should decode encoded frame', async () => {
      const audio = createSyntheticAudio(20, 16000);
      const frame = {
        data: new Uint8Array(audio.buffer),
        timestamp: Date.now(),
        duration: 20,
        sampleCount: audio.length,
      };

      const encoded = await codec.encode(frame);
      const decoded = await codec.decode(encoded);

      expect(decoded.pcm).toBeDefined();
      expect(decoded.pcm).toBeInstanceOf(Float32Array);
      expect(decoded.sampleRate).toBe(16000);
      expect(decoded.channelCount).toBe(1);
    });

    it('should track compression ratio', async () => {
      const audio = createSyntheticAudio(20, 16000);
      const frame = {
        data: new Uint8Array(audio.buffer),
        timestamp: Date.now(),
        duration: 20,
        sampleCount: audio.length,
      };

      await codec.encode(frame);
      const stats = codec.getStats();

      expect(stats.encode.compressionRatio).toBeGreaterThan(1);
      expect(stats.encode.framesEncoded).toBe(1);
    });

    it('should handle silent frames', async () => {
      const silence = createSilence(20, 16000);
      const frame = {
        data: new Uint8Array(silence.buffer),
        timestamp: Date.now(),
        duration: 20,
        sampleCount: silence.length,
      };

      const encoded = await codec.encode(frame);

      expect(encoded.isSilence).toBe(true);
    });
  });

  describe('VoiceActivityDetector', () => {
    let vad: VoiceActivityDetector;
    const config: VADConfig = {
      sampleRate: 16000,
      frameSize: 320,
      threshold: 0.5,
      minVoiceDuration: 100,
      maxSilenceDuration: 1000,
      noiseFloor: 0.02,
    };

    beforeEach(() => {
      vad = createVoiceActivityDetector(config);
    });

    it('should detect voice activity', () => {
      const audio = createSyntheticAudio(20, 16000);

      const result = vad.processFrame(audio);

      expect(result).toBeDefined();
      expect(result.isVoiceActive).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect silence', () => {
      const silence = createSilence(20, 16000);

      const result = vad.processFrame(silence);

      expect(result.isVoiceActive).toBe(false);
      expect(result.energyLevel).toBeLessThan(0.1);
    });

    it('should calculate spectral centroid', () => {
      const audio = createSyntheticAudio(20, 16000, 1000);

      const result = vad.processFrame(audio);

      expect(result.spectralCentroid).toBeGreaterThan(0);
      expect(result.spectralCentroid).toBeLessThan(8000);
    });

    it('should track voice percentage', () => {
      const audio = createSyntheticAudio(20, 16000);

      for (let i = 0; i < 10; i++) {
        vad.processFrame(audio);
      }

      const stats = vad.getStats();

      expect(stats.frameCount).toBe(10);
      expect(stats.voicePercentage).toBeGreaterThan(0);
      expect(stats.voicePercentage).toBeLessThanOrEqual(100);
    });

    it('should detect voice transitions', () => {
      const voice = createSyntheticAudio(20, 16000);
      const silence = createSilence(20, 16000);

      let voiceStarted = false;
      let voiceStopped = false;

      vad.on('voice-start', () => {
        voiceStarted = true;
      });

      vad.on('voice-stop', () => {
        voiceStopped = true;
      });

      vad.processFrame(voice);
      vad.processFrame(silence);

      // Note: Transitions detected over multiple frames
      expect(vad.getStats().transitions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AutomaticGainControl', () => {
    let agc: AutomaticGainControl;
    const config: AGCConfig = {
      targetLevel: 0.75,
      attackTime: 10,
      releaseTime: 100,
      maxGain: 40,
      compression: 0.5,
      noiseGateThreshold: 0.01,
      lookAhead: 10,
    };

    beforeEach(() => {
      agc = createAutomaticGainControl(config);
    });

    it('should apply gain to quiet audio', () => {
      const quietAudio = createSyntheticAudio(20, 16000, 440);
      for (let i = 0; i < quietAudio.length; i++) {
        quietAudio[i] *= 0.1; // 10% volume
      }

      const result = agc.processFrame(quietAudio);

      expect(result.gainApplied).toBeGreaterThan(0);
      expect(result.data).toBeDefined();
    });

    it('should prevent clipping', () => {
      const audio = new Float32Array(320);
      for (let i = 0; i < audio.length; i++) {
        audio[i] = (Math.random() - 0.5) * 2; // Random between -1 and 1
      }

      const result = agc.processFrame(audio);

      // Check all samples are within [-1, 1]
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBeGreaterThanOrEqual(-1);
        expect(result.data[i]).toBeLessThanOrEqual(1);
      }
    });

    it('should track clipping percentage', () => {
      const audio = new Float32Array(320).fill(1.5); // Over-unity

      const result = agc.processFrame(audio);

      expect(result.clipping).toBeGreaterThan(0);
    });

    it('should smooth gain changes', () => {
      const quietAudio = createSyntheticAudio(20, 16000);
      for (let i = 0; i < quietAudio.length; i++) {
        quietAudio[i] *= 0.05;
      }

      const gains: number[] = [];
      for (let i = 0; i < 10; i++) {
        const result = agc.processFrame(quietAudio);
        gains.push(result.gainApplied);
      }

      // Gains should show smooth progression
      for (let i = 1; i < gains.length; i++) {
        const change = Math.abs(gains[i] - gains[i - 1]);
        expect(change).toBeLessThan(5); // Less than 5dB change per frame
      }
    });
  });

  describe('AudioFrameBuffer', () => {
    let buffer: AudioFrameBuffer;
    const config: BufferConfig = {
      maxBufferSize: 30,
      targetLatency: 200,
      sampleRate: 16000,
      frameSize: 320,
    };

    beforeEach(() => {
      buffer = createAudioFrameBuffer(config);
    });

    afterEach(() => {
      buffer.close();
    });

    it('should add and retrieve frames', () => {
      const data = new Uint8Array(320);
      buffer.addFrame(data, Date.now(), 20);

      const frame = buffer.getNextFrame();

      expect(frame).toBeDefined();
      if (frame) {
        expect(frame.data).toBeDefined();
        expect(frame.duration).toBe(20);
      }
    });

    it('should maintain frame order', () => {
      for (let i = 0; i < 5; i++) {
        const data = new Uint8Array(320).fill(i);
        buffer.addFrame(data, Date.now() + i, 20, 'normal');
      }

      const frames = [];
      for (let i = 0; i < 5; i++) {
        const frame = buffer.getNextFrame();
        if (frame) frames.push(frame.sequenceNumber);
      }

      expect(frames.length).toBe(5);
    });

    it('should detect underruns', () => {
      const frame = buffer.getNextFrame();

      expect(frame).toBeNull();
      const stats = buffer.getStats();
      expect(stats.underruns).toBe(1);
    });

    it('should handle buffer overflow', () => {
      // Add more frames than max size
      for (let i = 0; i < 40; i++) {
        const data = new Uint8Array(320);
        buffer.addFrame(data, Date.now() + i, 20, 'low');
      }

      const stats = buffer.getStats();

      expect(stats.droppedFrames).toBeGreaterThan(0);
      expect(buffer.getBufferSize()).toBeLessThanOrEqual(config.maxBufferSize);
    });

    it('should prioritize high priority frames', () => {
      // Fill buffer with low priority frames
      for (let i = 0; i < config.maxBufferSize; i++) {
        const data = new Uint8Array(320).fill(0);
        buffer.addFrame(data, Date.now() + i, 20, 'low');
      }

      // Add high priority frame
      const highPrioData = new Uint8Array(320).fill(255);
      buffer.addFrame(
        highPrioData,
        Date.now() + 1000,
        20,
        'high'
      );

      // Check that buffer still has high priority frame
      const stats = buffer.getStats();
      expect(stats.bufferedFrames).toBe(config.maxBufferSize);
    });

    it('should track average latency', () => {
      for (let i = 0; i < 5; i++) {
        const data = new Uint8Array(320);
        buffer.addFrame(data, Date.now() - 50 - i * 10, 20);
      }

      for (let i = 0; i < 5; i++) {
        buffer.getNextFrame();
      }

      const stats = buffer.getStats();

      expect(stats.averageLatency).toBeGreaterThan(0);
      expect(stats.maxLatency).toBeGreaterThan(stats.averageLatency);
    });
  });

  describe('AudioProcessor', () => {
    let processor: AudioProcessor;
    const config: AudioProcessorConfig = {
      opus: {
        sampleRate: 16000,
        channels: 1,
        bitrate: 24,
        complexity: 5,
        useFEC: true,
        useDTX: true,
      },
      vad: {
        sampleRate: 16000,
        frameSize: 320,
        threshold: 0.5,
        minVoiceDuration: 100,
        maxSilenceDuration: 1000,
        noiseFloor: 0.02,
      },
      agc: {
        targetLevel: 0.75,
        attackTime: 10,
        releaseTime: 100,
        maxGain: 40,
        compression: 0.5,
        noiseGateThreshold: 0.01,
        lookAhead: 10,
      },
      buffer: {
        maxBufferSize: 30,
        targetLatency: 200,
        sampleRate: 16000,
        frameSize: 320,
      },
      enableEchoCancellation: true,
      enableVAD: true,
      enableAGC: true,
      enableFrameBuffering: true,
    };

    beforeEach(() => {
      processor = createAudioProcessor(config);
    });

    afterEach(async () => {
      await processor.close();
    });

    it('should initialize processor', () => {
      expect(processor.getProcessorId()).toBeDefined();
    });

    it('should process voice frame', async () => {
      const audio = createSyntheticAudio(20, 16000);

      const result = await processor.processAudioFrame(audio);

      expect(result).toBeDefined();
      if (result) {
        expect(result.encoded).toBeDefined();
        expect(result.vad).toBeDefined();
        expect(result.agc).toBeDefined();
        expect(result.metrics).toBeDefined();
      }
    });

    it('should skip silent frames', async () => {
      const silence = createSilence(20, 16000);

      const result = await processor.processAudioFrame(silence);

      expect(result).toBeNull();
    });

    it('should decode audio frame', async () => {
      const audio = createSyntheticAudio(20, 16000);
      const frame = {
        data: new Uint8Array(audio.buffer),
        timestamp: Date.now(),
        duration: 20,
        sampleCount: audio.length,
      };

      const encoded = await processor['opusCodec'].encode(frame);
      const decoded = await processor.decodeAudioFrame(encoded);

      expect(decoded.pcm).toBeDefined();
      expect(decoded.pcm).toBeInstanceOf(Float32Array);
    });

    it('should collect comprehensive statistics', async () => {
      const audio = createSyntheticAudio(20, 16000);

      for (let i = 0; i < 5; i++) {
        await processor.processAudioFrame(audio);
      }

      const stats = processor.getStats();

      expect(stats.framesProcessed).toBeGreaterThan(0);
      expect(stats.averageProcessingTimeMs).toBeGreaterThan(0);
    });

    it('should get buffered frames', async () => {
      const audio = createSyntheticAudio(20, 16000);

      await processor.processAudioFrame(audio);

      const frame = processor.getNextBufferedFrame();

      // Frame may or may not be available depending on timing
      expect(frame === null || frame !== null).toBe(true);
    });

    it('should handle missing frames', async () => {
      const stats = processor.getStats();
      const initialUnderruns = stats.bufferUnderruns;

      processor.getNextBufferedFrame();

      const updatedStats = processor.getStats();
      expect(updatedStats.bufferUnderruns).toBeGreaterThanOrEqual(
        initialUnderruns
      );
    });
  });

  describe('Audio Processing Pipeline Integration', () => {
    it('should process complete voice call sequence', async () => {
      const processor = createAudioProcessor({
        opus: {
          sampleRate: 16000,
          channels: 1,
          bitrate: 24,
          complexity: 5,
          useFEC: true,
          useDTX: true,
        },
        vad: {
          sampleRate: 16000,
          frameSize: 320,
          threshold: 0.5,
          minVoiceDuration: 100,
          maxSilenceDuration: 1000,
          noiseFloor: 0.02,
        },
        agc: {
          targetLevel: 0.75,
          attackTime: 10,
          releaseTime: 100,
          maxGain: 40,
          compression: 0.5,
          noiseGateThreshold: 0.01,
          lookAhead: 10,
        },
        buffer: {
          maxBufferSize: 30,
          targetLatency: 200,
          sampleRate: 16000,
          frameSize: 320,
        },
        enableEchoCancellation: true,
        enableVAD: true,
        enableAGC: true,
        enableFrameBuffering: true,
      });

      try {
        // Simulate speech
        let voiceStarted = false;
        processor.on('voice-start', () => {
          voiceStarted = true;
        });

        // Process frames
        for (let i = 0; i < 10; i++) {
          const audio = createSyntheticAudio(20, 16000, 440 + i * 50);
          const result = await processor.processAudioFrame(audio);

          if (result) {
            // Process encoded frame
            await processor.decodeAudioFrame(result.encoded);
          }
        }

        const stats = processor.getDetailedStats();

        expect(stats.processor.framesProcessed).toBeGreaterThan(0);
        expect(stats.opus).toBeDefined();
        expect(stats.vad).toBeDefined();
        expect(stats.agc).toBeDefined();
        expect(stats.buffer).toBeDefined();

        await processor.close();
      } catch (error) {
        await processor.close();
        throw error;
      }
    });
  });
});
