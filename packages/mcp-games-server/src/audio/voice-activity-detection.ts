import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from '../observability/index.js';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface VADConfig {
  sampleRate: number;
  frameSize: number; // samples per frame
  threshold: number; // 0-1, energy threshold for voice detection
  minVoiceDuration: number; // ms, minimum voice duration to trigger
  maxSilenceDuration: number; // ms, silence duration before reset
  noiseFloor: number; // minimum noise level in dB
}

export interface VADResult {
  isVoiceActive: boolean;
  confidence: number; // 0-1, confidence of voice activity
  energyLevel: number; // 0-1, normalized energy
  spectralCentroid: number; // Hz, frequency concentration
  zeroCrossingRate: number; // 0-1, zero crossing density
  timestamp: number;
}

export interface VADStats {
  frameCount: number;
  voiceFrames: number;
  silenceFrames: number;
  voicePercentage: number;
  averageEnergy: number;
  peakEnergy: number;
  transitions: number; // Voice <-> Silence transitions
}

// ═══════════════════════════════════════════════════════════
// VOICE ACTIVITY DETECTOR
// ═══════════════════════════════════════════════════════════

export class VoiceActivityDetector extends EventEmitter {
  private vadId: string = uuidv4();
  private config: VADConfig;
  private stats: VADStats = {
    frameCount: 0,
    voiceFrames: 0,
    silenceFrames: 0,
    voicePercentage: 0,
    averageEnergy: 0,
    peakEnergy: 0,
    transitions: 0,
  };
  private voiceDuration: number = 0;
  private silenceDuration: number = 0;
  private lastVoiceState: boolean = false;
  private noiseProfile: {
    averageEnergy: number;
    spectralContent: number[];
  } = {
    averageEnergy: 0,
    spectralContent: new Array(8).fill(0),
  };
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 10;

  constructor(config: VADConfig) {
    super();
    this.config = config;

    telemetry.emit('audio:vad_created', {
      vadId: this.vadId,
      sampleRate: config.sampleRate,
      frameSize: config.frameSize,
      threshold: config.threshold,
    });
  }

  /**
   * Process audio frame for voice activity
   */
  processFrame(pcmData: Float32Array): VADResult {
    try {
      // Calculate energy level
      const energy = this.calculateEnergy(pcmData);
      this.energyHistory.push(energy);
      if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
        this.energyHistory.shift();
      }

      // Calculate spectral features
      const spectralCentroid = this.calculateSpectralCentroid(pcmData);
      const zeroCrossingRate = this.calculateZeroCrossingRate(pcmData);

      // Adaptive threshold based on noise profile
      const adaptiveThreshold =
        this.config.threshold +
        (this.noiseProfile.averageEnergy * 0.5);

      // Voice activity detection logic
      const energyAboveThreshold = energy > adaptiveThreshold;
      const spectralSignature =
        spectralCentroid > 800 && spectralCentroid < 4000; // Voice frequencies
      const zeroCrossingSignature = zeroCrossingRate > 0.1; // Voice has moderate crossing rate

      const isVoiceActive =
        energyAboveThreshold &&
        (spectralSignature || zeroCrossingSignature);

      // Confidence scoring
      const confidence = this.calculateConfidence(
        energy,
        spectralCentroid,
        zeroCrossingRate,
        adaptiveThreshold
      );

      // State tracking
      this.updateVoiceState(isVoiceActive);

      // Update statistics
      this.updateStats(isVoiceActive, energy);

      const result: VADResult = {
        isVoiceActive,
        confidence,
        energyLevel: Math.min(1, energy / 100), // Normalized
        spectralCentroid,
        zeroCrossingRate,
        timestamp: Date.now(),
      };

      telemetry.emit('audio:vad_frame_processed', {
        vadId: this.vadId,
        isVoiceActive,
        confidence: confidence.toFixed(2),
        energyLevel: (energy / 100).toFixed(3),
      });

      return result;
    } catch (error) {
      telemetry.emit('audio:vad_processing_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        vadId: this.vadId,
      });

      throw error;
    }
  }

  /**
   * Update noise profile (for adaptation)
   */
  updateNoiseProfile(silenceFrames: Float32Array[]): void {
    if (silenceFrames.length === 0) return;

    try {
      let totalEnergy = 0;

      silenceFrames.forEach((frame) => {
        totalEnergy += this.calculateEnergy(frame);
      });

      this.noiseProfile.averageEnergy =
        totalEnergy / silenceFrames.length;

      // Calculate spectral profile of noise
      let spectralContent = new Array(8).fill(0);
      silenceFrames.forEach((frame) => {
        const spectrum = this.calculateSpectrum(frame);
        spectrum.forEach((value, idx) => {
          if (idx < spectralContent.length) {
            spectralContent[idx] += value;
          }
        });
      });

      spectralContent = spectralContent.map(
        (v) => v / silenceFrames.length
      );
      this.noiseProfile.spectralContent = spectralContent;

      telemetry.emit('audio:vad_noise_profile_updated', {
        vadId: this.vadId,
        noiseFloor: this.noiseProfile.averageEnergy.toFixed(2),
      });
    } catch (error) {
      telemetry.emit('audio:vad_profile_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        vadId: this.vadId,
      });
    }
  }

  /**
   * Get VAD statistics
   */
  getStats(): VADStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      frameCount: 0,
      voiceFrames: 0,
      silenceFrames: 0,
      voicePercentage: 0,
      averageEnergy: 0,
      peakEnergy: 0,
      transitions: 0,
    };

    telemetry.emit('audio:vad_stats_reset', {
      vadId: this.vadId,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private calculateEnergy(pcmData: Float32Array): number {
    let sumSquares = 0;

    for (let i = 0; i < pcmData.length; i++) {
      const sample = pcmData[i];
      sumSquares += sample * sample;
    }

    const meanSquare = sumSquares / pcmData.length;
    return Math.sqrt(meanSquare) * 100; // Scale for visibility
  }

  private calculateSpectralCentroid(pcmData: Float32Array): number {
    // Simplified spectral centroid calculation
    // In production, would use FFT for accuracy

    const spectrum = this.calculateSpectrum(pcmData);
    let weightedSum = 0;
    let magnitudeSum = 0;

    spectrum.forEach((magnitude, binIndex) => {
      const frequency = (binIndex * this.config.sampleRate) / spectrum.length;
      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    });

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private calculateZeroCrossingRate(pcmData: Float32Array): number {
    let crossings = 0;

    for (let i = 1; i < pcmData.length; i++) {
      if (
        (pcmData[i - 1] >= 0 && pcmData[i] < 0) ||
        (pcmData[i - 1] < 0 && pcmData[i] >= 0)
      ) {
        crossings++;
      }
    }

    return crossings / (pcmData.length - 1);
  }

  private calculateSpectrum(pcmData: Float32Array): number[] {
    // Simplified spectrum calculation using energy in bands
    // In production, would use FFT

    const bands = 8;
    const spectrum = new Array(bands).fill(0);
    const samplesPerBand = Math.floor(pcmData.length / bands);

    for (let band = 0; band < bands; band++) {
      let energy = 0;
      const startIdx = band * samplesPerBand;
      const endIdx =
        band === bands - 1 ? pcmData.length : (band + 1) * samplesPerBand;

      for (let i = startIdx; i < endIdx; i++) {
        energy += Math.abs(pcmData[i]);
      }

      spectrum[band] = energy / samplesPerBand;
    }

    return spectrum;
  }

  private calculateConfidence(
    energy: number,
    spectralCentroid: number,
    zeroCrossingRate: number,
    threshold: number
  ): number {
    let score = 0;

    // Energy score (0-0.4)
    if (energy > threshold) {
      score += Math.min(0.4, (energy / threshold) * 0.4);
    }

    // Spectral score (0-0.3)
    // Voice typically has centroid between 800-4000 Hz
    const spectralScore = Math.abs(spectralCentroid - 2400) / 2400;
    score += (1 - spectralScore) * 0.3;

    // Zero crossing score (0-0.3)
    // Voice typically has ZCR between 0.1-0.5
    const zcScore = Math.min(1, (zeroCrossingRate / 0.5) * 0.3);
    score += zcScore;

    return Math.min(1, score);
  }

  private updateVoiceState(isVoiceActive: boolean): void {
    const frameDuration = (this.config.frameSize * 1000) / this.config.sampleRate;

    if (isVoiceActive) {
      this.voiceDuration += frameDuration;
      this.silenceDuration = 0;
    } else {
      this.silenceDuration += frameDuration;
      this.voiceDuration = 0;
    }

    // Detect transitions
    if (isVoiceActive !== this.lastVoiceState) {
      this.stats.transitions++;

      if (isVoiceActive) {
        this.emit('voice-start');
        telemetry.emit('audio:vad_voice_start', {
          vadId: this.vadId,
        });
      } else {
        this.emit('voice-stop');
        telemetry.emit('audio:vad_voice_stop', {
          vadId: this.vadId,
        });
      }

      this.lastVoiceState = isVoiceActive;
    }
  }

  private updateStats(isVoiceActive: boolean, energy: number): void {
    this.stats.frameCount++;

    if (isVoiceActive) {
      this.stats.voiceFrames++;
    } else {
      this.stats.silenceFrames++;
    }

    this.stats.voicePercentage =
      (this.stats.voiceFrames / this.stats.frameCount) * 100;
    this.stats.averageEnergy =
      (this.stats.averageEnergy * (this.stats.frameCount - 1) +
        energy) /
      this.stats.frameCount;
    this.stats.peakEnergy = Math.max(this.stats.peakEnergy, energy);
  }

  /**
   * Get VAD ID
   */
  getVADId(): string {
    return this.vadId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════

export function createVoiceActivityDetector(
  config: VADConfig
): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}
