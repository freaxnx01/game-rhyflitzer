# A J entry at the Rhine wrecks (#215) — design

Status: enriched 2026-10-11 (`--quick`). Playtest entry 12 of `docs/ai-notes/feedback/2026-10-10-playtest.md`. Builds on #101 (underwater Rhine).

## Finding

The capsized rowing boat and the rusty car are built in `buildUnderwater()` (`index.html`, `// ---------- #101: the underwater Rhine`): the boat at the
midpoint of `RIVER.pts[9]`/`[10]`, the car 30 m further along the river direction. Their positions exist only at runtime, as
`UWS.counts.wreck` and `UWS.counts.wreckCar` (measured on the real world: boat (-1088.4, -406.4), car (-1096.2, -377.4), bed 6 m deep, water level -1.49).
`jumpTo(p)` snaps to the **nearest road** (`nearestJumpable`), so a normal J entry cannot reach a bed spot. `jumpToRamp` is the existing
off-road precedent (the Sprungschanze).

## Design

A normal player-facing J entry, `Rhein-Wracks`, under `Bad Säckingen`:

- `landmarks.js`: entry `{ name: 'Rhein-Wracks', gemeinde: 'Bad Säckingen', at: [-1088.4, -406.4], wreck: true }`, placed after the Bergsee. `at` only gives the
  list a position; `landmarkEntries` passes `wreck: true` through.
- `index.html`: `jumpToWreck(name)` reads `UWS.counts`, picks the spot 8 m upstream of the boat on the line to the car wreck (falls back to the boat itself if that
  spot is not in water), faces the wrecks, and puts the car on the bed there (`groundH`). `P.safe` is set to the nearest road to the wreck first (via `placeOnRoad`),
  so **R** still returns the car to a road, as the underwater hint says. The chase camera is snapped behind the car (a J across the map would otherwise leave
  the camera easing in from the old place, above the water).
- `pickJump` routes `r.wreck` to `jumpToWreck`. Drive (`O`) and Navi (`I`) lists skip the entry (`destEntries` filters it): nobody can route to the bottom of the river.

## Assumptions

- **A1** [med] Name `Rhein-Wracks` (German proper-name style like `Reservoir Hübel`, `Sprungschanze`). `[needs maintainer]` Name, and Gemeinde `Bad Säckingen` (the issue says "the bend below Bad Säckingen"; not verified against OSM).
- **A2** [high] One entry for both wrecks, not two. The car lies 30 m from the boat, both in view in the fog (density 0.035) from the 8 m run-up; rejected: two entries.
- **A3** [high] Position resolved at runtime from `UWS.counts`, not hard-coded coordinates for the drop. Rejected: fixed `jump: [x, z]` like the Bergsee (it snaps to a road; and the wreck follows `RIVER.pts`, which differs in the hand layout).
- **A4** [med] The splash sound and the "Sleep with the fishes!" toast play on arrival (the first `stepCar` after `resetCar` sees `P.splash === 0` in water). Kept: it tells the player where they are.
- **A5** [high] The hand layout (no OSM world) has no J landmarks; nothing changes there.

## Consequences

- `test_jump.py`'s expected row count grows by one (`ALL_ROWS`), and `landmarks.test.mjs` counts `LANDMARK_INFO` (28 -> 29).
- Using J while a race is `racing`/`armed` marks the run as jumped, like every J entry (`placeOnRoad`).
