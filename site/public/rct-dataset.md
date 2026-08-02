# Dataset RCT — Cobbleverse SpaM Edition

Generado el 2026-08-02 a partir del contenido realmente instalado en el servidor.
Pack de entrenadores de referencia: `COBBLEVERSE-RCT-DP-v23-JOHTO-DOBLES.zip`.

**Todo identificador listado aquí resuelve en el servidor. Cualquier otro falla**, casi siempre en silencio: el Pokémon desaparece del equipo o el objeto se ignora, sin error visible.

| | |
|---|---|
| species | 2356 |
| moves | 1098 |
| abilities | 464 |
| items | 1026 |
| megaStones | 156 |

El archivo `rct-dataset.json` que acompaña a este documento trae las listas completas: cada especie con sus tipos, estadísticas base, habilidades legales y todos los movimientos que aprende, más el catálogo de objetos.

## Reglas

- species: identificador Cobblemon en minúsculas, SIN namespace y SIN guiones de estilo Showdown. La forma NO va en el nombre: 'indeedee-f' es inválido; se escribe species 'indeedee' + aspects ['female'].
- aspects: array para variantes regionales y de forma (['alolan'], ['hisuian'], ['female'], ['therian-forme']…). Usa el valor exacto que aparece en el campo aspects de este dataset.
- ability: id en minúsculas y sin espacios ('roughskin', no 'Rough Skin'). Debe estar en abilities o hiddenAbilities de esa especie.
- moveset: máximo 4, ids en minúsculas y sin espacios ('closecombat', no 'Close Combat'). Deben estar en la lista moves de esa especie.
- heldItem: usa el campo 'write' del objeto en items. Los de cobblemon van sin namespace ('life_orb'); los de mods lo conservan ('mega_showdown:lucarionite'). Acepta string o array de un elemento.
- bag[].item: OJO, convención distinta a heldItem. Aquí SIEMPRE va el id completo con namespace, incluso los de cobblemon: usa el campo 'id' del objeto, no 'write' ('cobblemon:full_restore').
- battleRules.maxItemUses debe acompañar a bag: es cuántos objetos puede gastar la IA. Sin él la mochila no se usa.
- Campos opcionales poco frecuentes: 'shiny' (bool) en un miembro, e 'identity' a nivel de entrenador. 'form' y 'variant' son formas antiguas de escribir aspects; para equipos nuevos usa aspects.
- gimmicks.mega solo funciona si el Pokémon sostiene la piedra correspondiente: comprueba la pareja en megaStones.
- gimmicks.tera necesita ADEMÁS que el entrenador tenga ai.data.canTera = true; sin eso la IA nunca teracristaliza.
- ai.data.teraTarget es opcional y nombra a un miembro del propio equipo (por su id de species); la IA teracristaliza el primero que coincida.
- ivs/evs: claves hp, atk, def, spa, spd, spe. IVs 0-31; EVs 0-252 y como mucho 510 en total.
- level: 1-100. El level cap que ve el jugador es el nivel más alto del equipo, así que subirlo cambia la progresión.
- battleFormat: GEN_9_DOUBLES hace el combate de dobles; el equipo necesita al menos 2 Pokémon.

## Lo que esto NO garantiza

- Este dataset es vocabulario, no un validador: que un id exista aquí no impide escribirlo en el sitio equivocado. Pasa el resultado por `npm run validate-trainers <zip>` antes de subirlo.
- La lista de movimientos por especie es su learnset. Cobblemon SÍ permite a un entrenador llevar movimientos fuera del learnset (el pack oficial lo hace en varios sitios), así que salirse es un aviso, no un error.
- No se comprueba el equilibrio ni la progresión: un equipo puede ser válido y aun así romper el level cap de la región, ya que el cap es el nivel más alto del equipo.
- Un entrenador nuevo necesita ADEMÁS su archivo en data/rctmod/mobs/trainers/**, y estar encadenado por requiredDefeats, o no aparece en el mundo. Esto solo cubre el archivo de equipo.
- Refleja los mods instalados el día que se generó. Si actualizas un mod o activas un pack, vuelve a generarlo.

## Estructura de un archivo de entrenador

`data/rctmod/trainers/<id>.json`:

```json
{
  "name": {
    "literal": "Brock"
  },
  "ai": {
    "type": "rb",
    "data": {
      "canTera": true,
      "teraTarget": "geodude"
    }
  },
  "battleFormat": "GEN_9_SINGLES",
  "battleRules": {
    "maxItemUses": 2
  },
  "bag": [
    {
      "item": "cobblemon:full_restore",
      "quantity": 2
    }
  ],
  "team": [
    {
      "species": "geodude",
      "aspects": [
        "alolan"
      ],
      "gender": "MALE",
      "level": 12,
      "nature": "adamant",
      "ability": "sturdy",
      "moveset": [
        "rollout",
        "magnitude"
      ],
      "ivs": {
        "hp": 31,
        "atk": 31,
        "def": 31,
        "spa": 31,
        "spd": 31,
        "spe": 31
      },
      "evs": {
        "atk": 252,
        "hp": 252
      },
      "heldItem": "eviolite",
      "shiny": false,
      "gimmicks": {
        "tera": "rock"
      }
    }
  ]
}
```

## Valores admitidos

**Naturalezas** (25): adamant, bashful, bold, brave, calm, careful, docile, gentle, hardy, hasty, impish, jolly, lax, lonely, mild, modest, naive, naughty, quiet, quirky, rash, relaxed, sassy, serious, timid

**Tipos de teracristal** (18): normal, fire, water, electric, grass, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy

**Formatos de combate**: GEN_9_SINGLES, GEN_9_DOUBLES, GEN_8_SINGLES, GEN_8_DOUBLES

**Géneros**: MALE, FEMALE, GENDERLESS (el campo es opcional)

## Piedras mega

`gimmicks: {"mega": true}` solo surte efecto si el Pokémon sostiene su piedra:

| Objeto (`heldItem`) | Especies |
|---|---|
| `mega_showdown:abomasite` | abomasnow |
| `mega_showdown:absolite` | absol |
| `mega_showdown:aerodactylite` | aerodactyl |
| `mega_showdown:aggronite` | aggron |
| `mega_showdown:alakazite` | alakazam |
| `mega_showdown:alloettite` | alloette |
| `mega_showdown:altarianite` | altaria |
| `mega_showdown:ampharosite` | ampharos |
| `mega_showdown:audinite` | audino |
| `mega_showdown:banettite` | banette |
| `mega_showdown:beedrillite` | beedrill |
| `mega_showdown:blastoisinite` | blastoise |
| `mega_showdown:blazikenite` | blaziken |
| `mega_showdown:cameruptite` | camerupt |
| `mega_showdown:charizardite_x` | charizard |
| `mega_showdown:charizardite_y` | charizard |
| `mega_showdown:charizardite_z` | charizard |
| `mega_showdown:diancite` | diancie |
| `mega_showdown:electrodite` | electrode |
| `mega_showdown:galladite` | gallade |
| `mega_showdown:garchompite` | garchomp |
| `mega_showdown:gardevoirite` | gardevoir |
| `mega_showdown:gengarite` | gengar |
| `mega_showdown:glalitite` | glalie |
| `mega_showdown:golisominite` | golisomite |
| `mega_showdown:golisopedite` | golisopede |
| `mega_showdown:gyaradosite` | gyarados |
| `mega_showdown:heracronite` | heracross |
| `mega_showdown:houndoominite` | houndoom |
| `mega_showdown:kangaskhanite` | kangaskhan |
| `mega_showdown:klinklanite` | klinklang |
| `mega_showdown:latiasite` | latias |
| `mega_showdown:latiosite` | latios |
| `mega_showdown:lopunnite` | lopunny |
| `mega_showdown:lucarionite` | lucario |
| `mega_showdown:manectite` | manectric |
| `mega_showdown:mawilite` | mawile |
| `mega_showdown:medichamite` | medicham |
| `mega_showdown:meloflite` | melofly |
| `mega_showdown:metagrossite` | metagross |
| `mega_showdown:mewtwonite_x` | mewtwo |
| `mega_showdown:mewtwonite_y` | mewtwo |
| `mega_showdown:pidgeotite` | pidgeot |
| `mega_showdown:pinsirite` | pinsir |
| `mega_showdown:sablenite` | sableye |
| `mega_showdown:salamencite` | salamence |
| `mega_showdown:sceptilite` | sceptile |
| `mega_showdown:scizorite` | scizor |
| `mega_showdown:sharpedonite` | sharpedo |
| `mega_showdown:slowbronite` | slowbro |
| `mega_showdown:starstellarite` | starstellation |
| `mega_showdown:steelixite` | steelix |
| `mega_showdown:swampertite` | swampert |
| `mega_showdown:tanglarite` | tanglare |
| `mega_showdown:tyranitarite` | tyranitar |
| `mega_showdown:venusaurite` | venusaur |
| `spammegas:alloettite` | alloette |
| `spammegas:alloettitevex` | alloette |
| `spammegas:archeonite` | archeops |
| `spammegas:articunite` | articuno |
| `spammegas:charizardite_z` | charizard |
| `spammegas:clockworkleavannite` | leavanny |
| `spammegas:coppergolurkite` | golurk |
| `spammegas:crobatnite` | crobat |
| `spammegas:darmanitanitez` | darmanitan |
| `spammegas:dudunsparcitex` | dudunsparce |
| `spammegas:dudunsparcitey` | dudunsparce |
| `spammegas:electinite` | electivire |
| `spammegas:electrodite` | electrode |
| `spammegas:espeonite` | espeon |
| `spammegas:falinksitex` | falinks |
| `spammegas:falinksitey` | falinks |
| `spammegas:flammikite` | flammiko |
| `spammegas:flareonite` | flareon |
| `spammegas:flygonite` | flygon |
| `spammegas:flygonitel` | flygon |
| `spammegas:galladitemidnight` | gallade |
| `spammegas:gardevoiritemidnight` | gardevoir |
| `spammegas:gardevoiritez` | gardevoir |
| `spammegas:glaceonite` | glaceon |
| `spammegas:golisominite` | golisomite |
| `spammegas:golisopedite` | golisopede |
| `spammegas:haxorusite` | haxorus |
| `spammegas:helioliskite` | heliolisk |
| `spammegas:hypnoite` | hypno |
| `spammegas:jolteonite` | jolteon |
| `spammegas:jynite` | jynx |
| `spammegas:klinklanite` | klinklang |
| `spammegas:krookodilite` | krookodile |
| `spammegas:leafeonite` | leafeon |
| `spammegas:liepardite` | liepard |
| `spammegas:lucarionitemidnight` | lucario |
| `spammegas:luxraynite` | luxray |
| `spammegas:magmornite` | magmortar |
| `spammegas:meloflite` | melofly |
| `spammegas:moltresite` | moltres |
| `spammegas:octillerynite` | octillery |
| `spammegas:poliwranite` | poliwrath |
| `spammegas:polymerization` | blue eyes |
| `spammegas:sandstonestonjournite` | stonjourner |
| `spammegas:serperiornite` | serperior |
| `spammegas:starstellarite` | starstellation |
| `spammegas:sylveonite` | sylveon |
| `spammegas:tanglarite` | tanglare |
| `spammegas:tropinite` | tropius |
| `spammegas:typhlonite` | typhlosion, typhlosion-hisui |
| `spammegas:umbreonite` | umbreon |
| `spammegas:wamekite` | wamek |
| `spammegas:whimsinite` | whimsicott |
| `spammegas:zapdosite` | zapdos |
| `spammegas:zoroarnite` | zoroark |
| `zamega:absolitez` | absol |
| `zamega:barbaracite` | barbaracle |
| `zamega:baxcalibrite` | baxcalibur |
| `zamega:chandelurite` | chandelure |
| `zamega:chesnaughtite` | chesnaught |
| `zamega:chimechite` | chimecho |
| `zamega:clefablite` | clefable |
| `zamega:crabominite` | crabominable |
| `zamega:darkranite` | darkrai |
| `zamega:delphoxite` | delphox |
| `zamega:dragalgite` | dragalge |
| `zamega:dragoninite` | dragonite |
| `zamega:drampanite` | drampa |
| `zamega:eelektrossite` | eelektross |
| `zamega:emboarite` | emboar |
| `zamega:excadrite` | excadrill |
| `zamega:falinksite` | falinks |
| `zamega:feraligite` | feraligatr |
| `zamega:floettite` | floette |
| `zamega:froslassite` | froslass |
| `zamega:garchompitez` | garchomp |
| `zamega:glimmoranite` | glimmora |
| `zamega:golisopite` | golisopod |
| `zamega:golurkite` | golurk |
| `zamega:greninjite` | greninja |
| `zamega:hawluchanite` | hawlucha |
| `zamega:heatranite` | heatran |
| `zamega:lucarionitez` | lucario |
| `zamega:magearnite` | magearna |
| `zamega:malamarite` | malamar |
| `zamega:meganiumite` | meganium |
| `zamega:meowsticite` | meowstic, meowstic-f |
| `zamega:pyroarite` | pyroar |
| `zamega:raichunitex` | raichu |
| `zamega:raichunitey` | raichu |
| `zamega:scolipite` | scolipede |
| `zamega:scovillainite` | scovillain |
| `zamega:scraftinite` | scrafty |
| `zamega:skarmorite` | skarmory |
| `zamega:staraptite` | staraptor |
| `zamega:starminite` | starmie |
| `zamega:tatsugirinite` | tatsugiri |
| `zamega:victreebelite` | victreebel |
| `zamega:zeraorite` | zeraora |
| `zamega:zygardite` | zygarde |
