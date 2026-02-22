import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface BufferConfig {
  maxBufferSize: number; // Maximum frames to buffer
  targetLatency: number; // ms, target buffer duration
  sampleRate: number;
  frameSize: number; // samples per frame
}

export interface BufferedFrame {
  id: string;
  data: Uint8Array | Float32Array;
  timestamp: number;
  sequenceNumber: number;
  duration: number; // ms
  priority: 'high' | 'normal' | 'low';
  isLost: boolean; // Indicates packet loss
}

export interface BufferStats {
  bufferedFrames: number;
  bufferUtilization: number; // 0-1
  totalFramesProcessed: number;
  droppedFrames: number;
  reorderedFrames: number;
  averageLatency: number; // ms
  maxLatency: number;
  underruns: number;
  overruns: number;
}

// ═══════════════════════════════════════════════════════════
// AUDIO FRAME BUFFER
// ═══════════════════════════════════════════════════════════

export class AudioFrameBuffer extends EventEmitter {
  private bufferId: string = uuidv4();
  private config: BufferConfig;
  private frameQueue: BufferedFrame[] = [];
  private sequenceNumber: number = 0;
  private stats: BufferStats = {
    bufferedFrames: 0,
    bufferUtilization: 0,
    totalFramesProcessed: 0,
    droppedFrames: 0,
    reorderedFrames: 0,
    averageLatency: 0,
    maxLatency: 0,
    underruns: 0,
    overruns: 0,
  };
  private latencyHistory: number[] = [];
  private readonly LATENCY_HISTORY_SIZE = 30;
  private lastRetrievedSequence: number = -1;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: BufferConfig) {
    super();
    this.config = config;

    telemetry.emit('audio:frame_buffer_created', {
      bufferId: this.bufferId,
      maxBufferSize: config.maxBufferSize,
      targetLatency: config.targetLatency,
    });
  }

  /**
   * Add frame to buffer
   */
  addFrame(
    data: Uint8Array | Float32Array,
    timestamp: number,
    duration: number,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): string {
    try {
      const frameId = uuidv4();
      const currentSequence = this.sequenceNumber++;

      const frame: BufferedFrame = {
        id: frameId,
        data,
        timestamp,
        sequenceNumber: currentSequence,
        duration,
        priority,
        isLost: false,
      };

      // Check for buffer overflow
      if (this.frameQueue.length >= this.config.maxBufferSize) {
        // Drop lowest priority frames if over capacity
        this.handleBufferOverflow();
        this.stats.overruns++;

        telemetry.emit('audio:buffer_overrun', {
          bufferId: this.bufferId,
          currentSize: this.frameQueue.length,
          maxSize: this.config.maxBufferSize,
        });
      }

      // Insert frame in order (handle out-of-order packets)
      this.insertFrameInOrder(frame);

      this.stats.bufferedFrames = this.frameQueue.length;
      this.stats.bufferUtilization =
        this.frameQueue.length / this.config.maxBufferSize;

      telemetry.emit('audio:frame_added_to_buffer', {
        bufferId: this.bufferId,
        frameId,
        sequence: currentSequence,
        queueSize: this.frameQueue.length,
      });

      return frameId;
    } catch (error) {
      telemetry.emit('audio:frame_buffer_add_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bufferId: this.bufferId,
      });

      throw error;
    }
  }

  /**
   * Add lost frame marker
   */
  addLostFrame(
    timestamp: number,
    duration: number,
    sequenceNumber: number
  ): string {
    const frameId = uuidv4();

    const frame: BufferedFrame = {
      id: frameId,
      data: new Uint8Array(0),
      timestamp,
      sequenceNumber,
      duration,
      priority: 'high', // Lost frames are high priority for detection
      isLost: true,
    };

    this.insertFrameInOrder(frame);

    telemetry.emit('audio:lost_frame_added', {
      bufferId: this.bufferId,
      frameId,
      sequence: sequenceNumber,
    });

    return frameId;
  }

  /**
   * Retrieve next frame (FIFO)
   */
  getNextFrame(): BufferedFrame | null {
    try {
      if (this.frameQueue.length === 0) {
        this.stats.underruns++;

        telemetry.emit('audio:buffer_underrun', {
          bufferId: this.bufferId,
        });

        return null;
      }

      const frame = this.frameQueue.shift();
      if (!frame) return null;

      // Calculate latency
      const latency = Date.now() - frame.timestamp;
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > this.LATENCY_HISTORY_SIZE) {
        this.latencyHistory.shift();
      }

      // Update stats
      this.stats.averageLatency =
        this.latencyHistory.reduce((a, b) => a + b, 0) /
        this.latencyHistory.length;
      this.stats.maxLatency = Math.max(...this.latencyHistory);
      this.stats.totalFramesProcessed++;
      this.stats.bufferedFrames = this.frameQueue.length;

      // Check for sequence gaps
      if (
        frame.sequenceNumber >
        this.lastRetrievedSequence + 1 &&
        this.lastRetrievedSequence >= 0
      ) {
        this.stats.reorderedFrames++;

        telemetry.emit('audio:frame_sequence_gap', {
          bufferId: this.bufferId,
          expectedSequence: this.lastRetrievedSequence + 1,
          actualSequence: frame.sequenceNumber,
        });
      }

      this.lastRetrievedSequence = frame.sequenceNumber;

      telemetry.emit('audio:frame_retrieved_from_buffer', {
        bufferId: this.bufferId,
        frameId: frame.id,
        sequence: frame.sequenceNumber,
        latency: latency.toFixed(1),
        queueSize: this.frameQueue.length,
      });

      return frame;
    } catch (error) {
      telemetry.emit('audio:frame_buffer_get_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bufferId: this.bufferId,
      });

      throw error;
    }
  }

  /**
   * Peek at next frame without removing
   */
  peekNextFrame(): BufferedFrame | null {
    return this.frameQueue.length > 0 ? this.frameQueue[0] : null;
  }

  /**
   * Get all buffered frames
   */
  getAllFrames(): BufferedFrame[] {
    return [...this.frameQueue];
  }

  /**
   * Clear all buffered frames
   */
  clear(): void {
    this.frameQueue = [];
    this.stats.bufferedFrames = 0;

    telemetry.emit('audio:frame_buffer_cleared', {
      bufferId: this.bufferId,
    });
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      bufferedFrames: 0,
      bufferUtilization: 0,
      totalFramesProcessed: 0,
      droppedFrames: 0,
      reorderedFrames: 0,
      averageLatency: 0,
      maxLatency: 0,
      underruns: 0,
      overruns: 0,
    };

    telemetry.emit('audio:frame_buffer_stats_reset', {
      bufferId: this.bufferId,
    });
  }

  /**
   * Set auto-flush timer for jitter buffer
   */
  setAutoFlush(intervalMs: number): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      // Check if buffer has old frames that should be flushed
      const now = Date.now();
      const maxAge = this.config.targetLatency * 2;

      while (this.frameQueue.length > 0) {
        const oldestFrame = this.frameQueue[0];
        const frameAge = now - oldestFrame.timestamp;

        if (frameAge > maxAge) {
          this.frameQueue.shift();
          this.stats.droppedFrames++;

          telemetry.emit('audio:frame_auto_flushed', {
            bufferId: this.bufferId,
            frameAge,
            maxAge,
          });
        } else {
          break;
        }
      }
    }, Math.max(10, Math.floor(this.config.targetLatency / 2)));
  }

  /**
   * Cancel auto-flush timer
   */
  clearAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private insertFrameInOrder(frame: BufferedFrame): void {
    // Find correct position to maintain sequence order
    let insertIndex = this.frameQueue.length;

    for (let i = 0; i < this.frameQueue.length; i++) {
      if (frame.sequenceNumber < this.frameQueue[i].sequenceNumber) {
        insertIndex = i;
        break;
      }
    }

    this.frameQueue.splice(insertIndex, 0, frame);
  }

  private handleBufferOverflow(): void {
    // Strategy: Remove lowest priority frames (low > normal > high)
    const lowPriorityIdx = this.frameQueue.findIndex(
      (f) => f.priority === 'low'
    );

    if (lowPriorityIdx >= 0) {
      this.frameQueue.splice(lowPriorityIdx, 1);
      this.stats.droppedFrames++;
      return;
    }

    const normalPriorityIdx = this.frameQueue.findIndex(
      (f) => f.priority === 'normal'
    );

    if (normalPriorityIdx >= 0) {
      this.frameQueue.splice(normalPriorityIdx, 1);
      this.stats.droppedFrames++;
      return;
    }

    // If no normal/low, remove oldest high priority frame
    if (this.frameQueue.length > 0) {
      this.frameQueue.shift();
      this.stats.droppedFrames++;
    }
  }

  /**
   * Get buffer ID
   */
  getBufferId(): string {
    return this.bufferId;
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.frameQueue.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.frameQueue.length === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.frameQueue.length >= this.config.maxBufferSize;
  }

  /**
   * Close buffer
   */
  close(): void {
    this.clearAutoFlush();
    this.clear();

    telemetry.emit('audio:frame_buffer_closed', {
      bufferId: this.bufferId,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createAudioFrameBuffer(
  config: BufferConfig
): AudioFrameBuffer {
  return new AudioFrameBuffer(config);
}
