# Nicer trees: shape, colour variation, wind sway, LOD (#734, trees half)

The maintainer's note of 2026-11-07 (from Ride Tales): "its trees look much nicer than ours". This is our own design: the
shapes, colours and the sway are generated in the game, nothing is copied from any other game's models or code. The music
half of #734 is a separate spec.

## Today

- **Species and proportions** live in the pure module `trees.js:1-56` (#359): four species (`spruce`, `deciduous`, `birch`,
  `poplar`), a kind mix per `single`/`edge`/`fill` (`SPECIES_WEIGHTS`, `:6-10`), the proportions per species
  (`SPECIES_SHAPE`, `:15-20`: a `cone` or a `ball` crown, trunk height and width), the position hash `treeHash` (`:31-35`) and
  `treeColour(species, u1, u2)` (`:49-52`: hue +-0.04, lightness +0..0.12). `index.html` turns this into geometry.
- **Crown geometry** `treeGeometries(detail)` in `index.html:2555-2564`: the ball is `IcosahedronGeometry(1, 0)` squashed to
  height 1 (20 triangles, every ball the same shape, only yawed per tree), the cone `ConeGeometry(1, 1, 7)` (`single`) or an
  open 6-segment cone (`forest`); trunks are 6- or 4-segment cylinders. Triangles per tree today: forest spruce 6 + 8 = 14,
  forest ball species 20 + 8 = 28, single spruce 7 + 12 = 19, single ball 20 + 12 = 32.
- **Materials** `TREE_MAT` (`:2566`): one `MeshStandardMaterial` per part, `flatShading`, the crown white and tinted per
  instance (`setColorAt`, `:2579`). Nothing in the scene moves a tree: the loop (`:5613-5614`) has no wind.
- **Instancing** `speciesMeshes(trees, G, jitter, shadows)` (`:2569-2585`): one `InstancedMesh` per species and part. The
  scattered trees (`window.__TREES`, `:2358-2367`: 9000 draws in `REGION.treeBox`, 12 % kept, so at most 1080) are one set with
  shadows (`TREE_SOLID`, `:2588`); the OSM forest trees (`window.__FOREST`, `:2370-2378`, placed by `world.js:712-731`
  `forestTrees` under `FOREST_BUDGET` cap 85 000) are grouped per 512 m tile (`:2590-2606`), one billboard mesh and one solid
  set per tile, so three.js frustum-culls whole tiles. There is no distance LOD: a tile 3 km away draws the same 14-28
  triangles per tree as the one the car stands in (camera far plane 4200 m, `:2442`).
- **Styles** (`:3007-3015`): Original draws the crossed billboards (`trees: 'bill'`, textured `TEX.tree`, `:884`), Smooth the
  solid species meshes (`trees: 'cone'`); `applyStyle` and `treesVisible` switch them. The hideout rooms draw about 1000 solid
  trees each (`roomTrees`, `:3414-3417`, the `single` geometries, edge mix).
- **Colliders** (`world.js:934-939`, trunk radius 0.06 h) are independent of the drawn shape and stay as they are.
- **Tree count** (probe 2026-11-07, `data/world_hochrhein.json`, 7.4 MB, 328 forest polygons, 327 after `clearWoods`):
  `forestTrees` places 71 299 edge + 13 701 fill = **85 000** forest trees (the cap; 25 302 fill thinned) before the in-game
  filters (roads, rail, streams, car parks, hideout) take a few thousand away, heights 7-14 m; 283 tiles, the fullest holds
  856 trees, the nine fullest together 6751, the median tile 287. Plus at most 1080 scattered trees and about 1000 per
  hideout room. Smooth style worst case today: about 85 000 x 22 = 1.9 M triangles if every tile were in the frustum.

## Decisions (maintainer, 2026-11-08)

- **Smooth style only.** The Original style keeps its billboards (retro by design, #359).
- **Fruit trees** come mixed into single trees and forest edges as designed; **orchard rows** in the LWB `orchard` fields are a separate issue later.
- LOD radius 700/800 m and wind amplitude 0.035 are starting values, tuned after the playtest.

## Goal

Trees in the Smooth style look like trees of the Fricktal: lumpy broadleaf crowns, tiered spruces, slim birches, columnar
poplars and the Hochstamm fruit trees of the orchards, each tree slightly different in shape and colour, the crowns swaying
in the wind. Phones stay smooth: the richer geometry is only drawn near the camera, far tiles keep today's cost.

## Design

### Species (`trees.js`)

- A fifth species **`fruit`** (Hochstamm-Obstbaum, the Fricktal's Chriesibaum): short thick trunk, broad low crown, and it is a
  smaller tree: `SPECIES_SHAPE.fruit = { crown: 'ball', crownY: 0.26, crownW: 0.60, crownH: 0.56, trunkH: 0.34, trunkW: 1.15,
  bump: 0.22, heightFactor: 0.62, colour: [[0.25, 0.46, 0.33], [0.22, 0.42, 0.30]] }`. `treeParts` multiplies `h` by
  `heightFactor` (1 for the other four), so an 8 m draw becomes a 5 m fruit tree; the collider keeps `h` (a slightly taller
  trunk circle, invisible to the player).
- Weights: `single: { spruce: 0.18, deciduous: 0.40, birch: 0.10, poplar: 0.12, fruit: 0.20 }`, `edge: { spruce: 0.32,
  deciduous: 0.36, birch: 0.22, poplar: 0.06, fruit: 0.04 }`, `fill: { spruce: 0.52, deciduous: 0.36, birch: 0.07, poplar: 0.05,
  fruit: 0 }`. Fruit trees stand alone on the fields and villages, never inside a wood.
- Every species gets a **`bump`** (radial lumpiness of its crown, 0 for the cone) and a **palette of 2-3 varieties** instead of
  one colour: `deciduous` beech `[0.27, 0.45, 0.30]`, oak-olive `[0.23, 0.40, 0.28]`, lime `[0.21, 0.52, 0.37]`; `spruce` dark
  `[0.34, 0.42, 0.18]`, blue-green `[0.41, 0.30, 0.22]`; `birch` `[0.21, 0.50, 0.40]`, `[0.19, 0.46, 0.44]`; `poplar`
  `[0.29, 0.42, 0.27]`, `[0.26, 0.40, 0.30]`. The first entry of each palette is today's colour, so the overall tone of a
  wood does not change.
- `treeColour(species, u1, u2, u3)`: `u3` picks the variety (`Math.floor(u3 * palette.length)`), hue +-0.04 from `u1`,
  lightness +0..0.12 from `u2`, saturation +-0.06 from `u3`'s fraction. Callers draw three jitter values per tree instead of
  two (the `jitter` arrays in `index.html`, the rooms' `rng(278)`).
- `lodTier(dist, tier)`: pure hysteresis, `'fine'` when `dist < 700`, `'coarse'` when `dist > 800`, else `tier` unchanged.
  `LOD = { fineIn: 700, coarseOut: 800 }` exported next to it.

### Crown geometry (new pure module `treegeo.js`)

No three.js import, so `node --test` covers it. Every function returns a non-indexed unit crown as plain typed arrays,
`{ position: Float32Array, normal: Float32Array, color: Float32Array, tris: number }`, base at y = 0, top at y = 1, widest
radius 1; `index.html` wraps them in a `BufferGeometry` with the three attributes.

- **`lumpyBall(detail, bump, seed)`**: an icosphere (detail 0 = 20 faces, detail 1 = 80 faces), each vertex pushed along its
  direction by `1 + bump * (hash(direction, seed) - 0.5) * 2`, then squashed to height 1. Flat-shaded faces (the normal is the
  face normal, computed from the three displaced corners), so every lump is a visible facet. The seed is the species index, so
  a beech and a birch lump differently; the per-tree variety comes from the yaw (as today) and the colour.
- **`tieredCone(tiers, segments)`**: the spruce. Open-ended cone tiers stacked with overlap, `tiers = [[radius, baseY, height],
  ...]`: fine `[[1, 0, 0.50], [0.78, 0.28, 0.46], [0.52, 0.56, 0.44]]` with 7 segments (21 triangles), coarse one tier `[[1, 0, 1]]`
  with 6 segments (today's 6).
- **Vertex colours**: brightness `0.74 + 0.26 * y` (shaded underside, sunlit top) times a per-face +-0.04 from the face
  index hash. The crown material gets `vertexColors: true`; three.js r170 multiplies `vColor` by `instanceColor`, so the per-tree
  tint from `treeColour` still applies on top.
- **Per-species crowns**, built once per tier: `crownFor(species, tier)` in `treegeo.js` returns the right call from
  `SPECIES_SHAPE` (`cone` → `tieredCone`, `ball` → `lumpyBall(tier === 'fine' ? 1 : 0, bump, index)`), bumps: `deciduous` 0.18,
  `birch` 0.24, `poplar` 0.10, `fruit` 0.22. Poplars stay narrow through `crownW`, as today.
- **Budget, asserted by a node test**: a fine crown has at most 80 triangles, a coarse crown at most 20, a trunk stays 6 x 2
  (fine, closed) or 4 (coarse, open) segments. So per tree: fine ball species 80 + 12 = 92, fine spruce 21 + 12 = 33, coarse
  ball 20 + 8 = 28 and coarse spruce 6 + 8 = 14 (the coarse tier is today's cost).
- Trunks keep today's `CylinderGeometry` in `index.html`; only the birch marks stay as they are.

### LOD per tile (`index.html`)

- Every forest tile gets both tiers: `FOREST_MESHES[i] = { fine, coarse, bill, cx, cz, tier }`, `fine` and `coarse` each the
  `speciesMeshes` set with that tier's crowns (the trunks of the coarse tier stay the open 4-segment ones). Only one of the
  two is visible.
- `stepTreeLod()` runs once per unpaused frame on the surface in the solid style: for every tile `tier = lodTier(hypot(cx -
  camera.position.x, cz - camera.position.z), tier)` and toggles `visible` when the tier changes. 283 distance checks per frame
  is nothing; the visibility flip is a cheap flag. `treesVisible(on)` hides both tiers when off and re-applies the tier when on.
- Fine tiles are the ones whose centre is within 700-800 m of the camera: at most 9 of the 512 m tiles, by the probe at most
  6751 forest trees, so at most **0.62 M fine triangles** plus at most 1080 x 92 = 0.1 M for the scattered trees (always fine,
  they are few and cast the shadows) plus at most 0.1 M in a hideout room. Everything farther keeps today's 14-28 triangles.
  Billboards (Original style) are untouched.
- `window.__mm.treeLod()` returns `{ fineTiles, coarseTiles, fineTrees, coarseTrees }` for the tests.

### Wind sway (`index.html`)

- `TREE_WIND = { time: { value: 0 }, amp: { value: 0.035 }, patched: false }`. `TREE_MAT.crown.onBeforeCompile` adds the two
  uniforms (`shader.uniforms.uTime = TREE_WIND.time`, the same object, so the loop writes into it) and, after
  `#include <begin_vertex>`, bends the unit crown by its height: the base (y = 0) stays, the top (y = 1) moves
  `amp * sin(uTime * 1.3 + phase)` in x and `amp * 0.6 * sin(uTime * 0.9 + phase * 1.7)` in z, with
  `phase = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.23` (`#ifdef USE_INSTANCING`, 0 otherwise), so neighbours are
  out of step and a row never sways as one. The amplitude is in crown units: 3.5 % of the crown radius, about 15 cm on a 4 m
  crown, a breeze, not a storm. `customProgramCacheKey` returns `'tree-wind'`.
- `loop` adds `dt` to `TREE_WIND.time.value` in the unpaused branch only: paused and the pause screen, the trees stand still.
- Trunks do not sway. The shadow-depth material of the scattered trees is not patched: the shadow of a crown that moves 15 cm
  stands still, which nobody sees.
- `window.__mm.treeWind()` returns `{ time, amp, patched }`.

## Not in scope

The Original style's billboards (retro by design, #359), the music half of #734, orchard rows on the LWB `orchard` fields,
tree placement and density (`FOREST_BUDGET`, `treeBox`), colliders, the Ehrendingen region's own forest data (it gets the same
species through the same code), autumn or seasons, leaf textures, CC0 models (the design is procedural; nothing to credit).

## Acceptance

- `node --test tests/`: five species, weights sum to one per kind, `fruit` never in `fill`; `treeParts('fruit', 10)` tops out
  near 6.2 m; `treeColour` with `u3` stays within the species palette; `lodTier` hysteresis; every `treegeo.js` crown is within
  the budget (fine <= 80, coarse <= 20 triangles), has unit face normals pointing away from the axis, base at 0 and top at 1,
  colours brighter at the top; the same inputs give the same arrays (deterministic).
- Playwright `tests/test_smoke.py::test_forest_loaded`: `counts.forest` keeps its keys and bounds; `window.__mm.treeLod()`
  has `fineTrees + coarseTrees == counts.forest.trees`, `fineTiles <= 9` and `fineTrees <= 7000` at the start and after a
  jump to Sisseln, and in the Original style `fineTiles + coarseTiles == 0` visible (billboards only).
- Playwright `tests/test_tree_collision.py` unchanged and green: the colliders did not move.
- Playwright: `window.__mm.treeWind().patched` is true in the Smooth style, `time` grows between two reads 500 ms apart while
  driving and does not grow while paused; `window.__mm.treeSpecies()` lists `fruit` under `single` with a count > 0 and 0
  under `forest` fill.
- Visual (maintainer): a photo at the start and in the Sisseln wood shows lumpy crowns of different greens and a visible sway.
