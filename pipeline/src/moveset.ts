import type { MoveRecord } from "./types.js";

// Lightweight reference only (moveId [+level]) - the site joins against the
// shared moves.json at render time instead of duplicating full move data
// across every one of the ~1500 per-species files.
export interface MovesetEntry {
  moveId: string;
  level?: number;
}

export interface Moveset {
  levelUp: MovesetEntry[];
  egg: MovesetEntry[];
  tm: MovesetEntry[];
  tutor: MovesetEntry[];
  legacy: MovesetEntry[];
  other: MovesetEntry[];
}

export function buildMoveset(movesRaw: string[], moveLookup: Map<string, MoveRecord>): Moveset {
  const moveset: Moveset = { levelUp: [], egg: [], tm: [], tutor: [], legacy: [], other: [] };

  for (const raw of movesRaw ?? []) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const prefix = raw.slice(0, idx);
    let moveId = raw.slice(idx + 1).toLowerCase();
    // Showdown move ids are always alphanumeric with no separators, but a few
    // mods write their move references with underscores (e.g. "breaking_swipe"
    // for "breakingswipe") - safe to normalize since a Showdown id can never
    // collide with itself once underscores are stripped.
    if (!moveLookup.has(moveId) && moveId.includes("_") && moveLookup.has(moveId.replace(/_/g, ""))) {
      moveId = moveId.replace(/_/g, "");
    }

    if (/^\d+$/.test(prefix)) {
      moveset.levelUp.push({ moveId, level: Number(prefix) });
    } else if (prefix === "egg") {
      moveset.egg.push({ moveId });
    } else if (prefix === "tm" || prefix === "tr") {
      moveset.tm.push({ moveId });
    } else if (prefix === "tutor") {
      moveset.tutor.push({ moveId });
    } else if (prefix === "legacy") {
      moveset.legacy.push({ moveId });
    } else {
      moveset.other.push({ moveId });
    }
  }

  moveset.levelUp.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const alphaSort = (a: MovesetEntry, b: MovesetEntry) => {
    const nameA = moveLookup.get(a.moveId)?.name ?? a.moveId;
    const nameB = moveLookup.get(b.moveId)?.name ?? b.moveId;
    return nameA.localeCompare(nameB);
  };
  moveset.egg.sort(alphaSort);
  moveset.tm.sort(alphaSort);
  moveset.tutor.sort(alphaSort);
  moveset.legacy.sort(alphaSort);
  moveset.other.sort(alphaSort);

  return moveset;
}
