# Rally hall in star room 5 (#859) Implementation Plan

**Goal:** star room 5 of the hideout holds an open-fronted rally hall (72 × 40 m, 14.8 m high) with three rally cars
life size on podiums (Toyota GR Yaris Rally1, Hyundai i20 N Rally1, Subaru Impreza WRC), all built from three.js boxes
and cylinders in plain unbranded paint; walls, posts, podiums and cars are solid, the car drives along a gravel apron
into the hall and round the podiums, the roof is a deck it drives under; nothing is downloaded; the spoke stays unsigned.

**Spec:** `docs/superpowers/specs/2026-11-11-hideout-rally-hall-design.md` (numbers, placement, assumptions).

**Architecture:** one new pure module `rallyhall.js` (descriptor `RALLYHALL`, `carParts`, `carExtent`,
`rallyhallPlacement`; `node --test`), one new mesh module `rallyhallmesh.js` (three.js, like `artemismesh.js`, not
unit-tested), `rooms.js` wires the placement into `roomLayout` exactly as the Artemis stack is wired (`rooms.js:150-151`,
`:177`), `index.html` builds the meshes in `roomMeshes` as it builds the Artemis room (`index.html:3611, 3648-3655`).
(`rally.js` is the drivable "Rhy Rally" vehicle — do not touch it, do not reuse its name.)

**Deadline:** merged Monday evening 2026-11-16, live Tuesday 2026-11-17 15:15. One pipeline run; no follow-ups planned. If
a task runs long, cut the look (fewer car parts), never the colliders or the tests.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework, `const`/`let` only. No model file, no
  `CREDITS.md`, README, licence or `strings.js` change (nothing third-party is used). **No lettering, logos, badges,
  numbers or sponsor colours anywhere** (plain single-colour paint per car).
- Files live in the repo root (not `prototype/`).
- TDD for the pure modules: write the failing test, run it red, implement, run green. Never edit a test to make it pass —
  the test rewrite in Task 3 *is* the specified change and comes before the code.
- Node tests: `node --test tests/<file>.test.mjs` per task; at the end of each pure task `node --test tests/*.test.mjs`.
- Browser test: run **only** `pytest tests/test_hideout.py -k rallyhall` (one test), in the **foreground**, never
  `run_in_background`, generous `timeout`. Never the full Playwright suite. Commit and push the branch **before** starting
  the Playwright run.
- Rendering is a graphics concern: **Task 4 is the graphics task**; it is sized so the default model can do it (every
  number comes from `rallyhall.js`; the mesh file is boxes and cylinders).
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 6). Never run
  `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, footer `Refs #859`; the last commit `Closes #859`. Branch
  `feature/859-rally-hall`. Commit and push after every task; open the draft PR after Task 1.

Files: new `rallyhall.js`, `rallyhallmesh.js`, `tests/rallyhall.test.mjs`; changed `rooms.js`, `index.html`,
`tests/rooms.test.mjs`, `tests/test_hideout.py`, `CHANGELOG.md`.

---

## Task 1: the descriptor and the cars (`rallyhall.js`: `RALLYHALL`, `carParts`, `carExtent`)

**Files:** `tests/rallyhall.test.mjs` (new), `rallyhall.js` (new).

**Interfaces:**

```js
// rallyhall.js -- #859: the rally hall and its three cars as numbers (pure, no three.js, no DOM)
export const RALLYHALL = {
  key: 'rallyhall', h: 14.8,                                // floor to the roof top
  hall: { w: 72, d: 40, wall: 0.6, post: 1.0, floor: 0.15, roof: { y0: 14.0, t: 0.8, canopy: 4 }, glass: { y0: 3, y1: 9 } },
  podium: { r: 4.5, h: 0.5, hw: 3.0, clear: 0.6 },
  apron: { from: 95, hw: 5 },                               // gravel strip from a = -95 to the roof edge
  cars: [                                                   // a, b: centre-relative (a towards the far wall); th: heading in the hall frame, PI = nose to the open front
    { id: 'neuville', at: [4, -22], th: Math.PI + 0.5, len: 4.10, wid: 1.88, hgt: 1.40, wheelbase: 2.60, wheelR: 0.33, wheelW: 0.30, colour: 0x3f7fd0 },   // light blue
    { id: 'evans',    at: [4, 0],   th: Math.PI,       len: 4.07, wid: 1.88, hgt: 1.40, wheelbase: 2.56, wheelR: 0.33, wheelW: 0.30, colour: 0xc23b2f },   // red
    { id: 'mccrae',   at: [4, 22],  th: Math.PI - 0.5, len: 4.34, wid: 1.77, hgt: 1.42, wheelbase: 2.52, wheelR: 0.32, wheelW: 0.28, colour: 0x1b2f78 },   // deep blue
  ],
  colours: { glass: 0x1b2330, dark: 0x202226, tyre: 0x17181a, rim: 0xb7b9bd, wall: 0xc9c8c2, roof: 0x8d9096, floor: 0x9b9a95, podium: 0xe6e6e2, band: 0x2c3b4d },
};
export function carParts(car, cfg = RALLYHALL);   // [{ kind: 'box', x, y, z, sx, sy, sz, colour } | { kind: 'wheel', x, y, z, r, w, colour }], car frame: +x nose, y up (tyres at 0), z across
export function carExtent(parts);                 // { len, wid, hgt, minY } over boxes and wheels (a wheel spans x ± r, y ± r, z ± w/2)
```

`carParts(car)` recipe (numbers are `car.*`; `L` = len, `W` = wid, `H` = hgt, `R` = wheelR): lower body box (`sx L, sy 0.50,
sz W`, y centre 0.39 → spans 0.14 – 0.64); cabin box (`sx 0.48 L, sy H − 0.64, sz 0.78 W`, centre x = −0.04 L, spans 0.64 – H,
car paint); window band (`sx 0.50 L, sy 0.38, sz 0.80 W`, y centre 0.97, colour `glass`); front splitter (`sx 0.30, sy 0.06,
sz 0.95 W`, x = L/2 − 0.15, y centre 0.12, `dark`); rear wing: plane (`sx 0.45, sy 0.05, sz 0.90 W`, x = −L/2 + 0.225, y centre
H − 0.025, `dark`) and two uprights (`sx 0.08, sy 0.3, sz 0.05`, at z = ±0.30 W, y centre H − 0.20, `dark`); four wheels (`kind
'wheel'`, x = ±wheelbase/2, z = ±(W/2 − wheelW/2), y = R, tyre colour `tyre`, plus a thinner rim wheel `r 0.62 R, w 0.6 wheelW`
in `rim` at the outer face). Check the extents add up: the lower body defines length and width, the cabin top defines height.

- [ ] **Step 1: write the failing tests.** Create `tests/rallyhall.test.mjs`:

```js
// #859: the rally hall and its three cars -- pure. node --test tests/rallyhall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RALLYHALL, carParts, carExtent } from '../rallyhall.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('RALLYHALL_ThreeCarsOfTheirRealSizes_EvansNeuvilleMcCrae', () => {
  assert.equal(RALLYHALL.key, 'rallyhall'); near(RALLYHALL.h, 14.8, 1e-9);
  assert.deepEqual(RALLYHALL.cars.map(c => c.id), ['neuville', 'evans', 'mccrae']);
  for (const c of RALLYHALL.cars) { assert.ok(c.len >= 4.0 && c.len <= 4.4, `${c.id} length`); assert.ok(c.wid >= 1.75 && c.wid <= 1.9, `${c.id} width`); assert.ok(c.hgt >= 1.35 && c.hgt <= 1.45, `${c.id} height`); }
  near(RALLYHALL.hall.roof.y0 + RALLYHALL.hall.roof.t, RALLYHALL.h, 1e-9, 'the roof top is the hall height');
});

test('carParts_ExtentsMatchTheCar_FourWheelsOnTheFloor_ARearWing', () => {
  for (const car of RALLYHALL.cars) {
    const parts = carParts(car, RALLYHALL), e = carExtent(parts);
    near(e.len, car.len, 0.05, `${car.id} len`); near(e.wid, car.wid, 0.05, `${car.id} wid`); near(e.hgt, car.hgt, 0.05, `${car.id} hgt`); near(e.minY, 0, 1e-9, 'tyres touch y = 0');
    const wheels = parts.filter(p => p.kind === 'wheel' && p.colour === RALLYHALL.colours.tyre);
    assert.equal(wheels.length, 4); for (const w of wheels) { near(w.r, car.wheelR, 1e-9); near(w.y, car.wheelR, 1e-9); near(Math.abs(w.x), car.wheelbase / 2, 1e-9); }
    assert.equal(new Set(wheels.map(w => `${Math.sign(w.x)},${Math.sign(w.z)}`)).size, 4, 'one wheel per corner');
    for (const b of parts.filter(p => p.kind === 'box')) assert.ok(b.y - b.sy / 2 >= 0.05 - 1e-9, `a ${b.colour} box is off the floor`);
    assert.ok(parts.some(p => p.kind === 'box' && p.x < -car.len / 2 + 0.6 && p.y > 0.9 && p.sz > 0.8 * car.wid), 'a rear wing');
  }
});

test('carParts_PlainPaintOnly_NoSponsorColoursNoThirdColour', () => {
  const C = RALLYHALL.colours;
  for (const car of RALLYHALL.cars) {
    const allowed = new Set([car.colour, C.glass, C.dark, C.tyre, C.rim]);
    for (const p of carParts(car, RALLYHALL)) assert.ok(allowed.has(p.colour), `${car.id}: unexpected colour ${p.colour.toString(16)}`);
  }
  assert.equal(new Set(RALLYHALL.cars.map(c => c.colour)).size, 3, 'three different paints');
});
```

- [ ] **Step 2: run red.** `node --test tests/rallyhall.test.mjs` fails (module missing).
- [ ] **Step 3: implement `rallyhall.js`** with the descriptor above, `carParts` per the recipe and `carExtent` (min/max over
  every part: boxes `x ± sx/2`, `y ± sy/2`, `z ± sz/2`; wheels `x ± r`, `y ± r`, `z ± w/2`; `len` = x range, `wid` = z range,
  `hgt` = max y, `minY` = min y). Adjust a recipe number only if an extent misses by more than 0.05 m — never a test.
- [ ] **Step 4: run green.** `node --test tests/rallyhall.test.mjs`, then `node --test tests/*.test.mjs`.
- [ ] **Step 5: commit and push** `feat(hideout): rally hall cars as numbers (rallyhall.js)` — `Refs #859`; open the draft PR.

**verify:** `node --test tests/rallyhall.test.mjs` → 3 pass; full node suite green.

---

## Task 2: placement in the room (`rallyhallPlacement`)

**Files:** `tests/rallyhall.test.mjs`, `rallyhall.js`.

**Interface:**

```js
// room = { centre: [x, z], frame: { f: [x, z], v: [x, z] }, y }  (the roomLayout() values, y = the floor)
export function rallyhallPlacement(room, cfg = RALLYHALL);
// -> { hall: { x, z, th }, cars: [{ id, x, z, th }], apron: [[x, z], [x, z]], colliders: [...9] }
```

`th` of the hall = `atan2(f[1], f[0])`; a car's world `th` = hall `th` + its descriptor `th` (v is f turned +90°). Colliders
in the solid form `{ x, z, hw, hd, c, s, h, low: true, rallyhall }` with `c, s = f` (hw along f, hd along v): back wall
(centre a = d/2 − wall/2, `hw` wall/2, `hd` w/2), two side walls (b = ±(w/2 − wall/2), `hw` d/2, `hd` wall/2), two posts (a = −d/2 +
post/2, b = ±(w/2 − post/2), `hw = hd` post/2) — all `h = y + cfg.h`; the roof (centre a = −canopy/2, `hw` (d + canopy)/2, `hd`
w/2, `h = y + cfg.h`, `bridge: true`, `y0 = y + roof.y0`); per car a square on its podium (`hw = hd = podium.hw`, `c, s` = f,
`h = y + podium.h + car.hgt + podium.clear`). `apron` runs from `loc(−apron.from, 0)` to `loc(−(d/2 + canopy), 0)`.

- [ ] **Step 1: write the failing tests.** Append to `tests/rallyhall.test.mjs`:

```js
import { rallyhallPlacement } from '../rallyhall.js';

const room = { centre: [1000, -2000], frame: { f: [0, 1], v: [-1, 0] }, y: -600 };   // the far wall lies along +z; v = f turned +90°
const loc = (a, b) => [room.centre[0] + room.frame.f[0] * a + room.frame.v[0] * b, room.centre[1] + room.frame.f[1] * a + room.frame.v[1] * b];
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };

test('rallyhallPlacement_HallAtTheCentre_CarsOnTheirPodiumsNosesToTheOpenFront', () => {
  const P = rallyhallPlacement(room, RALLYHALL), th = Math.atan2(room.frame.f[1], room.frame.f[0]);
  assert.deepEqual([P.hall.x, P.hall.z], room.centre); near(P.hall.th, th, 1e-9);
  assert.equal(P.cars.length, 3);
  RALLYHALL.cars.forEach((c, i) => {
    assert.equal(P.cars[i].id, c.id); assert.deepEqual([P.cars[i].x, P.cars[i].z], loc(...c.at)); near(P.cars[i].th, th + c.th, 1e-9);
    assert.ok(Math.cos(c.th) < 0, `${c.id}: nose towards the portal side (-a)`);
  });
});

test('rallyhallPlacement_NineColliders_AllLow_WallsToTheRoofTop_RoofIsABridge_CarsSolidAbove2m4', () => {
  const P = rallyhallPlacement(room, RALLYHALL), Y = room.y;
  assert.equal(P.colliders.length, 9); assert.ok(P.colliders.every(o => o.low === true && Number.isFinite(o.x) && o.hw > 0 && o.hd > 0));
  const bridges = P.colliders.filter(o => o.bridge); assert.equal(bridges.length, 1);
  near(bridges[0].y0, Y + 14.0, 1e-9, 'roof deck'); near(bridges[0].h, Y + 14.8, 1e-9, 'roof top');
  const solid = P.colliders.filter(o => !o.bridge && o.h >= Y + 14.8 - 1e-9); assert.equal(solid.length, 5, 'back wall, two side walls, two posts');
  const cars = P.colliders.filter(o => !o.bridge && o.h < Y + 14); assert.equal(cars.length, 3); for (const o of cars) assert.ok(o.h >= Y + 2.4);
});

test('rallyhallPlacement_BlocksTheCarAtWallsPostsAndPodiums_LeavesFloorUnderRoofApronAndLoopFree', () => {
  const P = rallyhallPlacement(room, RALLYHALL), CAR_R = 2.6;
  const blocked = (a, b, r = CAR_R) => P.colliders.some(o => !o.bridge && inside(o, ...loc(a, b), r));
  for (const [a, b] of [[19.7, 0], [0, 35.7], [0, -35.7], [-19.5, 35.5], [-19.5, -35.5], [4, -22], [4, 0], [4, 22]]) assert.ok(blocked(a, b, 0), `solid at ${a},${b}`);
  for (const [a, b] of [[-5, -11], [-5, 11], [4, -11], [4, 11], [12, 0], [-22, 0], [-23, 20], [-95, 0], [0, -95], [95, 0]]) assert.ok(!blocked(a, b), `free at ${a},${b}`);
  const [from, to] = P.apron; assert.deepEqual(from, loc(-95, 0)); assert.deepEqual(to, loc(-24, 0));
});
```

- [ ] **Step 2: run red.** `node --test tests/rallyhall.test.mjs` fails (`rallyhallPlacement` missing).
- [ ] **Step 3: implement `rallyhallPlacement`** per the interface above (`loc(a, b)` = centre + f·a + v·b; reuse the
  `box` helper pattern from `artemis.js:62`). If `-11` / `11` between podiums turns out blocked for the 2.6 m car
  radius, check the numbers in the descriptor (podium `hw` 3.0 at b = 0 / ±22 leaves 16 m) rather than the test.
- [ ] **Step 4: run green.** `node --test tests/rallyhall.test.mjs`, then `node --test tests/*.test.mjs`.
- [ ] **Step 5: commit and push** `feat(hideout): rally hall placement and colliders` — `Refs #859`.

**verify:** `node --test tests/rallyhall.test.mjs` → 6 pass; full node suite green.

---

## Task 3: room 5 takes the object (`rooms.js`, `rooms.test.mjs`)

**Files:** `tests/rooms.test.mjs`, `rooms.js`.

- [ ] **Step 1: write the failing tests.** In `tests/rooms.test.mjs`: (a) import `RALLYHALL` from `../rallyhall.js` next to the
  other imports; (b) in `ROOMS_EightRooms_...` (`:19-28`) change line 27 `for (const r of ROOMS.slice(4, 6))` to
  `for (const r of ROOMS.slice(4, 5))` and add, after the `ROOMS[3]` line:
  `assert.equal(ROOMS[5].object, RALLYHALL); assert.equal(ROOMS[5].name, 'Rally hall'); assert.equal(ROOMS[5].signed, false);`
  (this rewrite is the specified change: room 5 is no longer an empty room); (c) append:

```js
// #859: the rally hall in room 5
const hall = rooms[5];
test('roomLayout_Room5HoldsTheRallyHall_ThePlacementAndTheApronAreWired', () => {
  assert.deepEqual([hall.tower.x, hall.tower.z], hall.centre); assert.deepEqual(hall.feet, []); assert.equal(hall.hull.length, 0); assert.equal(hall.basin, null);
  assert.ok(hall.rallyhall); assert.deepEqual([hall.rallyhall.hall.x, hall.rallyhall.hall.z], hall.centre); assert.equal(hall.rallyhall.cars.length, 3);
  assert.ok(hall.towerView && !blocked(hall, hall.towerView.x, hall.towerView.z));
  for (const R of rooms.filter(r => r.k !== 5)) assert.equal(R.rallyhall, null);
  assert.deepEqual(NEXT_ROOMS, [7, 2, 6, 3, 5, 4]); assert.deepEqual(spokeSigns(ROOMS), []);
  assert.equal(hall.paths.length, 3); const apron = hall.paths[2]; assert.equal(apron.hw, RALLYHALL.apron.hw); assert.equal(apron.pts.length, 2);
  for (const [x, z] of apron.pts) assert.ok(!blocked(hall, x, z), 'the apron is drivable');
});

test('roomLayout_RallyHall_WallsPodiumsBlock_FloorAndApronDrive_FloodFillReachesBothSidesOfEveryPodium', () => {
  for (const [a, b] of [[19.7, 0], [0, 35.7], [0, -35.7], [4, -22], [4, 0], [4, 22]]) assert.ok(blocked(hall, ...toWorld(hall, a, b), 0), `solid at ${a},${b}`);
  for (const [a, b] of [[-5, -11], [4, 11], [12, 0], [-22, 0], [-60, 0], [-95, 0]]) assert.ok(!blocked(hall, ...toWorld(hall, a, b)), `free at ${a},${b}`);
  const r = reach(hall), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  for (const b of [-22, 0, 22]) { assert.ok(cell(-6, b), `front of the podium at b ${b}`); assert.ok(cell(13, b), `back of the podium at b ${b}`); }
});
```

- [ ] **Step 2: run red.** `node --test tests/rooms.test.mjs` fails (room 5 has no object).
- [ ] **Step 3: implement in `rooms.js`:** import `RALLYHALL, rallyhallPlacement` (next to `:7`); `ROOMS[5]` →
  `{ id: 'room5', name: 'Rally hall', object: RALLYHALL, signed: false },   // #859: the rally hall`; in `roomLayout` after the
  shuttle lines (`:156-157`): `const rallyhall = (room.object && room.object.cars) ? rallyhallPlacement({ centre, frame: { f, v }, y: Y }, room.object) : null;
  if (rallyhall) colliders.push(...rallyhall.colliders);`; after `:177`: `if (rallyhall) paths.push({ pts: rallyhall.apron, hw: room.object.apron.hw });`;
  add `rallyhall` to the returned object (`:185`); update the `NEXT_ROOMS` comment (`:34`: 5 is taken, 4 is last) and the
  header comment at `:4` (Rally hall in room 5). `NEXT_ROOMS` itself unchanged.
- [ ] **Step 4: run green.** `node --test tests/rooms.test.mjs`, then `node --test tests/*.test.mjs` (the other room tests —
  tree ring, paths, spoke signs — must stay green without edits).
- [ ] **Step 5: commit and push** `feat(hideout): room 5 holds the rally hall` — `Refs #859`.

**verify:** `node --test tests/rooms.test.mjs` → all pass; full node suite green.

---

## Task 4 (graphics task): the meshes and the room build (`rallyhallmesh.js`, `index.html`)

**Files:** `rallyhallmesh.js` (new), `index.html`.

No unit test (rendering, like `artemismesh.js`); the Task 5 browser test covers it.

- [ ] **Step 1: write `rallyhallmesh.js`** (pattern: `artemismesh.js:1-26`): `import * as THREE from 'three'; import { mergeGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js'; import { RALLYHALL, carParts } from './rallyhall.js';`
  - `buildCar(car, cfg = RALLYHALL)` → `THREE.Group` in the car's frame: for each part a `BoxGeometry(sx, sy, sz)` translated to
    `(x, y, z)` or a `CylinderGeometry(r, r, w, 16)` rotated `Math.PI / 2` about x (axis across the car, along z) translated to
    `(x, y, z)`; merge per colour into one `MeshLambertMaterial` mesh each (`userData.role = 'rallyhall'`), as `partsGroup` does
    (`.toNonIndexed()` before merging when mixing indexed geometries).
  - `buildHall(cfg = RALLYHALL)` → one `THREE.Group` in the hall frame (x along `f`, z along `v`, y = 0 on the floor): floor slab
    (`hall.w × floor × hall.d`, `colours.floor`), back wall, two side walls (`colours.wall`, `hall.h` high), two corner posts, the dark
    glass band on the back wall's inside (`colours.band`, y `glass.y0 … glass.y1`, 0.05 m off the wall), the roof slab
    (`colours.roof`, y `roof.y0 … + t`, `d + canopy` deep, centre a = −canopy/2), three round podiums (`CylinderGeometry`, r
    `podium.r`, h `podium.h`, `colours.podium`, at each car's `at`) and, on each, `buildCar(car)` at y = `podium.h` rotated
    `rotation.y = -car.th`. No text, no textures, no flags.
  - `rallyhallTriangles(group)` — the same traversal as `artemisTriangles` (`artemismesh.js:38-41`); import and re-export it
    or copy the six lines.
- [ ] **Step 2: wire `index.html`:** import `{ RALLYHALL } from './rallyhall.js'` and `{ buildHall, rallyhallTriangles } from
  './rallyhallmesh.js'` beside the Artemis imports (`:837-839`); add `rallyhall: null` to the `ROOM` state (`:3422`) and
  `ROOM.rallyhall = null` to the reset in `ensureRoom` (`:3591`); in `roomMeshes` (`:3611`) add `if (R.rallyhall) roomRallyhall(group, R);`;
  add next to `roomArtemis` (`:3648`):

```js
// #859: the rally hall and its three cars (rallyhall.js places them, rallyhallmesh.js builds them): one group stood on the floor at the
// room centre and turned to the room's frame. All goes with the room's group (disposeGroup); ROOM.rallyhall tells the debug hook what was built.
function roomRallyhall(group, R) {
  const H = R.rallyhall, hall = buildHall(RALLYHALL); hall.position.set(H.hall.x, R.y, H.hall.z); hall.rotation.y = -H.hall.th; group.add(hall);
  ROOM.rallyhall = { built: R.k, hall: H.hall, cars: H.cars, h: RALLYHALL.h, tris: rallyhallTriangles(hall), colliders: H.colliders.length };
}
```

  and after `window.__mm.artemis` (`:3929`): `window.__mm.rallyhall = () => ROOM.rallyhall && ROOM.built === ROOM.rallyhall.built ? { ...ROOM.rallyhall } : null;   // #859`.
- [ ] **Step 3: check without a browser:** `node --check rallyhall.js rallyhallmesh.js` is not enough for the `three` import; run
  `node --test tests/*.test.mjs` (green) and `grep -n "rallyhall" index.html` (import, `ROOM` slot, reset, `roomMeshes`, function, hook: six hits).
- [ ] **Step 4: commit and push** `feat(hideout): rally hall meshes and the room build` — `Refs #859`.

**verify:** `node --test tests/*.test.mjs` green; the six `rallyhall` hits in `index.html`; the browser proof is Task 5.

---

## Task 5: the one browser test (`tests/test_hideout.py`)

**Files:** `tests/test_hideout.py`.

- [ ] **Step 1: write the test** after `test_artemis_room_...` (`:1192-1218`), same helpers (`open_page`, `ride`, `into_room`):

```python
def test_rallyhall_room_builds_the_hall_and_three_cars_on_entering_without_a_download(server, tmp_path):
    """#859: entering spoke 5 builds the rally hall with its three podium cars from primitives -- no model file is fetched; the back wall and a
    podium are solid, the hall's centre floor and the apron are open. Leaves a screenshot."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.rallyhall()") is None
        into_room(page, 5, "room5")
        page.wait_for_function("() => window.__mm.rallyhall() && window.__mm.rallyhall().built === 5", timeout=120000)
        a = page.evaluate("() => window.__mm.rallyhall()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(5, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          return { wall: p(19.7, 0), podium: p(4, 0), floor: p(-5, -11), apron: p(-60, 0) }; }""")
        view = page.evaluate("() => { const v = window.__mm.below().tower, th = window.__mm.spoke(5, 0).th; return { x: v.x - Math.cos(th) * 80, z: v.z - Math.sin(th) * 80, th }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "rallyhall-room.png"))
        br.close()
    print("screenshot:", tmp_path / "rallyhall-room.png")
    assert errors == []
    assert [u for u in requests if not u.endswith("/eiffel_tower.glb")] == [], requests   # the Eiffel preloads near the Hübel by design; the room itself fetches nothing
    assert a["built"] == 5 and abs(a["h"] - 14.8) < 1e-6 and 500 <= a["tris"] <= 30000 and a["colliders"] == 9 and len(a["cars"]) == 3, a
    assert info["below"]["built"] == 5 and info["below"]["level"] == "room5" and info["below"]["object"] is True and info["counts"].get("rallyhall") == 1 and "eiffel" not in info["counts"], info
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) > 0.5 for k in ("wall", "podium")), push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("floor", "apron")), push
```

- [ ] **Step 2: commit and push the branch first** (`test(hideout): browser test for the rally hall room` — `Refs #859`), **then**
  run it in the foreground: `pytest tests/test_hideout.py -k rallyhall` (generous `timeout`, never `run_in_background`).
  Green means the room builds, the colliders push, nothing is fetched and the console is empty. If it fails: fix the
  implementation (a collider number in `rallyhall.js`, a hook in `index.html`), never the assertion; after 3 failed attempts stop
  and explain in the PR description what blocks. Look at the screenshot: the hall, the roof, three cars in red / light
  blue / deep blue, no lettering.
- [ ] **Step 3: also run** `node --test tests/*.test.mjs` once more (all green).

**verify:** `pytest tests/test_hideout.py -k rallyhall` → 1 passed; screenshot looks like a hall with three cars.

---

## Task 6: CHANGELOG, PR

**Files:** `CHANGELOG.md`.

- [ ] **Step 1: add one entry** at the top of `## [Unreleased]` → `### Added` (create the `### Added` list only where it already
  is; newest first), format per CLAUDE.md: timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords, keys in
  `<kbd>`, player-facing, English. Example (adjust the wording, keep the substance):
  `` - `<timestamp>` In the hideout, a new star room holds a **rally hall**: drive into the open **hall** and round **three rally cars** on their podiums — a **red** GR Yaris, a **light blue** i20 N and a **deep blue** Impreza WRC, 1990s style. Everything is built from simple shapes in the game, not a downloaded model, and the cars wear plain paint only. ``
- [ ] **Step 2: final checks:** `node --test tests/*.test.mjs` green; `git diff --stat main...` shows only the files listed at
  the top; no `CREDITS.md`, README or `package.json` change.
- [ ] **Step 3: commit and push** `docs(hideout): changelog entry for the rally hall` with footer `Closes #859`; mark the draft PR
  ready only if asked (`ai-review-human-merge` leaves the merge to the maintainer, by Monday evening 2026-11-16).

**verify:** the CHANGELOG entry has a timestamp, bold keywords and no repo jargon; the PR description carries the RED/GREEN
evidence per task.
