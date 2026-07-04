import { loadManifest } from "./config.js";
import { ingestAll } from "./ingest.js";
import { mergeSpecies, mergeFlatRecords, type ConflictLogEntry } from "./merge.js";
import { buildMoveset } from "./moveset.js";
import { computeMatchup, buildTypeMatrix } from "./typeChart.js";
import { resolveEvolutionTarget, summarizeEvolution, KNOWN_EVOLUTION_TARGET_ALIASES } from "./evolutions.js";
import { officialArtworkUrl, placeholderImage, type SpeciesImage } from "./images.js";
import { buildTextureIndex, pickTexture, TextureExtractor } from "./textures.js";
import { buildModelIndex, pickModel } from "./modelIndex.js";
import { ModelRenderer } from "./modelRenderer.js";
import { ZipHandleCache } from "./zipUtil.js";
import { buildSpawnIndex } from "./spawn.js";
import { assignUniqueSlugs, takeUniqueSlug } from "./slug.js";
import { resetOutputDir, writeJson } from "./output.js";
import { TYPE_COLORS, typeColor } from "./typeColors.js";
import { ABILITY_TYPE_IMMUNITIES } from "./abilityEffects.js";
import { PUBLIC_TEXTURES_DIR, PUBLIC_RENDERS_DIR, PUBLIC_DIR } from "./config.js";
import type { MoveRecord, AbilityRecord } from "./types.js";
import { writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

function normalizeAbilityId(id: string): string {
  return id.replace(/^h:/, "").toLowerCase();
}

// A few packs author "name" entirely lowercase (e.g. "agumon") - title-case it
// for display, but leave anything with intentional capitalization untouched.
function displayName(name: string): string {
  if (name !== name.toLowerCase()) return name;
  return name.replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

async function main() {
  console.log("== Cobbleverse Pokedex extraction ==");
  const { manifest, sourceRoot } = loadManifest();
  console.log(`Source root: ${sourceRoot}`);
  console.log(`Sources: ${manifest.sources.length} active, ${manifest.disabled.length} disabled, ${manifest.cosmeticOnly.length} cosmetic-only (untouched)`);

  const ingested = ingestAll(manifest, sourceRoot);
  console.log(
    `Ingested: ${ingested.species.length} species files, ${ingested.speciesAdditions.length} species_additions, ` +
      `${ingested.moveOverrides.length} move overrides, ${ingested.abilityOverrides.length} ability overrides, ` +
      `${ingested.spawnPools.length} spawn pool files, ${ingested.lang.size} lang keys`
  );
  if (ingested.warnings.length) {
    console.warn(`\n${ingested.warnings.length} warnings during ingest:`);
    for (const w of ingested.warnings.slice(0, 50)) console.warn("  " + w);
    if (ingested.warnings.length > 50) console.warn(`  ...and ${ingested.warnings.length - 50} more`);
  }

  // --- Moves ---
  const { merged: mergedMoveOverrides, conflicts: moveConflicts } = mergeFlatRecords(ingested.moveOverrides);
  const moveLookup = new Map<string, MoveRecord>();
  const allMoveIds = new Set<string>([...Object.keys(ingested.showdownBase.moves), ...mergedMoveOverrides.keys()]);
  for (const id of allMoveIds) {
    const base = ingested.showdownBase.moves[id] ?? {};
    const override = mergedMoveOverrides.get(id);
    const data = { ...base, ...(override?.data ?? {}) };
    // Cobblemon's bundled Showdown data is stripped of flavor text (no
    // desc/shortDesc) - the real description lives in the lang files as
    // cobblemon.move.<id>[.desc], the same convention mods use for their own
    // custom moves, so this works uniformly for official and custom moves.
    const langDesc = ingested.lang.get(`cobblemon.move.${id}.desc`)?.value ?? null;
    const langName = ingested.lang.get(`cobblemon.move.${id}`)?.value ?? null;
    moveLookup.set(id, {
      id,
      name: langName ?? data.name ?? id,
      num: data.num ?? null,
      type: data.type ?? null,
      category: data.category ?? null,
      basePower: data.basePower ?? null,
      accuracy: data.accuracy ?? null,
      pp: data.pp ?? null,
      priority: data.priority ?? null,
      flags: data.flags ?? {},
      shortDesc: langDesc ?? data.shortDesc ?? null,
      desc: langDesc ?? data.desc ?? null,
      sourceId: override?.provenance ? Object.values(override.provenance)[0] : "cobblemon-core",
      isOverride: !!override,
    });
  }
  console.log(`Resolved ${moveLookup.size} moves (${mergedMoveOverrides.size} touched by a mod override).`);

  // --- Abilities ---
  const { merged: mergedAbilityOverrides, conflicts: abilityConflicts } = mergeFlatRecords(ingested.abilityOverrides);
  const abilityLookup = new Map<string, AbilityRecord>();
  const allAbilityIds = new Set<string>([...Object.keys(ingested.showdownBase.abilities), ...mergedAbilityOverrides.keys()]);
  for (const id of allAbilityIds) {
    const base = ingested.showdownBase.abilities[id] ?? {};
    const override = mergedAbilityOverrides.get(id);
    const data = { ...base, ...(override?.data ?? {}) };
    // Same story as moves: real ability descriptions live in the lang files
    // (cobblemon.ability.<id>[.desc]), not in the stripped Showdown bundle.
    const langDesc = ingested.lang.get(`cobblemon.ability.${id}.desc`)?.value ?? null;
    const langName = ingested.lang.get(`cobblemon.ability.${id}`)?.value ?? null;
    abilityLookup.set(id, {
      id,
      name: langName ?? data.name ?? id,
      num: data.num ?? null,
      shortDesc: langDesc ?? data.shortDesc ?? null,
      desc: langDesc ?? data.desc ?? null,
      rating: data.rating ?? null,
      sourceId: override?.provenance ? Object.values(override.provenance)[0] : "cobblemon-core",
      isOverride: !!override,
    });
  }
  console.log(`Resolved ${abilityLookup.size} abilities (${mergedAbilityOverrides.size} touched by a mod override).`);

  // A few packs reference an ability id without the separator its own ability
  // file uses (e.g. Mega Showdown's arceus species_additions says "firemastery"
  // but its own ability file is "fire-mastery.js") - resolve those via a
  // separator-stripped index instead of leaving them as an unmatched raw id.
  const abilityLookupBySimplifiedId = new Map<string, string>();
  for (const id of abilityLookup.keys()) {
    const simplified = id.replace(/[-_]/g, "");
    if (!abilityLookupBySimplifiedId.has(simplified)) abilityLookupBySimplifiedId.set(simplified, id);
  }
  function resolveAbilityId(id: string): string {
    if (abilityLookup.has(id)) return id;
    return abilityLookupBySimplifiedId.get(id.replace(/[-_]/g, "")) ?? id;
  }

  // --- Species ---
  const { merged: mergedSpecies, conflicts: speciesConflicts, primarySource } = mergeSpecies(ingested.species, ingested.speciesAdditions);
  console.log(`Resolved ${mergedSpecies.size} species/forms across all installed packs.`);

  const spawnIndex = buildSpawnIndex(ingested.spawnPools);
  const textureIndex = buildTextureIndex(ingested.textures);
  const modelIndex = buildModelIndex(ingested.models);
  const zipHandles = new ZipHandleCache(sourceRoot, manifest.sources);
  const textureExtractor = new TextureExtractor(zipHandles, PUBLIC_TEXTURES_DIR);
  const modelRenderer = new ModelRenderer(zipHandles, PUBLIC_RENDERS_DIR);
  console.log(`Indexed ${textureIndex.size} texture folders and ${modelIndex.size} model folders.`);

  // Prefer a real static 2.5D render (parsed from the actual Bedrock model +
  // texture) so the image reads as "the Pokemon" rather than a raw UV skin.
  // Falls back to the flat texture, and only then to a color placeholder.
  async function resolveArt(identifier: string, aspects: string[], name: string, primaryType: string, slug: string): Promise<SpeciesImage | null> {
    const model = pickModel(modelIndex, identifier, aspects);
    const texture = pickTexture(textureIndex, identifier, aspects);
    if (model && texture) {
      const texBytes = textureExtractor.readBytes(texture);
      if (texBytes) {
        const url = await modelRenderer.render(model, texBytes, slug);
        if (url) return { kind: "render", url, placeholderColor: typeColor(primaryType) };
      }
    }
    if (texture) {
      const url = textureExtractor.extract(texture, slug);
      if (url) return { kind: "texture", url, placeholderColor: typeColor(primaryType) };
    }
    return null;
  }

  async function resolveSpeciesImage(identifier: string, aspects: string[], isOfficial: boolean, dexNumber: number | null, name: string, primaryType: string, slug: string): Promise<SpeciesImage> {
    if (isOfficial) {
      const sprite = officialArtworkUrl(dexNumber);
      if (sprite) return { kind: "sprite", url: sprite };
    }
    const art = await resolveArt(identifier, aspects, name, primaryType, slug);
    if (art) return art;
    return placeholderImage(name, primaryType);
  }

  // Forms: a dedicated render/texture for the specific form (aspects) beats
  // reusing the parent's generic artwork, since that's what was misleading players.
  async function resolveFormImage(identifier: string, aspects: string[], isOfficial: boolean, dexNumber: number | null, name: string, primaryType: string, slug: string, parentImage: SpeciesImage): Promise<SpeciesImage> {
    const art = await resolveArt(identifier, aspects, name, primaryType, slug);
    if (art) return art;
    if (isOfficial) {
      const sprite = officialArtworkUrl(dexNumber);
      if (sprite) return { kind: "sprite", url: sprite };
    }
    if (parentImage.kind !== "placeholder") return parentImage;
    return placeholderImage(name, primaryType);
  }

  const slugInputs = [...mergedSpecies.keys()].map((key) => {
    const [namespace, identifier] = key.split(":");
    return { key, namespace, identifier };
  });
  const slugs = assignUniqueSlugs(slugInputs);

  // Forms (regional forms, mega evolutions, gmax, etc.) are shipped as partial
  // species-like objects nested under the parent's own species file - they
  // carry their own stats/types/abilities but usually inherit the parent's
  // moveset unless they define their own "moves" list.
  function buildFormRecord(formData: any, parent: { primaryType: string; moveset: ReturnType<typeof buildMoveset> }) {
    const rawAbilities: string[] = formData.abilities ?? [];
    const primaryType = formData.primaryType ? String(formData.primaryType).toLowerCase() : parent.primaryType;
    const secondaryType = formData.secondaryType ? String(formData.secondaryType).toLowerCase() : null;
    const descKey = (formData.pokedex ?? [])[0];
    return {
      name: formData.name ?? null,
      aspects: formData.aspects ?? [],
      primaryType,
      secondaryType,
      types: [primaryType, ...(secondaryType ? [secondaryType] : [])],
      battleOnly: !!formData.battleOnly,
      baseStats: formData.baseStats ?? null,
      baseStatTotal: formData.baseStats
        ? Object.values(formData.baseStats).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
        : null,
      abilities: rawAbilities.length ? rawAbilities.filter((a) => !a.startsWith("h:")).map((a) => resolveAbilityId(normalizeAbilityId(a))) : null,
      hiddenAbilities: rawAbilities.length ? rawAbilities.filter((a) => a.startsWith("h:")).map((a) => resolveAbilityId(normalizeAbilityId(a))) : null,
      pokedexDescription: descKey ? ingested.lang.get(descKey)?.value ?? null : null,
      // Most forms don't redefine a moveset - they inherit the parent's.
      moveset: formData.moves ? buildMoveset(formData.moves, moveLookup) : parent.moveset,
      matchup: computeMatchup(ingested.showdownBase.typechart, primaryType, secondaryType),
      // Some forms (e.g. Laser's Fakemon Pack's "Midnight" recolors) define
      // their own evolution line nested inside the form itself - Ralts
      // Midnight -> Kirlia Midnight -> Gardevoir/Gallade Midnight - separate
      // from the base species' own evolutions. Resolved once every form has
      // a slug, in the pass below.
      _rawEvolutions: formData.evolutions ?? [],
      evolutions: [] as any[],
    };
  }

  // First pass: build the core record for every species (needed before we can resolve evolution targets to slugs).
  const records = new Map<string, any>();
  for (const [key, entry] of mergedSpecies) {
    const [namespace, identifier] = key.split(":");
    const data = entry.data;
    const rawAbilities: string[] = data.abilities ?? [];
    const abilities = rawAbilities.filter((a) => !a.startsWith("h:")).map((a) => resolveAbilityId(normalizeAbilityId(a)));
    const hiddenAbilities = rawAbilities.filter((a) => a.startsWith("h:")).map((a) => resolveAbilityId(normalizeAbilityId(a)));
    const primaryType = (data.primaryType ?? "normal").toLowerCase();
    const secondaryType = data.secondaryType ? String(data.secondaryType).toLowerCase() : null;
    const name = displayName(data.name ?? identifier);

    const descKey = (data.pokedex ?? [])[0];
    const pokedexDescription = descKey ? ingested.lang.get(descKey)?.value ?? null : null;

    const moveset = buildMoveset(data.moves ?? [], moveLookup);
    const matchup = computeMatchup(ingested.showdownBase.typechart, primaryType, secondaryType);
    // Gate official artwork on Cobblemon core ever having defined this species
    // (not just namespace, and not just whichever source's file currently
    // "wins" the full record - e.g. Mega Showdown reships charizard.json
    // wholesale just to add mega forms, but Charizard is still official).
    const isOfficial = entry.sources.has("cobblemon-core");
    const image = await resolveSpeciesImage(identifier, data.aspects ?? [], isOfficial, data.nationalPokedexNumber ?? null, name, primaryType, slugs.get(key)!);
    const spawnInfo = spawnIndex.get(identifier.toLowerCase()) ?? [];

    records.set(key, {
      id: key,
      namespace,
      slug: slugs.get(key),
      name,
      nationalPokedexNumber: data.nationalPokedexNumber ?? null,
      primaryType,
      secondaryType,
      types: [primaryType, ...(secondaryType ? [secondaryType] : [])],
      baseStats: data.baseStats ?? {},
      baseStatTotal: Object.values(data.baseStats ?? {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0),
      abilities,
      hiddenAbilities,
      eggGroups: data.eggGroups ?? [],
      catchRate: data.catchRate ?? null,
      eggCycles: data.eggCycles ?? null,
      baseFriendship: data.baseFriendship ?? null,
      height: data.height ?? null,
      weight: data.weight ?? null,
      maleRatio: data.maleRatio ?? null,
      experienceGroup: data.experienceGroup ?? null,
      baseExperienceYield: data.baseExperienceYield ?? null,
      labels: data.labels ?? [],
      aspects: data.aspects ?? [],
      forms: (data.forms ?? []).map((f: any) => buildFormRecord(f, { primaryType, moveset })),
      pokedexDescription,
      moveset,
      _rawEvolutions: data.evolutions ?? [], // resolved to real slugs (incl. form-aspect targets) once every form has a slug, below
      evolutions: [] as any[],
      evolvesFrom: null as string | null, // filled in later pass
      matchup,
      image,
      spawnInfo,
      sourceMods: [...entry.sources],
      primarySource: primarySource.get(key) ?? [...entry.sources][0],
      provenance: entry.provenance,
    });
  }

  // Second pass: assign every form its own slug up front (before resolving
  // evolutions) so an evolution that targets a specific aspect/form - e.g.
  // Eevee -> "glaceon kazeran" - can link straight to that form's own page
  // (which has its real stats/types/abilities) instead of the plain base
  // species page.
  const usedSlugs = new Set(slugs.values());
  // "<speciesIdentifier>:<aspect>" -> form slug. An evolution target like
  // "gardevoir goth" names exactly one aspect, so a form whose aspects are
  // *exactly* ["goth"] is the right match - not some other form that merely
  // includes "goth" among several (e.g. Mega-Midnight's ["mega_y","goth"]).
  // Register single-aspect forms first so they always win that exact key;
  // multi-aspect forms only fill in keys nothing more specific has claimed.
  const formSlugByAspect = new Map<string, string>();
  const allFormsWithParent: { parentIdentifier: string; form: any }[] = [];
  for (const parent of records.values()) {
    const parentIdentifier = parent.id.split(":")[1];
    for (const form of parent.forms) {
      if (!form.name) continue;
      form.slug = takeUniqueSlug(usedSlugs, `${parent.slug}-${form.name}`);
      allFormsWithParent.push({ parentIdentifier, form });
    }
  }
  for (const { parentIdentifier, form } of allFormsWithParent) {
    if ((form.aspects ?? []).length === 1) {
      formSlugByAspect.set(`${parentIdentifier}:${form.aspects[0].toLowerCase()}`, form.slug);
    }
  }
  for (const { parentIdentifier, form } of allFormsWithParent) {
    if ((form.aspects ?? []).length !== 1) {
      for (const aspect of form.aspects ?? []) {
        const key = `${parentIdentifier}:${aspect.toLowerCase()}`;
        if (!formSlugByAspect.has(key)) formSlugByAspect.set(key, form.slug);
      }
    }
  }

  // Third pass: resolve every species' (and every form's own) evolutions now
  // that form slugs exist.
  function resolveEvolutionList(rawEvolutions: any[], recordNamespace: string) {
    return rawEvolutions.map((evo: any) => {
      const targetKey = resolveEvolutionTarget(recordNamespace, evo.result);
      const targetIdentifier = targetKey.split(":")[1];
      const resultTokens = String(evo.result ?? "").trim().split(/\s+/);
      const aspect = resultTokens.length > 1 ? resultTokens[1].toLowerCase() : null;
      const formSlug = aspect ? formSlugByAspect.get(`${targetIdentifier}:${aspect}`) : null;
      const aliasKey = KNOWN_EVOLUTION_TARGET_ALIASES[targetKey];
      return {
        targetKey,
        targetSlug: formSlug ?? slugs.get(targetKey) ?? (aliasKey ? slugs.get(aliasKey) : null) ?? null,
        summary: summarizeEvolution(evo),
        variant: evo.variant,
      };
    });
  }
  for (const record of records.values()) {
    const [recordNamespace] = record.id.split(":");
    record.evolutions = resolveEvolutionList(record._rawEvolutions, recordNamespace);
    delete record._rawEvolutions;
    for (const form of record.forms) {
      form.evolutions = resolveEvolutionList(form._rawEvolutions, recordNamespace);
      delete form._rawEvolutions;
    }
  }

  // Fourth pass: reverse evolution links (evolvesFrom), keyed by the resolved
  // target *slug* rather than species key, so this covers both a plain base
  // species target and a specific form/aspect target (e.g. Eevee evolving
  // straight into the "Glaceon Kazeran" form page).
  const evolvesFromBySlug = new Map<string, string>();
  for (const record of records.values()) {
    for (const evo of record.evolutions) {
      if (evo.targetSlug) evolvesFromBySlug.set(evo.targetSlug, record.slug);
    }
    for (const form of record.forms) {
      for (const evo of form.evolutions) {
        if (evo.targetSlug) evolvesFromBySlug.set(evo.targetSlug, form.slug);
      }
    }
  }
  for (const record of records.values()) {
    record.evolvesFrom = evolvesFromBySlug.get(record.slug) ?? null;
  }

  // Fifth pass: every form (mega, regional/alternate, gmax, etc.) gets its
  // own standalone page too, not just a summary nested in the parent's page.
  // Kept in a separate list (not merged into `records`) so they don't pollute
  // the move/ability "who learns this" reverse indices below with near-
  // duplicate entries for every mega variant of the same Pokemon.
  const formRecords: any[] = [];
  for (const parent of records.values()) {
    const isOfficial = parent.sourceMods.includes("cobblemon-core");
    for (const form of parent.forms) {
      if (!form.name) continue;
      const formSlug = form.slug; // already assigned in the second pass above
      const formImage = await resolveFormImage(
        parent.id.split(":")[1],
        form.aspects ?? [],
        isOfficial,
        parent.nationalPokedexNumber,
        `${parent.name} ${form.name}`,
        form.primaryType,
        formSlug,
        parent.image
      );
      formRecords.push({
        id: `${parent.id}#${form.name}`,
        namespace: parent.namespace,
        slug: formSlug,
        name: `${parent.name} ${form.name}`,
        nationalPokedexNumber: parent.nationalPokedexNumber,
        primaryType: form.primaryType,
        secondaryType: form.secondaryType,
        types: form.types,
        baseStats: form.baseStats ?? parent.baseStats,
        baseStatTotal: form.baseStatTotal ?? parent.baseStatTotal,
        abilities: form.abilities ?? parent.abilities,
        hiddenAbilities: form.hiddenAbilities ?? parent.hiddenAbilities,
        eggGroups: parent.eggGroups,
        catchRate: parent.catchRate,
        eggCycles: parent.eggCycles,
        baseFriendship: parent.baseFriendship,
        height: parent.height,
        weight: parent.weight,
        maleRatio: parent.maleRatio,
        experienceGroup: parent.experienceGroup,
        baseExperienceYield: parent.baseExperienceYield,
        labels: parent.labels,
        aspects: form.aspects,
        forms: [],
        battleOnly: form.battleOnly,
        pokedexDescription: form.pokedexDescription ?? parent.pokedexDescription,
        moveset: form.moveset,
        evolutions: form.evolutions,
        evolvesFrom: evolvesFromBySlug.get(formSlug) ?? null,
        matchup: form.matchup,
        // A dedicated texture for this specific form beats reusing the
        // parent's generic artwork (that mismatch was the "erroneous" images
        // being reported); only fall back to the parent's image if this form
        // has no texture of its own.
        image: formImage,
        spawnInfo: [],
        sourceMods: parent.sourceMods,
        primarySource: parent.primarySource,
        provenance: parent.provenance,
        formOf: { slug: parent.slug, name: parent.name },
        formName: form.name,
      });
    }
  }
  console.log(`Materialized ${formRecords.length} standalone form pages (megas, alternate forms, etc.).`);

  // Reverse indices: which species learn a given move / have a given ability,
  // so the move/ability detail pages can answer "who can use this" - useful
  // for a competitive-focused reference.
  const moveLearnedBy = new Map<string, { slug: string; name: string; category: string }[]>();
  const abilityGrantedTo = new Map<string, { slug: string; name: string; hidden: boolean }[]>();
  for (const record of records.values()) {
    const addMove = (moveId: string, category: string) => {
      if (!moveLearnedBy.has(moveId)) moveLearnedBy.set(moveId, []);
      moveLearnedBy.get(moveId)!.push({ slug: record.slug, name: record.name, category });
    };
    for (const category of ["levelUp", "egg", "tm", "tutor", "legacy", "other"] as const) {
      for (const entry of record.moveset[category]) addMove(entry.moveId, category);
    }
    for (const abilityId of record.abilities) {
      if (!abilityGrantedTo.has(abilityId)) abilityGrantedTo.set(abilityId, []);
      abilityGrantedTo.get(abilityId)!.push({ slug: record.slug, name: record.name, hidden: false });
    }
    for (const abilityId of record.hiddenAbilities) {
      if (!abilityGrantedTo.has(abilityId)) abilityGrantedTo.set(abilityId, []);
      abilityGrantedTo.get(abilityId)!.push({ slug: record.slug, name: record.name, hidden: true });
    }
  }

  // --- Write output ---
  resetOutputDir();
  const listing: any[] = [];
  for (const record of [...records.values(), ...formRecords]) {
    writeJson(`pokemon/${record.slug}.json`, record);
    listing.push({
      slug: record.slug,
      name: record.name,
      nationalPokedexNumber: record.nationalPokedexNumber,
      types: record.types,
      abilities: record.abilities,
      baseStatTotal: record.baseStatTotal,
      image: record.image,
      sourceMods: record.sourceMods,
      primarySource: record.primarySource,
      labels: record.labels,
      formOf: record.formOf ?? null,
    });
  }
  listing.sort((a, b) => (a.nationalPokedexNumber ?? 99999) - (b.nationalPokedexNumber ?? 99999) || a.name.localeCompare(b.name));
  writeJson("index.json", listing);

  // A trimmed copy served as a plain static asset (not an Astro-serialized
  // prop) so the sidebar's full ~2300-entry list is fetched once by the
  // browser and cached across every page, instead of getting re-embedded in
  // every single detail page's HTML (which was ballooning each page to ~1MB).
  writeFileSync(
    resolvePath(PUBLIC_DIR, "pokedex-sidebar.json"),
    JSON.stringify(listing.map((l) => ({ slug: l.slug, name: l.name, types: l.types, image: l.image }))),
    "utf-8"
  );
  // Same idea for the /pokedex table and team builder - both need the fuller
  // per-entry shape (abilities, baseStatTotal, sourceMods, etc), but still
  // shouldn't get it re-embedded as an Astro prop on their one page each.
  writeFileSync(resolvePath(PUBLIC_DIR, "pokedex-index.json"), JSON.stringify(listing), "utf-8");

  const allMoves = [...moveLookup.values()]
    .map((m) => ({ ...m, learnedBy: moveLearnedBy.get(m.id) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  writeJson("moves.json", allMoves);
  // Trimmed copy for the /moves table (client-side searchable list) - the
  // full per-move `learnedBy` reverse index (every Pokemon that learns it,
  // huge for common TM moves) isn't needed there, only on each move's own
  // detail page where it's rendered server-side, not fetched by the browser.
  writeFileSync(
    resolvePath(PUBLIC_DIR, "moves-index.json"),
    JSON.stringify(
      allMoves.map((m) => ({ id: m.id, name: m.name, type: m.type, category: m.category, basePower: m.basePower, accuracy: m.accuracy, pp: m.pp, isOverride: m.isOverride }))
    ),
    "utf-8"
  );

  const allAbilities = [...abilityLookup.values()]
    .map((a) => ({ ...a, grantedTo: abilityGrantedTo.get(a.id) ?? [], immuneTo: ABILITY_TYPE_IMMUNITIES[a.id] ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  writeJson("abilities.json", allAbilities);
  // Same idea for the /abilities table.
  writeFileSync(
    resolvePath(PUBLIC_DIR, "abilities-index.json"),
    JSON.stringify(
      allAbilities.map((a) => ({ id: a.id, name: a.name, desc: a.desc, shortDesc: a.shortDesc, isOverride: a.isOverride, immuneTo: a.immuneTo }))
    ),
    "utf-8"
  );
  writeJson("typeColors.json", TYPE_COLORS);
  writeJson("typeMatrix.json", buildTypeMatrix(ingested.showdownBase.typechart));
  writeJson("sources.json", { sources: manifest.sources, disabled: manifest.disabled, cosmeticOnly: manifest.cosmeticOnly });

  const allConflicts: ConflictLogEntry[] = [
    ...speciesConflicts.map((c) => ({ ...c, entity: `species:${c.entity}` })),
    ...moveConflicts.map((c) => ({ ...c, entity: `move:${c.entity}` })),
    ...abilityConflicts.map((c) => ({ ...c, entity: `ability:${c.entity}` })),
  ];
  writeJson("conflicts.json", allConflicts);
  writeJson("warnings.json", ingested.warnings);

  console.log(`\nDone. ${records.size} species + ${formRecords.length} form pages written. ${allConflicts.length} field-level conflicts resolved (see conflicts.json).`);
  console.log(`Renders: ${modelRenderer.stats.successes} succeeded, ${modelRenderer.stats.failures} fell back to texture/placeholder.`);
  console.log(`Output: site/src/data/generated/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
