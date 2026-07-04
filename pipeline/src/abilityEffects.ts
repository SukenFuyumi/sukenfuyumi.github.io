// Well-known competitive Pokemon abilities that grant a hard immunity to an
// entire attacking type (as opposed to a status/flag immunity like Soundproof
// or Bulletproof, which block specific moves rather than a whole type).
// This is stable game knowledge, not something that varies per mod, so it's
// safe to hardcode rather than try to parse it out of ability script code.
export const ABILITY_TYPE_IMMUNITIES: Record<string, string[]> = {
  levitate: ["ground"],
  flashfire: ["fire"],
  voltabsorb: ["electric"],
  motordrive: ["electric"],
  lightningrod: ["electric"],
  waterabsorb: ["water"],
  stormdrain: ["water"],
  dryskin: ["water"],
  sapsipper: ["grass"],
  eartheater: ["ground"],
  wellbakedbody: ["fire"],
  purifyingsalt: [], // halves ghost damage + status immunity, not a hard type immunity - left empty on purpose
  wonderguard: ["*"], // immune to anything not super effective - special-cased by the UI
};
