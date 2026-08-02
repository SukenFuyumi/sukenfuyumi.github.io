/**
 * Checks a trainer pack against the generated RCT dataset.
 *
 * The dataset alone is only vocabulary - it makes the right ids available but
 * nothing stops a wrong one being written anyway, and RCT fails silently when
 * that happens (the Pokemon is dropped, no error in the log). This is the part
 * that actually catches it.
 *
 *   npm run validate-trainers -- "<ruta al .zip>"
 *
 * Exits 1 if there is at least one blocking finding, so it can gate an upload.
 */
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_DIR } from "./config.js";

type Severity = "bloqueante" | "aviso";
interface Finding { severity: Severity; trainer: string; message: string }

const DATASET = resolve(PUBLIC_DIR, "rct-dataset.json");

function speciesKey(species: string, aspects?: string[]): string {
  return `${species}|${(aspects ?? []).map((a) => String(a).toLowerCase()).sort().join(",")}`;
}

export function validateTrainerPack(zipPath: string): Finding[] {
  const dataset = JSON.parse(readFileSync(DATASET, "utf-8"));
  const bySpecies = new Map<string, any>(dataset.species.map((s: any) => [speciesKey(s.species, s.aspects), s]));
  // heldItem and bag[].item take different forms of the same item, so both
  // spellings are indexed and checked against the field that accepts them.
  // RCT resolves an item id through the registry either way, so a Cobblemon
  // item works both bare and namespaced - the live pack uses both spellings.
  // `write` is the pack's house style, not a requirement, so both are accepted
  // and only a genuinely unknown item is flagged.
  const itemForms = new Set<string>(dataset.items.flatMap((i: any) => [i.id, i.write]));
  const knownSpeciesIds = new Set<string>(dataset.species.map((s: any) => s.species));
  const megaPairs = new Set<string>(
    dataset.megaStones.flatMap((m: any) => m.species.map((s: string) => `${m.item.split(":").pop()}|${s}`))
  );
  const natures = new Set<string>(dataset.enums.natures);
  const teraTypes = new Set<string>(dataset.enums.teraTypes);
  const formats = new Set<string>(dataset.enums.battleFormats);
  const genders = new Set<string>(dataset.enums.genders);

  const findings: Finding[] = [];
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    if (!/^data\/rctmod\/trainers\/.*\.json$/.test(entry.entryName)) continue;
    const trainer = entry.entryName.split("/").pop()!.replace(/\.json$/, "");
    const add = (severity: Severity, message: string) => findings.push({ severity, trainer, message });

    let data: any;
    try {
      data = JSON.parse(entry.getData().toString());
    } catch (err) {
      add("bloqueante", `JSON inválido: ${(err as Error).message}`);
      continue;
    }

    if (data.battleFormat && !formats.has(data.battleFormat)) {
      add("bloqueante", `battleFormat desconocido "${data.battleFormat}"`);
    }
    const team: any[] = data.team ?? [];
    if (!team.length) add("bloqueante", "equipo vacío");
    if (/DOUBLES/i.test(data.battleFormat ?? "") && team.length < 2) {
      add("bloqueante", `combate de dobles con solo ${team.length} pokémon`);
    }
    const canTera = !!data.ai?.data?.canTera;
    const teamSpecies = new Set(team.map((m) => String(m.species ?? "").toLowerCase()));
    const teraTarget = data.ai?.data?.teraTarget;
    if (teraTarget && !teamSpecies.has(String(teraTarget).toLowerCase())) {
      add("bloqueante", `teraTarget "${teraTarget}" no está en el equipo`);
    }
    if (teraTarget && !canTera) add("aviso", `teraTarget definido pero canTera está apagado`);
    if ((data.bag ?? []).length && data.battleRules?.maxItemUses == null) {
      add("aviso", "tiene mochila pero no battleRules.maxItemUses, así que la IA no usará nada");
    }
    for (const b of data.bag ?? []) {
      if (!itemForms.has(String(b.item))) add("bloqueante", `bag: objeto desconocido "${b.item}"`);
      else if (!String(b.item).includes(":")) {
        // Unlike heldItem, every bag entry in the live pack is namespaced.
        add("aviso", `bag: "${b.item}" sin namespace; el pack siempre los escribe completos`);
      }
    }

    for (const m of team) {
      const species = String(m.species ?? "").toLowerCase();
      const where = `${species || "?"}`;
      let record = bySpecies.get(speciesKey(species, m.aspects));
      if (!record) {
        if (knownSpeciesIds.has(species)) {
          // The species is real but this aspect combination has no form record.
          // Not every aspect makes a form (shadow, battle styles and cosmetic
          // flags don't), so the game may well accept it - warn, don't block.
          add("aviso", `${where}: aspects ${JSON.stringify(m.aspects ?? [])} no corresponde a ninguna forma conocida`);
          record = bySpecies.get(speciesKey(species, []));
          if (!record) continue;
        } else {
          // A species id that doesn't exist at all. The usual cause is a
          // Showdown-style name like "indeedee-f"; point at the real form.
          const base = species.split("-")[0];
          const alt = dataset.species.find((s: any) => s.species === base && s.aspects?.length);
          const hint = alt ? ` — ¿querías species "${alt.species}" con aspects ${JSON.stringify(alt.aspects)}?` : "";
          add("bloqueante", `${where}: especie inexistente${hint}`);
          continue;
        }
      }
      const level = Number(m.level);
      if (!Number.isInteger(level) || level < 1 || level > 100) add("bloqueante", `${where}: nivel inválido "${m.level}"`);
      if (m.nature && !natures.has(String(m.nature).toLowerCase())) add("bloqueante", `${where}: naturaleza desconocida "${m.nature}"`);
      if (m.gender && !genders.has(String(m.gender))) add("bloqueante", `${where}: género desconocido "${m.gender}"`);
      if (m.ability) {
        const legal = [...record.abilities, ...record.hiddenAbilities];
        if (!legal.includes(String(m.ability).toLowerCase())) {
          add("aviso", `${where}: habilidad "${m.ability}" no es suya (tiene: ${legal.join(", ")})`);
        }
      }
      const moveset: string[] = m.moveset ?? [];
      if (moveset.length > 4) add("bloqueante", `${where}: ${moveset.length} movimientos, el máximo es 4`);
      if (!moveset.length) add("aviso", `${where}: sin movimientos`);
      for (const mv of moveset) {
        const id = String(mv).toLowerCase();
        if (!dataset.moves.includes(id)) add("bloqueante", `${where}: movimiento inexistente "${mv}"`);
        else if (!record.moves.includes(id)) add("aviso", `${where}: "${mv}" está fuera de su learnset`);
      }
      const held = String(Array.isArray(m.heldItem) ? m.heldItem[0] ?? "" : m.heldItem ?? "");
      if (held && !itemForms.has(held)) add("bloqueante", `${where}: objeto desconocido "${held}"`);
      for (const [stat, value] of Object.entries<any>(m.ivs ?? {})) {
        if (Number(value) < 0 || Number(value) > 31) add("bloqueante", `${where}: IV ${stat}=${value} fuera de 0-31`);
      }
      let evTotal = 0;
      for (const [stat, value] of Object.entries<any>(m.evs ?? {})) {
        evTotal += Number(value) || 0;
        if (Number(value) < 0 || Number(value) > 252) add("bloqueante", `${where}: EV ${stat}=${value} fuera de 0-252`);
      }
      if (evTotal > 510) add("aviso", `${where}: ${evTotal} EVs en total, el juego reparte como mucho 510`);

      const gimmicks = m.gimmicks ?? {};
      if (gimmicks.tera) {
        if (!teraTypes.has(String(gimmicks.tera))) add("bloqueante", `${where}: tipo tera desconocido "${gimmicks.tera}"`);
        if (!canTera) add("aviso", `${where}: declara tera pero el entrenador no tiene ai.data.canTera`);
      }
      // Stones are matched on the bare name so the check holds whichever
      // spelling the file used.
      const heldBare = held.split(":").pop() ?? "";
      if (gimmicks.mega && !megaPairs.has(`${heldBare}|${species}`)) {
        add("aviso", `${where}: gimmick mega pero sostiene "${held || "nada"}", que no es su piedra`);
      }
    }
  }
  return findings;
}

const zipArg = process.argv[2];
if (zipArg) {
  const findings = validateTrainerPack(resolve(zipArg));
  const blocking = findings.filter((f) => f.severity === "bloqueante");
  const warnings = findings.filter((f) => f.severity === "aviso");
  console.log(`\n== ${zipArg} ==`);
  for (const group of [blocking, warnings]) {
    for (const f of group) console.log(`  [${f.severity}] ${f.trainer}: ${f.message}`);
  }
  console.log(`\n${blocking.length} bloqueantes, ${warnings.length} avisos.`);
  if (blocking.length) {
    console.log("Los bloqueantes fallan en silencio dentro del juego. Corrígelos antes de subir el pack.");
    process.exit(1);
  }
  console.log("Sin bloqueantes: el pack se puede subir.");
} else {
  console.log('Uso: npm run validate-trainers -- "<ruta al .zip>"');
  process.exit(2);
}
