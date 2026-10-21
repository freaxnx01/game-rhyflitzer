# Bodenackerstrasse 6 model (#410) Implementation Plan

**Goal:** the block Bodenackerstrasse 6a–6d (OSM `171822634`) is drawn from its own data-driven model: ten storeys of an
own façade texture on the OSM footprint (window grid on the street side, flush recessed loggias on the back), four glass entrance
porches taken from the four projections of the OSM outline (glass sides, flat roof, door leaf facing the street), a white windowless
housing above the roof behind each porch, and a pure module that exports floors, stair positions and porch entrances for #411.

**Spec:** `docs/superpowers/specs/2026-10-21-bodenackerstrasse-6-model-design.md` (read it first; the open questions Q1–Q3
have defaults in `BODENACKER6`, implement the defaults, do not wait).

**Global constraints:** buildless stack, no `package.json`, no new dependencies, no framework. Node unit tests:
`node --test prototype/tests/*.test.mjs` (the glob, not the folder). Playwright: foreground only, never `run_in_background`,
one file at a time (`cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/<file> -q`), **after** commit and push.
Memory-heavy commands under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. TDD: failing test first,
never edit a test to turn it green. **Privacy:** only the public address and public exterior facts in code, comments,
tests, commits and the changelog — nothing about flats, floors or people; no floor plans. No Street View or geo.admin
pixels in the repo. Do not call `rr()`/`rnd()` in the new code (the seeded world RNG sequence stays unchanged).

## File structure

- New `prototype/bodenacker6.js` — pure module (constants, frame, ring simplification, porch detection, body ring,
  stairs, walls by face, floors, layout). No three.js, no DOM.
- New `prototype/tests/bodenacker6.test.mjs` — node tests.
- Modify `prototype/index.html` — import; `TEX.bodenacker`, `TEX.bodenackerLoggia`, `TEX.plasterWhite`; `glass` role in `mat(role)` and the role
  map; `bodenackerBuilding(b, base, h)`; one branch in `osmBuilding`; `window.__mm.bodenacker6`, `counts.bodenacker6`.
- New `prototype/tests/test_bodenacker6.py` — Playwright check (pattern of `test_row_houses.py`).
- Modify `prototype/tests/test_row_houses.py` — one comment only (`OTHER_ID` says "eight storeys"; it is ten).
- Modify `CHANGELOG.md` (`[Unreleased]`, `Added`).

Branch: `feature/410-bodenackerstrasse-6-model` from `main`.

## Task 1: frame and ring simplification (tests first)

**Files:** `prototype/tests/bodenacker6.test.mjs`, `prototype/bodenacker6.js`.

**Interfaces:**

```js
export const BODENACKER6 = { id: 171822634, storeys: 10, houses: ['6a', '6b', '6c', '6d'], houseOrder: 'northToSouth',
  housingRise: 2.6, parapet: 0.5, moduleWidth: 4.0, porch: { h: 3.0, door: 1.0, post: 0.15, slab: 0.25, overhang: 0.1 },
  stair: { d: 3.0 }, bumpMinDepth: 1.5, bumpMaxWidth: 4.0 };
export function isBodenacker6(b)
export function bodenackerFrame(rect)   // rect = [cx, cz, w, d, rot] as in world.json; { cx, cz, rot, toWorld(u, v), toLocal(x, z), outTh, inTh }
export function simplifyRing(points, tol = 0.15)   // [[u, v]] → [[u, v]] without near-collinear vertices (|cross| / edge length < tol)
```

The frame is `box()`'s: `toWorld(u, v) = [cx + u·cos(rot) − v·sin(rot), cz + u·sin(rot) + v·cos(rot)]`, `toLocal` its inverse.
`outTh = rot + π/2` (heading of +v), `inTh = outTh + π`, both wrapped to `(−π, π]`.

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/bodenacker6.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BODENACKER6, isBodenacker6, bodenackerFrame, simplifyRing } from '../bodenacker6.js';

const RECT = [2039.57, -366.12, 60.9, 22.08, -1.7023];   // data/world_hochrhein.json, OSM w171822634 (© OpenStreetMap contributors, ODbL)
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('BODENACKER6_Constants_TenStoreysFourHousesAndTheOsmId', () => {
  assert.equal(BODENACKER6.id, 171822634);
  assert.equal(BODENACKER6.storeys, 10);
  assert.deepEqual(BODENACKER6.houses, ['6a', '6b', '6c', '6d']);
});

test('isBodenacker6_ByOsmId_TrueOnlyForTheBlock', () => {
  assert.equal(isBodenacker6({ id: 171822634, addr: '6a–6d' }), true);
  assert.equal(isBodenacker6({ id: 171822635, addr: '1a–1d' }), false);   // the twin block keeps the generic model
});

test('bodenackerFrame_RoundTrip_LocalToWorldAndBack', () => {
  const f = bodenackerFrame(RECT);
  const [x, z] = f.toWorld(19.1, 11.0), [u, v] = f.toLocal(x, z);
  assert.ok(near(u, 19.1, 1e-9) && near(v, 11.0, 1e-9));
  assert.deepEqual(f.toWorld(0, 0).map(n => +n.toFixed(2)), [2039.57, -366.12]);
});

test('bodenackerFrame_PlusVHeading_PointsEastTowardsTheStreet', () => {
  const f = bodenackerFrame(RECT);
  assert.ok(Math.cos(f.outTh) > 0.95, 'out of the house = east');
  assert.ok(near(Math.cos(f.inTh), -Math.cos(f.outTh), 1e-9) && near(Math.sin(f.inTh), -Math.sin(f.outTh), 1e-9));
});

test('simplifyRing_CollinearSplit_DropsTheMiddleVertex', () => {
  assert.deepEqual(simplifyRing([[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});

test('simplifyRing_RealCorner_Kept', () => {
  assert.deepEqual(simplifyRing([[0, 0], [10, 0], [10, 4], [0, 4]]), [[0, 0], [10, 0], [10, 4], [0, 4]]);
});
```

- [ ] **Step 2: run, expect failure** (module not found): `node --test prototype/tests/bodenacker6.test.mjs`.
- [ ] **Step 3: implement** `prototype/bodenacker6.js` with a header comment in the style of `holzbruecke.js` (issue,
  sources: OSM way id, GWR storey count, swissSURFACE3D height via the world file; "pure: no three.js, no DOM"). Keep
  functions ≤ 20 lines; `simplifyRing` walks the closed ring and keeps a vertex when the cross product of its two edges
  divided by the longer edge exceeds `tol`.
- [ ] **Step 4: run, expect pass.** `verify:` `node --test prototype/tests/bodenacker6.test.mjs` → 6 pass.

## Task 2: porch detection and the body ring (tests first)

**Files:** same two.

**Interfaces:**

```js
export function bodenackerPorches(ring, frame, cfg = BODENACKER6)
  // ring = world [[x, z]]; → [{ house, u, v0, v1, w, d, h, entrance: { x, z, th, w } }] sorted by u ascending (south → north);
  // u = bump centre, v0 = façade line, v1 = tip, w/d = bump width/depth, h = cfg.porch.h,
  // entrance on the +v face (v1) at u: world x, z via frame.toWorld, th = frame.inTh, w = cfg.porch.door
  // throws Error('bodenacker6: expected 4 porches, found N')
export function bodenackerBody(ring, frame, porches)
  // → local [[u, v]] ring with each porch bump (its three edges) replaced by one edge along the façade line v0
```

A bump: in the simplified local ring, three consecutive edges `p0→p1` (Δv ≥ `bumpMinDepth`, |Δu| small), `p1→p2`
(|Δv| small, |Δu| ≤ `bumpMaxWidth`), `p2→p3` (Δv ≤ −`bumpMinDepth`), with `p1.v > p0.v` (sticking out towards +v).
`u = (p1.u + p2.u)/2`, `v0 = (p0.v + p3.v)/2`, `v1 = (p1.v + p2.v)/2`, `w = |p2.u − p1.u|`, `d = v1 − v0`. Houses are assigned
after sorting: `houseOrder === 'northToSouth'` gives `'6a'` to the largest `u` (confirmed: 6a is the north end).

- [ ] **Step 1: write the failing tests** (append):

```js
import { bodenackerPorches, bodenackerBody } from '../bodenacker6.js';

// a 40 x 12 block with two 2.4 x 3 bumps on the +v side; the second bump's top is split by a collinear vertex like OSM does
const TWO_BUMPS = [[-20, -6], [20, -6], [20, 6], [12, 6], [12, 9], [9.6, 9], [9.6, 6], [-8, 6], [-8, 9], [-9, 9], [-10.4, 9], [-10.4, 6], [-20, 6]];
const IDENTITY = { toLocal: (x, z) => [x, z], toWorld: (u, v) => [u, v], inTh: Math.PI, outTh: 0 };

test('bodenackerPorches_SyntheticTwoBumps_FindsBothWithSizesAndEntrance', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const p = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(p.map(({ u, v0, v1, w, d, h }) => ({ u, v0, v1, w, d, h })),
    [{ u: -9.2, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }, { u: 10.8, v0: 6, v1: 9, w: 2.4, d: 3, h: 3 }]);
  assert.deepEqual(p[1].entrance, { x: 10.8, z: 9, th: Math.PI, w: 1.0 });       // on the street face (+v), walking in = -v
  assert.deepEqual(p.map(x => x.house), ['y', 'x']);                              // north (largest u) is the first house
});

test('bodenackerPorches_WrongCount_Throws', () => {
  assert.throws(() => bodenackerPorches(TWO_BUMPS, IDENTITY), /expected 4 porches, found 2/);
});

test('bodenackerBody_SyntheticTwoBumps_RingWithoutTheBumps', () => {
  const cfg = { ...BODENACKER6, houses: ['x', 'y'] };
  const porches = bodenackerPorches(TWO_BUMPS, IDENTITY, cfg);
  assert.deepEqual(bodenackerBody(TWO_BUMPS, IDENTITY, porches), [[-20, -6], [20, -6], [20, 6], [-20, 6]]);
});

const WORLD = new URL('../../data/world_hochrhein.json', import.meta.url);
const block = () => existsSync(WORLD) ? JSON.parse(readFileSync(WORLD, 'utf8')).buildings.find(b => b.id === BODENACKER6.id) : null;

test('bodenackerPorches_RealRing_FourPorchesNorthToSouth', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f);
  assert.deepEqual(p.map(x => x.house), ['6d', '6c', '6b', '6a']);            // sorted by u ascending; 6a at the north end (largest u)
  const us = p.map(x => x.u);
  [-23.2, -10.6, 4.3, 19.1].forEach((u, i) => assert.ok(Math.abs(us[i] - u) < 0.3, `porch ${i} at u ${us[i]}`));
  for (const x of p) { assert.ok(x.w > 2 && x.w < 3, `width ${x.w}`); assert.ok(x.d > 2.4 && x.d < 3.5, `depth ${x.d}`); }
  for (const x of p) { const [, v] = f.toLocal(x.entrance.x, x.entrance.z); assert.ok(near(v, x.v1, 1e-6), 'entrance on the tip face'); assert.ok(near(x.entrance.th, f.inTh)); }
});

test('bodenackerBody_RealRing_NoVertexBeyondTheFacadeLineAndFewerVertices', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), f = bodenackerFrame(b.rect), p = bodenackerPorches(b.ring, f), body = bodenackerBody(b.ring, f, p);
  const simple = simplifyRing(b.ring.map(([x, z]) => f.toLocal(x, z))), facadeMax = Math.max(...p.map(x => x.v0));
  assert.ok(body.length < simple.length, `body ${body.length} vs ${simple.length}`);
  assert.ok(body.every(([, v]) => v <= facadeMax + 0.5), 'no porch bump left in the body ring');
});
```

- [ ] **Step 2: run, expect failure** (`bodenackerPorches is not a function`).
- [ ] **Step 3: implement** `bodenackerPorches` (simplify → scan the closed ring for bump triples → sort → assign houses,
  build the entrance, throw when the count is not `cfg.houses.length`) and `bodenackerBody` (simplify → drop `p1`, `p2` of every
  bump → `simplifyRing` again, so the façade points left and right of a removed bump merge into one edge where they are
  collinear; the synthetic test expects exactly that).
  If the real-ring test fails on a porch count, print the simplified local ring and adjust `tol`/`bumpMinDepth` only
  with the spec's numbers in hand (façade-to-tip depths are 2.6–3.2 m, bump widths 2.3–2.4 m); never widen the test.
- [ ] **Step 4: run, expect pass.** `verify:` `node --test prototype/tests/bodenacker6.test.mjs` → all pass, real-ring
  tests not skipped (the world file is in the repo).

## Task 3: stairs, walls, floors, layout, house lookup (tests first)

**Files:** same two.

**Interfaces:**

```js
export function bodenackerStairs(porches, cfg = BODENACKER6)
  // → [{ house, u, w, d, vFront, vBack }]: the stair hall footprint directly behind each porch: u and w of the porch,
  // vFront = porch.v0 (the façade line), d = cfg.stair.d, vBack = vFront − d
export function bodenackerWalls(body, frame)
  // → [{ a: [x, z], b: [x, z], face }] one per body edge (world coordinates); face = 'back' when the outward normal's v component
  // is < −0.5, 'street' when > 0.5, else 'end'. Outward = right of the walking direction for the ring's winding (normalise the winding first).
export function bodenackerFloors(base, h, cfg = BODENACKER6)
  // → { pitch: h / storeys, floors: [base, base + pitch, …] (storeys entries), roof: base + h + parapet, housingTop: roof + housingRise }
export function bodenackerLayout(b, base, h, cfg = BODENACKER6)
  // → { frame, porches, stairs, body, walls, floors, ring: b.ring }
export function bodenackerHouse(layout, house)   // { porch, stair }; throws Error('bodenacker6: unknown house 6e')
```

- [ ] **Step 1: write the failing tests** (append):

```js
import { bodenackerStairs, bodenackerWalls, bodenackerFloors, bodenackerLayout, bodenackerHouse } from '../bodenacker6.js';

test('bodenackerStairs_OnePorch_BehindTheFacadeLineWithTheSamePlanSize', () => {
  const [s] = bodenackerStairs([{ house: '6c', u: 4.3, v0: 3.8, v1: 7.0, w: 2.4, d: 3.2 }]);
  assert.deepEqual(s, { house: '6c', u: 4.3, w: 2.4, d: 3.0, vFront: 3.8, vBack: 3.8 - 3.0 });
});

test('bodenackerWalls_Rectangle_BackStreetAndEnds', () => {
  const faces = bodenackerWalls([[-20, -6], [20, -6], [20, 6], [-20, 6]], IDENTITY).map(w => w.face).sort();
  assert.deepEqual(faces, ['back', 'end', 'end', 'street']);
});

test('bodenackerFloors_TenStoreys_PitchIsHOverTen', () => {
  const f = bodenackerFloors(300, 25.3);
  assert.ok(near(f.pitch, 2.53));
  assert.equal(f.floors.length, 10);
  assert.equal(f.floors[0], 300);
  assert.ok(near(f.floors[9], 300 + 9 * 2.53));
  assert.ok(near(f.roof, 325.8) && near(f.housingTop, 328.4));
});

test('bodenackerLayout_RealBlock_FourPorchesStairsAndBackWalls', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const b = block(), L = bodenackerLayout(b, 300, b.h);
  assert.equal(L.porches.length, 4); assert.equal(L.stairs.length, 4);
  for (const p of L.porches) { const [, v] = L.frame.toLocal(p.entrance.x, p.entrance.z); assert.ok(v >= p.v1 - 1e-6, `entrance v ${v}`); assert.ok(near(p.entrance.th, L.frame.inTh)); }
  assert.ok(L.walls.some(w => w.face === 'back') && L.walls.some(w => w.face === 'street') && L.walls.some(w => w.face === 'end'));
  assert.equal(L.ring, b.ring);
});

test('bodenackerHouse_6c_IsTheThirdEntranceFromTheNorth', { skip: !block() && 'run pipeline/osm.py build first' }, () => {
  const L = bodenackerLayout(block(), 300, 25.3), h = bodenackerHouse(L, '6c');
  assert.equal(h.porch.house, '6c'); assert.equal(h.stair.house, '6c'); assert.equal(h.porch.u, h.stair.u);
  assert.ok(Math.abs(h.porch.u - -10.6) < 0.3);                                   // houseOrder 'northToSouth'
  assert.ok(bodenackerHouse(L, '6a').porch.u > h.porch.u);
});

test('bodenackerHouse_UnknownHouse_Throws', () => {
  assert.throws(() => bodenackerHouse({ porches: [], stairs: [] }, '6e'), /unknown house 6e/);
});
```

- [ ] **Step 2: run, expect failure.**
- [ ] **Step 3: implement** the five functions. `bodenackerLayout` is the only one `index.html` calls.
- [ ] **Step 4: run, expect pass.** `verify:` `node --test prototype/tests/*.test.mjs` → whole suite green.

## Task 4: textures and the glass role (`index.html`)

**Files:** `prototype/index.html`.

- [ ] **Step 1:** next to `TEX.rowHouse` (comment "#45: Bodenackerstrasse row houses") add `TEX.bodenacker` (256 × 128),
  `TEX.bodenackerLoggia` (256 × 128, the back side) and `TEX.plasterWhite` (64 × 64) exactly as the spec's "Façade texture design" and
  "Roles and materials" list (plaster + local LCG speckle, storey joint; window tile: frame, shutter box with slats, glass with
  reflection and mullion, sill shadow; loggia tile: dark recessed opening, inner top shadow, light reveal strips, railing band with bars).
  The loggia tile is painted flat: no geometry, nothing projects. A comment names the issue and
  says "painted from the description of the reference, not traced; no rr()".
- [ ] **Step 2:** in the role → texture map inside `mat: (role) =>` add `bodenacker: TEX.bodenacker, bodenackerLoggia: TEX.bodenackerLoggia,
  plasterWhite: TEX.plasterWhite, glass: null`, and before the Lambert default add the `glass` material from the spec (`MeshPhongMaterial`, `vertexColors`,
  `transparent`, `opacity 0.35`, `side: DoubleSide`, `depthWrite: false`).
- [ ] **Step 3:** `verify:` open `prototype/index.html` via `python3 -m http.server` is **not** required here; the Playwright
  check in Task 6 covers it. Static check: `node --check` does not apply to HTML, so run
  `grep -c "TEX.bodenacker\|TEX.bodenackerLoggia\|TEX.plasterWhite\|glass:" prototype/index.html` → ≥ 4.

## Task 5: the model in `osmBuilding` (`index.html`)

**Files:** `prototype/index.html`.

- [ ] **Step 1:** import next to the `holzbruecke.js` import: `import { isBodenacker6, bodenackerLayout, BODENACKER6 } from './bodenacker6.js';`.
- [ ] **Step 2:** add `function bodenackerBuilding(b, base, h)` after `osmBuilding`:
  1. `let L; try { L = bodenackerLayout(b, base, h); } catch (e) { console.warn(e.message); return false; }` — the caller
     then takes the generic path (fail loudly, never a hole).
  2. body walls, one extrusion per face role: group `L.walls` by `face` and draw each group with the same body ring but only its
     walls — `'back'` walls with role `'bodenackerLoggia'`, `'street'` and `'end'` walls with `'bodenacker'` (white colour, gravel
     roof colour `#8f8a84` as today, `uPerFace = [BODENACKER6.moduleWidth, L.floors.pitch]`). If `extrudeFootprint` cannot draw a
     subset of the edges, add a small `wallQuads(walls, base, h, role)` helper next to it that emits one vertical quad per wall
     (same UV rule as `extrudeFootprint`: u restarts per wall) and let `extrudeFootprint` draw only the roof/top of the body. The
     body must not grow any geometry beyond the ring: loggias are flush, texture only.
  3. parapet band: `extrudeFootprint(bodyWorldRing, base + h, BODENACKER6.parapet, col('#ffffff'), 'plasterWhite', col('#8f8a84'))`.
     (`extrudeFootprint` starts walls 2 m under its base; that overlap is inside the body, invisible.)
  4. roof-top housings (Q1; skipped when `housingRise === 0`): for each `s` of `L.stairs`:
     `const [x, z] = L.frame.toWorld(s.u, (s.vFront + s.vBack) / 2)`;
     `box(s.w, BODENACKER6.housingRise, s.d, x, L.floors.roof, z, L.frame.rot, col('#ffffff'), 'plasterWhite', [4, 3], 0)`.
     Check the sign of the local → world rotation against `box()` (`rotateY(-rot)`): the unit test pins the frame, the
     Playwright test pins the drawn housing, so a mismatch shows up there and nowhere else.
  5. porches: for each `p` of `L.porches` (footprint = the OSM bump, `p.w` × `p.d`, centred at `u = p.u`, `v = (p.v0 + p.v1)/2`): four
     corner posts (`box` 0.15 × 3.0 × 0.15, `'plasterWhite'`, colour `#3a3f47`), roof slab (`box` `(p.w + 0.2)` × 0.25 × `(p.d + 0.2)`
     at y `base + 3.0`, colour `#c9ccd0`, `'plasterWhite'`), two side panes (on the u-sides) and the front pane split into two side
     lights as `PlaneGeometry` rotated into the frame (push role `'glass'`, colour `#bfd6e4`), the door leaf as a
     `box` 1.0 × 2.2 × 0.05 (`'plasterWhite'`, colour `#3a3f47`) centred on `p.entrance` (street face, +v). The rear of the porch is
     the body façade, no pane there. Helper `porchMesh(p, frame, base)` ≤ 20 lines; panes via a small `pane(u0, u1, v, y0, y1)` helper.
  6. collisions: `pushOBB({ x: cx, z: cz, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), h: L.floors.roof, ring: b.ring })`
     (the OSM ring = body + porches, as today); no extra OBBs — the porches are solid until #411.
  7. `window.__mm.counts.bodenacker6 = 1; window.__mm.bodenacker6 = () => L;` and `return true`.
- [ ] **Step 3:** in `osmBuilding`, flat path, directly after the line that draws `wc` from `rr()`:
  `if (isBodenacker6(b) && bodenackerBuilding(b, base, h)) return;   // #410: own model; the rr() draw above keeps every later colour`.
- [ ] **Step 4:** `verify:` `node --test prototype/tests/*.test.mjs` still green (index.html is not under node, but the
  module is); then `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_smoke.py -q` **after Task 7's
  commit and push**, foreground — the page must load with an empty console.

## Task 6: Playwright check (test first, then run)

**Files:** `prototype/tests/test_bodenacker6.py`, `prototype/tests/test_row_houses.py` (comment only).

- [ ] **Step 1:** create `test_bodenacker6.py` from the `test_row_houses.py` pattern (`WORLD`, `MMH_ROUTE`, `ARGS`,
  `needs_world`, `open_page`, the `server` fixture). Docstring: "#410: the Bodenackerstrasse 6 model. Slow (Playwright): run
  in the foreground." Three tests:

```python
BLOCK_ID = 171822634   # Bodenackerstrasse 6a–6d, Sisseln (OSM); ten storeys per the federal building register

def east_facade_point(b, u, v_facade, out=12.0):
    """A point `out` m east (+v) of the façade line at local u, and the façade point it aims at (box frame as in bodenacker6.js)."""
    cx, cz, w, d, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
    to_world = lambda lu, lv: (cx + lu * c - lv * s, cz + lu * s + lv * c)
    x, z = to_world(u, v_facade + out); tx, tz = to_world(u, v_facade - 1.0)
    return x, z, tx, tz

@needs_world
def test_block_is_drawn_from_the_model_with_four_porches_and_stairs(server): ...
    # counts["bodenacker6"] == 1; layout = page.evaluate("() => window.__mm.bodenacker6()"); len(layout["porches"]) == 4 == len(layout["stairs"])
    # porches' u within 0.3 of [-23.2, -10.6, 4.3, 19.1]; "glass" in roles

@needs_world
def test_facades_by_side_and_the_roof_housing_is_plain(server): ...
    # between porches 2 and 3 (u = -3.0, façade v from the body ring): wallRoleAt(...) == "bodenacker" at up=5 from 12 m east
    # from 12 m WEST of the back wall: wallRoleAt(...) == "bodenackerLoggia" at up=5
    # stair 3 (u 4.3): wallRoleAt(x, z, tx, tz, up=b["h"] + 1.5) == "plasterWhite"  (above the roof only the housing is there)
    # porch 3 front at up=1.5, aimed at the street face: wallRoleAt(...) == "glass"

def test_hand_layout_has_no_bodenacker_model(server): ...
    # block_world=True: counts.get("bodenacker6", 0) == 0
```

  Take the aim heights from the world's `h` (25.3), never hard-code storey numbers beyond `BODENACKER6.storeys`.
- [ ] **Step 2:** in `test_row_houses.py` change the `OTHER_ID` comment "eight storeys" to "ten storeys" (GWR); nothing else.
- [ ] **Step 3: commit and push** (Task 7 Step 1) **before** running anything in a browser.
- [ ] **Step 4: run, foreground:** `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_bodenacker6.py -q`
  (`timeout` generous, 600000). `verify:` 3 passed. If `wallRoleAt` hits `glass` or `plasterWhite` where `bodenacker` is
  expected, the aim point is on a porch or housing: move `u`, do not loosen the assertion.
- [ ] **Step 5: affected tests only** (memory rule: targeted, not the full suite):
  `../prototype/tests/test_row_houses.py` and `../prototype/tests/test_building_collision.py`. `verify:` both green.
  `test_row_houses` asserts `hits[OTHER_ID] not in (None, "rowHouse")` — `"bodenacker"` satisfies it.

## Task 7: changelog, commit, PR

**Files:** `CHANGELOG.md`.

- [ ] **Step 1 (before Task 6's browser runs):** commit the work so far on `feature/410-bodenackerstrasse-6-model`
  (`feat(buildings): model Bodenackerstrasse 6 from its own data` — body: ten storeys per GWR, glass porches from the
  OSM outline, recessed-loggia back side, own texture; `Closes #410`), push.
- [ ] **Step 2:** `CHANGELOG.md` `[Unreleased]` → `Added`, player voice, time in Swiss local time, e.g.: "The block
  **Bodenackerstrasse 6a–6d** in Sisseln now looks like the real thing from the outside: **ten storeys**, four
  **glass entrance porches** with a flat roof on the street side, and recessed loggias on the back. The façade is the
  game's own painted texture (white plaster, dark window bands with roller-shutter boxes)." Nothing about the inside.
- [ ] **Step 3:** final `node --test prototype/tests/*.test.mjs`; `verify:` green. Commit (`docs(changelog): …` or amend
  into the feature commit), push, open the PR with the template sections (Summary, Changes, Testing: node tests, the
  three Playwright files run, no E2E; Checklist). The PR description lists the spec's open questions Q1–Q3 as "defaults
  implemented, flip the constant in `BODENACKER6` when answered" (Q1: `housingRise`; set it to 0 if there is no roof-top housing).
- [ ] **Step 4:** report: the two Playwright screenshots are **not** required; if a screenshot is taken for the PR, it is
  the game's own render (fine to attach), never a Street View or geo.admin image.

## Out of scope (do not do)

- Anything inside the building: stair hall, lift, landing windows, the roof as a level (#411).
- Marking/prompt/register wiring (#409); flipping `ready` for `bodenackerstrasse-6c` (#411).
- The twin block 1a–1d, hedges, protruding balconies, own-photo textures (follow-up issues if wanted).
- Hub screenshot regeneration (`freaxnx01.github.io`), release tagging.
