/**
 * Minimal dependency-free ZIP writer (stored entries, no compression).
 *
 * The corpus is small WAV audio; stored entries keep the exporter honest and
 * auditable without adding a dependency. Filenames are ASCII. Timestamps use
 * a fixed DOS date so repeated exports of the same bytes are byte-identical.
 */

const FIXED_DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 12; // 2026-09-12
const FIXED_DOS_TIME = 0;

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const TABLE = crc32Table();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

export type ZipEntry = { name: string; data: Uint8Array };

export function createZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const push = (target: Uint8Array[], bytes: Uint8Array) => {
    target.push(bytes);
  };
  const u16 = (value: number): Uint8Array => {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setUint16(0, value, true);
    return out;
  };
  const u32 = (value: number): Uint8Array => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
  };

  for (const entry of entries) {
    const name = encodeName(entry.name);
    if (name.length > 0xffff) throw new Error(`ZIP entry name too long: ${entry.name}`);
    if (entry.data.length > 0xffffffff) throw new Error(`ZIP entry too large: ${entry.name}`);
    const crc = crc32(entry.data);

    const local = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(FIXED_DOS_TIME), u16(FIXED_DOS_DATE),
      u32(crc), u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0),
      name, entry.data,
    ];
    const localSize = local.reduce((sum, part) => sum + part.length, 0);

    const centralRecord = [
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(FIXED_DOS_TIME), u16(FIXED_DOS_DATE),
      u32(crc), u32(entry.data.length), u32(entry.data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ];
    for (const part of local) push(chunks, part);
    for (const part of centralRecord) push(central, part);
    offset += localSize;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = [
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSize), u32(offset), u16(0),
  ];

  const total = offset + centralSize + end.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...chunks, ...central, ...end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
