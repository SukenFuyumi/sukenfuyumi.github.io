import { useMemo, useState, useEffect } from "preact/hooks";

interface MonListing {
  slug: string;
  name: string;
  nationalPokedexNumber: number | null;
  types: string[];
  abilities: string[];
  baseStatTotal: number;
  image: { kind: string; url: string | null; placeholderColor?: string; placeholderLabel?: string };
  sourceMods: string[];
  primarySource: string;
  labels: string[];
}

interface SourceInfo {
  id: string;
  label: string;
}

interface SearchIndexEntry {
  moves: string[];
  abilities: string[];
  hiddenAbilities: string[];
}

type SortKey = "num" | "name" | "bst";

export default function PokedexTable({ sources }: { sources: SourceInfo[] }) {
  const [pokemon, setPokemon] = useState<MonListing[]>([]);
  const [searchIndex, setSearchIndex] = useState<Record<string, SearchIndexEntry>>({});
  const [moveNames, setMoveNames] = useState<Map<string, string>>(new Map());
  const [abilityNames, setAbilityNames] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("num");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Fetched as a static asset rather than an Astro prop - embedding the full
  // ~2300-entry listing directly in this page's HTML was ballooning it to
  // nearly 2MB (same issue already fixed for the sidebar).
  useEffect(() => {
    fetch("/pokedex-index.json")
      .then((r) => r.json())
      .then(setPokemon)
      .catch(() => {});
  }, []);

  // Lets the search box also match a move/ability name (e.g. "Levitate" or
  // "Thunderbolt") and filter down to whoever learns/has it. Indexed per
  // species (moves a species knows) rather than per move (species that know
  // a move) - a single common move can have thousands of learners, but any
  // one species only knows ~80 moves, so this stays a small fetch.
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q);
  }, []);

  const sourceLabel = useMemo(() => {
    const map = new Map(sources.map((s) => [s.id, s.label]));
    return (id: string) => map.get(id) ?? id;
  }, [sources]);

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
    let rows = pokemon.filter((p) => {
      if (!q) return true;
      if (p.name.toLowerCase().includes(q)) return true;
      const entry = searchIndex[p.slug];
      if (entry) {
        if (matchingMoveIds?.size && entry.moves.some((m) => matchingMoveIds.has(m))) return true;
        if (matchingAbilityIds?.size && [...entry.abilities, ...entry.hiddenAbilities].some((a) => matchingAbilityIds.has(a))) return true;
      }
      return false;
    });
    rows = rows.filter((p) => {
      if (typeFilter && !p.types.includes(typeFilter)) return false;
      // A mega/fusion/etc form's *primarySource* is whoever defined the base
      // species file (e.g. "cobblemon-core" for Jynx), not the mod that
      // patched in the form itself (e.g. "lotus-megas" for Jynx Mega) - that
      // mod only shows up in sourceMods, so filter against that instead or
      // the "Origen" dropdown would show 0 results for any forms-only pack.
      if (sourceFilter && !p.sourceMods.includes(sourceFilter)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "num") cmp = (a.nationalPokedexNumber ?? 99999) - (b.nationalPokedexNumber ?? 99999);
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.baseStatTotal - b.baseStatTotal;
      return cmp * sortDir;
    });
    return rows;
  }, [pokemon, query, typeFilter, sourceFilter, sortKey, sortDir, searchIndex, matchingMoveIds, matchingAbilityIds]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const types = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
        <input
          class="search-box"
          style={{ flex: "1 1 240px" }}
          type="search"
          placeholder="Buscar por nombre, movimiento o habilidad..."
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <select class="search-box" style={{ flex: "0 1 160px" }} value={typeFilter} onChange={(e) => setTypeFilter((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option value={t}>{t}</option>
          ))}
        </select>
        <select class="search-box" style={{ flex: "0 1 220px" }} value={sourceFilter} onChange={(e) => setSourceFilter((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los mods</option>
          {sources.map((s) => (
            <option value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{filtered.length} resultados</p>
      <table>
        <thead>
          <tr>
            <th onClick={() => toggleSort("num")} style={{ cursor: "pointer" }}>#</th>
            <th></th>
            <th onClick={() => toggleSort("name")} style={{ cursor: "pointer" }}>Nombre</th>
            <th>Tipo</th>
            <th onClick={() => toggleSort("bst")} style={{ cursor: "pointer" }}>Total</th>
            <th>Habilidades</th>
            <th>Origen</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 400).map((p) => (
            <tr>
              <td>{p.nationalPokedexNumber ?? "—"}</td>
              <td>
                {(p.image.kind === "sprite" || p.image.kind === "render") && <img src={p.image.url ?? ""} alt="" width={32} height={32} loading="lazy" />}
                {p.image.kind === "texture" && (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: p.image.placeholderColor, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={p.image.url ?? ""} alt="" style={{ maxWidth: "85%", maxHeight: "85%", imageRendering: "pixelated" }} loading="lazy" />
                  </div>
                )}
                {p.image.kind === "placeholder" && (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: p.image.placeholderColor, color: "#fff", fontSize: "0.6rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.image.placeholderLabel}
                  </div>
                )}
              </td>
              <td><a href={`/pokedex/${p.slug}`}>{p.name}</a></td>
              <td>
                {p.types.map((t) => (
                  <a href={`/type/${t}`} class="type-badge" style={{ background: `var(--type-${t})`, marginRight: "0.25rem" }}>{t}</a>
                ))}
              </td>
              <td>{p.baseStatTotal}</td>
              <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{p.abilities.join(", ")}</td>
              <td><span class="pill">{sourceLabel(p.primarySource)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 400 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Mostrando los primeros 400 de {filtered.length}. Refina la búsqueda para ver más.
        </p>
      )}
    </div>
  );
}
