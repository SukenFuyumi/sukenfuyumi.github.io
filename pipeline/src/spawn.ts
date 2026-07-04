import type { RawRecord } from "./types.js";

export interface SpawnInfo {
  biomes: string[];
  bucket: string | null;
  level: string | null;
  timeRange: string | null;
  sourceId: string;
}

/** Keyed by bare (lowercase) pokemon identifier as referenced in spawns[].pokemon */
export function buildSpawnIndex(spawnPools: RawRecord[]): Map<string, SpawnInfo[]> {
  const index = new Map<string, SpawnInfo[]>();
  for (const record of spawnPools) {
    const spawns = record.data?.spawns;
    if (!Array.isArray(spawns)) continue;
    for (const spawn of spawns) {
      if (!spawn?.pokemon) continue;
      const key = String(spawn.pokemon).toLowerCase().split(" ")[0];
      const info: SpawnInfo = {
        biomes: spawn.condition?.biomes ?? [],
        bucket: spawn.bucket ?? null,
        level: spawn.level ?? null,
        timeRange: spawn.condition?.timeRange ?? null,
        sourceId: record.sourceId,
      };
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(info);
    }
  }
  return index;
}
