# Farm fields on the Swiss side (#506)

## Why

The Sisslerfeld (and the whole Swiss side of the Hochrhein world) is plain grass today. The aerial photo on the
Sisseln council agenda shows what is really there: long, narrow parcels in changing colours (harvested cereal beige,
maize and meadow green, ploughed brown), mostly across the road, separated by field tracks. The game draws **no**
real farmland at all: `farmland`/`meadow` occur only in car-paint strings (`prototype/strings.js:344`), and the
existing `field` role is 40 random rectangles seeded by `rr` (`prototype/index.html:1867-1869`), placed in
x −2400..2400, z −1100..1240 — away from the Sisslerfeld, with no relation to the real parcels.

## Decisions (maintainer, issue #506, 2026-10-29)

- Primary source: the cantons' **Landwirtschaftliche Nutzungsflächen** (crop per parcel), Kanton Aargau via
  geodienste.ch. OSM `landuse=farmland|meadow|orchard` only as fallback. SWISSIMAGE only as a **visual reference**
  for the colours, not as a texture.
- Fields look like fields: colour by crop, furrow/stripe texture along the parcel, visible parcel edges.
- Fields never poke over roads (#290 just fixed grass over roads; `test_grass_and_fields_stay_below_the_road` must
  stay green with its limits unchanged).
- Heavy data work under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.

## Data source (verified 2026-10-31)

**geodienste.ch WFS 2.0 "Nutzungsflächen" (MGDM 153.1 v2.0)**, service id `lwb_nutzungsflaechen_v2_0`:

- Capabilities: `https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0/deu?SERVICE=WFS&REQUEST=GetCapabilities`
- Feature type `ms:nutzungsflaechen`; `OUTPUTFORMAT=geojson` and `SRSNAME=EPSG:2056` work; `BBOX=minE,minN,maxE,maxN,EPSG:2056`;
  `RESULTTYPE=hits` gives `numberMatched`; `COUNT`/`STARTINDEX` page.
- **Anonymous access works for Aargau** (the capabilities' "http basic authentication" applies only to cantons that
  require registration; a bbox GetFeature around the Sisslerfeld returned 200 and features without credentials).
- Terms on the service page (`https://geodienste.ch/services/lwb_nutzungsflaechen`, "Informationen pro Kanton"),
  canton **AG**: *Verfügbarkeit: Frei erhältlich · Open Data: Ja · Nutzungsbedingungen: "Freie Nutzung.
  Quellenangabe ist Pflicht. Es gelten die kantonalen Nutzungsbedingungen."* BL (34 parcels in the bbox) has the
  same terms. Attribution text used everywhere: **"Landwirtschaftliche Nutzungsflächen © Kanton Aargau,
  geodienste.ch"**.
- Per feature (properties): `lnf_code` (int, the crop code), `nutzung` (its German name), `ist_ueberlagernd`
  (overlay use, e.g. 951 "Getreide in weiter Reihen" — a programme laid over a real parcel, **drop**), `flaeche_m2`,
  `bezugsjahr` (2025), `kanton`. Farm ids (`identifikator_be`, `nutzungsidentifikator`) are **not** exported to the
  game file.
- Measured in the world bbox (lon 7.905–8.03, lat 47.5–47.572 ≈ E 2635000–2644600, N 1261100–1269300):
  **4651 features, 6.8 MB GeoJSON, 100 183 vertices, 2888 ha** (36 overlays). Largest classes: 513 Winterweizen
  483 ha, 613 Dauerwiesen 468 ha, 601 Kunstwiesen 416 ha, 611 extensive Wiesen 335 ha, 521 Silomais 256 ha,
  527 Winterraps 180 ha, 616 Weiden 127 ha, 502 Wintergerste 104 ha, 522 Zuckerrüben 84 ha; 852 hedges 457 parts
  (32 ha), 9xx unproductive ~250 parts.
- SWISSIMAGE for reference only: `https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&CRS=EPSG:2056&BBOX=2644000,1266500,2646000,1268000&WIDTH=800&HEIGHT=600&FORMAT=image/jpeg`
  (swisstopo OGD, attribution required). The implementer looks at it to tune the palette, nothing in the pipeline
  reads it.

## Design

### Pipeline: `pipeline/fields_ch.py` (fetch) + `pipeline/world_fields.py` (build)

**Fetch** — a separate step, never inside `build_world` (the golden/region tests must stay offline):

`python pipeline/fields_ch.py fetch --out cache/lwb/hochrhein.geojson [--bbox W S E N]` (default `geo.DEFAULT_BBOX`).
Converts the lon/lat bbox to LV95 with `geo.Frame`'s transformer, pads 100 m, pages the WFS
(`COUNT=5000`, `STARTINDEX` until a page is short), writes `.part` then renames, skips when the file exists, logs
to stderr — the `terrain.swiss_tiles` conventions. `cache/` is gitignored; the raw GeoJSON is not committed.

**Build** — `world_fields.build(features, areas, roads, rail, clip, frame) -> (fields, stats)`, called from
`osm.build_world` next to the forests (`pipeline/osm.py:125`), with the raw features from `--fields <geojson>`
(optional; without it only the OSM fallback runs):

1. LWB features: drop `ist_ueberlagernd`, drop codes without a kind (below). Geometry EPSG:2056 →
   `frame.lv95_to_game` via `shapely.transform` (the `osm_read._to_game` pattern), `make_valid`, `intersection(clip)`.
2. OSM fallback: `data.areas` with `landuse` in `farmland|meadow|orchard|vineyard` (already read: `osm_read.AREA_KEYS`
   has `landuse`), minus the union of all LWB parcels buffered 2 m — so OSM fills only where the cantonal data has
   nothing (the German bank, gaps). Kinds: `meadow` → meadow, `orchard` → orchard, `vineyard` → vine, `farmland` →
   one of cereal/cereal/maize/bare/rapeseed picked by `id % 5` (deterministic, no RNG).
3. Every parcel minus the corridors: roads `LineString(pts).buffer(w/2 + FIELD_GAP)` with `FIELD_GAP = 1.0` m,
   rail lines buffered `RAIL_GAP = 3.0` m, car parks as in `world_forests` (`PARKING_GAP`). **This is the #290
   guarantee: no field triangle lies under a road footprint, so no ray from a road can hit a field.**
4. `buffer(-SEAM / 2)` with `SEAM = 1.5` m: neighbouring parcels get a grass seam between them that reads as the
   field track / parcel edge, and slivers vanish. Then `simplify(1.0, preserve_topology=True)`, parts under
   `MIN_AREA = 300` m² dropped, coordinates rounded to 0.1 m, rings open (no repeated last point), like forests.
5. `dir`: the direction of the long side of `shapely.minimum_rotated_rectangle(p)` in radians (atan2 in the game
   frame, folded to [0, π), rounded 0.01). Furrows run along it.
6. Output, sorted by bounds like forests: `{ kind, ring, holes?, dir, src }` with `src` `"lwb"` or `"osm"`.
   Stats: `lwb`, `osm`, `dropped_code`, `dropped_small`, `parts`, `area_ha`.

**Kinds** (`KIND_BY_CODE`, one table in `world_fields.py`; unknown 5xx → `bare`, unknown 6xx → `meadow`, unknown
7xx → `orchard`, everything else dropped):

| kind | lnf codes | what it is |
|---|---|---|
| `cereal` | 501–516 (Weizen, Gerste, Roggen, Triticale, Dinkel, Hafer, Hirse…) | harvested/ripe grain, beige stubble |
| `maize` | 508, 521 | Körner-/Silomais, dark green |
| `rapeseed` | 527 | Raps, bright yellow-green |
| `root` | 522, 523, 528, 531, 536, 540–551 (Rüben, Kartoffeln, Soja, Sonnenblumen, Bohnen, Gemüse) | row crops, mid green |
| `fallow` | 556–559 (Brachen, Saum, Ackerschonstreifen) | flowering fallow, straw-yellow |
| `bare` | 598 and other 5xx | ploughed / unknown arable, brown |
| `meadow` | 601 (Kunstwiese), 612, 613, 693 and other 6xx | green meadow |
| `meadowDry` | 611 (extensiv genutzte Wiesen) | yellow-green |
| `pasture` | 616, 617 | grazed, green with a mown look |
| `orchard` | 702–705 | Obstanlagen, rows |
| `vine` | 701, 717 | Reben, rows |
| dropped | 8xx (852 hedges), 9xx (unproductive, building land), overlays | not fields |

### World file and loader

- `world_hochrhein.json` gains `"fields": [{ kind, ring: [[x, z], …], holes?: [[[x, z], …]], dir, src }]`;
  `docs/11-pipeline-osm.md` schema block gets that line. `format` stays `MMW1`.
- `layoutFromWorld` (`prototype/world.js:116`) adds `fields: w.fields || []` (the key is otherwise dropped).
- `sources` (`pipeline/osm.py:145`) gets `"Fields: Landwirtschaftliche Nutzungsflächen © Kanton Aargau, geodienste.ch"`
  when at least one `lwb` field was built (it shows in the HUD `worldOsm` line).
- Budget: at most **1.5 MB** added to `data/world_hochrhein.json` (estimate: ~3900 parcels, ~70k vertices after
  simplify and inset). Report the real size in the PR body.
- The committed `data/world_hochrhein.json` is rebuilt and committed in the same PR (`data/README.md` row updated).

### Rendering (`prototype/index.html`, pure helpers in `prototype/world.js`)

A new builder `fieldMeshes()` next to `waterPolys()`, run only when `L && L.fields.length`:

1. Per field: `THREE.ShapeUtils.triangulateShape(ring, holes)` (the `waterPolys` pattern), then
   `subdivideTris(pts, tris, 16)` (`world.js:637`) so the mesh follows the 16 m terrain mesh.
2. Heights: `terrainH(x, z) + FIELD_LIFT` with `FIELD_LIFT = 0.02` (the lift the existing rectangles use; under the
   road's 0.04 + `ribbonLift`). Then the #290 technique for triangles: a new pure `meshLift(pts, tris, h, hAt, step = 2)`
   in `world.js` samples a lattice (`step` m) inside each triangle with `trisHeightAt`, takes the worst
   `hAt(p) − drawn`, and lifts the triangle's three vertices by it (shared vertices take the max). So a field never
   sinks under a terrain fold between its vertices (grass patches on a field), and because the pipeline already
   kept every field ≥ 1 m off every road, a lifted field cannot rise into a road.
3. Colour: per vertex, `FIELD_KINDS[kind].color` times a brightness jitter of ±6 % from a hash of the field index
   (`hash01` style, **not** `rr`/`rnd` — a new `rr` call at build time shifts the seeded hand layout, #439).
   Role: `FIELD_KINDS[kind].role` — `'field'` (furrow texture `TEX.field`) for cereal, maize, rapeseed, root, bare,
   orchard, vine; a new role `'meadow'` for meadow, meadowDry, pasture, fallow with a new `TEX.meadow` (grass noise
   with faint 2 m mowing bands, 1/4 the furrow contrast).
4. UV per parcel: `u = ((x − cx)·cos dir + (z − cz)·sin dir) / 20`, `v = (−(x − cx)·sin dir + (z − cz)·cos dir) / 20`
   (pure `fieldUV(x, z, cx, cz, dir)` in `world.js`); `TEX.field`'s stripes vary with v, so furrows run **along**
   `dir`, the parcel's long axis — the aerial look. Vine/orchard rows: same texture, `dir + π/2` is **not** used
   (rows along the long side is right there too).
5. Both roles: `MeshLambertMaterial({ map, vertexColors: true })` in `original`, flat colour with vertex colours in
   `smooth` (`field` is already the one role that keeps `vertexColors` there; `meadow` joins it, flat `#8aa84f`).
   `castShadow` false (add `'meadow'` to the exclusion list `index.html:2266`), `BEAM_ROLES` gets `'meadow'`.
6. The 40 random rectangles: the loop keeps running (it consumes `rr`, which must not shift) but does not `push`
   when `L && L.fields.length`. The Kreisel island keeps the `field` role (`:1302`, `:2121`).
7. `window.__mm.counts.fields = { n, tris, lwb, osm }`; `grassOverRoad`'s `green` list and `rayHits`' role list get
   `MESH.meadow`/`'field'`/`'meadow'`.

Palette (sRGB, original style; tuned against SWISSIMAGE late summer — harvested cereals, standing maize):
cereal `#d9c57c`, maize `#4e7d38`, rapeseed `#cfc94a`, root `#5f8a3f`, fallow `#b9a95f`, bare `#9b7b55`,
meadow `#86aa4e`, meadowDry `#a6ad5a`, pasture `#8db05a`, orchard `#5a8a46`, vine `#6d8f4a`. One constant
`FIELD_KINDS` in `world.js` (colour, role), tested for completeness against the pipeline's kind list.

Triangle budget: ~2900 ha at 16 m edges ≈ **250k triangles** (the terrain mesh is ~590k). Report `counts.fields.tris`
and the world build time before/after in the PR body; if over 400k, raise `maxEdge` to 24 before anything else.

### Credits and docs

- `prototype/about.js` `ABOUT_LINKS.agis = 'https://geodienste.ch/services/lwb_nutzungsflaechen'`;
  `index.html` Credits tab `<dd>` after the swisstopo link: `<br><a data-link="agis" data-i18n="aboutAgis"></a>`;
  `strings.js` `aboutAgis` en: "Farm fields: Landwirtschaftliche Nutzungsflächen © Kanton Aargau via geodienste.ch
  (free use, attribution required)", de: „Felder: Landwirtschaftliche Nutzungsflächen © Kanton Aargau via
  geodienste.ch (freie Nutzung, Quellenangabe Pflicht)".
- `CREDITS.md`: one bullet in the swissBUILDINGS3D style. `data/README.md`: the `world_hochrhein.json` row names
  the fields source and terms. `docs/02-data-sources.md`: a "Switzerland: cantonal farm parcels" section with the
  URLs above. `docs/11-pipeline-osm.md`: schema line, "Run it" gets the fetch step, "Attribution" gets the line.
- `CHANGELOG.md` `[Unreleased]` → `### Added`, player voice, with the local timestamp.

## Acceptance criteria

- `pipeline/osm.py build --fields cache/lwb/hochrhein.geojson` writes `fields` into `data/world_hochrhein.json`:
  ≥ 3000 parcels, ≥ 2500 ha, every `kind` from the table, `src` `lwb` on the Swiss side and `osm` on the German bank;
  the file grows by at most 1.5 MB. Without `--fields` the build still works (OSM fallback only).
- No field polygon intersects any road corridor (`w/2 + 1 m`) — pipeline test on synthetic data and a check over the
  real file (`shapely` over `roads` × `fields`, zero intersections).
- In the OSM world a ray from the sky at the centre of a Sisslerfeld parcel (e.g. game (5300, −250), verified by the
  implementer against the built file) hits `MESH.field` or `MESH.meadow` 0.01–0.6 m above `terrainH`; a ray on the
  Geuerenstrasse centre line (280, 418.2) hits no field mesh.
- `test_grass_and_fields_stay_below_the_road[osm]` and `[hand]` pass with limits unchanged, `green` including
  `MESH.meadow`. `test_wheels_do_not_sink_into_the_road` and `test_suedspange.py` unchanged and green.
- Node tests: `meshLift` lifts a triangle over a ridge inside it and leaves a plane alone; `fieldUV` maps along/across
  `dir`; `FIELD_KINDS` covers every kind `world_fields.KINDS` emits (list mirrored in the test).
- Pipeline tests: kind mapping (codes → kinds, overlays and 8xx/9xx dropped), corridor cut, seam inset, `dir` of a
  long rectangle, OSM fallback only outside LWB parcels, deterministic farmland kind, fetch URL/paging without
  network (requests mocked), cache hit skips the download.
- Credits tab shows the Aargau line in both languages with a working link; `data/README.md`, `CREDITS.md`,
  `docs/11-pipeline-osm.md`, `docs/02-data-sources.md` updated; HUD `sources` line names the fields source.
- The hand world (no world file) is unchanged.

## Assumptions

- **A1** [med] Fields come from the cantonal WFS at build time via a separate `fetch` step, cached under
  `cache/lwb/`, not committed raw. Rejected: committing the 6.8 MB GeoJSON (the derived `fields` in the world file is
  what the game needs; `data/README.md` says generated data only). `pipeline/terrain.py:59-99` is the existing
  download/cache convention.
- **A2** [med] One late-summer palette by crop kind, no per-field colour sampled from SWISSIMAGE. The maintainer's
  issue text names SWISSIMAGE as a colour source *or* reference; the brief for this enrichment says reference. A
  per-field raster mean would add a WMS fetch per world build and a raster dependency for a colour the kind already
  gives.
- **A3** [med] Fields keep 1 m off roads and 3 m off rail in the pipeline instead of being clipped in the game.
  `world_forests.build` (`pipeline/world_forests.py:51-70`) does exactly this for woods (`CORRIDOR = 5`), and it
  makes the #290 guarantee structural rather than a lift race.
- **A4** [med] Parcel edges are a 1.5 m grass seam (inset 0.75 m per parcel), not a drawn line. Two vertex rings per
  parcel would double the triangle count; the seam reads as the field track in the aerial photo.
- **A5** [med] The German bank gets OSM `landuse` fields with a deterministic crop mix (`id % 5`), as the issue's
  "OSM oder Schätzung". Rejected: leaving Germany grass — the Sisslerfeld faces Bad Säckingen's fields across the river.
- **A6** [med] Triangles subdivided to 16 m and lifted with `meshLift` (the #290 lattice idea) rather than cut along
  the terrain grid. Grid-exact clipping would be exact but needs a polygon/grid clipper; the lift reuses
  `trisHeightAt` (`prototype/world.js:~955`) and keeps the mesh ≈ 250k triangles.
- **A7** [high] A second ground role `meadow` with its own texture rather than one `field` texture for everything:
  the furrow stripes on a meadow would look wrong, and roles are the one place a material differs per style
  (`index.html:2731-2733`).
- **A8** [high] Generated worlds (`pipeline/region.py`) get the OSM fallback only in this issue (no fetch step wired
  there). `osm_cut.RELATION_FILTERS` (`pipeline/osm_cut.py:14`) does not complete farmland relations either; closed
  ways still work. Noted in docs as a known limit.

## Consequences

- `data/world_hochrhein.json` grows from 4.3 MB to about 5.5 MB; first load on a slow line is ~0.3 s longer.
- ~250k more triangles on the Swiss side; a weak phone renders slightly slower in the open country (measure).
- The HUD source line gets longer (one more `·` item).
- Fields show the 2025 crop; a yearly re-fetch changes the colours (the data is "Bezugsjahr 2025").
- Trees/props placed by `rr` are unchanged (the rectangle loop still consumes `rr`); only what is drawn differs.
- Hedges (852) and unproductive parts (9xx) are not drawn — a later issue could grow hedgerows from the 852 parts.
