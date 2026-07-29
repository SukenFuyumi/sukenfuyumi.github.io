import { useEffect, useState } from "preact/hooks";

/**
 * Opens a trainer's team in an overlay panel instead of navigating away, and
 * lets a move or ability inside it be clicked to reveal its description.
 *
 * Trainer cards keep their real href (direct links and no-JS still work); this
 * intercepts the click and fetches /trainers/<slug>.json - one small file per
 * trainer rather than embedding all 155 teams in the index page.
 */

interface MoveInfo {
  id: string;
  name: string;
  type: string | null;
  category: string | null;
  basePower: number | null;
  accuracy: number | boolean | null;
  pp: number | null;
  desc: string | null;
}

const STAT_LABELS: Record<string, string> = { hp: "HP", atk: "ATK", def: "DEF", spa: "SPA", spd: "SPD", spe: "SPE" };
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_BAR_MAX = 450;

function MonArt({ image, name, size }: { image: any; name: string; size: number }) {
  if (!image) return null;
  if (image.kind === "sprite" || image.kind === "render") {
    return <img src={image.url ?? ""} alt={name} loading="lazy" width={size} height={size} />;
  }
  if (image.kind === "texture") {
    return (
      <div class="texture-frame" style={{ width: `${size}px`, height: `${size}px`, background: image.placeholderColor ?? "#e9ecf1" }}>
        <img src={image.url ?? ""} alt={name} loading="lazy" />
      </div>
    );
  }
  return (
    <div class="placeholder" style={{ width: `${size}px`, height: `${size}px`, background: image.placeholderColor }}>
      {image.placeholderLabel}
    </div>
  );
}

/** Detail card for a clicked move or ability, shown inside the panel. */
function DetailPopover({ detail, onClose }: { detail: any; onClose: () => void }) {
  const isMove = detail.kind === "move";
  const m: MoveInfo = detail.data;
  return (
    <div class="detail-pop" onClick={(e) => e.stopPropagation()}>
      <button class="detail-pop-close" onClick={onClose} aria-label="Cerrar">×</button>
      <div class="detail-pop-head">
        <strong>{isMove ? m.name : detail.data.name}</strong>
        {isMove && m.type && (
          <span class="type-badge" style={{ background: `var(--type-${m.type.toLowerCase()})` }}>{m.type}</span>
        )}
        {isMove && m.category && <span class="pill muted">{m.category}</span>}
        {isMove && (
          <span class="detail-pop-stats">
            <span><em>Poder</em>{m.basePower || "—"}</span>
            <span><em>Precisión</em>{m.accuracy === true ? "—" : m.accuracy ?? "—"}</span>
            <span><em>PP</em>{m.pp ?? "—"}</span>
          </span>
        )}
        {!isMove && <span class="pill muted">Habilidad</span>}
      </div>
      <p class="detail-pop-desc">{isMove ? m.desc ?? "Sin descripción." : detail.data.desc ?? "Sin descripción."}</p>
      <a class="detail-pop-link" href={isMove ? `/moves/${m.id}` : `/abilities/${detail.data.id}`}>
        Ver ficha completa →
      </a>
    </div>
  );
}

export default function TrainerModal() {
  const [slug, setSlug] = useState<string | null>(null);
  const [trainer, setTrainer] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  // Intercept trainer-card clicks. Modifier/middle clicks fall through so
  // "open in new tab" still works.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-trainer-slug]");
      if (!card) return;
      e.preventDefault();
      setSlug(card.dataset.trainerSlug ?? null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Load the trainer, and keep the URL in sync so the panel is shareable and
  // the browser's back button closes it.
  useEffect(() => {
    if (!slug) return;
    setTrainer(null);
    setError(null);
    setDetail(null);
    fetch(`/trainers/${slug}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setTrainer)
      .catch(() => setError("No se pudo cargar este entrenador."));
    history.pushState({ trainerPanel: slug }, "", `/progresion/${slug}`);
  }, [slug]);

  useEffect(() => {
    const onPop = () => setSlug(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const close = () => {
    if (history.state?.trainerPanel) history.back();
    else setSlug(null);
  };

  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detail) setDetail(null);
      else close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [slug, detail]);

  if (!slug) return null;
  const t = trainer;

  return (
    <div class="trainer-overlay" onClick={close}>
      <div class="trainer-modal" onClick={(e) => e.stopPropagation()}>
        <div class="trainer-modal-bar">
          <span>
            {t ? (
              <>
                <strong>{t.role}: {t.name}</strong>
                {t.seriesLabel && <span class="trainer-modal-sub"> · Serie {t.seriesLabel}</span>}
                {t.levelCap !== null && <span class="trainer-modal-sub"> · Level cap {t.levelCap}</span>}
              </>
            ) : (
              <strong>Cargando…</strong>
            )}
          </span>
          <span class="trainer-modal-actions">
            {t && <a href={`/progresion/${t.slug}`} title="Abrir como página" onClick={(e) => e.stopPropagation()}>⧉</a>}
            <button onClick={close} aria-label="Cerrar">×</button>
          </span>
        </div>

        <div class="trainer-modal-body" onClick={() => setDetail(null)}>
          {error && <p style={{ color: "var(--text-muted)" }}>{error}</p>}
          {!t && !error && <p style={{ color: "var(--text-muted)" }}>Cargando equipo…</p>}
          {t && (
            <>
              <p class="trainer-modal-meta">
                Equipo de {t.team.length} · Pokémon más fuerte a nivel {t.teamMaxLevel}
                {t.maxItemUses !== null && <> · usa hasta {t.maxItemUses} objetos</>}
                {t.bag?.length > 0 && <> · mochila: {t.bag.map((b: any) => `${b.name} x${b.quantity}`).join(", ")}</>}
                {t.requiredNames?.length > 0 && <> · requiere derrotar antes a {t.requiredNames.join(", ")}</>}
              </p>
              <div class="team-grid">
                {t.team.map((m: any) => (
                  <div class="panel team-card">
                    <div class="team-card-left">
                      <div class="team-art"><MonArt image={m.image} name={m.displayName} size={76} /></div>
                      {m.speciesSlug ? (
                        <a href={`/pokedex/${m.speciesSlug}`} class="team-name">{m.displayName}</a>
                      ) : (
                        <span class="team-name">{m.displayName}</span>
                      )}
                      <div class="team-lvl">Nv. {m.level}</div>
                      <div style={{ margin: "0.25rem 0" }}>
                        {m.types.map((ty: string) => (
                          <span class="type-badge" style={{ background: `var(--type-${ty})`, margin: "0 0.15rem 0.15rem 0" }}>{ty}</span>
                        ))}
                      </div>
                      <dl class="team-meta">
                        {m.nature && <><dt>Naturaleza</dt><dd>{m.nature}</dd></>}
                        {m.ability && (
                          <>
                            <dt>Habilidad</dt>
                            <dd>
                              <button
                                class="linkish"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetail({ kind: "ability", data: { id: m.abilityId, name: m.ability, desc: m.abilityDesc } });
                                }}
                              >{m.ability}</button>
                            </dd>
                          </>
                        )}
                        {m.heldItem && <><dt>Objeto</dt><dd>{m.heldItem}</dd></>}
                        {m.gimmick && <><dt>Gimmick</dt><dd>{m.gimmick}</dd></>}
                        {m.shiny && <><dt>Variocolor</dt><dd>Sí</dd></>}
                      </dl>
                    </div>
                    <div class="team-card-right">
                      <table class="stat-table">
                        <thead><tr><th></th><th>Total</th><th></th><th>IVs</th><th>EVs</th></tr></thead>
                        <tbody>
                          {STAT_ORDER.filter((k) => m.stats?.[k] !== undefined).map((k) => (
                            <tr>
                              <th>{STAT_LABELS[k]}</th>
                              <td class="stat-num">{m.stats[k]}</td>
                              <td class="stat-bar-cell">
                                <div class="stat-bar"><span style={{ width: `${Math.min(100, (m.stats[k] / STAT_BAR_MAX) * 100)}%` }}></span></div>
                              </td>
                              <td class="stat-num dim">{m.ivs?.[k] ?? 0}</td>
                              <td class="stat-num dim">{m.evs?.[k] ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div class="team-moves">
                        {m.moves.map((mv: MoveInfo) => (
                          <button
                            class="team-move"
                            style={mv.type ? { background: `var(--type-${mv.type.toLowerCase()})` } : undefined}
                            onClick={(e) => { e.stopPropagation(); setDetail({ kind: "move", data: mv }); }}
                          >{mv.name}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {detail && <DetailPopover detail={detail} onClose={() => setDetail(null)} />}
        </div>
      </div>
    </div>
  );
}
