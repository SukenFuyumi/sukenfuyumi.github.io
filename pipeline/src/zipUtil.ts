import { resolve } from "node:path";
import AdmZip from "adm-zip";
import type { SourceEntry } from "./types.js";

export interface ZipHandle {
  path: string;
  zip: AdmZip;
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

export function readText(handle: ZipHandle, entryName: string): string | null {
  const entry = handle.zip.getEntry(entryName);
  if (!entry) return null;
  return entry.getData().toString("utf-8");
}

export function readBuffer(handle: ZipHandle, entryName: string): Buffer | null {
  const entry = handle.zip.getEntry(entryName);
  if (!entry) return null;
  return entry.getData();
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
