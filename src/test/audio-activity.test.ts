import { describe, expect, it } from "vitest";
import {
  hasAudioLevel,
  hasSpeechActivity,
  removeTranscriptOverlap,
  SpeechAudioChunker,
} from "@/lib/audio-activity";

describe("hasSpeechActivity", () => {
  it("ignores segments without enough audible activity", () => {
    expect(hasSpeechActivity(200)).toBe(false);
  });

  it("does not count quiet input as an active speech interval", () => {
    expect(hasAudioLevel(new Float32Array(256).fill(0.001))).toBe(false);
  });

  it("counts audible input toward an active speech interval", () => {
    expect(hasAudioLevel(new Float32Array(256).fill(0.02))).toBe(true);
  });

  it("accepts segments with enough audible activity", () => {
    expect(hasSpeechActivity(300)).toBe(true);
  });

  it("skips silent windows without producing transcription uploads", () => {
    const chunker = new SpeechAudioChunker(1_000, 1_000, 200);

    expect(chunker.push(new Float32Array(1_000))).toHaveLength(0);
  });

  it("keeps a continuous overlap between voiced windows", async () => {
    const chunker = new SpeechAudioChunker(1_000, 1_000, 200);
    const voice = new Float32Array(1_000).fill(0.05);

    expect(chunker.push(voice)).toHaveLength(1);
    const overlappingWindow = chunker.push(new Float32Array(800).fill(0.05));
    expect(overlappingWindow).toHaveLength(1);
    const blob = overlappingWindow[0];
    expect(blob?.type).toBe("audio/wav");
    if (!blob) throw new Error("Expected a voiced audio window.");
    const wav = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error("Expected an audio buffer."));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the WAV output."));
      reader.readAsArrayBuffer(blob);
    });
    expect(new DataView(wav).getUint32(24, true)).toBe(16_000);
  });

  it("trims only matching words repeated across overlapping transcriptions", () => {
    expect(
      removeTranscriptOverlap("the quick brown fox", "Brown fox jumps over the dog"),
    ).toBe("jumps over the dog");
    expect(removeTranscriptOverlap("previous unrelated words", "new phrase here")).toBe(
      "new phrase here",
    );
  });

  it("removes repeated Japanese characters across overlapping transcriptions", () => {
    expect(removeTranscriptOverlap("今日はいい天気ですね", "天気ですね公園へ行きましょう")).toBe(
      "公園へ行きましょう",
    );
  });
});
