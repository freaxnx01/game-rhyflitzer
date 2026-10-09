# Pipeline step 2: OSM world

Replaces the prototype's hand-traced roads, river and houses with real ones from OpenStreetMap, in the same frame as the measured terrain.

## What it does

`pipeline/osm.py` has two commands.

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
- `anchors.py` + `anchors.json`: landmarks, start, checkpoints, finish, labels, areas, resolved from OSM ids.

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

**Water.** Rivers, lakes and riverbanks as polygons, cut into chunks along the river. Each chunk gets a level: the median of the measured terrain inside it, ignoring DEM nodata (exactly 0.0). Chunks with no valid sample inherit their polygon's median, narrow polygons use the terrain at a representative point, and all-nodata means 0.0. The Rhine sits about 5.5 m above the base near Sisseln (the Säckingen power plant reservoir), about -1.5 m downstream, with a step of about 7 m at the Säckingen weir. The base height 284 m is **not** the Sisseln water level.

**Anchors.** `anchors.json` resolves OSM ids to positions: Smile-Kreisel, stations, churches, the two bridges, the DSM chimney (about 140 m) and water tower (about 59 m), Plattform Sisslerfeld (position only, no model), start, checkpoints, finish, minimap labels and areas such as the forest and DSM-Firmenich. The checkpoints snap to the nearest road in the prototype.

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
- Heights of buildings (Swiss side) and the DSM landmarks (chimney, water tower): swissSURFACE3D © swisstopo
