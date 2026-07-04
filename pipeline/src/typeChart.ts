// Showdown's typechart.js damageTaken codes, from the defending type's perspective:
// 0 = normal (1x), 1 = super effective against this type (2x), 2 = resisted (0.5x), 3 = immune (0x)
const CODE_TO_MULTIPLIER: Record<number, number> = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

export interface TypeMatchup {
  weakTo: { type: string; multiplier: number }[];
  resists: { type: string; multiplier: number }[];
  immuneTo: string[];
}

function titleCase(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

/** attacker -> defender -> multiplier, for the classic type effectiveness chart page. */
export function buildTypeMatrix(typechart: Record<string, any>): Record<string, Record<string, number>> {
  const types = Object.keys(typechart);
  const matrix: Record<string, Record<string, number>> = {};
  for (const attacker of types) {
    matrix[attacker] = {};
    for (const defender of types) {
      const entry = typechart[defender];
      const code = entry?.damageTaken?.[titleCase(attacker)];
      matrix[attacker][defender] = CODE_TO_MULTIPLIER[code] ?? 1;
    }
  }
  return matrix;
}

export function computeMatchup(
  typechart: Record<string, any>,
  primaryType: string,
  secondaryType: string | null
): TypeMatchup {
  const allTypes = Object.keys(typechart);
  const weakTo: { type: string; multiplier: number }[] = [];
  const resists: { type: string; multiplier: number }[] = [];
  const immuneTo: string[] = [];

  for (const attackingType of allTypes) {
    let multiplier = 1;
    for (const defType of [primaryType, secondaryType]) {
      if (!defType) continue;
      // Showdown's TypeChart keys the outer object by lowercase type name,
      // but the inner damageTaken map by Title Case attacking-type name.
      const entry = typechart[defType.toLowerCase()];
      const code = entry?.damageTaken?.[titleCase(attackingType)];
      if (code == null) continue;
      multiplier *= CODE_TO_MULTIPLIER[code] ?? 1;
    }
    const typeLower = attackingType.toLowerCase();
    if (multiplier === 0) immuneTo.push(typeLower);
    else if (multiplier > 1) weakTo.push({ type: typeLower, multiplier });
    else if (multiplier < 1) resists.push({ type: typeLower, multiplier });
  }

  weakTo.sort((a, b) => b.multiplier - a.multiplier);
  resists.sort((a, b) => a.multiplier - b.multiplier);
  return { weakTo, resists, immuneTo };
}
