# Gemeinde boundaries toggle — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-02 · Issue #48

## Goal

The issue says: show the **Gemeindegrenzen** (municipal boundaries), switchable on and off, e.g. between Sisseln and Eiken.

Success: while driving, the player presses one key and sees where one Gemeinde ends and the next begins. The line shows both in the 3D world and on the minimap. Pressing the key again hides it. With the toggle off, nothing changes, in the picture or in the physics.

## Starting point (verified 2026-10-02 on `main` @ `eec9eef`)

- `pipeline/osm.py build_world` (~L85-133) reads the regional extract with one pyosmium pass (`pipeline/osm_read.py read`, ~L95-150). That pass keeps only ways tagged `highway`/`railway`/`waterway`, plus areas whose keys are in `AREA_KEYS` (`building, natural, man_made, landuse, amenity, water`, `osm_read.py:16`). Boundary relations and their untagged-for-us member ways are dropped today.
- The regional extract `pipeline/cache/osm/hochrhein.osm.pbf` (3.7 MB, local-only, git-ignored) **does** contain the boundary relations. A capped, read-only probe found `boundary=administrative` + `admin_level=8` relations for every Gemeinde in the map. Swiss examples: Sisseln r1684428, Eiken r1684301, Stein, Münchwilen, Mumpf, Kaisten. German examples: Bad Säckingen r2787775, Murg. Clipped to `geo.DEFAULT_BBOX`, they give **28 member ways**, 928 points and about **16.5 KB** of JSON. The Sisseln–Eiken border is way **123001743**, whose clipped part runs from about (344, 233) to (3082, −466) in game metres. Seven of the 28 ways are also the national border in the Rhine (way tag `admin_level=2`, e.g. 83198375 Bad Säckingen | Sisseln).
- `admin_level=9/10` relations are present too: German Ortsteile such as Harpolingen and Rippolingen, and the old "Säckingen" Gemarkung.
- The prototype keeps the whole layout in `layoutFromWorld` (`prototype/world.js` ~L64-68). Draped strips come from `ribbonGeo(src, hw, y, tileLen, onTerrain, hFn)` (`index.html` ~L418). All static meshes merge per role into `MESH` (`index.html` ~L741-742), and `applyStyle` swaps those materials (~L808).
- Toggles: `HUD` state (`index.html:814`) is set in the single `keydown` listener (`index.html:815`). `V` flips `HUD.carHidden` and is not persisted. `M` shows a `toast()` (~L922). `__mm.hud()` (~L856) exposes HUD state to the Playwright tests. The F1 help lists every key (~L102-118).
- Used letter keys: A C D E H J K M N Q R S T V W. **G is free.** Issue #39 (debug mode) has no key assigned yet.
- The minimap is a pre-rendered `mapStatic` canvas (~L939-940). `drawMap` crops and scales it per zoom (~L956).
- Rebuilding `data/world_hochrhein.json` needs the local caches and `--dsm-heights`. Earlier plans (`docs/superpowers/plans/2026-10-02-street-labels.md` Task 8) guard that rebuild and never hand-edit the file.

## Decisions

| Topic | Decision |
|---|---|
| Source | OSM relations `boundary=administrative` + `admin_level=8` with a `name`. Their member **ways** are read as lines, not assembled as areas. |
| Reader | New module `pipeline/world_boundaries.py`, separate from `osm_read` and using two cheap passes over the extract: pass 1 reads relations only (way id → set of Gemeinde names), pass 2 reads nodes and ways with locations and builds a linestring for each collected way id. `osm_read.read` stays unchanged. |
| Shape | One entry per OSM way (a shared border appears once), clipped to the bbox clip box, split into LineStrings, parts shorter than 5 m dropped, coordinates rounded to 0.1 m. |
| World field | `boundaries: [{ id, names: [a, b], pts: [[x, z], ...] }]`. `names` is sorted and holds one name when the other side is outside the data. The field is optional: older files load as `[]`. |
| Key | **G** toggles. Default **off**, not persisted (like `V`). A toast says `Gemeinde boundaries on` / `off`. When there are no lines (hand-traced layout, or a world file without the field) it says `Gemeinde boundaries: no data`. |
| 3D | One merged mesh in its own `THREE.Group` (`BOUNDS`, not in `MESH`, so `applyStyle` leaves it alone). It is a 1.5 m wide strip with `MeshBasicMaterial`, colour `#ff3fb4`, opacity 0.85, `depthWrite: false`, `polygonOffset`. Its height is `max(terrain, drawn road surface, water surface) + 0.25`, so the Rhine border lies on the water and not on the riverbed. |
| Minimap | A second pre-rendered canvas `mapBounds`, same size as `mapStatic`, with the same lines dashed (`setLineDash([6, 4])`), 2 px, same colour. `drawMap` draws it right after `mapStatic` with the same crop while the toggle is on. |
| Test hooks | `__mm.hud().bounds` (bool). `__mm.boundaries()` → `{ on, lines, verts, groupVisible, color }`. `__mm.boundaryY(x, z)` → the strip height function. |
| Docs | `docs/11-pipeline-osm.md` gets the field (MMW1 block) and a **Boundaries** rule paragraph. The F1 help gets a `G` line. `CHANGELOG.md [Unreleased]` gets a player-facing line. |
| World rebuild | Last task, guarded: cache check, golden tests, build with `--dsm-heights`, then a diff guard that allows only the new `boundaries` key. On a machine without caches: skip and say so in the PR. |

## Assumptions (headless — no human was asked)

- **A1** [high] Data is OSM `boundary=administrative`, `admin_level=8`. This level is the Gemeinde in both Switzerland and Baden-Württemberg. The probe on the real extract lists Sisseln and Eiken as level 8, and the cut is OSM-only (`pipeline/osm.py:9-11`). Rejected: swisstopo swissBOUNDARIES3D, which is Swiss only, would add a new source and licence, and would leave the German side empty.
- **A2** [med] Only level 8. German Ortsteile (level 9/10) and Bezirk/Kanton/Land lines (6/4/2) are not drawn as their own lines. The issue says "Gemeindegrenzen". Rejected: adding level 9/10, which would draw Harpolingen inside Bad Säckingen as if it were its own Gemeinde.
- **A3** [high] Member ways become lines, without assembling areas. `osmium extract -s smart` (`pipeline/osm.py:30`) completes multipolygon relations only, so boundary relations reaching past the 2 km padding are incomplete (Laufenburg: 8 member ways, 2 present). Area assembly would fail or drop them, while lines only need the ways that are present. Rejected: polygons, and a new `cut` with `-S types=multipolygon,boundary`, which is a heavy re-cut on odroid-plus-pve.
- **A4** [high] Separate reader module with its own two passes instead of extending `osm_read.read`. In a single pass, pyosmium sees the relations only after the ways, and `osm_read` drops ways without highway/railway/waterway tags (`osm_read.py:117-118`). The extract is 3.7 MB, so the extra passes cost well under a second.
- **A5** [med] **G** is the key ("Grenze"/"Gemeinde"), free in `index.html:815`. Rejected: B. Another in-flight issue could claim G (#39 debug mode has no key in its body yet), so whichever lands second must pick another.
- **A6** [med] Default off and not persisted, like `V` (`index.html:814`). The issue says "ein-/ausschaltbar", which reads as an overlay on demand, not a permanent map layer.
- **A7** [med] Shown in both 3D and the minimap, with one key. Rejected: minimap only, which would not show "where am I standing" while driving across the Sisseln–Eiken border in chase view, and 3D only, which gives no overview.
- **A8** [med] Look: a flat magenta ribbon on the ground, 1.5 m wide, and a dashed magenta line on the minimap. No colour in the game uses magenta (water blue, roads grey, markings white/yellow, checkpoints yellow/green), so it reads as an overlay, not as a road marking. Rejected: vertical fence/wall (occludes the road and needs collision decisions), and the Swiss map dash-dot in black (invisible on asphalt).
- **A9** [high] The national-border pieces in the Rhine are drawn too, because they are also Gemeinde borders. The strip height takes the water surface into account (`waterSurface`/`WATER.levelAt`, the same expression as `groundH`, `index.html` ~L366), so the line lies on the water.
- **A10** [med] No Gemeinde names in 3D and no "current Gemeinde" HUD line. The issue asks only for the boundaries, and `names` in the world file keeps that open for a follow-up. Rejected: names on the minimap, which would compete with the checkpoint numbers at 1×.
- **A11** [high] UI strings are English, like every other HUD string (i18n is #9, open).
- **A12** [high] The world rebuild follows the guarded pattern of the street-labels plan (Task 8): never without `--dsm-heights`, never hand-edited. Memory-heavy commands run under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0` (user rule). No new osmium cut is needed.

## Consequences

- The world file grows by about 16-17 KB (about 0.6 %).
- A world file built before this change has no `boundaries`. G then toasts `Gemeinde boundaries: no data`, as in the hand-traced layout, until the maintainer rebuilds `data/world_hochrhein.json`. A CI implementer has no caches, so the live site shows no lines until that local rebuild.
- Boundaries at the bbox edge end abruptly at the clip box, as roads and water already do.
- OSM boundary lines are cadastral and run through fields, houses and the Rhine. The strip can cross a building footprint and is hidden inside it. That is accepted.
- The strip adds one draw call and about 10k triangles (928 points resampled every 4 m), and only while it is visible.
- A future region extension (#19, #44, #47) picks up more Gemeinden with no extra work.

## Testing

- Pipeline (pytest): a new fixture `pipeline/tests/fixtures/boundaries.osm` with two level-8 relations sharing one way, a level-9 relation, an unnamed level-8 relation and a level-2 relation. Unit tests cover `member_names`, `read` and `build` (dedup, names, clip, min length, rounding). A golden test on the real extract: the Sisseln–Eiken way 123001743 is present with `names == ["Eiken", "Sisseln"]` and passes within 2 m of (3079.8, −274.3), where it crosses the Hauptstrasse. The count is between 20 and 40.
- Node (`world.test.mjs`): `layoutFromWorld` passes `boundaries` and defaults to `[]`.
- Playwright (`prototype/tests/test_boundaries.py`, new) runs against a served world with a synthetic boundary patched in, so it does not depend on the rebuild. G toggles `hud().bounds` and the group visibility. A minimap pixel near the line turns magenta only while on. A line crossing the Rhine sits at or above the water level. The hand layout survives G with `lines: 0`.
- Manual: the Sisseln–Eiken border crosses three named roads on the real data: the Hauptstrasse at about (3080, −274), the Laufenburgerstrasse at about (1527, 408) and the Bahnhofstrasse at about (1867, 396). With G on, a magenta line crosses the road there, and with G off it is gone.
