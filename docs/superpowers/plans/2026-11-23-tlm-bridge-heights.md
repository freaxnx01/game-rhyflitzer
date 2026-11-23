# Bridge and Underpass Heights from swissTLM3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every TLM-matched crossing in a Swiss world takes its deck height and the height of what passes under it from swissTLM3D, via a committed CH-wide structures extract; unmatched crossings keep today's logic.

**Architecture:** A one-off script cuts a CH-wide structures file (`pipeline/tlm_structures.json.gz`) from the swissTLM3D zip. A pipeline step matches it to a world's rail decks and road bridges and writes `tlm` (deck profile) and `tlmUnder` (what passes under) into the world JSON. The game turns those into deck profiles pinned to the surfaces they join, puts rail deck ends on the measured embankment (#259 fine patches) and sets cut floors from the TLM road height.

**Tech Stack:** Python 3.12 (stdlib `zipfile`/`struct`/`gzip`, shapely), vanilla JS (`world.js`, `index.html`), `node --test`, pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-tlm-bridge-heights-design.md`

**Lands after #1152:** bridge ends attach to the smoothed road profiles. Do not start before #1152 is merged; rebase on it.

## Global Constraints

- TLM release `2026-02`; zip URL `https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_2026-02/swisstlm3d_2026-02_2056_5728.shp.zip` (3.6 GB). Layers `TLM_STRASSEN/swissTLM3D_TLM_STRASSE`, `TLM_OEV/swissTLM3D_TLM_EISENBAHN`.
- Structure filter: `KUNSTBAUTE` not in `{"Keine", "Treppe", "k_W", "in/auf Gebaeude"}`.
- Bridge kinds for matching: `{"Bruecke", "Gedeckte Bruecke", "Bruecke mit Treppe", "Bruecke mit Galerie", "Steg"}`.
- Matching: 2 m samples, 8 m axis distance, |cos| >= 0.9, piece matched at >= 50 % of samples. Under points: >= 2.5 m below the deck axis.
- Game coords: `x = E - origin.E`, `z = origin.N - N`, `y = Z - base` (Hochrhein base 284.0, from the mmh header).
- `TLM_RAIL_TOP = 0.3`, `TLM_CLEAR_MIN = 3.0`, end blend `min(8, len / 4)` m, `TLM_FINE = { inner: 16, outer: 28, r: 4 }`, partner clip 40 m.
- No new dependency (no GDAL, no npm). The 3.6 GB zip is downloaded only into a temp dir (`$RUNNER_TEMP` or `tempfile`), never into the repo, and deleted after use.
- Hero chains (`kind` `wood`/`stone` and `approach` pieces) never get TLM.
- No `tlm` key → byte-for-byte today's behaviour.
- CHANGELOG entry in German (real umlauts, `TZ=Europe/Zurich date '+%F %H:%M'`, 1-3 bold keywords); everything else in English.
- Browser verification runs in the foreground; commit and push before running it. Run only the affected Playwright files, not the full suite.

## Review Focus

- A partly matched piece (50-99 % of samples, e.g. the curved deck at (2378, 2632), 79 %): the profile must interpolate across the gap and blend to the pinned ends, not drop to 0 or jump. Test in Task 4 (`tlmProfile_gapInSamples_interpolates`).
- Two TLM roads near one game crossing (a parallel side road within 8 m): the under point must be the one closest to the crossing and of kind `road`. Test in Task 4 (`tlmUnderAt_twoCandidates_picksNearestRoad`).
- A low real underpass (TLM clearance below 3.0 m with the 1.2 m deck): the floor drops to keep 3.0 m. Test in Task 4 (`tlmFloorTarget_lowUnderpass_keepsClearMin`).
- A world without the extract or outside Switzerland (Ehrendingen built with no file, the German bank): no keys, no crash. Test in Task 3 (`test_apply_without_matches_adds_nothing`).
- Running the patch twice on a committed world: identical bytes. Test in Task 3 (`test_cli_is_idempotent`).

---

### Task 1: Dry comparison, game vs TLM, as a test fixture

No game code changes in this task. It builds the streaming reader and records today's heights next to TLM's.

**Files:**
- Create: `pipeline/tlm_read.py`
- Create: `scripts/tlm_compare.py`
- Create: `tests/fixtures/tlm_hochrhein_crossings.json`
- Test: `pipeline/tests/test_tlm_read.py`, `pipeline/tests/tlm_synth.py` (helper that writes a tiny shapefile zip)

**Interfaces:**
- Produces: `tlm_read.iter_features(zip_path, layer, bbox=None) -> Iterator[dict]` with `layer` in `{"road", "rail"}`, `bbox` = LV95 `(emin, nmin, emax, nmax)` or None; each dict `{"idx": int, "attrs": {OBJEKTART, KUNSTBAUTE, STUFE, STRNAME, NAME}, "parts": [[[E, N, Z], ...], ...]}`. `tlm_read.LAYERS = {"road": "swissTLM3D_TLM_STRASSE", "rail": "swissTLM3D_TLM_EISENBAHN"}`. `tlm_read.download(release, dest_dir) -> Path`.
- Produces: fixture `tests/fixtures/tlm_hochrhein_crossings.json`: `{"release": "2026-02", "base": 284.0, "crossings": [{"kind": "rail"|"road", "x", "z", "road", "before": {"deck", "road", "clearance", "depth"}, "tlm": {"deck", "road"} | null, "off": bool}]}`. `deck`/`road` are game heights (y). For rail, `tlm.deck` is the TLM top of rail minus `TLM_RAIL_TOP` (0.3). `off` = |before - tlm| > 1 m for deck or road.

- [ ] **Step 1: Write the failing reader tests**

`pipeline/tests/tlm_synth.py`: `write_zip(path, layer_base, records)` writes `<dir>/<layer_base>.shp` (PolyLineZ, shape type 13) and `.dbf` (fields OBJEKTART, KUNSTBAUTE, STUFE, STRNAME, NAME as C fields) into a zip. `records = [(attrs, parts)]`.

```python
def test_iter_features_reads_polylinez_and_attrs(tmp_path):
    z = write_zip(tmp_path / "t.zip", "swissTLM3D_TLM_STRASSE",
                  [({"KUNSTBAUTE": "Bruecke", "STUFE": "1", "OBJEKTART": "4m Strasse", "STRNAME": "Hauptstrasse", "NAME": ""},
                    [[(2638000.0, 1265000.0, 313.4), (2638010.0, 1265000.0, 313.6)]])])
    f = list(tlm_read.iter_features(z, "road"))
    assert f[0]["attrs"]["KUNSTBAUTE"] == "Bruecke" and f[0]["attrs"]["STUFE"] == "1"
    assert f[0]["parts"] == [[[2638000.0, 1265000.0, 313.4], [2638010.0, 1265000.0, 313.6]]]

def test_iter_features_bbox_filters(tmp_path): ...   # two records, bbox around one -> one feature, idx kept
def test_iter_features_multipart(tmp_path): ...      # nparts 2 -> two parts
```

- [ ] **Step 2: Run, expect FAIL** — `cd pipeline && python -m pytest tests/test_tlm_read.py -q` → `ModuleNotFoundError: tlm_read`.

- [ ] **Step 3: Implement `pipeline/tlm_read.py`**

Port the streaming approach the probe used (`/var/tmp/tlm3d/tlm_probe.py` on odroid-plus-pve, reproduced in the spec's design §1): read the `.shp` record by record from `zipfile.ZipFile.open` (header 100 bytes, records `>ii` + content), parse shape types 3/13/23, keep bbox hits, then read the `.dbf` (UTF-8) only for the kept indices. E/N rounded to 0.1, Z to 0.01. `download(release, dest_dir)` streams the URL from Global Constraints with `requests` (timeout 120, 1 MiB chunks) and returns the path.

- [ ] **Step 4: Run, expect PASS** — same command.

- [ ] **Step 5: Write `scripts/tlm_compare.py`**

`python scripts/tlm_compare.py --zip <zip> --out tests/fixtures/tlm_hochrhein_crossings.json`. It serves the repo (as `tests/conftest.py`'s `server` does), opens `index.html` in Playwright with the swiftshader args from `tests/test_underpass.py:12`, waits for `#mmhstatus.real` and `window.__mm.crossings`, clicks `#startbtn`, reads `__mm.crossings()` (kind rail) and `__mm.roadCrossings()` (kind road). `before.road = deck - 1.2 - clearance`. TLM side: `iter_features` on both layers with the world's LV95 bbox + 200 m; rail: nearest bridge-kind rail axis within 25 m → `tlm.deck = z - 0.3 - base`; road decks: nearest bridge-kind road axis within 25 m → `z - base`; under road: nearest non-bridge road axis with STUFE <= 0 within 10 m → `z - base` (the probe's `compare.py` rule). No match → `tlm: null`.

- [ ] **Step 6: Generate the fixture**

Download the zip with `tlm_read.download("2026-02", $RUNNER_TEMP or a mktemp dir)`, run the script, delete the zip. Expected stdout counts: 38 rail + 17 road crossings; rail with `tlm` non-null: 27; every one of those 27 has `before.deck` 1.6-6.0 m below `tlm.deck + 0.3` (the TLM top of rail) — if these numbers differ by more than one crossing, stop and report (the world changed since 2026-11-23).

- [ ] **Step 7: Add a fixture sanity test** in `pipeline/tests/test_tlm_read.py`: `test_fixture_counts` loads the fixture and asserts 38 rail, 17 road, 27 rail matched, Königsweg (4609, 5561 within 15 m) present with `before.clearance < 0`.

- [ ] **Step 8: Commit**

```bash
git add pipeline/tlm_read.py pipeline/tests/test_tlm_read.py pipeline/tests/tlm_synth.py scripts/tlm_compare.py tests/fixtures/tlm_hochrhein_crossings.json
git commit -m "test(world): record game vs swissTLM3D crossing heights as a fixture (#1151)"
```

---

### Task 2: The CH-wide structures extract

**Files:**
- Create: `pipeline/tlm_structures.py`, `pipeline/tlm_structures.json.gz`
- Modify: `service/Dockerfile.dockerignore` (add `!pipeline/tlm_structures.json.gz`), `data/README.md`, `CREDITS.md`
- Test: `pipeline/tests/test_tlm_structures.py`

**Interfaces:**
- Consumes: `tlm_read.iter_features`, `tlm_read.download`, `tlm_read.LAYERS`.
- Produces: `tlm_structures.build(zip_path) -> dict` (the `TLMS1` doc from the spec §1), `tlm_structures.SKIP`, `tlm_structures.PARTNER_CLIP = 40.0`, `tlm_structures.DEFAULT = Path(__file__).with_name("tlm_structures.json.gz")`, `tlm_structures.load(path=DEFAULT) -> dict | None` (None when the file is missing).

- [ ] **Step 1: Write the failing tests** (synthetic zips from `tlm_synth`, both layers in one zip)

```python
def test_build_keeps_structures_by_filter(tmp_path):     # Bruecke, Unterfuehrung, Tunnel kept; Keine, Treppe, k_W, in/auf Gebaeude dropped
def test_build_keeps_crossing_partner_clipped(tmp_path):  # a 400 m Keine road crossing a 20 m rail Bruecke -> partner, only vertices within 40 m of a structure vertex
def test_build_skips_non_crossing_keine(tmp_path):       # a Keine road 10 m beside a bridge, not crossing -> not a partner
def test_build_format(tmp_path):                         # {"format": "TLMS1", "release", "source": "swissTLM3D © swisstopo", "structures", "partners"}, feature keys l,k,s(int),o,n,p
def test_load_missing_returns_none(tmp_path):
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** — two passes per layer: structures first (with a 100 m grid of their segments), then partners = non-structure records with a proper 2D segment intersection against a grid cell's structure segments (the orientation test from the probe), clipped to vertices within 40 m of any structure vertex (parts with < 2 vertices dropped). CLI `--release` (default `2026-02`), `--zip`, `--out` (default `DEFAULT`); writes gzip JSON with `separators=(",", ":")`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Build the real file** — download into a temp dir, `python pipeline/tlm_structures.py --zip <zip>`, delete the zip. Expected log: road ~68 790 + rail ~8 544 structures, ~21 700 partners; file 5-6 MB (AC-1: must be < 8 MB). Peak RSS ~1 GB.

- [ ] **Step 6: Docs** — `data/README.md`: a paragraph on `pipeline/tlm_structures.json.gz` (swissTLM3D © swisstopo, OGD, attribution required, release, how to rebuild). `CREDITS.md`: `- swissTLM3D © swisstopo (https://www.swisstopo.admin.ch), Open Government Data, Quellenangabe Pflicht: bridge and underpass heights`.

- [ ] **Step 7: Commit**

```bash
git add pipeline/tlm_structures.py pipeline/tlm_structures.json.gz pipeline/tests/test_tlm_structures.py service/Dockerfile.dockerignore data/README.md CREDITS.md
git commit -m "feat(pipeline): CH-wide swissTLM3D structures extract (#1151)"
```

---

### Task 3: Match TLM to a world and annotate it

**Files:**
- Create: `pipeline/world_tlm.py`
- Modify: `pipeline/osm.py:150-180` (call after `deck_rail`, add the source line), `data/world_hochrhein.json`, `data/world_ehrendingen.json`
- Test: `pipeline/tests/test_world_tlm.py`

**Interfaces:**
- Consumes: `tlm_structures.load`, `geo.Frame`.
- Produces: `world_tlm.apply(world: dict, doc: dict, base: float) -> dict` (stats `{"rail": n, "road": n, "under": n}`); world keys per piece: `"tlm": [[t, y], ...]` (t rounded 0.1, y 0.01) and `"tlmUnder": [[x, z, y, "road"|"rail"], ...]` on `railBridges[i]` and on roads with `bridge: true`. `world_tlm.SOURCE = "Bridge heights: swissTLM3D © swisstopo"`. CLI `python pipeline/world_tlm.py --world W --mmh M [--structures P]`.

- [ ] **Step 1: Write the failing tests** (synthetic world with `origin` `{"E": 2600000, "N": 1200000}`, base 300)

```python
def test_rail_deck_matched_gets_profile():       # TLM rail Bruecke along the deck, z 310 -> tlm y == 10.0 at every 2 m sample, t from 0 to len
def test_offset_and_direction_rules():           # axis 9 m away -> no key; axis at 3 m but perpendicular -> no key
def test_half_matched_piece():                   # TLM covers 60 % of the piece -> key with only the matched samples; 40 % -> no key
def test_road_bridge_matched_against_road_layer_only():
def test_under_point_from_partner():             # Keine road crossing under the deck at z 304 -> tlmUnder [[x, z, 4.0, "road"]]; a crossing line only 1 m lower -> none
def test_hero_chain_never_matched():             # landmark holzbruecke within 15 m of the piece -> no key (same rule as index.html:1491-1492)
def test_apply_without_matches_adds_nothing():   # world far away -> world unchanged (deep equal), no source line
def test_cli_is_idempotent(tmp_path):            # run main() twice on a copied world -> identical bytes
```

For the hero rule, read `world["anchors"]["landmarks"]` `holzbruecke` / `fridolinsbruecke` points and skip pieces within 15 m of either, plus every road bridge sharing a name and an endpoint chain with them (mirror `bridgeChain`, `world.js` #78).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** with shapely (`STRtree` over the bbox-filtered TLM lines in game coords, 3D `LineString`s; z at a projection via `interpolate`). Removing stale keys first makes the CLI idempotent. `apply` appends `SOURCE` to `world["sources"]` once when anything matched.

- [ ] **Step 4: Wire into `osm.build_world`** — after `world_extra_roads.deck_rail(...)` and when `hdr` is set and `tlm_structures.load()` is not None, call `apply` on the dict before returning (build the dict into a variable first). Existing golden tests must still pass: `cd pipeline && python -m pytest -q` (regional golden tests skip without the pbf).

- [ ] **Step 5: Patch the committed worlds**

```bash
python pipeline/world_tlm.py --world data/world_hochrhein.json --mmh data/terrain_hochrhein.mmh
python pipeline/world_tlm.py --world data/world_ehrendingen.json --mmh data/terrain_ehrendingen.mmh
```

Expected Hochrhein stats: rail >= 29, road >= 60 (AC-2); no `railBridges` entry with an x in 1200..1300 and z in 540..610 (Südspange) carries `tlm`.

- [ ] **Step 6: Run** `cd pipeline && python -m pytest -q` → all pass.

- [ ] **Step 7: Commit**

```bash
git add pipeline/world_tlm.py pipeline/osm.py pipeline/tests/test_world_tlm.py data/world_hochrhein.json data/world_ehrendingen.json
git commit -m "feat(pipeline): annotate worlds with swissTLM3D deck and underpass heights (#1151)"
```

---

### Task 4: Pure height functions in `world.js`

**Files:**
- Modify: `world.js:146-160` (deck functions, constants), `world.js:253` (floor target), `world.js:486-491` (`fineWeight` per centre)
- Test: `tests/tlm.test.mjs`

**Interfaces:**
- Produces (all exported from `world.js`):
  - `TLM_RAIL_TOP = 0.3`, `TLM_CLEAR_MIN = 3.0`, `TLM_FINE = { inner: 16, outer: 28, r: 4 }`, `TLM_UNDER_REACH = 8`
  - `tlmProfile(samples: [t, y][], len: number, y0: number, y1: number) -> [t, y][]`: sorted, starts at `[0, y0]`, ends at `[len, y1]`; inside the end blend `B = min(8, len / 4)` each sample is mixed linearly from the pinned end value (weight 1 at the end, 0 at B) into the sample; gaps are linear (via `profileY`).
  - `bridgeDeckAt(b, t)` / `bridgeSurfaceAt(b, t)`: when `b.prof` is set, surface = `profileY(b.prof, t)` and deck = surface − `DECK_OFFSET`; otherwise unchanged.
  - `tlmUnderAt(under: [x, z, y, kind][], x, z) -> number | null`: the y of the nearest `road` point within `TLM_UNDER_REACH`.
  - `tlmFloorTarget(surface, yU, ground, u = UNDERPASS) -> number`: `Math.max(Math.min(yU, surface - u.deck - TLM_CLEAR_MIN) - u.lift, ground - u.maxDepth)`.
  - `fineWeight(x, z, centres, opts)`: a centre may be `[x, z]` (uses `opts`, default `FINE_BANK`) or `{ x, z, inner, outer }` (own radii).

- [ ] **Step 1: Write the failing tests** in `tests/tlm.test.mjs` (`node:test`, `assert/strict`, import from `../world.js`)

```js
test('tlmProfile_pinsEnds_andKeepsMiddle', () => { const p = tlmProfile([[0, 5], [10, 5], [20, 5], [30, 5], [40, 5]], 40, 3, 4);
  assert.equal(p[0][1], 3); assert.equal(p.at(-1)[1], 4); assert.equal(profileY(p, 20), 5); assert.ok(Math.abs(profileY(p, 8) - 5) < 1e-9); });
test('tlmProfile_shortDeck_blendIsQuarter', ...)        // len 16 -> B 4: profileY(p, 4) equals the sample value
test('tlmProfile_gapInSamples_interpolates', ...)       // samples at 0..10 and 30..40 only -> profileY(p, 20) is between, not 0
test('bridgeSurfaceAt_withProf_followsProfile', ...)    // b = { len: 20, prof: [[0, 1], [20, 3]] } -> surface(10) 2, deck(10) 2 - DECK_OFFSET
test('bridgeSurfaceAt_withoutProf_unchanged', ...)      // the existing h0/h1 + fade behaviour, same numbers as before
test('tlmUnderAt_twoCandidates_picksNearestRoad', ...)  // road at 3 m (y 4), road at 6 m (y 9), rail at 1 m -> 4
test('tlmUnderAt_beyondReach_null', ...)                // 9 m -> null
test('tlmFloorTarget_realRoadWins', ...)                // surface 30, yU 20, ground 21 -> 20 - 0.04
test('tlmFloorTarget_lowUnderpass_keepsClearMin', ...)  // surface 24, yU 21 -> 24 - 1.2 - 3.0 - 0.04
test('fineWeight_perCentreRadii', ...)                  // {x:0,z:0,inner:16,outer:28}: 1 at 10 m, 0 at 30 m; [x,z] still uses FINE_BANK
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/tlm.test.mjs`.
- [ ] **Step 3: Implement** the functions above in `world.js`.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` → all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(world): deck profiles and underpass floors from swissTLM3D (pure functions) (#1151)"`

---

### Task 5: TLM decks and underpass floors in the game

**Files:**
- Modify: `index.html` — import list (`:1029`), deck setup (`:1489-1505`), `seatGenericEnds`/`fillBridgeHeights`/`seatSwitchEnds` (`:1505-1531`), `deckMinAt`/`makeCut`/`buildCuts` (`:1636-1715`), `__mm.crossings`/`__mm.roadCrossings` (`:5978-5997`)

**Interfaces:**
- Consumes: Task 3 world keys (`r.tlm`, `r.tlmUnder` arrive on `L.railBridges[i]` and on `L.roads` bridge entries, so on `b.r`), Task 4 functions.
- Produces: `b.tlm = true` and `b.prof` on TLM decks; `__mm.crossings()` / `__mm.roadCrossings()` entries gain `tlm: boolean` and `tlmRoad: number | null`; new `__mm.tlmDecks()` → `[{ kind: 'rail'|'road', id, pts, h0, h1, prof, endGround: [g0, g1] }]`.

Steps (one commit; verify with Task 7's browser test):

- [ ] **Step 1:** Rail decks (`:1501-1505`) and generic road decks (`:1491-1495`, only `kind === 'generic'`) keep `rb.tlm` / `rb.tlmUnder` on `b` (`b.tlmSamples`, `b.under`); rail samples get `− TLM_RAIL_TOP`.
- [ ] **Step 2:** A new `fillTlmDecks(surf)` runs in `fillBridgeHeights` after `seatSwitchEnds` (hero chains never have samples, so its order relative to `buildStoneChain` does not matter): for each deck with samples, `y0`/`y1` = the surface it joins at each end — a switch end (`switchUnder`) takes that deck's surface; a generic road deck end takes `surf` at the end point (`terrainH` while laying out; after #1152 the bank road's profile surface — use whatever function #1152 exposes for the driven road height, else `roadTopH`); a rail deck end takes `terrainH` (Task 6 makes that the measured embankment). Then `b.prof = tlmProfile(samples, b.len, y0, y1)`, `b.h0 = y0`, `b.h1 = y1`, `b.tlm = true`.
- [ ] **Step 3:** `seatGenericEnds` skips `b.tlm` decks. Where the code re-seats ends on `roadTopH` later (search `seatGenericEnds(` call sites), call `fillTlmDecks(roadTopH)` again for road decks so ends meet the drawn bank road (AC-7).
- [ ] **Step 4:** In `makeCut`, when `deck.tlm` and `tlmUnderAt(deck.under, c.x, c.z)` is not null, use `tlmFloorTarget(deckMin, yU, groundAt(0))` instead of `cutFloorTarget`; store `cut.tlmRoad = yU`. `gradeCaps` is untouched (Südspange decks have no TLM).
- [ ] **Step 5:** Expose `tlm`/`tlmRoad` in `__mm.crossings()` and `__mm.roadCrossings()`, and `__mm.tlmDecks()`.
- [ ] **Step 6:** `node --test tests/*.test.mjs` passes; load the page once headless and confirm an empty console (the Task 7 browser test does this).
- [ ] **Step 7: Commit** — `git commit -m "feat(world): decks and underpass floors follow swissTLM3D in the game (#1151)"`

---

### Task 6: Rail deck ends on the measured embankment

**Files:**
- Modify: `index.html:1540-1541` (stone chain centres become objects), `:1603-1606` (`FINE_BANKS`, `fineGroundAt`, `patchGround`), cut/wall ground references (`makeCut` `groundAt` `:1654`, `cutDepth` `:1686`, the wall code `:2942-2958`)

**Interfaces:**
- Consumes: Task 4 `fineWeight` with object centres, `TLM_FINE`, `smoothedGround(h, box, r)`; Task 5 `b.tlm` rail decks.
- Produces: `FINE_BANKS` entries `{ x, z, inner, outer, ground }` (stone chain: 48/72/r 16; TLM rail ends: 16/28/r 4); `uncutH(x, z)` = `patchGround(x, z)` used wherever a cut or wall measures "the ground before the cut"; `__mm.fineCentres()` → `[{ x, z, inner, outer }]`; `__mm.patchCells()` → `CUT_CELLS.size`.

- [ ] **Step 1:** Before `fillTlmDecks` reads `terrainH` at rail deck ends, add one centre per end of every rail deck that has TLM samples (`b.tlmSamples`; `b.tlm` is only set afterwards) (dedupe ends closer than 4 m), build its ground with `smoothedGround(baseH, box, TLM_FINE.r)` and fill its cells exactly as `buildStoneChain` does (`fineCells` with the centre's `outer`, `FINE_KEYS`, `cellHeights(..., patchGround)`).
- [ ] **Step 2:** `fineGroundAt` picks the nearest centre by distance and uses that centre's `ground`; `patchGround` uses `fineWeight(x, z, FINE_BANKS)` with per-centre radii.
- [ ] **Step 3:** Replace `gradedH`/`meshH` by `uncutH` where the cut and wall code means the uncut ground: `makeCut`'s `groundAt`, `cutDepth` (`meshH(x, z) - terrainH(x, z)` → `uncutH(x, z) - terrainH(x, z)`), and the wall `at`/`ground` reads (`:2942-2945`). Leave `gradeCut(g, meshH, …)` and `HIDE`'s `caveCuts(meshH)` as they are.
- [ ] **Step 4:** Run `tests/test_underpass.py`, `tests/test_road_underpass.py`, `tests/test_suedspange.py`, `tests/test_fridolinsbruecke.py`, `tests/test_bridge_ends.py` in the foreground (timeout ≥ 40 min). Non-height assertions must pass unchanged; height assertions that encode today's Stein/road-cut depths are updated in Task 7.
- [ ] **Step 5: Commit** — `git commit -m "feat(world): measured embankment at rail deck ends (#1151)"`

---

### Task 7: Browser acceptance test, updated expectations, cost, docs

**Files:**
- Create: `tests/test_tlm_heights.py`
- Modify: `tests/test_underpass.py`, `tests/test_road_underpass.py` (height expectations only), `CHANGELOG.md`, `data/README.md` (world `tlm`/`tlmUnder` keys)

**Interfaces:**
- Consumes: the Task 1 fixture, `__mm.crossings()`, `__mm.roadCrossings()`, `__mm.tlmDecks()`, `__mm.patchCells()`, `__mm.ground`, `__mm.walls()`, `__mm.slopes()`.

- [ ] **Step 1: Write `tests/test_tlm_heights.py`** (same `run(server, script)` pattern as `tests/test_underpass.py:35-50`, one page load, `needs_world` skip)

```python
def test_matched_crossings_follow_tlm(server):      # for every fixture crossing with tlm != null, the game crossing within 3 m:
    # abs(deck - tlm.deck) <= 0.5; abs(road - tlm.road) <= 0.5 where tlm.road is set; clearance >= 3.0       (AC-3)
def test_koenigsweg_and_ankengasse(server):          # (4609, 5561) clearance > 0; (-3379, 736) within AC-3 tolerance (AC-4)
def test_stein_has_no_dip(server):                   # crossings within 30 m of (-888, 1206): road within 0.5 of 20.4      (AC-5)
def test_rail_deck_ends_meet_the_ground(server):     # every tlmDecks() rail entry: railGap < 0.3; abs(endGround - prof end) <= 0.5 (AC-6)
def test_road_deck_ends_have_no_step(server):        # every tlmDecks() road entry: abs(ground(end, h+2) - surface(end)) < 0.1 (AC-7)
def test_untouched_crossings_unchanged(server):      # fixture crossings with tlm == null (Südspange, German side): deck, road, clearance within 0.01 of before (AC-8)
```

- [ ] **Step 2: Push, then run** `python -m pytest tests/test_tlm_heights.py -v` in the foreground (timeout ≥ 20 min). Fix the implementation, never the fixture or the tolerances. After 3 failed attempts on one assertion, stop and report the numbers.
- [ ] **Step 3: Update pinned heights** in `tests/test_underpass.py` and `tests/test_road_underpass.py` that the spec changes (Stein cut depth, clearances that were set by the 4.5 m rule): replace each with the TLM-derived expectation from the fixture and a comment `# #1151: real heights (swissTLM3D)`. Keep every wall, slope, arm and drivability assertion (`test_stein_south_corner_has_no_wall_stub` stays as is). Run both files in the foreground.
- [ ] **Step 4: Cost** — measure load time (time to `#startbtn` enabled) and `__mm.patchCells()` on main and on the branch, 3 runs each, same machine; AC-9: ≤ 10 % slower. Put the numbers and the max end-blend grade of the rail decks in the PR description. Over budget: lower `TLM_FINE.outer` to 24 and re-measure.
- [ ] **Step 5: CHANGELOG** under `[Unreleased]` → `### Changed`, German, e.g.:

```markdown
- `<TZ=Europe/Zurich date '+%F %H:%M'>` **Bahnbrücken** und **Unterführungen** haben jetzt ihre echte Höhe aus **swissTLM3D**: Die Brücken liegen höher, die Strasse darunter taucht nicht mehr künstlich ab, zum Beispiel in **Stein** und am **Königsweg**.
```

- [ ] **Step 6: Commit and push**

```bash
git add tests/test_tlm_heights.py tests/test_underpass.py tests/test_road_underpass.py CHANGELOG.md data/README.md
git commit -m "test(world): crossings follow swissTLM3D heights (#1151)"
git push
```
