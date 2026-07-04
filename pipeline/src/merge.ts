import type { RawRecord, SourceRole } from "./types.js";

export interface ConflictLogEntry {
  entity: string; // e.g. "species:cobblemon:abra" or "move:tackle"
  field: string;
  winner: string; // sourceId
  losers: string[]; // sourceIds that also set this field but lost
}

function sortByPriority<T extends { priority: number; role: SourceRole }>(records: T[]): T[] {
  // Stable sort by priority, but force role === 'balance-patch' to always land last,
  // regardless of what priority number it was given in the manifest.
  return [...records].sort((a, b) => {
    const aPatch = a.role === "balance-patch" ? 1 : 0;
    const bPatch = b.role === "balance-patch" ? 1 : 0;
    if (aPatch !== bPatch) return aPatch - bPatch;
    return a.priority - b.priority;
  });
}

/**
 * Generic layered-field merge: applies `records` in order onto a base object
 * keyed by `keyFn`, tracking which source last wrote each top-level field.
 *
 * `arrayMergeFields` lists fields where multiple sources are expected to each
 * contribute their own entries to the same species rather than clobber one
 * another - e.g. "forms": Mega Showdown adds a "Mega" form to Gardevoir while
 * a separate fakemon pack independently adds a "Midnight" form to the same
 * Gardevoir. Same story for "evolutions": Extra Eeveelutions adds Eevee ->
 * Acideon while Kazeran Eeveelutions independently adds Eevee -> Glaceon
 * (kazeran variant) - both patch the same base species. Treating either
 * field as a plain overwrite loses whichever pack applied first. Entries are
 * concatenated and de-duplicated by `id` (falling back to `name`) - later
 * source wins on a same-id/name clash.
 */
export function layerRecords<T extends { sourceId: string; priority: number; role: SourceRole; data: any }>(
  records: T[],
  keyFn: (r: T) => string,
  arrayMergeFields: string[] = []
): {
  merged: Map<string, { data: Record<string, any>; provenance: Record<string, string>; sources: Set<string> }>;
  conflicts: ConflictLogEntry[];
} {
  const merged = new Map<string, { data: Record<string, any>; provenance: Record<string, string>; sources: Set<string> }>();
  const conflicts: ConflictLogEntry[] = [];
  const fieldHistory = new Map<string, Map<string, string[]>>(); // key -> field -> sourceIds that touched it

  for (const record of sortByPriority(records)) {
    const key = keyFn(record);
    if (!merged.has(key)) {
      merged.set(key, { data: {}, provenance: {}, sources: new Set() });
    }
    const entry = merged.get(key)!;
    entry.sources.add(record.sourceId);
    if (!fieldHistory.has(key)) fieldHistory.set(key, new Map());
    const history = fieldHistory.get(key)!;

    for (const [field, value] of Object.entries(record.data ?? {})) {
      if (field === "target") continue; // routing field, not content
      if (!history.has(field)) history.set(field, []);
      history.get(field)!.push(record.sourceId);

      if (arrayMergeFields.includes(field) && Array.isArray(value)) {
        const existing: any[] = Array.isArray(entry.data[field]) ? entry.data[field] : [];
        const combined = [...existing];
        for (const item of value) {
          const dedupeKey = item?.id ?? item?.name;
          const idx = dedupeKey ? combined.findIndex((e) => (e?.id ?? e?.name) === dedupeKey) : -1;
          if (idx >= 0) combined[idx] = item;
          else combined.push(item);
        }
        entry.data[field] = combined;
      } else {
        entry.data[field] = value;
      }
      entry.provenance[field] = record.sourceId;
    }
  }

  for (const [key, history] of fieldHistory) {
    for (const [field, sourceIds] of history) {
      if (sourceIds.length > 1) {
        conflicts.push({
          entity: key,
          field,
          winner: sourceIds[sourceIds.length - 1],
          losers: sourceIds.slice(0, -1),
        });
      }
    }
  }

  return { merged, conflicts };
}

export function mergeSpecies(species: RawRecord[], speciesAdditions: RawRecord[]) {
  // Base species definitions: full records, keyed by namespace:identifier.
  const baseByKey = new Map<string, RawRecord>();
  // A later species file at the same key fully overwrites the earlier one for
  // content (matching Cobblemon's own same-path override behaviour), but we
  // still want to remember every source that ever defined this species - e.g.
  // Mega Showdown ships its own full charizard.json (to add mega forms) which
  // otherwise wins outright and would erase "this is originally a Cobblemon
  // core Pokemon" for provenance/official-artwork purposes.
  const everDefinedBy = new Map<string, Set<string>>();
  for (const record of sortByPriority(species)) {
    const key = `${record.namespace}:${record.identifier}`;
    baseByKey.set(key, record);
    if (!everDefinedBy.has(key)) everDefinedBy.set(key, new Set());
    everDefinedBy.get(key)!.add(record.sourceId);
  }

  // species_additions target an existing species by fully-qualified id (or bare id, defaulting to same namespace as the file).
  const additionsAsPseudoSpecies: RawRecord[] = speciesAdditions.map((r) => {
    const target: string = r.data?.target ?? `${r.namespace}:${r.identifier}`;
    const key = target.includes(":") ? target : `${r.namespace}:${target}`;
    return { ...r, identifier: key.split(":")[1], namespace: key.split(":")[0] };
  });

  const allSpeciesLikeRecords: RawRecord[] = [
    ...[...baseByKey.values()].map((r) => ({ ...r, data: { ...r.data } })),
    ...additionsAsPseudoSpecies,
  ];

  const { merged, conflicts } = layerRecords(allSpeciesLikeRecords, (r) => `${r.namespace}:${r.identifier}`, ["forms", "evolutions"]);

  // Track which source currently owns each species's full-file definition (for display),
  // and fold in every source that ever contributed a species file for that key (for
  // "is this fundamentally an official Pokemon" checks - see isOfficial in index.ts).
  const primarySource = new Map<string, string>();
  for (const [key, record] of baseByKey) {
    primarySource.set(key, record.sourceId);
    const entry = merged.get(key);
    if (entry) for (const sourceId of everDefinedBy.get(key) ?? []) entry.sources.add(sourceId);
  }

  return { merged, conflicts, primarySource };
}

export function mergeFlatRecords(records: RawRecord[]) {
  return layerRecords(records, (r) => r.identifier);
}
