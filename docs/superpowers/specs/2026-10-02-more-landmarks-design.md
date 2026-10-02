# More landmarks for the J list — design

Status: approved in headless enrichment (`/enrich 46 --headless`) 2026-10-02 · Issue #46 · builds on #41

## Goal

Nine more real landmarks in Bad Säckingen, Eiken and Sisseln show up in the J dialog's searchable landmark list (#41), each with its Gemeinde, and the car can jump to them. The buildings they stand on also show up in the 3D world.

## Starting point (verified 2026-10-02 on `main` @ `236cc61`, against `pipeline/cache/osm/hochrhein.osm.pbf` and `data/world_hochrhein.json`)

- #41 (PR #52, branch `feature/41-jump-landmark-list`, **not merged yet**) adds `prototype/landmarks.js`. Its `LANDMARK_INFO` entries reference **either** an anchor key (`anchor: 'muenster'`) **or** a world building id (`building: 171822634`, position = mean of the footprint `ring`). An entry whose source is missing from the loaded world is skipped. `landmarkEntries` sorts by `GEMEINDEN` (west → east) and then by array order.
- Building selection is in `pipeline/world_buildings.py` `build()`. A building is kept only if it is within `house_dist` (30 m) of a main road, inside a `keep_all_buildings` area box, or ≥ `big_area` (1000 m²). `exclude_ids` (from `anchors.json` `exclude_buildings`) drops landmark footprints. Nothing keeps one single named building today.
- `pipeline/osm.py` `build_world()` wires `anchors_mod.exclude_ids(spec)` and `anchors_mod.keep_all_boxes(...)` into `world_buildings.build`.
- The world file can only be rebuilt with the local caches (`pipeline/cache/osm/hochrhein.osm.pbf`, `pipeline/cache/swisssurface3d/*.tif`, `pipeline/cache/swissalti3d/*.tif`). A CI runner has none of them. Main's world has 1885 buildings, 1686 of them with `hsrc: "dsm"`, so a rebuild needs `--dsm-heights cache`.

### The nine landmarks in the extract

| Issue ref | OSM object | Area | Main-road distance | In world today | Gemeinde (admin_level 8, point in polygon) |
|---|---|---|---|---|---|
| Schloss Schönau / Trompeterschloss `w390621357` | building=yes, historic=castle, name "Schloss Schönau" | 372 m² | 393 m | no | Bad Säckingen |
| Gallusturm `w25835477` | building=yes, height 20 | 160 m² | 131 m | no | Bad Säckingen |
| Diebsturm `w92036948` | building=yes, man_made=tower, height 18 | 46 m² | 388 m | no | Bad Säckingen |
| Bahnhof Bad Säckingen `n313032305` | railway=station **node**. Its station building is `w25049518` (building=train_station, name "Bad Säckingen", 5.6 m from the node) | 505 m² | — | no | Bad Säckingen |
| Kursaal `n426864010` | amenity=theatre **node**. It lies inside building `w91592556` (building=public, 1330 m²) | — | — | **yes** (`91592556`) | Bad Säckingen |
| Aqualon Therme `w92039355` | building=yes, amenity=public_bath | 4141 m² | 242 m | **yes** (≥ 1000 m²) | Bad Säckingen |
| Bahnhof Eiken `w199241726` | building=train_station | 449 m² | 107 m | no | Eiken |
| Gemeindehaus Sisseln `w171822808` | building=civic, name "Gemeindehaus" | 346 m² | 109 m | no | Sisseln |
| Schulhaus Sisseln `w171822721` | building=school, name "Schulhaus" | 332 m² | 70 m | no | Sisseln |

All centroids are inside the map clip. Seven building footprints must be kept: `390621357, 25835477, 92036948, 25049518, 199241726, 171822808, 171822721`. Kursaal and Aqualon already stand in the world.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| How a building is kept | New top-level list `keep_buildings` in `pipeline/anchors.json` (OSM refs like `"w390621357"`, same shape as `exclude_buildings`). A new `anchors.keep_ids(spec) -> set[int]` reads it. `world_buildings.build(..., keep_ids=frozenset())` keeps those footprints regardless of main-road distance and area. They still go through the type skip, `exclude_ids`, the degenerate check, the 20 m² minimum and the clip. New stat `kept_landmark`. | Mirrors `exclude_buildings`, so this is one more list rather than a new mechanism. The buildings stay ordinary world buildings with height, roof, palette and house number. |
| Where the J entries' positions come from | `LANDMARK_INFO` entries with `building: <way id>` (the #41 pattern of the Bodenackerstrasse houses). No new `anchors.landmarks` entries. | `anchors.landmarks` entries carry a `kind` that drives 3D landmark models. These are plain buildings, and the footprint mean is the right jump target. |
| Nodes in the issue | Bahnhof Bad Säckingen uses its station building `25049518`. Kursaal uses `91592556`, the building that contains the node. | Uses one position source (buildings) and gives a visible building at the target. |
| Names (German proper nouns) | `Schloss Schönau (Trompeterschloss)`, `Gallusturm`, `Diebsturm`, `Bahnhof Bad Säckingen`, `Kursaal`, `Aqualon Therme`, `Bahnhof Eiken`, `Gemeindehaus Sisseln`, `Schulhaus Sisseln` | The search is a substring match on the name, so `trompeter` and `schönau` both find the castle. The village suffix tells the Sisseln buildings apart from those of other Gemeinden. |
| Order in `LANDMARK_INFO` | Each new entry goes at the end of its Gemeinde's block: the six Bad Säckingen entries after `Fridolinsbrücke`, Bahnhof Eiken after `Bahnhof Sisseln`, the two Sisseln entries after `Sprungschanze`. | Existing rows keep their positions, and the list reads naturally. |
| Gemeinde chips | Unchanged. All new Gemeinden are already in `GEMEINDEN`. | |
| Look | No special model, colour or label. The kept buildings render like every other world building. | Out of scope. A model is its own issue. |
| Without a rebuilt world | The seven kept-building entries are skipped by `landmarkEntries` (existing behaviour). Kursaal and Aqualon show at once. | No crash, and the list degrades gracefully. |

## Rebuild

The world rebuild is a guarded task. It runs only if the caches are present, always with `--dsm-heights cache`, and always under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. The rebuilt world may differ from `main`'s in three ways only:

- the seven new buildings, all present;
- `params.built`;
- house numbers of neighbouring buildings, where an address node is now matched to one of the new footprints. Any such change is printed and reviewed.

Everything else must be equal. No `osmium` cut is needed or allowed.

## Testing

- **Pipeline unit** (`pipeline/tests/test_buildings.py`, `test_anchors.py`): a far, small building is kept only when its id is in `keep_ids`. `exclude_ids` wins over `keep_ids`. A kept 9 m² footprint is still dropped. `keep_ids` returns the int ids of `keep_buildings`, and an empty set when the key is absent.
- **Golden** (`pipeline/tests/test_golden.py`, skips without the extract): all seven ids are in `world["buildings"]`, and `91592556` and `92039355` are still there.
- **Node** (`prototype/tests/landmarks.test.mjs`): `LANDMARK_INFO` has 23 entries, and the building entries are exactly the 2 + 9 listed. The position test resolves the new Kursaal entry from a stub building.
- **Browser** (`prototype/tests/test_jump.py`): the count-dependent assertions pin both world states exactly, keyed on whether building `390621357` is in the served world (`WORLD46`):
  - `main`'s world gives 17 rows (14 + Kursaal + Aqualon + Random spot) and 6 Sisseln rows;
  - the rebuilt world gives 24 rows and 8 Sisseln rows.

  A new test needs only the current world: typing `kursaal` gives `Kursaal`, and Enter lands the car within 80 m of the footprint mean. A new test, skipped until the world is rebuilt, checks three things: `trompeter` finds the castle, the Eiken chip lists Bahnhof Eiken, and `gallus` + Enter lands within 80 m.
- Manual playtest entry in `test-todo.md`.

## Out of scope

- Feldschlösschen and Rheinfelden (#44), and region extensions (#47, #19).
- 3D models or name labels for the new landmarks.
- Any change to the J dialog UI or to `landmarkEntries`'s logic.
