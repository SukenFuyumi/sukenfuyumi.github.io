import { useEffect, useMemo, useState } from "preact/hooks";

interface Move {
  id: string;
  name: string;
  type: string | null;
  category: string | null;
  basePower: number | null;
  accuracy: number | boolean | null;
  pp: number | null;
  isOverride: boolean;
}

export default function MoveTable() {
  const [moves, setMoves] = useState<Move[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  useEffect(() => {
    fetch("/moves-index.json")
      .then((r) => r.json())
      .then(setMoves)
      .catch(() => {});
  }, []);

  const types = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moves.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (typeFilter && m.type?.toLowerCase() !== typeFilter) return false;
      if (onlyOverrides && !m.isOverride) return false;
      return true;
    });
  }, [moves, query, typeFilter, onlyOverrides]);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
        <input class="search-box" style={{ flex: "1 1 220px" }} type="search" placeholder="Buscar movimiento..." value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <select class="search-box" style={{ flex: "0 1 160px" }} value={typeFilter} onChange={(e) => setTypeFilter((e.target as HTMLSelectElement).value)}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option value={t}>{t}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={onlyOverrides} onChange={(e) => setOnlyOverrides((e.target as HTMLInputElement).checked)} />
          Solo rebalanceados
        </label>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{filtered.length} resultados</p>
      <table>
        <thead>
          <tr><th>Nombre</th><th>Tipo</th><th>Cat.</th><th>Poder</th><th>Prec.</th><th>PP</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, 500).map((m) => (
            <tr>
              <td><a href={`/moves/${m.id}`}>{m.name}</a></td>
              <td>{m.type && <a href={`/type/${m.type.toLowerCase()}`} class="type-badge" style={{ background: `var(--type-${m.type.toLowerCase()})` }}>{m.type}</a>}</td>
              <td>{m.category}</td>
              <td>{m.basePower || "—"}</td>
              <td>{m.accuracy === true ? "—" : m.accuracy}</td>
              <td>{m.pp ?? "—"}</td>
              <td>{m.isOverride && <span class="pill override">rebalanceado</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 500 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Mostrando los primeros 500 de {filtered.length}. Refina la búsqueda.</p>}
    </div>
  );
}
