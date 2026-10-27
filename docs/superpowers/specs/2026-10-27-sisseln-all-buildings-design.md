# Every building in Sisseln, Volg and both school houses as landmarks — design (#507)

## Goal

Sisseln shows every OSM building, not only those within 30 m of a main road. The Volg and the school houses are J-list
landmarks.

## Measured (hochrhein.osm.pbf, world on main, 2026-10-27)

- OSM buildings inside the Gemeinde Sisseln boundary: **721**; in the world today: **189**; a keep-all area adds **415**
  (not `roof/carport/construction/ruins`, not under 20 m²). World total 2664 → about 3080 (+16 %).
- Volg: node 2861905086 (shop=supermarket, Hauptstrasse 17) inside building **w171822900** — already in the world.
- Schulhaus: **w171822721** (amenity=school) — in the world and in the J list. Neues Schulhaus: **w282842878** — missing.

## Decisions (maintainer, 2026-10-27)

- Area = the real Gemeinde boundary (OSM admin_level 8 "Sisseln"), simplified to 50 points (tolerance 0.00005°; no
  building centroid changes side), stored as `lonlat_polygon` in `pipeline/anchors.json` area `sisseln` with
  `keep_all_buildings: true`. The Winkelacker box stays (inside it, harmless).
- J list: new **Volg Sisseln** (building 171822900) and **Neues Schulhaus Sisseln** (building 282842878); the existing
  **Schulhaus Sisseln** stays. All three go into `keep_buildings` so they survive any future filter change.
- Implemented **locally** (not by the pipeline): the rebuild needs `pipeline/cache/osm/hochrhein.osm.pbf` and the
  swissSURFACE3D cache, both git-ignored. One PR with code and the rebuilt `data/world_hochrhein.json`.

## Code shape

- `anchors.resolve`: an area with `lonlat_polygon: [[lon, lat], …]` resolves to a list of game `[x, z]` points.
- `anchors.keep_all_boxes`: a resolved area that is a point list becomes `shapely.Polygon`, a 4-number box stays
  `shapely.box` (name kept; the game only reads `anchors.areas.sisselnWald`, a box, so a polygon in the JSON is inert).

## Rebuild and checks

- `osm.py build --pbf pipeline/cache/osm/hochrhein.osm.pbf --mmh data/terrain_hochrhein.mmh --dsm-heights pipeline/cache`
  under `systemd-run … MemoryMax=2G`, defaults otherwise (as the 2026-10-11 build).
- Diff against main's world: buildings only grow (+≈415, all inside the boundary), roads/water/rail/props unchanged
  apart from what the newer code already does on main.
- Node landmark tests, the Sisseln J entries resolve; a short look at the frame rate in Sisseln on the GPU browser.

## Sisseln ring (lon, lat)

```json
[[7.96337, 47.55027], [7.96861, 47.55006], [7.96846, 47.54999], [7.96811, 47.54871], [7.96817, 47.54863], [7.97174, 47.54848], [7.97172, 47.54886], [7.97386, 47.54887], [7.97388, 47.54962], [7.97936, 47.54967], [7.97939, 47.54808], [7.98298, 47.54811], [7.98298, 47.54783], [7.98563, 47.54786], [7.98565, 47.54678], [7.98693, 47.54678], [7.9876, 47.54693], [7.98815, 47.54694], [7.99068, 47.54687], [7.99061, 47.54703], [7.99176, 47.547], [7.99297, 47.54644], [7.9944, 47.54649], [7.99539, 47.54627], [7.99555, 47.54691], [7.99595, 47.54757], [7.99623, 47.54849], [7.99687, 47.5498], [8.00001, 47.55057], [8.00143, 47.55101], [8.00804, 47.55228], [8.00809, 47.5546], [8.00694, 47.55507], [8.00564, 47.55542], [8.00117, 47.55625], [7.99885, 47.5565], [7.99696, 47.55656], [7.99508, 47.55648], [7.99002, 47.55602], [7.98625, 47.55551], [7.98338, 47.55526], [7.98122, 47.55519], [7.9782, 47.55523], [7.9736, 47.55548], [7.97043, 47.55583], [7.96772, 47.55637], [7.96476, 47.5572], [7.96399, 47.554], [7.96366, 47.5519], [7.96357, 47.5519]]
```
