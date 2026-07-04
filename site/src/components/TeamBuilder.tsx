import { useEffect, useMemo, useRef, useState } from "preact/hooks";

interface MonListing {
  slug: string;
  name: string;
  nationalPokedexNumber: number | null;
  types: string[];
  image: { kind: string; url: string | null; placeholderColor?: string; placeholderLabel?: string };
  sourceMods: string[];
  primarySource: string;
  formOf: { slug: string; name: string } | null;
}

const STORAGE_KEY = "cobbleverse-team-v1";
const SLOT_COUNT = 8;

function isCustom(p: MonListing): boolean {
  return p.formOf !== null || p.primarySource !== "cobblemon-core";
}

function displaySlotImg(p: MonListing) {
  if (p.image.kind === "placeholder") {
    return (
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: p.image.placeholderColor, color: "#fff", fontWeight: 700, fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {p.image.placeholderLabel}
      </div>
    );
  }
  return <img src={p.image.url ?? ""} alt={p.name} style={{ width: 56, height: 56, objectFit: "contain", imageRendering: p.image.kind === "texture" ? "pixelated" : "auto" }} />;
}

export default function TeamBuilder() {
  const [pokemon, setPokemon] = useState<MonListing[]>([]);
  const [team, setTeam] = useState<(MonListing | null)[]>(Array(SLOT_COUNT).fill(null));
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const cardRef = useRef<HTMLDivElement>(null);
  const bySlug = useMemo(() => new Map(pokemon.map((p) => [p.slug, p])), [pokemon]);

  // Fetched as a static asset rather than an Astro prop - embedding the full
  // ~2300-entry listing directly in this page's HTML was ballooning it to
  // over 1.5MB (same issue already fixed for the sidebar).
  useEffect(() => {
    fetch("/pokedex-index.json")
      .then((r) => r.json())
      .then(setPokemon)
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const slugs: (string | null)[] = JSON.parse(raw);
      setTeam(slugs.map((s) => (s ? bySlug.get(s) ?? null : null)));
    } catch {
      // ignore corrupt storage
    }
  }, [bySlug]);

  function persist(next: (MonListing | null)[]) {
    setTeam(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((p) => p?.slug ?? null)));
  }

  function pick(p: MonListing) {
    if (pickerSlot === null) return;
    const next = [...team];
    next[pickerSlot] = p;
    persist(next);
    setPickerSlot(null);
    setQuery("");
  }

  function clearSlot(i: number) {
    const next = [...team];
    next[i] = null;
    persist(next);
  }

  function clearTeam() {
    persist(Array(SLOT_COUNT).fill(null));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pokemon.slice(0, 60);
    return pokemon.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 60);
  }, [pokemon, query]);

  async function exportImage(mode: "copy" | "download") {
    if (!cardRef.current) return;
    setStatus("Generando imagen...");
    try {
      const htmlToImage = await import("html-to-image");
      const dataUrl = await htmlToImage.toPng(cardRef.current, { pixelRatio: 2 });
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "mi-equipo-cobbleverse.png";
        a.click();
        setStatus("Imagen descargada.");
        return;
      }
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("Imagen copiada al portapapeles.");
    } catch (err) {
      setStatus("No se pudo copiar directamente; se descargó la imagen en su lugar.");
      const a = document.createElement("a");
      a.href = await (async () => {
        const htmlToImage = await import("html-to-image");
        return htmlToImage.toPng(cardRef.current!, { pixelRatio: 2 });
      })();
      a.download = "mi-equipo-cobbleverse.png";
      a.click();
    }
  }

  const today = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" class="tabs-btn-like" onClick={() => exportImage("copy")} style={btnStyle(true)}>
          Copiar como imagen
        </button>
        <button type="button" onClick={() => exportImage("download")} style={btnStyle(false)}>
          Descargar imagen
        </button>
        <button type="button" onClick={clearTeam} style={btnStyle(false)}>
          Vaciar equipo
        </button>
        {status && <span style={{ alignSelf: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>{status}</span>}
      </div>

      <div
        ref={cardRef}
        style={{
          background: "#14161c",
          color: "#f2f3f5",
          borderRadius: "14px",
          padding: "1.5rem",
          maxWidth: "820px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: "1px solid #2a2d36", paddingBottom: "0.85rem", marginBottom: "1.1rem" }}>
          <span style={{ fontSize: "1.3rem" }}>⚔️</span>
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Mi equipo</h2>
          <span style={{ color: "#5b8cff", fontWeight: 700 }}>— Cobbleverse Dex</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.8rem" }}>
          {team.map((p, i) => (
            <div
              style={{
                background: "#1c1f28",
                border: "1px solid #2a2d36",
                borderRadius: "10px",
                padding: "0.85rem 0.6rem",
                textAlign: "center",
                minHeight: "150px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {p ? (
                <>
                  <button
                    type="button"
                    onClick={() => clearSlot(i)}
                    data-html2canvas-ignore="true"
                    style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.9rem" }}
                    title="Quitar"
                  >
                    ✕
                  </button>
                  {displaySlotImg(p)}
                  <div style={{ fontWeight: 700, marginTop: "0.5rem", fontSize: "0.88rem" }}>
                    {p.formOf ? `${p.formOf.name} (${p.name.replace(`${p.formOf.name} `, "")})` : p.name}
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.3rem" }}>
                    {p.types.map((t) => (
                      <span
                        style={{
                          background: `var(--type-${t})`,
                          color: "#fff",
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          padding: "0.12rem 0.4rem",
                          borderRadius: "999px",
                          textTransform: "uppercase",
                        }}
                      >
                        {t.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                  {isCustom(p) && (
                    <div style={{ marginTop: "0.35rem", fontSize: "0.65rem", fontWeight: 700, color: "#f5a623" }}>★ MOD</div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerSlot(i)}
                  data-html2canvas-ignore="true"
                  style={{
                    background: "none",
                    border: "2px dashed #3a3e4a",
                    borderRadius: "8px",
                    color: "#6b7280",
                    width: "100%",
                    height: "100%",
                    minHeight: "110px",
                    cursor: "pointer",
                    fontSize: "1.6rem",
                  }}
                >
                  +
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.2rem", paddingTop: "0.75rem", borderTop: "1px solid #2a2d36", fontSize: "0.8rem" }}>
          <span style={{ color: "#5b8cff", fontWeight: 700 }}>Cobbleverse Dex</span>
          <span style={{ color: "#6b7280" }}>{today}</span>
        </div>
      </div>

      {pickerSlot !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "8vh", zIndex: 50 }}
          onClick={() => setPickerSlot(null)}
        >
          <div class="panel" style={{ width: "min(480px, 92vw)", maxHeight: "75vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              class="search-box"
              type="search"
              placeholder="Buscar Pokémon para este slot..."
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              style={{ marginBottom: "0.75rem" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {filtered.map((p) => (
                <button
                  type="button"
                  onClick={() => pick(p)}
                  style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "none", border: "none", padding: "0.4rem", cursor: "pointer", textAlign: "left", borderRadius: "6px", width: "100%" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f4f6f8")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                >
                  {p.image.kind === "placeholder" ? (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: p.image.placeholderColor }} />
                  ) : (
                    <img src={p.image.url ?? ""} width={28} height={28} style={{ objectFit: "contain" }} />
                  )}
                  <span>{p.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {p.nationalPokedexNumber ? `#${p.nationalPokedexNumber}` : ""}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && <p style={{ color: "var(--text-muted)" }}>Sin resultados.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(primary: boolean) {
  return {
    padding: "0.5rem 1rem",
    borderRadius: "999px",
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--accent)" : "#fff",
    color: primary ? "#fff" : "var(--text)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
  } as const;
}
