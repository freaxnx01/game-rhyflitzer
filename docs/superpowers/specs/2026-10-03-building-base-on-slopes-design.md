# Buildings stand on the ground under the centroid, not the lowest point (#91) — Design

Status: written in headless enrichment (`/enrich 91 --headless`) 2026-10-03 · Issue #91 · found in #34 (A6) · related #45/#43/#87 (row houses), #71 (plates), #36 (footprint collision), #70 (debug heights)

## Problem

`osmBuilding()` (`prototype/index.html:566`) stands every building on the **lowest** `terrainH` of its outline vertices
and adds `h`. The pipeline measures `h` from the DTM under the footprint **centroid** (`pipeline/building_heights.py:62,76`:
`c = poly.centroid`, `ground = gs.sample(c)`, `h = lo - ground`). So the two disagree by the slope: the roof ends up
`centroid ground - lowest ground` too low. Measured in #34's spec (not re-measured here): median 0.35 m, p90 1.55 m,
over 2 m for 99 buildings, over 4 m for 24, up to 47.6 m at the Rhine bank. Row houses 4a-4f: centroid minus lowest =
1.48 m (3a-3f 1.38 m, 8a-8f 1.66 m), which is the ~1.4 m the roofs are short.

## Fix

**Runtime only, in the prototype. No pipeline field, no world rebuild.** `b.ring` is already in the world file, so the
game can compute the same reference the pipeline used.

```js
// prototype/world.js (pure, groundAt injected so node can test it)
export const SLOPE_CAP = 4;        // m: base never sits more than this above the lowest point of the outline
export const SKIRT_MARGIN = 0.3;   // m: walls reach this far below the lowest point
export function ringCentroid(ring)                 // area centroid of the polygon; vertex mean when the area is ~0
export function buildingBase(ring, groundAt, cap = SLOPE_CAP) // -> { base, low, bottom }
//   low    = min groundAt over the ring vertices (today's base)
//   ground = groundAt(ringCentroid(ring))        (the pipeline's ground reference)
//   base   = clamp(ground, low, low + cap)
//   bottom = low - SKIRT_MARGIN                  (where the walls end)
```

`osmBuilding()` uses `base` for the roof (`base + h`, gable ridge, `addOBB` top) and extends the walls down to
`min(old bottom, bottom)`: the gable box becomes `box(w, h + (base - bottom), d, ..., y = bottom)` and
`extrudeFootprint` takes a `bottom` argument instead of the fixed `base - 2`. The downhill side is therefore closed by a
longer wall in the same role and texture (a foundation skirt, not a separate plinth mesh): nothing floats, and the
uphill side simply sinks into the slope. The skirt is at most `SLOPE_CAP + SKIRT_MARGIN` = 4.3 m deep.

`BUILDING_BASE` (a `Map` id -> `{ base, low, bottom }`) is filled by `osmBuilding()` so labels and #71 read the same
number; `window.__mm.buildingBases` exposes it for the tests.

## Consequences for the neighbouring work

- **#34 (eaves):** independent. #34 changes `h` in the pipeline (rebuild), #91 changes where `h` is added. Either order
  works; the roofs compose as `centroid ground + h`. #34's "out of scope" note (it moves every building on a slope) is
  exactly this change.
- **#43/#45/#87 (row houses):** the roofs of the 16 blocks rise ~1.4 m (to the real roof). Their storeys stay
  `round(h / 3)` = 2 (`rowHouseTile`, `world.js:123`), so #45's A9 ("three storeys once #34 raises the eaves") still does
  not come true: `h` is 6.2 m, and 6.2 m is the real roof over the centroid. The downhill wall just shows ~1.4 m more
  facade, with the tile continuing below the old edge (`v0` follows the new bottom). Whether the facade should count
  storeys from the downhill side (7.6 m = 3) is a separate decision, not made here. #87 (gable ends) touches the same
  `osmBuilding()` gable branch: whoever lands second rebases onto the other.
- **#71 (plates at door height):** must use `BUILDING_BASE`. Door height = terrain at the plate's wall point + ~1.6 m,
  never below `bottom`, never above the roof; on a slope the street side can be the downhill side, where the door is
  below `base`.
- **#36 (footprint collision):** horizontal geometry (rect, `ringPush`) is untouched. Only the collider's top `y`
  (`base + h`) rises by `base - low` (typically 0.35 m, at most 4 m).
- **#12/#70 labels** (`addrLabels`, `heightLabels`, `index.html:858,1206`) add `top` to `terrainH(rect centre)`; they
  switch to `BUILDING_BASE` so the debug height tags stay on the roof. #71 later removes the #12 sprites.
- **Everything with a measured or default `h`:** the roof of every building on a slope rises by `base - low` (median
  0.35 m). Nothing is lowered.

## Out of scope

- Hand-built houses, halls, churches (`house()`, `hall()`, ... use `terrainH(x, z)` at their own centre already).
- Counting storeys from the downhill side; a pipeline `ground` field; terrain-mesh vs DTM differences beyond the guard
  below.

## Acceptance criteria

- A building's base is `terrainH` at its footprint centroid, clamped to `[low, low + 4 m]`.
- Walls reach below the lowest outline terrain: no gap between wall and ground on the downhill side, for every building.
- 4a-4f roofs sit 1.3-1.5 m higher than on `main`; buildings on flat ground and hand-built ones are unchanged.
- No building is more than 4 m above its lowest outline terrain; the 47.6 m Rhine-bank case is clamped, not excluded.
- Unit tests for the helper, a Playwright check on the world, full suites green, no console errors.

## Assumptions

- **A1** [high] Base = `terrainH` at the area centroid of `b.ring`. Rejected: lowest point (today, the bug), mean or
  median under the footprint, the entrance/street side. Evidence: the pipeline measures `h` from the DTM at
  `poly.centroid` of the same ring (`pipeline/building_heights.py:62,76`), so the centroid is the only base that
  reproduces the measured roof; the data carries no street or door per building (#71 spec, "Starting point").
- **A2** [high] Runtime only, no pipeline field and no rebuild. Rejected: exporting `ground` per building. `ring` is in
  the world file (`pipeline/world_buildings.py:134-135`), the centroid is a pure function of it, and a rebuild would be
  a guarded local task for no new information.
- **A3** [med] The downhill side is closed by extending the walls (foundation skirt in the same role and texture) down
  to `low - 0.3 m`, not by a separate plinth mesh. Rejected: a plinth (extra role, texture and geometry for most
  buildings on a slope). Today's walls end at `base - 2` (`extrudeFootprint`, `index.html:551`) or `base - 3` (gable
  box, `index.html:572`), which already hides small slopes; the skirt only deepens it where `base - low` needs it.
- **A4** [med] Cliff guard: `base` is clamped to `low + 4 m`, no building excluded. 24 buildings exceed 4 m and the
  maximum is 47.6 m at the Rhine bank (#34 spec), where the centroid and the outline vertices straddle a bank or the
  river cut. Rejected: excluding them (they would keep the old low base and still sit wrong) and no cap (a 47 m roof
  lift plus a 47 m skirt). Cost: those roofs stay up to `excess` below the measured value. The cap is the one number the
  owner may want to tune.
- **A5** [med] `low` is the minimum over the ring vertices only, as today, plus a 0.3 m margin. Rejected: sampling edge
  midpoints or a grid (more `terrainH` calls for ~1,900 buildings at load time, little gain on 16 m terrain cells). A
  concave bump between vertices can still show a thin gap; the margin covers the common case.
- **A6** [med] The game's `terrainH` mesh (16 m cells) is not the 2 m DTM, so `terrainH(centroid)` can differ from the
  pipeline's ground by a fraction of a metre. Accepted: that error is smaller than the 0.35-1.5 m being fixed, and the
  Playwright check on 4a-4f verifies the roof lands 1.3-1.5 m higher, not an exact DTM match. Not measured (no data
  probe was run, to save cost).
- **A7** [med] Row-house storeys stay `round(h / 3)`; #45's A9 stays unmet and is recorded as a consequence, not fixed
  here. Rejected: counting from `h + (base - low)`, which changes the facade design decided in #45.
- **A8** [med] #71 reads `BUILDING_BASE` and puts a plate at the terrain under the plate point plus ~1.6 m. This is a
  hand-off note for #71's implementer; nothing in #71 is changed by this issue.
- **A9** [high] #36 needs no change: `addOBB(cx, cz, w, d, rot, base + h)` and `ringPush` are horizontal; only the top
  `y` follows `base`.
- **A10** [high] The hand-built world (`L` undefined) and hand-placed props are untouched. `osmBuilding()` is only called
  for `L.buildings` (`index.html:823`).

## Consequences

- Region-wide, roofs on a slope go up by `base - low`: median 0.35 m, p90 1.55 m. Row houses 4a-4f by ~1.4 m.
- The seeded RNG sequence is unchanged: no new `rr()`/`rnd()` calls (same care as #45).
- Collider tops rise by the same amount.
- Wall geometry grows slightly (deeper skirts); no new draw calls.
