// Opus Codec
export {
  OpusCodec,
  createOpusCodec,
  type OpusConfig,
  type AudioFrame,
  type EncodedAudioFrame,
  type DecodedAudioFrame,
} from './opus-codec.js';

// Voice Activity Detection
export {
  VoiceActivityDetector,
  createVoiceActivityDetector,
  type VADConfig,
  type VADResult,
  type VADStats,
} from './voice-activity-detection.js';

// Automatic Gain Control
export {
  AutomaticGainControl,
  createAutomaticGainControl,
  type AGCConfig,
  type AGCFrame,
  type AGCStats,
} from './agc.js';

// Audio Frame Buffer
export {
  AudioFrameBuffer,
  createAudioFrameBuffer,
  type BufferConfig,
  type BufferedFrame,
  type BufferStats,
} from './audio-frame-buffer.js';

// Audio Processor
export {
  AudioProcessor,
  createAudioProcessor,
  type AudioProcessorConfig,
  type ProcessedAudioFrame,
  type AudioProcessorStats,
} from './audio-processor.js';
