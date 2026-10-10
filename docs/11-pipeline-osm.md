# Pipeline step 2: OSM world

Replaces the prototype's hand-traced roads, river and houses with real ones from OpenStreetMap, in the same frame as the measured terrain.

## What it does

`pipeline/osm.py` has three commands.

**`cut`** (heavy, one-off) cuts the region plus 2 km padding out of each Geofabrik country extract with `osmium extract -s smart`, then merges the parts with `osmium merge`. It takes every `*.osm.pbf` in `--pbf-dir` (except `*.cut.osm.pbf`), so keep stray files out of that folder. Run it on a node with spare RAM, never on the shared agent box (see the incident in [08](08-pipeline-terrain.md)). The real cut ran in a throwaway LXC on odroid-plus-pve: peak 3.58 GB, 30 s, result 3.7 MB (302,119 nodes, 42,583 ways, 1,308 relations).

**`build`** (light) reads that small `.osm.pbf` and writes one JSON file, `data/world_hochrhein.json` (about 2 MB). Modules in `pipeline/`:

- `geo.py`: the shared frame (LV95 origin, game x = east, z = south), default bbox and origin, padding. `terrain.py` uses it too.
- `mmh.py`: reads `.mmh` heightmaps and samples them (bilinear).
- `osm_read.py`: pyosmium reader into ways, areas, named nodes.
- `world_roads.py`: road pieces, widths, junctions, markings.
- `world_water.py`: water polygons, water levels, the water SDF.
- `world_buildings.py`: building selection, heights, roofs, palettes.
- `world_props.py`: street furniture (lamps, hydrants, benches, bins, bike racks, recycling containers).
- `world_boundaries.py`: Gemeinde boundaries (OSM admin_level 8) as lines.
- `world_parking.py`: car parks (open-air and roadside `amenity=parking`) with painted bay lines.
- `world_forests.py`: woods (`landuse=forest`, `natural=wood`) as merged outlines with the roads and car parks cut out.
- `anchors.py` + `anchors.json`: landmarks, start, checkpoints, finish, labels, areas, resolved from OSM ids.

**`world`** (#166, light except the cut) builds *any* rectangle inside Switzerland into a playable region without a hand-written anchors file — see [Any Swiss rectangle](#any-swiss-rectangle-osmpy-world-166). Its own modules:

- `frame.py` + `ch_outline.geojson`: the frame of a generated world — an LV95 rectangle snapped to 250 m, the size limits, the Switzerland check, the world id. `ch_outline.py` regenerates the outline (one-off).
- `osm_cut.py`: the four-step cut that stays under 2 GB and still keeps whole woods and lakes.
- `places.py`: the generated start point, village signs, J list and the world's name, all from OSM.
- `region.py`: the orchestration — cut → terrain → `osm.build_world` → generated content → `world.json` + `terrain.mmh` + `meta.json`.

## Run it

The cut (once; needs osmium-tool and about 4 GB RAM):

```bash
# in a throwaway LXC / VM with spare RAM, country extracts in ~/geodata/geofabrik
cd pipeline
python osm.py cut --pbf-dir ~/geodata/geofabrik --out cache/osm/hochrhein.osm.pbf
python osm.py cut --pbf-dir ~/geodata/geofabrik --out cache/osm/hochrhein.osm.pbf --dry-run   # print the osmium commands only
```

Copy `hochrhein.osm.pbf` back to `pipeline/cache/osm/`. The extracts need `switzerland-latest` and a German file covering Baden-Württemberg's Hochrhein (for example `freiburg-regbez`). On the day of the first run the Geofabrik `-latest` URLs were in a redirect loop, so already cached extracts (2026-09-28) were copied in by hand.

The build (seconds, on any machine):

```bash
cd pipeline
python osm.py build --pbf cache/osm/hochrhein.osm.pbf \
    --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json
```

Options: `--bbox W S E N`, `--origin LAT LON` (same defaults as `terrain.py`), `--house-dist 30`, `--big-building-area 1000`, `--anchors anchors.json`. Without `--mmh` the water levels fall back to 0.

Tests: `cd pipeline && pytest` runs the pipeline tests only (the golden test needs the cut extract and skips without it). Prototype unit tests: `node --test prototype/tests/*.test.mjs` (on Node 24 the folder alone does not work, use the glob). Browser smoke tests (Playwright, headless Chromium with SwiftShader, slow: allow several minutes): one-time setup `cd pipeline && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`, then `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`. They load the page with and without the world file and put the car into the Rhine and under an overpass; the OSM cases skip without `data/world_hochrhein.json`.

Real build, 2026-10-01: 2,616 road pieces, 2,309 junctions (nodes shared by two or more kept roads), 377 water entries, 1,806 buildings, 142 rail pieces, water SDF 1181 × 550.

## The world file (MMW1)

```
{
  "format": "MMW1",
  "origin": { lat, lon, E, N, crs },  "bbox": [W, S, E, N],  "sources": [...],
  "params": { houseDist, bigBuildingArea, built, pbf },
  "roads":     [{ id, n, cls, w, mark, bridge, layer, pts: [[x, z], ...] }],
  "junctions": [[x, z, r], ...],
  "water":     [{ kind, level, rings: [[[x, z], ...], ...] }],
  "waterSdf":  { x0, z0, step, w, h, data: "<base64 int8>" },
  "buildings": [{ id, h, roof, palette, rect: [cx, cz, w, d, angle], ring: [[x, z], ...] }],
  "rail":      [[[x, z], ...]],
  "railBridges": [{ layer, pts: [[x, z], ...] }],
  "props":     [{ kind, x, z, rot }],
  "parking":   [{ id, name?, ring: [[x, z], ...], holes?, bays, lines: [[ax, az, bx, bz], ...], sign?: [x, z, rot] }],
  "forests":   [{ ring: [[x, z], ...], holes?: [[[x, z], ...]] }],
  "boundaries": [{ id, names: [a, b], pts: [[x, z], ...] }],
  "anchors":   { landmarks, cps, labels, areas, start, finish }
}
```

Coordinates are game metres (x east, z south), rounded to 0.1 m; `props[].rot` is rounded to 0.01 rad. `mark` is one of `none`, `centre`, `centre-solid`, `cycle`, `cycle-left`, `cycle-right`, `motorway`. `waterSdf` holds distances to the nearest water on an 8 m grid, quantised to pixel centres. `anchors.landmarks` are `{x, z, kind, h, rot}`; `start` is `[x, z, heading]`.

## Rules

**Roads.** Drivable OSM highways (motorway down to service roads; footways only when they are bridges; tunnels, driveways and parking aisles skipped), split into pieces where tags change. Width from the `width` tag, else a default per class (motorway 14 m, primary 9 m, residential 5.5 m, service 4 m). Junctions come from shared nodes. Bridges carry `bridge: true` and a `layer`. Railway bridges (`railway=rail` with a `bridge` tag) leave `rail` and go to `railBridges` with their `layer` (1 when untagged); pieces that share an endpoint are merged per layer. The prototype lifts them onto rail decks and cuts the road underneath (#76).

**Buildings.** Kept if within **30 m** of a main road (trunk, primary, secondary, tertiary and links), plus every building of **1,000 m²** or more, wherever it stands, so Sisslerfeld does not go empty. Dropped: `roof`, `carport`, `construction`, `ruins`, footprints under 20 m², and the footprints listed in `exclude_buildings` in `anchors.json` (the DSM chimney, the DSM water tower and the Plattform Sisslerfeld; a fourth id there, the Holzbrücke, is a `man_made=bridge` and not a building). Height from `height` (80 % is walls), else `building:levels` × 3 m, else a default per type; the pipeline applies no height floor, the prototype clamps flat buildings to at least 3 m. Gable roof if the footprint is under 250 m² and at least 85 % of its rotated rectangle, otherwise flat; for measured buildings the ridge overrides this (see Building heights). Buildings inside DSM-Firmenich get the industrial palette. Real roofs come in step 3.

**Markings** (per way, from OSM tags; checked against the Sisseln Hauptstrasse photo and video):

| OSM tags | `mark` | Drawn |
|---|---|---|
| cycle lanes both sides, `lane_markings=no` | `cycle` | yellow broken line 1.3 m inside each edge, no centre line |
| cycle lane on one side | `cycle-left` / `cycle-right` | yellow broken line on that side, white centre line |
| none of the above, and the way is a main class (trunk, primary, secondary, tertiary and their links; any `lanes` value) or has `lanes` ≥ 2; not `lane_markings=no` | `centre` | white broken centre line |
| passes the `centre` test and `overtaking=no` | `centre-solid` | white solid centre line for the whole way |
| passes the `centre` test without `overtaking=no`, on a bend tighter than 150 m radius | `centre-solid` for that stretch | the way is split there; stretches shorter than 20 m join their neighbour |
| `motorway`, `motorway_link`, `trunk` | `motorway` | white lane dashes, solid edges (checked first, before all other tags) |
| everything else (residential, service, pedestrian, footways, or `lane_markings=no` without cycle lanes) | `none` | nothing |

The cycle-lane tests run before the centre test, so a main road with cycle lanes gets `cycle*`, not `centre`. Dash length and gap are 3 m / 3 m (innerorts), centre line 15 cm, from cantonal guidelines (Luzern vif 653.201, Zürich TBA) that quote VSS SN 640 850. The norm itself was not accessed. The 1.3 m inset and the solid-line width are not from the norm. The pipeline has no inside/outside-town flag, so outside villages the dashes are denser than the 3/6 m rule.

**Props (street furniture).** Point-like OSM objects next to the roads, classified by `world_props.classify` into exactly seven kinds. Nodes carrying the tag, plus areas for `amenity=bicycle_parking` and `amenity=recycling` (taken at their centroid):

| `kind` | OSM selection | In bbox | ≤ 15 m from a road |
|---|---|---|---|
| `lamp` | `highway=street_lamp` | 2,252 | 1,928 |
| `hydrant` | `emergency=fire_hydrant`, **except** `fire_hydrant:type=underground` or `pipe` | 838 (all types) | 769 (all types; about 40 % survive the exclusion) |
| `bench` | `amenity=bench` | 624 | 270 |
| `bin` | `amenity=waste_basket` | 327 | 176 |
| `bike_rack` | `amenity=bicycle_parking` | 41 | 21 |
| `glass_container` | `amenity=recycling` with `recycling:glass_bottles=yes` or `recycling:glass=yes` | 13 | 11 |
| `clothes_container` | the same with `recycling:clothes=yes` (glass wins when both are tagged) | 4 | 3 |

Counts measured on the 2026-10-01 extract while the design was written; the build logs the real ones per run. Underground hydrants (725 of 1,226) are a lid in the ground, not something to drive into, so they are not props — they also explain most of the hydrants that OSM puts on the road surface.

**Reach.** Kept only when the distance to the nearest kept, non-bridge road **edge** (centre line minus `w/2`) is at most **15 m**, so props stay where a car can reach them.

**Edge rule.** A prop inside a road band (closer to the centre line than `w/2 + 0.6` m) is moved perpendicular to exactly `w/2 + 0.6` m, on the side it was already on; a prop sitting exactly on the centre line goes to the right-hand side of the road's direction. It is then re-checked against *every* nearby band: still inside one (junctions, narrow gaps) means it is dropped rather than left in a lane. A prop inside the band of a **bridge** is dropped outright, so no invisible post ends up on a deck. `bench` and `bike_rack` are turned parallel to the nearest road (`rot = atan2(dz, dx)`), every other kind keeps `rot = 0`.

**Collision.** The prototype draws one `InstancedMesh` per kind. `lamp` (0.3 × 0.3 m) and `hydrant` (0.4 × 0.4 m) get a small OBB and stop the car; benches, bins, bike racks and both containers are decoration until the fun-physics follow-up gives them hit behaviour.

**Car parks.** `amenity=parking` areas with `parking=surface`, `street_side` or no `parking` tag become `parking` entries (`lane`, `underground` and `multi-storey` are skipped). Bays, first match wins: mapped `amenity=parking_space` areas inside the lot; else rows of 2.5 × 5 m bays on both sides of every `service=parking_aisle` through the lot; else a rule on the lot's minimum rotated rectangle (narrower than 3.5 m: parallel bays 6 m long; under 7 m: one row across the strip; under 16 m: one row away from the road; wider: two rows). Bays overlapping a house, a road band, an aisle or each other by more than 0.5 m² are dropped (touching a wall is fine); a numeric `capacity` keeps the bays nearest the lot's centre. Each lot exports its outline, the bay count and deduplicated bay edges without the open fronts; named lots get a sign position by the nearest road. Design: `docs/superpowers/specs/2026-10-02-car-parks-design.md`.

**Forests (#13).** `landuse=forest` and `natural=wood` areas are repaired, clipped and merged into one set of outlines. Every exported road — bridges and footways included — cuts a corridor of `w/2 + 5 m` through them, car parks are cut out with 3 m, parts and holes under 500 m² are dropped, and the rings are simplified by 1 m and rounded to 0.1 m. Names and `leaf_type` are not kept (2 of 595 areas are named). The prototype places the trees itself from the outlines (edge row every 6 m, fill 1/600 m², cap 70,000, seeded) and puts invisible 1.6 m walls along every edge, so the car cannot enter a wood but drives every road through one. Real extract: about 160 parts, 15.7 km², 248 km of edge, ≈ 115 KB. Design: `docs/superpowers/specs/2026-10-03-forests-design.md`.

**Water.** Rivers, lakes and riverbanks as polygons, cut into chunks along the river. Each chunk gets a level: the median of the measured terrain inside it, ignoring DEM nodata (exactly 0.0). Chunks with no valid sample inherit their polygon's median, narrow polygons use the terrain at a representative point, and all-nodata means 0.0. The Rhine sits about 5.5 m above the base near Sisseln (the Säckingen power plant reservoir), about -1.5 m downstream, with a step of about 7 m at the Säckingen weir. The base height 284 m is **not** the Sisseln water level.

**Anchors.** `anchors.json` resolves OSM ids to positions: Smile-Kreisel, stations, churches, the two bridges, the DSM chimney (about 140 m) and water tower (about 59 m), Plattform Sisslerfeld (position only, no model), start, checkpoints, finish, minimap labels and areas such as DSM-Firmenich and the Winkelacker quarter. The woods are not an anchor: they come from OSM (see **Forests**). The checkpoints snap to the nearest road in the prototype.

## Second region: Ehrendingen (#127)

A second, separate region (not adjacent to the Hochrhein): Ehrendingen AG, with the Wanderweg and Im
Böndlern. It uses the same two commands with its own constants (`geo.EHRENDINGEN_BBOX`,
`geo.EHRENDINGEN_ORIGIN`, `geo.EHRENDINGEN_BASE = 405`) and its own anchors file
`anchors_ehrendingen.json`. Hochrhein is untouched: no shared file changes.

The cut runs on **odroid-plus-pve**, never on the agent box or a CI runner — `osmium extract -s smart`
peaks at about 3.58 GB because the ID bitmaps span the whole planet ID range, and that peak does not
depend on the bbox size. Print the commands first (cheap, anywhere), using a directory that holds
**only** `switzerland-latest.osm.pbf` (symlink it), so the German file is not cut too:

```bash
cd pipeline
./.venv/bin/python osm.py cut --pbf-dir <dir with only switzerland-latest.osm.pbf> \
    --out cache/osm/ehrendingen.osm.pbf --bbox 8.322 47.476 8.366 47.515 --dry-run
```

Run the printed `osmium extract` and `osmium merge` in a throwaway LXC on odroid-plus-pve and copy the
result (~1–3 MB) back into `pipeline/cache/osm/`. Terrain and world then build on the agent box under the
2 GB cap:

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python terrain.py \
    --bbox 8.322 47.476 8.366 47.515 --origin 47.4948 8.3419 --step 4 --base 405 \
    --out ../data/terrain_ehrendingen.mmh
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build \
    --pbf cache/osm/ehrendingen.osm.pbf --mmh ../data/terrain_ehrendingen.mmh \
    --bbox 8.322 47.476 8.366 47.515 --origin 47.4948 8.3419 \
    --anchors anchors_ehrendingen.json --out ../data/world_ehrendingen.json --dsm-heights cache
```

Expect `w 844`, `h 1095` in the `.mmh` header, `min` between −15 and +5 and `max` around +440 (Lägern).
The build log must show `trails` > 0 and no `anchors: … not found`; both files stay under 4 MB. Exit 137
means the 2 GB cap was hit — move that step to the odroid LXC, never raise the cap.

**Trails (`trails`).** The anchors file's `trails` key lists OSM **way ids** that are kept as drivable 3 m
gravel roads although `world_roads.keep()` drops them (`highway=track`, `path`, …). Each listed way gets
`"trail": true`, width 3.0 and no markings; tunnels are still dropped, and a listed way that `keep()`
already accepts stays an ordinary road. The prototype draws them with the gravel texture and light on the
minimap. Ehrendingen lists the eight `highway=track` ways of the Wanderweg (Hofrain, then Steinbuckweg:
`w28183399`, `w685318985`, `w685318986`, `w28183458`, `w702208313`, `w347967817`, `w702208308`,
`w702208309`); the two residential Hofrain ways are ordinary roads already. Hochrhein has no `trails` key,
so its world file is byte-for-byte unaffected.

**The region in the game.** `prototype/regions.js` holds the table (data URLs, the IndexedDB and best-time
keys, villages, Gemeinden, landmarks, tree box and forest line per region). `?region=ehrendingen` or the
Region row on the start screen picks one; a region whose world file is missing falls back to Hochrhein with
a toast. Golden test: `pipeline/tests/test_golden_ehrendingen.py` (skips without the extract); browser test:
`prototype/tests/test_region.py` (the data case skips without `data/world_ehrendingen.json`).

## Any Swiss rectangle: `osm.py world` (#166)

`osm.py build` needs a hand-written anchors file per region, so a new region is a day of work. `osm.py world`
builds **any** rectangle inside Switzerland into a playable region with no hand-written JS and no anchors
file — start point, village signs, J list, forests and the region's name all come out of OSM. This is the
pipeline library behind the region editor (phases 2–5); it is usable on its own from the command line.

```bash
cd pipeline
# the frame as an LV95 rectangle, cut out of the Swiss country extract
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  ./.venv/bin/python osm.py world --lv95 2666500 1257750 2670000 1261750 \
  --extract cache/osm/switzerland-latest.osm.pbf --out /tmp/world-166 --no-dsm
# or a lon/lat box, and an already cut regional extract
./.venv/bin/python osm.py world --bbox 8.3283 47.4850 8.3550 47.5030 \
  --pbf cache/osm/ehrendingen.osm.pbf --out /tmp/world-ehr
```

It prints the three written paths and exits **2** on a refused frame (the reason is on stderr:
`frame refused (outside-ch): …`). `--extract` cuts the frame out of a country extract itself; `--pbf` takes
an extract that is already cut and must cover the frame plus 1 km. `--no-dsm` skips the swissSURFACE3D
building heights (~850 MB of tiles per 15 km²); with them, tiles over 2 GB in `CACHE/swisssurface3d` are
pruned oldest-first after every build.

**Measured** (2026-10-10, GitHub Actions `ubuntu-latest`, under a hard `MemoryMax=2G`, `--no-dsm`):
3.5 × 4 km at Ehrendingen from the 523 MB Swiss extract — exit 0, **53 s**, peak RSS **1.92 GB**,
`world.json` 531 kB, `terrain.mmh` 3.6 MB; 471 roads, 217 buildings, **44 of 44 woods** (5.03 km², the
`-s smart` reference is 5.1 km²), 15 J places, 1 village, name `Ehrendingen`, base 387 m. The largest frame,
4 × 4 km, runs in 35 s at peak RSS 1.93 GB (the swissALTI3D tiles were already cached by then). Exit 137 or
a SIGTERM means the cap was hit — report it, never raise the cap.

**The frame (`frame.py`).** An LV95 rectangle `(e0, n0, e1, n1)`. Each edge is rounded to the nearest
**250 m** line, and after snapping every side must be **1–4 km** (`too-small` / `too-big`); a non-rectangle
is `bad-bbox`. The frame must lie **entirely inside Switzerland** or it is refused with `outside-ch` —
checked against `ch_outline.geojson`, the swissBOUNDARIES3D land area simplified to 50 m (~90 kB, committed;
`ch_outline.py` fetches it again from the geo.admin.ch REST API, only needed when the border data changes).
That rejects Büsingen and the other German enclaves, Liechtenstein, and any frame reaching across the Rhine.
`world_id(rect, version)` is the first 12 hex of a SHA-256 over the snapped edges and the pipeline version:
the same frame always yields the same id, and bumping `region.PIPELINE_VERSION` yields a new one.

**The cut (`osm_cut.py`).** Cutting one frame out of the 523 MB Swiss extract must stay under 2 GB, and
`osmium extract -s smart` (the `cut` command above) does not — its ID bitmaps span the planet ID range.
Plain `-s simple` fits in ~1.9 GB but loses every wood or lake whose outline leaves the cut: at Ehrendingen
it kept 1.1 of 5.1 km² of forest, dropping the Lägern wood (relation 4019). So the cut is four steps:

1. `osmium extract -s simple` — the frame plus 1 km.
2. `osmium tags-filter -R` — every `landuse=forest` / `natural=wood,water` / `water=*` **relation**, members
   excluded (~50 MB).
3. `osmium getid -r` — those relations that have a member way in the cut, plus the cut's own closed area ways
   that lost nodes at the cut edge, this time complete (~0.9 GB).
4. `osmium merge` of 1 and 3.

**Generated places (`places.py`).** The **start** is the point nearest the frame centre on a
`primary`/`secondary`/`tertiary` road, heading along that road; a frame with no such road gets no start.
**Village signs** come from `place=city/town/village/hamlet` nodes only, with the prototype's radii
(700/550/450/300 m) — `place=neighbourhood` and `suburb` get none, so Unterehrendingen has no sign. The
**J list** is at most 15 entries: every village/town centre first (west to east), then by kind in the order
station, town hall, church, school, attraction, viewpoint, stadium, square, each kind by name. The same place
is listed once: a church node and its own building (same name, under 150 m apart) collapse to one entry, the
node winning. The **name** is the Gemeinde at the frame centre, found by casting 8 rays against the
`admin_level=8` boundary **lines** and taking the one name all first hits share (a relation in a cut is
incomplete, so there are no polygons to test against). A second Gemeinde holding 3 of 9 sample points makes
the name `A · B`; with no boundary lines at all, `region.fallback_name` takes the nearest village centre,
and failing that the frame's LV95 kilometres (`Region 2667/1259`).

**The three files (`region.py`).** `region.build_world(rect, out_dir, extract=… | pbf=…)` runs
cut → terrain → `osm.build_world` (no anchors file, clipped to the frame) → generated content, and writes:

- `world.json` — the ordinary MMW1 world file plus generated `anchors`
  (`landmarks: {}`, `cps: []`, `areas: {}`, `labels` = the village signs, `start` when there is one),
  `forests`, and a new `region` block: `{id, name, gemeinden, villages, jlist, treeBox, forestAbove, race}`.
  Each J entry is `{n, kind, x, z, g}` (`g` = its Gemeinde).
- `terrain.mmh` — step 4 m, `base` = the **lowest point of the frame** rounded down to a whole metre, so the
  valley floor sits near 0 (no hand-picked river level per region).
- `meta.json` — `{format: "MMR1", id, pipelineVersion, name, bbox: {lv95, lonlat}, origin, base, built,
  extract: {file, modified}, race, counts, sources, license, lastPlayed}`. `license` is the full ODbL notice;
  the world is an OSM derivative database.

**Limits.** No race yet: `anchors.cps` is empty and `region.race` is `null`, so a generated world is a
free-driving world with a start — the automatic race (5 checkpoints, finish, par time) is a follow-up. The
game does not read the `region` block until phase 2, and `prototype/regions.js` is untouched. `--extract`
needs osmium-tool, so the cut test and a real build skip where it is missing. Complexity limits and a build
queue arrive with the API service in phase 3. Tests cover the whole library without the Swiss extract or any
network access (`tests/test_frame.py`, `test_osm_cut.py`, `test_places.py`, `test_region.py`,
`test_world_cli.py`, on a synthetic extract from `tests/synth_osm.py`).

## Load it in the prototype

Automatic: the prototype fetches `data/world_hochrhein.json` at startup. If it is there, the whole layout comes from it (roads, Rhine, bridges, houses, landmarks, race points, minimap, markings) and the start screen shows `World: OpenStreetMap · N roads · N buildings` followed by all `sources` of the file joined with ` · ` (`© OpenStreetMap contributors, ODbL`, plus `Water levels: swissALTI3D © swisstopo` when the file was built with an `.mmh`). If it is missing or not valid, the hand-traced layout is used and the line reads `World: traced by hand`. Terrain comes from an `.mmh` the player loaded on the start screen (kept in IndexedDB) or, if there is none, from the published `data/terrain_hochrhein.mmh` ([08](08-pipeline-terrain.md)).

**Building heights (#17).** `osm.py build --dsm-heights [CACHE]` downloads swissSURFACE3D (0.5 m, about 40 tiles, ~500 MB into `CACHE/swisssurface3d`) and measures every footprint against swissALTI3D: eaves `h` = 10th percentile of the roof (a pitched roof's slope continued out to the wall line), ridge `rh` = 95th percentile minus eaves, both over the ground at the centre; marked `hsrc: "dsm"`. A footprint whose 95th percentile is under 2 m above ground (`NOT_BUILT`) was not built yet when the surface was flown (2020): it is counted as `not_built` and keeps its OSM-tag or default height. The roof shape follows the measured ridge (#43): `rh` ≥ 1.5 m on a footprint that fills at least 85 % of its rotated rectangle and is under 1,000 m² sets `roof: "gable"`, `rh` < 0.6 m sets `"flat"`, and between the two the footprint heuristic stands (a shallow roof and a parapet measure alike). The eaves are not touched by this. In the real extract about 170 footprints become gable (the 36 × 13 m Bodenackerstrasse rows 10, 12, 14, 18, 19, 20, 21 among them) and about 132 flat. The prototype draws measured buildings at that eaves height with a gable of `rh` (flat when `rh` < 0.6 m) instead of whole floors and a fixed 0.4 × width ridge. Real extract: 1,686 of 1,885 buildings measured, median eaves 5.1 m; 42 are `not_built`, and the rest (German side, outside the tiles) keep the OSM-tag or default height.

**House numbers (#12).** `osm_read` keeps every node with `addr:housenumber` as `AddrNode(id, number, x, z)` — the number only, no name or street. A building gets an optional `addr`: its own `addr:housenumber`, else the numbers of the address nodes inside its footprint or on its outline (≤ 0.2 m; a node touching two footprints goes to the nearest centroid); several numbers become `first–last` (`6a–6d`). An OSM-referenced landmark gets `addr` the same way from its own tag (the Hallenbad: `2`). No `street` field is exported. Real extract: 1,321 of 1,885 buildings numbered (1,050 own tag, 271 from address nodes; +16 KB).

**Gemeinde boundaries (#48).** `world_boundaries.py` reads the relations `boundary=administrative` + `admin_level=8` that have a `name`, which covers Swiss and German Gemeinden alike (Ortsteile at level 9/10 are left out). It exports their member **ways** as lines, so a border shared by two Gemeinden appears once with both `names` (sorted; one name when the other side is outside the data). Lines, not areas: `osmium extract -s smart` completes only multipolygon relations, so Gemeinden reaching past the padded cut are incomplete. The lines are clipped to the map, parts under 5 m are dropped, and coordinates are rounded to 0.1 m. The national border in the Rhine is included, because it is a Gemeinde border too. Real extract: about 28 lines, roughly 16.5 KB; Sisseln | Eiken is way 123001743 (both pinned in `tests/test_golden.py::test_gemeinde_boundaries`). The prototype draws them only while **G** is on.

## Known limits

- The German side is flat at the base height until LGL DGM1 is added to the terrain, so water can sit above flat German banks. Water levels ignore the DEM nodata fill for the same reason.
- A missing world file is one accepted 404 line in the browser console. Since 2026-10-01 `data/world_hochrhein.json` and `data/terrain_hochrhein.mmh` are committed and served on GitHub Pages (licences in `data/README.md`); the world file is offered under the ODbL. Rebuild and commit both after a pipeline change.
- Ortstafeln are not from OSM yet. Roofs are flat or gable until step 3.
- Props come from OSM positions, which are often a few metres off; the edge rule keeps them out of the lanes, but some end up in a driveway or on a sidewalk. Street furniture that OSM does not map (paper-collection bundles, straw bales) is not there.
- Markings use the innerorts rhythm everywhere, are not interrupted at junction mouths, and bridge decks carry none.
- A world file with the right format tag but missing fields is not caught and breaks the page; delete or rebuild the file.

## Attribution (game credits)

- © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)
- Terrain and water levels: swissALTI3D © swisstopo
- Switzerland outline: swissBOUNDARIES3D © swisstopo
- Heights of buildings (Swiss side) and the DSM landmarks (chimney, water tower): swissSURFACE3D © swisstopo
