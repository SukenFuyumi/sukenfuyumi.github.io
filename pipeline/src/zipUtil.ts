import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import AdmZip from "adm-zip";
import type { SourceEntry } from "./types.js";

export interface ZipHandle {
  path: string;
  zip: AdmZip;
  /** Lazily-read file bytes, only populated if the raw fallback is needed. */
  raw?: Buffer;
}

export function openZip(path: string): ZipHandle {
  return { path, zip: new AdmZip(path) };
}

/** Keeps each source jar/zip open (central directory parsed) at most once, shared across extraction tasks. */
export class ZipHandleCache {
  private handles = new Map<string, ZipHandle>();
  constructor(private sourceRoot: string, private sources: SourceEntry[]) {}

  get(sourceId: string): ZipHandle | null {
    if (this.handles.has(sourceId)) return this.handles.get(sourceId)!;
    const source = this.sources.find((s) => s.id === sourceId);
    if (!source) return null;
    const handle = openZip(resolve(this.sourceRoot, source.file));
    this.handles.set(sourceId, handle);
    return handle;
  }
}

export function listEntries(handle: ZipHandle, matcher: (name: string) => boolean): string[] {
  return handle.zip
    .getEntries()
    .filter((e) => !e.isDirectory && matcher(e.entryName))
    .map((e) => e.entryName);
}

/**
 * Reads an entry straight from the archive, bypassing adm-zip.
 *
 * Some mod jars (Mega Showdown 1.8.4 is one) set the "data descriptor" flag on
 * every entry but write the sizes in the header anyway and no descriptor after
 * the data. adm-zip refuses those with "No descriptor present", which took out
 * all 2556 of that jar's files even though they decompress fine. The central
 * directory is trustworthy here, so this locates the payload from it and
 * inflates directly.
 */
function readEntryRaw(handle: ZipHandle, entryName: string): Buffer | null {
  const entry = handle.zip.getEntry(entryName);
  if (!entry) return null;
  const file = (handle.raw ??= readFileSync(handle.path));
  const header = (entry as any).header;
  const localOffset: number = header.offset;
  if (file.readUInt32LE(localOffset) !== 0x04034b50) return null;
  const nameLen = file.readUInt16LE(localOffset + 26);
  const extraLen = file.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const compressed = file.subarray(start, start + header.compressedSize);
  // 0 = stored, 8 = deflate; nothing else shows up in Minecraft jars.
  if (header.method === 0) return Buffer.from(compressed);
  if (header.method === 8) return inflateRawSync(compressed);
  return null;
}

function readEntry(handle: ZipHandle, entryName: string): Buffer | null {
  const entry = handle.zip.getEntry(entryName);
  if (!entry) return null;
  try {
    return entry.getData();
  } catch {
    return readEntryRaw(handle, entryName);
  }
}

export function readText(handle: ZipHandle, entryName: string): string | null {
  return readEntry(handle, entryName)?.toString("utf-8") ?? null;
}

export function readBuffer(handle: ZipHandle, entryName: string): Buffer | null {
  return readEntry(handle, entryName);
}

/**
 * Cobblemon data files live under data/<namespace>/<kind>/**.json (or .js for
 * move/ability overrides). This pulls every matching file for a given kind
 * across all namespaces in one jar/zip.
 */
export function readDataFolder(
  handle: ZipHandle,
  kind: string,
  extensions: string[] = [".json"]
): { namespace: string; path: string; text: string }[] {
  const results: { namespace: string; path: string; text: string }[] = [];
  const entries = listEntries(handle, (name) => {
    if (!name.startsWith("data/")) return false;
    const parts = name.split("/");
    if (parts.length < 3) return false;
    if (parts[2] !== kind) return false;
    return extensions.some((ext) => name.endsWith(ext));
  });
  for (const name of entries) {
    const namespace = name.split("/")[1];
    const text = readText(handle, name);
    if (text != null) results.push({ namespace, path: name, text });
  }
  return results;
}
