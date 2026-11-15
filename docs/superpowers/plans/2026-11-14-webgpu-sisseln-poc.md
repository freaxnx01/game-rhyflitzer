# WebGPU Sisseln PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `poc/webgpu-sisseln/index.html` renders Sisseln from `data/world_hochrhein.json` + `data/terrain_hochrhein.mmh` with `WebGPURenderer` and the New York PoC's look (time presets, wet roads, lamps, reflections), and a Rhyflitzer car drives through it.

**Architecture:** pure, node-tested modules for slicing and geometry data (`sisseln-slice.js`, `sisseln-geom.js`); three/TSL builders that turn them into meshes; look modules copied from `poc/webgpu/js/` and trimmed of Manhattan code; a small new car controller.

**Tech Stack:** vanilla ES modules, three.js 0.187.0 (`three/webgpu`, `three/tsl`) from jsDelivr, node:test, Playwright (Python).

**Spec:** `docs/superpowers/specs/2026-11-14-webgpu-sisseln-poc-design.md`

## Global Constraints

- Only files under `poc/webgpu-sisseln/`, `tests/` and `CREDITS.md` change. `poc/webgpu/`, `index.html`, root `*.js`, `data/`, `pipeline/` stay untouched.
- Import map exactly as `poc/webgpu/index.html` (three@0.187.0, keys `three`, `three/webgpu`, `three/tsl`, `three/addons/`).
- Slice `SLICE = { x0: -700, x1: 1300, z0: -1000, z1: 1000 }` (world metres, x/z = three.js x/z, y up).
- Root imports allowed only from three-free modules: `parseMmh` (`../../worlds.js`), helpers from `../../world.js`, `../../gltfvehicle.js` (as `poc/webgpu/js/poc-car.js` does). Do not ship `city-config.js`, `city-grid.js`, `nyc-geodata.js` or any `.bin.gz`.
- At most 16 real point lights for street lamps; other lamps emissive only.
- Copied files keep the MIT notice of `poc/webgpu/LICENSE` (copy the LICENSE file too); new edits marked `// PoC Sisseln:`.
- Playwright runs in the foreground, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Commit and push after every task.

## Review Focus

- Features straddling the slice edge (a road from inside to outside) are kept, clipped or dropped consistently, never crash the builder — Task 1 test.
- The Rhine tiles (`kind: "water"`, `level` ≈ 5.5, z -940 … -360) are inside the slice and render at their `level` — Task 1 test + Task 3.
- Empty or missing optional arrays (`streams`, `fields`, `props`) do not throw — Task 1 test.
- No page errors on SwiftShader with and without `?webgl=1` — Task 6.
- Frame rate: lamp light cap holds when driving along a long lit road — Task 4 (`pickLampLights` test).

---

### Task 1: Pure slice filter `sisseln-slice.js`

**Files:** Create `poc/webgpu-sisseln/js/sisseln-slice.js`; Test `tests/poc-sisseln-slice.test.mjs`

**Interfaces:** Produces `SLICE`; `inSlice(x, z, box = SLICE) -> boolean`; `ringTouches(ring, box) -> boolean` (any point inside, or ring bbox overlaps box); `sliceWorld(world, box = SLICE) -> { roads, buildings, water, streams, forests, fields, props, landmarks: { plattform, dsmChimney } }` (arrays default to `[]`; `landmarks` from `world.anchors.landmarks`).

- [ ] **Step 1: Failing tests** (small hand-made world objects, no file I/O):
  - `sliceWorld_KeepsInsideDropsOutside`: a building ring at (100, 100) kept, one at (5000, 0) dropped; a road with points (1200, 0)…(1500, 0) kept (touches).
  - `sliceWorld_MissingArrays_AreEmpty`: `sliceWorld({ anchors: { landmarks: {} } })` returns `[]` for every list.
  - `sliceWorld_RealWorld_HasRhineAndLandmarks`: reads `data/world_hochrhein.json` with `fs`, asserts ≥ 1 water entry with `level` between 5 and 6 and z < -360, `landmarks.plattform` and `landmarks.dsmChimney` inside `SLICE`, ≥ 100 buildings.
- [ ] **Step 2:** `node --test tests/poc-sisseln-slice.test.mjs` → FAIL.
- [ ] **Step 3:** Implement (water rings: `w.rings`; buildings: `b.ring`; roads/streams: `pts`; forests/fields: `ring`; props: `x, z`).
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(poc): Sisseln slice of the world data (#987)`, push, open the draft PR.

### Task 2: Pure geometry data `sisseln-geom.js`

**Files:** Create `poc/webgpu-sisseln/js/sisseln-geom.js`; Test `tests/poc-sisseln-geom.test.mjs`

**Interfaces:** `heightAt(terrain, x, z) -> number` (bilinear on `parseMmh` result, `hdr.x0 + i*hdr.step`, `hdr.z0 + j*hdr.step`; clamp at edges); `roadRibbon(pts, width) -> { positions: Float32Array, uvs: Float32Array, indices: Uint32Array }` (u 0…1 across, v = metres along); `lampSpots(roads, spacing = 30) -> [{x, z}]` (classes `residential` and above); `pickLampLights(spots, x, z, n = 16) -> spots` (n nearest); `scatterInRing(ring, density, seed) -> [{x, z}]` (seeded, point-in-polygon).

- [ ] **Step 1: Failing tests:** `heightAt` on a 2×2 grid returns the corner values and their mean in the centre; `roadRibbon([[0,0],[10,0]], 4)` has 4 positions, width 4 across, uv v 0 and 10; `pickLampLights` of 40 spots returns 16, the nearest first; `scatterInRing` is deterministic for a seed and every point is inside the ring.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** Commit `feat(poc): Sisseln geometry helpers (#987)`, push.

### Task 3: Page, gate, look and ground

**Files:** Create `poc/webgpu-sisseln/index.html`, `css/style.css`, `LICENSE` (copy), `js/main.js`; copy and trim from `poc/webgpu/js/`: `poc-gate.js`, `poc-look.js`, `lighting.js`, `post-processing.js`; create `js/sisseln-ground.js`, `js/sisseln-materials.js`.

**Interfaces:** consumes Task 1–2. `sisseln-materials.js` exports the wet-road/puddle material, a water material with reflections, a plaster facade material and a plain wall material, taken out of `poc/webgpu/js/tsl-materials.js` without any `city-config.js` import (uniforms for wetness/time kept, Manhattan bounds removed).

- [ ] **Step 1:** `index.html` with the import map, the `#no-webgpu` message, a key hint (T, R, WASD, V, H) and a credit line (© OpenStreetMap contributors ODbL, swissALTI3D/swissSURFACE3D © swisstopo, Kanton Aargau, three.js demo code MIT © Mr.doob).
- [ ] **Step 2:** `main.js`: gate (`hasWebGPU`, `wantsForcedWebGL`), fetch `../../data/world_hochrhein.json` and `../../data/terrain_hochrhein.mmh`, `sliceWorld`, renderer, `LightingSystem` with the four presets re-tuned for a 2 km village (shadow box follows the car, fog hides the slice edge), post-processing, `T`/`R` via `poc-look.js`.
- [ ] **Step 3:** `sisseln-ground.js`: terrain mesh over `SLICE` at 8 m step from `heightAt`, field rings as ground colour, water rings as flat meshes at `level` with the reflection material, streams as narrow ribbons.
- [ ] **Step 4:** Serve locally, load `?webgl=1` headless once (foreground) to check for page errors. Commit `feat(poc): Sisseln page with terrain, water and the WebGPU look (#987)`, push.

### Task 4: Roads, lamps, buildings, trees, landmarks

**Files:** Create `js/sisseln-roads.js`, `js/sisseln-buildings.js`, `js/sisseln-trees.js`, `js/sisseln-landmarks.js`.

- [ ] **Step 1:** Roads: `roadRibbon` per road (`w` width, y from `heightAt` + 0.05), merged, wet material; lamp posts at `lampSpots` (instanced, emissive heads at night), 16 point lights re-placed by `pickLampLights` around the car every 0.5 s.
- [ ] **Step 2:** Buildings: extrude `ring` to `h` from the ground height at its centre; `roof: 'gable'` → simple gable along the `rect` long axis, else flat; `palette` `village` → plaster, `industrial` → grey wall; windows lit at night via the material's time uniform. Merge per material.
- [ ] **Step 3:** Trees: `scatterInRing` in forest rings (cap ~4000 trees total), instanced, using the New York tree mesh/material where it is not tied to street placements.
- [ ] **Step 4:** Landmarks: Plattform stand-in at `landmarks.plattform` (triangular frame `side` 6.0, deck `side` 9.84 at y 5.735, roof `side` 12.10 at eaves 8.2; import `PLATTFORM` from `../../plattform.js` only if `node -e "import('./plattform.js')"` succeeds from the repo root, else copy these numbers); DSM chimney: cylinder `h` 140 at `landmarks.dsmChimney`.
- [ ] **Step 5:** Load `?webgl=1` headless (foreground), no page errors. Commit `feat(poc): roads, lamps, buildings, trees and landmarks in Sisseln (#987)`, push.

### Task 5: Car, controller, camera

**Files:** copy `poc-car.js`, `poc-car-attach.js`, `vehicle-lights.js` from `poc/webgpu/js/` (paths unchanged, `CAR_URL` stays `../../assets/bulldog.glb`); create `js/sisseln-car.js`.

- [ ] **Step 1:** `sisseln-car.js`: arcade controller (W/S throttle/brake, A/D steer, top speed ~25 m/s), y = `heightAt` + ride height, pitch from two height samples, push-out from building footprints (point-in-ring against the slice's buildings via a `makeGrid` from `../../world.js`), stays inside `SLICE`. Start on the nearest road point to the Plattform, facing it. `V` cycles chase / close / top camera; `H` toggles the hint.
- [ ] **Step 2:** Headlights and tail lamps via `vehicle-lights.js` and `setLampsLit(isNightPreset(time))`.
- [ ] **Step 3:** Commit `feat(poc): drive a Rhyflitzer car through Sisseln (#987)`, push.

### Task 6: Smoke test, README, credits

**Files:** Create `tests/test_poc_webgpu_sisseln.py` (modelled on `tests/test_poc_webgpu.py`), `poc/webgpu-sisseln/README.md`; modify `CREDITS.md`.

- [ ] **Step 1:** Tests: page without WebGPU shows `#no-webgpu` and no page errors; `?webgl=1` shows a canvas, no page errors, and `T` / `R` keydowns throw nothing. Optional screenshots per preset dry/wet when `PW_CDP_ENDPOINT` is set (skip otherwise), never committed.
- [ ] **Step 2:** Run (foreground, capped): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest tests/test_poc_webgpu_sisseln.py -q` → PASS; `node --test tests/*.test.mjs` → all PASS.
- [ ] **Step 3:** README: what it is, link to the spec, sources (`poc/webgpu/` @ the commit named in its README, MIT), data licences from `data/README.md`, keys, `?webgl=1`, URL `https://rhyflitzer.ch/poc/webgpu-sisseln/`. `CREDITS.md`: one line for the PoC (code MIT © Mr.doob, Sisseln data as in `data/README.md`).
- [ ] **Step 4:** Commit `docs(poc): Sisseln PoC README, credits and smoke test (#987)`, push, update the PR description with the tasks done.
