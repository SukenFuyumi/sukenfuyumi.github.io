import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { readBuffer, ZipHandleCache } from "./zipUtil.js";
import { resolveFolderKey } from "./folderMatch.js";
import type { TextureEntry } from "./ingest.js";

function normalizeFolderName(name: string): string {
  // Strip a leading dex-number prefix like "0282_" and lowercase.
  return name.replace(/^\d+_/, "").toLowerCase();
}

/** identifier (species/base folder name) -> candidate texture files across every source. */
export function buildTextureIndex(textures: TextureEntry[]): Map<string, TextureEntry[]> {
  const index = new Map<string, TextureEntry[]>();
  for (const entry of textures) {
    const parts = entry.path.split("/");
    // assets/<ns>/textures/pokemon/<folder>/.../<file>.png
    const folderIdx = parts.indexOf("pokemon");
    if (folderIdx === -1 || folderIdx + 1 >= parts.length) continue;
    const folder = normalizeFolderName(parts[folderIdx + 1]);
    if (!index.has(folder)) index.set(folder, []);
    index.get(folder)!.push(entry);
  }
  return index;
}

function scoreCandidate(entry: TextureEntry, identifier: string, aspects: string[]): number {
  const fileName = entry.path.split("/").pop()!.replace(/\.png$/i, "").toLowerCase();
  const rest = fileName.startsWith(identifier) ? fileName.slice(identifier.length).replace(/^_/, "") : fileName;
  let score = 0;

  if (aspects.length === 0) {
    // Picking the *base* look: prefer the plainest file (fewest extra tokens).
    score -= rest.split("_").filter(Boolean).length;
  } else {
    for (const aspect of aspects) {
      const a = aspect.toLowerCase();
      if (rest.includes(a)) {
        score += 3;
        continue;
      }
      for (const token of a.split(/[_-]/).filter((t) => t.length > 1)) {
        if (rest.includes(token)) score += 1;
      }
    }
    // Penalize tokens that don't belong to any requested aspect - otherwise
    // e.g. "gardevoir_goth_mega.png" ties with the correct plain
    // "gardevoir_mega.png" for aspects=["mega"], since both contain "mega";
    // the unrelated "goth" token needs to cost something or the wrong
    // (Midnight-line) art can win arbitrarily over the official Mega art.
    const wantedTokens = new Set(aspects.flatMap((a) => a.toLowerCase().split(/[_-]/)));
    for (const token of rest.split("_").filter(Boolean)) {
      if (!wantedTokens.has(token) && !aspects.some((a) => token.includes(a.toLowerCase()))) score -= 2;
    }
  }

  if (rest.includes("shiny")) score -= 5;
  if (rest.includes("female")) score -= 1;
  if (/(emissive|glow|flame|particle|overlay)/.test(rest)) score -= 10;
  // Nested subfolders (e.g. gmaxflames/flames_1.png) are almost never the right pick.
  if (entry.path.split("/").length > 7) score -= 20;

  return score;
}

export function pickTexture(
  index: Map<string, TextureEntry[]>,
  identifier: string,
  aspects: string[] = []
): TextureEntry | null {
  const key = resolveFolderKey(index, identifier);
  const candidates = key ? index.get(key) : null;
  if (!candidates || candidates.length === 0) return null;
  let best: TextureEntry | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const s = scoreCandidate(candidate, identifier.toLowerCase(), aspects);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }
  return best;
}

export class TextureExtractor {
  private written = new Set<string>();

  constructor(private handles: ZipHandleCache, private outputDir: string) {
    if (existsSync(this.outputDir)) rmSync(this.outputDir, { recursive: true, force: true });
    mkdirSync(this.outputDir, { recursive: true });
  }

  /** Extracts (if not already done) and returns the public URL for a texture entry. */
  extract(entry: TextureEntry, slug: string): string | null {
    const fileName = `${slug}.png`;
    if (!this.written.has(fileName)) {
      const handle = this.handles.get(entry.sourceId);
      if (!handle) return null;
      const buffer = readBuffer(handle, entry.path);
      if (!buffer) return null;
      writeFileSync(resolve(this.outputDir, fileName), buffer);
      this.written.add(fileName);
    }
    return `/textures/${fileName}`;
  }

  /** Raw bytes without writing to disk - used to feed the renderer a texture image. */
  readBytes(entry: TextureEntry): Buffer | null {
    const handle = this.handles.get(entry.sourceId);
    if (!handle) return null;
    return readBuffer(handle, entry.path);
  }
}
