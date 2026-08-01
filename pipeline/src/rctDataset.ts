import type { ZipHandleCache } from "./zipUtil.js";
import { listEntries, readText } from "./zipUtil.js";
import type { SourceEntry } from "./types.js";

/**
 * A self-contained reference for writing RCT (Radical Cobblemon Trainers) team
 * files against *this* server's installed content.
 *
 * The point is that every id in it is one the server can actually resolve.
 * Hand-written teams keep breaking on ids that look right but aren't - a
 * Showdown-style "indeedee-f" where Cobblemon wants species "indeedee" with
 * aspects ["female"], a bare "lucarionite" where the item lives under the
 * mega_showdown namespace, a mega gimmick with no stone to trigger it. Those
 * fail silently or drop a Pokemon from the team, so the fix is to publish the
 * exact vocabulary rather than expect it to be guessed.
 */

export const NATURES = [
  "adamant", "bashful", "bold", "brave", "calm", "careful", "docile", "gentle", "hardy", "hasty",
  "impish", "jolly", "lax", "lonely", "mild", "modest", "naive", "naughty", "quiet", "quirky",
  "rash", "relaxed", "sassy", "serious", "timid",
];
export const TERA_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
export const BATTLE_FORMATS = ["GEN_9_SINGLES", "GEN_9_DOUBLES", "GEN_8_SINGLES", "GEN_8_DOUBLES"];
export const GENDERS = ["MALE", "FEMALE", "GENDERLESS"];

export interface DatasetSpecies {
  species: string;
  aspects?: string[];
  name: string;
  types: string[];
  baseStats: Record<string, number>;
  abilities: string[];
  hiddenAbilities: string[];
  moves: string[];
}

export interface DatasetItem {
  /** Fully-qualified id. */
  id: string;
  name: string;
  /** Exactly what to put in `heldItem` - see the namespace rule below. */
  write: string;
}

export interface MegaStone {
  item: string;
  /** Species this stone mega-evolves, as Cobblemon identifiers. */
  species: string[];
}

/**
 * Mega stones are declared by whichever pack adds them, under
 * data/<namespace>/mega_showdown/mega/<stone>.json, listing the species it
 * applies to. Scanning every source keeps the mapping honest across
 * Mega Showdown, ZA Mega, RLM and the fan packs.
 */
function collectMegaStones(sources: SourceEntry[], zips: ZipHandleCache, itemsById: Map<string, DatasetItem>): MegaStone[] {
  const byItem = new Map<string, Set<string>>();
  for (const source of sources) {
    const handle = zips.get(source.id);
    if (!handle) continue;
    for (const entry of listEntries(handle, (n) => /^data\/[a-z0-9_]+\/mega_showdown\/mega\/[^/]+\.json$/.test(n))) {
      const text = readText(handle, entry);
      if (!text) continue;
      let data: any;
      try { data = JSON.parse(text); } catch { continue; }
      const stone = entry.split("/").pop()!.replace(/\.json$/, "");
      const species = (data.pokemons ?? []).map((p: string) => String(p).toLowerCase());
      if (!species.length) continue;
      // The stone's own item can live in any namespace (the fan packs' stones
      // are re-registered by SpaM Megas), so match on the bare name.
      for (const item of itemsById.values()) {
        if (item.id.split(":").pop() !== stone) continue;
        if (!byItem.has(item.id)) byItem.set(item.id, new Set());
        for (const s of species) byItem.get(item.id)!.add(s);
      }
    }
  }
  return [...byItem.entries()]
    .map(([item, species]) => ({ item, species: [...species].sort() }))
    .sort((a, b) => a.item.localeCompare(b.item));
}

export function buildRctDataset(opts: {
  packName: string;
  sources: SourceEntry[];
  zips: ZipHandleCache;
  /** From trainer-species-index.json: the RCT `species` id plus form aspects. */
  speciesPicker: { id: string; slug: string; name: string; aspects?: string[] }[];
  /** From pokedex-search-index.json, keyed by slug. */
  learnsets: Record<string, { moves: string[]; abilities: string[]; hiddenAbilities: string[] }>;
  /** slug -> types/baseStats, for team-building context. */
  statsBySlug: Map<string, { types: string[]; baseStats: Record<string, number> }>;
  items: { id: string; bare: string; ns: string; name: string }[];
}) {
  const { packName, sources, zips, speciesPicker, learnsets, statsBySlug, items } = opts;

  // Cobblemon's own items are written bare in RCT files (the datapack's
  // convention, and what /give shows); anything from a mod keeps its namespace
  // or the game can't resolve it.
  const datasetItems: DatasetItem[] = items
    .map((i) => ({ id: i.id, name: i.name, write: i.ns === "cobblemon" ? i.bare : i.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const itemsById = new Map(datasetItems.map((i) => [i.id, i]));

  const species: DatasetSpecies[] = speciesPicker
    .map((s) => {
      const learn = learnsets[s.slug];
      const stats = statsBySlug.get(s.slug);
      return {
        species: s.id,
        ...(s.aspects?.length ? { aspects: s.aspects } : {}),
        name: s.name,
        types: stats?.types ?? [],
        baseStats: stats?.baseStats ?? {},
        abilities: learn?.abilities ?? [],
        hiddenAbilities: learn?.hiddenAbilities ?? [],
        moves: learn?.moves ?? [],
      };
    })
    .sort((a, b) => a.species.localeCompare(b.species) || a.name.localeCompare(b.name));

  const megaStones = collectMegaStones(sources, zips, itemsById);
  const allMoves = [...new Set(species.flatMap((s) => s.moves))].sort();
  const allAbilities = [...new Set(species.flatMap((s) => [...s.abilities, ...s.hiddenAbilities]))].sort();

  const json = {
    about:
      "Vocabulario válido para escribir equipos RCT (Radical Cobblemon Trainers) en este servidor. " +
      "Todo id que aparezca aquí resuelve; cualquier otro falla en silencio.",
    generatedAt: new Date().toISOString().slice(0, 10),
    trainerPack: packName,
    rules: RULES,
    schema: SCHEMA,
    enums: { natures: NATURES, teraTypes: TERA_TYPES, battleFormats: BATTLE_FORMATS, genders: GENDERS, aiTypes: ["rb"] },
    counts: {
      species: species.length,
      moves: allMoves.length,
      abilities: allAbilities.length,
      items: datasetItems.length,
      megaStones: megaStones.length,
    },
    megaStones,
    items: datasetItems,
    moves: allMoves,
    abilities: allAbilities,
    species,
  };

  return { json, markdown: renderMarkdown(json, megaStones) };
}

const RULES = [
  "species: identificador Cobblemon en minúsculas, SIN namespace y SIN guiones de estilo Showdown. La forma NO va en el nombre: 'indeedee-f' es inválido; se escribe species 'indeedee' + aspects ['female'].",
  "aspects: array para variantes regionales y de forma (['alolan'], ['hisuian'], ['female'], ['therian-forme']…). Usa el valor exacto que aparece en el campo aspects de este dataset.",
  "ability: id en minúsculas y sin espacios ('roughskin', no 'Rough Skin'). Debe estar en abilities o hiddenAbilities de esa especie.",
  "moveset: máximo 4, ids en minúsculas y sin espacios ('closecombat', no 'Close Combat'). Deben estar en la lista moves de esa especie.",
  "heldItem: usa el campo 'write' del objeto en items. Los de cobblemon van sin namespace ('life_orb'); los de mods lo conservan ('mega_showdown:lucarionite'). Acepta string o array de un elemento.",
  "gimmicks.mega solo funciona si el Pokémon sostiene la piedra correspondiente: comprueba la pareja en megaStones.",
  "gimmicks.tera necesita ADEMÁS que el entrenador tenga ai.data.canTera = true; sin eso la IA nunca teracristaliza.",
  "ai.data.teraTarget es opcional y nombra a un miembro del propio equipo (por su id de species); la IA teracristaliza el primero que coincida.",
  "ivs/evs: claves hp, atk, def, spa, spd, spe. IVs 0-31; EVs 0-252 y como mucho 510 en total.",
  "level: 1-100. El level cap que ve el jugador es el nivel más alto del equipo, así que subirlo cambia la progresión.",
  "battleFormat: GEN_9_DOUBLES hace el combate de dobles; el equipo necesita al menos 2 Pokémon.",
];

const SCHEMA = {
  name: { literal: "Brock" },
  ai: { type: "rb", data: { canTera: true, teraTarget: "geodude" } },
  battleFormat: "GEN_9_SINGLES",
  battleRules: { maxItemUses: 2 },
  bag: [{ item: "cobblemon:full_restore", quantity: 2 }],
  team: [
    {
      species: "geodude",
      aspects: ["alolan"],
      gender: "MALE",
      level: 12,
      nature: "adamant",
      ability: "sturdy",
      moveset: ["rollout", "magnitude"],
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { atk: 252, hp: 252 },
      heldItem: "eviolite",
      gimmicks: { tera: "rock" },
    },
  ],
};

function renderMarkdown(json: any, megaStones: MegaStone[]): string {
  const L: string[] = [];
  L.push("# Dataset RCT — Cobbleverse SpaM Edition");
  L.push("");
  L.push(`Generado el ${json.generatedAt} a partir del contenido realmente instalado en el servidor.`);
  L.push(`Pack de entrenadores de referencia: \`${json.trainerPack}\`.`);
  L.push("");
  L.push("**Todo identificador listado aquí resuelve en el servidor. Cualquier otro falla**, casi siempre en silencio: el Pokémon desaparece del equipo o el objeto se ignora, sin error visible.");
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  for (const [k, v] of Object.entries(json.counts)) L.push(`| ${k} | ${v} |`);
  L.push("");
  L.push("El archivo `rct-dataset.json` que acompaña a este documento trae las listas completas: cada especie con sus tipos, estadísticas base, habilidades legales y todos los movimientos que aprende, más el catálogo de objetos.");
  L.push("");
  L.push("## Reglas");
  L.push("");
  for (const r of json.rules) L.push(`- ${r}`);
  L.push("");
  L.push("## Estructura de un archivo de entrenador");
  L.push("");
  L.push("`data/rctmod/trainers/<id>.json`:");
  L.push("");
  L.push("```json");
  L.push(JSON.stringify(json.schema, null, 2));
  L.push("```");
  L.push("");
  L.push("## Valores admitidos");
  L.push("");
  L.push(`**Naturalezas** (${NATURES.length}): ${NATURES.join(", ")}`);
  L.push("");
  L.push(`**Tipos de teracristal** (${TERA_TYPES.length}): ${TERA_TYPES.join(", ")}`);
  L.push("");
  L.push(`**Formatos de combate**: ${BATTLE_FORMATS.join(", ")}`);
  L.push("");
  L.push(`**Géneros**: ${GENDERS.join(", ")} (el campo es opcional)`);
  L.push("");
  L.push("## Piedras mega");
  L.push("");
  L.push("`gimmicks: {\"mega\": true}` solo surte efecto si el Pokémon sostiene su piedra:");
  L.push("");
  L.push("| Objeto (`heldItem`) | Especies |");
  L.push("|---|---|");
  for (const s of megaStones) L.push(`| \`${s.item}\` | ${s.species.join(", ")} |`);
  L.push("");
  return L.join("\n");
}
