# Street names, house numbers and station signs — design

Status: approved in chat 2026-10-02 · Issue #12

## Goal

Playtest 2026-10-01 asked for three orientation aids:

- The HUD names the **road the car is on**.
- Buildings carry their **house numbers**.
- The two railway stations are **labelled** ("Bahnhof Stein-Säckingen", "Bahnhof Sisseln").

Privacy: house numbers come from **OpenStreetMap only**. Nothing personal is added by hand, and the pipeline keeps nothing but the number (no names, no street, no other tags of an address node).

## Starting point (verified 2026-10-02 on `main` @ `6d29cb8`)

- Roads already export their name: `pipeline/world_roads.py:129` writes `"n": t.get("name", "")`; 1926 of 2616 roads are named. The issue text ("`name` is not exported") is out of date. The prototype only draws flat name decals on major classes (`streetNames()`, `prototype/index.html` ~L597).
- `pipeline/osm_read.py` keeps all tags on areas (buildings included) but keeps only named and prop nodes (~L95-100): plain address nodes are dropped.
- `pipeline/world_buildings.py:95` writes `id, h, roof, palette, rect, ring`; `--dsm-heights` adds `rh, hsrc`.
- Real extract: 8448 building ways carry `addr:housenumber`; there are 4348 separate address nodes. Of the 1885 buildings in the world, **1046** have their own number and **184** more get one from address nodes inside the footprint (68 footprints contain more than one node). Total ≈ **1230**.
- The Hallenbad Sissila (w170395848, `addr:housenumber=2`) is **not** a world building: it is excluded and drawn as the `hallenbad` landmark (`anchors.json`). Bodenackerstrasse 6 (w171822634) has no number on the way; four address nodes `6a`, `6b`, `6c`, `6d` lie inside it.
- Stations: `stationAt()` (~L591) draws the hand-made building at `anchors.landmarks.stationStein` / `stationSisseln` (OSM) or at two hand-traced spots; no text. No label distance culling exists anywhere.
- Rebuilding `data/world_hochrhein.json` from `main` with the build command below reproduces the committed file exactly (only `params.built` differs) — checked 2026-10-02.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Address source | `osm_read` keeps every node with `addr:housenumber` as `AddrNode(id, number, x, z)` — the number only. | Privacy: nothing but the number leaves the reader. |
| Building `addr` | Optional string field `addr` on a building. Its own `addr:housenumber` wins (a `;` list is joined like several nodes); otherwise the numbers of all address nodes **inside** the footprint (shapely `STRtree`, predicate `contains`). No number → no field. | Approved design. A node outside the outline never counts. |
| Several numbers | Distinct numbers, natural sort (leading integer, then suffix); one → as is; several → `first–last` with an en dash, e.g. `6a–6d`. | 68 footprints hold several entrances; one short label stays readable. |
| `street` field | **Not exported.** | Nothing reads it: the HUD takes the road name from the road under the car, labels show only the number. It would add ~25 KB for no feature (YAGNI) and is one more address field to justify. |
| Landmark `addr` | `anchors.resolve` also copies `addr:housenumber` of an OSM-referenced landmark area into `anchors.landmarks.<name>.addr`. Today only `hallenbad` → `"2"`. | The Hallenbad is drawn as a landmark, not a building, and is the issue's own example. |
| World size | ≈ 1230 × 13 B (`,"addr":"12"`) ≈ **+16 KB** on 2.1 MB (< 1 %). | Small, as required. |
| HUD road line | New `<div id="roadname">` directly under `#watername`, same type size, cream colour. Every 250 ms (same timer as the water name) it shows the name of the **nearest named road** whose centre line is within `w / 2 + 1 m` of the car; empty when off-road or on an unnamed road. Works in both layouts (hand roads are named too). | Approved design. |
| Pure helpers | `roadNameAt(cands, x, z, margin = 1)`, `addrLabels(buildings, landmarks)` and `pickLabels(items, x, z, maxDist = 60, maxN = 40)` go into `prototype/world.js` (pure, no three.js) and get node unit tests. | `world.js` already holds the unit-tested pure helpers. |
| House-number labels | `THREE.Sprite`s (camera-facing), 3.2 × 1.2 m, 1.5 m above the roof top (`h` + `rh`, or + 0.4 × the short side for an unmeasured gable). A fixed pool of **40** sprites; every 250 ms the labels within **60 m** of the car are picked (spatial grid, 64 m cells), nearest first, and assigned to the pool; the rest of the pool is hidden. One `SpriteMaterial` (with its `textTex`) per distinct number, cached in a `Map`. | Bounded cost: 40 draw calls max, textures made once per number. |
| Label look | Dark plate `rgba(20,23,29,.82)`, cream text `#f5efe0`, thin cream border, `700 64px "Barlow Condensed"` on a 256 × 96 canvas. | HUD palette and font. |
| Station signs | `stationAt(x, z, rot, name)` mounts a blue Swiss station board (the `'ch'` style of `signW`: `#1c5fb0`, white text and border, via `textTex`) on both long façades, 9 × 1.5 m, centred 2.9 m above the base. Names: `stationStein` → "Bahnhof Stein-Säckingen", `stationSisseln` → "Bahnhof Sisseln"; the hand layout passes the same names. | Real Swiss stations carry exactly such blue boards. |
| Test hooks | `window.__mm.hud().road`, `window.__mm.labels()` → `[{ t, x, z, d }]` currently shown, `window.__mm.stationSigns()` → `[{ t, x, z }]`. | Tests observe behaviour, not internals. |
| RNG | No new code calls `rr()`/`rnd()`. | The seeded RNG sequence (house colours, trees) must not shift. |
| World rebuild | `cd pipeline && python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache`. Needs the local caches (`pipeline/cache/osm/hochrhein.osm.pbf`, `pipeline/cache/swisssurface3d/*.tif`, `pipeline/cache/swissalti3d/*.tif`). If any is missing (e.g. on a CI runner), **stop and report**; never commit a world built without `--dsm-heights`. A guard checks that the rebuilt world equals `main`'s except `params.built`, `buildings[].addr` and `anchors.landmarks.*.addr`. | Measured heights (#17) must not be lost. |
| Changelog | One player-voice line under `[Unreleased]` → `Added`. | Player-visible feature. |

## Out of scope

- Street names on more road classes or 3D street signs at junctions.
- A `street` field, postcodes, building names, shop names.
- Labels for other landmarks than those with an OSM number (today: the Hallenbad).
- i18n of the new text: road and station names are proper names; there is no new UI string.
- A setting to switch labels off.

## Tests

1. **Pipeline unit:** `osm_read` keeps address nodes with the number only; `world_buildings`: number on the outline; address node inside the outline; node outside → no `addr`; own number wins over nodes; several nodes → `6a–6d`; a `;` list. `anchors`: a landmark area with a number gets `addr`.
2. **Golden** (real extract, skips without it): w171822634 → `6a–6d`, w155482787 → `438`, w171822862 → `5`, `anchors.landmarks.hallenbad.addr == "2"`, 1100–1400 buildings with `addr`.
3. **Prototype unit** (`node --test`): `roadNameAt`, `addrLabels`, `pickLabels` (60 m, nearest first, cap 40).
4. **Smoke** (Playwright): HUD shows "Hauptstrasse" on a Hauptstrasse segment and nothing in the Rhine; labels appear within 60 m and vanish far away (world served with `addr` patched in, so the test does not depend on the rebuild); both station signs exist in both layouts, at their station.
5. All existing tests stay unchanged and green.

## Acceptance criteria

- [ ] `osm_read` keeps address nodes as `AddrNode(id, number, x, z)`; no other address-node tag is kept.
- [ ] World buildings carry an optional `addr` string: own `addr:housenumber` first, else the address nodes inside the footprint, joined `first–last`; never from a node outside the footprint; no `street` field.
- [ ] `anchors.landmarks.hallenbad.addr == "2"` in the rebuilt world.
- [ ] Pipeline unit tests and golden tests for `addr` pass (golden: `6a–6d`, `438`, `5`, Hallenbad `2`, 1100–1400 numbered buildings).
- [ ] `data/world_hochrhein.json` is rebuilt **with** `--dsm-heights`, and differs from `main` only in `params.built`, `buildings[].addr` and `anchors.landmarks.*.addr`; size increase < 50 KB. (Or, without the caches: not rebuilt, and the PR says so.)
- [ ] The HUD shows the name of the road under the car in a new line under the water name, refreshed every 250 ms, empty off-road or on unnamed roads; `__mm.hud().road` exposes it.
- [ ] House numbers float as camera-facing labels over buildings within 60 m of the car, at most 40 at once, textures cached per number; `__mm.labels()` lists them.
- [ ] Both stations carry a blue "Bahnhof Stein-Säckingen" / "Bahnhof Sisseln" board in the OSM and the hand-traced layout; `__mm.stationSigns()` lists them.
- [ ] Node unit tests and the new smoke tests pass; all existing tests pass unchanged.
- [ ] Manual playtest: road name changes when turning into another street, numbers pop in/out around the car without stutter, station boards readable; empty console.
- [ ] One player-voice line in `CHANGELOG.md` under `[Unreleased]` → `Added`.
- [ ] No framework, no build step; no new file except `prototype/tests/test_street_labels.py`.
