import { useEffect, useMemo, useState } from "preact/hooks";
import { readZipEntries, rebuildZip } from "../lib/zip";

/**
 * Live editor for the server's RCT trainer teams.
 *
 * Everything happens in the browser: it loads each trainer's ORIGINAL RCT json,
 * lets you edit the team and the battle bag, keeps a draft in localStorage, and
 * exports a complete datapack zip by rebuilding /trainer-pack.zip with only the
 * edited trainer files replaced (see lib/zip.ts). Nothing is written to the
 * server or the site - the export is a normal file download.
 *
 * The passphrase only hides the tool from casual visitors: this is a static
 * site, so the check runs client-side and is bypassable by anyone reading the
 * source. That's acceptable because the editor can't modify anything remote,
 * and the data it shows is already public on /progresion.
 */

const PASS_KEY = "cobbledex-editor-ok";
const DRAFT_KEY = "cobbledex-trainer-drafts";
/** Not a secret, just a latch - see the component doc. */
const PASSPHRASE = "cobbleverse";

const NATURES = [
  "adamant", "bashful", "bold", "brave", "calm", "careful", "docile", "gentle", "hardy", "hasty",
  "impish", "jolly", "lax", "lonely", "mild", "modest", "naive", "naughty", "quiet", "quirky",
  "rash", "relaxed", "sassy", "serious", "timid",
];
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const STAT_LABELS: Record<string, string> = { hp: "HP", atk: "ATK", def: "DEF", spa: "SPA", spd: "SPD", spe: "SPE" };

interface TrainerRef {
  id: string; slug: string; name: string; role: string; roleKey: string;
  seriesId: string | null; seriesLabel: string | null; seriesRank: number; step: number; levelCap: number | null;
}
interface Pick { id: string; slug?: string; name: string; aspects?: string[]; img?: string; color?: string }
/** slug -> what that Pokémon can learn, from pokedex-search-index.json. */
interface Learnset { moves: string[]; abilities: string[]; hiddenAbilities: string[] }
interface ItemPick { id: string; bare: string; ns: string; name: string }

/**
 * The species entry whose sprite belongs to this team slot. A species id can
 * appear several times (base plus one row per form), so an exact aspect match
 * wins and the plain base entry is the fallback.
 */
function findSpecies(options: Pick[], species: string | null, aspects?: string[]): Pick | undefined {
  if (!species) return undefined;
  const mine = options.filter((o) => o.id === species);
  if (!mine.length) return undefined;
  const want = (aspects ?? []).map((a) => a.toLowerCase()).sort().join(",");
  return (
    mine.find((o) => (o.aspects ?? []).map((a) => a.toLowerCase()).sort().join(",") === want) ??
    mine.find((o) => !o.aspects?.length) ??
    mine[0]
  );
}

function SpeciesThumb({ opt, size = 22 }: { opt?: Pick; size?: number }) {
  if (!opt?.img) {
    return <span class="ed-thumb ed-thumb-empty" style={{ width: `${size}px`, height: `${size}px`, background: opt?.color ?? "var(--subtle-bg)" }} />;
  }
  // Loaded eagerly on purpose: these are the visual confirmation that the right
  // Pokemon is selected, and lazy-loading left them blank until something
  // nudged a repaint. The counts are tiny either way - six on the team cards,
  // and the picker caps its list at 60 rows of 22px thumbs.
  return <img class="ed-thumb" src={opt.img} alt="" width={size} height={size} />;
}

/** Combo box: free-text filter over a big list, writes back the chosen id. */
function Picker({
  value, options, onChange, placeholder, allowEmpty, current: currentOverride, withThumbs,
  pickerId, openId, setOpenId, allOptions, restrictedLabel,
}: {
  value: string | null;
  options: Pick[];
  onChange: (id: string, opt?: Pick) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  /** Species need the aspect-aware match, not just the first id hit. */
  current?: Pick;
  withThumbs?: boolean;
  /**
   * The unrestricted list, when `options` has been narrowed to what a species
   * legally learns. Kept available behind a toggle because datapacks do hand
   * out moves outside the learnset, and the current value must stay resolvable
   * even when it isn't legal.
   */
  allOptions?: Pick[];
  restrictedLabel?: string;
  /**
   * Which picker is open is held by the parent: with per-picker state every
   * dropdown stayed open at once and they piled on top of each other.
   */
  pickerId: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const open = openId === pickerId;
  const setOpen = (v: boolean) => setOpenId(v ? pickerId : null);
  const pool = showAll && allOptions ? allOptions : options;
  // Resolved against the full list so an out-of-learnset value still shows its
  // proper name instead of a bare id.
  const current = currentOverride ?? (allOptions ?? options).find((o) => o.id === value);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pool.slice(0, 60);
    return pool.filter((o) => o.name.toLowerCase().includes(needle) || o.id.includes(needle)).slice(0, 60);
  }, [q, pool]);

  return (
    <div class="ed-picker">
      <button type="button" class="ed-picker-btn" onClick={() => { setOpen(!open); setQ(""); }}>
        {withThumbs && <SpeciesThumb opt={current} />}
        <span class="ed-picker-label">{current?.name ?? (value || placeholder || "— elegir —")}</span>
      </button>
      {open && (
        <div class="ed-picker-pop">
          <input
            class="ed-input"
            autoFocus
            placeholder="Buscar…"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
          <div class="ed-picker-list">
            {allowEmpty && (
              <button type="button" class="ed-picker-item" onClick={() => { onChange(""); setOpen(false); }}>
                <em>(ninguno)</em>
              </button>
            )}
            {matches.map((o) => (
              <button
                type="button"
                class="ed-picker-item"
                onClick={() => { onChange(o.id, o); setOpen(false); }}
              >
                {withThumbs && <SpeciesThumb opt={o} />}
                <span class="ed-picker-label">
                  {o.name} <span class="ed-dim">{o.id}{o.aspects?.length ? ` · ${o.aspects.join(",")}` : ""}</span>
                </span>
              </button>
            ))}
            {matches.length === 0 && <div class="ed-dim" style={{ padding: "0.4rem" }}>Sin resultados</div>}
          </div>
          {allOptions && (
            <label class="ed-picker-toggle">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll((e.target as HTMLInputElement).checked)} />
              {showAll
                ? `Mostrando los ${allOptions.length}`
                : `Solo ${restrictedLabel ?? "los que aprende"} (${options.length})`}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainerEditor() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [refs, setRefs] = useState<TrainerRef[]>([]);
  const [species, setSpecies] = useState<Pick[]>([]);
  const [moves, setMoves] = useState<Pick[]>([]);
  const [abilities, setAbilities] = useState<Pick[]>([]);
  const [items, setItems] = useState<ItemPick[]>([]);
  const [learnsets, setLearnsets] = useState<Record<string, Learnset> | null>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Clicking anywhere outside the open dropdown dismisses it, so it never
  // lingers over the fields underneath.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ed-picker")) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  useEffect(() => {
    if (sessionStorage.getItem(PASS_KEY) === "1") setUnlocked(true);
    try {
      setDrafts(JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"));
    } catch { /* corrupt draft store - start clean */ }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    Promise.all([
      fetch("/trainer-ids.json").then((r) => r.json()),
      fetch("/trainer-species-index.json").then((r) => r.json()),
      fetch("/moves-index.json").then((r) => r.json()),
      fetch("/abilities-index.json").then((r) => r.json()),
      fetch("/items-index.json").then((r) => r.json()),
    ]).then(([t, s, m, a, i]) => {
      setRefs(t);
      setSpecies(s);
      setMoves(m.map((x: any) => ({ id: x.id, name: x.name })));
      setAbilities(a.map((x: any) => ({ id: x.id, name: x.name })));
      setItems(i);
    }).catch(() => setStatus("No se pudieron cargar los datos base."));
    // Learnsets are the big one (~2 MB), so they load separately and don't
    // block the editor: until they arrive the pickers just show everything.
    fetch("/pokedex-search-index.json")
      .then((r) => r.json())
      .then(setLearnsets)
      .catch(() => { /* pickers stay unfiltered, which is safe */ });
  }, [unlocked]);

  // Load a trainer: prefer the local draft over the published original.
  useEffect(() => {
    if (!activeId) return;
    if (drafts[activeId]) { setData(structuredClone(drafts[activeId])); return; }
    setData(null);
    fetch(`/trainer-raw/${activeId}.json`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setStatus(`No se pudo cargar ${activeId}.`));
  }, [activeId]);

  const persist = (next: Record<string, any>) => {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      setStatus("No se pudo guardar el borrador (almacenamiento lleno).");
    }
  };

  /** Any edit writes straight to the draft store, so nothing is lost on reload. */
  const mutate = (fn: (d: any) => void) => {
    if (!data || !activeId) return;
    const next = structuredClone(data);
    fn(next);
    setData(next);
    persist({ ...drafts, [activeId]: next });
  };

  const filtered = useMemo(() => {
    const n = query.trim().toLowerCase();
    if (!n) return refs;
    return refs.filter((r) => r.name.toLowerCase().includes(n) || r.id.includes(n) || (r.seriesLabel ?? "").toLowerCase().includes(n));
  }, [query, refs]);

  /**
   * Trainers grouped the way the progression reads: one section per region in
   * play order, then the one-off bosses, then the server's own trainers. Within
   * a region they follow the progression chain (step), not the alphabet.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; rank: number; list: TrainerRef[] }>();
    for (const r of filtered) {
      const key = r.seriesLabel ?? (r.roleKey === "custom" ? "__custom" : "__special");
      const label = r.seriesLabel ?? (r.roleKey === "custom" ? "Entrenadores del servidor" : "Jefes y especiales");
      const rank = r.seriesLabel ? r.seriesRank : r.roleKey === "custom" ? 101 : 100;
      if (!byKey.has(key)) byKey.set(key, { label, rank, list: [] });
      byKey.get(key)!.list.push(r);
    }
    for (const g of byKey.values()) {
      g.list.sort((a, b) => a.step - b.step || (a.levelCap ?? 0) - (b.levelCap ?? 0) || a.name.localeCompare(b.name));
    }
    return [...byKey.values()].sort((a, b) => a.rank - b.rank);
  }, [filtered]);

  const draftCount = Object.keys(drafts).length;

  async function exportZip() {
    setBusy(true);
    setStatus("Generando zip…");
    try {
      const res = await fetch("/trainer-pack.zip");
      if (!res.ok) throw new Error(`no se pudo descargar el pack base (${res.status})`);
      const entries = readZipEntries(await res.arrayBuffer());
      const replacements: Record<string, string> = {};
      for (const [id, json] of Object.entries(drafts)) {
        replacements[`data/rctmod/trainers/${id}.json`] = JSON.stringify(json, null, 2);
      }
      const blob = rebuildZip(entries, replacements);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `COBBLEVERSE-RCT-DP-editado-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Zip generado con ${Object.keys(drafts).length} entrenador(es) modificado(s).`);
    } catch (err) {
      setStatus(`Error al exportar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <div class="panel" style={{ maxWidth: "460px" }}>
        <h2 style={{ marginTop: 0 }}>Editor privado</h2>
        <p class="ed-dim" style={{ fontSize: "0.85rem" }}>
          Introduce la clave para abrir el editor de equipos.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pass === PASSPHRASE) {
              sessionStorage.setItem(PASS_KEY, "1");
              // Cleared so a previous "clave incorrecta" doesn't linger in the
              // editor's status bar after a successful unlock.
              setStatus(null);
              setUnlocked(true);
            } else setStatus("Clave incorrecta.");
          }}
        >
          <input
            class="ed-input"
            type="password"
            value={pass}
            onInput={(e) => setPass((e.target as HTMLInputElement).value)}
            placeholder="Clave"
          />
          <button class="ed-btn primary" type="submit" style={{ marginTop: "0.6rem" }}>Entrar</button>
        </form>
        {status && <p style={{ color: "var(--mult-weak)", fontSize: "0.85rem" }}>{status}</p>}
      </div>
    );
  }

  return (
    <div class="ed-layout">
      <aside class="panel ed-side">
        <input
          class="ed-input"
          placeholder={`Buscar entre ${refs.length} entrenadores…`}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <div class="ed-side-list">
          {groups.map((g) => (
            <>
              <div class="ed-side-group">{g.label} <span class="ed-dim">({g.list.length})</span></div>
              {g.list.map((r) => (
                <button
                  type="button"
                  class={`ed-side-item ${activeId === r.id ? "active" : ""}`}
                  onClick={() => setActiveId(r.id)}
                >
                  <span>{r.name}{drafts[r.id] ? " ✎" : ""}</span>
                  <span class="ed-dim">
                    {r.role}{r.levelCap !== null ? ` · cap ${r.levelCap}` : ""}
                  </span>
                </button>
              ))}
            </>
          ))}
          {groups.length === 0 && <div class="ed-dim" style={{ padding: "0.5rem" }}>Sin resultados</div>}
        </div>
      </aside>

      <main class="ed-main">
        <div class="panel ed-toolbar">
          <div>
            <strong>{draftCount}</strong> {draftCount === 1 ? "entrenador editado" : "entrenadores editados"}
            <span class="ed-dim"> · los cambios se guardan en este navegador</span>
          </div>
          <div class="ed-toolbar-actions">
            <button class="ed-btn primary" disabled={busy || draftCount === 0} onClick={exportZip}>
              Exportar .zip para el servidor
            </button>
            <button
              class="ed-btn"
              disabled={busy || draftCount === 0}
              onClick={() => {
                if (!confirm(`¿Descartar los cambios de ${draftCount} entrenador(es)?`)) return;
                persist({});
                if (activeId) {
                  fetch(`/trainer-raw/${activeId}.json`).then((r) => r.json()).then(setData);
                }
                setStatus("Borradores descartados.");
              }}
            >
              Descartar todo
            </button>
          </div>
        </div>
        {status && <div class="panel ed-status">{status}</div>}

        {!activeId && <div class="panel ed-dim">Elige un entrenador de la lista para editar su equipo.</div>}

        {activeId && !data && <div class="panel ed-dim">Cargando…</div>}

        {activeId && data && (
          <>
            <div class="panel">
              <div class="ed-row">
                <label class="ed-field">
                  <span>Nombre</span>
                  <input
                    class="ed-input"
                    value={data.name?.literal ?? ""}
                    onInput={(e) => mutate((d) => { d.name = { literal: (e.target as HTMLInputElement).value }; })}
                  />
                </label>
                <label class="ed-field" style={{ maxWidth: "180px" }}>
                  <span>Máx. objetos en combate</span>
                  <input
                    class="ed-input"
                    type="number"
                    min="0"
                    value={data.battleRules?.maxItemUses ?? ""}
                    placeholder="sin límite"
                    onInput={(e) => mutate((d) => {
                      const v = (e.target as HTMLInputElement).value;
                      d.battleRules = d.battleRules ?? {};
                      if (v === "") delete d.battleRules.maxItemUses;
                      else d.battleRules.maxItemUses = Number(v);
                      if (Object.keys(d.battleRules).length === 0) delete d.battleRules;
                    })}
                  />
                </label>
              </div>

              <h3 style={{ marginBottom: "0.3rem" }}>Objetos consumibles (mochila)</h3>
              <p class="ed-dim" style={{ fontSize: "0.78rem", margin: "0 0 0.5rem" }}>
                Lo que el entrenador puede usar durante el combate (pociones, revivir…).
              </p>
              {(data.bag ?? []).map((b: any, bi: number) => (
                <div class="ed-row ed-bag-row">
                  <Picker
                    pickerId={`bag-${bi}`} openId={openId} setOpenId={setOpenId}
                    value={b.item ?? null}
                    options={items}
                    onChange={(id) => mutate((d) => { d.bag[bi].item = id; })}
                  />
                  <input
                    class="ed-input"
                    type="number"
                    min="1"
                    style={{ maxWidth: "90px" }}
                    value={b.quantity ?? 1}
                    onInput={(e) => mutate((d) => { d.bag[bi].quantity = Number((e.target as HTMLInputElement).value) || 1; })}
                  />
                  <button class="ed-btn danger" onClick={() => mutate((d) => { d.bag.splice(bi, 1); if (!d.bag.length) delete d.bag; })}>
                    Quitar
                  </button>
                </div>
              ))}
              <button
                class="ed-btn"
                onClick={() => mutate((d) => { d.bag = d.bag ?? []; d.bag.push({ item: "cobblemon:potion", quantity: 1 }); })}
              >
                + Añadir objeto
              </button>
            </div>

            <div class="ed-team">
              {data.team.map((m: any, mi: number) => {
                const evTotal = STATS.reduce((n, s) => n + (m.evs?.[s] ?? 0), 0);
                const heldRaw = Array.isArray(m.heldItem) ? m.heldItem[0] ?? "" : m.heldItem ?? "";
                // Held items are stored bare ("life_orb"); the picker works in
                // full ids, so map between the two.
                // heldItem is stored either bare ("life_orb", the Cobblemon
                // convention) or fully qualified ("mega_showdown:heracronite"
                // for mod items). The picker works in full ids, so map both
                // shapes rather than blindly prefixing - that produced
                // "cobblemon:mega_showdown:heracronite".
                const heldFull = !heldRaw
                  ? ""
                  : heldRaw.includes(":")
                    ? heldRaw
                    : items.find((i) => i.bare === heldRaw)?.id ?? `cobblemon:${heldRaw}`;
                const speciesOpt = findSpecies(species, m.species ?? null, m.aspects);
                // Narrow the move/ability pickers to this Pokemon's own
                // learnset. Falls back to the full list when the learnsets
                // haven't loaded or the species isn't in them, so a picker is
                // never left empty.
                const learn = speciesOpt?.slug ? learnsets?.[speciesOpt.slug] : undefined;
                const legalMoves = learn ? moves.filter((mv) => learn.moves.includes(mv.id)) : null;
                const legalAbilities = learn
                  ? abilities.filter((ab) => learn.abilities.includes(ab.id) || learn.hiddenAbilities.includes(ab.id))
                  : null;
                return (
                  <div class="panel ed-mon">
                    <div class="ed-mon-head">
                      <div class="ed-mon-id">
                        <SpeciesThumb opt={speciesOpt} size={44} />
                        <div>
                          <strong>#{mi + 1}</strong>{" "}
                          <span class="ed-mon-name">{speciesOpt?.name ?? m.species ?? "—"}</span>
                          <div class="ed-dim" style={{ fontSize: "0.7rem" }}>
                            Nv. {m.level ?? "—"}{m.aspects?.length ? ` · ${m.aspects.join(", ")}` : ""}
                          </div>
                        </div>
                      </div>
                      <button class="ed-btn danger" onClick={() => mutate((d) => { d.team.splice(mi, 1); })}>Quitar</button>
                    </div>
                    <div class="ed-grid2">
                      <label class="ed-field">
                        <span>Especie</span>
                        <Picker
                          pickerId={`species-${mi}`} openId={openId} setOpenId={setOpenId}
                          value={m.species ?? null}
                          options={species}
                          current={speciesOpt}
                          withThumbs
                          onChange={(id, opt) => mutate((d) => {
                            d.team[mi].species = id;
                            if (opt?.aspects?.length) d.team[mi].aspects = opt.aspects;
                            else delete d.team[mi].aspects;
                          })}
                        />
                      </label>
                      <label class="ed-field">
                        <span>Nivel</span>
                        <input
                          class="ed-input" type="number" min="1" max="100"
                          value={m.level ?? 1}
                          onInput={(e) => mutate((d) => { d.team[mi].level = Math.max(1, Math.min(100, Number((e.target as HTMLInputElement).value) || 1)); })}
                        />
                      </label>
                      <label class="ed-field">
                        <span>Naturaleza</span>
                        <select
                          class="ed-input"
                          value={m.nature ?? ""}
                          onChange={(e) => mutate((d) => { d.team[mi].nature = (e.target as HTMLSelectElement).value || undefined; })}
                        >
                          <option value="">—</option>
                          {NATURES.map((n) => <option value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label class="ed-field">
                        <span>Habilidad</span>
                        <Picker
                          pickerId={`ability-${mi}`} openId={openId} setOpenId={setOpenId}
                          value={m.ability ?? null}
                          options={legalAbilities ?? abilities}
                          allOptions={legalAbilities ? abilities : undefined}
                          restrictedLabel="sus habilidades"
                          allowEmpty
                          onChange={(id) => mutate((d) => { if (id) d.team[mi].ability = id; else delete d.team[mi].ability; })}
                        />
                      </label>
                      <label class="ed-field">
                        <span>Objeto equipado</span>
                        <Picker
                          pickerId={`held-${mi}`} openId={openId} setOpenId={setOpenId}
                          value={heldFull || null}
                          options={items}
                          allowEmpty
                          onChange={(id) => mutate((d) => {
                            if (!id) { delete d.team[mi].heldItem; return; }
                            const opt = items.find((i) => i.id === id);
                            // Cobblemon items are written bare (the datapack's
                            // convention); anything from a mod keeps its
                            // namespace, or the mega stones would be saved as a
                            // bare name the game can't resolve.
                            const written = !opt || opt.ns === "cobblemon" ? (opt?.bare ?? id.split(":").pop()!) : opt.id;
                            // Keep whichever shape this entry already used.
                            d.team[mi].heldItem = Array.isArray(d.team[mi].heldItem) ? [written] : written;
                          })}
                        />
                      </label>
                      <label class="ed-field">
                        <span>Género</span>
                        <select
                          class="ed-input"
                          value={m.gender ?? ""}
                          onChange={(e) => mutate((d) => { const v = (e.target as HTMLSelectElement).value; if (v) d.team[mi].gender = v; else delete d.team[mi].gender; })}
                        >
                          <option value="">—</option>
                          <option value="MALE">MALE</option>
                          <option value="FEMALE">FEMALE</option>
                          <option value="GENDERLESS">GENDERLESS</option>
                        </select>
                      </label>
                    </div>

                    <div class="ed-moves">
                      {[0, 1, 2, 3].map((k) => (
                        <label class="ed-field">
                          <span>Mov. {k + 1}</span>
                          <Picker
                            pickerId={`move-${mi}-${k}`} openId={openId} setOpenId={setOpenId}
                            value={m.moveset?.[k] ?? null}
                            options={legalMoves ?? moves}
                            allOptions={legalMoves ? moves : undefined}
                            restrictedLabel="los que aprende"
                            allowEmpty
                            onChange={(id) => mutate((d) => {
                              d.team[mi].moveset = d.team[mi].moveset ?? [];
                              if (id) d.team[mi].moveset[k] = id;
                              else d.team[mi].moveset.splice(k, 1);
                            })}
                          />
                        </label>
                      ))}
                    </div>

                    <table class="ed-stats">
                      <thead><tr><th></th>{STATS.map((s) => <th>{STAT_LABELS[s]}</th>)}</tr></thead>
                      <tbody>
                        <tr>
                          <th>IVs</th>
                          {STATS.map((s) => (
                            <td>
                              <input
                                class="ed-input tiny" type="number" min="0" max="31"
                                value={m.ivs?.[s] ?? 0}
                                onInput={(e) => mutate((d) => {
                                  d.team[mi].ivs = d.team[mi].ivs ?? {};
                                  d.team[mi].ivs[s] = Math.max(0, Math.min(31, Number((e.target as HTMLInputElement).value) || 0));
                                })}
                              />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <th>EVs</th>
                          {STATS.map((s) => (
                            <td>
                              <input
                                class="ed-input tiny" type="number" min="0" max="252"
                                value={m.evs?.[s] ?? 0}
                                onInput={(e) => mutate((d) => {
                                  d.team[mi].evs = d.team[mi].evs ?? {};
                                  d.team[mi].evs[s] = Math.max(0, Math.min(252, Number((e.target as HTMLInputElement).value) || 0));
                                })}
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                    <div class={`ed-evtotal ${evTotal > 510 ? "over" : ""}`}>
                      EVs totales: {evTotal} / 510{evTotal > 510 ? " — pasa del máximo del juego" : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {data.team.length < 6 && (
              <button
                class="ed-btn"
                onClick={() => mutate((d) => {
                  d.team.push({
                    species: "pikachu", level: 50, nature: "hardy",
                    moveset: [], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: {},
                  });
                })}
              >
                + Añadir Pokémon ({data.team.length}/6)
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
