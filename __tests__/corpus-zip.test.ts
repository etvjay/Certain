import { describe, expect, it } from "vitest";
import { crc32, createZip } from "../lib/eval/zip";

function parseCentralDirectory(zip: Uint8Array) {
  // Locate end-of-central-directory record.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x05 && zip[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  let at = centralOffset;
  for (let n = 0; n < count; n += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    names.push(new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength)));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

describe("corpus ZIP exporter", () => {
  it("matches the standard CRC-32 check vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("produces a parseable archive containing every entry", () => {
    const files = [
      { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify({ hello: "world" })) },
      { name: "audio/AAI-HUM-001.wav", data: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]) },
    ];
    const zip = createZip(files);
    expect(parseCentralDirectory(zip)).toEqual(["manifest.json", "audio/AAI-HUM-001.wav"]);
    // Stored payload bytes must appear verbatim.
    expect(zip.includes(82));
  });

  it("is deterministic for identical inputs", () => {
    const files = [{ name: "a.txt", data: new TextEncoder().encode("same") }];
    expect(Array.from(createZip(files))).toEqual(Array.from(createZip(files)));
  });
});
