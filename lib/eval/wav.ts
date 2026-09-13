const RIFF = "RIFF";
const WAVE = "WAVE";
const FMT = "fmt ";
const DATA = "data";

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}

/**
 * Return the playable duration encoded in a WAV blob, in milliseconds.
 *
 * This intentionally reads the exported bytes rather than measuring pointer
 * time. Pointer timing can include permission/UI scheduling and can diverge
 * from the samples actually written to the WAV.
 */
export async function wavDurationMs(blob: Blob): Promise<number> {
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength < 12) throw new Error("WAV is too short.");
  const view = new DataView(bytes);
  if (readAscii(view, 0, 4) !== RIFF || readAscii(view, 8, 4) !== WAVE) throw new Error("Unsupported WAV container.");

  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;
  let dataBytes: number | undefined;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = Math.min(view.byteLength, chunkDataStart + chunkSize);
    if (chunkId === FMT && chunkDataStart + 16 <= chunkDataEnd) {
      channels = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === DATA) {
      dataBytes = Math.min(chunkSize, view.byteLength - chunkDataStart);
    }
    if (sampleRate && channels && bitsPerSample && dataBytes !== undefined) break;
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || dataBytes === undefined) {
    throw new Error("WAV is missing format or data metadata.");
  }
  const bytesPerFrame = channels * (bitsPerSample / 8);
  if (!Number.isFinite(bytesPerFrame) || bytesPerFrame <= 0) throw new Error("WAV has invalid frame metadata.");
  return (dataBytes / bytesPerFrame / sampleRate) * 1000;
}
