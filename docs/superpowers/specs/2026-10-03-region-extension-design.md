# Region extension west, south and east (Rheinfelden, Schupfart, Laufenburg) — design

> **Split 2026-10-10:** #47 (south to Flugplatz Schupfart) was split out of this batch by the maintainer and has its own
> spec and plan (`2026-10-10-region-south-schupfart-*`, Swiss data only). This document now covers #19 (east) and #44
> (west). The south edge stays 47.532 here unless #47 has landed; see #19's body for the ordering and what to skip.

Status: written in headless enrichment (`/enrich 44|47|19 --headless`, one batch) 2026-10-03 · Issues #44 (west), #47 (south), #19 (east) · **D1 and D2 confirmed by the maintainer 2026-10-03** (as proposed; customs post = Zollstation Laufenburg; ship, measure, chunk later)

## Goal

The map grows in one step to three new places, each a jump target in the J list and visible in the 3D world:

- **West (#44):** Rheinfelden AG and Rheinfelden (Baden), with the Feldschlösschen brewery and the Alte Rheinbrücke.
- **South (#47):** up onto the Tafeljura to Flugplatz Schupfart.
- **East (#19):** Laufenburg AG and Laufenburg (Baden), with the Laufenbrücke and the Zollstation Laufenburg. This answers the playtest question „Wo ist die Brücke nach Laufenburg / Zollstelle?“.

The German side gets measured terrain (LGL DGM1) for the first time. Today it is flat at the base height.

Success means four things. One cut, one terrain build and one world build produce a single new `data/terrain_hochrhein.mmh` and `data/world_hochrhein.json`. The old map area (the "core") comes out of the new extract unchanged. The five new places resolve and can be reached with J. The live site stays inside the size and load budget that D2 decides.

## Starting point (verified 2026-10-03 on `main` @ `4aeed5f`)

- **One rectangle defines the region.** `pipeline/geo.py:15` `DEFAULT_BBOX = (7.905, 47.532, 8.030, 47.572)`, with origin `DEFAULT_ORIGIN = (47.5506, 7.9671)` (`geo.py:16`). `terrain.py` (`--bbox`, `geo.grid_for`) and `osm.py` (`cut --bbox`, `build --bbox`) both default to it. The world clip is `shapely.box` of the bbox in game metres (`osm.py:87-89`). The water SDF spans the clip bounds (`osm.py:129`, `world_water.sdf` on an 8 m grid). The prototype sizes the ground mesh from the SDF extent (`prototype/index.html:338`, `TGRID`: one `PlaneGeometry` with 16 m cells). The minimap scale comes from the road extent (`index.html:997`, canvas 800 × 400).
- **The game samples terrain on a 16 m mesh only.** `terrainH` returns the mesh surface. `baseH` → `realH` is read at the grid vertices only (`index.html:337-345`). The 4 m `.mmh` is therefore 16× denser than anything the game draws or drives on.
- **Today's data files** (header and JSON read directly):
  - `terrain_hochrhein.mmh` is 2362 × 1130 at 4 m (9.4 × 4.5 km), 10.7 MB raw and 6.1 MB gzip, as served by GitHub Pages (`content-encoding: gzip`, checked with `curl -I`). Its `sources` are `['swissALTI3D (c) swisstopo']` only, so **DGM1 has never been added**.
  - `world_hochrhein.json` is 2.6 MB raw and 0.48 MB gzip. Of that, `waterSdf` is 0.87 MB (base64 of 1181 × 550 int8), buildings 0.53 MB, roads 0.47 MB, parking 0.45 MB and props 0.13 MB. It holds 2616 roads, 1885 buildings, 2713 props and 330 car parks.
- **Caches** (local only, git-ignored, in the main checkout's `pipeline/cache/`):
  - `osm/switzerland-latest.osm.pbf` (547 MB) and `osm/freiburg-regbez-latest.osm.pbf` (159 MB), from 2026-09-29;
  - `osm/hochrhein.osm.pbf` (3.7 MB, the current cut);
  - 40 swissALTI3D tiles (42 MB);
  - 41 swissSURFACE3D tiles (509 MB).

  No DGM1 tiles exist anywhere on the box (`~/geodata` is absent).
- **The OSM cut is heavy.** `osm.py cut` runs `osmium extract -s smart` per country file, then `osmium merge` (`osm.py:41-49`). The first real cut peaked at **3.58 GB** in a throwaway LXC on odroid-plus-pve (`docs/11-pipeline-osm.md`). The same command on agent-dev grew to 2.5 GB RSS and froze the node on 2026-09-29 (`docs/08-pipeline-terrain.md`, Incident).
- **The Rhine is a multipolygon relation** (r1706150, `water=river`, 4 members in the current extract; a capped pyosmium read of `hochrhein.osm.pbf`). `world_water.polygons` assembles it from `data.areas`.
- **Terrain build.** `terrain.py` downloads swissALTI3D tiles via STAC and paints them onto the grid. It fills the gaps from LGL DGM1 tiles in `--dgm-dir`. `german_datasets()` (`terrain.py:116-133`) opens **every** DGM tile into a list before painting, and an XYZ tile is fully loaded into an in-memory raster (`xyz_to_dataset`).
- **The world rebuild needs the local caches.** It always runs with `--dsm-heights cache`, as in the guarded rebuild tasks of `docs/superpowers/plans/2026-10-02-more-landmarks.md` (Task 4) and `…-gemeinde-boundaries.md`. A CI runner has none of the caches.
- **Golden tests are pinned to today's bbox:**
  - `pipeline/tests/test_golden.py` builds with `geo.DEFAULT_BBOX` and pins counts (1500–2600 buildings, 250–400 car parks, 1100–1400 house numbers, prop ranges) and a file size under 6 MB;
  - `pipeline/tests/test_geo_mmh.py:31-34` pins `grid_for(DEFAULT_BBOX, 4 m) == (2362, 1130, -4692, -2416)`.
- **Landmarks and J list.**
  - `anchors.resolve` takes `osm` (way, area or named node), `game` or `lonlat` (`pipeline/anchors.py:41-52`).
  - The 3D landmark models are keyed by anchor **name** (`index.html:735-742`). New keys are therefore position-only, with no model and no crash.
  - The J list is `prototype/landmarks.js`: `GEMEINDEN` west → east, plus `LANDMARK_INFO` entries with either `anchor` or `building`. Entries whose source is missing are skipped.
  - `osm_read.AREA_KEYS` does not include `aeroway`, so the aerodrome relation is not an area the anchors can reference.
- **Camera.** `PerspectiveCamera(62, 1, 0.5, 4200)` (`index.html:772`), with fog: Original `Fog(…, 320, 1400)`, Smooth `FogExp2(0.00095)`. All static geometry is merged per role into single meshes, so nothing is frustum-culled per area.

### The new places in OSM (capped, read-only pyosmium probe of the two cached country files)

| Place | OSM object | lon, lat | game x, z |
|---|---|---|---|
| Brauerei Feldschlösschen | `w98020654` building=industrial, craft=brewery; site `w41115630` landuse=industrial | 7.7845, 47.5470 | −13743, 477 |
| Rheinfelden AG (town node) | `n240069687` | 7.7923, 47.5544 | −13161, −348 |
| Alte Rheinbrücke Rheinfelden | `w35075968` living_street, bridge (+ `w832886137`) | 7.7907, 47.5549 | −13281, −404 |
| Flugplatz Schupfart | relation `r2782819` aeroway=aerodrome; bus stop node `n626973968` 7.95294, 47.50837 | ~7.950, 47.509 | ~−1035, 4702 |
| Laufenbrücke | `w52451103` highway=unclassified, bridge | 8.0605, 47.5632 | 7022, −1452 |
| Zollstation Laufenburg | `w172512597` building, amenity=police, at the Hochrheinbrücke (`w24794219`) | 8.0761, 47.5628 | 8196, −1421 |
| Altes Zollhaus (Laufenburg Baden end of the Laufenbrücke) | `w1058762218` building | 8.0612, 47.5640 | 7068, −1538 |

Gemeinde relations (admin_level 8) exist for every Gemeinde the new area touches, among them Rheinfelden r1684403, Rheinfelden (Baden) r2787853, Möhlin r1684373, Schupfart r1684421, Laufenburg r1684347, Laufenburg (Baden) r2786292 and Kaisten r1684338.

## Decisions D1 and D2 (proposed headless, confirmed 2026-10-03)

**D1 — how far each edge moves.** Proposed: **W 7.775, S 47.500, E 8.085, N 47.572** (north unchanged).

- West: 7.775 is ~0.8 km past the brewery and includes Rheinfelden AG, the Alte Rheinbrücke and the centre of Rheinfelden (Baden). The issue's own estimate was "~9 km further west"; this edge is 9.8 km further west.
- South: 47.500 is ~0.6 km past the airfield. It also takes in Schupfart, Obermumpf, Zeiningen, Zuzgen, Hellikon and Oeschgen.
- East: 8.085 is ~0.6 km past the Zollstation at the Hochrheinbrücke and takes in Laufenburg AG and (Baden).

Alternatives a human may prefer:

- tighter edges (W 7.785 / E 8.070);
- a south edge only under the airfield's longitude band — impossible with one rectangle, see A2;
- dropping one direction.

**D2 — size and performance budget.** With D1, the region grows from 9.4 × 4.4 km (41 km²) to **23.4 × 7.9 km (184 km², × 4.5)**.

| | today | D1 at 4 m terrain | D1 at 8 m terrain (proposed) |
|---|---|---|---|
| `.mmh` grid | 2362 × 1130 | 5850 × 2040 | 2926 × 1021 |
| `.mmh` raw / gzip on the wire | 10.7 / 6.1 MB | ~48 / ~27 MB (est.) | ~12 / ~7 MB (est.) |
| water SDF (base64, inside the world JSON) | 0.87 MB | 3.8 MB | 3.8 MB |
| world JSON raw / gzip | 2.6 / 0.48 MB | est. 8–11 / 1.5–2.5 MB | same |
| ground mesh (16 m) | 163 k vertices | 720 k vertices | 720 k vertices |
| minimap at 1× | 0.085 px/m | 0.034 px/m | 0.034 px/m |

The world JSON estimate is the SDF plus roads, buildings, props and car parks scaled by the new built-up area. The new area adds Rheinfelden AG + Baden (~47 k inhabitants), Möhlin, Laufenburg AG + Baden and Kaisten. It is an estimate, not a measurement.

Proposed:

- terrain step **8 m**. The game samples a 16 m mesh, so in-game nothing visible is lost.
- budget **world JSON ≤ 12 MB raw, `.mmh` ≤ 13 MB raw**, both checked in the rebuild task.
- far plane, fog and mesh chunking **unchanged**.

A human must accept the first-load cost: about 9–10 MB gzip in total instead of 6.6 MB. A human must also accept a ~4.5× larger ground mesh and merged static meshes on phones, or ask for chunking first.

## Decisions

| Topic | Decision |
|---|---|
| One batch, one plan | One shared spec and **one plan**, carried by **#19**. #44 and #47 point to it. The PR closes all three. |
| Region shape | One rectangle: `geo.DEFAULT_BBOX` becomes the D1 box. The old box stays as `geo.CORE_BBOX = (7.905, 47.532, 8.030, 47.572)` for regression tests. |
| Origin | `DEFAULT_ORIGIN` **unchanged**. All `game` anchors in `anchors.json`, the race, the tests and IndexedDB terrain uploads keep their coordinates. |
| Terrain | `terrain.py` default `--step` 4 → **8** (D2). DGM1 tiles are opened **one at a time**: `german_datasets` becomes a generator. Swiss data still wins where both exist. |
| DGM1 source | Manual download from the LGL Open GeoData portal into `~/geodata/lgl_dgm1`. This is a **human prerequisite**: the portal has no stable tile URL to script against (`/data/dgm/dgm1_32_420_5266_2_bw.zip` returns 404). GeoTIFF is preferred over XYZ, which `np.loadtxt` loads whole. Cover UTM32 E 406–432 km × N 5262–5270 km where Germany is (north of the Rhine). |
| OSM cut | Same command as before, `-s smart` from the **same cached 2026-09-29 country files**, run on **odroid-plus-pve**: the measured peak is 3.58 GB, over the 2 GB agent-box cap. The padded cut bbox becomes 7.748–8.112 E × 47.482–47.590 N. |
| World build | `osm.py build … --dsm-heights cache` under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Exit 137 → move it to odroid-plus-pve, never raise the cap. |
| New anchors (`pipeline/anchors.json`) | `alteRheinbrueckeRheinfelden` {osm `w35075968`}, `laufenbruecke` {osm `w52451103`}, `zollLaufenburg` {osm `w172512597`}, `flugplatzSchupfart` {lonlat [7.9505, 47.5090]}, all kind `poi` (position only). `areas.industrial` += `w41115630` (Feldschlösschen site, industrial palette). Minimap labels `RHEINFELDEN`, `LAUFENBURG`, `SCHUPFART` at the OSM place nodes. |
| J list (`prototype/landmarks.js`) | `GEMEINDEN` gets `Rheinfelden` first, `Schupfart` between `Münchwilen` and `Eiken`, and `Laufenburg` last. New entries: `Brauerei Feldschlösschen` (Rheinfelden, building 98020654), `Alte Rheinbrücke Rheinfelden` (Rheinfelden), `Flugplatz Schupfart` (Schupfart), `Laufenbrücke` (Laufenburg), `Zollstation Laufenburg` (Laufenburg). |
| Tests | Existing golden tests switch to `CORE_BBOX` and keep their numbers. New region golden tests skip unless the extract's header box covers `DEFAULT_BBOX`. The `grid_for` pin moves to `CORE_BBOX`, and a second pin covers the new box. |
| Live data | Rebuilt **only** in the guarded local tasks. Never hand-edited, never on a CI runner. |

## Assumptions (headless — no human was asked)

- **A1** [confirmed 2026-10-03] **D1 edges** W 7.775 / S 47.500 / E 8.085 / N 47.572. Evidence: the probe table above; the issues give only targets ("~7.79 E", "~47.509 N", "~8.06 E"). Rejected: edges flush on the targets, which would put the landmarks at the map rim with no road network around them.
- **A2** [high] One rectangle, not an L- or T-shape. The whole pipeline and prototype assume one: the clip box (`osm.py:87-89`), `grid_for`, the SDF and `TGRID`. Rejected: a polygon clip, which is a refactor of every step and its own issue.
- **A3** [confirmed 2026-10-03] **D2 budget** and terrain step 8 m. Evidence: the game samples 16 m (`index.html:337-345`), and 4 m would put ~27 MB gzip on every first load. Rejected: 4 m kept (×4.5 download), 6 m (in between, ~21 MB raw). A human must accept the ×4.5 area on phones.
- **A4** [high] One plan for all three issues. All three change the same constant, the same cut, the same terrain and world files and the same golden tests. Three plans would mean three odroid cuts, three DGM rounds and three regenerated multi-MB data files racing each other on `main`. Rejected: three plans with a shared base (no task is independent of the cut and the rebuild).
- **A5** [med] #19 carries the plan as the oldest issue, from the playtest. #44 and #47 reference it and are closed by the same PR. Rejected: #44, the biggest change, as carrier. Either works.
- **A6** [med] `-s smart` on odroid-plus-pve instead of `-s simple` under the 2 GB cap. `simple` does not complete multipolygon relations that reach past the padded box. The Rhine (r1706150), landuse and boundary relations would lose members, and area assembly would drop them. The user rule says to route a >2 GB step to odroid rather than raise the cap.
- **A7** [high] The cut reuses the cached 2026-09-29 country files, so the core area's OSM data is unchanged and the core golden tests stay green with their numbers. Rejected: fresh Geofabrik downloads, which would move every count and hide regressions behind data drift.
- **A8** [high] Origin unchanged: every hand anchor in `anchors.json` is in game metres from it.
- **A9** [med] Flugplatz Schupfart is a `lonlat` anchor (47.5090 N, 7.9505 E: the issue's position, next to bus stop `n626973968`) and not `osm: r2782819`. `aeroway` is not in `osm_read.AREA_KEYS`, and adding it would also pull runways and aprons into `data.areas` for one point. Rejected: extending `AREA_KEYS`.
- **A10** [med] Customs post = **Zollstation Laufenburg** `w172512597` at the Hochrheinbrücke, the main road crossing. Rejected: the Altes Zollhaus `w1058762218` at the Laufenbrücke's German end. It is a historic building, not a customs post, and is still listed above if a human prefers it.
- **A11** [med] Rheinfelden's J entries are the brewery and the Alte Rheinbrücke, not a bare "Rheinfelden" town point. The issue asks for "Rheinfelden itself"; the bridge is the Altstadt's recognisable spot.
- **A12** [med] Gemeinde names for the new J entries are Rheinfelden, Schupfart and Laufenburg (the Swiss Gemeinden). The guarded rebuild task checks each one by point-in-polygon against the admin_level 8 relations and uses the probe's answer if it differs.
- **A13** [high] Far plane 4200 m and fog unchanged. Exp2 fog at 4200 m leaves e^-15.9 of the colour, so nothing beyond it would be visible anyway. Rejected: a larger far plane (depth precision, no visible gain).
- **A14** [med] No mesh chunking or LOD in this change. The rebuild task measures load time and frame time against `main` and reports them. Chunking is a follow-up if D2's numbers are not accepted.
- **A15** [high] DGM1 download is manual. The LGL portal is a web app, and a guessed direct tile URL 404s. The terrain task stops cleanly without the tiles; it does not fall back to a flat German side.

## Consequences

- The `.mmh` resolution halves everywhere, the core included (8 m instead of 4 m). The game draws 16 m, so this matters only to the pipeline's water-level medians, which use the `.mmh`.
- German banks get real heights. The known limit "water above flat German banks" (`docs/11-pipeline-osm.md`) goes away, and water levels on the German side may shift by a few decimetres.
- Heights relative to the 284 m base now range from about −20 m (the Rhine at Rheinfelden) to about +180 m (the Tafeljura near Schupfart).
- A player who once loaded their own `.mmh` (IndexedDB wins, `index.html:317`) keeps the old-size terrain. Outside it the new area falls back to made-up hills until they press "Use made-up terrain" or reload a new file.
- The minimap at 1× shows 2.5× less detail per metre, and the existing zoom levels (1/2/4/8, #11) carry more weight.
- The race (start Sisseln, finish Bad Säckingen) is unchanged. "Random spot" can now drop the car anywhere in the larger area.
- Features that list villages by hand (village names #16, Gemeinde chips) do not pick up the new villages automatically. Only the three new chips come with this change.
- Disk and network on the build machine: ~150 swissALTI3D tiles (~150 MB), ~120 more swissSURFACE3D tiles (~1.5 GB) and ~35 DGM1 tiles.
- Another issue that rebuilds `data/world_hochrhein.json` from the old 3.7 MB extract after this lands would shrink the map back. The old extract is kept under a different name, and docs/11 says which one is current.

## Testing

- **Pipeline unit:**
  - `geo` pins for `CORE_BBOX` (old numbers) and `DEFAULT_BBOX` (2926 × 1021 at 8 m, x0 −14472, z0 −2448);
  - the `cut_commands` padded box covers the new edges;
  - `german_datasets` is lazy: one open dataset at a time;
  - `terrain.main` defaults to step 8;
  - `anchors.resolve` resolves the new `lonlat` and `osm` anchors.
- **Golden core** (existing, against `CORE_BBOX`): unchanged numbers. They must pass on the new extract.
- **Golden region** (new; skips unless the extract header box covers `DEFAULT_BBOX`):
  - building 98020654 is present with the industrial palette;
  - road 52451103 is a bridge;
  - anchors `alteRheinbrueckeRheinfelden`, `laufenbruecke`, `zollLaufenburg` and `flugplatzSchupfart` resolve inside the clip;
  - `world["bbox"] == DEFAULT_BBOX`;
  - written size ≤ the D2 budget.
- **Node** (`landmarks.test.mjs`): the new `GEMEINDEN` order, and the five new entries with their Gemeinden.
- **Browser** (`test_jump.py`, skips until the served world covers the new box): `feldschl` + Enter lands within 80 m of the brewery, the `Laufenburg` chip lists the Laufenbrücke and the Zollstation, and `schupfart` finds the airfield.
- **Manual playtest** entries in `test-todo.md`: drive across the Laufenbrücke to the customs post; drive up to Schupfart; check the German slopes are no longer flat; check first-load time on a phone.
