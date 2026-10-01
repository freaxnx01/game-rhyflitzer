# Pipeline step 2: OSM world — design

Status: approved · 2026-09-30

## Goal

Replace the prototype's hand-traced layout (roads, river, bridges, houses) with one generated from OpenStreetMap, georeferenced exactly like the measured terrain (`.mmh`). A first version, not complete: house rows along the main roads, the rest of the village core may stay sparse.

Success looks like:

- `pipeline/osm.py` turns a Geofabrik extract into `data/world_hochrhein.json`, using osmium locally, never the public Overpass API.
- The prototype loads that file at startup when it exists and falls back to the hand-traced layout when it doesn't.
- With world + measured terrain loaded, the Sisseln Hauptstrasse follows its real line: diagonal ~7 % climb from the Sissle bridge (x≈1440) onto the terrace (x≈1720), straight east, gentle bend south-east at x≈2950 (measured 2026-09-29, see `TODO.md`).
- It drives at the prototype's current frame rate.

## Decisions (from the brainstorming, 2026-09-29/30)

| Topic | Decision |
|---|---|
| Loading | **B**: pipeline writes `data/world_hochrhein.json`; prototype `fetch`es it at startup; no file → hand-traced fallback. `data/` stays gitignored. |
| Buildings | OSM footprints extruded; height from `height`, else `building:levels` × 3 m, else a default per building type. Small, near-rectangular footprints get a gable roof (as today), large or irregular ones a flat roof. Real roofs come in step 3. |
| Which buildings | Those within **30 m** of a main road (`trunk`, `primary`, `secondary`, `tertiary` and their links; not `motorway`): ~1,770 of ~12,000 in the region. Parameter `--house-dist`. **Plus every building of 1,000 m² or more, wherever it stands** (259, 216 of them away from main roads: the Sisslerfeld plants, halls, schools), so Sisslerfeld doesn't go empty. Parameter `--big-building-area`, 0 turns it off. |
| Roads | Main network incl. `residential`, `unclassified`, `living_street`; `service` except `driveway`, `parking_aisle`, `drive-through`; `pedestrian` (old town, the Holzbrücke); footways/paths/cycleways/steps only where they are bridges (`bridge` ≠ `no`). No `track`, no tunnels. |
| Hand-made houses | The random `housesAlong` houses and the generic hand boxes (row houses, flat buildings, Sisslerfeld halls) disappear when the world is loaded. |
| Landmarks | Stay, moved to real positions: Smile-Kreisel, Hallenbad Sissila, Fridolinsmünster, Stein church, Holzbrücke, Fridolinsbrücke, both stations. **New:** the tall DSM-Firmenich chimney (red/white top) and the DSM-Firmenich water tower, see below. |
| Physics | Stays the prototype's own arcade physics (no Rapier yet), but gets a spatial index. |
| Road markings | Swiss style from OSM tags per way (cycle lanes, centre line), checked against the user's photo and video of the Sisseln Hauptstrasse, see *Road markings*. |
| Industrial palette | Buildings inside the DSM-Firmenich area get white/grey facades with blue bands, see *Industrial palette*. |

### New landmarks: DSM-Firmenich chimney and water tower

Both stand inside the OSM area "DSM-Firmenich" (`w1378060195`), Sisslerfeld. Neither has a height tag in OSM; heights were measured on 2026-09-30 from swisstopo swissSURFACE3D Raster (2020 flight, 0.5 m) minus swissALTI3D:

| Landmark | OSM | Game position (x, z) | Footprint | Height |
|---|---|---|---|---|
| Chimney, red/white top | `w806132044` | ≈ 1065, 345 | Ø ≈ 9 m at the base | ≈ 140 m |
| Water tower | `w194161080` | ≈ 1126, −94 | Ø ≈ 17 m | ≈ 59 m |

A second, smaller chimney point `n7538446003` (≈ 40 m, 30 m south of the tall one) is not a landmark; it becomes a plain generic chimney if the build keeps small towers, otherwise it is skipped.

Models: hand-built in the prototype like the other landmarks, shapes taken from reference photos (an aerial view of the site, source unknown, used only to look; and the user's own photo from the Sisslerfeld field road, 2026-09-30):

- **Chimney:** slender, light grey concrete tube, barely tapered. The upper ~40 % carries alternating red and white bands, about six of each, starting red at the top; the very top is darkened. Small red aviation light on top.
- **Water tower:** grey concrete shaft; on top a short, slightly wider cylindrical tank with a flat roof (goblet silhouette). Tank ≈ 1/5 of the total height. Both are visible from far away, so they are the first landmarks to check against fog distance. Heights and positions go into `anchors.json`; their OSM footprints are excluded from the generic buildings.

Height source attribution: swissSURFACE3D Raster © swisstopo.

### Plattform Sisslerfeld (anchor now, model later)

The wooden viewing tower is already a planned hero asset (docs/01, docs/07). OSM has it as "Plattform Sissler Feld" (`w1559348004`, `height=11`, footprint at ≈ 7.97102 E / 47.54675 N; the OSM footprint is a rough triangle, so the anchor uses its centre, not its outline). Step 2 only puts its anchor into `anchors.json` and keeps its spot free of generic buildings. Its model is a separate task. Reference: the user's own photos (2026-09-30): square plan, four glulam corner posts with X-bracing on every side, a central core of vertical slats (stair), a cantilevered square platform with a closed parapet of vertical boards, a pyramid roof in grey-green sheet metal with a deep overhang. The banner on the core carries a sponsor logo (naturenergie): **not modelled**, per docs/07.

### Road markings

Replaces the one-size texture (white centre dashes and white edge lines on every road). Driven by **OSM tags per way**, not by road class alone, because the same road changes: the Sisseln Hauptstrasse has yellow cycle lanes and no centre line in the village (`cycleway=lane` + `lane_markings=no`), but a solid white centre line and no cycle lanes in the two bends of the climb (`lanes=2`, `cycleway:both=no`, ways `w1239353959`, `w122368066`). Both confirmed by the user's photo and video of 2026-09-29 (`design/reference/`).

| OSM tags on the way | Markings |
|---|---|
| `cycleway`/`cycleway:both` = `lane` and `lane_markings=no` | No centre line; yellow broken line ~1.3 m inside each edge |
| cycle lane on one side only (`cycleway:left|right=lane`) | Yellow broken line on that side; white centre line |
| no cycle lanes; main class (trunk, primary, secondary, tertiary and links) with any `lanes`, or any class with `lanes` ≥ 2; not `lane_markings=no` | White centre line: broken; solid for the whole way with `overtaking=no`, and solid on stretches where the way bends tighter than a radius of 150 m |
| motorway, motorway_link, trunk | As today (white lane dashes, solid edges) |
| residential, service, living street, unclassified without `lanes` | None |
| pedestrian, footway bridges | None |

Implementation note: instead of a `mark` plus `solid` ranges, the pipeline splits a road piece where the centre line changes between broken and solid and marks the solid piece `centre-solid`.

The pipeline writes the result per road as `mark` (`none`, `cycle`, `cycle-left`, `cycle-right`, `centre`, `centre-solid`, `motorway`); see the implementation note above for `centre-solid`. Dash lengths and gaps follow Swiss standards (VSS); the plan looks them up rather than guessing. The rectified photo shows the cycle-lane dashes roughly 2.5 m long with similar gaps (±20 %, scale from an assumed 7 m road width).

### Industrial palette

Buildings whose centroid lies inside the OSM area "DSM-Firmenich" (`w1378060195`) use their own palette instead of the village plaster colours: white and light grey walls, a blue horizontal band (at the ground floor or under the roof edge), dark window strips, flat roofs. Taken from the aerial photo and the user's field-road photo. Cheap: one more palette and a band drawn into the wall texture. Other industrial areas keep the generic hall look.

## Pipeline

### Cut (one-off per region, heavy)

`osm.py cut` runs `osmium extract -s smart` on the country extracts (Geofabrik `switzerland`, `freiburg-regbez`) with the bbox padded by 2 km, then `osmium merge` into `cache/osm/<region>.osm.pbf` (~2–3 MB).

- `smart` is needed so water multipolygons (the Rhine is relation 1706150) come out complete; `simple` cuts their rings at the bbox edge.
- osmium needs **≥ 1.8 GB** here regardless of bbox size: its ID bitmaps span the whole planet ID range. Measured on the 12 GB agent box: `simple` 1.7–1.8 GB; `tags-filter` hit a 2 GB cap. So **the cut runs on `odroid-plus-pve`** (or any machine with a few GB free), not on the agent box. The result is small and gets copied back.
- `cut` prints a warning when less than 3 GB of memory is available; the pipeline doc says where to run it.
- `odroid-plus-pve` is reachable over SSH (62 GB RAM, ~41 GB free on 2026-09-30) but has no osmium yet. Where osmium runs there (host package vs. a container) is decided in the plan, with the user.

### Build (light, runs anywhere)

`osm.py build` reads only the regional `.pbf` (pyosmium) and writes the world file. It stays well under 1 GB.

1. **Frame**: same as `terrain.py` — LV95 (EPSG:2056), origin 47.5506 N / 7.9671 E, game x = E − E0, z = −(N − N0). The shared code moves into `pipeline/geo.py` so terrain and world can't drift apart.
2. **Roads**: filter per the table above; clip to the bbox (shapely); simplify (Douglas–Peucker, 0.5 m); width from `width`, else by class (motorway 14, trunk/primary 9, secondary 8, tertiary 7, unclassified/residential 5.5, living_street 5, pedestrian 5, service 4, footway bridge 3 m). Bridge flag and `layer`. Name kept.
3. **Junctions**: OSM nodes shared by two or more kept roads → junction points with the widest meeting road's width. Replaces the prototype's O(n²) segment intersection search.
4. **Water**: `natural=water` areas (incl. `water=river`) as polygons clipped to the bbox, holes kept. Where no polygon exists, `waterway=river|stream|canal` centre lines buffered by `width` (default river 20 m, stream 3 m). Water level per polygon = median of the measured terrain inside it, if a `.mmh` is given; else 0.
5. **Water distance field**: signed distance to water (m, negative inside), 8 m grid over the bbox, clamped to ±120 m, stored as int8 (1 m units) base64. Makes the prototype's `riverDist` O(1) instead of a scan over river points. Needs `scipy` (`distance_transform_edt`).
6. **Buildings**: filter by distance to main roads (and the big-building rule); drop `building=roof|carport|construction|ruins` and footprints under 20 m²; drop footprints overlapping a landmark (listed OSM ids in `anchors.json`). Per building: outer ring (holes dropped), wall height, roof `gable`/`flat`, and for gables the minimum rotated rectangle (centre, w, d, angle). Gable if area < 250 m² and area / rectangle area > 0.85. Height default by type: `house`, `detached`, `semidetached_house`, `residential`, `yes` 2 floors; `apartments` 4; `farm`, `barn` 1.5; `commercial`, `retail`, `office` 3; `industrial`, `warehouse` 9 m flat; `church`, `chapel` 12 m.
7. **Railways**: `railway=rail` lines (today hard-coded twice in the prototype).
8. **Anchors**: `pipeline/anchors.json` (hand-maintained, committed) names every hand-made thing with an OSM id or lat/lon: landmarks (incl. DSM chimney, water tower, Plattform Sisslerfeld), checkpoints, finish, start + heading, Ortstafeln, minimap labels, and the DSM-Firmenich area for the industrial palette. The pipeline converts them to game coordinates.

### Output: `data/world_hochrhein.json`

Shape (values are illustrative):

```jsonc
{
  "format": "MMW1",
  "origin": { "lat": 47.5506, "lon": 7.9671, "E": 2641…, "N": 126…, "crs": "EPSG:2056" },
  "bbox": [7.905, 47.532, 8.030, 47.572],
  "sources": ["© OpenStreetMap contributors, ODbL"],
  "params": { "houseDist": 30, "bigBuildingArea": 1000, "osmTimestamp": "…" },
  "roads":     [{ "id": 28495792, "n": "Fridolinsbrücke", "cls": "primary", "w": 9, "mark": "centre", "bridge": true, "layer": 1, "pts": [[x, z], …] }],
  "junctions": [[x, z, r], …],
  "water":     [{ "kind": "river", "level": 0.3, "rings": [[[x, z], …], …] }],
  "waterSdf":  { "x0": …, "z0": …, "step": 8, "w": …, "h": …, "data": "<base64 int8>" },
  "buildings": [{ "id": …, "h": 6.2, "roof": "gable", "palette": "village", "rect": [cx, cz, w, d, angle], "ring": [[x, z], …] }],
  "rail":      [[[x, z], …]],
  "anchors":   { "smileKreisel": [x, z], "start": [x, z, heading], "cps": [{ "n": "Bahnhof Sisseln", "x": …, "z": … }], … }
}
```

Coordinates rounded to 0.1 m. Expected size 1–3 MB (not yet measured).

### CLI

```bash
python osm.py cut   --pbf-dir ~/geodata/geofabrik --out cache/osm/hochrhein.osm.pbf   # on odroid-plus-pve
python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json
```

Options: `--bbox`, `--origin` (same defaults as `terrain.py`), `--house-dist 30`, `--big-building-area 1000`, `--anchors anchors.json`.

## Prototype

### Loading

Next to the existing `.mmh` await: `const WORLD = await fetch('../data/world_hochrhein.json').then(r => r.ok ? r.json() : null).catch(() => null)`. The layout consts (ROADS, RIVER, BRIDGES, RAMP, landmark positions) move behind one function: `const L = WORLD ? layoutFromWorld(WORLD) : layoutHandTraced()`. The hand-traced code stays as is inside `layoutHandTraced`. The start screen shows which layout is active and the OSM attribution.

### What changes when a world is loaded

- **Roads**: ribbons from OSM polylines (existing `ribbon`, draped on terrain). Discs only at junctions and road ends, not at every vertex. Street-name decals only for `tertiary` and up, one canvas texture per unique name.
- **Bridges**: every OSM bridge gets a deck whose height runs linearly between the ground at its two ends (fixes the 5 m dip into the Sissle bed). Generic look: deck plus low rails. Holzbrücke and Fridolinsbrücke keep their hero models, placed on the OSM line; `kind` from `anchors.json`. The Holzbrücke shortcut toast keeps working.
- **Water**: triangulated polygons (three.js `ShapeUtils`) at their level; banks as today. `riverDist` reads `waterSdf` (bilinear).
- **Buildings**: gables via existing `house()`/`gable()` from `rect`; flat roofs via a new `extrudeFootprint(ring, h)`; both add an OBB from the rotated rectangle. Colours as today (random plaster/roof palettes).
- **Landmarks, checkpoints, finish, start, Ortstafeln, minimap labels, railway**: from `anchors` / `rail`.
- **Trees and fields**: as today, but the hard-coded world boxes (`sisselnWald`, field ranges) move into `anchors.json` areas.
- **Minimap**: same drawing, fed from the new lists; extent from the world bbox.

### Performance

A uniform grid index (cell 32 m) over road segments, OBBs and bridge polylines, built once. `roadDist`, `free`, `collide`, `stepCamera` and `onBridge` query nearby cells only. The O(n²) junction-patch loop goes away (junctions come from the pipeline).

## Testing

- **Pipeline** (pytest, `pipeline/tests/`): frame transform identical to `terrain.py`; road filter and width table; building filter, height and roof rules; water SDF sign and magnitude on a synthetic square; a golden check on the real cut: the Hauptstrasse in the world file passes within 2 m of (1830, −287) and (1983, −297) and has its south-east bend east of x = 2900.
- **Prototype** (Playwright, foreground, per the browser-game stack): page loads with world and without, empty console both times; status line names the active layout; a debug hook reports road/building counts; frame time with the world loaded stays within 1.5× of the hand-traced layout in the same headless setup.
- **Manual playtest**: drive the Sisseln climb and the Holzbrücke shortcut, one checkpoint lap.

## Out of scope

- Real roof shapes (step 3: swissBUILDINGS3D, LGL LoD2).
- German terrain (LGL DGM1): still manual download, the German side stays flat until then.
- Fetching the `.mmh` automatically like the world file (noted as an idea).
- Road embankments, lanes, one-way, traffic.
- Tiling / streaming (region editor).
- Rapier.

## Licensing

The world file is a derivative database of OSM (ODbL). It stays out of git (`data/` is ignored). The game credits and the start screen show "© OpenStreetMap contributors". Serving it publicly later means offering it under ODbL (see docs/04).

## Risks

- **Rhine multipolygon** incomplete despite `smart` → buffered centre line (`width=200` is tagged) as fallback, logged.
- **Frame rate** with ~2,000 buildings plus 3,000 road ways → merged meshes per role stay; if still slow, reduce street-name decals first, then discs.
- **Checkpoint positions** move by tens of metres to their real places; race times from before aren't comparable.
