import { describe, expect, it } from "vitest";
import { hasAudioLevel, hasSpeechActivity } from "@/lib/audio-activity";

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
});
