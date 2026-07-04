import { resolveFolderKey } from "./folderMatch.js";

export interface ModelEntry {
  sourceId: string;
  path: string; // e.g. assets/cobblemon/bedrock/pokemon/models/0282_gardevoir/gardevoir_goth.geo.json
}

function normalizeFolderName(name: string): string {
  return name.replace(/^\d+_/, "").toLowerCase();
}

function addToIndex(index: Map<string, ModelEntry[]>, folder: string, entry: ModelEntry) {
  if (!index.has(folder)) index.set(folder, []);
  const bucket = index.get(folder)!;
  if (!bucket.includes(entry)) bucket.push(entry);
}

export function buildModelIndex(models: ModelEntry[]): Map<string, ModelEntry[]> {
  const index = new Map<string, ModelEntry[]>();
  for (const entry of models) {
    const parts = entry.path.split("/");
    const folderIdx = parts.indexOf("models");
    if (folderIdx === -1 || folderIdx + 1 >= parts.length) continue;
    const next = parts[folderIdx + 1];
    if (next.toLowerCase().endsWith(".geo.json")) {
      // No subfolder - the file sits directly under .../models/<file>.geo.json
      // (e.g. Laser's Additions' gardevoir_goth_mega.geo.json). Index it under
      // its leading name token so species lookups by identifier still find it.
      const fileName = next.replace(/\.geo\.json$/i, "").toLowerCase();
      const guess = fileName.split("_")[0];
      if (guess) addToIndex(index, guess, entry);
    } else {
      addToIndex(index, normalizeFolderName(next), entry);
    }
  }
  return index;
}

function scoreCandidate(entry: ModelEntry, identifier: string, aspects: string[]): number {
  const fileName = entry.path.split("/").pop()!.replace(/\.geo\.json$/i, "").toLowerCase();
  const rest = fileName.startsWith(identifier) ? fileName.slice(identifier.length).replace(/^_/, "") : fileName;
  let score = 0;

  if (aspects.length === 0) {
    score -= rest.split("_").filter(Boolean).length;
    // Prefer a plain/male variant over other defaults when picking the base look.
    if (rest === "" || rest === "male") score += 2;
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
    // Penalize tokens unrelated to any requested aspect, so a model carrying
    // extra unwanted variant info (e.g. "goth") doesn't tie with the exact match.
    const wantedTokens = new Set(aspects.flatMap((a) => a.toLowerCase().split(/[_-]/)));
    for (const token of rest.split("_").filter(Boolean)) {
      if (!wantedTokens.has(token) && !aspects.some((a) => token.includes(a.toLowerCase()))) score -= 2;
    }
  }

  if (rest.includes("female")) score -= 1;
  if (rest.includes("gmax") || rest.includes("gigantamax")) score -= 1; // usually oversized/awkward for a small icon unless explicitly requested

  return score;
}

export function pickModel(index: Map<string, ModelEntry[]>, identifier: string, aspects: string[] = []): ModelEntry | null {
  const key = resolveFolderKey(index, identifier);
  const candidates = key ? index.get(key) : null;
  if (!candidates || candidates.length === 0) return null;
  let best: ModelEntry | null = null;
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
