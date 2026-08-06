/**
 * Reads an ability's stat-multiplier effects out of its actual code.
 *
 * Unlike a move, an ability's logic isn't structured data - it's callback
 * functions. But those functions survive as real functions in the evaluated
 * Showdown/override data, so `fn.toString()` hands back the source, and the one
 * pattern that matters most for team-building is unambiguous to read from it:
 * an `onModify<Stat>` (or `onSourceModify<Stat>`) that calls `chainModify(n)`
 * multiplies that stat by n. Laser's Additions leans on this for rebalances it
 * never wrote into the description - Telepathy secretly gives +50% Atk/SpA when
 * an ally also has it, for instance.
 *
 * Only this pattern is read. Anything the regex can't pin down confidently
 * produces nothing rather than a guess.
 */

const STAT_LABELS: Record<string, string> = {
  atk: "Ataque",
  spa: "At. Especial",
  def: "Defensa",
  spd: "Def. Especial",
  spe: "Velocidad",
};

// callback name -> which stat it tunes, and whose. `onSource*`/`onAny*` tune the
// stat of whoever is attacking this Pokémon (a defensive effect).
const STAT_CALLBACKS: Record<string, { stat: string; side: "self" | "foe" }> = {
  onModifyAtk: { stat: "atk", side: "self" },
  onAllyModifyAtk: { stat: "atk", side: "self" },
  onModifySpA: { stat: "spa", side: "self" },
  onAllyModifySpA: { stat: "spa", side: "self" },
  onModifyDef: { stat: "def", side: "self" },
  onModifySpD: { stat: "spd", side: "self" },
  onModifySpe: { stat: "spe", side: "self" },
  onSourceModifyAtk: { stat: "atk", side: "foe" },
  onSourceModifySpA: { stat: "spa", side: "foe" },
  onSourceModifyDef: { stat: "def", side: "foe" },
  onSourceModifySpD: { stat: "spd", side: "foe" },
};

const TERRAIN_LABELS: Record<string, string> = {
  electricterrain: "en campo Eléctrico",
  grassyterrain: "en campo de Hierba",
  mistyterrain: "en campo de Niebla",
  psychicterrain: "en campo Psíquico",
};

const WEATHER_LABELS: Record<string, string> = {
  raindance: "con lluvia",
  sunnyday: "con sol intenso",
  sandstorm: "con tormenta de arena",
  hail: "con granizo",
  snow: "con nieve",
};

/** Best-effort short condition, or "" when the effect is unconditional, or a
 * generic marker when there's clearly a condition we couldn't name. */
function readCondition(src: string): string {
  const type = src.match(/move\.type\s*===?\s*["']([A-Za-z]+)["']/);
  if (type) return ` con ataques de tipo ${type[1].toLowerCase()}`;

  const terrain = src.match(/isTerrain\(\s*["']([a-z]+)["']/);
  if (terrain && TERRAIN_LABELS[terrain[1]]) return ` ${TERRAIN_LABELS[terrain[1]]}`;

  const weather = src.match(/["'](raindance|sunnyday|sandstorm|hail|snow)["']/i);
  if (weather && WEATHER_LABELS[weather[1].toLowerCase()]) return ` ${WEATHER_LABELS[weather[1].toLowerCase()]}`;

  if (/\.allies\(\)/.test(src) && /hasAbility/.test(src)) return " si un aliado tiene la misma habilidad";
  if (/move\.category\s*===?\s*["']Physical["']/.test(src)) return " en ataques físicos";
  if (/move\.category\s*===?\s*["']Special["']/.test(src)) return " en ataques especiales";
  if (/\.hp\b/.test(src) && /maxhp/.test(src)) return " con la vida baja";
  if (/\.status\b/.test(src)) return " con un problema de estado";

  // A bare `if (` we couldn't decode still means it isn't always on.
  return /\bif\s*\(/.test(src) ? " (en ciertas condiciones)" : "";
}

function multiplier(src: string): number | null {
  // Both spellings appear: chainModify(1.5) and modify(stat, 1.5).
  const num = src.match(/(?:chainModify|modify)\(\s*(?:[a-zA-Z_$][\w$]*\s*,\s*)?([0-9]+(?:\.[0-9]+)?)\s*\)/);
  if (num) return parseFloat(num[1]);
  const ratio = src.match(/chainModify\(\s*\[\s*([0-9]+)\s*,\s*([0-9]+)\s*\]/);
  if (ratio) return parseInt(ratio[1], 10) / parseInt(ratio[2], 10);
  return null;
}

/** Stat-multiplier effects of an ability, as short readable Spanish lines. */
export function deriveAbilityMechanics(data: any): string[] {
  if (!data || typeof data !== "object") return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const [cb, meta] of Object.entries(STAT_CALLBACKS)) {
    const fn = data[cb];
    if (typeof fn !== "function") continue;
    const src = fn.toString();
    const mult = multiplier(src);
    if (mult === null || mult === 1) continue;

    const stat = STAT_LABELS[meta.stat];
    const cond = readCondition(src);
    let line: string;
    if (meta.side === "self") {
      line = `Multiplica su ${stat} ×${mult}${cond}`;
    } else {
      // Tuning the attacker's stat down is damage reduction; up would be rare.
      line =
        mult < 1
          ? `Reduce a ×${mult} el ${stat} de quien lo golpea${cond}`
          : `Multiplica ×${mult} el ${stat} de quien lo golpea${cond}`;
    }
    // Two callbacks (physical + special mirror) often produce the same line.
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}
