# Hamburg Speicherstadt in star room 5 (#666) Implementation Plan

**Goal:** star room 5 of the hideout holds a part of the Hamburg Speicherstadt: a 120 × 12 m Fleet with three
red-brick warehouses per bank and two bridges, all built from three.js primitives; the warehouses, the canal kerbs and
the bridge parapets are solid, the car drives along both quays and across both bridges on gravel, the helicopter
flies round and over; nothing is downloaded; the spoke stays unsigned.

**Spec:** `docs/superpowers/specs/2026-11-04-hideout-speicherstadt-design.md` (numbers, placement, assumptions).

**Architecture:** one new pure module `speicher.js` (descriptor `SPEICHER`, `warehouseParts`, `speicherPlacement`;
`node --test`), one new mesh module `speichermesh.js` (three.js, like `artemismesh.js`, not unit-tested), `rooms.js`
wires the placement into `roomLayout` exactly as Artemis is wired (`rooms.js:118-120, 142-143`), `index.html` builds
the meshes in `roomMeshes` as it builds Artemis (`index.html:3183, 3220-3226`).

**Deadline:** merged Monday evening 2026-11-09, live Tuesday 2026-11-10 15:15. One pipeline run. If a task runs long,
cut the look (fewer window bands), never the colliders or the tests.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework, `const`/`let` only. No model file, no
  `CREDITS.md`, README, licence or `strings.js` change.
- TDD for the pure modules: write the failing test, run it red, implement, run green. Never edit a test to make it
  pass; the test rewrites in Task 3 *are* the specified change and come before the code.
- Node tests: `node --test tests/<file>.test.mjs` per task; at the end of each pure task `node --test tests/*.test.mjs`.
- Browser tests: run **only** `pytest tests/test_hideout.py -k speicher` (one test), in the **foreground**, never
  `run_in_background`, generous `timeout`. Never the full Playwright suite. Commit and push the branch **before**
  starting the Playwright run.
- After every task: commit and push. After the first task: open a draft PR.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 6). Never run `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, footer `Refs #666`; the last commit `Closes #666`.
  Branch `feature/666-speicherstadt-room`.

Files: new `speicher.js`, `speichermesh.js`, `tests/speicher.test.mjs`; changed `rooms.js`, `index.html`,
`tests/rooms.test.mjs`, `tests/test_hideout.py`, `CHANGELOG.md`.

---

### Task 1: the descriptor and the warehouses (`speicher.js`: `SPEICHER`, `warehouseParts`)

**Files:** `tests/speicher.test.mjs` (new), `speicher.js` (new).

**Interfaces:**

```js
// speicher.js -- #666: a part of the Hamburg Speicherstadt as numbers (pure, no three.js, no DOM)
// Frame: x along the room's forward axis (a), z across (b), y = 0 on the floor.
export const SPEICHER = {
  key: 'speicher', h: 30,
  fleet: { len: 120, hw: 6, lift: 0.12, kerb: { h: 0.6, hd: 0.5 } },   // canal a -60..60, b -6..6; kerb like rooms.js RIM
  quay: { b: 11, hw: 3, endA: 66 },                                      // gravel lanes at b = +-11, crossing at a = +-66
  block: { at: [-40, 0, 40], len: 30, depth: 20, front: 16, eaves: 24, ridge: 30, bands: 5, hoist: { w: 4, d: 2, y0: 12, y1: 27 } },
  bridge: { at: [-20, 20], hw: 5, span: 8, lift: 0.3, rail: { h: 1.0, hd: 0.25 } },   // deck a = at +- 5, b -8..8
  loop: 95,                                                              // the room's gravel loop, for the connector
  colours: { brick: 0x8e3d2e, roof: 0x3f4a4c, window: 0x2c2f33, trim: 0xd8cbb0, deck: 0x6b6b6b, rail: 0x7a3a2c, kerb: 0xb8b2a6, water: 0x6f9aa8 },
};
export function warehouseParts(cfg = SPEICHER);   // [{ kind: 'box'|'prism', x, z, w, d, y0, y1, colour }]
```

`kind: 'box'` is a box `w` (along x) × `d` (along z) from `y0` to `y1`; `'prism'` is a triangular gable prism with its
ridge along x, base `w` × `d` at `y0`, ridge line at `y1`. Per block (6 blocks: `at` × both banks, `z = side * (front + depth / 2)`):
1 brick body (`y 0 → eaves`), 1 roof prism (`eaves → ridge`, colour `roof`), `bands` window bands on the canal face
(`box`, `w = len - 4`, `d = 0.1`, `z = side * (front - 0.05)`, 2 m high, at `y0 = 1.2 + 4.8 * i`, colour `window`) and 1 hoist bay
(`box`, `w = hoist.w`, `d = hoist.d`, `z = side * (front - hoist.d / 2)`, `y hoist.y0 → hoist.y1`, colour `trim`): 8 parts per block, 48 in all.

- [ ] **Step 1: write the failing tests.** Create `tests/speicher.test.mjs`:

```js
// #666: the Speicherstadt block -- pure. node --test tests/speicher.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEICHER, warehouseParts } from '../speicher.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('SPEICHER_IsLifeSize_BlocksAre30mLong_AlleysAre10m_TheFleetIs120By12', () => {
  const B = SPEICHER.block, F = SPEICHER.fleet;
  assert.equal(SPEICHER.key, 'speicher'); near(SPEICHER.h, B.ridge, 1e-9);
  near(F.len, 120, 1e-9); near(F.hw * 2, 12, 1e-9);
  assert.deepEqual(B.at, [-40, 0, 40]);
  for (let i = 1; i < B.at.length; i++) near(B.at[i] - B.at[i - 1] - B.len, 10, 1e-9, 'alley');
  for (const x of SPEICHER.bridge.at) assert.ok(B.at.some((a, i) => i < 2 && x > a + B.len / 2 && x < B.at[i + 1] - B.len / 2), 'each bridge sits in an alley');
  assert.ok(B.front > SPEICHER.quay.b + SPEICHER.quay.hw, 'the warehouse fronts stand clear of the quay lane');
  assert.ok(SPEICHER.fleet.hw + SPEICHER.fleet.kerb.hd < SPEICHER.quay.b - SPEICHER.quay.hw, 'the kerb stands clear of the quay lane');
});

test('warehouseParts_SixBlocksOfEightParts_RoofsEndAtTheRidge_NothingAboveIt', () => {
  const parts = warehouseParts(SPEICHER), B = SPEICHER.block, C = SPEICHER.colours;
  assert.equal(parts.length, 48);
  for (const p of parts) { assert.ok(['box', 'prism'].includes(p.kind)); assert.ok(p.w > 0 && p.d > 0 && p.y1 > p.y0, `${p.kind} size`); assert.equal(typeof p.colour, 'number'); }
  near(Math.max(...parts.map(p => p.y1)), SPEICHER.h, 1e-9, 'the ridge is the top');
  const bodies = parts.filter(p => p.kind === 'box' && p.colour === C.brick), roofs = parts.filter(p => p.kind === 'prism');
  assert.equal(bodies.length, 6); assert.equal(roofs.length, 6);
  for (const p of bodies) { near(p.y0, 0, 1e-9); near(p.y1, B.eaves, 1e-9); near(p.w, B.len, 1e-9); near(p.d, B.depth, 1e-9); }
  for (const p of roofs) { near(p.y0, B.eaves, 1e-9); near(p.y1, B.ridge, 1e-9); assert.equal(p.colour, C.roof); }
  assert.equal(parts.filter(p => p.colour === C.window).length, 6 * B.bands);
  assert.equal(parts.filter(p => p.colour === C.trim).length, 6);
});

test('warehouseParts_ThreeBlocksPerBank_NothingInTheCanalOrTheQuayLanes', () => {
  const parts = warehouseParts(SPEICHER), B = SPEICHER.block;
  for (const side of [-1, 1]) assert.deepEqual(parts.filter(p => p.kind === 'prism' && Math.sign(p.z) === side).map(p => p.x).sort((a, b) => a - b), B.at);
  for (const p of parts) assert.ok(Math.abs(p.z) - p.d / 2 >= SPEICHER.quay.b + SPEICHER.quay.hw - 1e-9, `${p.kind} at z ${p.z} reaches into the quay lane`);
});
```

- [ ] **Step 2: run red.** `node --test tests/speicher.test.mjs` fails (module missing).
- [ ] **Step 3: implement `speicher.js`** with the descriptor above and `warehouseParts` (a small helper `part(kind, x, z, w, d, y0, y1, colour)`;
  loop `side` of `[-1, 1]` and `a` of `block.at`).
- [ ] **Step 4: run green.** `node --test tests/speicher.test.mjs` → 3 pass.
- [ ] **Step 5: commit and push** `feat(hideout): Speicherstadt warehouses as numbers (speicher.js)` — `Refs #666`; open the draft PR.

**verify:** `node --test tests/speicher.test.mjs` → 3 pass.

---

### Task 2: placement in the room (`speicherPlacement`)

**Files:** `tests/speicher.test.mjs`, `speicher.js`.

**Interface:**

```js
// where the Fleet, the warehouses and the bridges stand in a room ({ centre, frame: { f, v }, portal: { c }, y } as artemisPlacement takes it):
// -> { water: { x, z, th, len, wid, y }, bridges: [{ x, z, th, wid, len, y }], quay: [[x, z] * 5, closed], connector: [[x, z], [x, z]], colliders }
// colliders (all `low: true`, shape { x, z, hw, hd, c, s, h, low, speicher: 'warehouse' | 'kerb' | 'rail' }, c, s = f except where noted):
//  - 6 warehouses: centre (at, side * (front + depth / 2)), hw len / 2, hd depth / 2, h = y + ridge + 2
//  - 8 kerbs: per bank (b = side * fleet.hw) three segments between the bridge gaps (a -60..at0-(hw+0.3), between, at1+(hw+0.3)..60),
//    hd kerb.hd, h = y + kerb.h; plus two end caps at a = +-(len / 2 + 0.5), hw 0.5, hd fleet.hw + kerb.hd
//  - 4 rails: per bridge a = at +- bridge.hw, b = 0, hw rail.hd (along f), hd bridge.span (along v), h = y + rail.h
// quay: closed rectangle (+-endA, +-quay.b) in the order (-,-) (+,-) (+,+) (-,+) (-,-); connector: (-loop, 0) -> (-endA, 0), both in the room frame
export function speicherPlacement(room, cfg = SPEICHER);
```

- [ ] **Step 1: write the failing tests** (append to `tests/speicher.test.mjs`):

```js
import { speicherPlacement } from '../speicher.js';
import { roomLayout, ROOM_Y } from '../rooms.js';

const R5 = roomLayout(5), CAR_R = 2.6;
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const toWorld = (R, a, b) => [R.centre[0] + R.frame.f[0] * a + R.frame.v[0] * b, R.centre[1] + R.frame.f[1] * a + R.frame.v[1] * b];
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const S = speicherPlacement({ centre: R5.centre, frame: R5.frame, portal: R5.portal, y: ROOM_Y }, SPEICHER);
const by = (k) => S.colliders.filter(c => c.speicher === k);
const free = (x, z) => !S.colliders.some(c => inside(c, x, z, CAR_R));

test('speicherPlacement_EighteenLowColliders_WarehousesKerbsAndParapets_SolidToTheirTops', () => {
  assert.equal(S.colliders.length, 18); for (const c of S.colliders) { assert.equal(c.low, true); assert.ok(c.h > ROOM_Y); }
  assert.equal(by('warehouse').length, 6); assert.equal(by('kerb').length, 8); assert.equal(by('rail').length, 4);
  for (const w of by('warehouse')) { near(w.h, ROOM_Y + SPEICHER.block.ridge + 2, 1e-9); const [a, b] = toLocal(R5, w.x, w.z); assert.ok(SPEICHER.block.at.some(x => Math.abs(x - a) < 1e-6)); near(Math.abs(b), SPEICHER.block.front + SPEICHER.block.depth / 2, 1e-6); }
  for (const k of by('kerb')) near(k.h, ROOM_Y + SPEICHER.fleet.kerb.h, 1e-9);
});

test('speicherPlacement_TheKerbsLeaveA_GapAtEachBridge_AndTheCarCrossesOnTheDeck_NotInTheWater', () => {
  for (const x of SPEICHER.bridge.at) {
    for (const b of [-11, -4, 0, 4, 11]) assert.ok(free(...toWorld(R5, x, b)), `deck free at ${x},${b}`);
    for (const dx of [-5, 5]) assert.ok(!free(...toWorld(R5, x + dx, 0)), `parapet solid at ${x + dx}`);
  }
  for (const a of [-50, 0, 50]) { assert.ok(!free(...toWorld(R5, a, 6)), `kerb solid at ${a}`); assert.ok(!free(...toWorld(R5, a, -6)), `kerb solid at ${a}`); }
  assert.ok(!free(...toWorld(R5, 60.5, 0)), 'the east end cap'); assert.ok(!free(...toWorld(R5, -60.5, 0)), 'the west end cap');
});

test('speicherPlacement_QuayAlleysAndTheLoopAreFree_WarehousesAreSolid', () => {
  for (const [a, b] of [[-50, 11], [0, 11], [50, -11], [-66, 0], [66, 5], [20, 25], [-20, -25], [95, 0], [0, 95]]) assert.ok(free(...toWorld(R5, a, b)), `free at ${a},${b}`);
  for (const [a, b] of [[0, 26], [-40, -26], [40, 26]]) assert.ok(!free(...toWorld(R5, a, b)), `warehouse at ${a},${b}`);
  for (const [x, z] of [...S.quay, ...S.connector]) assert.ok(free(x, z), 'the gravel paths are drivable');
  assert.equal(S.quay.length, 5); assert.deepEqual(S.quay[0], S.quay[4]);
  assert.deepEqual(toLocal(R5, ...S.connector[0]).map(Math.round), [-SPEICHER.loop, 0]); assert.deepEqual(toLocal(R5, ...S.connector[1]).map(Math.round), [-SPEICHER.quay.endA, 0]);
});

test('speicherPlacement_WaterAndBridgesStandOnTheirSpots', () => {
  assert.deepEqual([S.water.x, S.water.z], R5.centre); near(S.water.len, 120, 1e-9); near(S.water.wid, 12, 1e-9); near(S.water.y, ROOM_Y + SPEICHER.fleet.lift, 1e-9);
  assert.equal(S.bridges.length, 2); S.bridges.forEach((b, i) => { assert.deepEqual([b.x, b.z], toWorld(R5, SPEICHER.bridge.at[i], 0)); near(b.y, ROOM_Y + SPEICHER.bridge.lift, 1e-9); near(b.wid, 10, 1e-9); near(b.len, 16, 1e-9); });
});
```

  (`roomLayout(5)` is still the empty room here; the placement only needs the frame.)
- [ ] **Step 2: run red** (`speicherPlacement` missing).
- [ ] **Step 3: implement `speicherPlacement`** in `speicher.js` (no import from `rooms.js`: it would be circular). Use
  `loc(a, b)` as in `artemisPlacement`; `th = atan2(f[1], f[0])`.
- [ ] **Step 4: run green.** `node --test tests/speicher.test.mjs` → 7 pass.
- [ ] **Step 5: commit and push** `feat(hideout): place the Fleet, the warehouses and the bridges in a room` — `Refs #666`.

**verify:** 7 pass.

---

### Task 3: room 5 takes the object (`rooms.js`, `tests/rooms.test.mjs`)

**Files:** `tests/rooms.test.mjs`, `rooms.js`.

**Interfaces (changes):**

```js
import { SPEICHER, speicherPlacement } from './speicher.js';
export const ROOMS = [ …, { id: 'room5', name: 'Speicherstadt', object: SPEICHER, signed: false }, … ];   // #666
// NEXT_ROOMS unchanged: [7, 2, 6, 3, 5, 4] -- comment: 7, 2, 6, 3 and 5 are taken, 4 is next
// roomLayout(k) returns additionally: speicher: { water, bridges, quay, connector, colliders } | null,
// and two more paths when set: { pts: quay, hw: quay.hw }, { pts: connector, hw: quay.hw }
```

- [ ] **Step 1: change the affected tests first** in `tests/rooms.test.mjs`:
  - line 27: `for (const r of ROOMS.slice(4, 6)) {…}` → `for (const r of [ROOMS[4]]) {…}`, and add
    `assert.equal(ROOMS[5].object, SPEICHER); assert.equal(ROOMS[5].name, 'Speicherstadt'); assert.equal(ROOMS[5].signed, false);`
    (import `SPEICHER` from `'../speicher.js'`; rename the test to say "…Eiffel, Atomium, Artemis, Vasa, Speicherstadt, Ferris wheel and Titanic have an object" if its name lists them).
  - Leave `NEXT_ROOMS_…` (`:31-37`) and `spokeSigns_…` untouched: they must stay green by themselves (A6, A7).
- [ ] **Step 2: add the new tests** at the end of the file:

```js
import { SPEICHER } from '../speicher.js';
const speicher = rooms[5];
test('roomLayout_Room5HoldsTheSpeicherstadt_FleetOnTheCentre_UnsignedLikeTheOthers', () => {
  assert.deepEqual([speicher.tower.x, speicher.tower.z], speicher.centre); assert.deepEqual(speicher.feet, []); assert.equal(speicher.hull.length, 0); assert.equal(speicher.basin, null);
  assert.ok(speicher.speicher); assert.deepEqual([speicher.speicher.water.x, speicher.speicher.water.z], speicher.centre);
  assert.ok(speicher.towerView && !blocked(speicher, speicher.towerView.x, speicher.towerView.z));
  for (const R of rooms.filter(r => r.k !== 5)) assert.equal(R.speicher, null);
});

test('roomLayout_Room5_WarehousesKerbsAndParapetsAreSolid_QuaysAlleysAndDecksAreFree', () => {
  for (const [a, b] of [[0, 26], [-40, -26], [50, 6], [-20 - 5, 0], [20 + 5, 0], [60.5, 0]]) assert.ok(blocked(speicher, ...toWorld(speicher, a, b), 0), `solid at ${a},${b}`);
  for (const [a, b] of [[0, 11], [-50, -11], [20, 0], [-20, 4], [20, 25], [95, 0], [0, -95], [-66, 0]]) assert.ok(!blocked(speicher, ...toWorld(speicher, a, b)), `free at ${a},${b}`);
  for (const P of speicher.paths) for (const [x, z] of P.pts) assert.ok(!blocked(speicher, x, z), 'every gravel path is drivable');
});

test('roomLayout_Room5_FourPaths_QuayRingAndConnector_TheCarCrossesTheBridgesButNotTheWater', () => {
  assert.equal(speicher.paths.length, 4); assert.equal(speicher.paths[2].hw, SPEICHER.quay.hw); assert.equal(speicher.paths[2].pts.length, 5); assert.equal(speicher.paths[3].pts.length, 2);
  const r = reach(speicher), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  assert.ok(cell(20, 0) && cell(-20, 0), 'both bridge decks'); assert.ok(cell(0, 12) && cell(0, -12), 'both quays');
  assert.ok(!cell(0, 0) && !cell(-40, 0) && !cell(40, 0), 'the water is not reachable'); assert.ok(r.seen.size > 4000);
});
```

- [ ] **Step 3: run red.** `node --test tests/rooms.test.mjs`.
- [ ] **Step 4: implement** in `rooms.js`: the import, the `ROOMS[5]` entry, the comment on `NEXT_ROOMS` and the header
  comment (line 4: the room list), and in `roomLayout` directly after the Artemis lines (`:118-120`):

```js
  // #666: a part of the Hamburg Speicherstadt (speicher.js places it; speichermesh.js builds it): Fleet, six warehouses, two bridges
  const speicher = (room.object && room.object.fleet) ? speicherPlacement({ centre, frame: { f, v }, portal: { c: P }, y: Y }, room.object) : null;
  if (speicher) colliders.push(...speicher.colliders);
```

  after `:143` the paths `if (speicher) paths.push({ pts: speicher.quay, hw: room.object.quay.hw }, { pts: speicher.connector, hw: room.object.quay.hw });`
  and `speicher` in the returned object next to `artemis`.
- [ ] **Step 5: run green** `node --test tests/rooms.test.mjs`, then all `node --test tests/*.test.mjs`
  (`underground.test.mjs`, `room-fly.test.mjs`, `enterables.test.mjs` read `ROOMS`/`roomLayout`: they must stay green with no edit).
- [ ] **Step 6: commit and push** `feat(hideout): star room 5 holds the Speicherstadt` — `Refs #666`.

**verify:** `node --test tests/*.test.mjs` all pass.

---

### Task 4 (graphics task): the meshes and the room build (`speichermesh.js`, `index.html`)

**Files:** `speichermesh.js` (new), `index.html`.

Not unit-tested (three.js); verified by Task 5's browser test and a look at the screenshot it leaves.

**Interfaces:**

```js
// speichermesh.js -- #666: the Speicherstadt block as meshes, built from speicher.js's numbers
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPEICHER, warehouseParts } from './speicher.js';
export function buildWarehouses(cfg = SPEICHER);   // THREE.Group: x along f, z along v, y = 0 on the floor; one merged MeshLambertMaterial mesh per colour, userData.role = 'speicher'
export function speicherTriangles(group);          // like artemisTriangles
```

- [ ] **Step 1: `speichermesh.js`.** `box` parts → `BoxGeometry(w, y1 - y0, d)` translated to `(x, (y0 + y1) / 2, z)`; `prism` parts → a
  triangular gable prism (a `CylinderGeometry(radius, radius, w, 3)` rotated to lie along x, scaled to height `y1 - y0` and depth `d`, or an
  `ExtrudeGeometry` of a triangle: builder's call) with its ridge along x; group by `colour`, `mergeGeometries` per colour, one
  `MeshLambertMaterial({ color })` each, `userData.role = 'speicher'`. No textures, no text, no flag, no insignia.
- [ ] **Step 2: `index.html`.**
  - imports next to the Artemis ones (`index.html:666-668`): `import { SPEICHER } from './speicher.js'; import { buildWarehouses, speicherTriangles } from './speichermesh.js';`
  - `ROOM` (`:2994`): add `speicher: null`; reset it in the dispose line (`:3163`) with `ROOM.artemis = null`.
  - `roomMeshes` (`:3183`): `if (R.speicher) roomSpeicher(group, R);` next to the Artemis call.
  - new `roomSpeicher(group, R)` after `roomArtemis` (`:3220`):
    - the water: a flat `BoxGeometry(len, 0.02, wid)` at `S.water` (`x, R.y + fleet.lift, z`, rotated by `-S.water.th`), `MeshPhongMaterial({ color: colours.water, shininess: 160, specular: 0xd8e8ff })`, `renderOrder = 1`;
    - the kerbs: for each collider with `speicher === 'kerb'` a box of `2 * hw × kerb.h × 2 * hd` at `R.y + kerb.h / 2` (as `roomBasin` does for `B.rim`, `:3203-3205`), colour `colours.kerb`, merged;
    - the bridges: per `S.bridges[i]` a deck box `wid × 0.1 × len` at `bridge.y` (colour `deck`, `renderOrder = 1`) and, from the `rail` colliders, a parapet box each (`2 * hw × rail.h × 2 * hd`, colour `rail`);
    - `const wh = buildWarehouses(SPEICHER); wh.position.set(R.centre[0], R.y, R.centre[1]); wh.rotation.y = -R.portal.th; group.add(wh);`
    - `ROOM.speicher = { built: R.k, h: SPEICHER.h, tris: speicherTriangles(wh) + …, colliders: S.colliders.length, bridges: S.bridges.length };`
  - debug hook next to `__mm.artemis` (`:3422`):
    `window.__mm.speicher = () => ROOM.speicher && ROOM.built === ROOM.speicher.built ? { ...ROOM.speicher } : null;   // #666`
  - `grep -n "object.url" index.html` to confirm the only model-load guard is `ensureRoom`'s (no `url` on `SPEICHER`).
- [ ] **Step 3: look at it once** (no test yet): `python3 -m http.server 8000`, open `http://localhost:8000/?dev=1`, Testhub → hideout → ring,
  drive into spoke 5 (or run Task 5's test and open its screenshot). Warehouses read as red brick with dark roofs and light window bands, the
  Fleet as a blue-grey strip, the bridges as grey decks with brick parapets. Adjust colours only in `SPEICHER.colours`.
- [ ] **Step 4: commit and push** `feat(hideout): build the Speicherstadt in room 5` — `Refs #666`.

**verify:** `node --test tests/*.test.mjs` still green (nothing pure changed); `grep -c "role = 'speicher'" speichermesh.js` ≥ 1; the page's console is empty in Task 5.

---

### Task 5: the one browser test (`tests/test_hideout.py`)

**Files:** `tests/test_hideout.py`.

- [ ] **Step 1: push the branch first**, then write the test after `test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download` (`:1189`):

```python
@needs_world
def test_speicher_room_builds_the_fleet_and_warehouses_on_entering_without_a_download(server, tmp_path):
    """#666: entering spoke 5 builds the Speicherstadt (Fleet, six warehouses, two bridges) from primitives -- no model file is fetched;
    the warehouses, the kerbs and the parapets are solid, the quay, the alley and the bridge deck are open. Leaves a screenshot."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.speicher()") is None
        into_room(page, 5, "room5")
        page.wait_for_function("() => window.__mm.speicher() && window.__mm.speicher().built === 5", timeout=120000)
        s = page.evaluate("() => window.__mm.speicher()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(5, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          return { warehouse: p(0, 26), kerb: p(0, 6), rail: p(25, 0), quay: p(0, 11), alley: p(20, 25), deck: p(20, 0) }; }""")
        view = page.evaluate("() => { const v = window.__mm.below().tower, th = window.__mm.spoke(5, 0).th; return { x: v.x - Math.cos(th) * 90, z: v.z - Math.sin(th) * 90, th }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "speicher-room.png"))
        br.close()
    print("screenshot:", tmp_path / "speicher-room.png")
    assert errors == []
    assert requests == [], requests
    assert s["built"] == 5 and abs(s["h"] - 30) < 1e-6 and 300 <= s["tris"] <= 20000 and s["colliders"] == 18 and s["bridges"] == 2, s
    assert info["below"]["built"] == 5 and info["below"]["level"] == "room5" and info["below"]["object"] is True and info["counts"].get("speicher") == 1, info
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) > 0.5 for k in ("warehouse", "kerb", "rail")), push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("quay", "alley", "deck")), push
```

  (`ride`, `into_room`, `open_page`, `needs_world`, `math` already exist in the file: `:18, 22, 99, 932`.)
- [ ] **Step 2: run it, foreground, once:** `pytest tests/test_hideout.py -k speicher -x -q` (GPU browser via `PW_CDP_ENDPOINT` when set, as the other
  room tests; `timeout` ≥ 600 000 ms on the call). Open the screenshot it prints and check the look. If it fails on the push probes, fix the
  placement in `speicher.js` (and its node tests first); never loosen the test.
- [ ] **Step 3: commit and push** `test(hideout): the Speicherstadt room builds without a download and is solid where it should be` — `Refs #666`.

**verify:** 1 passed; `errors == []`; the screenshot shows the Fleet between its warehouses.

---

### Task 6: CHANGELOG, final checks

**Files:** `CHANGELOG.md`.

- [ ] **Step 1: CHANGELOG** under `## [Unreleased]` → `### Added`, at the top. Take the timestamp from `TZ=Europe/Zurich date '+%F %H:%M'` at commit time
  (format per CLAUDE.md: bold 1-3 keywords, keys in `<kbd>`). English, player-facing:

  > - `YYYY-MM-DD HH:MM` The hideout room **third on the left of the lift** now holds a part of the **Hamburg Speicherstadt**: six red-brick **warehouses** with gabled roofs on both sides of a 120 m **Fleet** (canal), with two **bridges** to drive across and gravel quays along both banks. The warehouses, the canal kerbs and the bridge parapets are solid; the helicopter (<kbd>F</kbd>) flies round the block and over the roofs. Everything is built from simple shapes in the game, no downloaded model.
- [ ] **Step 2: final checks:** `node --test tests/*.test.mjs` green; `git diff --stat origin/main` lists only the files of this plan; no `.glb`, no
  `CREDITS.md`/README/`strings.js` change.
- [ ] **Step 3: commit and push** `docs(changelog): Speicherstadt room` — `Closes #666`. The PR
  `feat(hideout): Hamburg Speicherstadt in star room 5 (#666)` gets Summary / Changes / Testing (node count, the one Playwright test, the screenshot) / Checklist,
  body ending with the attribution lines. Mergeable by Monday 2026-11-09 evening; the maintainer updates #420's table after the merge (not this PR).

**verify:** PR open, CI green, one CHANGELOG entry, no third-party files.
