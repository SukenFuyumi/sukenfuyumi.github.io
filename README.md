# Cobbleverse Dex

Pokedex estilo pokemondb.net generada directamente desde los jars y datapacks
instalados en el servidor (`Cobblemon-fabric-*.jar` y compañía, un nivel arriba
de esta carpeta). Cubre oficiales, fakemon, megas, formas y todo lo que esté
activo según `pipeline/sources.json` - movimientos y habilidades ya reflejan
los rebalanceos de mods como Laser's Additions.

## Estructura

- `pipeline/` - script de extracción en Node/TypeScript. Lee los `.jar`/`.zip`
  del servidor y escribe JSON normalizado en `site/src/data/generated/`.
- `site/` - sitio estático en Astro que consume ese JSON.

## Actualizar la Pokedex cuando cambian los mods

1. Instala/actualiza el jar o datapack en la carpeta del servidor como siempre.
2. Añade (o quita) una entrada en `pipeline/sources.json` -> `sources` con su
   `file`, `kind` (`jar`/`datapack`) y `role`:
   - `base`: Cobblemon core (solo debería haber una).
   - `content`: agrega Pokémon/formas nuevas (la mayoría de fakemon packs).
   - `balance-patch`: rebalancea movimientos/habilidades de mons ya existentes
     (ej. Laser's Additions) - **siempre se aplica al final y gana cualquier
     conflicto**, sin importar su `priority`.
   - `cosmetic`: solo texturas/sonidos/modelos, no aporta datos - no hace falta
     listarlo salvo para documentarlo (ver `cosmeticOnly`).
   - Si un pack está desactivado en el servidor, ponlo en `disabled` en vez de
     `sources` (con un `reason`) para que quede documentado pero no se procese.
3. Vuelve a correr la extracción y el build:

   ```powershell
   cd pipeline
   npm run extract
   cd ../site
   npm run build
   ```

4. `site/dist/` queda listo para publicar (Netlify, Vercel, GitHub Pages,
   cualquier hosting estático). `npm run preview` sirve ese `dist/` localmente
   para revisar antes de publicar; `npm run dev` levanta el modo desarrollo.

## Qué mira el pipeline dentro de cada jar/datapack

`data/<namespace>/{species,species_additions,species_feature_assignments,
species_features,moves,abilities,dex_entries,dex_additions,
dex_entry_additions,spawn_pool_world}/**` y `assets/<namespace>/lang/en_us.json`,
más el `showdown.zip` embebido en el jar de Cobblemon core (datos base de
movimientos/habilidades/tabla de tipos de Pokémon Showdown).

Si un mod nuevo usa un esquema de datos totalmente distinto a estos (algunos
addons de forms/megas muy específicos lo hacen para su propia lógica de
disparo), el pipeline simplemente lo ignora sin fallar - en el peor caso ese
mod queda con menos detalle del que podría tener, no rompe nada del resto.

## Nota de arquitectura: listas grandes van como asset estático, no como prop

Los datasets grandes (~2300 Pokémon, ~1200 movimientos, ~470 habilidades) se
escriben también como JSON planos en `site/public/` (`pokedex-sidebar.json`,
`pokedex-index.json`, `moves-index.json`, `abilities-index.json`) y los
componentes interactivos (`PokedexSidebar`, `PokedexTable`, `TeamBuilder`,
`MoveTable`, `AbilityTable`) los piden con `fetch()` en un `useEffect`, en vez
de recibirlos como prop de Astro. Si un dataset grande se pasa como prop,
Astro lo serializa entero dentro del HTML de esa página para poder
hidratarlo - así fue como `/moves` llegó a pesar **20 MB** en un momento
(cada movimiento's reverse-index de "quién lo aprende" quedó embebido aunque
la tabla nunca lo usaba). Si agregas una tabla/isla nueva que necesite el
dataset completo, sigue el mismo patrón: pipeline escribe un JSON trimmed en
`public/`, el componente lo pide por `fetch`.

## Reporte de conflictos

Cada corrida de `npm run extract` escribe `site/src/data/generated/
conflicts.json` (qué mod ganó cada campo disputado) y `warnings.json`
(archivos que no se pudieron leer). Útil para auditar que el "Laser's
Additions siempre gana" se está aplicando donde corresponde.

## Imágenes

Prioridad al resolver la imagen de cada Pokémon/forma:

1. Sprite oficial (PokeAPI) para especies oficiales.
2. Render 2.5D generado por el propio pipeline a partir del modelo Bedrock
   (`.geo.json`) + textura real del mod (sin placeholders de color).
3. Textura plana, si el modelo no se pudo parsear pero la textura sí existe.
4. Placeholder de color por tipo, solo como último recurso.

En la extracción más reciente (2268 entradas) el resultado fue 1027 sprites,
1239 renders y 2 texturas planas - **cero placeholders**.

## Limitaciones conocidas (fase actual)

- La numeración de "Pokédex completa" ordena por `nationalPokedexNumber`; si
  un pack custom numera su propio dex desde 0/1, puede intercalarse con los
  oficiales en vez de agruparse.
- Un puñado de referencias a movimientos/habilidades en algunos packs de
  fakemon tienen errores tipográficos en los datos originales del mod (p. ej.
  `willowis[` en vez de `willowisp`, o `warble`, que no existe en ningún lado
  del mod). El pipeline ya normaliza automáticamente diferencias de
  guion/guion bajo (`fire-mastery` vs `firemastery`, `breaking_swipe` vs
  `breakingswipe`), pero no adivina typos genuinos - esas filas muestran
  "Movimiento no encontrado" en vez de arriesgarse a enlazar el movimiento
  equivocado. Ver `conflicts.json`/`warnings.json` tras cada extracción.
