import { useEffect, useMemo, useState } from "preact/hooks";

interface Ability {
  id: string;
  name: string;
  desc: string | null;
  shortDesc: string | null;
  isOverride: boolean;
  immuneTo: string[];
  grantedTo?: { slug: string; name: string; hidden: boolean }[];
}

export default function AbilityTable() {
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [query, setQuery] = useState("");
  const [immuneFilter, setImmuneFilter] = useState("");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  useEffect(() => {
    fetch("/abilities-index.json")
      .then((r) => r.json())
      .then(setAbilities)
      .catch(() => {});
  }, []);

  const types = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return abilities.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q) && !(a.desc || a.shortDesc || "").toLowerCase().includes(q)) return false;
      if (immuneFilter && !a.immuneTo?.includes(immuneFilter)) return false;
      if (onlyOverrides && !a.isOverride) return false;
      return true;
    });
  }, [abilities, query, immuneFilter, onlyOverrides]);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
        <input
          class="search-box"
          style={{ flex: "1 1 240px" }}
          type="search"
          placeholder="Buscar por nombre o descripción..."
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <select class="search-box" style={{ flex: "0 1 200px" }} value={immuneFilter} onChange={(e) => setImmuneFilter((e.target as HTMLSelectElement).value)}>
          <option value="">Cualquier inmunidad</option>
          {types.map((t) => <option value={t}>Inmune a {t}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={onlyOverrides} onChange={(e) => setOnlyOverrides((e.target as HTMLInputElement).checked)} />
          Solo modificadas
        </label>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{filtered.length} resultados</p>
      <table>
        <thead>
          <tr><th>Nombre</th><th>Descripción</th><th>Inmunidad</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, 500).map((a) => (
            <tr>
              <td><a href={`/abilities/${a.id}`}>{a.name}</a></td>
              <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{a.desc || a.shortDesc || "—"}</td>
              <td>
                {a.immuneTo?.[0] === "*" && <span class="pill override">salvo supereficaces</span>}
                {a.immuneTo?.length > 0 && a.immuneTo[0] !== "*" && a.immuneTo.map((t) => (
                  <a href={`/type/${t}`} class="type-badge" style={{ background: `var(--type-${t})`, marginRight: "0.2rem" }}>{t}</a>
                ))}
              </td>
              <td>{a.isOverride && <span class="pill override">modificada</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 500 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Mostrando las primeras 500 de {filtered.length}. Refina la búsqueda.</p>}
    </div>
  );
}
