# Fish you can actually meet under water (#216) — design

Status: enriched 2026-10-11 (`--quick`). Playtest entry 13 of `docs/ai-notes/feedback/2026-10-10-playtest.md`. Builds on #101.

## Finding (one reproduction, headless Chromium, real world, `main` @ `b4d1279`)

The fish are drawn: with the car placed next to `__mm.underwater().school0` and the chase camera snapped behind it, grey fish are visible in the murk
(`__mm.fishPose(0)` is a valid matrix at the school's height; the instanced mesh renders). They are **not where the player is**:

- `__mm.underwater()` reports `schools: 14`, `fish: 155` for the whole Rhine in the world (the river spans about 4.5 km west to east plus its bends).
- From the pose of every fish (`__mm.fishPose(i)` for i in 0..154) the nearest fish to the wreck bend (-1088, -406) is **1427 m away**; none within 300 m.
- Cause: in `buildUnderwater()` the 14 schools are every n-th entry of the bed samples, and `bedSamples` returns them in z-then-x grid order, so the schools are
  spread by sample index, not by river length; with fog density 0.035 (visibility 30 to 40 m) a player meets none on the stretch they actually drive.

## Design

Place schools by **spacing**, not by count, and always put one at each wreck:

- Pure helpers in `prototype/underwater.js`: `shuffled(list, rnd)` (Fisher-Yates, returns a copy) and `spreadSchools(points, spacing, max, seeds)`
  (seeds first, then points of the list that are at least `spacing` from every school kept so far, at most `max`).
- `UW.schools` 14 -> 200 (now a cap) and a new `UW.schoolSpacing: 120` (m).
- `buildUnderwater()`: the wreck coordinates are computed before the fish block (two statements move up); the two wrecks are seeds; points are shuffled with a
  private `rng(216)` so the global `rnd()` placement of boulders and weed is untouched.
- A read-only hook `__mm.nearestSchool(x, z)` (distance to the nearest school centre) for the test.

Result: a maximal packing, every deep bed point is within 120 m of a school centre (when the cap is not hit), roughly one school per 120 m of channel; the wrecks are alive.

## Assumptions

- **A1** [med] Spacing 120 m, cap 200 (about 1400 to 2200 fish; `stepFish` poses them per frame only while under water, about 1 ms). Rejected: the same 14 schools with a bigger radius (still empty for most of the river); a "fish near the car" spawner (more code, fish pop in).
- **A2** [high] Fish stay one `InstancedMesh`; no new geometry or assets.
- **A3** [high] The two wreck seeds are filtered to water points (`inWater`); the car wreck is 30 m beyond the boat and could in principle be on a bank.
- **A4** [low] `[needs maintainer]` Is "one school every ~120 m" the right feel? Tune `UW.schoolSpacing` (60 = busier, 200 = sparse) after a playtest; fish size (about 1 m) and the 0.035 fog are unchanged.

## Consequences

- The global `rnd()` stream after `buildUnderwater()` is consumed differently (the old 14 `makeSchool` draws are gone), so the jitter of the tree billboards and the boat's yaw change by a small random amount. Cosmetic.
- `UW`'s deep-equal test and the fish count assertion in `test_underwater.py` (`schools == 14`) must change; they are updated in the plan.
- Per-frame cost while under water grows from 155 to at most about 2200 instance matrices; nothing changes while the camera is dry.
