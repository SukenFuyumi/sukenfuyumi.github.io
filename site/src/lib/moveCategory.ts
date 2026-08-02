/**
 * The damage category as the site shows it: the English key stays as the
 * `data-cat` hook that picks the badge's colour and glyph in CSS, and only the
 * visible label is translated. Shared so the four places that render it (the
 * move list, a move's page, a Pokémon's moveset and the trainer panel) can't
 * drift apart.
 */
const LABELS: Record<string, string> = {
  physical: "Físico",
  special: "Especial",
  status: "Estado",
};

export function categoryKey(category: string | null | undefined): string | null {
  return category ? String(category).toLowerCase() : null;
}

export function categoryLabel(category: string | null | undefined): string {
  const key = categoryKey(category);
  return (key && LABELS[key]) ?? category ?? "";
}
