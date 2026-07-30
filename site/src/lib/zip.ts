/**
 * Minimal browser-side zip reader/rebuilder, enough to re-emit a datapack with
 * a few files replaced.
 *
 * The trick that keeps this small: entries that aren't being replaced are copied
 * across as their ORIGINAL compressed bytes, reusing the method/CRC/sizes from
 * the source central directory. Nothing has to be inflated, so no DEFLATE
 * implementation (or library) is needed - replaced files are simply written
 * uncompressed (STORED), which every zip reader accepts.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Raw bytes exactly as stored in the source zip (still compressed). */
  raw: Uint8Array;
  dosTime: number;
  dosDate: number;
}

/** Reads a zip's central directory and each entry's raw (still compressed) bytes. */
export function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // EOCD sits at the end, after an optional comment - scan backwards for it.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No es un zip válido (no se encontró el EOCD).");

  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== SIG_CENTRAL) throw new Error("Directorio central corrupto.");
    const method = view.getUint16(ptr + 10, true);
    const dosTime = view.getUint16(ptr + 12, true);
    const dosDate = view.getUint16(ptr + 14, true);
    const crc = view.getUint32(ptr + 16, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    // Jump to the local header to find where the payload actually starts; its
    // name/extra lengths can differ from the central directory's.
    if (view.getUint32(localOffset, true) !== SIG_LOCAL) throw new Error(`Cabecera local corrupta en ${name}`);
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;

    entries.push({
      name,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      raw: bytes.subarray(dataStart, dataStart + compressedSize),
      dosTime,
      dosDate,
    });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

interface OutEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  payload: Uint8Array;
  dosTime: number;
  dosDate: number;
}

/**
 * Rebuilds a zip from `entries`, replacing the contents of any path present in
 * `replacements` (and appending paths that didn't exist). Replaced/added files
 * are written uncompressed; everything else keeps its original bytes.
 */
export function rebuildZip(entries: ZipEntry[], replacements: Record<string, string>): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() / 2) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);

  const out: OutEntry[] = [];
  const replaced = new Set<string>();

  for (const e of entries) {
    const repl = replacements[e.name];
    if (repl === undefined) {
      out.push({ ...e, payload: e.raw });
      continue;
    }
    replaced.add(e.name);
    const data = enc.encode(repl);
    out.push({
      name: e.name,
      method: 0,
      crc: crc32(data),
      compressedSize: data.length,
      uncompressedSize: data.length,
      payload: data,
      dosTime,
      dosDate,
    });
  }
  // Paths that weren't in the source zip at all.
  for (const [name, content] of Object.entries(replacements)) {
    if (replaced.has(name)) continue;
    const data = enc.encode(content);
    out.push({
      name,
      method: 0,
      crc: crc32(data),
      compressedSize: data.length,
      uncompressedSize: data.length,
      payload: data,
      dosTime,
      dosDate,
    });
  }

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of out) {
    const nameBytes = enc.encode(e.name);
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, SIG_LOCAL, true);
    lv.setUint16(4, 20, true);
    // Flags left at 0: sizes are known up front, so no data descriptor.
    lv.setUint16(6, 0, true);
    lv.setUint16(8, e.method, true);
    lv.setUint16(10, e.dosTime, true);
    lv.setUint16(12, e.dosDate, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.compressedSize, true);
    lv.setUint32(22, e.uncompressedSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    locals.push(lh, nameBytes, e.payload);

    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, SIG_CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, e.dosTime, true);
    cv.setUint16(14, e.dosDate, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.compressedSize, true);
    cv.setUint32(24, e.uncompressedSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centrals.push(ch, nameBytes);

    offset += 30 + nameBytes.length + e.payload.length;
  }

  const centralStart = offset;
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, out.length, true);
  ev.setUint16(10, out.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);

  return new Blob([...locals, ...centrals, eocd], { type: "application/zip" });
}
