import { useEffect, useMemo, useState } from "preact/hooks";

/**
 * A type-filterable Pokémon grid for the home page. Pick one type to list every
 * Pokémon with it, or two to narrow to those that carry *both* - the natural way
 * to find a specific dual type (Water + Flying -> Gyarados).
 *
 * The list (~2300 entries) is fetched once from the static pokedex-sidebar.json
 * the sidebar already ships, so it isn't embedded in the home page's HTML.
 */

interface Mon {
  slug: string;
  name: string;
  dex: number | null;
  types: string[];
  image: any;
}

const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

function MonArt({ image, name }: { image: any; name: string }) {
  if (!image) return null;
  if (image.kind === "sprite" || image.kind === "render") {
    return <img src={image.url ?? ""} alt={name} loading="lazy" />;
  }
  if (image.kind === "texture") {
    return (
      <div class="texture-frame" style={{ background: image.placeholderColor ?? "#e9ecf1" }}>
        <img src={image.url ?? ""} alt={name} loading="lazy" />
      </div>
    );
  }
  return (
    <div class="placeholder" style={{ background: image.placeholderColor }}>
      {image.placeholderLabel}
    </div>
  );
}

export default function TypeFilterGrid() {
  const [mons, setMons] = useState<Mon[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    fetch("/pokedex-sidebar.json")
      .then((r) => r.json())
      .then(setMons)
      .catch(() => setMons([]));
  }, []);

  const toggle = (t: string) => {
    setSelected((cur) => {
      if (cur.includes(t)) return cur.filter((x) => x !== t);
      // At most two: a third pick replaces the oldest so the chips never lock up.
      if (cur.length >= 2) return [cur[1], t];
      return [...cur, t];
    });
  };

  const filtered = useMemo(() => {
    if (!mons || selected.length === 0) return [];
    // One type: has it. Two: has both (the mon's own typing may list them in
    // either order, so check each selected type is present).
    return mons.filter((m) => selected.every((t) => m.types.includes(t)));
  }, [mons, selected]);

  return (
    <div>
      <div class="tf-chips">
        {TYPES.map((t) => (
          <button
            type="button"
            class={`type-badge tf-chip${selected.includes(t) ? " on" : ""}`}
            style={{ background: `var(--type-${t})` }}
            aria-pressed={selected.includes(t)}
            onClick={() => toggle(t)}
          >
            {t}
          </button>
        ))}
        {selected.length > 0 && (
          <button type="button" class="tf-clear" onClick={() => setSelected([])}>
            Limpiar
          </button>
        )}
      </div>

      {selected.length === 0 ? (
        <p class="tf-hint">Elige uno o dos tipos para ver los Pokémon que los tienen.</p>
      ) : (
        <>
          <h3 class="tf-count">
            {selected.length === 2 ? (
              <>Pokémon de tipo {selected[0]} y {selected[1]}</>
            ) : (
              <>Pokémon de tipo {selected[0]}</>
            )}{" "}
            <span class="tf-dim">({filtered.length})</span>
          </h3>
          {mons === null ? (
            <p class="tf-hint">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p class="tf-hint">Ningún Pokémon del servidor combina esos dos tipos.</p>
          ) : (
            <div class="grid">
              {filtered.map((m) => (
                <a class="mon-card" href={`/pokedex/${m.slug}`}>
                  <MonArt image={m.image} name={m.name} />
                  <div class="dex-num">{m.dex ? `#${m.dex}` : ""}</div>
                  <div class="mon-name">{m.name}</div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
