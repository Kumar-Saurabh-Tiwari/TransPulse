const SPEECH_RMS_THRESHOLD = 0.008;
const MINIMUM_SPEECH_MILLISECONDS = 250;

export function hasAudioLevel(samples: Float32Array) {
  if (samples.length === 0) return false;
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  const rms = Math.sqrt(sumSquares / samples.length);
  return rms > SPEECH_RMS_THRESHOLD;
}

export function hasSpeechActivity(activeMilliseconds: number) {
  return activeMilliseconds >= MINIMUM_SPEECH_MILLISECONDS;
}
