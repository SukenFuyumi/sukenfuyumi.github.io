import { useEffect, useMemo, useRef, useState } from "preact/hooks";

interface MonListing {
  slug: string;
  name: string;
  types: string[];
  image: { kind: string; url: string | null; placeholderColor?: string; placeholderLabel?: string };
}

const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

// Every detail page is a full static-site navigation (fresh page load), so
// without persisting state here the sidebar would snap back to the top and
// forget the search/filter every time a player clicks a Pokemon - especially
// annoying for one further down a long filtered list. sessionStorage survives
// across those navigations for the current browsing session.
const STORAGE_KEY = "pdx-sidebar-state";

function loadState(): { query: string; typeFilters: string[]; scrollTop: number } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate from the old single-string typeFilter shape.
      const typeFilters = Array.isArray(parsed.typeFilters)
        ? parsed.typeFilters
        : parsed.typeFilter
        ? [parsed.typeFilter]
        : [];
      return { query: parsed.query ?? "", typeFilters, scrollTop: parsed.scrollTop ?? 0 };
    }
  } catch {
    // ignore
  }
  return { query: "", typeFilters: [], scrollTop: 0 };
}

const MAX_TYPE_FILTERS = 2;

interface SearchIndexEntry {
  moves: string[];
  abilities: string[];
  hiddenAbilities: string[];
}

export default function PokedexSidebar({ currentSlug }: { currentSlug?: string }) {
  const [pokemon, setPokemon] = useState<MonListing[]>([]);
  const [searchIndex, setSearchIndex] = useState<Record<string, SearchIndexEntry>>({});
  const [moveNames, setMoveNames] = useState<Map<string, string>>(new Map());
  const [abilityNames, setAbilityNames] = useState<Map<string, string>>(new Map());
  const initial = useRef(loadState());
  const [query, setQuery] = useState(initial.current.query);
  const [typeFilters, setTypeFilters] = useState<string[]>(initial.current.typeFilters);
  const listRef = useRef<HTMLDivElement>(null);

  function toggleType(t: string) {
    setTypeFilters((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_TYPE_FILTERS) return [...prev.slice(1), t];
      return [...prev, t];
    });
  }

  // Fetched once as a plain cacheable static asset rather than embedded as a
  // page prop - otherwise this ~2300-entry list would get re-serialized into
  // every single detail page's HTML (ballooning each page to ~1MB).
  useEffect(() => {
    fetch("/pokedex-sidebar.json")
      .then((r) => r.json())
      .then(setPokemon)
      .catch(() => {});
  }, []);

  // Lets the sidebar search also match a move/ability name - see the matching
  // fetches/comment in PokedexTable.tsx for why this is indexed per-species
  // rather than per-move/ability.
  useEffect(() => {
    fetch("/pokedex-search-index.json").then((r) => r.json()).then(setSearchIndex).catch(() => {});
    fetch("/moves-index.json")
      .then((r) => r.json())
      .then((moves: { id: string; name: string }[]) => setMoveNames(new Map(moves.map((m) => [m.id, m.name.toLowerCase()]))))
      .catch(() => {});
    fetch("/abilities-index.json")
      .then((r) => r.json())
      .then((abilities: { id: string; name: string }[]) => setAbilityNames(new Map(abilities.map((a) => [a.id, a.name.toLowerCase()]))))
      .catch(() => {});
  }, []);

  // Restore scroll position once the list has actually rendered.
  useEffect(() => {
    if (pokemon.length > 0 && listRef.current) {
      listRef.current.scrollTop = initial.current.scrollTop;
    }
  }, [pokemon.length > 0]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ query, typeFilters, scrollTop: listRef.current?.scrollTop ?? 0 }));
  }, [query, typeFilters]);

  function persistScroll() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ query, typeFilters, scrollTop: listRef.current?.scrollTop ?? 0 }));
  }

  const matchingMoveIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set<string>();
    for (const [id, name] of moveNames) if (name.includes(q)) ids.add(id);
    return ids;
  }, [query, moveNames]);
  const matchingAbilityIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set<string>();
    for (const [id, name] of abilityNames) if (name.includes(q)) ids.add(id);
    return ids;
  }, [query, abilityNames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pokemon.filter((p) => {
      if (q) {
        let matches = p.name.toLowerCase().includes(q);
        if (!matches) {
          const entry = searchIndex[p.slug];
          if (entry) {
            if (matchingMoveIds?.size && entry.moves.some((m) => matchingMoveIds.has(m))) matches = true;
            else if (matchingAbilityIds?.size && [...entry.abilities, ...entry.hiddenAbilities].some((a) => matchingAbilityIds.has(a))) matches = true;
          }
        }
        if (!matches) return false;
      }
      if (typeFilters.length > 0 && !typeFilters.every((t) => p.types.includes(t))) return false;
      return true;
    });
  }, [pokemon, query, typeFilters, searchIndex, matchingMoveIds, matchingAbilityIds]);

  return (
    <div class="pdx-sidebar">
      <input
        class="search-box pdx-sidebar-search"
        type="search"
        placeholder="Buscar..."
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="pdx-sidebar-types">
        {TYPES.map((t) => (
          <button
            type="button"
            class={`pdx-type-chip ${typeFilters.includes(t) ? "active" : ""}`}
            style={{ background: `var(--type-${t})` }}
            onClick={() => toggleType(t)}
          >
            {t.slice(0, 3)}
          </button>
        ))}
      </div>
      <div class="pdx-sidebar-count">{pokemon.length === 0 ? "Cargando..." : `${filtered.length} entradas`}</div>
      <div class="pdx-sidebar-list" ref={listRef} onScroll={persistScroll}>
        {filtered.slice(0, 400).map((p) => (
          <a
            href={`/pokedex/${p.slug}`}
            class={`pdx-sidebar-item ${p.slug === currentSlug ? "active" : ""}`}
            onClick={persistScroll}
          >
            {p.image.kind === "placeholder" ? (
              <span class="pdx-sidebar-thumb" style={{ background: p.image.placeholderColor }} />
            ) : (
              <img class="pdx-sidebar-thumb" src={p.image.url ?? ""} alt="" loading="lazy" />
            )}
            <span class="pdx-sidebar-name">{p.name}</span>
            <span class="pdx-sidebar-item-types">
              {p.types.map((t) => (
                <span class="pdx-type-chip small" style={{ background: `var(--type-${t})` }}>
                  {t.slice(0, 3)}
                </span>
              ))}
            </span>
          </a>
        ))}
        {filtered.length > 400 && <p class="pdx-sidebar-more">Refina la búsqueda para ver más de {filtered.length}.</p>}
      </div>
    </div>
  );
}
