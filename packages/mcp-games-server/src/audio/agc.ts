import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AGCConfig {
  targetLevel: number; // 0-1, desired output level (typically 0.7-0.8)
  attackTime: number; // ms, time to react to level increase
  releaseTime: number; // ms, time to react to level decrease
  maxGain: number; // dB, maximum gain to apply (typically 40dB)
  compression: number; // 0-1, compression ratio above threshold
  noiseGateThreshold: number; // 0-1, minimum level to process
  lookAhead: number; // ms, prediction window
}

export interface AGCFrame {
  data: Float32Array;
  gainApplied: number; // dB
  level: number; // 0-1, output level
  clipping: number; // 0-1, clipping percentage
  timestamp: number;
}

export interface AGCStats {
  framesProcessed: number;
  averageGain: number; // dB
  gainVariance: number;
  minGain: number;
  maxGain: number;
  clippingSamples: number;
  clippingFrames: number;
  compressionEngagements: number;
}

// ═══════════════════════════════════════════════════════════
// AUTOMATIC GAIN CONTROL
// ═══════════════════════════════════════════════════════════

export class AutomaticGainControl extends EventEmitter {
  private agcId: string = uuidv4();
  private config: AGCConfig;
  private currentGain: number = 0; // dB
  private smoothedLevel: number = 0;
  private stats: AGCStats = {
    framesProcessed: 0,
    averageGain: 0,
    gainVariance: 0,
    minGain: 0,
    maxGain: 0,
    clippingSamples: 0,
    clippingFrames: 0,
    compressionEngagements: 0,
  };
  private gainHistory: number[] = [];
  private levelHistory: number[] = [];
  private readonly HISTORY_SIZE = 30; // For variance calculation

  constructor(config: AGCConfig) {
    super();
    this.config = {
      targetLevel: 0.75,
      attackTime: 10,
      releaseTime: 100,
      maxGain: 40,
      compression: 0.5,
      noiseGateThreshold: 0.01,
      lookAhead: 10,
      ...config,
    };

    telemetry.emit('audio:agc_created', {
      agcId: this.agcId,
      targetLevel: this.config.targetLevel,
      maxGain: this.config.maxGain,
      attackTime: this.config.attackTime,
      releaseTime: this.config.releaseTime,
    });
  }

  /**
   * Process audio frame with AGC
   */
  processFrame(pcmData: Float32Array): AGCFrame {
    try {
      // Measure input level
      const inputLevel = this.measureLevel(pcmData);

      // Noise gate
      if (inputLevel < this.config.noiseGateThreshold) {
        return {
          data: this.copyArray(pcmData),
          gainApplied: 0,
          level: inputLevel,
          clipping: 0,
          timestamp: Date.now(),
        };
      }

      // Calculate required gain
      const requiredGain = this.calculateGain(inputLevel);

      // Apply adaptive attack/release smoothing
      this.currentGain = this.smoothGain(requiredGain);

      // Apply gain to signal
      const outputData = this.applyGain(
        pcmData,
        this.currentGain
      );

      // Measure clipping
      const clippingStats = this.detectClipping(outputData);

      // Update statistics
      this.updateStats(
        this.currentGain,
        outputLevel,
        clippingStats.clippingPercentage,
        clippingStats.clippingFrames > 0
      );

      const outputLevel = this.measureLevel(outputData);

      const frame: AGCFrame = {
        data: outputData,
        gainApplied: this.currentGain,
        level: outputLevel,
        clipping: clippingStats.clippingPercentage,
        timestamp: Date.now(),
      };

      telemetry.emit('audio:agc_frame_processed', {
        agcId: this.agcId,
        inputLevel: inputLevel.toFixed(3),
        outputLevel: outputLevel.toFixed(3),
        gainApplied: this.currentGain.toFixed(2),
        clipping: clippingStats.clippingPercentage.toFixed(2),
      });

      return frame;
    } catch (error) {
      telemetry.emit('audio:agc_processing_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        agcId: this.agcId,
      });

      throw error;
    }
  }

  /**
   * Get AGC statistics
   */
  getStats(): AGCStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      framesProcessed: 0,
      averageGain: 0,
      gainVariance: 0,
      minGain: 0,
      maxGain: 0,
      clippingSamples: 0,
      clippingFrames: 0,
      compressionEngagements: 0,
    };

    telemetry.emit('audio:agc_stats_reset', {
      agcId: this.agcId,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private measureLevel(pcmData: Float32Array): number {
    // RMS level measurement
    let sumSquares = 0;

    for (let i = 0; i < pcmData.length; i++) {
      const sample = Math.min(1, Math.max(-1, pcmData[i]));
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / pcmData.length);
    return Math.max(0, Math.min(1, rms));
  }

  private calculateGain(inputLevel: number): number {
    // Desired gain to bring input to target level
    if (inputLevel === 0) return 0;

    const gainLinear = this.config.targetLevel / inputLevel;
    const gainDb = 20 * Math.log10(gainLinear);

    // Apply compression above target
    if (inputLevel > this.config.targetLevel) {
      const excess = inputLevel - this.config.targetLevel;
      const compressionReduction =
        excess * (1 - this.config.compression) * 10;

      this.stats.compressionEngagements++;
      return Math.min(
        this.config.maxGain,
        Math.max(-60, gainDb - compressionReduction)
      );
    }

    return Math.min(this.config.maxGain, Math.max(-60, gainDb));
  }

  private smoothGain(targetGain: number): number {
    // Time-based smoothing with attack/release characteristics
    const timeDelta = 20; // Assume 20ms frames

    let gainChange: number;
    if (targetGain > this.currentGain) {
      // Attack phase (faster response)
      gainChange = (targetGain - this.currentGain) *
        (timeDelta / this.config.attackTime);
    } else {
      // Release phase (slower response)
      gainChange = (targetGain - this.currentGain) *
        (timeDelta / this.config.releaseTime);
    }

    return this.currentGain + gainChange;
  }

  private applyGain(
    pcmData: Float32Array,
    gainDb: number
  ): Float32Array {
    const gainLinear = Math.pow(10, gainDb / 20);
    const output = new Float32Array(pcmData.length);

    for (let i = 0; i < pcmData.length; i++) {
      output[i] = Math.max(-1, Math.min(1, pcmData[i] * gainLinear));
    }

    return output;
  }

  private detectClipping(pcmData: Float32Array): {
    clippingPercentage: number;
    clippingFrames: number;
    clippingSamples: number;
  } {
    const clipThreshold = 0.99; // Clipping when |sample| > 0.99
    let clippingSamples = 0;

    for (let i = 0; i < pcmData.length; i++) {
      if (Math.abs(pcmData[i]) > clipThreshold) {
        clippingSamples++;
      }
    }

    const clippingPercentage = (clippingSamples / pcmData.length) * 100;
    const isClippingFrame = clippingPercentage > 0;

    return {
      clippingPercentage,
      clippingFrames: isClippingFrame ? 1 : 0,
      clippingSamples,
    };
  }

  private updateStats(
    gain: number,
    level: number,
    clippingPercentage: number,
    isClippingFrame: boolean
  ): void {
    this.stats.framesProcessed++;

    // Track gain history for variance
    this.gainHistory.push(gain);
    if (this.gainHistory.length > this.HISTORY_SIZE) {
      this.gainHistory.shift();
    }

    // Track level history
    this.levelHistory.push(level);
    if (this.levelHistory.length > this.HISTORY_SIZE) {
      this.levelHistory.shift();
    }

    // Update statistics
    const gainSum = this.gainHistory.reduce((a, b) => a + b, 0);
    this.stats.averageGain = gainSum / this.gainHistory.length;
    this.stats.minGain = Math.min(...this.gainHistory);
    this.stats.maxGain = Math.max(...this.gainHistory);

    // Calculate variance
    const variance = this.gainHistory.reduce(
      (sum, g) => sum + Math.pow(g - this.stats.averageGain, 2),
      0
    ) / this.gainHistory.length;
    this.stats.gainVariance = Math.sqrt(variance);

    // Clipping tracking
    this.stats.clippingSamples += Math.round(
      (clippingPercentage / 100) * 1024
    );
    if (isClippingFrame) {
      this.stats.clippingFrames++;
    }

    // Level smoothing (exponential moving average)
    this.smoothedLevel =
      this.smoothedLevel * 0.9 + level * 0.1;
  }

  private copyArray(arr: Float32Array): Float32Array {
    return new Float32Array(arr);
  }

  /**
   * Get AGC ID
   */
  getAGCId(): string {
    return this.agcId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createAutomaticGainControl(
  config: AGCConfig
): AutomaticGainControl {
  return new AutomaticGainControl(config);
}
