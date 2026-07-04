import { typeColor } from "./typeColors.js";

export interface SpeciesImage {
  kind: "sprite" | "render" | "texture" | "placeholder";
  url: string | null;
  placeholderColor?: string;
  placeholderLabel?: string;
}

// Official artwork mirror commonly used by fan/community Pokedex projects,
// keyed by national dex number. Only valid for genuinely official Pokemon.
const OFFICIAL_ARTWORK_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";

export function officialArtworkUrl(nationalPokedexNumber: number | null): string | null {
  if (nationalPokedexNumber && nationalPokedexNumber >= 1 && nationalPokedexNumber <= 1025) {
    return `${OFFICIAL_ARTWORK_BASE}/${nationalPokedexNumber}.png`;
  }
  return null;
}

export function placeholderImage(name: string, primaryType: string): SpeciesImage {
  return {
    kind: "placeholder",
    url: null,
    placeholderColor: typeColor(primaryType),
    placeholderLabel: name
      .split(/[\s-]+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase(),
  };
}
