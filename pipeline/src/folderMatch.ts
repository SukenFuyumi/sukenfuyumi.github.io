// Some packs rename a species over time (e.g. "spectreon" -> "spectreonee")
// without renaming its asset folder, leaving the species identifier and the
// texture/model folder name slightly different. Exact match first; if that
// misses, fall back to a prefix match in either direction (with a minimum
// shared length so we don't match unrelated short names).
export function resolveFolderKey<T>(index: Map<string, T[]>, identifier: string): string | null {
  const id = identifier.toLowerCase();
  if (index.has(id)) return id;

  let best: string | null = null;
  let bestLen = 0;
  for (const key of index.keys()) {
    const shared = key.startsWith(id) || id.startsWith(key) ? Math.min(key.length, id.length) : 0;
    if (shared >= 5 && shared > bestLen) {
      bestLen = shared;
      best = key;
    }
  }
  return best;
}
