import { existsSync } from "node:fs";
import { openZip, listEntries, readText } from "./zipUtil.js";

/**
 * Reads a Radical Cobblemon Trainers (RCT) datapack - the format Cobbleverse
 * ships its gym leaders / Elite Four / champions / villain teams in - and turns
 * it into the progression data the /progresion section renders.
 *
 * Three folders matter:
 *   trainers/<id>.json                  the team itself (species, level, IVs/EVs,
 *                                       nature, ability, held item, moveset)
 *   mobs/trainers/**\/<id>.json         progression metadata: which series the
 *                                       trainer belongs to, their type, and
 *                                       `requiredDefeats` (who you must beat
 *                                       first) - this is the progression graph
 *   series/<id>.json                    series title/description/difficulty
 *   trainer_types/<id>.json             display name, symbol and colour
 *
 * Level caps are NOT stored in the datapack; they're a mod mechanic documented
 * in config/rctmod-server.toml: a player's cap is the level of the strongest
 * Pokemon on their *next required* trainer's team plus `relativeLevelCap`.
 * That makes the cap a property of each trainer (the ceiling you play under
 * while they're your next objective), which is what gets computed here.
 * This server runs `relativeLevelCap: 0`, so a trainer's cap is exactly their
 * ace's level - Brock's strongest Pokemon is level 20, so his cap is 20.
 */

/**
 * Standard Gen-III+ stat formula. The trainer data gives level/IVs/EVs/nature
 * and the Pokedex records give base stats, so the final in-battle numbers (what
 * the in-game trainer card shows) can be reproduced rather than left implicit.
 */
const NATURE_MODS: Record<string, [string, string]> = {
  adamant: ["atk", "spa"], bold: ["def", "atk"], brave: ["atk", "spe"], calm: ["spd", "atk"],
  careful: ["spd", "spa"], gentle: ["spd", "def"], hasty: ["spe", "def"], impish: ["def", "spa"],
  jolly: ["spe", "spa"], lax: ["def", "spd"], lonely: ["atk", "def"], mild: ["spa", "def"],
  modest: ["spa", "atk"], naive: ["spe", "spd"], naughty: ["atk", "spd"], quiet: ["spa", "spe"],
  rash: ["spa", "spd"], relaxed: ["def", "spe"], sassy: ["spd", "spe"], timid: ["spe", "atk"],
};
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function computeStats(
  base: Record<string, number> | null,
  ivs: Record<string, number>,
  evs: Record<string, number>,
  level: number,
  nature: string | null
): Record<string, number> | null {
  if (!base || level <= 0) return null;
  // Species files use Cobblemon's long stat names; trainer data uses the short
  // Showdown ones. Try the short key first (some sources already normalize to
  // it), then the Cobblemon spelling.
  const LONG: Record<string, string> = {
    hp: "hp", atk: "attack", def: "defence", spa: "special_attack", spd: "special_defence", spe: "speed",
  };
  const baseOf = (k: string) => base[k] ?? base[LONG[k]] ?? 0;
  const mods = nature ? NATURE_MODS[nature.toLowerCase()] : undefined;
  const out: Record<string, number> = {};
  for (const k of STAT_KEYS) {
    const b = baseOf(k);
    if (!b) continue;
    const iv = ivs[k] ?? 0;
    const ev = evs[k] ?? 0;
    const common = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100);
    if (k === "hp") {
      out[k] = common + level + 10;
    } else {
      let v = common + 5;
      if (mods?.[0] === k) v = Math.floor(v * 1.1);
      else if (mods?.[1] === k) v = Math.floor(v * 0.9);
      out[k] = v;
    }
  }
  return out;
}

export interface TrainerTeamMember {
  species: string;
  speciesSlug: string | null;
  displayName: string;
  image: any | null;
  types: string[];
  stats: Record<string, number> | null;
  level: number;
  nature: string | null;
  ability: string | null;
  abilityId: string | null;
  heldItem: string | null;
  heldItemId: string | null;
  gender: string | null;
  shiny: boolean;
  aspects: string[];
  /** gimmicks.tera - the type this Pokemon terastallizes into, if any. */
  teraType: string | null;
  /** gimmicks.mega - whether it mega evolves. Can be set alongside a tera type. */
  mega: boolean;
  abilityDesc: string | null;
  abilityMechanics: string[] | null;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  // Move details are embedded (not just ids) so the trainer panel can show a
  // move's power/accuracy/PP/description from its single fetch, without also
  // pulling the site-wide moves index.
  moves: {
    id: string;
    name: string;
    type: string | null;
    category: string | null;
    basePower: number | null;
    accuracy: number | boolean | null;
    pp: number | null;
    desc: string | null;
    mechanics: string[] | null;
  }[];
}

export interface TrainerRecord {
  id: string;
  slug: string;
  name: string;
  roleKey: string;
  role: string;
  seriesId: string | null;
  seriesLabel: string | null;
  typeId: string | null;
  typeLabel: string | null;
  typeColor: string | null;
  teamMaxLevel: number;
  levelCap: number | null;
  requiredDefeats: string[];
  requiredNames: string[];
  step: number;
  team: TrainerTeamMember[];
  bag: { item: string; name: string; quantity: number }[];
  maxItemUses: number | null;
  /** e.g. GEN_9_SINGLES / GEN_9_DOUBLES - worth surfacing, a doubles gym plays differently. */
  battleFormat: string | null;
  isDoubles: boolean;
  /** ai.data.canTera - without this the per-Pokemon tera gimmicks never fire. */
  canTera: boolean;
  /** ai.data.teraTarget - species the AI picks to terastallize; first match on the team. */
  teraTarget: string | null;
}

export interface SeriesRecord {
  id: string;
  title: string;
  description: string | null;
  difficulty: number | null;
  requiredSeries: string[];
  trainerCount: number;
}

export interface TrainerResolvers {
  /** species id (+aspects) -> { slug, name, image } from the Pokedex records. */
  resolveSpecies: (
    species: string,
    aspects: string[]
  ) => { slug: string | null; name: string; image: any | null; types?: string[]; baseStats?: Record<string, number> | null };
  resolveMove: (
    id: string
  ) => {
    name: string;
    type: string | null;
    category: string | null;
    basePower?: number | null;
    accuracy?: number | boolean | null;
    pp?: number | null;
    desc?: string | null;
    mechanics?: string[] | null;
  } | null;
  resolveAbility: (id: string) => { name: string; desc: string | null; mechanics?: string[] | null } | null;
  /** Minecraft/Cobblemon item id -> display name, via the lang files. */
  resolveItem: (id: string) => string | null;
}

const ROLE_LABELS: Record<string, string> = {
  champion: "Campeón",
  elite_four: "Alto Mando",
  gym_leader: "Líder de Gimnasio",
  rival: "Rival",
  villain: "Equipo villano",
  custom: "Entrenador del servidor",
  other: "Entrenador",
};

/**
 * Roles aren't a field - the datapack encodes them inconsistently: some
 * trainers carry a role-ish `type` ("leader", "e4", "champ"), while the
 * region-series ones carry a region type ("sinnoh") and put the role in the
 * id ("sinnoh_league_aaron", "sinnoh_champion_..."). Checked in most-specific
 * order so "sinnoh_league_*" isn't mistaken for a plain region trainer.
 */
function deriveRole(id: string, type: string): string {
  if (/champion|champ/.test(id) || type === "champ" || /_champion$/.test(type)) return "champion";
  if (/league|elite_four/.test(id) || type === "e4" || /_league$/.test(type)) return "elite_four";
  if (/leader/.test(id) || type === "leader") return "gym_leader";
  if (type.startsWith("team_") || type === "ligh_of_ruin") return "villain";
  if (type === "rival") return "rival";
  // Region-typed single trainers in these series are the region's gym leaders.
  if (["kanto", "johto", "hoenn", "sinnoh", "pallet"].includes(type)) return "gym_leader";
  return "other";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function readJson(handle: any, name: string): any | null {
  const txt = readText(handle, name);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * Fails loudly if the configured trainer datapack can't be used.
 *
 * Called before the pipeline writes anything, because `resetOutputDir()` wipes
 * the generated folder: a failure discovered later would leave the progression
 * data deleted rather than merely stale, and `npm run build` would happily
 * publish an empty Progresión page. Aborting up front leaves the previous
 * output untouched, so a typo in `trainerPack.file` costs a re-run instead of
 * the whole section.
 */
export function assertTrainerPackReadable(zipPath: string, configuredPath: string): void {
  const fail = (reason: string) => {
    throw new Error(
      `No se pudo leer el datapack de entrenadores.\n` +
        `  configurado: ${configuredPath}\n` +
        `  ruta:        ${zipPath}\n` +
        `  motivo:      ${reason}\n` +
        `Revisa sources.json -> trainerPack.file, o copia el zip a datapacks/.\n` +
        `La extracción se detiene para no dejar la sección de Progresión vacía.`
    );
  };
  if (!existsSync(zipPath)) fail("el archivo no existe");
  let handle;
  try {
    handle = openZip(zipPath);
  } catch (err) {
    fail(`no se pudo abrir el zip (${(err as Error).message})`);
    return;
  }
  const teamFiles = listEntries(handle!, (n) => /^data\/rctmod\/trainers\/[^/]+\.json$/.test(n));
  if (teamFiles.length === 0) {
    fail("el zip no contiene data/rctmod/trainers/*.json (¿es el datapack de RCT correcto?)");
  }
}

export function buildTrainerData(
  zipPath: string,
  opts: { relativeLevelCap: number; maxLevelCap: number; includeCustom: boolean },
  resolvers: TrainerResolvers
): {
  trainers: TrainerRecord[];
  series: SeriesRecord[];
  /**
   * The untouched RCT JSON of each surfaced trainer, keyed by datapack id. The
   * editor patches these instead of rebuilding the schema from the derived
   * records, so fields it never edits (ai, battleFormat, identity…) survive an
   * export unchanged.
   */
  rawTeamFiles: Record<string, any>;
} {
  const handle = openZip(zipPath);
  const entries = listEntries(handle, (n) => n.startsWith("data/rctmod/") && n.endsWith(".json"));

  const teamFiles = entries.filter((n) => /^data\/rctmod\/trainers\/[^/]+\.json$/.test(n));
  const mobFiles = entries.filter((n) => n.startsWith("data/rctmod/mobs/"));
  const seriesFiles = entries.filter((n) => n.startsWith("data/rctmod/series/"));
  const typeFiles = entries.filter((n) => n.startsWith("data/rctmod/trainer_types/"));

  const idOf = (n: string) => n.split("/").pop()!.replace(/\.json$/, "");

  const types = new Map<string, any>();
  for (const f of typeFiles) types.set(idOf(f), readJson(handle, f) ?? {});

  const seriesRaw = new Map<string, any>();
  for (const f of seriesFiles) seriesRaw.set(idOf(f), readJson(handle, f) ?? {});

  const mobs = new Map<string, any>();
  for (const f of mobFiles) {
    const o = readJson(handle, f);
    if (o) mobs.set(idOf(f), o);
  }

  const trainers: TrainerRecord[] = [];
  const usedSlugs = new Set<string>();
  const rawTeamFiles: Record<string, any> = {};

  for (const file of teamFiles) {
    const id = idOf(file);
    const data = readJson(handle, file);
    if (!data?.team?.length) continue;

    const mob = mobs.get(id);
    const type: string = mob?.type ?? "";
    // Trainers with no mob entry are the server's own custom additions
    // (galaxy_*/lumy_*, named after community members) - they have real teams
    // but no placement in the progression chain.
    const roleKey = mob ? deriveRole(id, type) : "custom";
    if (roleKey === "other" && !mob) continue;
    if (!opts.includeCustom && roleKey === "custom") continue;
    // Generic filler NPCs (camper, painter…) have no fixed team worth listing.
    if (mob && type === "normal") continue;

    // Captured past the filters, so only trainers the site actually surfaces
    // get shipped for the editor.
    rawTeamFiles[id] = data;

    const team: TrainerTeamMember[] = data.team.map((m: any) => {
      const aspects: string[] = [
        ...(Array.isArray(m.aspects) ? m.aspects : []),
        ...(m.form ? [String(m.form)] : []),
        ...(m.variant ? [String(m.variant)] : []),
      ].map((a) => String(a).toLowerCase());
      // gimmicks is a map, and tera + mega genuinely co-occur in this pack
      // (e.g. a Charizard that megas *and* teras into steel), so they can't be
      // collapsed into one label.
      const gimmicks = m.gimmicks && typeof m.gimmicks === "object" ? m.gimmicks : {};
      const teraType = gimmicks.tera ? String(gimmicks.tera).toLowerCase() : null;
      const resolved = resolvers.resolveSpecies(String(m.species).toLowerCase(), aspects);
      const heldItemId = Array.isArray(m.heldItem) ? m.heldItem[0] ?? null : m.heldItem ?? null;
      const abilityId = m.ability ? String(m.ability).toLowerCase() : null;
      const level = Number(m.level) || 0;
      const abilityInfo = abilityId ? resolvers.resolveAbility(abilityId) : null;
      return {
        species: String(m.species).toLowerCase(),
        speciesSlug: resolved.slug,
        displayName: resolved.name,
        image: resolved.image,
        types: resolved.types ?? [],
        stats: computeStats(resolved.baseStats ?? null, m.ivs ?? {}, m.evs ?? {}, level, m.nature ?? null),
        level,
        nature: m.nature ? titleCase(String(m.nature)) : null,
        ability: abilityId ? abilityInfo?.name ?? titleCase(abilityId) : null,
        abilityId,
        abilityDesc: abilityInfo?.desc ?? null,
        abilityMechanics: abilityInfo?.mechanics ?? null,
        heldItemId,
        heldItem: heldItemId ? resolvers.resolveItem(heldItemId) ?? titleCase(heldItemId) : null,
        gender: m.gender ? String(m.gender).toLowerCase() : null,
        shiny: !!m.shiny,
        aspects,
        teraType,
        mega: !!gimmicks.mega,
        ivs: m.ivs ?? {},
        evs: m.evs ?? {},
        moves: (m.moveset ?? []).map((mv: string) => {
          const info = resolvers.resolveMove(String(mv).toLowerCase());
          return {
            id: String(mv).toLowerCase(),
            name: info?.name ?? titleCase(String(mv)),
            type: info?.type ?? null,
            category: info?.category ?? null,
            basePower: info?.basePower ?? null,
            accuracy: info?.accuracy ?? null,
            pp: info?.pp ?? null,
            desc: info?.desc ?? null,
            mechanics: info?.mechanics ?? null,
          };
        }),
      };
    });

    const teamMaxLevel = Math.max(...team.map((t) => t.level), 0);
    const seriesId: string | null = mob?.series?.[0] ?? null;
    const typeInfo = types.get(type);

    let slug = slugify(data.name?.literal ? `${data.name.literal}-${id}` : id);
    while (usedSlugs.has(slug)) slug = `${slug}-2`;
    usedSlugs.add(slug);

    trainers.push({
      id,
      slug,
      name: data.name?.literal ?? titleCase(id),
      roleKey,
      role: ROLE_LABELS[roleKey] ?? ROLE_LABELS.other,
      seriesId,
      seriesLabel: seriesId ? seriesRaw.get(seriesId)?.title?.literal ?? titleCase(seriesId) : null,
      typeId: type || null,
      typeLabel: typeInfo?.name?.literal ?? (type ? titleCase(type) : null),
      typeColor: typeInfo?.color ? `#${typeInfo.color}` : null,
      teamMaxLevel,
      // The ceiling a player plays under while this trainer is their next
      // required fight (see the module comment). Clamped to the game's own
      // level ceiling: the +relativeLevelCap bonus can't push a cap past 100,
      // so late-game trainers (Rival Red's level-100 team) cap at 100, not 105.
      levelCap: teamMaxLevel > 0 ? Math.min(teamMaxLevel + opts.relativeLevelCap, opts.maxLevelCap) : null,
      requiredDefeats: (mob?.requiredDefeats ?? []).flat().map(String),
      requiredNames: [],
      step: 0,
      team,
      bag: (data.bag ?? []).map((b: any) => ({
        item: b.item,
        name: resolvers.resolveItem(String(b.item).replace(/^[a-z]+:/, "")) ?? titleCase(String(b.item).replace(/^[a-z]+:/, "")),
        quantity: b.quantity ?? 1,
      })),
      maxItemUses: data.battleRules?.maxItemUses ?? null,
      battleFormat: data.battleFormat ?? null,
      isDoubles: /DOUBLES/i.test(String(data.battleFormat ?? "")),
      canTera: !!data.ai?.data?.canTera,
      teraTarget: data.ai?.data?.teraTarget ? String(data.ai.data.teraTarget).toLowerCase() : null,
    });
  }

  // Progression order. `requiredDefeats` forms a dependency graph per series;
  // a trainer's step is the longest chain of prerequisites leading to them, so
  // trainers that unlock together share a step. Depth-first with a visited set
  // (the data is authored by hand, so a cycle would otherwise hang the build).
  const byId = new Map(trainers.map((t) => [t.id, t]));
  const stepCache = new Map<string, number>();
  const computeStep = (id: string, stack: Set<string>): number => {
    if (stepCache.has(id)) return stepCache.get(id)!;
    const t = byId.get(id);
    if (!t || stack.has(id)) return 0;
    stack.add(id);
    const deps = t.requiredDefeats.filter((d) => byId.has(d));
    const step = deps.length === 0 ? 0 : Math.max(...deps.map((d) => computeStep(d, stack))) + 1;
    stack.delete(id);
    stepCache.set(id, step);
    return step;
  };
  for (const t of trainers) {
    t.step = computeStep(t.id, new Set());
    t.requiredNames = t.requiredDefeats.map((d) => byId.get(d)?.name ?? titleCase(d));
  }

  trainers.sort(
    (a, b) =>
      (a.seriesId ?? "zzz").localeCompare(b.seriesId ?? "zzz") ||
      a.step - b.step ||
      a.teamMaxLevel - b.teamMaxLevel ||
      a.name.localeCompare(b.name)
  );

  const seriesList: SeriesRecord[] = [...seriesRaw.entries()]
    .map(([id, o]) => ({
      id,
      title: o.title?.literal ?? titleCase(id),
      description: o.description?.literal ?? null,
      difficulty: o.difficulty ?? null,
      requiredSeries: (o.requiredSeries ?? []).flat().map(String),
      trainerCount: trainers.filter((t) => t.seriesId === id).length,
    }))
    .filter((s) => s.trainerCount > 0);

  // Order by the `requiredSeries` chain, not by difficulty: Johto and Hoenn
  // share difficulty 8, so a difficulty sort put Hoenn first even though Hoenn
  // requires Johto. Depth = how many series must be cleared first.
  const seriesById = new Map(seriesList.map((s) => [s.id, s]));
  const depthCache = new Map<string, number>();
  const seriesDepth = (id: string, stack: Set<string>): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const s = seriesById.get(id);
    if (!s || stack.has(id)) return 0;
    stack.add(id);
    const deps = s.requiredSeries.filter((d) => seriesById.has(d));
    const depth = deps.length === 0 ? 0 : Math.max(...deps.map((d) => seriesDepth(d, stack))) + 1;
    stack.delete(id);
    depthCache.set(id, depth);
    return depth;
  };
  const series = seriesList.sort(
    (a, b) =>
      seriesDepth(a.id, new Set()) - seriesDepth(b.id, new Set()) ||
      (a.difficulty ?? 99) - (b.difficulty ?? 99) ||
      a.title.localeCompare(b.title)
  );

  return { trainers, series, rawTeamFiles };
}
