# Region south to Flugplatz Schupfart (#47) — design

Status: re-enriched 2026-10-10 after the maintainer re-scoped #47 to **"south only, no German tiles"** and split it
out of the #19 batch. #19 (east, Laufenburg) and #44 (west, Rheinfelden) stay together under
`2026-10-03-region-extension-design.md`; that spec's decisions D1/D2 still apply where this one reuses them.

## Goal

Move the Hochrhein region's **south edge** from 47.532 N to **47.500 N**, so Flugplatz Schupfart (OSM `r2782819`,
LSZI, up on the Tafeljura) is on the map, is a landmark anchor, and is a **J** jump target under a new
**Schupfart** chip. West, east and north edges stay where they are. All new ground is Swiss: terrain from
swisstopo swissALTI3D (already used), building heights from swissSURFACE3D (already used), no LGL DGM1.

Success:

- `geo.DEFAULT_BBOX = (7.905, 47.500, 8.030, 47.572)`; the old box survives as `geo.CORE_BBOX`; origin unchanged.
- One OSM cut (on odroid-plus-pve, by a human), one terrain build and one world build give new
  `data/terrain_hochrhein.mmh` and `data/world_hochrhein.json` inside the D2 budget.
- The core area comes out unchanged: the existing golden tests, switched to `CORE_BBOX`, pass with their numbers.
- **J** → `schupfart` lists *Flugplatz Schupfart* (chip *Schupfart*) and drops the car on a road beside the airfield.

## Starting point (verified 2026-10-10 on `main` @ `2f8ddf2`)

- `pipeline/geo.py:14` `DEFAULT_BBOX = (7.905, 47.532, 8.030, 47.572)`, `DEFAULT_ORIGIN = (47.5506, 7.9671)`.
  `terrain.py`, `osm.py cut` and `osm.py build` default to it; the world clip, the water SDF and the prototype's
  16 m ground mesh (`TGRID`, `prototype/index.html:578`) all follow the world file, so the prototype needs no
  size constant changed.
- `terrain.py` default `--step 4.0`. Today's `.mmh`: 2362 × 1130 at 4 m, 10.7 MB raw, 6.1 MB gzip.
  Today's world JSON: 2.7 MB raw, 0.53 MB gzip (`waterSdf` 0.87 MB, buildings 0.53, roads 0.47, parking 0.45).
- `pipeline/cache/osm/hochrhein.osm.pbf` (3.7 MB) is the `-s smart` cut of the **2026-09-28** Geofabrik
  `switzerland-latest` + `freiburg-regbez-latest` files (newest object 2026-09-28T16:10Z), padded 2 km, so its
  data stops at about 47.514 N. **No cached small extract covers the strip:** `ch.osm.pbf`, `de.osm.pbf` and
  `region.osm.pbf` end at 47.525 N (and are the incomplete files of the 2026-09-29 incident).
- `osm.py cut` = `osmium extract -s smart` per country file + `osmium merge`; peak 3.58 GB, so it runs on
  odroid-plus-pve only (docs/11, "Second region"). `osm_cut.py` (#166) is the 2 GB-safe four-step cut for
  generated worlds; it peaks at ~1.9 GB on the Swiss file.
- The J list (`prototype/landmarks.js`) has 28 entries and `GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen',
  'Eiken', 'Sisseln']`; chips are built only for Gemeinden that have an entry in the loaded world
  (`gemeindenOf`, `index.html:1990`). Village names (#16) are the hand list `VILLAGES` in `prototype/world.js:558`.
- `anchors.resolve` accepts `lonlat` (`pipeline/anchors.py:50-52`); labels too. `osm_read.AREA_KEYS` has no
  `aeroway`, so `r2782819` cannot be an `osm` anchor.

## Probe results (capped, read-only, 2026-10-10)

`osmium tags-filter -R` (46 MB peak) and `osmium getid -r` (196 MB peak) on the cached Swiss file, under
`MemoryMax=1G`:

- **The strip is entirely Swiss.** The admin_level 8 polygons of Eiken, Frick, Gipf-Oberfrick, Hellikon, Kaisten,
  Münchwilen, Obermumpf, Oeschgen, Schupfart, Wegenstetten and Zuzgen cover 100.1 % of the box
  7.905–8.030 E × 47.500–47.532 N. The Rhine border is 2 km north of the old edge. **No German terrain or OSM
  data is needed for it.**
- **Flugplatz Schupfart** `r2782819` (aerodrome, ICAO LSZI): bounds 7.9458–7.9541 E × 47.5079–47.5102 N,
  centroid 7.95044 / 47.50893. It lies inside **Gemeinde Schupfart** (`r1684421`). The south edge 47.500 leaves
  0.9 km of margin.
- **Place nodes that enter the map:** Eiken `n191017634` (47.5313, just outside today), Obermumpf `n1420719124`,
  Oeschgen `n240041868`, Schupfart `n240030566`, Hellikon `n1592994106`, Frick `n191017638` (8.0203 / 47.5075).
  Wegenstetten (47.4995) and Gipf-Oberfrick (47.4975) stay just outside.
- Gemeinden with land in the strip (share of the strip): Schupfart 20 %, Frick 20 %, Hellikon 15 %, Oeschgen 11 %,
  Obermumpf 9 %, Zuzgen 7 %, Gipf-Oberfrick 6 %, Eiken 6 %, Wegenstetten 4 %, Münchwilen 2 %, Kaisten 0.2 %.

## Design

### Edges

`DEFAULT_BBOX = (7.905, 47.500, 8.030, 47.572)`: S from D1 (the confirmed edge), W/E/N unchanged.
`CORE_BBOX = (7.905, 47.532, 8.030, 47.572)` keeps the golden tests on the old area. The map grows from
9.4 × 4.4 km (41 km²) to 9.4 × 8.0 km (75 km², × 1.8). Game clip: x −4689…4777, z −2350…5592.

### Terrain step and budget

| | today (4 m) | south, 4 m | **south, 8 m (D2 step)** |
|---|---|---|---|
| `.mmh` grid | 2362 × 1130 | 2369 × 2019 | **1186 × 1010** |
| `.mmh` raw / gzip | 10.7 / 6.1 MB | 19.1 / ~10.9 MB | **4.8 / ~2.7 MB** |
| water SDF | 0.87 MB | ~1.56 MB | ~1.56 MB |
| world JSON raw (est.) | 2.7 MB | 4.5–5.5 MB | 4.5–5.5 MB |

The step becomes **8 m**, as D2 confirmed for the region extension (the game draws a 16 m mesh). 4 m would break
D2's `.mmh ≤ 13 MB raw`. The world estimate: SDF scaled by height, the rest +45–60 % for Frick (~5,800
inhabitants), Oeschgen, Schupfart, Obermumpf, Hellikon and the Eiken village core. Well inside D2's 12 MB.

Risk: the core terrain is resampled at 8 m. Seven browser suites load the real `.mmh`
(`test_fridolinsbruecke`, `test_hideout`, `test_underpass`, `test_shadow`, `test_sound`, `test_wheels`,
`test_region`). If one of them fails on the 8 m terrain but passes on `main`, the implementation **stops and asks**
the maintainer (fallback: 4 m, which keeps the core samples bit-identical because the grid origin does not move,
at 19.1 MB raw).

### OSM cut (human, odroid-plus-pve)

Re-run the documented `osm.py cut` on odroid-plus-pve with the **cached 2026-09-28** `switzerland-latest` and
`freiburg-regbez-latest` files and `--bbox 7.905 47.500 8.030 47.572` (padded 2 km → 7.878–8.057 E ×
47.482–47.590 N). The German file is still needed because the result replaces the whole extract, north bank
included; no new German data is added. Same snapshot → the core's objects are identical, the core golden tests
keep their numbers. The human copies the result back as `pipeline/cache/osm/hochrhein-south.osm.pbf`.

### Landmarks, J list, names

- `anchors.json`: `flugplatzSchupfart` `{ "lonlat": [7.9505, 47.5090], "kind": "poi" }` (the airfield centroid;
  `kind: poi` draws nothing) and a `SCHUPFART` label at the place node.
- `landmarks.js`: `GEMEINDEN` gains `Schupfart` between `Münchwilen` and `Eiken` (west → east by place node);
  one entry `{ name: 'Flugplatz Schupfart', gemeinde: 'Schupfart', anchor: 'flugplatzSchupfart' }`. The chip
  appears only once the rebuilt world carries the anchor.
- `world.js` `VILLAGES` gains the six place nodes that now lie inside the map (EIKEN, OBERMUMPF, OESCHGEN,
  SCHUPFART, HELLIKON, FRICK), r = 450 like the other villages.
- If the airfield's hangars are dropped by the 30 m main-road rule, their footprints go into `keep_buildings`
  (the #46 mechanism), so the airfield is recognisable.

### Not in scope

German terrain (DGM1), the west/east edges, a runway model, J entries for Frick or other new villages, the lone
tree scatter box (`regions.js` `treeBox`), mesh chunking.

## Assumptions

- **A1** [high] S edge 47.500 (D1, confirmed 2026-10-03). Evidence: airfield south edge 47.5079 → 0.9 km margin.
  Rejected: 47.495 to take in Wegenstetten and Gipf-Oberfrick (+0.6 km of mostly forest, more size, not asked).
- **A2** [med] Terrain step 8 m, following D2. Rejected: 4 m (19.1 MB raw, breaks D2), 6 m (not a D2 option).
  Guarded by the real-terrain browser suites; on failure the implementer stops and asks.
- **A3** [high] One full re-cut on odroid from both cached country files. Rejected: a Swiss-only strip cut merged
  into the old extract (saves copying the 159 MB German file, but an ad-hoc merge path nobody has run, and
  `osmium merge` is only safe for one snapshot); `osm_cut.py` on agent-dev (≈1.9 GB on the 547 MB file, against
  the rule never to cut country files on agent-dev); fresh Geofabrik downloads (data drift moves every core count).
- **A4** [high] Airfield = `lonlat` anchor at the relation centroid, not `osm: r2782819` (`aeroway` is not an
  area key; adding it pulls runways and aprons into `data.areas`).
- **A5** [high] Gemeinde of the airfield = Schupfart (point-in-polygon against `r1684421`, probe above).
- **A6** [med] Village names for the six new place nodes. Rejected: none (the strip would be the only part of
  the map without names); J entries for them (not asked).
- **A7** [med] `treeBox` stays `[-3100, 3100, -1800, 1900]`: the strip gets OSM forests but no lone field trees.
  Rejected: a bigger box (halves the scatter density in the core, a visible change nobody asked for).
- **A8** [high] Local implementation: the cut extract, the swisstopo tile caches and the world rebuild exist only on
  agent-dev; a CI runner would skip every golden test and could not rebuild the data.

## Consequences

- The core terrain is 8 m instead of 4 m; water-level medians may move by centimetres. The first load gets
  smaller (≈ 2.7 + 1 MB gzip instead of 6.1 + 0.5 MB).
- Heights now reach the Tafeljura: the airfield sits at about 545 m a.s.l., ≈ +260 m over the 284 m base, and the
  hilltops around it are higher.
- The minimap at 1× shows the taller map, so it is less detailed per metre; the zoom levels carry more weight.
- "Random spot" and the autopilot/Navi can now pick roads in the strip; the race is unchanged.
- A player with an old `.mmh` in IndexedDB keeps the old terrain size until they reload a new one; outside it the
  strip falls back to made-up hills.
- swisstopo downloads on the build box: ~30 more swissALTI3D tiles (~35 MB) and ~30 more swissSURFACE3D tiles
  (~400 MB).
- #19/#44 later widen W/E from this box: their `DEFAULT_BBOX` keeps S 47.500, `CORE_BBOX` already exists, the 8 m
  step is already the default, and the Schupfart anchor, label and J entry are already in (see #19's body).
