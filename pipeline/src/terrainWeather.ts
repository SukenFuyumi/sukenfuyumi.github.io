import type { RawRecord } from "./types.js";

export interface TerrainWeatherEntry {
  id: string;
  name: string;
  kind: "weather" | "terrain";
  desc: string;
  sourceLabel: string | null; // null = standard Pokemon mechanic, not from a specific mod
}

// Cobblemon's bundled Showdown data (see showdown.ts) has all flavor text
// stripped, including for the standard weathers/terrains - unlike moves and
// abilities, there's no lang-file fallback for these either, so this is a
// small hand-written reference for the handful of official ones. These are
// stable, long-standing Pokemon mechanics (last changed generations ago),
// so hardcoding is reasonable here in a way it wouldn't be for move/ability
// text that mods actively rebalance.
const STANDARD_ENTRIES: TerrainWeatherEntry[] = [
  {
    id: "raindance",
    name: "Rain",
    kind: "weather",
    desc: "Boosts the power of Water-type moves by 50% and weakens Fire-type moves by 50% for 5 turns (8 with Damp Rock). Thunder and Hurricane never miss, and Solar Beam's power is halved.",
    sourceLabel: null,
  },
  {
    id: "sunnyday",
    name: "Sun",
    kind: "weather",
    desc: "Boosts the power of Fire-type moves by 50% and weakens Water-type moves by 50% for 5 turns (8 with Heat Rock). Solar Beam hits without charging, but Thunder and Hurricane's accuracy drops to 50%.",
    sourceLabel: null,
  },
  {
    id: "sandstorm",
    name: "Sandstorm",
    kind: "weather",
    desc: "Damages every Pokemon not of Rock, Ground, or Steel type (and without an immunity like Sand Force/Rush/Veil or Overcoat) for 1/16 max HP each turn, for 5 turns (8 with Smooth Rock). Boosts the Special Defense of Rock-type Pokemon by 50%.",
    sourceLabel: null,
  },
  {
    id: "snow",
    name: "Snow",
    kind: "weather",
    desc: "Boosts the Defense of Ice-type Pokemon by 50% for 5 turns (8 with Icy Rock).",
    sourceLabel: null,
  },
  {
    id: "electricterrain",
    name: "Electric Terrain",
    kind: "terrain",
    desc: "Boosts the power of grounded Pokemon's Electric-type moves by 30% and prevents grounded Pokemon from falling asleep, for 5 turns (8 with Terrain Extender).",
    sourceLabel: null,
  },
  {
    id: "grassyterrain",
    name: "Grassy Terrain",
    kind: "terrain",
    desc: "Boosts the power of grounded Pokemon's Grass-type moves by 30%, heals grounded Pokemon for 1/16 max HP each turn, and halves the power of Earthquake/Bulldoze/Magnitude against grounded Pokemon, for 5 turns (8 with Terrain Extender).",
    sourceLabel: null,
  },
  {
    id: "mistyterrain",
    name: "Misty Terrain",
    kind: "terrain",
    desc: "Halves the power of Dragon-type moves against grounded Pokemon and protects grounded Pokemon from non-volatile status conditions and confusion, for 5 turns (8 with Terrain Extender).",
    sourceLabel: null,
  },
  {
    id: "psychicterrain",
    name: "Psychic Terrain",
    kind: "terrain",
    desc: "Boosts the power of grounded Pokemon's Psychic-type moves by 30% and protects grounded Pokemon from moves with increased priority, for 5 turns (8 with Terrain Extender).",
    sourceLabel: null,
  },
];

export function buildTerrainWeatherIndex(
  conditionOverrides: RawRecord[],
  sourceLabelOf: (sourceId: string) => string
): TerrainWeatherEntry[] {
  const byId = new Map<string, TerrainWeatherEntry>();
  for (const entry of STANDARD_ENTRIES) byId.set(entry.id, entry);

  for (const record of conditionOverrides) {
    const data = record.data ?? {};
    const effectType = String(data.effectType ?? "").toLowerCase();
    if (effectType !== "weather" && effectType !== "terrain") continue;
    const desc: string | undefined = data.desc ?? data.shortDesc;
    if (!desc) continue;
    byId.set(record.identifier.toLowerCase(), {
      id: record.identifier.toLowerCase(),
      name: data.name ?? record.identifier,
      kind: effectType as "weather" | "terrain",
      desc,
      sourceLabel: sourceLabelOf(record.sourceId),
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
