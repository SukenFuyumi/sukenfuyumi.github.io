import { resolve } from "node:path";
import { openZip, readDataFolder, readText, listEntries } from "./zipUtil.js";
import { evalObjectLiteral } from "./jsData.js";
import { extractShowdownBase, type ShowdownBaseData } from "./showdown.js";
import type { RawRecord, SourceEntry, SourcesManifest } from "./types.js";

export interface TextureEntry {
  sourceId: string;
  path: string; // zip-internal path, e.g. assets/cobblemon/textures/pokemon/0282_gardevoir/gardevoir_goth.png
}

export interface ModelFileEntry {
  sourceId: string;
  path: string; // e.g. assets/cobblemon/bedrock/pokemon/models/0282_gardevoir/gardevoir_goth.geo.json
}

export interface IngestResult {
  species: RawRecord[];
  speciesAdditions: RawRecord[];
  moveOverrides: RawRecord[];
  abilityOverrides: RawRecord[];
  spawnPools: RawRecord[];
  lang: Map<string, { value: string; sourceId: string; priority: number }>;
  // The vanilla cobblemon-core lang value for a key, kept aside even after a
  // mod overrides it in `lang` above - lets callers show a before/after diff
  // for move/ability flavor text (see computeBalanceChanges in index.ts).
  langCore: Map<string, string>;
  showdownBase: ShowdownBaseData;
  textures: TextureEntry[];
  models: ModelFileEntry[];
  posers: ModelFileEntry[];
  animations: ModelFileEntry[];
  warnings: string[];
}

function parseFile(path: string, text: string): any | null {
  try {
    if (path.endsWith(".json")) return JSON.parse(text);
    if (path.endsWith(".js")) return evalObjectLiteral(text);
    return null;
  } catch {
    return undefined; // signals a parse failure distinct from "not applicable"
  }
}

export function ingestAll(manifest: SourcesManifest, sourceRoot: string): IngestResult {
  const species: RawRecord[] = [];
  const speciesAdditions: RawRecord[] = [];
  const moveOverrides: RawRecord[] = [];
  const abilityOverrides: RawRecord[] = [];
  const spawnPools: RawRecord[] = [];
  const lang = new Map<string, { value: string; sourceId: string; priority: number }>();
  const langCore = new Map<string, string>();
  const textures: TextureEntry[] = [];
  const models: ModelFileEntry[] = [];
  const posers: ModelFileEntry[] = [];
  const animations: ModelFileEntry[] = [];
  const warnings: string[] = [];

  const sorted = [...manifest.sources].sort((a, b) => a.priority - b.priority);
  let showdownBase: ShowdownBaseData = { moves: {}, abilities: {}, typechart: {} };

  for (const source of sorted) {
    const fullPath = resolve(sourceRoot, source.file);
    let handle;
    try {
      handle = openZip(fullPath);
    } catch (err) {
      warnings.push(`[${source.id}] could not open ${source.file}: ${(err as Error).message}`);
      continue;
    }

    const collect = (kind: string, extensions: string[], sink: RawRecord[]) => {
      for (const file of readDataFolder(handle, kind, extensions)) {
        const parsed = parseFile(file.path, file.text);
        if (parsed === undefined) {
          warnings.push(`[${source.id}] failed to parse ${file.path}`);
          continue;
        }
        if (parsed === null) continue;
        const identifier = file.path
          .split("/")
          .pop()!
          .replace(/\.(json|js)$/, "");
        sink.push({
          sourceId: source.id,
          sourceLabel: source.label,
          role: source.role,
          priority: source.priority,
          namespace: file.namespace,
          identifier,
          path: file.path,
          data: parsed,
        });
      }
    };

    collect("species", [".json"], species);
    collect("species_additions", [".json"], speciesAdditions);
    collect("moves", [".json", ".js"], moveOverrides);
    collect("abilities", [".json", ".js"], abilityOverrides);
    collect("spawn_pool_world", [".json"], spawnPools);

    // Texture entries: just record the path for now (bytes get pulled later,
    // on demand, only for whichever file ends up actually picked as an image).
    for (const texPath of listEntries(handle, (n) => /^assets\/[^/]+\/textures\/pokemon\/.*\.png$/.test(n))) {
      textures.push({ sourceId: source.id, path: texPath });
    }
    // Most packs use bedrock/pokemon/models/... but some (e.g. Extra
    // Eeveelutions) skip the "pokemon" segment and use bedrock/models/... directly.
    for (const modelPath of listEntries(handle, (n) => /^assets\/[^/]+\/bedrock\/(pokemon\/)?models\/.*\.geo\.json$/.test(n))) {
      models.push({ sourceId: source.id, path: modelPath });
    }
    // Posers (which idle/standing pose to use, e.g. PROFILE/PORTRAIT for the
    // Pokedex/summary-screen look) and their animation files (the actual bone
    // rotations for that pose) - used to render a natural stance instead of
    // the model's raw bind pose.
    for (const poserPath of listEntries(handle, (n) => /^assets\/[^/]+\/bedrock\/(pokemon\/)?posers\/.*\.json$/.test(n))) {
      posers.push({ sourceId: source.id, path: poserPath });
    }
    for (const animPath of listEntries(handle, (n) => /^assets\/[^/]+\/bedrock\/(pokemon\/)?animations\/.*\.animation\.json$/.test(n))) {
      animations.push({ sourceId: source.id, path: animPath });
    }

    // lang files: data used for pokedex description text (species.pokedex keys)
    for (const langPath of listEntries(handle, (n) => /^assets\/[^/]+\/lang\/en_us\.json$/.test(n))) {
      const text = readText(handle, langPath);
      if (!text) continue;
      try {
        // Some packs ship non-standard "###comment###" or "// comment" lines in
        // their lang JSON (valid for Minecraft's lenient loader, not for
        // JSON.parse) - strip whole-line comments before parsing.
        const sanitized = text
          .split("\n")
          .filter((line) => !/^\s*(#|\/\/)/.test(line))
          .join("\n");
        const obj = JSON.parse(sanitized);
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value !== "string") continue;
          if (source.id === "cobblemon-core") langCore.set(key, value);
          const existing = lang.get(key);
          if (!existing || source.priority >= existing.priority) {
            lang.set(key, { value, sourceId: source.id, priority: source.priority });
          }
        }
      } catch {
        warnings.push(`[${source.id}] failed to parse lang file ${langPath}`);
      }
    }

    if (source.id === "cobblemon-core") {
      showdownBase = extractShowdownBase(handle);
    }
  }

  return { species, speciesAdditions, moveOverrides, abilityOverrides, spawnPools, lang, langCore, showdownBase, textures, models, posers, animations, warnings };
}
