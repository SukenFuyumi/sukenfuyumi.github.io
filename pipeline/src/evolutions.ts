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
  if (resultParts.length > 1) parts.push(`variante ${resultParts.slice(1).join(" ")}`);
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
