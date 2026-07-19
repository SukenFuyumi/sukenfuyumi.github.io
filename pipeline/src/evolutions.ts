function titleCaseWord(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function summarizeRequirement(req: any): string {
  switch (req?.variant) {
    case "level":
      return `Nv. ${req.minLevel ?? req.level ?? req.amount ?? "?"}`;
    case "friendship":
      return `Amistad ${req.amount ?? ""}+`.trim();
    case "time_range":
      return req.range === "day" ? "De día" : req.range === "night" ? "De noche" : `Horario: ${req.range}`;
    case "has_move_type":
      return `Conoce un movimiento de tipo ${req.type}`;
    case "has_move":
      return `Conoce ${req.move}`;
    case "biome":
      return `Bioma: ${(req.biomeCondition ?? req.biomes ?? []).toString().replace(/^#?minecraft:|^#?cobblemon:/, "")}`;
    case "weather":
      return `Clima: ${req.weather}`;
    case "world":
      return `Dimensión: ${(req.identifier ?? "").replace(/^minecraft:/, "")}`;
    case "held_item":
      return `Sosteniendo: ${(req.itemCondition ?? "").replace(/^minecraft:|^cobblemon:/, "")}`;
    // Fanmade Form Funfair's brewing mechanic (v1.4.0): a species feature
    // (e.g. "ingredient_magma") must hold a value in `range` (e.g. "3-3").
    // These stack (one per ingredient) to pick which potion_type Brewcargo
    // evolves into.
    case "property_range": {
      const feature = String(req.feature ?? "").replace(/^ingredient_/, "");
      const range = String(req.range ?? "");
      const [lo, hi] = range.split("-");
      const count = lo && lo === hi ? `×${lo}` : range;
      return `${titleCaseWord(feature)} ${count}`.trim();
    }
    // Needs another species present in the party (e.g. Lunatone -> Lunaclipse
    // requires Solrock in party), v1.4.0.
    case "party_member":
      return `${req.contains === false ? "Sin" : "Con"} ${titleCaseWord(req.target ?? "?")} en el equipo`;
    case "advancement":
      return `Logro: ${String(req.requiredAdvancement ?? req.advancement ?? "").replace(/^minecraft:/, "").split("/").pop()}`;
    case "use_move":
      return `Usar ${req.move}${req.amount > 1 ? ` ×${req.amount}` : ""}`;
    // A raw PokemonProperties string, e.g. "palmtea palmtea_honey=32" - surface
    // the key=value detail after the species name.
    case "properties": {
      const tokens = String(req.target ?? "").trim().split(/\s+/).slice(1);
      const detail = tokens.map((t) => t.replace("=", ": ")).join(", ");
      return detail ? `Propiedad ${detail}` : "Propiedad especial";
    }
    default:
      return req?.variant ?? "Requisito especial";
  }
}

export function summarizeEvolution(evo: any): string {
  const parts: string[] = [];
  switch (evo.variant) {
    case "level_up":
      parts.push("Nivel");
      break;
    case "trade":
      parts.push("Intercambio");
      break;
    case "item_interact":
      parts.push(`Usar ${evo.requiredContext?.replace(/^.*:/, "") ?? "objeto"}`);
      break;
    case "block_click":
      parts.push("Interactuar con bloque");
      break;
    default:
      parts.push(evo.variant ?? "Evoluciona");
  }
  const requirements = evo.requirements ?? [];
  // "defeat" requirements (one entry per opponent species) can pile up into
  // dozens of entries for a "beat one of everything" style evolution -
  // collapse them into one readable line instead of repeating "defeat" N times.
  const defeatReqs = requirements.filter((r: any) => r?.variant === "defeat");
  const otherReqs = requirements.filter((r: any) => r?.variant !== "defeat");
  if (defeatReqs.length > 0) {
    const names = defeatReqs.map((r: any) => `${titleCaseWord(r.target ?? r.pokemon ?? "?")}${r.amount > 1 ? ` x${r.amount}` : ""}`);
    parts.push(
      names.length <= 3
        ? `Derrotar a ${names.join(", ")}`
        : `Derrotar a ${names.slice(0, 3).join(", ")} (+${names.length - 3} más)`
    );
  }
  for (const req of otherReqs) {
    const s = summarizeRequirement(req);
    if (s) parts.push(s);
  }
  if (evo.consumeHeldItem) parts.push("(consume objeto sostenido)");
  // Cobblemon's evolution `result` can be "<species> <aspect>" (e.g. "glaceon
  // kazeran") to evolve into a specific reskinned/aspect variant of a species
  // that isn't a wholly separate one. We link to the base species (aspect
  // variants aren't independently addressable pages), but still surface the
  // aspect in the summary so that detail isn't silently dropped.
  const resultParts = String(evo.result ?? "").trim().split(/\s+/);
  if (resultParts.length > 1) {
    // Aspect tokens come as "aspect=x", "<feature>=<value>" (e.g.
    // "potion_type=fire_resistance", v1.4.0), a bare literal, or "<feature>=true".
    // Show just the meaningful value so the summary reads "variante fire resistance"
    // instead of "variante potion_type=fire_resistance".
    const aspect = resultParts
      .slice(1)
      .map((tok) => {
        if (!tok.includes("=")) return tok;
        const [key, value] = tok.split("=");
        if (key === "aspect") return value;
        if (value === "true") return key;
        return value;
      })
      .map((s) => s.replace(/[_-]/g, " "))
      .join(" ");
    parts.push(`variante ${aspect}`);
  }
  return parts.join(" · ");
}

export function resolveEvolutionTarget(namespace: string, result: string): string {
  const species = String(result).trim().split(/\s+/)[0];
  return species.includes(":") ? species : `${namespace}:${species}`;
}

// Verified upstream data typos where a mod's own evolution `result` doesn't
// match the identifier its target species is actually registered under.
// Confirmed by inspecting the mod jar directly - not a guess. Applied only as
// a fallback when the direct/aspect lookup fails, so it can't mask other bugs.
export const KNOWN_EVOLUTION_TARGET_ALIASES: Record<string, string> = {
  // Digimod's zerimon.json evolves into "gummymon", but the species file is
  // registered as data/cobblemon/species/custom/baby2/gumimon.json.
  "cobblemon:gummymon": "cobblemon:gumimon",
};
