# Map Madness

*Codename: Rhyflitzer*

An open-world arcade racing game for the browser, in the spirit of Midtown Madness 1. Race through real towns built from open geodata, starting at home on the Hochrhein: Bad Säckingen, Stein, Sisseln and Sisslerfeld, with the Rhine and the old wooden bridge right in the middle.

Later: pick any region on a map, and the game builds it into a world you can race.

Dedicated to my daughter.

## Status

Early prototype.

- `prototype/index.html`: playable three.js prototype (single file, buildless). Hochrhein layout (Sisseln, Sisslerfeld, Stein, Bad Säckingen) from OpenStreetMap when `data/world_hochrhein.json` exists (built by `pipeline/osm.py`), hand-traced fallback otherwise; checkpoint race, two graphic styles (T), synthesized sound. Serve it over HTTP (`python -m http.server`) and open it in a browser.
- A second region, **Ehrendingen** AG (with the Wanderweg and Im Böndlern), is chosen on the start screen or with `?region=ehrendingen`; the Hochrhein stays the default. See [docs/11](docs/11-pipeline-osm.md).
- `pipeline/terrain.py`: pipeline step 1, measured terrain from swisstopo and LGL. See [docs/08](docs/08-pipeline-terrain.md).
- `pipeline/osm.py`: pipeline step 2, OSM world (roads, Rhine, bridges, buildings, landmarks, markings) as one JSON file the prototype loads automatically. See [docs/11](docs/11-pipeline-osm.md).

## Idea in short

- **Arcade, not simulation**: lots of grip, big jumps, forgiving crashes
- **Real places**: buildings, roads and terrain from OpenStreetMap, swisstopo and LGL Baden-Württemberg, plus hand-built landmarks
- **Forbidden shortcuts**: the pedestrian-only Holzbrücke is fair game
- **Two graphic styles**, switchable: chunky MM1 retro and a soft, atmospheric low-poly look
- **Modes** from MM1: Checkpoint, Blitz, Circuit, Cruise
- **Region editor** (later): drag a frame on the map, get a playable world

## Tech

three.js, vanilla JS, buildless. Rapier (WASM) for vehicle physics. A separate data pipeline turns geodata into game tiles. Self-hosted.

## Docs

| Document | Content |
|---|---|
| [Status and next steps](docs/10-status-and-next-steps.md) | **Start here:** decisions, prototype internals, known issues, next steps |
| [Background](docs/00-background-midtown-madness.md) | Midtown Madness, fan-made European cities, why this project exists |
| [Concept](docs/01-concept.md) | Pillars, modes, graphic styles, starting region, hero assets |
| [Data sources](docs/02-data-sources.md) | OSM, swisstopo, LGL; what each provides; licenses |
| [Technical architecture](docs/03-tech-architecture.md) | Stack, hard parts, performance, large worlds, terrain LOD |
| [Region editor](docs/04-region-editor.md) | Player-picked regions, pipeline design, limits |
| [Glossary](docs/05-glossary.md) | Graphics and geodata terms explained |
| [Photo capture](docs/06-photo-capture.md) | Photogrammetry, GoPro street capture, texture source licences |
| [Brands and permissions](docs/07-brands-and-permissions.md) | Logos, trademarks, who to ask, permission tracker |
| [Pipeline: terrain](docs/08-pipeline-terrain.md) | swissALTI3D + LGL DGM1 → `.mmh` heightmap |
| [Design workflow](docs/09-design-workflow.md) | Claude Design ↔ CLI round trip, tokens, rules, checklist |
| [Pipeline: OSM world](docs/11-pipeline-osm.md) | Geofabrik extract + osmium → `world_hochrhein.json` (roads, water, buildings, anchors) |
| [UI mockups](design/mockups/README.md) | Claude Design artboards: title, setup, car select, HUD, results, style sheet |
| [Ideas](ideas.md) | Loose ideas, not yet planned |

## License

- **Code**: [MIT](LICENSE.md)
- **Geodata** keeps its own license and requires attribution:
  - © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)
  - © swisstopo
  - Datengrundlage: LGL, www.lgl-bw.de ([dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0))
- **Hand-made assets** (models, textures, sounds): license to be decided once the first ones exist
- **Third-party 3D models** keep their own license, are credited here and in the game, and live under `prototype/assets/models/`:
  - „Eiffel Tower" ([skfb.ly/AIU9](https://skfb.ly/AIU9)) by Johnson Martin, [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/); converted to metal/rough and compressed (meshopt), materials replaced in-game (see `prototype/assets/models/eiffel_tower.LICENSE.txt`)
  - „2020 Mazda 3 Hatchback" ([skfb.ly/pAOpM](https://skfb.ly/pAOpM)) by OUTPISTON, [CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/); used without the maker's name and badges. The modified model file stays under CC BY-NC-SA 4.0, and because of it **the game must stay non-commercial** (no paid release, no paid downloads).

Not affiliated with Microsoft, Angel Studios or Rockstar Games. Midtown Madness is a trademark of its respective owner.
