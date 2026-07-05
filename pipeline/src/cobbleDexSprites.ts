import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Matches CobbleDex's own PokemonSpriteAtlas.SpriteKey.id format exactly
// (see PokemonSpriteAtlas.kt in the cobbledex-research checkout) so files
// exported in-game via `/cobbledex sprites export` can be looked up here
// without any coupling beyond this naming convention.
function normalizeSpecies(species: string): string {
  return species.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeAspects(aspects: string[]): string[] {
  return aspects
    .map((a) => a.toLowerCase().replace(/[^a-z0-9_=.-]/g, ""))
    .filter((a) => a.length > 0)
    .sort();
}

function spriteKeyId(species: string, aspects: string[]): string {
  const normalizedAspects = normalizeAspects(aspects);
  const base = normalizeSpecies(species);
  return normalizedAspects.length > 0 ? `${base}__${normalizedAspects.join("_")}` : base;
}

export class CobbleDexSpriteSource {
  private readonly dir: string | null;
  private missCount = 0;
  private hitCount = 0;

  constructor(dir: string | undefined) {
    this.dir = dir && existsSync(dir) ? dir : null;
    if (dir && !this.dir) {
      console.warn(`spriteExportDir is set (${dir}) but the folder doesn't exist - falling back to the built-in renderer for every species.`);
    }
  }

  get available(): boolean {
    return this.dir !== null;
  }

  read(species: string, aspects: string[]): Buffer | null {
    if (!this.dir) return null;
    const path = resolve(this.dir, `${spriteKeyId(species, aspects)}.png`);
    if (!existsSync(path)) {
      this.missCount++;
      return null;
    }
    this.hitCount++;
    return readFileSync(path);
  }

  get stats(): { hits: number; misses: number } {
    return { hits: this.hitCount, misses: this.missCount };
  }
}
