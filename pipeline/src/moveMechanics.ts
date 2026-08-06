/**
 * Reads a move's *guaranteed* mechanical effects straight from Showdown's
 * structured data - the things that always happen but the flavour text often
 * leaves out or states vaguely: self stat drops, drain/recoil fractions, extra
 * hits, forced switches, hazards, weather, fixed damage, and so on.
 *
 * This is the counterpart to secondaryEffects.ts: that module reads the
 * chance-based `secondary`/`secondaries`, this one reads everything that fires
 * unconditionally. Both work off the already-merged move record, so a mod's
 * rebalance is reflected without extra handling.
 *
 * Priority and the move's type/power/accuracy/PP are deliberately excluded -
 * they're already first-class fields shown elsewhere.
 */

const STAT_LABELS: Record<string, string> = {
  atk: "Ataque",
  def: "Defensa",
  spa: "At. Especial",
  spd: "Def. Especial",
  spe: "Velocidad",
  accuracy: "Precisión",
  evasion: "Evasión",
};

const STATUS_LABELS: Record<string, string> = {
  brn: "Quema al objetivo",
  frz: "Congela al objetivo",
  par: "Paraliza al objetivo",
  psn: "Envenena al objetivo",
  tox: "Envenena gravemente al objetivo",
  slp: "Duerme al objetivo",
};

// Only the volatile statuses worth naming; unmapped ones (internal markers like
// "roost", odd one-offs) are skipped rather than shown as raw code.
const VOLATILE_LABELS: Record<string, string> = {
  leechseed: "Siembra al objetivo (le drena PS cada turno)",
  taunt: "Provoca al objetivo (solo podrá usar ataques)",
  confusion: "Confunde al objetivo",
  substitute: "Crea un sustituto con parte de sus PS",
  curse: "Sacrifica la mitad de sus PS para malditar al objetivo",
  destinybond: "Si el usuario cae este turno, el atacante cae con él",
  yawn: "Adormece al objetivo (dormirá al turno siguiente)",
  encore: "Obliga al objetivo a repetir su último movimiento",
  disable: "Inhabilita el último movimiento del objetivo",
  attract: "Enamora al objetivo",
  torment: "Impide al objetivo repetir movimiento",
  nightmare: "Provoca pesadillas a un objetivo dormido",
  healblock: "Bloquea la curación del objetivo",
  foresight: "Permite golpear a tipo Fantasma e ignora su evasión",
  miracleeye: "Permite golpear a tipo Siniestro e ignora su evasión",
  saltcure: "Sala al objetivo (le drena PS cada turno)",
  powder: "Si el objetivo usa un movimiento de Fuego, explota",
  magnetrise: "El usuario levita durante 5 turnos",
  aquaring: "El usuario recupera PS cada turno",
  ingrain: "El usuario se arraiga y recupera PS (no puede cambiar)",
  charge: "Carga energía para potenciar el próximo movimiento Eléctrico",
};

const SIDE_LABELS: Record<string, string> = {
  stealthrock: "Coloca Trampa Rocas en el equipo rival",
  spikes: "Coloca Púas en el equipo rival",
  toxicspikes: "Coloca Púas Tóxicas en el equipo rival",
  stickyweb: "Coloca Red Viscosa en el equipo rival",
  reflect: "Levanta Reflejo (reduce el daño físico del equipo)",
  lightscreen: "Levanta Pantalla de Luz (reduce el daño especial del equipo)",
  auroraveil: "Levanta Velo Aurora (reduce el daño del equipo)",
  safeguard: "Levanta Velo Sagrado (protege del estado)",
  mist: "Levanta Neblina (protege de bajadas de características)",
  tailwind: "Duplica la Velocidad del equipo durante 4 turnos",
  luckychant: "Impide los golpes críticos contra el equipo",
};

const WEATHER_LABELS: Record<string, string> = {
  sunnyday: "sol intenso",
  raindance: "lluvia",
  sandstorm: "tormenta de arena",
  hail: "granizo",
  snow: "nieve",
  snowscape: "nieve",
};

const TERRAIN_LABELS: Record<string, string> = {
  electricterrain: "Eléctrico",
  grassyterrain: "Hierba",
  mistyterrain: "Niebla",
  psychicterrain: "Psíquico",
};

const PSEUDOWEATHER_LABELS: Record<string, string> = {
  trickroom: "Espacio Raro (los más lentos atacan primero)",
  magicroom: "Zona Mágica (anula los objetos)",
  wonderroom: "Zona Extraña (intercambia Defensa y Def. Especial)",
  gravity: "Gravedad (nadie puede levitar; sube la precisión)",
};

function pct(fraction: [number, number]): number {
  return Math.round((fraction[0] / fraction[1]) * 100);
}

function boostLine(boosts: Record<string, number>, who: "self" | "target"): string | null {
  const parts = Object.entries(boosts ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([stat, v]) => `${v > 0 ? "+" : ""}${v} ${STAT_LABELS[stat] ?? stat}`);
  if (!parts.length) return null;
  return `${parts.join(", ")} ${who === "self" ? "(al usuario)" : "(al objetivo)"}`;
}

/** Guaranteed effects of a move, as short readable Spanish lines. */
export function deriveMoveMechanics(m: any): string[] {
  if (!m || typeof m !== "object") return [];
  const out: string[] = [];
  const targetsSelf = m.target === "self";

  // Stat changes. Top-level `boosts` goes to whatever the move targets; `self`
  // and `selfBoost` always land on the user (e.g. Close Combat, Scale Shot).
  if (m.boosts) {
    const line = boostLine(m.boosts, targetsSelf ? "self" : "target");
    if (line) out.push(line);
  }
  if (m.self?.boosts) {
    const line = boostLine(m.self.boosts, "self");
    if (line) out.push(line);
  }
  if (m.selfBoost?.boosts) {
    const line = boostLine(m.selfBoost.boosts, "self");
    if (line) out.push(line);
  }

  if (Array.isArray(m.drain)) out.push(`Recupera el ${pct(m.drain)}% del daño causado`);
  if (Array.isArray(m.recoil)) out.push(`Retroceso: pierde el ${pct(m.recoil)}% del daño causado`);
  if (m.struggleRecoil) out.push("Retroceso: pierde 1/4 de sus PS máximos");
  if (m.mindBlownRecoil) out.push("El usuario pierde la mitad de sus PS máximos");
  if (m.hasCrashDamage) out.push("Si falla, el usuario recibe daño de caída");
  if (Array.isArray(m.heal)) out.push(`Restaura el ${pct(m.heal)}% de sus PS`);

  if (typeof m.multihit === "number") out.push(`Golpea ${m.multihit} veces`);
  else if (Array.isArray(m.multihit)) out.push(`Golpea de ${m.multihit[0]} a ${m.multihit[1]} veces`);

  if (m.willCrit) out.push("Siempre asesta un golpe crítico");
  else if (typeof m.critRatio === "number" && m.critRatio > 1) out.push("Mayor probabilidad de golpe crítico");

  if (m.ohko) out.push("Fulmina de un golpe (K.O. si acierta)");
  if (m.damage === "level") out.push("Inflige daño fijo igual al nivel del usuario");
  else if (typeof m.damage === "number") out.push(`Inflige ${m.damage} PS de daño fijo`);

  if (m.overrideOffensiveStat) out.push(`Calcula el daño con su ${STAT_LABELS[m.overrideOffensiveStat] ?? m.overrideOffensiveStat}`);
  if (m.overrideOffensivePokemon === "target") out.push("Usa el Ataque del objetivo para el cálculo");
  if (m.overrideDefensiveStat) out.push(`Golpea la ${STAT_LABELS[m.overrideDefensiveStat] ?? m.overrideDefensiveStat} del objetivo`);
  if (m.ignoreDefensive) out.push("Ignora los aumentos de defensa del objetivo");
  if (m.breaksProtect) out.push("Rompe la protección del objetivo");
  if (m.thawsTarget) out.push("Descongela al objetivo");

  if (m.forceSwitch) out.push("Obliga al objetivo a cambiar de Pokémon");
  if (m.selfSwitch) out.push("El usuario cambia de Pokémon tras atacar");

  // Showdown is inconsistent about casing here ("RainDance" vs "sunnyday"), so
  // every id is matched lowercased.
  const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

  // A guaranteed status is the primary effect; a chance-based one lives in
  // `secondary` and is handled by secondaryEffects.ts instead.
  if (STATUS_LABELS[lc(m.status)]) out.push(STATUS_LABELS[lc(m.status)]);
  if (VOLATILE_LABELS[lc(m.volatileStatus)]) out.push(VOLATILE_LABELS[lc(m.volatileStatus)]);
  if (SIDE_LABELS[lc(m.sideCondition)]) out.push(SIDE_LABELS[lc(m.sideCondition)]);
  if (lc(m.slotCondition) === "wish") out.push("Deseo: cura al Pokémon en su lugar tras dos turnos");

  if (WEATHER_LABELS[lc(m.weather)]) out.push(`Invoca ${WEATHER_LABELS[lc(m.weather)]}`);
  if (TERRAIN_LABELS[lc(m.terrain)]) out.push(`Crea el campo ${TERRAIN_LABELS[lc(m.terrain)]}`);
  if (PSEUDOWEATHER_LABELS[lc(m.pseudoWeather)]) out.push(`Activa ${PSEUDOWEATHER_LABELS[lc(m.pseudoWeather)]}`);

  return out;
}
