# WebGPU Sisseln PoC

(#987)

## Intent

The first WebGPU PoC (`poc/webgpu/`, PR#814, spec `2026-11-10-webgpu-newyork-poc-design.md`) showed mrdoob's Slop New
York look with a Rhyflitzer car in Manhattan. The maintainer now wants **the WebGPU graphics with the map data of
Sisseln**: the same look (sky, times of day, lights, wet streets, reflections, trees) applied to Rhyflitzer's own
world, so they can judge how *our* region would look after a WebGPU port.

It is a look-and-feel experiment, not a game feature. It answers: *does Sisseln, built from our own data, look so
much better with WebGPU that porting the game is worth it?*

## Why not reuse the New York city

The New York PoC's city is hard-wired to Manhattan: `poc/webgpu/js/city-grid.js` exports `ISLAND_BOUNDS`, `BLOCKS`,
`streetZ`, `avenueX`, `ALL_AVENUES`, the coastline and piers; roads, road paint, street details and culling are built
on that grid. Sisseln has organic OSM roads, terrain and the Rhine. So the **look modules** are reused, the **world
building** is new and reads our data.

## Goals

- A separate page `poc/webgpu-sisseln/index.html`, reachable after merge at
  `https://rhyflitzer.ch/poc/webgpu-sisseln/` (and locally via `python3 -m http.server`).
- Rendered with `WebGPURenderer` and TSL, three.js 0.187.0 from jsDelivr via an import map (same pin as `poc/webgpu/`).
- The world is built from the game's own files, loaded at runtime from `../../data/`:
  `world_hochrhein.json` (format `MMW1`) and `terrain_hochrhein.mmh` (format `MMH1`). No new data files, no pipeline
  run.
- What is in the slice (from the world file): **terrain**, **roads** (OSM polylines with their widths), **buildings**
  (rings extruded to their height `h`, roof type `roof` where cheap), **water** (the Rhine and streams, with
  reflections), **forests** (instanced trees), **fields** (ground colour), and the **Plattform Sisslerfeld** and the
  **DSM chimney** at their `anchors.landmarks` positions.
- One Rhyflitzer glTF car from `assets/` (default `bulldog.glb`, as in the New York PoC) driven in third person.
- The same keys as the New York PoC: `T` cycles the time of day (golden, midday, twilight, midnight), `R` toggles wet
  roads, `W` `A` `S` `D` drive, `V` cycles the camera, `H` toggles the hint. Street lamps along the roads light the
  street at night; the car's head and tail lights work.
- The same no-WebGPU gate as the New York PoC (`poc-gate.js`): without an adapter a message, not a black canvas.

## Non-goals

- No change to the game: `index.html`, root `*.js`, `data/`, `pipeline/`, the three.js 0.170 import map stay untouched.
- No change to `poc/webgpu/` (New York stays as it is; shared code is copied, not moved).
- No traffic, pedestrians, PostAuto, train, helicopter, audio, minimap, races, HUD beyond the key hint, no i18n.
- No port of the game's GLSL shaders, no game physics; the PoC's car handling only has to feel plausible.
- No `version.js` bump, no hub card, no release.

## Anti-goals (fails even if it works)

- The game breaks or changes in any way.
- It looks no better than the game today because effects were left out (a "no" verdict is valid, a lazy one is not).
- Third-party code or data without attribution.
- Load time so long the maintainer gives up before seeing anything (aim: first frame within ~10 s on a normal
  connection with the GPU browser).

## Constraints

- **Stack:** buildless, ES modules, no `package.json`, no bundler.
- **Licences:** code taken from `poc/webgpu/` keeps its MIT notice (© Mr.doob); `poc/webgpu-sisseln/README.md` names
  the sources. Data credits are those of `data/README.md` (OSM ODbL, swisstopo, Kanton Aargau) and must be shown on
  the page (a small credit line is enough). Car credit per its `assets/<car>.LICENSE.md`.
- **Game stays non-commercial** (unchanged).
- **Pure helpers may be imported** from the repo root where they have no three.js and no DOM: `parseMmh` from
  `worlds.js`, the grid/polyline helpers from `world.js`. Do not import root modules that import `three` (version
  clash 0.170 vs 0.187).
- **Agent-dev memory cap:** heavy local jobs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- **Verification:** the agent box and CI have no GPU. A headless SwiftShader run confirms "page loads, no-WebGPU message
  or WebGL2 fallback via `?webgl=1`, no console errors". Screenshots per time preset dry/wet come from the homelab GPU
  browser (`PW_CDP_ENDPOINT`, #304) when reachable, as in `tests/test_poc_webgpu_shots.py`. The verdict is the
  maintainer's, in their own browser.

## Decided by the maintainer

- Second PoC, **WebGPU look + Sisseln map data**; approved the playback "own page, look modules from New York, world
  from our data, same keys, no game port" (2026-11-14).

## Calls made by Claude (maintainer can override)

- **Slice:** the box x -700 … 1300, z -1000 … 1000 in world metres (origin = Sisseln, `world.origin`; world x/z map
  straight to three.js x/z, y up). It holds the village centre, the Plattform (`anchors.landmarks.plattform`,
  x 304.8 z 427.1), the DSM chimney (x 1065.2 z 345.1) and the Rhine north of the village: the Rhine is stored as
  500 m water tiles of `kind: "water"` at `level` ≈ 5.5 (absolute y) between z ≈ -940 and -360 (checked
  2026-11-14). Features are clipped or filtered to the box at load time; fog hides the edge. The start point is on
  the road next to the Plattform, facing it.
- **Data loading:** fetch the full `world_hochrhein.json` (7.5 MB) and filter in the browser. Rejected: a pre-cut
  slice file (a new data file to keep in sync).
- **Plattform and chimney:** simple stand-in meshes from their known dimensions (the Plattform's triangular frame,
  deck and roof from `PLATTFORM` in `plattform.js`, which is pure and may be imported; the chimney as a tall
  cylinder with `h`). Rejected: porting the game's full Plattform mesh code out of `index.html`.
- **Look modules copied from `poc/webgpu/js/`:** lighting and time presets, post-processing (SSR, bloom, grading),
  TSL materials (wet road/puddles), vehicle lights, the car attach code, the camera rig, the vehicle controller, the
  look keys (`poc-look.js`) and the gate (`poc-gate.js`). Facades: the New York facade materials may be reused on
  the Swiss buildings if they look plausible for a village (plaster, lit windows at night); Manhattan-specific
  details (fire escapes, skyscraper crowns, subway) stay out.
- **Street lamps:** placed along roads of class `residential` and above at a fixed spacing, using the New York
  lamp/light approach; capped in number so the frame rate holds.
- **Collision:** the car stays on the terrain height (`MMH1` sample) and does not drive through buildings in the slice
  (a simple footprint test is enough).

### Settled after the builder check (Claude's calls)

- **Coupling of the New York modules:** `lighting.js`, `post-processing.js`, `vehicle-lights.js`, `poc-gate.js`,
  `poc-look.js` copy cleanly. `tsl-materials.js` (imports `ISLAND_BOUNDS`, `streetZ` … from `city-config.js`),
  `controllers.js` (NY block grid, `getGroundHeight`) and `cameras.js` (`bryantParkLawn`) are Manhattan-bound:
  take from them only what is needed (the wet-road/puddle material, the facade material, a chase camera) into new,
  trimmed files; do not ship `city-config.js`, `nyc-geodata.js` or the `.bin.gz` files. The car gets a **small new
  controller** (arcade steering, terrain-height sample, building footprint push-out), not `controllers.js`.
- **Wet roads:** the road ribbon carries its own UVs (u across, v along the length) so the wet/puddle material
  applies; road paint is optional.
- **Lamp lights:** at most 16 real point lights near the car, re-used as the car moves; the other lamps glow
  (emissive) only.
- **Lighting scale:** shadow camera and fog are re-tuned for a 2 km village (shadow box follows the car).
- **Water:** the `water` rings (with their `level`) and the `streams` polylines; `waterSdf` is not used.
- **Buildings:** `roof` is `gable` or `flat`; `palette` `village` → light plaster with windows, `industrial` → plain
  grey wall.
- **Trees:** forests are polygons only; trees are scattered inside the rings (seeded, capped density) and drawn
  instanced with the New York tree approach where it is not tied to street placements.
- **Terrain:** cropped to the box at 8–16 m grid step from `parseMmh` (`worlds.js`).
- **Root imports:** `gltfvehicle.js` (as `poc/webgpu/js/poc-car.js` already does), `parseMmh` from `worlds.js`, pure
  helpers from `world.js`. `plattform.js` only if its import chain (`walkways.js`, `foot.js`, `world.js`) loads
  under `node` without three/DOM; else copy the few `PLATTFORM` numbers.
- **Tests:** one new node test file for the slice filter, one new Playwright smoke file
  (`tests/test_poc_webgpu_sisseln.py`, modelled on `tests/test_poc_webgpu.py`); screenshots optional via the GPU
  browser, as in `tests/test_poc_webgpu_shots.py`.

## Left to the builder

- Exactly which files to copy and trim from `poc/webgpu/js/`, and how the new world builder is split into modules
  (`sisseln-world.js` or similar), as long as pure parsing/filtering is testable with `node --test`.
- Road geometry details (ribbon from polyline + width, joints, markings if cheap), roof shapes, tree density.
- The exact slice bounds and start pose, within the call above.
- How the credit line and the no-WebGPU message look.

## Acceptance criteria

- `poc/webgpu-sisseln/index.html` loads with three.js 0.187.0 via the import map and shows Sisseln from our data: terrain,
  roads, extruded buildings, the Rhine with reflections, forest trees, the Plattform and DSM chimney stand-ins.
- `T` cycles four time presets, `R` toggles wet roads, the car drives with `W` `A` `S` `D`, `V` cycles the camera; at
  night street lamps and car lights light the road.
- Without WebGPU the page shows the gate message; `?webgl=1` renders through the WebGL2 backend.
- `node --test` covers the pure slice filter (features outside the box dropped, inside kept, the Plattform and chimney
  anchors inside the box) and passes together with the existing node tests.
- A Playwright smoke test (one new file) loads the page headless: no page errors, the gate message or a canvas shown.
- `README.md` in `poc/webgpu-sisseln/` with source, licences and keys; `CREDITS.md` gets a line if new third-party code
  lands. No file outside `poc/webgpu-sisseln/`, `tests/` and `CREDITS.md` changes.
