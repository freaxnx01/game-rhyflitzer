# Grass over profiled roads in yield ramps (#1247) — design

## Problem

Test drive 2026-11-27, Laufenburgerstrasse Sisseln → Eiken: grass cuts across the road, sometimes over the full width.
It started with the smoothed road profiles (#1152, PR#1167).

## Measured cause (main, GPU browser, OSM world, 2026-11-27)

A temporary probe read, at each issue spot, the profile weight `profileWeight`, the mesh height `meshH`, the drawn
ground `terrainH`, the road's profile `roadProfileH` and the raycast road and grass heights:

| x / z | w | mesh | ground (terrainH) | profile | drawn road | grass over road |
|---|---|---|---|---|---|---|
| 1558.5 / 715.5 | 0.58 | 18.79 | 17.85 | 17.37 | 17.65 | 0.19 m |
| 1558.5 / 709.5 | 0.21 | 18.96 | 18.56 | 17.18 | 18.52 | 0.04 m |
| 1549.4 / 469.2 | 0.48 | 13.71 | 13.27 | 12.79 | 13.22 | 0.05 m |
| 1514.3 / 375.7 | 0.66 | 12.71 | 12.39 | 12.27 | 12.36 | 0.03 m |
| 1558.6 / 733.7 (tester) | 1 | 19.31 | 17.78 | 17.98 | 18.02 | none |
| 1557.6 / 491.2 (tester) | 1 | 14.07 | 12.89 | 12.94 | 12.98 | none |

A scan of the whole road (id 4803544, 294 rays: every 6 m, axis and ±3.5 m) found 13 spots with grass over the road.
**All 13 have `0 < w < 1`**, and there is none where `w = 1`. The worst is 0.253 m at 1556.7 / 715.4. The yield cells nearby
are 1 m patches: fine cells around 389,186 (a TLM rail deck end, #1196) and cut cells around 386,174 and 390,189.

So the cause is the **yield ramp**, the band (16 m wide) where #1152's profile and fit fade out next to cells that the
1 m patches own:

- The road (`roadHeightFn`, index.html) is `w·y + (1−w)·terrainH`. Here `terrainH` is the *fitted* ground `G`.
- The fitted ground (`buildFit`) is `G = m + w·Δ`, with `Δ = y − sag − m` on the carriageway band and `m = meshH`.
- So road − ground = `w·(y − G)`. On a crest, `G > y` for any `0 < w < 1` (`G` is only partly lowered), and the road
  then lies **under** the drawn ground by `w·(G − y)`.
- `ribbonLift` (#290) does not catch this. For a profiled road its `hAt` is `hFn`, the road's own height function, so it
  compares the strip with itself and never sees the ground.

The suspected `hAt` mechanism is real, but it matters only in the ramp. Where `w = 1` the fit puts the ground at
`y − sag` under the carriageway, so the ground stays below the road without any lift.

Region-wide (no rays, pure height math over every profiled road every 8 m): 349 of 54,298 stations lie in a ramp, 196
of those on a crest (`meshH > profile`), and on 75 the predicted sinking `w(1−w)(m−y)` exceeds 5 cm. The bug is therefore
**region-wide wherever a profiled road passes a 1 m patch**, not only between Sisseln and Eiken.

`test_roads_on_profile_smooth_uncovered_and_no_cracks` (#1152 AC 7/9) skips every point with `profileW < 1`, and
`test_grass_and_fields_stay_below_the_road[osm]` samples 10 % of segments. Neither test looked into the ramp.

## Why the ground alone cannot be fixed

The maintainer's constraint is to keep the #1152 profile, never lift the road back onto terrain crests, and lower or fit
the ground to the road. In the ramp, though, the road is *defined* by the ground (`(1−w)·terrainH`). With that
definition, road ≥ ground holds only if `G ≤ y`. At the ramp's outer edge (`w → 0`), continuity with the unfitted
neighbour cells (the coarse mesh or the 1 m patches, crack ≤ 0.01 m, #1152 AC 10) forces `G → m`, and `m > y` on a crest.
No ground fit can satisfy both conditions. The part that has to change is what the ramp's road blends **towards**.

## Design

In `roadHeightFn`, blend the profile with the ground **before the fit** instead of the fitted ground:

```
road = w·y + (1−w)·U        U = unfittedH(x, z): terrainH without the FIT_CELLS lookup (1 m patch or meshH)
```

`buildFit` is unchanged: `G = m + w·Δ` with the same `m = meshH`. Where `0 < w < 1`, a point is more than one cell from
any yield cell, so `U = meshH = m` there. Then

```
road − G = w·y + (1−w)·m − m − w·(y − sag − m) = w·sag ≥ 0
```

at every point. With two roads sharing a cell, `roadFitAt` takes the lowest Δ, so `G ≤ m + w·Δ_own` and the inequality
still holds. Fill (Δ > 0) gives the same identity. The strip still carries its +0.04 m offset, and `ribbonLift` now sees
the mesh's folds through `hFn`, so the interpolation between 4 m ribbon stations and the 4 m fit lattice stays covered.

Effect by zone:

- `w = 1` (99.4 % of profile stations): `return y`, **byte-for-byte unchanged**. The #1152 smoothness tests do not
  move.
- `w = 0` (inside yield cells and their one-cell ring): `U = terrainH` there (the 1 m patch, or the mesh in the ring
  where no fit cell exists), so it is unchanged.
- `0 < w < 1`: the road now lies on the partly lowered ground (`G + w·sag`), not under it. It rises by
  `w(1−w)·(m − y)` compared with today, at most a quarter of the crest height, and never to the original crest `m`.
  The ground stays lowered by `w·|Δ|`.

`unfittedH(x, z)` is a new function next to `terrainH` in index.html. It is the same lookup as `terrainH` without the
`FIT_CELLS` branch (a CUT_CELLS patch, else `meshH`).

## Tests

1. **New** `test_road_stays_over_the_ground_in_yield_ramps` in `tests/test_road_profiles.py`. It runs #1152 AC 9's
   across-the-carriageway check (`terrainAt > roadSurf + 1e-3`), limited to samples with `0 < profileW < 1`, uses one
   page load and no raycasts, and asserts `covered == 0` and `sampled > 300`. It fails on main today.
2. **Extend** `GRASS_SPOTS` (`window.__mm.grassOverRoad`, index.html) with the four issue spots plus the two worst
   scan spots. `test_grass_and_fields_stay_below_the_road[osm]` asserts that each #1247 spot was probed (on drawn
   road and grass) and reads `d < 0.01`.
3. The existing #1152 tests (`test_roads_on_profile_smooth_uncovered_and_no_cracks`, `test_noprofile_is_the_old_drape`)
   stay green **unchanged**.

## Acceptance criteria

- At x 1558.5 / z 715.5, x 1558.5 / z 709.5, x 1549.4 / z 469.2, x 1514.3 / z 375.7, x 1556.7 / z 715.4 and
  x 1546.9 / z 467.8 the grass reads ≤ the drawn road (`grassOverRoad` spot `d < 0.01`).
- The fixed spot list of `grassOverRoad` contains these six spots, and `test_grass_and_fields_stay_below_the_road[osm]`
  asserts that all six are probed and pass.
- Across the carriageway of every profiled road, in every yield ramp (`0 < profileW < 1`), the terrain never stands
  over the drawn road surface (new test, `covered == 0`, `sampled > 300`).
- The #1152 smoothness tests pass unchanged: no edits to `CHECKS`, `test_roads_on_profile_smooth_uncovered_and_no_cracks`
  or `test_noprofile_is_the_old_drape`.
- Where `profileW = 1` the road height is unchanged (`roadHeightFn` returns `y` there, as before).
- `buildFit` / `FIT_CELLS` / the fitted ground are unchanged. The road is not lifted onto the unfitted crest anywhere.
- The CHANGELOG `[Unreleased]` → `### Fixed` gets an entry for the player (German, timestamped).

## Out of scope

- The 10 % sampling of `grassOverRoad` in general.
- The ramp width (`FIT.ramp`) and the yield rule itself.
- `ribbonLift`'s `hAt` for profiled roads at `w = 1` (no measured fault there).
