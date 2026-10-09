# Second region: Ehrendingen with the Wanderweg and Im Böndlern — design

Status: written in quick enrichment (`/enrich 127 --quick`) 2026-10-09 · Issue #127 · no human was asked; see Assumptions.

## Goal

The game gets a **second, separate region**: Ehrendingen AG (near Baden), not adjacent to today's Hochrhein map. Ehrendingen is about 30 km east of Sisseln, so it cannot be an extension of the Hochrhein rectangle the way #19/#44/#47 extend it. It is its own world file and its own terrain file. The player chooses it on the start screen or with `?region=ehrendingen`. Hochrhein stays the default, and nothing about it changes.

The issue names two places:

- **Im Böndlern** is the small commercial area at the north end of Unterehrendingen, around the ARA (the sewage works) by the Surb. In OSM it is the service road `w54804175` "Böndlern" (47.50799 N, 8.34014 E), with the buildings Böndlern 2/4/5/7: `w392447945`, `w102165202` (MGS Naturstein), `w178797099` and `w178797287` (ARA Ehrendingen).
- **"the Wanderweg"** is **Hofrain / Steinbuckweg**, confirmed by the user on 2026-10-09 (A3). In OSM it is one continuous lane from Oberdorf up the slope to the Lägern woods: Hofrain (`highway=residential` at the village end, then `highway=track`, gravel) turns into Steinbuckweg (`highway=track`, compacted or fine gravel, last stretch `motor_vehicle=forestry`). The track part is dropped by the road filter today, so it becomes **drivable as a gravel trail**, in the spirit of the "forbidden shortcuts" pillar, like the Holzbrücke. See A3. The ways are data in the region's anchors file, so a different lane is a one-line change.

Success means all of the following:

- `?region=ehrendingen`, or the start-screen "Ehrendingen" choice, loads `data/world_ehrendingen.json` and `data/terrain_ehrendingen.mmh`.
- The race runs from Oberdorf to the finish at Im Böndlern.
- **J** lists Im Böndlern and the Wanderweg, and you can drive the trail.
- `/game-rhyflitzer/` without a parameter is byte-for-byte the Hochrhein game it is today.

## Starting point (verified 2026-10-09 on `main` @ `ac0214e`)

- **The pipeline is already region-parametric on the CLI.** `osm.py cut|build` take `--bbox`, `--origin`, `--out` and `--anchors` (`pipeline/osm.py:166-180`). `terrain.py` takes `--bbox`, `--origin`, `--step`, `--base` and `--out` (`pipeline/terrain.py:191-197`). Only the defaults are Hochrhein: `geo.DEFAULT_BBOX`/`DEFAULT_ORIGIN` (`geo.py:15-16`), `terrain.DEFAULT_BASE = 284.0` (the Rhine level, `terrain.py:50`), `anchors.json`, and the output names `world_hochrhein.json`/`terrain_hochrhein.mmh`.
- **The game hard-wires one region** in these places in `prototype/index.html`:
  - the data URLs (`:409` terrain, `:411` world);
  - the IndexedDB key `'terrain'` (`:409`). An uploaded `.mmh` wins over the bundled one, so a Hochrhein upload would otherwise be applied to Ehrendingen;
  - the best-time key `'mm.best2'` (`:1386`, `:1397`);
  - the strings `intro`, `finishedText`, `blurbOsm` (they mention the Rhine and the Münsterplatz), `mode` "Time trial · Hochrhein" and `map` "Map · Hochrhein ·" (`strings.js:11,12,27,41,52`, applied via `data-i18n` at `index.html:260`);
  - `VILLAGES` (`world.js:331-340`, used at `index.html:1058,1062,1250`);
  - `GEMEINDEN`/`LANDMARK_INFO` (`landmarks.js:3-30`, `index.html:1238,1427`);
  - the tree scatter box `rr(-3100, 3100) × rr(-1800, 1900)` and the forest rule `th > 18` (`index.html:1029`). With Ehrendingen's terrain this rule would forest the whole village, see A6;
  - the `sisselnWald` fallback box (`index.html:1027`: `L?.anchors.areas.sisselnWald || [1960, -520, 2500, -300]`), which would plant a forest at a Sisseln coordinate inside Ehrendingen;
  - the Sprungschanze `RAMP`, which defaults to a hand-traced Hochrhein spot (`:395`) unless the world has a `jumpRamp` anchor (`:577`);
  - the made-up terrain, shaped like the Rhine valley (`baseH`, `:497-505`), used when no `.mmh` loads.
- **Everything else is already world-driven:**
  - race start, checkpoints and finish come from `anchors.start/cps/finish` (`:572-576`), snapped to roads;
  - the minimap labels come from `anchors.labels`;
  - the landmark models are drawn only when their anchor key exists (`:1015-1025`);
  - the hero bridges are found by anchor (`:418-419`);
  - the ground mesh and minimap scale come from the world's SDF and roads (`:474`, `:1462`);
  - the race has 5 checkpoints (`R.done === 5`, `:1396`; the HUD's "/ 5", `:102`), so Ehrendingen also gets exactly 5.
- **The root `index.html` forwards `location.search` to `prototype/`** (`index.html:9`), so `https://github.freaxnx01.ch/game-rhyflitzer/?region=ehrendingen` works. URL parameters are the established switch: `?vehicle=` (`vehicle.js:3-6`) and `?debug` (`debug.js:5-8`).
- **The road filter drops tracks and paths** (`world_roads.keep`, `world_roads.py:23-31`): `FOOT` ways are kept only as bridges, and `track` is not in `DRIVE`. The Wanderweg (Hofrain / Steinbuckweg) is `highway=track` from about 47.498 N up to the woods, so it is invisible and undrivable today.
- **OSM cut memory:** `osmium extract -s smart` on the 547 MB `switzerland-latest.osm.pbf` peaked at 3.58 GB (`docs/11-pipeline-osm.md`) and froze agent-dev once (`docs/08`, Incident). The peak comes from the planet-wide ID bitmaps, so a small bbox does not shrink it. The cached `switzerland-latest.osm.pbf` (2026-09-29) is in the main checkout's `pipeline/cache/osm/`.

### Measured probes (Overpass, read-only, 2026-10-09)

| What | Result |
|---|---|
| Gemeinde Ehrendingen `r1684300` bounds | 47.4786–47.5123 N × 8.3256–8.3633 E |
| `highway` ways in 47.48–47.515 N × 8.32–8.37 E | 1492 (all classes, before the drivable filter) |
| `building` ways in the same box | 2425 (the Hochrhein world keeps 1885 after its filter) |
| Place nodes | Ehrendingen `n240060931` (47.49481, 8.34186, village), Unterehrendingen `n102311519`, Oberehrendingen `n102311797` |
| Race-worthy points | Ehrendingen Post bus stop `n323236548`; Höhtal `n323236541`; Breitwies `n323236546`; Schulhaus Lägernbreite `w253095483`; Kapelle St. Anna `w102158022`; Tiefenwaag `n6495292014` |
| Landmarks | Kath. Kirche `w114544595`, Reformierte Kirche Ehrendingen `w114544599`, Kapelle St. Anna `w102158022`, Mehrzweckhalle Lägernbreite `w178797165`, Gemeindehaus Unterdorf `n323236524` (a node) |

Game coordinates with the proposed origin (47.4948, 8.3419), from `geo.Frame(...).to_game`:

| | x | z |
|---|---|---|
| Im Böndlern (Böndlern road) | −149.5 | −1464.9 |
| Wanderweg (Hofrain / Steinbuckweg junction, 47.49498 N, 8.35081 E), approx. | ~685 | ~-20 |
| Ehrendingen Post | −147.6 | 71.7 |
| Höhtal | −455.1 | 800.3 |
| Schulhaus Lägernbreite | 87.3 | 253.6 |
| Kapelle St. Anna | 509.0 | −754.2 |
| Tiefenwaag | 310.8 | −1210.0 |
| Unterehrendingen place | 377.2 | −995.5 |
| Oberehrendingen place | 26.2 | 127.2 |
| Lägern ridge (label) | 155.2 | 1699.5 |

## Design

### Region selection (the main decision)

One pure module, `prototype/regions.js`, holds a `REGIONS` table:

```js
hochrhein:   { id, name: 'Hochrhein',   world: '../data/world_hochrhein.json',   terrain: '../data/terrain_hochrhein.mmh',
               idbKey: 'terrain',             bestKey: 'mm.best2',             strings: { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' },
               villages: VILLAGES,             gemeinden: GEMEINDEN,             landmarks: LANDMARK_INFO,
               treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true }
ehrendingen: { id, name: 'Ehrendingen', world: '../data/world_ehrendingen.json', terrain: '../data/terrain_ehrendingen.mmh',
               idbKey: 'terrain:ehrendingen', bestKey: 'mm.best2.ehrendingen', strings: { intro: 'introEhrendingen', finished: 'finishedEhrendingen', blurb: 'blurbOsmEhrendingen' },
               villages: VILLAGES_EHRENDINGEN, gemeinden: GEMEINDEN_EHRENDINGEN, landmarks: LANDMARK_INFO_EHRENDINGEN,
               treeBox: [-1520, 1840, -2225, 2065], forestAbove: 90, handFallback: false }
```

- `regionFromQuery(search)` → a region id: `?region=<id>`, case-insensitive. A missing or unknown id gives `'hochrhein'`.
- `regionSearch(search, id)` → the new query string. It keeps every other parameter (`?vehicle`, `?debug`) and drops `region` for the default, so the plain URL stays the plain game.
- **Start screen:** a new row under Start/Style, `Region: [Hochrhein] [Ehrendingen]`. The active one is marked (`aria-pressed="true"`, class `on`). Clicking the other one sets `location.search = regionSearch(location.search, id)`, which reloads the page into that region. A reload is the simplest correct switch: the whole world (merged meshes, grids, terrain mesh) is built once at module top level, and rebuilding it in place is a refactor with no player benefit. The label is a new string `region` (en "Region", de "Region"). Region names are proper nouns and are not translated.
- **Fallback:** if a non-default region's world file does not load, the game loads Hochrhein instead, sets `window.__mm.region = 'hochrhein'`, and shows the toast `regionMissing(name)`: en "No data for {name} yet — showing Hochrhein", de "Für {name} gibt es noch keine Daten — Du siehst den Hochrhein". The hand-traced layout is Hochrhein-only (`handFallback`), so it is never shown under another region's name.
- `window.__mm.region` exposes the active id for tests.

ASCII wireframe of the start-screen panel (the new row only; everything else unchanged):

```
┌──────────────────────── panel ────────────────────────┐
│ Codename Rhyflitzer · Prototype v0.2                  │
│ MAP MADNESS                                           │
│ <intro text of the active region>                     │
│ … keys …                                              │
│ [ Start ]  [ Style: Original ]                        │
│ Region:  [■ Hochrhein ]  [ Ehrendingen ]              │  ← new .regionrow
│ [Load terrain (.mmh)] [Use made-up]  Terrain: …       │
│ <blurb of the active region>                          │
└───────────────────────────────────────────────────────┘
```

### Per-region wiring in the game

| Place | Change |
|---|---|
| data URLs, IDB key, best key | from `REGION` |
| `intro`/`finishedText`/`blurbOsm` | `tr(REGION.strings.*)`; new keys `introEhrendingen`, `finishedEhrendingen`, `blurbOsmEhrendingen` in en and de |
| `mode`, `map` | become functions of the region name (`mode: (r) => \`Time trial · ${r}\``). Their elements lose `data-i18n` and are filled in `applyStaticStrings` with `tr('mode', REGION.name)` / `tr('map', REGION.name)` |
| `VILLAGES` | `REGION.villages` |
| J list | `landmarkEntries(REGION.landmarks, …, REGION.gemeinden)`, `gemeindenOf(entries, REGION.gemeinden)`; both get the `gemeinden` parameter with default `GEMEINDEN`, so existing callers and tests are unchanged |
| trees | scatter in `REGION.treeBox`, forest when `th > REGION.forestAbove` |
| `sisselnWald` | the hand box only when `!L`; with a world, only the anchor area (absent → no extra forest) |
| `RAMP` | with a world but no `jumpRamp` anchor, `RAMP = null`. `groundH`, `rampMesh`, `jumpToRamp`, `__mm.ramp`/`rampGap` and the J entry guard on it. Ehrendingen has no ramp (it has no `ramp` J entry) |
| made-up terrain | when `REAL` is null and the region is not `handFallback`, `baseH` returns 0 (flat), not the Rhine-valley shape |

Hochrhein values are exactly today's constants, so the default game is unchanged.

### Pipeline: the Ehrendingen region

- `geo.py`: `EHRENDINGEN_BBOX = (8.322, 47.476, 8.366, 47.515)` and `EHRENDINGEN_ORIGIN = (47.4948, 8.3419)` (the village place node, rounded). The bbox is the Gemeinde's bounds plus margin: ~250 m north of the Böndlern buildings, with the Lägern ridge inside on the south. It is 3.3 × 4.3 km (14.4 km², a third of Hochrhein). Grid at 4 m: 844 × 1095 (`x0` −1528, `z0` −2268).
- `terrain.py`: no code change. It runs with `--bbox/--origin` for Ehrendingen, `--step 4` (explicit, so a later change of the default by #19 does not move it) and `--base 405` (about the Surb at Böndlern, so the valley floor is near 0 and the Lägern ridge is about +450).
- `pipeline/anchors_ehrendingen.json` (new):
  - landmarks: `boendlern` {lonlat [8.34014, 47.50799], kind poi}, `wanderweg` {lonlat [8.35081, 47.49498], kind poi}, the junction of Hofrain and Steinbuckweg, `gemeindehausUnterdorf` {lonlat [8.35008, 47.50105], kind poi}. It is lonlat rather than `osm: n323236524` because a townhall node is not a named node (`osm_read._is_named_node`, `osm_read.py:20-25`);
  - start Ehrendingen Post, lonlat [8.33993, 47.49417], heading 270 (north);
  - cps: Höhtal, Breitwies, Schulhaus Lägernbreite, Kapelle St. Anna, Tiefenwaag (lonlat each);
  - finish "Im Böndlern" lonlat [8.34014, 47.50799];
  - labels `UNTEREHRENDINGEN`, `OBEREHRENDINGEN`, `IM BÖNDLERN`, `LÄGERN`;
  - `keep_buildings`: the two churches, Kapelle St. Anna, Mehrzweckhalle Lägernbreite, MGS Naturstein, ARA Ehrendingen;
  - `trails`: the eight `highway=track` ways of Hofrain and Steinbuckweg, `w28183399`, `w685318985` (Hofrain, track), `w685318986`, `w28183458`, `w702208313`, `w347967817`, `w702208308`, `w702208309` (Steinbuckweg, track). The two residential Hofrain ways (`w27259993`, `w235008971`) are ordinary streets, already kept by the road filter, and are not listed.
- **Trails** (no new module): `world_roads.build(..., trail_ids=frozenset())` keeps a way whose id is in `trail_ids` even when `keep()` says no (track, path, footway; still not tunnels). Such a way gets width 3.0, mark `none` and `"trail": true`. `anchors.trail_ids(spec)` parses the `w…` way refs of the `trails` key. `osm.build_world` passes them in. Hochrhein's `anchors.json` has no `trails` key, so its world is unchanged.
- **Game side of trails:** `layoutFromWorld` maps `r.trail` to `tex: 'gravel'`. The road ribbon (`index.html:884`) draws `tex === 'gravel'` with the existing `gravel` texture and flat colour (`TEX.gravel`, `:300`; flat `gravel: '#c9bda6'`). Trails are ordinary `ROADS`, so they are drivable, the autopilot and J can use them, and the minimap draws them in a lighter colour.
- **Villages and J list (game data):**
  - `VILLAGES_EHRENDINGEN`: UNTEREHRENDINGEN (377.2, −995.5, r 450) and OBEREHRENDINGEN (26.2, 127.2, r 450);
  - `GEMEINDEN_EHRENDINGEN = ['Ehrendingen']`;
  - `LANDMARK_INFO_EHRENDINGEN`: Im Böndlern (anchor), ARA Ehrendingen (building 178797287), Wanderweg (anchor), Kath. Kirche Ehrendingen (114544595), Reformierte Kirche Ehrendingen (114544599), Kapelle St. Anna (102158022), Mehrzweckhalle Lägernbreite (178797165), Gemeindehaus Unterdorf (anchor).

### Where the data build runs

| Step | Where | Why |
|---|---|---|
| `osm.py cut --bbox EHRENDINGEN_BBOX` from the cached `switzerland-latest.osm.pbf` → `ehrendingen.osm.pbf` | **odroid-plus-pve** (throwaway LXC, as for the first Hochrhein cut) | `-s smart` peaked at 3.58 GB; the agent box cap is 2 GB and must not be raised |
| `terrain.py` (swissALTI3D via the free STAC API, ~20 tiles) | agent box, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0` | small grid (3.7 MB raw); no credentials, no cost |
| `osm.py build … --dsm-heights cache` (swissSURFACE3D, ~20 tiles, free) | agent box, same cap; exit 137 → move to odroid-plus-pve, never raise the cap | the Hochrhein build of a larger region ran under this cap |

All of it runs in the one guarded local task of the plan, never on a CI runner, which has no caches. No step costs money or needs new credentials.

## Assumptions (quick mode — no human was asked)

- **A1** [high] **Separate region, chosen by URL parameter plus a start-screen row, with a reload.** Evidence: `?vehicle`/`?debug` are the existing switches (`vehicle.js:3-6`, `debug.js:5-8`). The root page forwards the query (`index.html:9`). The world is built once at top level (`index.html:409-412`, merged meshes at `:1074`). Rejected: an entry in the J list (J moves the car within one loaded world; jumping 30 km between two worlds would need an in-place rebuild); only a URL parameter (players would never find it); an in-place world swap (a refactor of the whole module).
- **A2** [high] **Hochrhein stays the default and unchanged**, with the same IndexedDB key `'terrain'` and best key `'mm.best2'`, so existing players keep their uploads and records. Evidence: `index.html:409,1386`.
- **A3** [high] **"the Wanderweg" = Hofrain / Steinbuckweg**, confirmed by the user 2026-10-09 (this replaces the earlier [low] guess, the yellow village trail to Unter Eich `r5185510`, `r5185484`, `r5185509`). OSM probe, 2026-10-09: the two names make one lane of ten ways, west to east and up the slope: Hofrain `w27259993` (residential, asphalt), `w235008971` (residential, asphalt, 26 nodes, 47.5012 N to 47.4980 N), then `w28183399` (track, pebblestone), `w685318985` (track, fine gravel), then Steinbuckweg `w685318986` (track, fine gravel), `w28183458` (track, compacted, 19 nodes), `w702208313` and `w347967817` (track, asphalt, 2 nodes each), `w702208308` (track, compacted), `w702208309` (track, compacted, `motor_vehicle=forestry`, ends at 8.3621 E, 47.4884 N). They connect end to end; the lane starts at Hofrain in Oberdorf (8.3488 E, 47.5014 N) and runs about 1.5 km south-east to the woods.
  - Made drivable as a gravel trail: the residential Hofrain ways are already roads; the eight `highway=track` ways are listed in `trails` and kept as 3 m `trail` roads. This is what the Wanderweg feature covers. The first draft's idea of listing `route=hiking` relations is dropped: the lane is a pair of named streets and tracks, so the ways are listed directly.
  - Its J entry (`wanderweg`) is the junction of Hofrain and Steinbuckweg (8.35081 E, 47.49498 N), on the lane itself.

  A human who meant another lane edits `trails` and the `wanderweg` anchor in `anchors_ehrendingen.json`.
- **A4** [high] **Im Böndlern = the Böndlern commercial area by the ARA** (`w54804175` and Böndlern 2–7). Evidence: the only "Böndler*" names in the Gemeinde (probe); the issue's "Im" is the usual Swiss field-name form.
- **A5** [med] **Bbox W 8.322 / S 47.476 / E 8.366 / N 47.515, origin at the village node.** Evidence: Gemeinde bounds (probe). Rejected: a box flush on the Gemeinde (Böndlern would sit 500 m from the rim, and the Lägern summit would be cut); a bigger box including Niederweningen (another canton and data with no ask behind it).
- **A6** [med] **Terrain base 405 m, forest above +90 m, tree scatter box from the bbox.** Today's rule `th > 18` assumes a base at the Rhine (`index.html:1029`, `terrain.py:50`). In Ehrendingen, Oberehrendingen sits ~35–60 m above the Surb and would be forest. +90 (≈ 495 m a.s.l.) starts the forest at the foot of the Lägern slope. Rejected: one global threshold (it changes Hochrhein); OSM forests (#13, a separate issue).
- **A7** [high] **5 checkpoints** (Höhtal, Breitwies, Schulhaus Lägernbreite, Kapelle St. Anna, Tiefenwaag), **start Ehrendingen Post, finish Im Böndlern.** The race code hard-wires 5 (`index.html:102,1396`). The finish puts the issue's named place at the end of the race. Rejected: making the checkpoint count data-driven (no ask behind it).
- **A8** [high] **OSM cut on odroid-plus-pve from the cached 2026-09-29 Swiss extract**, with the same command as Hochrhein. Evidence: the 3.58 GB peak (`docs/11-pipeline-osm.md`), and the pipeline's own rule "never uses the public Overpass API" (`osm.py:10`). Rejected: an Overpass download as build input (against the pipeline's rule and not reproducible); `-s simple` under the 2 GB cap (the bitmap peak does not depend on the strategy, and `simple` leaves multipolygons incomplete).
- **A9** [med] **No ramp, no hero models, no Ortstafeln in Ehrendingen.** Every hand-built model is keyed to a Hochrhein anchor. New Ehrendingen landmarks are position-only J targets. Rejected: building models for the churches (Fable design work, its own issue).
- **A10** [high] **Region switch reloads the page.** A running race is abandoned, as with the main-menu button (`index.html:1409`).

No ⛔ blocked items: no step spends money, needs credentials, deletes data or changes a public interface. The new URL parameter is additive.

## Consequences

- The start screen gains a row, and every player sees "Ehrendingen" as a choice.
- Best times are kept per region. The Hochrhein record stays where it is.
- A player who uploaded their own `.mmh` keeps it for Hochrhein only. Ehrendingen always starts from its bundled terrain, unless they upload one while in Ehrendingen.
- `data/` grows by two files (estimate: world ~1.5–2.5 MB raw / ~0.3–0.5 MB gzip; `.mmh` 3.7 MB raw). The Hochrhein first load is unchanged, because nothing is fetched for a region that is not chosen.
- Trails become a world feature. Any later region can list way ids to keep as drivable trails, and Hochrhein could too (not in this change).
- If #19 (region extension) lands first or later, nothing collides. #127 adds new constants and files and never touches `DEFAULT_BBOX`, `anchors.json` or the Hochrhein data. #19's golden tests and #127's Ehrendingen golden tests are independent.
- The heli (F) can fly up to the Lägern ridge (~+450 m). The 4200 m far plane covers the whole 4.3 km box from its middle.
- Ehrendingen has no Rhine, so the water toasts and splash only happen in the Surb and ponds (water polygons may be empty; `world_water.sdf` handles that, `world_water.py:131-140`).

## Testing

- **Pipeline unit (`pipeline/tests/`):**
  - `test_geo_mmh.py`: `grid_for(EHRENDINGEN_BBOX, Frame(*EHRENDINGEN_ORIGIN), 4.0) == {x0 −1528, z0 −2268, w 844, h 1095}`;
  - `test_trails.py` (fixture `fixtures/trails.osm`): `world_roads.build` keeps a `track` in `trail_ids` with `trail: true`, width 3, mark `none`, keeps dropping it otherwise, and still drops a trail tunnel;
  - `test_anchors.py`: `trail_ids` parses `w…` refs, empty without the key; `anchors_ehrendingen.json` resolves `boendlern`, `wanderweg`, start, 5 cps and finish by lonlat.
- **Golden Ehrendingen** (`test_golden_ehrendingen.py`, skips unless `pipeline/cache/osm/ehrendingen.osm.pbf` exists):
  - `bbox == EHRENDINGEN_BBOX`;
  - road `54804175` present;
  - ≥ 1 trail road within 30 m of `wanderweg`;
  - the kept buildings present;
  - 400 < buildings < 2500;
  - written size ≤ 4 MB.
- **Node (`prototype/tests/*.test.mjs`):**
  - `regions.test.mjs`: `regionFromQuery` (default, case, unknown); `regionSearch` (keeps `vehicle`/`debug`, drops `region` for the default); every region has all fields; each region's `strings` keys exist in `STRINGS.en`;
  - `landmarks.test.mjs`: the `gemeinden` parameter and the Ehrendingen tables;
  - `strings.test.mjs` (existing parity checks cover the new keys);
  - `world.test.mjs`: `layoutFromWorld` gives `tex: 'gravel'` for trail roads.
- **Browser (`prototype/tests/test_region.py`, foreground, under the memory cap):**
  - no parameter → `__mm.region === 'hochrhein'`, the Hochrhein button is active;
  - clicking Ehrendingen navigates to `?region=ehrendingen` and keeps `vehicle`;
  - with the Ehrendingen world routed to 404 → `__mm.region === 'hochrhein'` and the toast shows;
  - (skips unless `data/world_ehrendingen.json` exists) Ehrendingen loads `osm`, J `böndlern` + Enter lands within 80 m of Im Böndlern, and J `wanderweg` lands on a trail road.
- **Existing affected Playwright tests**, run instead of the full suite: `test_i18n.py`, `test_jump.py`, `test_village_names.py`, `test_smoke.py`, `test_tree_collision.py` (the default region must be unchanged).
- **Manual playtest** (`test-todo.md`): pick Ehrendingen on the start screen; race Oberdorf → Böndlern; drive the Wanderweg (Hofrain, then Steinbuckweg) up to the woods; check the Oberehrendingen village is not a forest; fly to the Lägern.
