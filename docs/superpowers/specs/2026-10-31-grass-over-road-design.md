# Grass over the road and road markings under it (#290)

## Problem

`test_grass_and_fields_stay_below_the_road[osm]` is red on real defects (issue #290, measured after #273):
`{'worst': 0.0578, 'bad': 7, 'done': 4002, 'marksSeen': 209, 'marksBelow': 9}`. Seven sampled spots show grass above
the drawn road, seven show road markings under it. Two more spots come from test feedback on the
**Geuerenstrasse** (OSM way -42004, `pipeline/anchors.json:62`) west of the Plattform Sisslerfeld: a strip of grass on
the eastbound half of the road for about 40 m, x 255–292, z 416–418, and around the car at x 314, z 421 heading west.

## Reproduction (measured 2026-10-31 on `main` 418f3cc, GPU browser, OSM world, measured terrain)

A probe page (a copy of `index.html` with read-only hooks, not committed) raycast each spot against the drawn meshes and
read the road's own registered surface (`sf = { pts, hw, hl, hr }`) at the segment under it.

### Cause A — the drape lift misses folds inside the road's width (all grass spots)

At every grass spot the grass hit equals `terrainH` (the grass mesh is the terrain, no stray mesh), and the road hit is
the road's own ribbon, a few cm *under* the terrain. The road's quad there has a strong cross-fall and is twisted
(the corners do not lie in one plane):

| Spot | road | corners A/B/C/D (left i, right i, right i+1, left i+1) | drawn (triangles) | bilinear | terrain |
|---|---|---|---|---|---|
| (-2978.85, 610.72), side +5.36 | motorway, hw 7 | 12.303 / 11.789 / 11.873 / 12.263 | 11.883 | 11.877 | 11.941 |
| (-2231.9, 705.4), centre | motorway, hw 7 | 22.429 / 19.435 / 18.469 / 22.063 | 20.449 | 20.599 | 20.468 |
| (-4684.35, 3153.85), centre | Hauptstrasse, hw 3.5 | 98.590 / 99.177 / 99.017 / 98.700 | 98.804 | 98.871 | 98.827 |
| (1075.85, 1181.1), centre | Gehrenstrasse, hw 2 | 35.072 / 35.053 / 35.299 / 35.602 | 35.185 | 35.256 | 35.203 |
| (1599.56, 962.82), side -3.36 | primary, hw 4.5 | 25.346 / 24.280 / 24.215 / 25.386 | 25.206 | 25.217 | 25.220 |
| (-1500.65, 5151.7), centre | secondary, hw 4 | 205.796 / 208.321 / 207.698 / 205.556 | 206.747 | 206.843 | 206.755 |
| Geuerenstrasse (280, 418.2), side +2.5 | -42004, hw 3.5 | 19.022 / 20.633 / 20.662 / 19.112 | 20.403 | 20.403 | 20.450 |

Along the Geuerenstrasse's +2.5 m line the grass stands over the road from x 271 to x 283 (0.005, 0.017, 0.032, 0.047,
0.022 m). The road there falls 1.5–1.7 m across its 7 m width; the terrain's cross-section has a ridge between the
centre line and the right edge (centre 19.76, +2.5 m 20.45, edge about 20.59).

`ribbonGeo` (`prototype/index.html:1218-1224`) drapes a road at `terrainH + 0.04` on its edge vertices and then lifts a
segment where the ground bulges above it, but its check samples **only three lines** (left edge, right edge, centre) at
1 m steps, and compares the centre against the **average of the two edges** — not against the two triangles the strip
is actually drawn with ((A,B,C) and (A,C,D)). So it misses

1. a terrain fold that lies between those lines (Geuerenstrasse, the motorway at side +5.36, the Sisseln primary), and
2. the twist of the quad itself: the drawn diagonal A–C lies up to 0.15 m under the bilinear centre the check assumes
   (the motorway at -2231.9: 20.449 vs 20.599).

### Cause B — markings follow a different surface than the drawn road (six of seven mark spots)

The issue suspected "an overlapping road drawn higher". That holds for **one** spot (Fricktalstrasse, below); at the
other five only the marking's own road is under the ray. The marks are laid with `surfaceAt(sf, …)`
(`prototype/index.html:1216`, used once at `:1877`), which interpolates the quad **bilinearly**; the road is drawn
(and `roadSurfH`/`surfH` reads it, `:1143`) with the **triangle split**. On a twisted quad the two differ at the
centre line:

| Spot | road | drawn | `surfaceAt` (bilinear) | mark |
|---|---|---|---|---|
| (-2944.65, 1608.5) | Hauptstrasse | 68.020 | 67.774 | 67.809 |
| (-456.7, 3812.45) | Obermumpferstrasse | 155.241 | 155.039 | 155.073 |
| (-3385.5, 686.3) | Ankengasse | 7.991 | 7.884 | 7.916 |
| (4207.95, -495.3) | Murgtalstrasse | 16.919 | 16.839 | 16.870 |
| (1559.75, 1974) | Hauptstrasse | 45.609 | 45.557 | 45.588 |

Fricktalstrasse (-1483.85, 450.2): the mark of way 25049381 (own drawn surface 7.571, `surfaceAt` 7.588, mark 7.618)
lies under the ribbon of the parallel way 1238849925, whose strip overlaps it there (3.34 m off its centre, hw 4.5)
and is drawn at 7.761 — the issue's "overlapping road drawn higher".

Even with the right formula a mark would still dip: its vertices sit 4 m apart, but along the centre line the drawn
surface folds at the quad's diagonal (t = f = 0.5), so the straight mark between two vertices cuts under the fold.

### Cause C — markings of a bank road buried by the Fridolinsbrücke abutment

(-1219.25, 536.25): way 175815139 (`bridge: false`) is a bank road the #78 stone chain builds an **abutment** over
(`addApproach`, `prototype/index.html:948`; `onBridge` calls it "solid ground ... the bank road it buries", `:863`).
The first road hit is the abutment's `road` strip at 15.009; the bank road's own ribbon (10.095) and its centre line
(10.125) are still drawn 4.9 m under it. Hidden from view, but drawn for nothing, and counted by the check.

## Design

### A: lift the drape against the drawn triangles on a lattice

A new pure function in `prototype/world.js`:

`ribbonLift(left, right, hl, hr, hAt, across = 0.5, along = 1)` → `Float64Array` of per-vertex lifts. For each quad
(A = left i, B = right i, C = right i+1, D = left i+1), sample a lattice with at most `across` m between samples across
the strip and `along` m along it (edges included), compute the drawn height with the quad's two triangles (A,B,C),
(A,C,D) via the existing `trisHeightAt`, and take the worst `hAt(p) − drawn`. Both ends of the quad get that excess (as
today). Lifting the four corners of a quad by e raises both its triangles by exactly e, and neighbouring quads only
rise, so one pass is enough.

`ribbonGeo`'s inline bulge loop is replaced by `ribbonLift`. Every draped ribbon (roads, streams, the hand world's
gravel shore) gets the same check. The 0.04 m lift stays; with 0.5 m across, a fold is found within 0.25 m, so the
residual stays inside that margin for the folds measured (slope change ≤ 0.15 m/m).

### B: markings on the drawn surface, with the folds as vertices

Two more pure functions in `prototype/world.js`:

- `surfTriAt(sf, x, z)`: the height of a registered strip at (x, z) with the **drawn** split (triangle (A,B,C) where
  f ≥ t, (A,C,D) elsewhere — the formula `surfH` uses), on the nearest segment, t and f clamped; `null` when the
  nearest segment is more than `hw + 0.01` away (the strip does not cover the point). Replaces `surfaceAt` (deleted;
  its one caller moves over).
- `surfFolds(sf, pts)`: `pts` plus every point where the line crosses a fold of the strip under it — a segment's
  transverse edge (s = 0 or 1) or its diagonal (t = f). Heights taken at those points and interpolated linearly in
  between then lie exactly on the drawn triangles.

A mark line is laid on the **highest** strip that covers it: its own road and every other road strip that overlaps
the run (found with `gridQuery(SURF_GRID, …)` along the run). The folds of all those strips are inserted
(`surfFolds` applied once per strip), and the height is `max(surfTriAt(s, x, z))` over them. This fixes the
Fricktalstrasse spot and the five twist spots with one rule. No `hw + 0.3` slack (unlike `surfH`), so a neighbouring
strip that ends just short of the mark does not lift it into the air.

### C: no markings on a road buried by an abutment

`keptRuns(pts, keep)` (pure, world.js) splits a polyline into the runs of consecutive points that pass `keep`. The
marks loop resamples each mark line at 4 m (what `ribbonGeo` does anyway) and keeps the points that are not under an
abutment (`onBridge(x, z, 1e4)?.b.approach`). The stone chain and its abutments carry no markings (the loop already
skips `r.bridge`), so the buried bank road now matches. A road that passes *under* a deck (an underpass) is not
affected: only abutments (`approach`) bury.

### The check

`window.__mm.grassOverRoad` (`prototype/index.html:3964`) also rays a fixed list of spots in the OSM world, like
`sinkCheck`'s `SINK_SPOTS`: the 14 spots from the issue and the Geuerenstrasse +2.5 m line at x 271–286. Each spot
counts into `worst`/`bad`/`done`/`marksSeen`/`marksBelow` and is returned in `spots: [{ at, d, marksBelow }]`. Not for
the `only` variant (Südspange tests).

## Acceptance criteria

- `test_grass_and_fields_stay_below_the_road[osm]` passes with its limits unchanged (`worst < 0.01`,
  `marksBelow == 0`, `done >= 2000`, `marksSeen > 5`), and additionally every fixed spot has `d < 0.01` (at least 15
  spots checked).
- `test_grass_and_fields_stay_below_the_road[hand]` passes unchanged.
- Node tests: `ribbonLift` lifts a strip over a ridge between its edge and centre and over a twisted quad's low diagonal,
  and leaves a planar slope alone; `surfTriAt` returns the drawn diagonal, not the bilinear centre, and `null` off the strip; `surfFolds` adds the
  diagonal crossing; `keptRuns` splits around dropped points.
- `test_wheels_do_not_sink_into_the_road` and the `test_suedspange.py` grass checks still pass.
- No marking is drawn on way 175815139 under the Fridolinsbrücke abutment.

## Out of scope (discoveries)

- Many draped roads have a steep **cross-fall** that follows the hillside (Geuerenstrasse 1.6 m over 7 m, about 22 %;
  secondary 36804078 2.5 m over 8 m; the motorway at -2231.9 3 m over 14 m). Real roads are benched near level across.
  Levelling the cross-section is a separate change (it would cut or fill the terrain beside the road).
- Fields: none of the measured spots involve the field mesh.
