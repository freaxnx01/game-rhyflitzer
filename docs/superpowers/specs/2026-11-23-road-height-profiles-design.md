# Smoothed road height profiles (#1152)

**Lands before #1151** (bridge and underpass heights from swissTLM3D): the bridge ends of #1151 attach to the
profiles built here. Nothing of #1151 is planned in this spec.

## Problem

Roads undulate while driving ("Wellenstrassen"). A road ribbon is draped on the 16 m terrain mesh
(`ribbonGeo(..., onTerrain = true)`, `index.html:1881`; `terrainH`/`meshH`, `index.html:1585-1620`), so a road that
crosses cells picks up the heights of embankments, ditches and slopes beside it. The terrain data has an 8 m step
(`data/terrain_hochrhein.mmh` header), the game draws a 16 m mesh (`MESH_CELL = 16`, `world.js:37`).

Measured on the A3 (issue comments, 2026-11-23, 43 motorway ways, 5403 samples every 4 m, against the swissTLM3D axis):
game minus real height median +0.16 m, 95 % +1.41 m, extremes -3.6 / +4.9 m; the error changes by up to 1.2 m over
16 m in 1 % of the samples. Off structures, swissTLM3D z equals the swissALTI3D 2 m terrain along the axis within
±0.1-0.2 m, so the profile source is the 2 m terrain along the axis, smoothed. No TLM data is needed here.

## Goal

Every drivable road gets its own smooth height profile from the pipeline. The game lays the road ribbon on that profile
and fits the terrain at the road edges to it (cut or fill), so the car drives on a smooth road and the ground meets it.

## Assumptions

- **C1** [confirmed] "#1152: Which roads get their own smoothed height profile?" → "All drivable roads": motorway down
  to service/track; footways and paths stay draped on the terrain.
- **C2** [confirmed] "#1152: Where the smoothed road and the 16 m terrain mesh no longer meet, what happens?" → "Fit
  terrain to road": terrain at the road edges is cut or filled to the profile, reusing the grade-cut mechanism (#42,
  `GRADE_CUTS` / `gradeCut` in index.html, `L.grades` in the world JSON). Cost to be measured on mobile (load time,
  frame time) as part of the plan.
- **C3** [confirmed] "#1152: Which worlds get it?" → "Pipeline-wide": the change goes into the pipeline, Hochrhein and
  Ehrendingen are rebuilt, and every editor-built world (pipeline/region.py, API service) gets it too.
- **A1** [high] The profile is stored per road as `zp` (heights every 4 m of arc length, the last at the full length),
  optional; a world without it draws as today. Rejected: a height per polyline vertex. `world_roads.py:153` simplifies
  ways at 0.5 m, so a straight road can be two points 500 m apart; `ribbonGeo` resamples to 4 m (`index.html:1882`).
- **A2** [high] The shipped worlds get `zp` through an idempotent retrofit script (`pipeline/road_profiles.py`), the
  same code `osm.build_world` and `region._world` call. Rejected: a full `osm.py build` of Hochrhein/Ehrendingen.
  `cap_ridges.py:3-5`: "a CI runner has no OSM extract, and a full `osm.py build` would drag in every OSM edit since the
  last stand"; the `era_*.py` steps are retrofits the same way (`docs/11-pipeline-osm.md:145-151`).
- **A3** [med] The profile comes from the same data as the terrain under it: swissALTI3D 2 m where it has data, LGL DGM1
  only when `--dgm-dir` is given and the `.mmh` header lists DGM1, else the `.mmh` itself. Rejected: DGM1 for German
  roads regardless of the terrain. The shipped `terrain_hochrhein.mmh` header lists only "swissALTI3D (c) swisstopo",
  16 % of its grid is the no-data fill 0 (`terrain.py:186-190`), and no DGM1 folder exists on the agent box; DGM1
  roads over that flat fill would float metres above the ground. German roads outside the swissALTI3D strip therefore
  stay as flat as their terrain until DGM1 is added to the terrain (out of scope).
- **A4** [med] Smoothing is a Gaussian over the 2 m samples, sigma 15 m (motorway, trunk), 8 m (links and other main
  roads), 4 m (the rest, trails), with the samples extended 3 sigma past each end. Rejected: a max-grade-change limiter
  (the issue's "e.g."). The real A3 is very smooth (swissTLM3D 2nd difference ≤ 0.01 m per 2 m, issue comment); the 2 m
  terrain along an axis has 0.2-0.9 m bumps at 2 m scale (issue body), which a Gaussian of these widths removes.
- **A5** [med] Junctions, T-joins and at-grade crossings are pinned in class-rank order (the first road to reach a
  point fixes its height), with a hat correction fading over 30 m. Rejected: one global least-squares solve over the
  network (more code, no visible gain for an 0.1-0.3 m mismatch).
- **A6** [med] A station whose 2 m height differs from the `.mmh` by more than 5 m takes the `.mmh` height. Rejected:
  no guard. Probe: the 8 m terrain along drivable axes vs the 16 m mesh has a max gap of 40.95 m (p99 1.47 m) on
  Hochrhein, i.e. single stations next to cliffs/quarries where the axis sampling hits a wall.
- **A7** [high] Eligible roads: `cls` in `world_roads.DRIVE` or `trail`, not `bridge`. Foot classes reach the world only
  as bridges (`world_roads.keep`, `world_roads.py:25-33`) and the game-only cycleway paths (`world_extra_roads.py:61-66`)
  are paths: both stay draped (C1).
- **A8** [med] Where the game already patches terrain at 1 m (#76 rail cuts, #1044 road cuts, #42 grades, #259 stone
  bridge banks, #477 pads, the hideout), profile and fit step back: weight 0 in those cells and one ring around them,
  ramping to 1 over 16 m; the road drapes there as today. Rejected: making those mechanisms profile-aware (bridges and
  underpasses are #1151's).
- **A9** [med] The fit is drawn in its own `FIT_CELLS` at 4 m sub-cells (`FIT_N` 4; 8 if the budgets allow), with a
  flat margin of one sub-cell diagonal + 0.5 m beside the carriageway. Rejected: the 1 m `CUT_N` patches of the grade
  cut. Probe on the shipped Hochrhein world: 42 755-54 127 road cells → 21.9-27.7 M triangles at 1 m, 1.4-1.7 M at 4 m
  (the whole ground mesh is about 0.6 M).
- **A10** [med] Cost gate on the desktop GPU browser at a phone viewport with 4x CPU throttle: ≤ 2.0 M added ground
  triangles, load time ≤ +3 s and ≤ +15 %, frame time ≤ +15 % (start view, A3); a failing `FIT_N` 4 stops the
  implementation with the numbers. The real-phone check is manual after deploy, as in
  `docs/superpowers/specs/2026-11-18-gpu-memory-budget-design.md:113`.
- **A11** [high] No `PIPELINE_VERSION` bump: world ids stay; pinned gallery worlds are re-queued by the operator
  (`service/README.md:151-170`: "World ids stay the same (the `PIPELINE_VERSION` is not bumped)").

## Design

### 1. World format: `zp` on a road

A road in `world.roads` may carry `zp`: heights in game metres (absolute height minus the terrain's `base`, the same
frame as the `.mmh`), rounded to 0.01 m, at stations every `PROFILE_STEP` = 4 m of arc length along `pts`, plus one
last value at the road's full length. `len(zp) = floor(L / 4) + 1`, plus 1 more when `L` is not a whole multiple of 4.
A road without `zp` (bridges, foot/path/cycleway ways, old worlds) is drawn exactly as today. The format stays `MMW1`.

### 2. Pipeline: `pipeline/road_profiles.py`

One module, used three ways: as an idempotent retrofit CLI for the shipped worlds (like `cap_ridges.py`), from
`osm.build_world` when a profile source is given, and from `region._world` for every editor-built world.

- **Eligible roads**: `cls` in `world_roads.DRIVE` or `trail: true`, and `bridge` false. Game-only cycleway paths of
  the extra roads (`world_extra_roads._piece_roads`) and foot bridges are not eligible (C1).
- **Height source** (`Sampler`): absolute heights at game (x, z). Per point, in this order: swissALTI3D 2 m tiles
  (`terrain.swiss_tiles`, the same cache the terrain step uses) where they have data; LGL DGM1 (`terrain.german_datasets`)
  only when a `--dgm-dir` is given **and** the `.mmh` header's `sources` lists DGM1; otherwise the world's own `.mmh`
  (bilinear, plus its `base`). The profile must come from the same data as the terrain under it: the shipped Hochrhein
  terrain lists only swissALTI3D and 16 % of its grid is the no-data fill at 0, so a DGM1 profile there would float
  German roads metres above the drawn ground. A station whose 2 m height differs from the `.mmh` by more than
  `GUARD` = 5 m takes the `.mmh` height (cliff edges, quarry walls, data seams).
- **Raw profile**: the source sampled every 2 m along the axis, extended `3 sigma` past each end along the end
  segment's direction, so the smoothing is centred up to the end.
- **Smoothing**: a Gaussian with `sigma` by class: `motorway`, `trunk` 15 m; `motorway_link`, `trunk_link` and the other
  `world_roads.MAIN` classes 8 m; everything else (incl. trails) 4 m. Then resampled to the 4 m stations.
- **Junction pinning**: roads meet at shared end points, at T-joins (an end within 0.5 m of another road's interior)
  and at at-grade crossings (two eligible roads intersecting). Roads are processed by class rank (motorway first,
  trails last; ties by id). The first road to reach a point fixes its height: a later road whose end lies within 0.5 m
  of a fixed node takes that node's height; a later road that touches or crosses an already finished road takes that
  road's profile at the contact. Each such pin `(t_k, d_k)` (`d_k` = target minus the road's own smoothed value) is
  applied as a hat `d_k * max(0, 1 - |t - t_k| / F_k)`, `F_k = min(30 m, distance to the neighbouring pins)`, so every
  pin is met exactly and the correction is gone 30 m away. Pieces of one OSM way (solid/broken splits) are separate
  roads and pin to each other the same way.
- **Base**: the `.mmh` header's `base` is subtracted, so `zp` and `terrainH` share one frame.
- **Sources line**: the world's `sources` gets "Road heights: swissALTI3D © swisstopo" (once; idempotent).

CLI: `python road_profiles.py --world ../data/world_hochrhein.json --mmh ../data/terrain_hochrhein.mmh --cache cache
[--dgm-dir DIR]`. `osm.py build` gains `--profiles CACHE` (off by default, so `test_golden.py` stays as it is);
`region._world` always runs it with its own cache and terrain.

No `PIPELINE_VERSION` bump: world ids stay, and pinned gallery worlds are re-queued by the operator after deploy
(`service/README.md`, "Rebuild gallery worlds after a pipeline fix"). Non-gallery editor worlds get profiles on their
next build.

### 3. Game: the ribbon on the profile

- `world.js` (pure, node-tested): `PROFILE_STEP = 4`, `profileAt(zp, len, t)` (linear between stations, clamped),
  and `splitKept` carries `zpFrom` (the piece's start along the original road) so a 1952 piece reads the right stretch.
- `index.html`: a road with `zp` is drawn with `ribbonGeo(pts, hw, 0.04, tile, false, hFn)` where `hFn(p)` is the
  blended road height at the nearest station of the road (`nearestOnPolyline`), then lifted with `ribbonLift` against
  `terrainH`, so the ribbon can never dip under the drawn ground. `roadSurfH`, `roadTopH`, markings (`markGeo`),
  junction discs and bridge-end seating (`seatGenericEnds(roadTopH)`) all read the drawn ribbon and follow
  automatically.

### 4. Game: fitting the terrain to the road (C2)

The grade-cut idea (#42, `gradeCut` / `gradeCutAt`, `world.js:525-566`) generalised to fill as well as cut and to many
roads:

- `roadFitAt(fit, x, z, m)` (pure, `world.js`): for the road whose fitted zone is nearest, with `d` = distance from its
  axis, `y` = its profile there and `m` = `meshH(x, z)`: inside `inner = hw + FIT.margin` the ground is `y`; beyond it
  a 1:`FIT.bank` (1:2) bank climbs or falls from `y` back to `m`; the change `|target - m|` is capped at
  `(outer - d) / FIT.bank`, so it is 0 at `outer` and beyond. `outer` is per road, like `gradeCut`'s:
  `hw + FIT.margin + min(FIT.bank * (maxGap + 0.5), FIT.maxBank)` with `maxGap` the largest `|profile - meshH|` along
  its axis and `FIT.maxBank` = 12 m (a gap up to 6 m is fitted in full; beyond it `ribbonLift` keeps the ribbon on top).
  Returns the change to add to `m` (positive = fill, negative = cut).
- **Resolution**: fitted cells are drawn as `FIT_N x FIT_N` patches (`FIT_N` = 4: 4 m sub-cells), not the 1 m
  `CUT_N` patches. A 1 m patch on every road cell is out of reach: probe on the shipped Hochrhein world, 3553 drivable
  non-bridge roads, 419.6 km, touch 42 755 of 299 465 cells within 1.5 m of the edge (54 127 within 6 m); at 1 m that is
  21.9-27.7 M triangles, at 4 m 1.4-1.7 M. Ehrendingen: 6125-7823 cells, 0.20-0.25 M triangles at 4 m.
- **Margin**: with 4 m sub-cells a triangle reaches one sub-cell diagonal, so `FIT.margin = FIT_CELL * sqrt(2) + 0.5`
  (6.2 m at `FIT_N` 4, 3.3 m at 8): every vertex whose triangles touch the carriageway sits on the profile.
- **Which cells**: a cell within `outer` of a profiled road (via the existing `patchCells`) is patched when any of its
  `(FIT_N + 1)^2` vertices changes by more than 0.01 m. Fitted cells live in their own `FIT_CELLS` map; `terrainH` reads
  `CUT_CELLS` first, then `FIT_CELLS`, then the mesh. The ground mesh drops a fitted cell's two triangles and draws the
  patch, as it does for `CUT_CELLS` (`index.html:2659-2681`).
- **Yield zones**: where the game already patches terrain at 1 m (#76 rail cuts, #1044 road cuts, #42 grades, #259
  stone-bridge banks, #477 pads, the hideout's cave cells: every `CUT_CELLS` key and cave cell after `buildCuts`), the
  profile and the fit step back. Weight `w` = 0 inside those cells and in the ring of cells around them, rising linearly
  to 1 over the next 16 m. The fit is multiplied by `w`; the ribbon height is `w * profile + (1 - w) * terrainH`. So a
  fitted cell never borders a 1 m cell (no crack), and the existing cuts and bridge logic run unchanged until #1151.

### 5. Cost measurement (C2)

A debug hook `__mm.roadFit()` returns `{ roads, cells, triangles, ms }` (profiled roads, fitted cells, triangles added
to the ground, build time). `?noprofile=1` builds the world without profiles and fit, for A/B on the same build.
The plan's measurement task runs Hochrhein in the GPU browser at a phone viewport with and without `?noprofile=1` and
records: world load time (navigation to `#mmhstatus.real` + start ready), `__mm.frameMs(120)` at the start view and on
the A3, `__mm.renderInfo().triangles`, and `__mm.roadFit()`. Budgets (desktop GPU browser, phone viewport, 4x CPU
throttle via CDP):

| Measure | Budget |
|---|---|
| Triangles added to the ground (Hochrhein) | ≤ 2.0 M |
| Load time increase | ≤ 3 s and ≤ 15 % |
| Frame time increase (start view, A3) | ≤ 15 % |

`FIT_N` 8 is used if it meets every budget, else `FIT_N` 4. If `FIT_N` 4 fails a budget, the implementer stops and
reports the numbers instead of shipping. The real-phone measurement is a manual check after deploy (the debug panel's
frame rate line, #1069), as in the GPU-memory work (2026-11-18 spec).

## Acceptance criteria

1. `pipeline/road_profiles.py` adds `zp` to every eligible road and to no other, idempotently; footways, paths,
   cycleways and bridges get none.
2. A profile is centred-smooth: on a synthetic 2 % grade with 0.5 m bumps every 4 m, `zp` follows the grade within
   0.05 m everywhere, ends included.
3. Junctions match: roads sharing an end, a road ending on another road's interior, and two roads crossing at grade
   have equal heights there (≤ 0.05 m: the 0.01 m rounding plus the 4 m station spacing around a mid-road pin).
4. The German side without DGM1 in the `.mmh` takes the `.mmh` height; a station more than 5 m off the `.mmh` takes the
   `.mmh` height.
5. `osm.py build --profiles CACHE` and `region.build_world` write `zp`; without `--profiles`, `osm.py build` output is
   unchanged.
6. `data/world_hochrhein.json` and `data/world_ehrendingen.json` carry `zp` (retrofit, nothing else in them changes
   apart from the sources line).
7. In the game, on every profiled road outside yield zones, the driven height `roadTopH` on the axis equals the profile
   + 0.04 m within 0.05 m (99 % of stations).
8. On the A3 the driven height is smooth: the second difference over 8 m of `roadTopH` along every motorway axis is
   ≤ 0.10 m at the 99th percentile (it is the 16 m mesh today).
9. The terrain never covers a profiled road: at 1 m steps across and along, `terrainH ≤ roadTopH` on the carriageway.
10. No crack: on every fitted cell's border, `terrainH` evaluated from either side agrees within 0.01 m (the
    patch threshold; a neighbour that changes by less is left on the mesh).
11. Worlds without `zp` (an old editor world) draw and drive exactly as before.
12. The cost table above is filled in in the PR with the measured numbers, and within budget.

## Out of scope

- Bridge and underpass heights (#1151, swissTLM3D).
- Making the #76/#1044/#42/#259 patches profile-aware (they yield, section 4).
- Adding DGM1 to the Hochrhein terrain.
- Crossfall/banking of the carriageway.

## Consequences

- Bridge ends are seated on `roadTopH` (`index.html:2713`), so generic deck ends move with the new road heights until
  #1151 redoes them; height goldens in `tests/test_bridge_ends.py`, `tests/test_road_underpass.py` (`SEATS`),
  `tests/test_jump.py` and `tests/test_pontoon.py` may move.
- The verge beside every road is flattened to the profile for up to `FIT.margin` (6.2 m at `FIT_N` 4) past the edge,
  then banks back 1:2 (at most 12 m further). Everything placed on `terrainH` there (bus stops, props, car parks, fields, building
  bases) moves with it.
- `world_hochrhein.json` grows by about 0.6 MB (≈105 000 stations), `world_ehrendingen.json` by about 0.1 MB.
- Load time rises by the fit's patch build; frame time by the extra ground triangles (measured, section 5).
- On the German bank beyond the swissALTI3D strip the terrain is the flat no-data fill; roads there get flat profiles,
  as flat as today.
- Gallery worlds keep their draped roads until the operator re-queues them.
