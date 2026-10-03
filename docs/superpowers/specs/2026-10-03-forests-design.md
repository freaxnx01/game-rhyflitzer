# Forests from OSM (Sisslerwald) — design

Status: approved headless (`/enrich 13 --headless`) 2026-10-03 · Issue #13 · the tree style and the collision rule were decided by the maintainer on 2026-10-03 (A1)

## Goal

The woods of the region stand in the game: the Sisslerwald south-east of Sisseln, the wooded Tafeljura slopes south of the Rhine and the Schwarzwald foothills north of it. Playtest 2026-10-01: „Sisslerwald?“ — today only a made-up scatter marks forests (a hand box east of Sisseln plus a height/noise heuristic).

Success looks like:

- Every `landuse=forest` / `natural=wood` area of the extract is a wood in the game, drawn as low-poly instanced trees with a stated density and performance budget.
- A car cannot drive into a wood: the trees along the wood's edge stop it. Inside, the trees are visual only.
- Every road, track or path that runs through a wood stays open, with trees on both sides.
- The world file carries the woods as outlines, so the same build works for today's bbox and for the extended region (#19/#44/#47).
- A browser test pins the counts and the collision; pipeline tests pin the export.

## Starting point (verified 2026-10-03 on `main` @ `188eb0f`, line numbers re-checked against `main` @ `13a4ef7` the same day; #72 is enriched, not merged)

- **Reading.** `osm_read.AREA_KEYS = ("building", "natural", "man_made", "landuse", "amenity", "water")` (`pipeline/osm_read.py:16`): forest and wood areas are already in `data.areas` with their tags; nothing to add there.
- **The extract** (`pipeline/cache/osm/hochrhein.osm.pbf`, 3.7 MB, local cache; probe 2026-10-03): 595 forest/wood areas (534 `landuse=forest`, 61 `natural=wood`; 476 from ways), only two named (`Schuler Holz`, `Galgenbuck`), `leaf_type` on 108 of them. Clipped to the map and merged: **177 parts, 15.97 km² = 38.6 % of the 41.4 km² map, 238.7 km of edge, 9,102 vertices** (7,269 after a 1 m simplification). The largest parts are 307 ha north of the Rhine (German side, centre ≈ (1298, −1715)), 297 ha on the Tafeljura (≈ (3615, 1040)) and 99 ha south-east of Sisseln (bounds x 1925–3782, z −310–518) — the Sisslerwald, unnamed in OSM. The hand box `anchors.areas.sisselnWald = [1960, −520, 2500, −300]` (`pipeline/anchors.json:36`, read at `prototype/index.html:794`) is only 4 % OSM forest: it stands in for the river-bank strip, not for the real wood.
- **Roads through woods.** 112 exported road pieces cross a wood, 11.6 km in total (residential 31, service 22, unclassified 20, primary 13, footway 8, path 5, …; `world_roads.DRIVE`/`FOOT`, `pipeline/world_roads.py:11-12`). 8 buildings have their centre in a wood; 20 car parks touch one.
- **Trees today** (`prototype/index.html:794-796`): 9,000 random candidates; a candidate is "forest" inside the Sisslerwald box, above 18 m, or above 6 m where `fbm > 0.55`; elsewhere 12 % pass. Accepted when `free(tx, tz, 3) && roadDist > 6 && railDist > 7 && streamH === -Infinity`, height `rr(6, 12)`. Result: 3,987 trees (flat) / 4,299 (measured), `window.__TREES = [[x, z, h, ty], …]`. Drawn twice: a merged billboard mesh (two `PlaneGeometry` crosses per tree, `index.html:842`, Original style) and two `InstancedMesh` — `ConeGeometry(1, 1, 7)` + `CylinderGeometry(0.12, 0.16, 1, 6)`, 38 triangles per tree, per-instance HSL colour, `castShadow` (`index.html:844-846`, Smooth style). `applyStyle` toggles them (`index.html:907`).
- **Props** are the instancing precedent: one merged low-poly geometry per kind, one `InstancedMesh` per kind for 2,713 instances (`propMeshes`, `index.html:663-674`); lamps and hydrants also get a small OBB each (`PROP_SOLID`, `:631`).
- **Collision** is OBB-only: `collide(r)` (`index.html:992`) walks `OBB_GRID` (32 m cells) around the car, resolves rotated boxes (`c`, `s`, `hw`, `hd`) and circles, with no height test except bridge rails (`o.bridge && P.y < y0`). `addOBB(x, z, w, d, rot, h)` (`:480`) — `h` is the absolute top, used only by the chase camera (`P.y + h·t < o.h`, `:1026`) and, once #10 lands, by the helicopter floor. The grid holds ≈ 4,600 boxes today (1,892 buildings, ≈ 2,400 lamps/hydrants, landmarks).
- **`free()`** (`index.html:487`) rejects a spot near the river, a road, any OBB (as a **circle** of radius `hypot(hw, hd)`), checkpoints and the start. It is shared with houses and halls; #72 decided not to widen it.
- **Camera and fog.** `PerspectiveCamera(62, 1, 0.5, 4200)` (`:829`). Original style `Fog(…, 320, 1400)`: nothing is visible beyond 1.4 km. Smooth style `FogExp2(0.00095)`: 17 % of the colour left at 1.4 km, 3 % at 2 km. Static geometry is merged per role into single meshes, so nothing is frustum-culled per area; the ground is one `PlaneGeometry` of 590 × 275 cells ≈ 162 k vertices / 325 k triangles. three.js **0.170.0** (`:199`), whose `InstancedMesh` has `computeBoundingSphere()`, so separate instanced meshes are frustum-culled individually.
- **Ground colour.** Vertex colours by height (`index.html:696`), shown in the Original style; the Smooth style's `grass` material has `vertexColors: false` (`:904`).
- **Fields.** 40 random rectangles placed with `fieldClear` (roads, river, streams; `index.html:700-701`) — they know nothing about woods.
- **World file.** `data/world_hochrhein.json` 2.6 MB raw / 0.48 MB gzip; `layoutFromWorld` (`prototype/world.js`) defaults missing lists to `[]`, so an old world file keeps working. Rebuilds run only in guarded local tasks with `--dsm-heights cache` (`docs/superpowers/plans/2026-10-02-more-landmarks.md`, Task 4). Golden tests pin counts on the real extract (`pipeline/tests/test_golden.py`).
- **Open neighbours.** #72 (trees off car parks) adds `parkingIndex` and a `PARKING.clear(x, z, 0.45·h)` check to the scatter — enriched, not merged. #19/#44/#47 (region extension) move `DEFAULT_BBOX` and rebuild the data — planned, not merged. #10 (helicopter) reads OBB tops for its floor.

## Decisions

| Topic | Decision |
|---|---|
| Pipeline export | New `pipeline/world_forests.py`: select `landuse=forest` or `natural=wood`, repair, clip, **union** everything, cut out the **road corridors** (every exported road, bridges included, buffered `w/2 + 5 m`) and the **car parks** (`world_parking.selected` lots buffered 3 m), drop parts under 500 m², simplify 1 m, round to 0.1 m. World key `forests: [{ ring, holes? }]`, sorted by bounds. Probe: 160 parts, 15.65 km², 247.7 km of edge, 7,387 vertices, ≈ 115 KB of JSON. |
| Why outlines, not trees | ≈ 67,000 tree records would be ≥ 1.2 MB and would fix the density in the data; outlines are 115 KB, and the prototype places trees deterministically from a seed, as the scatter does today. The module takes `clip`, so #19's bigger bbox needs no change here. |
| Runtime index | `forestIndex(forests, step = 8)` in `prototype/world.js`: a scanline-rasterised bit mask on an 8 m grid over the woods' bounding box (even-odd per polygon with its holes, OR across polygons), `inside(x, z)` in O(1). The water SDF uses the same 8 m step. |
| Tree placement | `forestTrees(forests, index, edges, rnd, budget)` in `world.js`, pure and seeded (`rng(13)`, a copy of the page's mulberry32, so the main scatter's sequence is untouched). **Edge row:** one tree every **6 m** along every edge (incl. hole edges), jittered ±1.5 m along and 0.5–3 m inside. **Fill:** one tree per **600 m²** (jittered 24.5 m grid, kept where `inside`). Heights: edge `7–12 m`, fill `8–14 m`. |
| Budget | **Hard cap 70,000 forest trees.** Probe: ≈ 41,300 edge + ≈ 26,100 fill ≈ 67,400. Over the cap the fill is thinned by a deterministic stride; the edge row is never thinned. Geometry per tree: open cone with 6 sides (6 triangles) + open 4-sided trunk (8 triangles) = **14 triangles** → ≤ 0.98 M triangles at the cap (today's 4,300 scatter trees: 163 k; the ground: 325 k). Billboard style: two crossed quads = 4 triangles → ≤ 0.28 M. No shadows for forest trees (70 k shadow casters would double the Smooth style's cost). |
| Culling | Trees grouped in **512 m tiles** (162 tiles touch a wood), one `InstancedMesh` per tile and representation (cone, trunk, billboard) with `computeBoundingSphere()`, so three.js culls whole tiles outside the frustum. Within the 1.4 km fog range a view covers ≈ 30–40 tiles, so per frame roughly a quarter to a third of the instances are drawn. Worst case ≈ 490 small draw calls (helicopter, #10), typical ≈ 70. |
| Acceptance filter | Every candidate passes `free(x, z, 2) && railDist(x, z) > 7 && streamH(x, z) === -Infinity`, like the scatter; if `parkingIndex` (#72) is present, also `PARKING.clear(x, z, 0.45·h)`. The pipeline already keeps woods off roads and car parks, so these are belt and braces. |
| Collision | **Invisible walls along every edge segment**, not per-trunk boxes: trunks 6 m apart would let a 2 m car through. Each edge segment (split at 48 m) becomes `addOBB(mx + nx·1.2, mz + nz·1.2, len + 0.6, 2.4, atan2(dz, dx), ground + 1.6)` — a 2.4 m band just inside the edge, 1.6 m high so the chase camera (`P.y + h·t < o.h`) and the helicopter floor ignore it. The inward normal is found by sampling the mask on both sides (0.75 and 1.5 steps); when neither side is inside (a sliver narrower than two cells) the wall is centred on the edge. Roughly 7,400 wall boxes. **Walls are added after all tree placement**: `free()` treats an OBB as a circle of radius `hypot(hw, hd)`, so a 48 m wall would otherwise clear every tree within 26 m. |
| The car hits trunks, visually | Edge trees stand 0.5–3 m inside the edge, the wall covers 0–2.4 m: the car's nose stops at the first trunks, crowns (half-width 0.45·h = 3–5 m) overhang it. |
| Roads through woods | Cut in the pipeline, so edges — and therefore walls and edge trees — run along both sides of every road at `w/2 + 5 m`. Bridges are included because `collide()` has no height test for non-bridge boxes: a wall under a viaduct would stop a car on the deck. |
| Old scatter in OSM mode | The heuristics (`th > 18`, `fbm`, Sisslerwald box) are off when a world file is loaded: woods come from OSM. The 12 % countryside scatter stays, skipping candidates inside a wood. Hand layout (no world file) unchanged, bit for bit. `anchors.areas.sisselnWald` is removed from `anchors.json`; the hand fallback keeps its literal box. |
| Forest floor | Ground vertices inside a wood are blended half-way towards a darker floor colour (`#2f4a2c`) in the vertex-colour loop — visible in the Original style. The Smooth style ignores vertex colours on grass, so there the trees alone carry the wood. |
| Fields | `fieldClear` also rejects a sample inside a wood (OSM mode), so no yellow field lies under the trees. No RNG shift: the rejection happens after the iteration's draws. |
| Separate from `__TREES` | Forest trees are `window.__FOREST = [[x, z, h, ty], …]` with their own meshes; `__TREES` stays the countryside scatter with today's 38-triangle geometry. #72's test and `treesOnRail` keep their list; `treesOnRail` counts both. |
| Counts hook | `window.__mm.counts.forest = { polys, edge, fill, thinned, trees, walls, tiles }` in OSM mode; absent in the hand layout. |
| Data | `data/world_hochrhein.json` is rebuilt in a **guarded local task** (caches present, golden tests green, diff guard: only `forests` and `params.built` may change) — never on CI, no `osmium` cut. |
| Out of scope | Named woods / forest labels; `leaf_type` colouring (108 of 595 areas); `natural=tree` points and `tree_row` lines (none in the extract); scrub, orchards, vineyards (161/80/22 areas); forest tracks that OSM does not map; LOD or impostors; mesh chunking of anything else. |

## Interfaces

```python
# pipeline/world_forests.py
CORRIDOR = 5.0; PARKING_GAP = 3.0; MIN_AREA = 500.0; SIMPLIFY = 1.0
def selected(tags) -> bool                      # landuse=forest or natural=wood
def build(areas, roads, clip) -> (forests, stats)
# forests: [{"ring": [[x, z], ...], "holes": [[[x, z], ...], ...]?}], rings open (first point not repeated), 0.1 m
# stats: {"areas", "parts", "dropped_small", "area_ha"}
```

```js
// prototype/world.js
export function rng(seed) -> () => number                      // mulberry32, same as the page's rnd
export function forestIndex(forests, step = 8)
  -> { w, h, step, x0, z0, mask: Uint8Array, inside(x, z): boolean }
export function forestEdges(forests, index, maxLen = 48)
  -> [{ x0, z0, x1, z1, mx, mz, len, rot, nx, nz }]            // (nx, nz) unit normal pointing into the wood, or (0, 0)
export const FOREST_BUDGET = { edgeStep: 6, fillArea: 600, cap: 70000, edgeH: [7, 12], fillH: [8, 14], tile: 512 }
export function forestTrees(forests, index, edges, rnd, budget = FOREST_BUDGET)
  -> { edge: [[x, z, h]], fill: [[x, z, h]], thinned: number } // edge.length + fill.length <= budget.cap
export function tileKey(x, z, size) -> string
// layoutFromWorld: forests: w.forests || []
```

```json
"forests": [{ "ring": [[x, z], ...], "holes": [[[x, z], ...]] }]
```

## Testing

- **Pipeline unit** (`pipeline/tests/test_forests.py`, fixtures as in `test_parking.py`): tag selection; two overlapping woods become one part; a road cuts a corridor of `w/2 + 5 m` and leaves two parts; a bridge cuts too; a car park is cut out with 3 m; leftovers under 500 m² are dropped; a hole survives, a tiny hole does not; rings are open, rounded to 0.1 m, clipped; output order is stable.
- **Golden** (`test_golden.py::test_forests`): 120–220 parts, 14.0–17.5 km², ≤ 9,000 vertices, no ring vertex closer than `w/2 + 4.5 m` to a road centre line, at least 80 ha of wood inside the Sisslerwald box x 1925–3782 / z −310–518, file still under 6 MB.
- **Node** (`prototype/tests/world.test.mjs`): `forestIndex` inside/outside/hole/island-in-hole/empty; `forestEdges` inward normal on a square (all four sides point in), split at 48 m, sliver → (0, 0); `forestTrees` deterministic for a seed, edge count ≈ perimeter / 6, fill ≈ area / 600, cap thins fill only; `tileKey`; `layoutFromWorld` default `[]`.
- **Browser** (`prototype/tests/test_smoke.py`): `test_forest_loaded` (counts match the world file, trees ≤ 70,000, ≥ 20,000 edge, ≥ 10,000 fill, walls ≥ 5,000, clean console, no `forest` key in the hand layout); `test_forest_edge_blocks_the_car` (pick a straight edge with open ground outside from the world file in Python, `window.__mm.sim` drives at it for 3 s from 25 m out: the car ends outside the wood, less than 27 m from where it started); `test_no_trees_on_the_railway` also counts `__FOREST`; `test_physics_time_osm_vs_hand` stays green.
- **Manual** (`test-todo.md`): drive the Hauptstrasse Sisseln → Eiken through the Sisslerwald (trees on both sides, no wall on the road); try to leave the road into the wood (stopped at the trunks); phone frame rate at the wood's edge in both styles.

## Assumptions (headless — no human was asked)

- **A1** [confirmed 2026-10-03] Low-poly **instanced trees** with a density and performance budget; **only the edge collides**, inner trees are visual. Rejected: a canopy mesh (one flat roof over the wood — cheap, but it reads as a hedge from the road and a green plate from the air).
- **A2** [high] The pipeline exports **outlines**, the prototype places the trees. ≈ 67 k tree records would cost ≥ 1.2 MB of JSON against 115 KB for rings (probe), and the scatter already places trees from a seed at runtime (`index.html:795`). Rejected: trees in the world file.
- **A3** [med] **Budget numbers**: edge every 6 m, fill 1/600 m², cap 70,000, 14 triangles, 512 m tiles, no shadows. Evidence: 247.7 km of edge and 15.65 km² after the corridor cut; 14 triangles keep the worst case under 1 M (the ground alone is 325 k); the fog (`:901`, `:903`) hides everything beyond 1.4–2 km, so with 162 tiles only a quarter to a third is drawn per frame. Rejected: full fill at 8 m spacing (250 k trees), one `InstancedMesh` for everything (no culling), today's 38-triangle tree (2.6 M triangles at the cap).
- **A4** [high] Collision as **walls along the edge** rather than trunk OBBs. `collide()` resolves rotated boxes only (`index.html:992`); 6 m trunk spacing cannot stop a 2 m car. ≈ 7,400 boxes join ≈ 4,600 (`OBB_GRID`, 32 m cells, queried locally). Rejected: a circle per edge tree (a car slips between them, and 41 k circles in the grid).
- **A5** [high] Road **corridors cut in the pipeline** at `w/2 + 5 m` for every exported road, bridges included — `collide()` ignores height for non-bridge boxes, so a wall under a viaduct would stop the car on the deck. 11.6 km of road run through woods. Rejected: trimming trees only at runtime (walls would still cross the road).
- **A6** [med] **Car parks cut out** in the pipeline (3 m), independent of #72's runtime check; 20 lots touch a wood. If #72 is merged, forest trees additionally pass `PARKING.clear`. Rejected: relying on #72 alone (not merged, and walls would cross a forest car park).
- **A7** [high] The woods are **merged**, so ids, names and `leaf_type` are dropped: only 2 of 595 are named and 108 carry `leaf_type` (probe). Rejected: per-area export (overlapping woods would double trees and walls at shared edges).
- **A8** [med] In OSM mode the **heuristic forests are switched off** and the 12 % countryside scatter skips woods. The countryside trees are re-rolled (their `rnd()` draws shift, see Consequences). Rejected: keeping the heuristic hills as well (double trees on the Tafeljura, the hand box would still stand in the wrong place).
- **A9** [med] Forest trees are **taller** (edge 7–12 m, fill 8–14 m) than the 6–12 m scatter. Rejected: the same range (a wood should rise above lone trees).
- **A10** [med] **Forest floor tint** on the ground vertices, Original style only (`grass` has `vertexColors: false` in Smooth, `index.html:904`). Rejected: a separate floor mesh (another 16 km² of draped triangles) and changing the Smooth grass material (would also colour the height gradient).
- **A11** [high] Forest trees are a **separate list and separate meshes** (`__FOREST`), not appended to `__TREES`: #72's test and `treesOnRail` read `__TREES`, and the existing 38-triangle tree stays for the ≈ 1,000 countryside trees. Rejected: one list (the merged billboard mesh would be built from 140 k `PlaneGeometry` objects).
- **A12** [high] The world file is rebuilt in a **guarded local task**, no `osmium` cut, as in `2026-10-02-more-landmarks.md` Task 4. The module takes `clip`, so #19's bbox needs no change; its golden counts will move to `CORE_BBOX` with the others.
- **A13** [med] `anchors.areas.sisselnWald` is **removed** from `anchors.json` (only 4 % of its box is OSM forest). The hand layout keeps its literal fallback box. Rejected: keeping it (a dead key in the world file).
- **A14** [med] Parts under **500 m²** and holes under 500 m² are dropped (hedges and tiny clearings). Rejected: keeping every sliver (walls around a 30 m² wood).
- **A15** [med] Mask step **8 m** for `inside`; edges and walls use the exact polygon vertices. A tree may stand up to 4 m outside a very thin wood, which the edge row hides. Rejected: exact point-in-polygon per candidate (70 k × 160 polygons × 7 k edges).

## Consequences

- World file: ≈ +115 KB raw (2.6 → ≈ 2.75 MB), ≈ +40 KB gzip. Still well under the 6 MB golden limit.
- Draw cost: ≈ 67 k instances in ≈ 162 × 3 small `InstancedMesh`; worst case 0.94 M triangles (Smooth) / 0.27 M (Original); typically a quarter to a third of that after tile culling. ≈ 70 draw calls more while driving, ≈ 490 from the air.
- Load time: mask raster (≈ 7 k edges × 550 rows), ≈ 76 k candidates through `free`/`railDist`/`streamH`, ≈ 7.4 k `addOBB` and ≈ 486 instanced meshes — in the order of a few hundred ms on a desktop, about a second on a phone; measured by the plan.
- The countryside scatter in OSM mode changes: without the heuristic forests roughly 1,000–1,300 trees remain instead of ≈ 4,000, and their positions are re-rolled because `rnd() > 0.12` is now drawn for every candidate. The hand layout is unchanged.
- The forests mapped along the river banks stop the car there too — including the banks where today you could drive onto the gravel.
- `OBB_GRID` grows by ≈ 7,400 boxes; `collide` and the camera query only the cells around the car, so per-frame cost does not change measurably (`test_physics_time_osm_vs_hand` guards it).
- The helicopter (#10, planned) is unaffected: wall tops are 1.6 m above ground.
- Fields no longer land inside woods; their RNG sequence is unchanged.
- Another issue that rebuilds the world without this pipeline would lose the `forests` key; `layoutFromWorld` then falls back to `[]` and the prototype shows no woods — no crash.
- #19's region adds roughly four times the wood area; the cap will bite there (fill thinned to about a third), which is the budget doing its job. #19 may want its own numbers.
