const SPEECH_RMS_THRESHOLD = 0.008;
const MINIMUM_SPEECH_MILLISECONDS = 250;
const DEFAULT_WINDOW_MILLISECONDS = 10_000;
const DEFAULT_OVERLAP_MILLISECONDS = 800;
const SILENCE_PADDING_MILLISECONDS = 250;
const TARGET_SAMPLE_RATE = 16_000;

type AudioBlock = { samples: Float32Array; offset: number; active: boolean };

export class SpeechAudioChunker {
  private blocks: AudioBlock[] = [];
  private bufferedSamples = 0;
  private readonly windowSamples: number;
  private readonly overlapSamples: number;

  constructor(
    private readonly sampleRate: number,
    windowMilliseconds = DEFAULT_WINDOW_MILLISECONDS,
    overlapMilliseconds = DEFAULT_OVERLAP_MILLISECONDS,
  ) {
    this.windowSamples = Math.round((sampleRate * windowMilliseconds) / 1_000);
    this.overlapSamples = Math.round((sampleRate * overlapMilliseconds) / 1_000);
  }

  push(input: Float32Array) {
    const samples = input.slice();
    if (samples.length === 0) return [];
    this.blocks.push({ samples, offset: 0, active: hasAudioLevel(samples) });
    this.bufferedSamples += samples.length;

    const chunks: Blob[] = [];
    while (this.bufferedSamples >= this.windowSamples) {
      const window = this.readWindow(this.windowSamples);
      if (hasSpeechActivity(window.activeSamples / this.sampleRate * 1_000)) {
        chunks.push(encodeSpeechWindow(window.samples, window.firstActive, window.lastActive, this.sampleRate));
      }
      this.discardSamples(this.windowSamples - this.overlapSamples);
    }
    return chunks;
  }

  private readWindow(length: number) {
    const output = new Float32Array(length);
    let written = 0;
    let activeSamples = 0;
    let firstActive = -1;
    let lastActive = -1;

    for (const block of this.blocks) {
      if (written >= length) break;
      const count = Math.min(block.samples.length - block.offset, length - written);
      output.set(block.samples.subarray(block.offset, block.offset + count), written);
      if (block.active && count > 0) {
        activeSamples += count;
        if (firstActive < 0) firstActive = written;
        lastActive = written + count;
      }
      written += count;
    }

    return { samples: output, activeSamples, firstActive, lastActive };
  }

  private discardSamples(length: number) {
    let remaining = length;
    while (remaining > 0) {
      const first = this.blocks[0];
      if (!first) break;
      const available = first.samples.length - first.offset;
      const discarded = Math.min(available, remaining);
      first.offset += discarded;
      remaining -= discarded;
      this.bufferedSamples -= discarded;
      if (first.offset === first.samples.length) this.blocks.shift();
    }
  }
}

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

export function removeTranscriptOverlap(previousText: string, nextText: string) {
  if (!/\s/.test(previousText) && !/\s/.test(nextText)) {
    const previousCharacters = Array.from(
      previousText.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
    );
    const nextCharacters = Array.from(
      nextText.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
    );
    const maxOverlap = Math.min(previousCharacters.length, nextCharacters.length);
    for (let overlap = maxOverlap; overlap >= 4; overlap -= 1) {
      if (
        previousCharacters.slice(-overlap).every((character, index) => {
          return character === nextCharacters[index];
        })
      ) {
        return Array.from(nextText).slice(overlap).join("").trimStart();
      }
    }
    return nextText.trim();
  }

  const previousWords = previousText.trim().split(/\s+/).filter(Boolean);
  const nextWords = nextText.trim().split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(previousWords.length, nextWords.length, 12);

  for (let overlap = maxOverlap; overlap >= 2; overlap -= 1) {
    const previousSuffix = previousWords.slice(-overlap).map(normalizeWord);
    const nextPrefix = nextWords.slice(0, overlap).map(normalizeWord);
    if (previousSuffix.every((word, index) => word === nextPrefix[index])) {
      return nextWords.slice(overlap).join(" ");
    }
  }
  return nextWords.join(" ");
}

function normalizeWord(word: string) {
  return word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function encodeSpeechWindow(
  samples: Float32Array,
  firstActive: number,
  lastActive: number,
  sampleRate: number,
) {
  const paddingSamples = Math.round((sampleRate * SILENCE_PADDING_MILLISECONDS) / 1_000);
  const start = Math.max(0, firstActive - paddingSamples);
  const end = Math.min(samples.length, lastActive + paddingSamples);
  const speechSamples = samples.subarray(start, end);
  const outputSampleCount = Math.max(1, Math.ceil((speechSamples.length * TARGET_SAMPLE_RATE) / sampleRate));
  const buffer = new ArrayBuffer(44 + outputSampleCount * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + outputSampleCount * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, outputSampleCount * 2, true);

  for (let index = 0; index < outputSampleCount; index += 1) {
    const sourcePosition = (index * sampleRate) / TARGET_SAMPLE_RATE;
    const leftIndex = Math.min(Math.floor(sourcePosition), speechSamples.length - 1);
    const rightIndex = Math.min(leftIndex + 1, speechSamples.length - 1);
    const fraction = sourcePosition - leftIndex;
    const sample =
      (speechSamples[leftIndex] ?? 0) * (1 - fraction) +
      (speechSamples[rightIndex] ?? 0) * fraction;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
