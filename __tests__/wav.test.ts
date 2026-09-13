import { describe, expect, it } from "vitest";
import { wavDurationMs } from "../lib/eval/wav";

function makeWav(sampleRate = 16_000, channels = 1, bitsPerSample = 16, sampleCount = 1_600): Blob {
  const bytesPerSample = channels * (bitsPerSample / 8);
  const dataBytes = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Blob([buffer], { type: "audio/wav" });
}

describe("WAV metadata", () => {
  it("derives duration from the exact exported sample count", async () => {
    await expect(wavDurationMs(makeWav(16_000, 1, 16, 1_600))).resolves.toBe(100);
  });
});
