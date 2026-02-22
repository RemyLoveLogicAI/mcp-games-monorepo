import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';
import {
  OpusCodec,
  createOpusCodec,
  type OpusConfig,
  type AudioFrame,
  type EncodedAudioFrame,
  type DecodedAudioFrame,
} from './opus-codec.js';
import {
  VoiceActivityDetector,
  createVoiceActivityDetector,
  type VADConfig,
  type VADResult,
} from './voice-activity-detection.js';
import {
  AutomaticGainControl,
  createAutomaticGainControl,
  type AGCConfig,
  type AGCFrame,
} from './agc.js';
import {
  AudioFrameBuffer,
  createAudioFrameBuffer,
  type BufferConfig,
  type BufferedFrame,
} from './audio-frame-buffer.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AudioProcessorConfig {
  opus: OpusConfig;
  vad: VADConfig;
  agc: AGCConfig;
  buffer: BufferConfig;
  enableEchoCancellation: boolean;
  enableVAD: boolean;
  enableAGC: boolean;
  enableFrameBuffering: boolean;
}

export interface ProcessedAudioFrame {
  encoded: EncodedAudioFrame;
  vad: VADResult | null;
  agc: AGCFrame | null;
  metrics: {
    inputLevel: number;
    outputLevel: number;
    processingTimeMs: number;
  };
}

export interface AudioProcessorStats {
  processorId: string;
  framesProcessed: number;
  totalProcessingTimeMs: number;
  averageProcessingTimeMs: number;
  bitrateMbps: number;
  voiceActivityPercentage: number;
  encodingErrors: number;
  bufferUnderruns: number;
}

// ═══════════════════════════════════════════════════════════
// AUDIO PROCESSOR
// ═══════════════════════════════════════════════════════════

export class AudioProcessor extends EventEmitter {
  private processorId: string = uuidv4();
  private config: AudioProcessorConfig;
  private opusCodec: OpusCodec;
  private vad: VoiceActivityDetector | null;
  private agc: AutomaticGainControl | null;
  private frameBuffer: AudioFrameBuffer | null;
  private stats = {
    framesProcessed: 0,
    totalProcessingTimeMs: 0,
    averageProcessingTimeMs: 0,
    bitrateMbps: 0,
    voiceActivityPercentage: 0,
    encodingErrors: 0,
    bufferUnderruns: 0,
  };
  private startTime: number = Date.now();
  private processingTimes: number[] = [];
  private readonly PROCESSING_TIME_HISTORY_SIZE = 30;

  constructor(config: AudioProcessorConfig) {
    super();
    this.config = config;

    // Initialize codec
    this.opusCodec = createOpusCodec(config.opus);

    // Initialize VAD
    this.vad = config.enableVAD
      ? createVoiceActivityDetector(config.vad)
      : null;

    // Initialize AGC
    this.agc = config.enableAGC
      ? createAutomaticGainControl(config.agc)
      : null;

    // Initialize frame buffer
    this.frameBuffer = config.enableFrameBuffering
      ? createAudioFrameBuffer(config.buffer)
      : null;

    if (this.frameBuffer) {
      this.frameBuffer.setAutoFlush(
        Math.floor(config.buffer.targetLatency / 2)
      );
    }

    this.setupEventHandlers();

    telemetry.emit('audio:processor_created', {
      processorId: this.processorId,
      enableVAD: config.enableVAD,
      enableAGC: config.enableAGC,
      enableFrameBuffering: config.enableFrameBuffering,
      enableEchoCancellation: config.enableEchoCancellation,
    });
  }

  /**
   * Process incoming PCM audio (encode path)
   */
  async processAudioFrame(
    pcmData: Float32Array
  ): Promise<ProcessedAudioFrame | null> {
    const processingStartTime = Date.now();

    try {
      let workingData = pcmData;
      let inputLevel = this.measureLevel(pcmData);
      let vadResult: VADResult | null = null;
      let agcFrame: AGCFrame | null = null;

      // Step 1: Voice Activity Detection
      if (this.vad) {
        vadResult = this.vad.processFrame(workingData);

        // Skip silence if VAD enabled
        if (!vadResult.isVoiceActive && this.vad) {
          telemetry.emit('audio:silence_detected', {
            processorId: this.processorId,
          });

          const processingTime = Date.now() - processingStartTime;
          this.recordProcessingTime(processingTime);

          return null; // Skip encoding silent frames
        }
      }

      // Step 2: Automatic Gain Control
      if (this.agc) {
        agcFrame = this.agc.processFrame(workingData);
        workingData = agcFrame.data;
      }

      // Step 3: Echo Cancellation (placeholder)
      if (this.config.enableEchoCancellation) {
        // In production, use WebRTC echo cancellation module
        // For now, just track that it's enabled
      }

      // Step 4: Create audio frame for encoding
      const audioFrame: AudioFrame = {
        data: this.float32ToUint8(workingData),
        timestamp: Date.now(),
        duration: (pcmData.length * 1000) / this.config.opus.sampleRate,
        sampleCount: pcmData.length,
      };

      // Step 5: Encode with Opus
      const encodedFrame = await this.opusCodec.encode(audioFrame);

      // Step 6: Add to buffer if enabled
      if (this.frameBuffer) {
        this.frameBuffer.addFrame(
          encodedFrame.data,
          encodedFrame.timestamp,
          encodedFrame.duration,
          vadResult?.confidence || 0 > 0.7 ? 'high' : 'normal'
        );
      }

      // Calculate metrics
      const outputLevel = this.measureLevel(workingData);
      const processingTime = Date.now() - processingStartTime;

      this.recordProcessingTime(processingTime);

      const processedFrame: ProcessedAudioFrame = {
        encoded: encodedFrame,
        vad: vadResult,
        agc: agcFrame,
        metrics: {
          inputLevel,
          outputLevel,
          processingTimeMs: processingTime,
        },
      };

      // Update statistics
      this.stats.framesProcessed++;
      this.stats.totalProcessingTimeMs += processingTime;
      this.stats.averageProcessingTimeMs =
        this.stats.totalProcessingTimeMs / this.stats.framesProcessed;
      this.stats.bitrateMbps =
        (encodedFrame.data.length * 8 * 1000) / (encodedFrame.duration * 1000000);

      telemetry.emit('audio:frame_processed', {
        processorId: this.processorId,
        inputLevel: inputLevel.toFixed(3),
        outputLevel: outputLevel.toFixed(3),
        processingTimeMs: processingTime.toFixed(2),
        encodedSize: encodedFrame.data.length,
        isSilence: encodedFrame.isSilence,
      });

      return processedFrame;
    } catch (error) {
      this.stats.encodingErrors++;

      telemetry.emit('audio:processor_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processorId: this.processorId,
      });

      throw error;
    }
  }

  /**
   * Process incoming encoded audio (decode path)
   */
  async decodeAudioFrame(
    encodedFrame: EncodedAudioFrame,
    packetLoss: boolean = false
  ): Promise<DecodedAudioFrame> {
    try {
      const decodedFrame = await this.opusCodec.decode(
        encodedFrame,
        packetLoss
      );

      // Add to buffer if enabled
      if (this.frameBuffer) {
        this.frameBuffer.addFrame(
          decodedFrame.pcm,
          decodedFrame.timestamp,
          decodedFrame.duration
        );
      }

      telemetry.emit('audio:frame_decoded', {
        processorId: this.processorId,
        samples: decodedFrame.pcm.length,
        packetLoss,
      });

      return decodedFrame;
    } catch (error) {
      telemetry.emit('audio:decode_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processorId: this.processorId,
      });

      throw error;
    }
  }

  /**
   * Get next buffered frame
   */
  getNextBufferedFrame(): BufferedFrame | null {
    if (!this.frameBuffer) return null;

    const frame = this.frameBuffer.getNextFrame();
    if (!frame) {
      this.stats.bufferUnderruns++;
    }

    return frame;
  }

  /**
   * Get processor statistics
   */
  getStats(): AudioProcessorStats {
    return {
      processorId: this.processorId,
      ...this.stats,
    };
  }

  /**
   * Get detailed statistics from subcomponents
   */
  getDetailedStats() {
    return {
      processor: this.getStats(),
      opus: this.opusCodec.getStats(),
      vad: this.vad?.getStats() || null,
      agc: this.agc?.getStats() || null,
      buffer: this.frameBuffer?.getStats() || null,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      framesProcessed: 0,
      totalProcessingTimeMs: 0,
      averageProcessingTimeMs: 0,
      bitrateMbps: 0,
      voiceActivityPercentage: 0,
      encodingErrors: 0,
      bufferUnderruns: 0,
    };

    this.opusCodec.resetStats();
    this.vad?.resetStats();
    this.agc?.resetStats();
    this.frameBuffer?.resetStats();

    telemetry.emit('audio:processor_stats_reset', {
      processorId: this.processorId,
    });
  }

  /**
   * Close processor
   */
  async close(): Promise<void> {
    this.frameBuffer?.close();

    telemetry.emit('audio:processor_closed', {
      processorId: this.processorId,
      totalFrames: this.stats.framesProcessed,
      avgProcessingMs: this.stats.averageProcessingTimeMs.toFixed(2),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private setupEventHandlers(): void {
    if (this.vad) {
      this.vad.on('voice-start', () => {
        this.emit('voice-start');
      });

      this.vad.on('voice-stop', () => {
        this.emit('voice-stop');
      });
    }
  }

  private measureLevel(pcmData: Float32Array): number {
    let sumSquares = 0;

    for (let i = 0; i < pcmData.length; i++) {
      const sample = Math.min(1, Math.max(-1, pcmData[i]));
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / pcmData.length);
    return Math.max(0, Math.min(1, rms));
  }

  private float32ToUint8(float32Data: Float32Array): Uint8Array {
    const uint8Data = new Uint8Array(float32Data.length * 2);
    const view = new Int16Array(uint8Data.buffer);

    for (let i = 0; i < float32Data.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Data[i]));
      view[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return uint8Data;
  }

  private recordProcessingTime(timeMs: number): void {
    this.processingTimes.push(timeMs);
    if (this.processingTimes.length > this.PROCESSING_TIME_HISTORY_SIZE) {
      this.processingTimes.shift();
    }
  }

  /**
   * Get processor ID
   */
  getProcessorId(): string {
    return this.processorId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createAudioProcessor(
  config: AudioProcessorConfig
): AudioProcessor {
  return new AudioProcessor(config);
}
