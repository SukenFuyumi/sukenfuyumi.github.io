/**
 * Turns Showdown's machine-readable secondary-effect data into short readable
 * lines with their activation chance ("30% envenenar", "10% retroceso").
 *
 * Shapes handled (surveyed across the 952 moves in Cobblemon's bundled
 * Showdown data: 206 use `secondary`, 4 use `secondaries[]`):
 *   { chance, status }                  -> inflicts a status condition
 *   { chance, volatileStatus }          -> flinch/confusion/etc
 *   { chance, boosts }                  -> stat change on the TARGET
 *   { chance, self: { boosts } }        -> stat change on the USER
 *   { chance, onHit }                   -> code-driven effect, no data to read
 *   {}                                  -> guaranteed, code-driven (skipped)
 * A move can combine several (Fire Fang: 10% burn + 10% flinch).
 *
 * Because this reads the already-merged move data (base Showdown record with
 * any mod override layered on top), a balance patch that retunes a chance is
 * reflected automatically - no separate handling needed.
 */

const STATUS_LABELS: Record<string, string> = {
  brn: "quemar",
  frz: "congelar",
  par: "paralizar",
  psn: "envenenar",
  tox: "envenenar gravemente",
  slp: "dormir",
};

const VOLATILE_LABELS: Record<string, string> = {
  flinch: "retroceso",
  confusion: "confundir",
  healblock: "bloquear curación",
  saltcure: "salazón",
  sparklingaria: "curar quemaduras",
  syrupbomb: "bomba de jarabe",
};

const STAT_LABELS: Record<string, string> = {
  atk: "Ataque",
  def: "Defensa",
  spa: "At. Especial",
  spd: "Def. Especial",
  spe: "Velocidad",
  accuracy: "Precisión",
  evasion: "Evasión",
};

function describeBoosts(boosts: Record<string, number>, who: "target" | "self"): string | null {
  const parts = Object.entries(boosts ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([stat, v]) => `${v > 0 ? "+" : ""}${v} ${STAT_LABELS[stat] ?? stat}`);
  if (parts.length === 0) return null;
  return `${parts.join(", ")} ${who === "self" ? "(al usuario)" : "(al objetivo)"}`;
}

export interface SecondaryEffect {
  /** Activation chance in percent; null when the data carries no chance. */
  chance: number | null;
  /** Short human-readable effect, e.g. "envenenar" or "-1 Defensa (al objetivo)". */
  effect: string;
}

function describeOne(sec: any): SecondaryEffect | null {
  if (!sec || typeof sec !== "object") return null;
  const chance = typeof sec.chance === "number" ? sec.chance : null;

  const bits: string[] = [];
  if (sec.status && STATUS_LABELS[sec.status]) bits.push(STATUS_LABELS[sec.status]);
  else if (sec.status) bits.push(String(sec.status));

  if (sec.volatileStatus && VOLATILE_LABELS[sec.volatileStatus]) bits.push(VOLATILE_LABELS[sec.volatileStatus]);
  else if (sec.volatileStatus) bits.push(String(sec.volatileStatus));

  if (sec.boosts) {
    const d = describeBoosts(sec.boosts, "target");
    if (d) bits.push(d);
  }
  if (sec.self?.boosts) {
    const d = describeBoosts(sec.self.boosts, "self");
    if (d) bits.push(d);
  }

  if (bits.length === 0) {
    // onHit-driven effects carry no readable data. Worth surfacing only when
    // there's a chance to report; a bare `{}` (guaranteed, code-driven) would
    // just render as a contentless row.
    if (chance === null) return null;
    bits.push("efecto adicional");
  }

  return { chance, effect: bits.join(" + ") };
}

/** Every chance-based secondary effect of a move, in declaration order. */
export function describeSecondaryEffects(moveData: any): SecondaryEffect[] {
  const raw: any[] = [];
  if (moveData?.secondary) raw.push(moveData.secondary);
  if (Array.isArray(moveData?.secondaries)) raw.push(...moveData.secondaries);
  return raw.map(describeOne).filter((e): e is SecondaryEffect => e !== null);
}

/** Compact one-line summary, e.g. "30% envenenar" or "10% quemar · 10% retroceso". */
export function summarizeSecondaryEffects(effects: SecondaryEffect[]): string | null {
  if (effects.length === 0) return null;
  return effects
    .map((e) => (e.chance !== null ? `${e.chance}% ${e.effect}` : e.effect))
    .join(" · ");
}
