import AdmZip from "adm-zip";
import { evalCommonJs } from "./jsData.js";
import type { ZipHandle } from "./zipUtil.js";
import { readBuffer } from "./zipUtil.js";

export interface ShowdownBaseData {
  moves: Record<string, any>;
  abilities: Record<string, any>;
  typechart: Record<string, any>;
}

/**
 * Cobblemon core embeds a full Pokemon Showdown data bundle at
 * data/cobblemon/showdown.zip (base moves, abilities, type chart). This is
 * the canonical fallback for battle data before any mod-specific overrides.
 */
export function extractShowdownBase(coreHandle: ZipHandle): ShowdownBaseData {
  const buf = readBuffer(coreHandle, "data/cobblemon/showdown.zip");
  if (!buf) {
    console.warn("[showdown] could not find embedded showdown.zip in Cobblemon core jar");
    return { moves: {}, abilities: {}, typechart: {} };
  }
  const inner = new AdmZip(buf);

  const readModule = (path: string, exportKey: string): Record<string, any> => {
    const entry = inner.getEntry(path);
    if (!entry) return {};
    const code = entry.getData().toString("utf-8");
    try {
      const mod = evalCommonJs(code);
      return mod?.[exportKey] ?? {};
    } catch (err) {
      console.warn(`[showdown] failed to evaluate ${path}:`, (err as Error).message);
      return {};
    }
  };

  return {
    moves: readModule("data/moves.js", "Moves"),
    abilities: readModule("data/abilities.js", "Abilities"),
    typechart: readModule("data/typechart.js", "TypeChart"),
  };
}
