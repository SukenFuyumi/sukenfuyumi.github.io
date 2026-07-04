export type SourceRole = "base" | "content" | "balance-patch" | "cosmetic" | "disabled";

export interface SourceEntry {
  id: string;
  label: string;
  file: string;
  kind: "jar" | "datapack";
  role: SourceRole;
  priority: number;
  notes?: string;
}

export interface DisabledEntry {
  id: string;
  label: string;
  file: string;
  reason: string;
}

export interface SourcesManifest {
  sourceRoot: string;
  sources: SourceEntry[];
  disabled: DisabledEntry[];
  cosmeticOnly: string[];
}

// A raw record pulled from a jar/zip, tagged with where it came from.
export interface RawRecord<T = any> {
  sourceId: string;
  sourceLabel: string;
  role: SourceRole;
  priority: number;
  namespace: string;
  identifier: string;
  path: string;
  data: T;
}

export interface FieldProvenance {
  [field: string]: string; // field name -> sourceId that supplied the winning value
}

export interface MergedSpecies {
  id: string; // namespace:name
  namespace: string;
  slug: string;
  name: string;
  nationalPokedexNumber: number | null;
  primaryType: string;
  secondaryType: string | null;
  baseStats: Record<string, number>;
  abilities: string[];
  hiddenAbilities: string[];
  eggGroups: string[];
  catchRate: number | null;
  eggCycles: number | null;
  baseFriendship: number | null;
  height: number | null;
  weight: number | null;
  maleRatio: number | null;
  experienceGroup: string | null;
  baseExperienceYield: number | null;
  labels: string[];
  aspects: string[];
  forms: any[];
  pokedexDescriptionKeys: string[];
  pokedexDescription: string | null;
  movesRaw: string[];
  preEvolution: string | null;
  evolutions: any[];
  sourceMods: string[]; // every source that contributed a field
  primarySource: string; // the source that defined the species (its 'species' file, not just additions)
  provenance: FieldProvenance;
}

export interface MoveRecord {
  id: string;
  name: string;
  num: number | null;
  type: string | null;
  category: string | null;
  basePower: number | null;
  accuracy: number | boolean | null;
  pp: number | null;
  priority: number | null;
  flags: Record<string, any>;
  shortDesc: string | null;
  desc: string | null;
  sourceId: string;
  isOverride: boolean;
}

export interface AbilityRecord {
  id: string;
  name: string;
  num: number | null;
  shortDesc: string | null;
  desc: string | null;
  rating: number | null;
  sourceId: string;
  isOverride: boolean;
}
