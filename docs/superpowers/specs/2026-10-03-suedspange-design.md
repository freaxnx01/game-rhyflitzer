# Südspange ESP Sisslerfeld, drivable while under construction (#42)

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #42 · builds on #76

## Goal

The new Südspange ESP Sisslerfeld is in the game as a drivable road, from the new junction on the K295
Laufenburgerstrasse to the Sisslerstrasse in Münchwilen, with the access road to the SBB Freiverlad. It runs in a
cutting near the K295 and under the DSM industrial tracks through an underpass. The HUD names it "Südspange".

Source: Kanton Aargau, *kNP Südspange ESP Sisslerfeld, erläuternder Planungsbericht* (2 May 2023), route text and
cross-sections (§3.5). The report's figures are not committed (Kanton/swisstopo material, public repo). The route
below is traced from the report's text, OpenStreetMap (`pipeline/cache/osm/hochrhein.osm.pbf`, cut 2026-10-01) and
the measured terrain (`data/terrain_hochrhein.mmh`).

## Decisions taken by the user (2026-10-03)

- Reuse existing OSM ways where the route follows field paths, DSM roads and the Geuerenstrasse; hand-trace only the
  parts OSM lacks, in `pipeline/anchors.json`.
- Model the underpass below the DSM industrial tracks and the cutting near the K295 (about 8 m climb).
- Include the Freiverlad access road.
- Cross-sections from the issue (report §3.5): sections 1–2 13.0 m with a foot/bike path, sections 3–4 7.0 m.
- Align the underpass with #76's mechanism (the 2 m terrain patch for cuts, rail decks) and state the landing order.
- The world rebuild is a guarded local task; memory-heavy commands run under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.

## Landing order

**#76 lands first, #42 second.** #76 (`docs/superpowers/specs/2026-10-03-rail-bridges-underpasses-design.md`) adds the
pieces #42 needs: the `railBridges` world key, rail decks in `OSM_BRIDGES` (`kind: 'rail'`), `meshH` (the uncut
16 m mesh), the 2 m cut patch (`CUT_CELLS`, `terrainH` reads it) and `cutDepth(x, z)` as the max over all cuts. #42
adds a second kind of cut source (a graded road) and a pipeline step that puts the DSM tracks over the Südspange on
rail decks. It adds no second terrain-cut mechanism. The plan's Task 0 stops when #76 is not on `main`.

## What OSM already has (checked 2026-10-03)

The issue says the road is not in OSM. That is out of date: section 1 is mapped.

| Part | OSM | Today in the game |
|---|---|---|
| Section 1, K295 junction to the DSM tracks | `w1417144102` `highway=construction`, `construction=service`, `check_date=2026-07-11`, (1528, 409) → (1198, 573), 388 m | dropped (`world_roads.keep()` has no `construction`) |
| Section 2, field path west of the tracks | `w222534467` `highway=track` grade2, sub-range (1198, 573) → (954.2, 567.6) | dropped |
| Section 2, north to the DSM road | `w824663095` `highway=track`, (954.2, 567.6) → (953.4, 497.0) | dropped |
| Section 2, DSM road west | `w118856572` `highway=service`, sub-range (953.4, 497) → (514, 498) | drawn, 4 m |
| Section 3, north on the DSM road | `w118856572`, sub-range (514, 498) → (511.1, 394.3) | drawn, 4 m |
| Section 3, west on the field path | `w118856576` `highway=track`, (511.1, 394.3) → (356.0, 408.1); then hand point (353.4, 420.3) | dropped |
| Section 4, Geuerenstrasse | `w52017693` `highway=residential`, (32.8, 402.1) ↔ (353.4, 420.3), ends on the Sisslerstrasse `w52017686` | drawn, 5.5 m |
| Freiverlad access | hand-traced (514, 498) → (514.4, 748.6), then `w1417144101` `highway=proposed`, `proposed=service` → (625.4, 815.8) beside the SBB line | proposed part dropped |
| DSM industrial tracks | five `railway=rail` `service=spur` ways cross section 1 at x 1229.6–1250.0, z ≈ 574 (`w117931764`, `w183354684`, `w117931725`, `w1319949027`, `w117931736`), none tagged `bridge` | drawn as rail ribbons on the terrain |
| Overhead steam pipe | `w1257242541` `man_made=pipeline` overground, (694, 507) → (517, 511) → (514, 749) → (415, 770) | not in the game |

Coordinates are game metres (x east, z south) in the frame of `pipeline/geo.py`.

The steam pipe confirms the trace: the report's "slightly offset around an overhead steam pipe" and "branch of the
access road to the new SBB Freiverlad" both sit on `w1257242541`, and the proposed Freiverlad road starts at the
pipe's corner (514, 749).

## Terrain (from `data/terrain_hochrhein.mmh`, metres above the 284 m base)

- K295 junction (1528, 409): 12.45 m.
- Section 1 climbs the terrace edge: 15.7 m at (1441, 483), 20.8 m at (1309, 576). The ground south-east of the line is
  up to 4 m higher than on it, so the line already runs along a slope.
- DSM tracks at the crossing (1240, 574): 20.6 m. Sisslerfeld plateau west of it: 21.5–22.4 m.
- The 8 m in the report is the K295 (12.5 m) to the plateau (20.6 m).

## Design

### 1. Game-only roads in `anchors.json` (pipeline)

A new top-level `roads` object in `pipeline/anchors.json` lists game-only roads. Each piece is a polyline assembled
from steps: `{"osm": "w<id>"}` (the whole way), `{"osm": "w<id>", "from": [x, z], "to": [x, z]}` (a sub-range, in
that direction) or `{"game": [x, z]}` (a hand point). Any highway way can be reused, kept by `world_roads.keep()` or
not. A whole way is turned around when its far end is nearer the polyline so far.

The new module `pipeline/world_extra_roads.py` turns each piece into ordinary MMW1 road entries by feeding a
synthetic `osm_read.Way` (negative id, tags from the piece plus `name` and `width`) through `world_roads.build()`,
so markings and the solid-on-bends split work as for OSM roads.

| Piece | id | `n` | tags | `w` |
|---|---|---|---|---|
| Sections 1–2 | -42001 | Südspange | `highway=tertiary`, `lanes=2` | 8.0 (7.0 m carriageway + 2 × 0.5 m shoulders) |
| Foot/bike path of 1–2 | -42002 | (none) | written directly: `cls` `cycleway`, `mark` `none` | 3.0, centre 7.5 m north of the road (2.0 m green in between) |
| Section 3 | -42003 | Südspange | `highway=unclassified`, `lanes=2` | 7.0 |
| Section 4 | -42004 | Geuerenstrasse | `highway=unclassified`, `lanes=2` | 7.0 |
| Freiverlad access | -42005 | Zufahrt Freiverlad | `highway=service` | 6.0 |

"North of the road" is the left side of travel westbound (shapely `offset_curve` with a positive distance), on every
leg of the piece.

`replace` lists OSM ways the game road takes over: their road entries lose everything within 1 m of a game road
(`w52017693` whole, `w118856572` only the reused stretch; its leg north to the Rhine stays). `trim` lists ways whose
part inside the grade band (`hw + 24 m` from the graded stretch, see section 2) is removed, because it would drape
into the cutting: `w183354680` (a DSM service road ending at (1216, 570), 3.5 m from section 1).

Junction discs: one at every piece end (`w / 2 + 0.3`), and every existing junction within 1 m of a game road grows
to at least that radius.

The game roads are appended **after** buildings, props and car parks are built, so the "buildings within 30 m of a
main road" rule and the prop/parking clearances are not re-run against them.

### 2. Grades: a road profile cut with #76's patch

A **grade** is a stretch of road laid on its own vertical profile. MMW1 gets a top-level `grades` list:

```json
{ "pts": [[x, z], ...], "hw": 9.5, "ctl": [[0, 0], [346.6, 6.5], [494.2, 0]] }
```

- `pts`: the road centreline over the graded stretch (from the first to the last control).
- `hw`: corridor half-width; 9.5 m covers the 8 m road and the path whose outer edge is 9.0 m off the centreline.
- `ctl`: `[t, cut]` with `t` metres along `pts` and `cut` metres below the **uncut** terrain at that centreline point.
  First and last `cut` are 0, so the grade meets the terrain at both ends.

The Südspange's controls in `anchors.json` (by game point, projected onto the piece): the K295 junction (1528, 409)
cut 0; the track crossing (1240, 574) cut 6.5 (4.5 m clearance plus 2 m for deck and track bed); the plateau
(1092, 573) cut 0. Result: the road climbs from 12.5 m to about 14.1 m under the tracks, then 7.8 m up to the plateau
over about 148 m (5.3 %). Along section 1 the terrain is up to 7 m above the road: that is the cutting.

The pipeline only stores the controls. The prototype turns them into heights from its own uncut mesh (`meshH`,
measured or procedural), so a grade works with either terrain.

**In the prototype** a grade is one more cut source for #76's patch (pure helpers in `prototype/world.js`):

1. Profile: control heights `y_i = meshH(control point) − cut_i`, linear in `t` between them.
2. Cut depth at `(x, z)`, with `n` the nearest point on `pts` (clamped to its ends) and `inner = hw + 1` (#76's
   `UNDERPASS.margin`):
   `depth = max(0, min(meshH(x, z) − profileY(n.t) − max(0, n.d − inner) / 2, (outer − n.d) / 2))`.
   Inside the corridor the ground comes down to the profile. Beyond it a 1:2 bank (#76's `UNDERPASS.bank`) rises back
   to the terrain, and the second term forces the depth to 0 at `outer`, so the patch border meets the coarse mesh.
   `outer = min(inner + 2 × (max centreline cut + 2), hw + 24)`.
   No fill: where the terrain is below the profile the depth is 0 and the road follows the terrain.
3. `cutDepth(x, z)` (#76) becomes the max over the rail-deck cuts **and** the grade cuts. `buildCuts()` (#76) patches
   every 16 m cell within `outer` of the grade line as well. Roads, trees, the ground mesh and the car already read
   `terrainH`, which returns the patch, so the graded road drapes onto its profile at 2 m resolution with no extra
   road-height code.

**The DSM tracks go on rail decks.** OSM does not tag them as bridges (the bridge does not exist yet). The pipeline
moves every part of a `rail` polyline that lies within `hw + 24 m` of a grade line from `rail` to `railBridges` with
`layer` 1. From there #76 does the rest: the deck heights come from the uncut terrain at the deck ends
(`fillBridgeHeights` runs before the cuts), the decks are drawn as stone boxes with the track on top, a car below is
not snapped onto them, and `railRoadCrossings` finds the Südspange (and its path) under them and adds its own
underpass cut, which the grade cut contains (max, not sum). The band `hw + 24 m` is the same constant in the pipeline
(`BAND`) and the prototype (`GRADE_BAND`), so the decks always reach past the cut.

`grades` is generic: any road can be graded by adding an entry.

### 3. Signs (prototype)

New landmark kinds in `anchors.landmarks`, drawn by kind (not by key), no collision, not in the J list (that list
is driven by `LANDMARK_INFO`, `prototype/landmarks.js:51-60`):

- `baustelle`: Swiss danger sign 1.14 "Baustelle" (red-bordered white triangle on a pole, a "Baustelle" plate) and two
  red-and-white striped Leitbaken. At the K295 junction and where section 3 leaves the Geuerenstrasse.
- `fahrverbot`: Swiss sign 2.01 "Allgemeines Fahrverbot" (white disc, red ring) with the plate "ausgenommen Bus, Velo,
  Landwirtschaft, Notfall". At both ends of section 3.

Signs stand 4–12 m from the road centreline, off the road surface, facing the oncoming traffic (`heading_deg` = the
direction the face looks). Sign texts stay German, like station boards and street names.

Section 3 stays drivable for the player: the game has no traffic rules (no access, speed-limit or one-way logic in
`prototype/index.html`), and the acceptance criteria want the whole road drivable. The signs show the rule.

### 4. Not modelled

- The left-turn lane on the K295.
- The offset around the steam pipe (the pipe is not in the game).
- Retaining walls and abutments: the cut slopes are 1:2 grass banks on the 2 m patch.
- Fill embankments (see section 2).

## Acceptance criteria

- The world has the Südspange from the K295 junction (1528, 409) to the Sisslerstrasse (32.8, 402.1) along the
  route above, plus the Freiverlad access to (625.4, 815.8).
- Sections 1–2: an 8.0 m road plus a 3.0 m path 7.5 m north of it (13.0 m between the outer edges). Sections 3–4:
  7.0 m.
- The HUD reads "Südspange" on sections 1–3, "Geuerenstrasse" on section 4 and "Zufahrt Freiverlad" on the access.
- At the track crossing (1240, 574) the ground under the road lies 6.5 ± 0.3 m under the uncut mesh. The DSM tracks
  there are rail decks; every #76 crossing of the Südspange has clearance ≥ 4.45 m and `railGap` < 0.3 m. A car
  driving west from the K295 passes under them and reaches the plateau.
- Along the whole route the ground under the car is the road surface (no steps over 0.6 m per 2 m, no grass over the
  road).
- Two Baustelle and two Fahrverbot signs stand beside the road.
- The OSM Geuerenstrasse and the reused DSM road stretch are not drawn twice.
- A world without `grades` behaves exactly as on `main` after #76.

## Interactions

- **#76:** prerequisite (see Landing order). Its Playwright check that the level crossing near (1228, 564) keeps cut
  depth 0 no longer holds once the world has the Südspange: that spot lies in the cutting and its tracks are on a
  deck. #42 drops that point from #76's `LEVEL` list; (1857.6, 566.8) stays.
- **World rebuild:** needed for `roads`, `junctions`, `grades`, `rail`/`railBridges` and `anchors`. Guarded local task
  (CI has no caches). Until then the code is inert on `main`'s world; the Playwright stand-in injects a Südspange
  stretch at the real crossing.

## Testing

- Pipeline unit tests (`pipeline/tests/test_extra_roads.py`): assembly, sub-ranges, turning, replace/trim, junctions,
  path side, grade controls and their validation, rail decking.
- Golden test on the real extract (`pipeline/tests/test_golden.py`, skipped without the cache): route points, widths,
  names, path side, `grades`, replaced ways gone, DSM tracks on decks.
- Node tests (`prototype/tests/world.test.mjs`): `gradeProfile`, `profileY`, `gradeCut`, `gradeCutAt`, `gradeCells`.
- Playwright (`prototype/tests/test_suedspange.py`): a synthetic Südspange stand-in injected into the served world at
  the real crossing (runs before the rebuild); after the rebuild, the real route: HUD names, ground continuity,
  `grassOverRoad`, the underpass drive, #76 crossings, the signs.
- World rebuild: a guarded local task, like Task 4 of `docs/superpowers/plans/2026-10-02-more-landmarks.md`.
