# WebGPU PoC: Sisseln

Second proof of concept (#987): the **WebGPU look of the New York PoC** (`poc/webgpu/`) applied to **Rhyflitzer's own
map data**. It answers one question — *would our region look so much better after a WebGPU port that the port is worth
doing?* It is a look-and-feel experiment, not a game feature, and the game is untouched.

The world is built in the browser at load time from the files the game already ships:

- `data/world_hochrhein.json` (format `MMW1`) — roads, buildings, water, streams, forests, fields, landmark anchors
- `data/terrain_hochrhein.mmh` (format `MMH1`) — the height grid, read with `parseMmh` from `worlds.js`

No new data file, no pipeline run, no build step.

## View

- After merge: <https://rhyflitzer.ch/poc/webgpu-sisseln/>
- Locally: `python3 -m http.server 8000` from the repo root, then <http://localhost:8000/poc/webgpu-sisseln/>
- Needs a browser with WebGPU: Chrome or Edge, Safari 26+, Firefox on Windows. Without an adapter the page shows a
  message instead of starting — three's `WebGPURenderer` would otherwise fall back to WebGL2 without saying so.
- `?webgl=1` is a test and comparison hook that renders through three's WebGL2 backend, not WebGPU.

## Keys

- `W` `A` `S` `D` (or the arrow keys) drive the Rhyflitzer car
- `T` cycles the time of day (Golden Hour, Mittag, Blaue Stunde, Nacht)
- `R` toggles wet roads
- `V` cycles the camera (Verfolgung, Nah, Vogelschau)
- `H` hides the overlay for a clean view

At night the street lamps and the car's head and tail lights light the road.

## The slice

`js/sisseln-slice.js` cuts a box out of the world file: **x −700 … 2300, z −1000 … 1000** in world metres (world x/z
map straight onto three.js x/z, y up). It holds the Plattform Sisslerfeld, the DSM chimney, the Rhine north of the
village and Sisseln's built-up centre — 659 buildings, ~750 road pieces, the forests and the farmland.

The design (`docs/superpowers/specs/2026-11-14-webgpu-sisseln-poc-design.md`) named `x1 = 1300` for a box holding "the
village centre". The village centre is actually at x 1500 … 2000, so that box held the Sisslerfeld and 105 buildings
but not the village; the design leaves the exact bounds to the builder, and `x1 = 2300` keeps everything it named.

Polylines and rings that straddle the edge are clipped to the slice plus a 300 m margin, and the terrain is built over
that same outer box, so nothing floats past the ground. Fog hides the edge itself.

## What it draws

| From the data | As |
|---|---|
| `terrain_hochrhein.mmh` | one ground mesh at the file's own 8 m step, with the `fields` crop colours and the `forests` floor painted into its vertex colours |
| `roads` | ribbons at their OSM width, with UVs the wet-road material uses; street lamps every 30 m along class `residential` and above |
| `buildings` | footprint rings extruded to `h`; `roof: gable` gets a gable over its fitted `rect`, everything else a flat cap; `palette` picks plaster or industrial wall |
| `water`, `streams` | flat surfaces at their own `level`, and narrow ribbons, with wind ripples and reflections |
| `forests` | trees scattered inside the rings with a seeded generator, instanced, capped at 4000 |
| `anchors.landmarks` | stand-ins for the Plattform (at the measurements of `PLATTFORM` in `plattform.js`) and the 140 m DSM chimney |

At most **16 real point lights** follow the car along the lit roads; every other lamp head only glows.

## Sources and licences

- Demo code: <https://github.com/mrdoob/slop-newyork> at commit `536a907c605964421563f12f15c5e00d735fc94f`, MIT,
  © Mr.doob — see `LICENSE`. Copied here via `poc/webgpu/`: `poc-gate.js`, `poc-look.js`, `lighting.js`,
  `post-processing.js`, `vehicle-lights.js`, `poc-car.js`, `poc-car-attach.js`, and the material helpers that
  `sisseln-materials.js` takes out of `tsl-materials.js`. Changes are marked `// PoC Sisseln:`.
- three.js 0.187.0 from jsDelivr via the import map in `index.html` (MIT).
- Map data: © OpenStreetMap contributors, ODbL (<https://www.openstreetmap.org/copyright>).
- Terrain and buildings: swissALTI3D / swissSURFACE3D / swissBUILDINGS3D © swisstopo, Open Government Data.
- Farmland: Landwirtschaftliche Nutzungsflächen © Kanton Aargau via geodienste.ch.
- Car: `assets/bulldog.glb`, see `assets/bulldog.LICENSE.md` and `CREDITS.md` in the repo root.

The full data licence list is `data/README.md`; the page itself shows a short credit line.

## Tests

- `node --test tests/poc-sisseln-slice.test.mjs tests/poc-sisseln-geom.test.mjs` — the pure slice filter and the
  geometry helpers.
- `tests/test_poc_webgpu_sisseln.py` — the gate, the WebGL2 render path, the keys. Run it in the **foreground**; the
  whole slice builds in a few seconds, so unlike the New York PoC it does not need the GPU browser.
- `test_poc_shots` in the same file writes eight look screenshots (4 times of day, dry and wet) when `PW_CDP_ENDPOINT`
  points at the GPU browser. They are never committed.

Design: `docs/superpowers/specs/2026-11-14-webgpu-sisseln-poc-design.md`

## Not in the PoC

No traffic, pedestrians, PostAuto, train, helicopter, audio, minimap, races or i18n; no port of the game's shaders or
physics; no `version.js` bump, no hub card, no release. New York (`poc/webgpu/`) is unchanged — shared code is copied,
never moved.
