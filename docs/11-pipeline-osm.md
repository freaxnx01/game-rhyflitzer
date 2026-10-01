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
  "anchors":   { landmarks, cps, labels, areas, start, finish }
}
```

Coordinates are game metres (x east, z south), rounded to 0.1 m. `mark` is one of `none`, `centre`, `centre-solid`, `cycle`, `cycle-left`, `cycle-right`, `motorway`. `waterSdf` holds distances to the nearest water on an 8 m grid, quantised to pixel centres. `anchors.landmarks` are `{x, z, kind, h, rot}`; `start` is `[x, z, heading]`.

## Rules

**Roads.** Drivable OSM highways (motorway down to service roads; footways only when they are bridges; tunnels, driveways and parking aisles skipped), split into pieces where tags change. Width from the `width` tag, else a default per class (motorway 14 m, primary 9 m, residential 5.5 m, service 4 m). Junctions come from shared nodes. Bridges carry `bridge: true` and a `layer`.

**Buildings.** Kept if within **30 m** of a main road (trunk, primary, secondary, tertiary and links), plus every building of **1,000 m²** or more, wherever it stands, so Sisslerfeld does not go empty. Dropped: `roof`, `carport`, `construction`, `ruins`, footprints under 20 m², and the footprints listed in `exclude_buildings` in `anchors.json` (the DSM chimney, the DSM water tower and the Plattform Sisslerfeld; a fourth id there, the Holzbrücke, is a `man_made=bridge` and not a building). Height from `height` (80 % is walls), else `building:levels` × 3 m, else a default per type; the pipeline applies no height floor, the prototype clamps flat buildings to at least 3 m. Gable roof if the footprint is under 250 m² and at least 85 % of its rotated rectangle, otherwise flat. Buildings inside DSM-Firmenich get the industrial palette. Real roofs come in step 3.

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

**Water.** Rivers, lakes and riverbanks as polygons, cut into chunks along the river. Each chunk gets a level: the median of the measured terrain inside it, ignoring DEM nodata (exactly 0.0). Chunks with no valid sample inherit their polygon's median, narrow polygons use the terrain at a representative point, and all-nodata means 0.0. The Rhine sits about 5.5 m above the base near Sisseln (the Säckingen power plant reservoir), about -1.5 m downstream, with a step of about 7 m at the Säckingen weir. The base height 284 m is **not** the Sisseln water level.

**Anchors.** `anchors.json` resolves OSM ids to positions: Smile-Kreisel, stations, churches, the two bridges, the DSM chimney (about 140 m) and water tower (about 59 m), Plattform Sisslerfeld (position only, no model), start, checkpoints, finish, minimap labels and areas such as the forest and DSM-Firmenich. The checkpoints snap to the nearest road in the prototype.

## Load it in the prototype

Automatic: the prototype fetches `data/world_hochrhein.json` at startup. If it is there, the whole layout comes from it (roads, Rhine, bridges, houses, landmarks, race points, minimap, markings) and the start screen shows `World: OpenStreetMap · N roads · N buildings` followed by all `sources` of the file joined with ` · ` (`© OpenStreetMap contributors, ODbL`, plus `Water levels: swissALTI3D © swisstopo` when the file was built with an `.mmh`). If it is missing or not valid, the hand-traced layout is used and the line reads `World: traced by hand`. Terrain comes from an `.mmh` the player loaded on the start screen (kept in IndexedDB) or, if there is none, from the published `data/terrain_hochrhein.mmh` ([08](08-pipeline-terrain.md)).

## Known limits

- The German side is flat at the base height until LGL DGM1 is added to the terrain, so water can sit above flat German banks. Water levels ignore the DEM nodata fill for the same reason.
- A missing world file is one accepted 404 line in the browser console. Since 2026-10-01 `data/world_hochrhein.json` and `data/terrain_hochrhein.mmh` are committed and served on GitHub Pages (licences in `data/README.md`); the world file is offered under the ODbL. Rebuild and commit both after a pipeline change.
- Ortstafeln and street furniture are not from OSM yet. Roofs are flat or gable until step 3.
- Markings use the innerorts rhythm everywhere, are not interrupted at junction mouths, and bridge decks carry none.
- A world file with the right format tag but missing fields is not caught and breaks the page; delete or rebuild the file.

## Attribution (game credits)

- © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)
- Terrain and water levels: swissALTI3D © swisstopo
- Heights of the DSM landmarks (chimney, water tower): swissSURFACE3D © swisstopo
