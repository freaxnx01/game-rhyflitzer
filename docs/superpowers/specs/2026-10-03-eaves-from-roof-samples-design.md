# Eaves from roof samples only (#34): design

**Issue:** #34, Bodenackerstrasse 6 too low (22.8 m instead of ~27 m).
**Status:** headless enrichment, 2026-10-03.
**Scope:** `pipeline/building_heights.py`, its unit tests, the golden test, then a guarded world rebuild. No prototype change.

## Root cause (measured)

All numbers come from the cached tiles in `pipeline/cache/{swisssurface3d,swissalti3d}` and the shipped
`data/world_hochrhein.json`. A read-only re-run of `building_heights.apply()` over the 1,693 `hsrc: "dsm"` buildings
reproduces every shipped `h`, `rh` and `roof` exactly, so the numbers below describe the shipped world.

Bodenackerstrasse 6 (`w171822634`, 6a–6d): 40-vertex stepped footprint, 904 m², fill 0.67, ground under the centroid
304.66 m. After the 0.75 m shrink there are 3,060 surface samples:

| Height over ground | Samples | Share |
|---|---|---|
| -1 to +2 m (ground inside the outline) | 229 | 7.5 % |
| 2 to 22 m (facade edge, ramp) | 49 | 1.6 % |
| 22 to 25 m | 186 | 6.1 % |
| 25 to 26 m (main roof) | 2,390 | 78 % |
| 27 to 30 m (rooftop plant) | 135 | 4.4 % |

The eaves `h` is the **10th percentile over all samples** (`building_heights.py:82`). With 9 % of the samples at
ground level or on the wall, the 10th percentile lands on the edge of the roof: **22.8 m**. The main roof is at
**25.4–25.6 m** (median 25.5 m), the plant on top reaches 27.8 m (99th percentile). `rh` = 95th percentile − 10th =
26.7 − 22.8 = 3.9 m, but a flat roof draws `h` only (`prototype/index.html:543-546`), so the block renders 2.7 m short.

It is not:

- **the shrink (erosion):** without the shrink the 10th percentile drops to -0.0 m. The shrink helps, it doesn't
  cause this.
- **the pitched-roof push-down:** the block is `flat` (fill 0.67 < 0.85, so the ridge never promotes it), and the
  push-down only applies to `gable`.
- **the eaves floor `MIN_H`:** 22.8 m is far above 2.5 m.
- **the ground reference:** centroid ground 304.66 m vs. the lowest DTM value at the outline 304.14 m (0.5 m). It
  costs about 0.5 m in the game, not 4 m (see *Out of scope*).

The "~27 m" in the issue and in `test-todo.md:9` is a storey estimate (8 storeys), not a measurement. The surface
data says 25.5 m to the main roof and 26.7–27.8 m to the rooftop plant.

### The row houses (#43/#45: 4a–4f "three storeys, ~9 m", `h` 6.2 m) are a different cause

4a–4f (`w171822953`): 1,248 samples, **none** under 2 m over ground, 10th percentile = median = 6.2 m. 3a–3f and
8a–8f look the same (6.3 m, 6.2 m). The percentile, the shrink and the eaves logic are all fine here: the roof
really is 6.2 m above the ground **under the centroid**.

What differs is the terrain. Under 4a–4f the DTM runs from 303.24 m to 305.92 m, so the ground falls about 1.5 m from
the centroid to the low side (centroid minus lowest DTM at the outline: 1.48 m; 3a–3f 1.38 m; 8a–8f 1.66 m). Measured
from the low side the facade is about 7.6 m, which is three low storeys. The game puts a building's base at the
lowest terrain under its outline (`osmBuilding()`, `index.html:531`) and adds `h`, so these roofs end up about 1.4 m
below the real ones. This fix leaves them at 6.2 m.

## Fix

The eaves are read from **roof samples only**: samples at least `NOT_BUILT` (2 m) over the ground. Lower samples
are ground inside the outline: courtyards, ramps, an outline that misses the roof. A wing or annex at least 2 m
high still counts, so stepped buildings keep their lower parts.

A new pure function in `pipeline/building_heights.py`:

```python
ROOF_MAJORITY = 0.5   # share of the footprint samples that must be roof for the eaves to come from roof samples only (#34)

def eaves(vals, ground, min_samples=8):
    """Eaves level: the 10th percentile of the roof samples, those at least NOT_BUILT over the ground (#34). ..."""
    roof = vals[vals - ground >= NOT_BUILT]
    if len(roof) < min_samples or len(roof) < ROOF_MAJORITY * len(vals):
        return float(np.percentile(vals, 10))
    return float(np.percentile(roof, 10))
```

`apply()` uses `eaves()` for `lo` and keeps `hi` as the 95th percentile over **all** samples, so `rh` changes only where
`lo` moves. Everything after that stays as it is: the `NOT_BUILT` check on `hi`, the push-down, `roof_shape()` (#43),
`MIN_H` and `max_h`.

**Majority guard:** when fewer than half the samples are roof, the outline is mostly something else (an open
structure, a tank farm, a footprint mapped over a yard). There the old statistic stays, so a few roof pixels cannot
lift a shed into a block. That covers 24 buildings in the region. Without the guard, 3 of them would rise by more than
0.5 m, for example `118856577`, which has 92 % ground samples and would go from 2.5 to 8.3 m.

## Effect, region-wide (1,693 measured buildings)

| | Count |
|---|---|
| `h` unchanged | 1,513 |
| `h` raised (never lowered) | 180 |
| raised > 0.5 m / > 1 m / > 2 m / > 5 m | 73 / 53 / 32 / 4 |
| largest rise | +8.5 m (`191251562`, industrial, stepped 19/25 m roof, 10.7 → 19.1) |
| off the 2.5 m floor (`h` was `MIN_H` with an `rh` of 9–15 m) | 44 of 269 |
| `rh` changed | 200 |
| roof flips | 1 gable → flat; 7 now fall in the 0.6–1.5 m band, where the footprint heuristic decides |
| tallest building | unchanged, 32.5 m (`155170807`); nothing goes above 27.7 m that wasn't already there |

Bodenackerstrasse 6: **h 22.8 → 25.3 m, rh 3.9 → 1.4 m, still flat.** Its label height `h + rh` (`roofTop`,
`prototype/world.js:115`) stays at 26.7 m. Inside Sisseln (point in polygon against the world's own Gemeinde
boundaries) it was already the tallest (next: industrial halls at 20.1 m and 19.1 m), and it still is.

Spot checks of the largest rises: `162837607` (7–21, x ≈ -1,550) has its main roof at 16.5 m with 6 %
at 1–2 m and a 4 m annex: 4.6 → 13.1. `123809034` (5–9) has 23 % ground in a courtyard and its roof at 11–12 m:
2.5 → 9.6. Both move toward the real roof, not past it.

## Tests

- **Unit, pure:** `eaves()` ignores samples under 2 m when roof is the majority, keeps the old 10th percentile when
  it isn't, and counts a 2 m annex as roof.
- **Unit, synthetic tiles:** a 25 m flat roof whose outline takes in a 3.5 m strip of ground (15 % of the samples)
  measures `h ≈ 25`, `rh ≈ 0`, `flat`. Today it comes out at `h` 2.5 as a `gable`, because the ground strip makes a
  25 m "ridge". This is the failing test that pins the bug. A mostly-ground outline keeps `h` 2.5.
- **Golden (real data, `world_dsm`):** Bodenackerstrasse 6 has `24.5 <= h <= 26.5`, `roof == "flat"`, and is the
  tallest building inside Sisseln's boundary. No measured building is above 32.5 m. This replaces `h >= 20`.
- Existing tests unchanged: the row-house roofs and eaves (`h >= 6.0`) in `test_bodenacker_row_houses_roof_from_the_ridge`,
  the region medians, and the unbuilt footprint (`1326045746` keeps 12 m).

## Coordination and landing order

1. **#43 (roof from the ridge)**: already on `main` (`3eb4906`, `db7367a`), and the shipped world was built with it.
   #34 changes only the `lo` statistic in front of `roof_shape()`. #43's A5, "eaves untouched, #34 is separate", holds
   for #43's own blocks: none of the sixteen Bodenackerstrasse row-house blocks changes `h`, and 20a–20f's `rh` moves
   by 0.1 m at most (3.3 → 3.2).
2. **#45 (row-house facade)**: already on `main`. It takes whole storeys from `h` (`round(h / 3)`). #34 doesn't change
   the row houses, so they stay at two storeys. #45's A9 expected #34 to lift them to ~9 m. That doesn't happen,
   because their shortfall comes from the ground reference.
3. **#34 (this):** lands after both. Code PR plus a guarded local world rebuild.

## Out of scope (recorded, not acted on)

- **Ground reference.** `h` is measured from the DTM under the centroid, but the game stands the building on the
  lowest terrain under its outline. Region-wide, centroid DTM minus the lowest MMH value at the outline: median
  0.35 m, p90 1.55 m, over 2 m for 99 buildings, over 4 m for 24, up to **47.6 m** at the Rhine bank. That explains the
  row houses (~1.4 m) and 0.5 m of Bodenackerstrasse 6. A fix needs its own guard against cliffs and the river cut,
  and it moves every building on a slope. It belongs in its own issue.
- Rooftop plant as geometry; `levels`/`height` tags from OSM; the prototype's flat-roof drawing.

## Assumptions

- **A1** [high] The cause is the 10th percentile over samples that include ground inside the outline, not the
  shrink, the push-down, `MIN_H` or the ground reference. Evidence: the sample table above, reproduced exactly from
  the shipped world.
- **A2** [med] "About 27 m" is met by the measured main roof, `h` ≈ 25.3 m (golden band 24.5–26.5). The rooftop plant
  (to 27.8 m) is not eaves. Rejected: the 99th percentile or `h + rh` as `h`, which would push flat-roofed buildings
  with plant or parapets up across the region. `test-todo.md:9`'s "27 m" is a storey estimate.
- **A3** [high] The roof-sample threshold reuses `NOT_BUILT` (2 m), the pipeline's existing "this is a building, not
  ground" cut (`building_heights.py:23`). Rejected: a new constant, or trimming the facade ramp (2–22 m), which also
  matches real lower wings.
- **A4** [med] Majority guard at 50 %. Rejected: no guard, which lifts 3 mostly-ground outlines by 0.6–5.8 m on a
  handful of roof pixels.
- **A5** [high] `hi` (95th percentile) stays over all samples, so `rh` and `roof_shape()` move only where the eaves
  move. Rejected: filtering `hi` too, which changes `rh` on 1,065 buildings by rounding noise.
- **A6** [med] The ground-reference offset that explains the row houses is a separate follow-up, not part of #34.
  It is a broad change with a 47 m edge case. Rejected: folding it in here.
- **A7** [high] No prototype change. `osmBuilding()` already draws `h` (`index.html:543-546`), and the Playwright
  tests that touch this building read their expected values from the world file (`test_debug.py:27`,
  `test_street_labels.py:58`).
