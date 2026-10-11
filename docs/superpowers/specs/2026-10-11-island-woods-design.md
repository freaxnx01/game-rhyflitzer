# Drive out of the Rhine onto the Fridolinsinsel (#214) — design

Status: enriched 2026-10-11 (`--quick`). Playtest entry 11 of `docs/ai-notes/feedback/2026-10-10-playtest.md`. Builds on #101 (underwater Rhine).

## Finding

The island exists and is land. `data/world_hochrhein.json` has a Rhine polygon with a second ring (x -1245..-1200, z 103..229) and
a terrain probe over it (`__mm.probe`, `__mm.bed`) shows land cells (`probe.water === null`) at x -1230..-1195, z 120..225, 0.5 to 2.4 m
above the water surface (-1.6 m). The bed rises to the island's shore (a 0.3 slope, as designed in #101), so a car on the bed reaches it.

**It stops 13 m short, in the water.** Measured 2026-10-11 on `main` @ `b4d1279` with the real world and terrain: `__mm.sim(-1262, 170, 0, 0, 0, [])`, then
`__mm.step(0.5, ['KeyW'])` x 60. The car drives at 5-6 m/s along the bed up to x = -1239, then its speed falls to 0.2 m/s at
x = -1238 (y = -2.4, still `water !== null`) and stays there.

Cause: **the island is an OSM wood.** `forests` holds the 13-point polygon `(-1200.3,129.7) ... (-1244.8,197.5) ... (-1215.0,191.4)`; its west
edge runs through (-1238, 178). `index.html` builds a solid wall for every wood edge (`for (const e of edges) ... addSolid({ ..., forest: true })`,
around line 1407) and `collide()` stops the car at it. `collide()` ignores height for `forest` walls, so the wall stops a car that is on the bed too.
So no code "handles the island" because the only thing that knows it is a wood that blocks the car.

## Decision

Treat the Fridolinsinsel as an open meadow: drop the OSM wood polygons that contain a hand-pinned point of the region before the woods are
indexed (so no edge walls, no forest trees there, and the 8 m mask `FOREST` no longer covers it). Runtime filter, no world rebuild, no data change.

- New pure helper `clearWoods(forests, points)` in `prototype/world.js` (point-in-polygon on the outer ring).
- New region field `openWoods: [[x, z], ...]` in `prototype/regions.js`; Hochrhein: `[[-1222, 166]]` (inside the island polygon, checked with an even-odd test);
  Ehrendingen: `[]`.
- `index.html` builds `WOODS = clearWoods(L.forests, REGION.openWoods)` and uses it everywhere `L.forests` was used (5 places).

## Assumptions

- **A1** [med] The island loses its trees (a bare meadow), rather than keeping trees with a gap in the wall. Rejected: a gap in the edge walls
  (trees would then be drawn but drivable-through, which the game avoids everywhere), and a per-edge wall filter `riverDist < 3` (every edge of an island is at the water).
- **A2** [high] Runtime filter, not a pipeline change. Rejected: dropping the polygon in `pipeline/osm.py` (needs a world rebuild from local caches, marked "local only").
- **A3** [high] The stall is the forest wall. Evidence: ring edge at (-1238, 178) vs the car stopping at x = -1238; bed gradient at the stall is 0.6, not a slope limit (`accel` 16 m/s^2 > 9.81 m/s^2 gravity term in `stepCar`).
- **A4** [med] The 1 to 1.4 m step from the shoreline bed (water level) up to the island's terrain is accepted as a kerb: `stepCar`'s land branch snaps `P.y` up (`lift > 1` is "a kerb, not a launch"). Not smoothed.
- **A5** [low] `[needs maintainer]` Is a bare Fridolinsinsel acceptable, or should it keep a wood (then: an entry gap or a cleared glade)? Default: bare.

## Consequences

- The island's OSM trees disappear (a few dozen of the ~70 k forest trees); minimap and terrain colouring follow `FOREST`, so the island is no longer wood-green there.
- A car on the island can only leave by driving back into the water (R brings it back to the last road, `P.safe`).
- No other wood is touched: the filter only drops polygons containing a pinned point.
