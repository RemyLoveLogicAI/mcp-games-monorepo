import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface OpusConfig {
  sampleRate: 8000 | 12000 | 16000 | 24000 | 48000;
  channels: 1 | 2;
  bitrate: number; // kbps, 6-510
  complexity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // 0-10, 0=low CPU, 10=high quality
  useFEC: boolean; // Forward Error Correction
  useDTX: boolean; // Discontinuous Transmission (silence suppression)
  maxPayloadSize?: number; // bytes
}

export interface AudioFrame {
  data: Uint8Array;
  timestamp: number;
  duration: number; // milliseconds
  sampleCount: number;
}

export interface EncodedAudioFrame {
  data: Uint8Array;
  timestamp: number;
  duration: number;
  frameId: string;
  sequenceNumber: number;
  isSilence: boolean; // DTX indicator
}

export interface DecodedAudioFrame {
  pcm: Float32Array;
  timestamp: number;
  duration: number;
  channelCount: number;
  sampleRate: number;
  loss: boolean; // Was this frame affected by packet loss?
}

// ═══════════════════════════════════════════════════════════
// OPUS CODEC WRAPPER
// ═══════════════════════════════════════════════════════════

export class OpusCodec extends EventEmitter {
  private codecId: string = uuidv4();
  private config: OpusConfig;
  private encodedFrameSequence: number = 0;
  private decodedFrameSequence: number = 0;
  private encodeStats = {
    framesEncoded: 0,
    bytesEncoded: 0,
    averageFrameSize: 0,
    compressionRatio: 0,
  };
  private decodeStats = {
    framesDecoded: 0,
    samplesDecoded: 0,
    decodingErrors: 0,
  };

  constructor(config: OpusConfig) {
    super();
    this.config = {
      maxPayloadSize: 4000, // Default max payload
      ...config,
    };

    telemetry.emit('audio:opus_codec_created', {
      codecId: this.codecId,
      sampleRate: config.sampleRate,
      bitrate: config.bitrate,
      complexity: config.complexity,
      useFEC: config.useFEC,
      useDTX: config.useDTX,
    });
  }

  /**
   * Encode PCM audio to Opus
   */
  async encode(frame: AudioFrame): Promise<EncodedAudioFrame> {
    try {
      // In a real implementation, this would use opus-ts or similar library
      // For now, we'll simulate the encoding with frame metadata

      const frameId = uuidv4();
      const sequenceNumber = this.encodedFrameSequence++;

      // Simulate encoding: In production, use actual Opus encoder
      // For demonstration, we compress by assuming 16-bit PCM input
      const inputBytes = frame.data.length;

      // Opus typically compresses at 20-50kb/s at quality settings
      // Calculate estimated output size based on bitrate
      const estimatedSize = Math.ceil(
        (this.config.bitrate * (frame.duration / 1000)) / 8
      );

      const isSilence = this.detectSilenceInFrame(frame);

      const encodedFrame: EncodedAudioFrame = {
        data: this.simulateOpusEncoding(frame, estimatedSize),
        timestamp: frame.timestamp,
        duration: frame.duration,
        frameId,
        sequenceNumber,
        isSilence,
      };

      // Update stats
      this.encodeStats.framesEncoded++;
      this.encodeStats.bytesEncoded += encodedFrame.data.length;
      this.encodeStats.averageFrameSize =
        this.encodeStats.bytesEncoded / this.encodeStats.framesEncoded;
      this.encodeStats.compressionRatio = inputBytes / encodedFrame.data.length;

      telemetry.emit('audio:opus_encode_frame', {
        codecId: this.codecId,
        frameId,
        inputBytes,
        outputBytes: encodedFrame.data.length,
        isSilence,
        compressionRatio: this.encodeStats.compressionRatio.toFixed(2),
      });

      return encodedFrame;
    } catch (error) {
      telemetry.emit('audio:opus_encode_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        codecId: this.codecId,
      });

      throw error;
    }
  }

  /**
   * Decode Opus to PCM audio
   */
  async decode(
    encodedFrame: EncodedAudioFrame,
    packetLoss: boolean = false
  ): Promise<DecodedAudioFrame> {
    try {
      const sequenceNumber = this.decodedFrameSequence++;

      // In a real implementation, this would use opus-ts decoder
      // For now, simulate decoding

      // Opus sample count per frame
      // Common frame sizes: 2.5ms, 5ms, 10ms, 20ms, 40ms, 60ms
      const frameSizesMs = [2.5, 5, 10, 20, 40, 60];
      const frameSizeMs = encodedFrame.duration || 20; // default 20ms
      const samplesPerFrame =
        Math.floor((this.config.sampleRate * frameSizeMs) / 1000);

      // Create PCM output
      const pcmData = new Float32Array(
        samplesPerFrame * this.config.channels
      );

      if (packetLoss) {
        // Simulate packet loss with silence
        this.decodeStats.decodingErrors++;
        telemetry.emit('audio:opus_decode_packet_loss', {
          codecId: this.codecId,
          frameId: encodedFrame.frameId,
        });
      } else {
        // Simulate decoding: In production, use actual Opus decoder
        for (let i = 0; i < pcmData.length; i++) {
          // Generate synthetic PCM (in real implementation, from Opus decoder)
          pcmData[i] = (Math.random() - 0.5) * 0.1; // Small random values
        }
      }

      const decodedFrame: DecodedAudioFrame = {
        pcm: pcmData,
        timestamp: encodedFrame.timestamp,
        duration: encodedFrame.duration,
        channelCount: this.config.channels,
        sampleRate: this.config.sampleRate,
        loss: packetLoss,
      };

      // Update stats
      this.decodeStats.framesDecoded++;
      this.decodeStats.samplesDecoded += samplesPerFrame;

      telemetry.emit('audio:opus_decode_frame', {
        codecId: this.codecId,
        frameId: encodedFrame.frameId,
        samples: samplesPerFrame,
        packetLoss,
        sequenceNumber,
      });

      return decodedFrame;
    } catch (error) {
      this.decodeStats.decodingErrors++;

      telemetry.emit('audio:opus_decode_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        codecId: this.codecId,
        frameId: encodedFrame.frameId,
      });

      throw error;
    }
  }

  /**
   * Get codec statistics
   */
  getStats() {
    return {
      encode: { ...this.encodeStats },
      decode: { ...this.decodeStats },
      config: { ...this.config },
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.encodeStats = {
      framesEncoded: 0,
      bytesEncoded: 0,
      averageFrameSize: 0,
      compressionRatio: 0,
    };

    this.decodeStats = {
      framesDecoded: 0,
      samplesDecoded: 0,
      decodingErrors: 0,
    };

    telemetry.emit('audio:opus_stats_reset', {
      codecId: this.codecId,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private detectSilenceInFrame(frame: AudioFrame): boolean {
    // Detect if frame contains mostly silence
    // For 16-bit PCM: values below ±500 indicate silence
    const view = new Int16Array(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.length / 2
    );

    let silenceSamples = 0;
    const silenceThreshold = 500;

    for (let i = 0; i < view.length; i++) {
      if (Math.abs(view[i]) < silenceThreshold) {
        silenceSamples++;
      }
    }

    const silenceRatio = silenceSamples / view.length;
    return silenceRatio > 0.95; // >95% silence
  }

  private simulateOpusEncoding(
    frame: AudioFrame,
    estimatedSize: number
  ): Uint8Array {
    // Simulate Opus compressed frame
    // In production, this would be real Opus-encoded data
    const encoded = new Uint8Array(Math.max(10, estimatedSize));

    // Add frame metadata
    encoded[0] = (this.encodedFrameSequence & 0xff00) >> 8;
    encoded[1] = this.encodedFrameSequence & 0x00ff;
    encoded[2] = (this.config.bitrate & 0xff00) >> 8;
    encoded[3] = this.config.bitrate & 0x00ff;

    // Fill rest with deterministic but compressed-looking data
    for (let i = 4; i < encoded.length; i++) {
      encoded[i] = (frame.data[i % frame.data.length] >> 1) ^ 0xaa;
    }

    return encoded;
  }

  /**
   * Get codec ID
   */
  getCodecId(): string {
    return this.codecId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createOpusCodec(config: OpusConfig): OpusCodec {
  return new OpusCodec(config);
}
