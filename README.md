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

## Actualizar la sección de Progresión (entrenadores)

`/progresion` sale del datapack de RCT (Radical Cobblemon Trainers) que define
gimnasios, Alto Mando, campeones, jefes de equipos villanos y los entrenadores
custom del servidor. Para actualizarlo cuando cambies los equipos:

1. Copia el zip nuevo a `EXTRACTOR DEX/datapacks/`.
2. En `pipeline/sources.json`, apunta `trainerPack.file` al nombre nuevo, p. ej.
   `"file": "datapacks/COBBLEVERSE-RCT-DP-v23.zip"`. (Si el nombre del archivo
   no cambió, no hace falta tocar nada aquí.)
3. Regenera los datos y construye el sitio:

   ```powershell
   cd "D:\Minecraft server\EXTRACTOR DEX\pokedex-site\pipeline"
   npm.cmd run extract
   cd "D:\Minecraft server\EXTRACTOR DEX\pokedex-site\site"
   npm.cmd run build
   ```

   Dos cosas propias de Windows PowerShell 5.1:
   - `&&` no existe como separador de comandos. Usa `;`, o una línea por comando.
   - `npm` resuelve a `npm.ps1`, que la política de ejecución por defecto
     (`Restricted`) bloquea con un `SecurityError`. **`npm.cmd`** evita el script
     y funciona sin cambiar nada del sistema. (La alternativa es habilitar
     scripts con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, pero eso
     cambia un ajuste de seguridad y no hace falta.)

4. Publica. El push a `main` dispara el deploy a GitHub Pages automáticamente.

   ```powershell
   cd "D:\Minecraft server\EXTRACTOR DEX\pokedex-site"
   git add -A
   git commit -m "Update trainer datapack"
   git push
   ```

Al correr `extract` verás una línea de confirmación con lo que leyó, útil para
comprobar que cogió el zip correcto:

```
Resolved 155 trainers across 4 series (155 with a level cap) from Cobbleverse RCT (Run & Bun v22)
```

Todo lo demás se recalcula solo: equipos, niveles, naturalezas, habilidades,
objetos, movimientos, IVs/EVs, los stats totales, los level caps, el orden de la
progresión y los archivos por entrenador de `site/public/trainers/` que carga el
panel. Si el datapack añade entrenadores nuevos, aparecen sin tocar código.

Los **level caps** no vienen en el datapack: son una mecánica del mod,
documentada en `config/rctmod-server.toml`. El tope de un jugador es el nivel
del Pokémon más fuerte de su **siguiente** entrenador obligatorio más
`relativeLevelCap`, y nunca pasa de `maxLevelCap` (100).

En este servidor `relativeLevelCap` es **0**, así que el cap de cada entrenador
es exactamente el nivel de su Pokémon más fuerte: el ace de Brock es nivel 20,
por lo que su cap es 20. El pipeline lo calcula por entrenador; si cambias esos
valores en el server, ajústalos también en `trainerPack.relativeLevelCap` /
`initialLevelCap` / `maxLevelCap`.

El orden de la progresión sale de `requiredDefeats` (qué entrenador hay que
derrotar antes), no de los nombres de archivo, y el orden de las series de
`requiredSeries` - por eso Johto aparece antes que Hoenn aunque compartan
dificultad.

### Editor de equipos (`/progresion/editor`)

Editor en vivo de los equipos, pensado para no tener que tocar los JSON a mano.
No está enlazado desde ninguna página y va con `noindex`, así que solo se llega
por URL directa, tras una clave (`PASSPHRASE` en `TrainerEditor.tsx`).

**La clave solo lo oculta, no lo protege.** El sitio es estático: la comprobación
corre en el navegador y cualquiera que lea el código fuente puede saltarla. Es
aceptable porque el editor no escribe nada remoto - solo genera un zip que se
descarga en el equipo de quien lo usa - y los datos que muestra ya son públicos
en `/progresion`. Si algún día necesitas restricción real, hace falta un backend.

Cómo funciona:

- Edita especie (con formas), nivel, naturaleza, habilidad, objeto equipado,
  género, los 4 movimientos, IVs/EVs, la **mochila de consumibles** y el límite
  de objetos por combate. Los selectores salen de los índices que genera el
  pipeline (`trainer-species-index.json`, `moves-index.json`,
  `abilities-index.json`, `items-index.json`).
- Los cambios se guardan solos en `localStorage` de ese navegador, así que no se
  pierden al recargar. "Descartar todo" los borra.
- "Exportar .zip" descarga el datapack completo: descarga
  `public/trainer-pack.zip` (copia del original que hace el pipeline), sustituye
  solo los `data/rctmod/trainers/<id>.json` editados y **copia el resto de
  entradas con sus bytes comprimidos originales** (ver `src/lib/zip.ts`), así que
  mobs, series, diálogos y loot tables quedan intactos. Los archivos sustituidos
  se escriben sin comprimir, que cualquier lector de zip acepta.
- Como parte del original edita el JSON crudo de cada entrenador, los campos que
  el editor no toca (`ai`, `battleFormat`, `identity`…) sobreviven la exportación.

El zip que sale se pasa al servidor igual que cualquier datapack. Si además
quieres que la web refleje esos cambios, cópialo también a `datapacks/` y sigue
los pasos de arriba.

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

### Pose de los renders 2.5D

Los renders no usan la pose "bind" cruda del modelo (que en muchos modelos
Bedrock es una especie de pose en T con las patas/vides estiradas hacia los
lados) - el pipeline busca el archivo *poser* del propio Cobblemon
(`bedrock/pokemon/posers/<especie>/*.json`), encuentra la pose de reposo que
usa la UI del juego (`PROFILE`/`PORTRAIT`, la misma que se ve en la PC y en
la pantalla de resumen del equipo), resuelve la animación bedrock que esa
pose referencia, y evalúa esa animación en el instante `anim_time = 0`
(soporta expresiones Molang simples: `math.sin`, `math.clamp`, aritmética -
ver `pipeline/src/molang.ts`). Esos ángulos de hueso se suman encima de la
pose bind antes de renderizar. Si un mod no trae poser/animación (o usa algo
que el mini-evaluador no reconoce), simplemente no hay ángulos extra y el
render cae de vuelta a la pose bind de siempre - nunca falla ni empeora nada.

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
