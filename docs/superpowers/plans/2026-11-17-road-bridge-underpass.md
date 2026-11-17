# Road-bridge underpasses (#1044) Implementation Plan

**Goal:** a normal road under a generic road bridge passes under it in a cut with ≥ 4.45 m headroom, trough walls and a
deck box, like the rail underpasses — Rütistrasse in Stein stays at ~16 m under the A3 instead of climbing to 21.7 m.

**Architecture:** two pure helpers groups in `world.js` (which crossings qualify; which bank roads keep their ground),
then `index.html` feeds the qualifying crossings through the existing `makeCut` / `settleCut` / `cutNetwork` / patch /
wall machinery into a separate `ROAD_CUTS` array, so everything rail-only (`CUTS`, `__mm.crossings()`, `__mm.arms()`,
`__mm.walls()`) stays as it is.

**Tech Stack:** vanilla JS ES modules, node:test, Playwright (Python) against the GPU browser.

**Spec:** `docs/superpowers/specs/2026-11-17-road-bridge-underpass-design.md` (crossing table, measurements, the
deck-seat risk).

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Pure logic goes in `world.js` with `node:test` tests in `tests/world.test.mjs` (`node --test tests/world.test.mjs`,
  then the whole `node --test tests/*.test.mjs` before every commit).
- Playwright only in **one new file** `tests/test_road_underpass.py`, plus `tests/test_underpass.py` as the regression
  (not edited). Always in the **foreground**, never `run_in_background`, with
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223` (the GPU browser), under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest <file> -q`.
  Run only the test(s) a step names; never the full Playwright suite.
- **No world / pipeline rebuild**: `data/world_hochrhein.json` already carries `bridge`, `layer`, `cls` on every road.
- Do not touch the rail path's behaviour: `RAIL_DECKS`, `CUTS`, `gradeCaps`, `__mm.crossings()`, `__mm.arms()` and
  what `__mm.walls()` returns for rail cuts stay identical. `UNDERPASS` values are not changed.
- No new visual system: reuse `box()`, `UNDERPASS.deck`, the `stone` role, the trough walls.
- CHANGELOG entry under `[Unreleased]` → `### Fixed`: game-facing prose (what the player sees), timestamp from
  `TZ=Europe/Zurich date '+%F %H:%M'`, 1-3 **bold** keywords, keys in `<kbd>`.
- Commit and push the branch after each green task (before slow Playwright verification of the next one).

## Review Focus

- **The deck's own seat** (spec, *Main risk*): `seatGenericEnds(roadTopH)` runs after the cuts. The guard rule must keep
  every bank road's ground; Task 3 asserts `guardDepth ≤ 0.05` and the baseline seats within 0.1 m. A deck that sags
  shows up as a clearance just under 4.45 — do not loosen the threshold, find the guard gap.
- `test_underpass.py` must pass **unedited**: road walls must not leak into `__mm.walls()` (its
  `test_walls_follow_skewed_decks…` asserts `not under` for walls far from rail decks), and rail wall pieces must keep
  their `decksOver` = `RAIL_DECKS`.
- `openCutFaces` now covers road cuts too (shared `ARMS`). It cannot see under a road deck (`roadDist` counts the deck
  road), so walls under the deck are asserted separately in Task 4.
- The two new conditions (spec): a road cut needs `terrainHasData(REAL, …)`; its floor never goes under
  `nearbyWaterLevel + 1.0`. Both apply to road cuts only — a rail cut must not see either.
- Index alignment: `roadBridgeCrossings(...).bridge` indexes the deck list passed in, never `OSM_BRIDGES` or `RAIL_DECKS`.

---

### Task 1: which crossings qualify — `roadBridgeCrossings`

**Files:** modify `world.js` (after `railRoadCrossings`, ~line 175); test `tests/world.test.mjs`

**Interfaces:**
```js
export const DECK_END_GAP = 1;                                   // m along the deck: a hit nearer an end is a join, not a crossing
export const UNDERPASS_SKIP_CLS = new Set(['motorway', 'motorway_link']);
export function roadBridgeCrossings(roads, decks)                // decks: [{ pts, layer }] -> rail-shaped records { road, bridge, x, z, tRoad, tRail, sin }
```
Body: `railRoadCrossings(roads.filter((r) => !UNDERPASS_SKIP_CLS.has(r.cls)), decks)` filtered to
`Math.min(c.tRail, polylineLength(decks[c.bridge].pts) - c.tRail) >= DECK_END_GAP`.

- [ ] **Step 1: failing tests** (extend the import with `roadBridgeCrossings, DECK_END_GAP`):

```js
test('roadBridgeCrossings_NormalRoadUnderDeck_OneRecord', () => {
  const road = { n: 'R', cls: 'residential', w: 5.5, bridge: false, layer: 0, pts: [[0, -20], [0, 20]] };
  const [c, ...rest] = roadBridgeCrossings([road], [{ pts: [[-10, 5], [10, 5]], layer: 1 }]);
  assert.equal(rest.length, 0); assert.equal(c.bridge, 0); assert.equal(c.tRoad, 25); assert.equal(c.tRail, 10);
});
test('roadBridgeCrossings_MotorwayOrLinkUnderDeck_None', () => {
  for (const cls of ['motorway', 'motorway_link'])
    assert.deepEqual(roadBridgeCrossings([{ cls, w: 14, bridge: false, layer: 0, pts: [[0, -20], [0, 20]] }], [{ pts: [[-10, 5], [10, 5]], layer: 1 }]), []);
});
test('roadBridgeCrossings_DeckEndOnTheRoad_IsAJoinNotACrossing', () => {
  const road = { cls: 'residential', w: 5.5, bridge: false, layer: 0, pts: [[0, -20], [0, 20]] };
  assert.deepEqual(roadBridgeCrossings([road], [{ pts: [[0, 5], [20, 5]], layer: 1 }]), []);          // starts on it
  assert.deepEqual(roadBridgeCrossings([road], [{ pts: [[-0.9, 5], [20, 5]], layer: 1 }]), []);       // 0.9 m < DECK_END_GAP
  assert.equal(roadBridgeCrossings([road], [{ pts: [[-1.1, 5], [20, 5]], layer: 1 }]).length, 1);
});
test('roadBridgeCrossings_Hochrhein_TheEighteenOfIssue1044', () => {
  const w = JSON.parse(readFileSync(new URL('../data/world_hochrhein.json', import.meta.url)));
  const L = layoutFromWorld(w), decks = L.roads.filter((r) => r.bridge);
  const got = roadBridgeCrossings(L.roads, decks.map((r) => ({ pts: r.pts, layer: r.layer ?? 0 }))).map((c) => [decks[c.bridge].id, c.road.id]);
  // spec table; the 6 pairs with enough headroom (Ankengasse x2, Fabrikstrasse/w374239097, Murgtalstrasse x2,
  // Harpolinger) are here too (the clearance filter is the cut depth, Task 3) -- 18 + 6 = 24 (verified on the data 2026-11-17)
  assert.equal(got.length, 24);
  for (const pair of [[51687867, 31970306], [51688069, 31970306], [4988444, 116017354], [4985551, 116017354], [4988444, 969542283],
    [4985551, 969542283], [4985554, 1238921972], [4985555, 1238921972], [107186388, 345612508], [107186377, 345612508],
    [25976772, 331388063], [28810416, 319322059], [25976777, 967940907], [25976788, 967940893], [40388838, 28165755],
    [154394930, 1531664793], [162987100, 162941411], [1382546970, 1238831069]]) assert.ok(got.some(([b, r]) => b === pair[0] && r === pair[1]), pair);
});
```
(`readFileSync` from `node:fs`; skip the last test with `{ skip: !existsSync(...) }` like other world-file tests if
the file is absent.) The deck list in the data test is every `bridge` road; in `index.html` it is the generic subset
(the hero chains cross the Rhine and hit no ground road with `tRail` ≥ 1 — verify in Step 4 by logging, not by test).

- [ ] **Step 2:** `node --test tests/world.test.mjs` → the four new tests fail (`roadBridgeCrossings` is not exported).
- [ ] **Step 3:** implement.
- [ ] **Step 4:** green; then `node --test tests/*.test.mjs` green. If the data test counts ≠ 24, print the extra pairs
  and stop: the spec table is the contract.
- [ ] **Step 5:** commit `feat(world): find the road crossings under road bridges (#1044)`.

### Task 2: bank roads keep their ground — `deckGuards`, `guardedAt`

**Files:** modify `world.js`; test `tests/world.test.mjs`

**Interfaces:**
```js
export function deckGuards(deckPts, roads, reach = 30)   // -> [{ road, pts, hw }]: non-bridge roads with an end within 0.5 m of a deck end,
                                                         //    pts oriented away from the deck and cut to `reach` m (cutPolyline), hw = road.w / 2
export function guardedAt(x, z, guards, pad = 0.5)       // -> true where nearestOnPolyline(g.pts, x, z).d <= g.hw + pad for some guard
```

- [ ] **Step 1: failing tests**

```js
test('deckGuards_BankRoadsAtBothEnds_OrientedAwayAndCut', () => {
  const deck = [[0, 0], [20, 0]];
  const roads = [{ id: 1, w: 14, bridge: false, pts: [[-100, 0], [0, 0]] }, { id: 2, w: 14, bridge: false, pts: [[20, 0], [200, 0]] },
                 { id: 3, w: 14, bridge: true, pts: [[20, 0], [40, 0]] }, { id: 4, w: 5, bridge: false, pts: [[10, -20], [10, 20]] }];
  const g = deckGuards(deck, roads);
  assert.deepEqual(g.map((x) => x.road.id).sort(), [1, 2]);                       // no bridge, no road merely crossing the deck
  const a = g.find((x) => x.road.id === 1);
  assert.deepEqual(a.pts[0], [0, 0]); assert.ok(Math.abs(polylineLength(a.pts) - 30) < 1e-9); assert.equal(a.hw, 7);
});
test('guardedAt_InsideRibbonPlusPad_True_OutsideFalse', () => {
  const g = [{ pts: [[0, 0], [30, 0]], hw: 7 }];
  assert.equal(guardedAt(10, 7.4, g), true); assert.equal(guardedAt(10, 7.6, g), false); assert.equal(guardedAt(31, 0, g), true);
});
test('deckGuards_Hochrhein_NoBankRoadReachesPastTheTroughFace', () => {
  // spec "Main risk": the guard can keep a bank road up only behind the wall's inner face (hw + margin); worst today -0.9 m into the 2 m wall
  // for every crossing of Task 1's 18 pairs (filter Task 1's records to those pairs): sample each guard's centre and both
  // edges (offsetPolyline +-hw) every 0.5 m; assert nearestOnPolyline(c.road.pts, ...).d >= c.road.w / 2 + UNDERPASS.margin
});
```

- [ ] **Step 2:** run, see them fail. **Step 3:** implement. **Step 4:** green, full node suite green.
- [ ] **Step 5:** commit `feat(world): bank roads of a road deck keep their ground (#1044)`.

### Task 2b: missing terrain and the water level — `terrainHasData`, `nearbyWaterLevel`

**Files:** modify `world.js`; test `tests/world.test.mjs`

**Interfaces** (spec, *Which crossings qualify*, for the reasons behind the numbers):
```js
export const ROAD_UNDERPASS = { waterRadius: 400, waterArea: 1000, waterMargin: 1.0 };
export function terrainHasData(mmh, x, z)                     // mmh = { hdr, data } as parseMMH returns, or null -> false;
                                                              // i0 = floor((x - hdr.x0) / hdr.step) - 1, j0 likewise; of the 4 x 4 samples
                                                              // (i0..i0+3, j0..j0+3, clamped to the grid) fewer than 8 are exactly 0
export function nearbyWaterLevel(water, x, z, u = ROAD_UNDERPASS)   // -> level of the nearest polygon (rings[0] area >= u.waterArea,
                                                              //    distance 0 inside, else to rings[0]) within u.waterRadius, or null
```

- [ ] **Step 1: failing tests**

```js
test('terrainHasData_NoMmh_False_AllZeroBlock_False_RealBlock_True', () => {
  const hdr = { x0: 0, z0: 0, step: 8, w: 8, h: 8 }, data = new Float32Array(64).fill(3.2);
  assert.equal(terrainHasData(null, 20, 20), false);
  assert.equal(terrainHasData({ hdr, data }, 20, 20), true);
  data.fill(0); assert.equal(terrainHasData({ hdr, data }, 20, 20), false);
  data.fill(3.2); for (const k of [9, 10, 11, 17, 18, 19, 25]) data[k] = 0;      // 7 of the 16 around (20, 20): still data
  assert.equal(terrainHasData({ hdr, data }, 20, 20), true);
});
test('nearbyWaterLevel_NearestLargePolygonWithinRadius', () => {
  const sq = (x, z, s, level) => ({ level, rings: [[[x, z], [x + s, z], [x + s, z + s], [x, z + s]]] });
  const water = [sq(100, 0, 5, 9), sq(300, 0, 40, -1.5), sq(500, 0, 40, 7)];   // pond (25 m²) nearer, river 300 m, lake 500 m
  assert.equal(nearbyWaterLevel(water, 0, 0), -1.5);
  assert.equal(nearbyWaterLevel(water, 0, 0, { ...ROAD_UNDERPASS, waterRadius: 250 }), null);
  assert.equal(nearbyWaterLevel(water, 310, 10), -1.5);                          // inside counts as 0 m
});
test('roadUnderpassConditions_Hochrhein_TwoNoDataSitesAndLohgerbeOnly', { skip: <both data files absent> }, () => {
  // parse data/terrain_hochrhein.mmh like parseMMH (MMH1 magic, u32 header length, JSON header, Float32 samples);
  // over Task 1's 18 candidate records: terrainHasData false exactly for decks 25976772 and 28810416;
  // nearbyWaterLevel(w.water, c.x, c.z) non-null among the other 16 only for deck 162987100, value -1.49 +- 0.01
});
```

- [ ] **Step 2:** run, see them fail. **Step 3:** implement. **Step 4:** green, full node suite green.
- [ ] **Step 5:** commit `feat(world): road underpasses only on measured terrain and above the water level (#1044)`.

### Task 3: road cuts in the world — `ROAD_CUTS`, guards, `__mm.roadCrossings()`

**Files:** modify `index.html` (`deckMinAt` / `makeCut` ~1551-1574, `cutFloorMin` ~1580, `buildCuts` ~1593, debug API
next to `__mm.crossings` ~5544); create `tests/test_road_underpass.py`

**Interfaces:**
```js
const ROAD_CUTS = [], ROAD_DECKS = OSM_BRIDGES.filter((b) => b.kind === 'generic' && !b.approach);  // ROAD_DECKS after the hero-chain pass (~1420)
function deckMinAt(c, deck = RAIL_DECKS[c.bridge])     // unchanged body, deck from the parameter
function makeCut(c, deck = RAIL_DECKS[c.bridge])       // unchanged body, deck from the parameter; gradeCaps keeps the rail default
window.__mm.roadCrossings = () => ROAD_CUTS.map(...)   // { x, z, road, roadId, deckId, depth, arms, unsettled, capped, deck, clearance, water, guardDepth }
```
- `buildCuts`, after the rail loop: for each `roadBridgeCrossings(L.roads, ROAD_DECKS.map((b) => ({ pts: b.r.pts, layer: b.r.layer ?? 0 })))`
  record `c` with `terrainHasData(REAL, c.x, c.z)` (skip the rest): `const d = ROAD_DECKS[c.bridge], cut = makeCut(c, d); cut.roadCut = true; cut.guards = deckGuards(d.r.pts, L.roads);`
  then `ROAD_CUTS.push(cut)`. Water bound: `makeCut` gets an optional `minFloor` (default `-Infinity`); for a road
  cut pass `level + ROAD_UNDERPASS.waterMargin` when `nearbyWaterLevel(L.water, c.x, c.z)` is non-null, and
  `cut.f0 = Math.max(cutFloorTarget(...), minFloor)` before `settleCut`; record `cut.water = level ?? null`. Road cuts with `depth > 0` join `ARMS` with the same `lat` / `bounds` as rail ones, and
  each arm gets `roadCut` and the cut's `guards`.
- `cutFloorMin`: skip arm `a` at (x, z) when `a.guards && guardedAt(x, z, a.guards) && nearestOnPolyline(a.pts, x, z).d > a.hw + UNDERPASS.margin`.
- `clearance` and `deck` exactly as `__mm.crossings()` computes them (road max over the flat part); `guardDepth` = max
  over the deck's guards' centre lines (1 m steps) of `meshH - terrainH`.

- [ ] **Step 1: failing Playwright test** `tests/test_road_underpass.py` — module docstring `"""#1044: roads under road
  bridges pass under them in a cut, like the rail underpasses."""`; a `run(server, script)` helper copied from
  `test_underpass.py` without the world-file rewrite (no `body`, no route); `needs_world` the same. Constants:

```python
RUTI = [[-871.0, 1071.3], [-876.8, 1120.3], [-879.7, 1149.8]]        # w31970306 + w31970308
RUTI_DECKS = {51687867: (-873.4, 1091.4), 51688069: (-874.8, 1103.1)}
SEATS = {51687867: (21.50, 21.21), 51688069: (21.10, 21.49), 107186388: (55.59, 54.56), 107186377: (54.33, 56.11),
         4985551: (22.65, 23.75), 4988444: (21.93, 22.78), 25976772: (0.04, 0.04)}   # main, 2026-11-17
EXPECTED = 16
NO_TERRAIN = {331388063: (-2882.8, -238.0), 319322059: (-3530.7, -1955.9)}   # lower road id -> crossing (Jurastrasse, Basler Strasse)
LOHGERBE = (-1550.0, -324.2)
```
(The lower roads' polylines for sampling come from the world file by id.)

  `test_every_road_underpass_has_headroom`: `xs = __mm.roadCrossings()`; `len([c for c in xs if c["depth"] > 0]) == EXPECTED`;
  every one with depth > 0 except Lohgerbe (within 2 m of `LOHGERBE`): `clearance >= 4.45 or depth >= 5.99`, `water is None`;
  all: not `capped`, not `unsettled`, `guardDepth <= 0.05`; every crossing with depth 0 has `clearance >= 4.45`.

  `test_no_cut_where_the_terrain_has_no_data`: no `roadCrossings()` record within 2 m of either `NO_TERRAIN` crossing;
  at the crossing and every 5 m to ±30 m along the lower road `__mm.cutDepth(x, z) == 0` and
  `__mm.ground(x, z, -1e4)` is `0.04 ± 0.02`; no `__mm.roadWalls()` piece within 30 m.

  `test_lohgerbe_stays_above_the_rhine`: the record at `LOHGERBE`: `water` `-1.49 ± 0.05`, `depth >= 4.0`, not capped,
  `clearance` `3.77 ± 0.2` (below 4.5 m by design — spec); road surface under the deck
  (`__mm.ground(x, z, deck - 2)`) `-0.45 ± 0.15`. Seats: `__mm.genericBridges()` for the `SEATS` ids within 0.1 m.

  `test_rutistrasse_stays_level_under_the_a3`: both `RUTI_DECKS` crossings: `clearance >= 4.45`, road surface under the
  deck (`__mm.ground(x, z, deck - 2)`) `16.0 ± 0.5`; the profile `__mm.ground(x, z, 18)` along `RUTI` every 1 m from
  z 1060 to 1140 has max ≤ 17.0 and no step > 0.3; drive: `__mm.sim(-871.3, 1074, atan2(49, -5.8), 13.9, 0.25)` then
  `__mm.step(0.25)` × 23, collecting `y`, `bridge`; final `z >= 1135`, `max(y) <= 17.5`, never `bridge`.

- [ ] **Step 2:** run the new file → all four fail (`__mm.roadCrossings` is not a function). That proves the harness.
- [ ] **Step 3:** implement the bullets above.
- [ ] **Step 4:** all four green. If a crossing is capped or unsettled, print its `capped` node and stop — do not
  add an allow-list; report it (the spec counts it as a qualifying site).
- [ ] **Step 5:** `node --test tests/*.test.mjs` green; commit `fix(world): roads under road bridges are cut down under the deck (#1044)`; push.

### Task 4: walls and the deck box

**Files:** modify `index.html` (deck drawing ~2722, wall loop and `troughPiece` ~2745-2790, `__mm.walls` ~5618,
`__mm.rayHits` ~5558); extend `tests/test_road_underpass.py`

**Interfaces / rules:**
- `const ROAD_CUT_DECKS = new Set(ROAD_CUTS.filter((c) => c.depth > 0).map((c) => c.deck));` after `buildCuts`.
- Deck box: for each deck in `ROAD_CUT_DECKS`, per ≤ 10 m piece of `resample(b.r.pts, 10)`:
  `box(len + 0.1, UNDERPASS.deck - 0.02, b.r.w + 1.2, mx, hs(mx, mz) - UNDERPASS.deck, mz, rot, col('#b8b2a6'), 'stone', [4, 3], 0)` (rail-deck loop's pattern; top 0.02 m under the road strip).
- Wall runs: per road, `pass` = the `r` of every deck over a road cut on that road plus every guard road of those cuts;
  `otherRoad(road, pass)` ignores roads in `pass` (empty set → today's behaviour for rail-only roads; also used in `runCorners`).
- `troughPiece`: `roadCut` = the piece's `t` lies in a road-cut arm's span on that road; `decksOver(x, z, half, roadCut ? [...RAIL_DECKS, ...ROAD_CUT_DECKS] : RAIL_DECKS)`;
  a `roadCut` piece whose centre is `guardedAt` one of its cuts' guards gets `top = Math.min(top, roadTopH(w.x, w.z) - 0.05)` and no parapet.
  `WALLS` entries get `roadCut`.
- `__mm.walls = () => WALLS.filter((w) => !w.roadCut)`; `__mm.roadWalls = () => WALLS.filter((w) => w.roadCut)`;
  `__mm.rayHits = (x, z, from = 2000)`.

- [ ] **Step 1: failing test** `test_rutistrasse_portal`: for each `RUTI_DECKS` crossing, `deck = __mm.ground(x, z, 1e4)`:
  `rayHits(x, z)["stone"] - rayHits(x, z, deck - 1.3)["roadOsm"] >= 1.2 + 4.45 - 0.1`; `__mm.roadWalls()` within 8 m
  of the crossing has `under` pieces with `side` −1 and +1; a car in the trough 1.5 m off such a wall is pushed
  (`__mm.pushAt(...)` moves > 0.01) and a car on the deck above it is not (< 0.01) — same probes as
  `test_trough_walls`. Plus: no road wall piece (both ends) lies within `w/2 + 1.0` of a non-bridge road that is not
  a guard road of its cut (use the world file, `dseg` as in `test_underpass.py`).
- [ ] **Step 2:** fails (no `stone` box under the A3 deck / no road walls). **Step 3:** implement.
- [ ] **Step 4:** green. Then the regression, unedited: `tests/test_underpass.py` (all 7 tests, one run) → green,
  including `test_no_open_cut_faces` now over road cuts too.
- [ ] **Step 5:** commit `feat(world): trough walls and a deck box under road bridges (#1044)`; push.

### Task 5: CHANGELOG

**Files:** modify `CHANGELOG.md`

- [ ] Under `## [Unreleased]` → `### Fixed` (create the heading if missing), newest first, e.g.:
  `` - `<TZ=Europe/Zurich date '+%F %H:%M'>` Die **Rütistrasse** in Stein führt wieder eben **unter der A3** durch statt über einen Buckel auf Brückenhöhe; auch an neun weiteren Stellen (u. a. Zürcherstrasse, Kaistenbergstrasse, Fricktalstrasse) liegt die Strasse unter einer **Strassenbrücke** jetzt in einer Unterführung mit Betonwänden. ``
  (match the language of the surrounding entries — currently German.)
- [ ] `node --test tests/*.test.mjs` green; commit `docs(changelog): road-bridge underpasses (#1044)`; push.
