# Artemis II rocket and Orion capsule in star room 2 (#488) Implementation Plan

**Goal:** star room 2 of the hideout holds the SLS Block 1 + Orion stack, 98.1 m, upright on a launch mount in
the room centre, and the Orion crew module life size (5.03 m) on a display stand beside it, both built from
three.js primitives; mount, core, boosters and capsule are solid, the car drives round both on gravel, the
helicopter flies round and over; nothing is downloaded; the spoke stays unsigned.

**Spec:** `docs/superpowers/specs/2026-10-26-hideout-artemis-room-design.md` (numbers, placement, assumptions).

**Architecture:** one new pure module `prototype/artemis.js` (descriptor `ARTEMIS`, `rocketParts`,
`capsuleParts`, `artemisPlacement`; `node --test`), one new mesh module `prototype/artemismesh.js` (three.js,
like `friesmesh.js`, not unit-tested), `rooms.js` wires the placement into `roomLayout` exactly as the fries
figure is wired (`rooms.js:96-97`), `index.html` builds the meshes in `roomMeshes` as it builds the fries
(`index.html:2854-2857`).

**Deadline:** merged Wednesday evening 2026-10-28, live Thursday 2026-10-29 15:15. One pipeline run; no
follow-ups planned. If a task runs long, cut the look (fewer parts), never the colliders or the tests.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework, `const`/`let` only. No model
  file, no `CREDITS.md`, README, licence or `strings.js` change (nothing third-party is used).
- TDD for the pure modules: write the failing test, run it red, implement, run green. Never edit a test to make
  it pass — the test rewrites below *are* the specified change and come before the code.
- Node tests: `node --test prototype/tests/<file>.test.mjs` per task; at the end of each pure task
  `node --test prototype/tests/*.test.mjs` (all green on main today: `c483a6a`).
- Browser tests: run **only** `pytest prototype/tests/test_hideout.py -k artemis` (one test), in the
  **foreground**, never `run_in_background`, generous `timeout`. Never the full Playwright suite (~2 h).
  Commit and push the branch **before** starting the Playwright run.
- Rendering is a Fable concern: **Task 4 is the graphics task** (meshes, colours). In a local subagent-driven
  run dispatch it with `model: "fable"`; in the pipeline it runs on the issue's model — it is sized so the
  default model can do it (every number comes from `artemis.js`; the mesh file is cylinders and cones).
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 6). Never run
  `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, footer `Refs #488`; the last commit `Closes #488`.
  Branch `feature/488-artemis-room`.

Files: new `prototype/artemis.js`, `prototype/artemismesh.js`, `prototype/tests/artemis.test.mjs`; changed
`prototype/rooms.js`, `prototype/index.html`, `prototype/tests/rooms.test.mjs`, `prototype/tests/test_hideout.py`,
`CHANGELOG.md`.

---

## Task 1: the descriptor and the stack (`artemis.js`: `ARTEMIS`, `rocketParts`, `capsuleParts`)

**Files:** `prototype/tests/artemis.test.mjs` (new), `prototype/artemis.js` (new).

**Interfaces:**

```js
// prototype/artemis.js -- #488: the Artemis II stack and the Orion capsule as numbers (pure, no three.js, no DOM)
export const ARTEMIS = {
  key: 'artemis', h: 98.1,                                  // deck top to the tip of the launch abort tower
  pad: { w: 40, lift: 0.15 },                               // concrete slab on the lawn, no collider (bumped over like gravel)
  deck: { w: 24, h: 2 },                                    // the launch mount the rocket stands on, one collider
  core: { r: 4.2, y0: 2.0, y1: 66.6, nozzle: { n: 4, r: 1.2, h: 1.7, off: 2.2 } },   // 8.4 m across, 64.6 m long; four nozzles hang under it
  srb: { r: 1.855, off: 6.5, y0: 0, y1: 50.2, nose: 3.7, skirt: { r: 2.6, h: 2.2 } },   // 3.71 m across, 53.9 m incl. nose, axes 6.5 m off the core along v
  lvsa: { y0: 66.6, y1: 75.5, r1: 2.5 },                    // cone 8.4 -> 5 m
  icps: { y0: 75.5, y1: 84.0, r: 2.5 },
  esm: { y0: 84.0, y1: 89.0, r: 2.6, band: 0.3 },           // service module + fairings; dark band at the top
  cm: { y0: 89.0, y1: 94.5, r1: 0.9 },                      // crew module under the abort system's ogive
  las: { y0: 94.5, y1: 98.1, r: 0.45, nose: 0.8 },          // abort tower; the nose cone is the last `nose` m of it
  capsule: { at: [-50, 45], r: 2.515, rTop: 0.95, h: 3.3, shield: 0.5, tunnel: { r: 0.5, h: 0.4 }, stand: { h: 1.0, r: 2.0, post: 0.12 }, ring: { r: 11, hw: 3 }, hw: 3.0, clear: 0.6 },
  colours: { core: 0xd27a35, white: 0xf2f2ee, dark: 0x3a3d42, nozzle: 0x6e6e70, shell: 0x9a9ea3, shield: 0x8a6a4a, stand: 0x2b2e34, deck: 0x55595e, pad: 0xb9b5aa },
};
export function rocketParts(cfg = ARTEMIS);    // [{ kind: 'cyl'|'cone', r0, r1, y0, y1, x, z, colour }] over the deck top; x along f, z along v
export function capsuleParts(cfg = ARTEMIS);   // same shape, the capsule + stand in its own frame, standing on y = 0 (the lawn)
export const rocketTop = (parts) => Math.max(...parts.map(p => p.y1));
```

`kind: 'cyl'` has `r0 === r1`; `'cone'` tapers from `r0` at `y0` to `r1` at `y1`. Colours are the
`ARTEMIS.colours` values (numbers), so `artemismesh.js` can merge per colour.

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/artemis.test.mjs`:

```js
// #488: the Artemis II stack and the Orion capsule -- pure. node --test prototype/tests/artemis.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTEMIS, rocketParts, capsuleParts, rocketTop } from '../artemis.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);
const onAxis = (p) => Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9;

test('ARTEMIS_IsLifeSize_TheRealStackIs98mAndTheCoreAndBoostersHaveTheRealDiameters', () => {
  assert.equal(ARTEMIS.key, 'artemis'); near(ARTEMIS.h, 98.1, 1e-9);
  near(ARTEMIS.core.r * 2, 8.4, 1e-9, 'core diameter'); near(ARTEMIS.core.y1 - ARTEMIS.core.y0, 64.6, 1e-9, 'core length');
  near(ARTEMIS.srb.r * 2, 3.71, 1e-9, 'booster diameter'); near(ARTEMIS.srb.y1 + ARTEMIS.srb.nose - ARTEMIS.srb.y0, 53.9, 1e-9, 'booster length incl. nose');
  assert.ok(ARTEMIS.srb.off > ARTEMIS.core.r + ARTEMIS.srb.r, 'the boosters hang beside the core, not inside it');
  near(ARTEMIS.capsule.r * 2, 5.03, 1e-9, 'Orion is 5.03 m across'); near(ARTEMIS.capsule.h, 3.3, 1e-9);
});

test('rocketParts_StackEndsAtTheTip_PartsMeetWithoutGaps_OnlyTheTowerAboveTheOgive', () => {
  const parts = rocketParts(ARTEMIS);
  near(rocketTop(parts), ARTEMIS.h, 1e-9, 'the tip');
  for (const p of parts) { assert.ok(['cyl', 'cone'].includes(p.kind)); assert.ok(p.y1 > p.y0, `${p.kind} y`); assert.ok(p.r0 > 0 && p.r1 >= 0); assert.equal(typeof p.colour, 'number'); if (p.kind === 'cyl') assert.equal(p.r0, p.r1); }
  const stack = parts.filter(onAxis).filter(p => p.y1 > ARTEMIS.core.y0).sort((a, b) => a.y0 - b.y0);
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i].y0 <= stack[i - 1].y1 + 1e-9, `gap under the part starting at ${stack[i].y0}`);
  for (const p of parts.filter(p => p.y1 > ARTEMIS.las.y0 + 1e-9)) assert.ok(onAxis(p) && p.r0 <= ARTEMIS.las.r + 1e-9, 'only the abort tower reaches above the ogive');
  const core = parts.find(p => p.kind === 'cyl' && Math.abs(p.r0 - ARTEMIS.core.r) < 1e-9 && p.y0 === ARTEMIS.core.y0);
  assert.ok(core && core.colour === ARTEMIS.colours.core, 'the core is the orange cylinder');
});

test('rocketParts_TwoBoostersAcrossTheRoom_WhiteWithNoseConesAndDarkSkirts', () => {
  const parts = rocketParts(ARTEMIS), srb = parts.filter(p => Math.abs(Math.abs(p.z) - ARTEMIS.srb.off) < 1e-9 && Math.abs(p.x) < 1e-9);
  const tubes = srb.filter(p => p.kind === 'cyl' && Math.abs(p.r0 - ARTEMIS.srb.r) < 1e-9), noses = srb.filter(p => p.kind === 'cone' && p.r1 < 0.2), skirts = srb.filter(p => p.kind === 'cone' && p.r0 > ARTEMIS.srb.r + 0.5);
  assert.equal(tubes.length, 2); assert.equal(noses.length, 2); assert.equal(skirts.length, 2);
  assert.deepEqual(tubes.map(p => Math.sign(p.z)).sort(), [-1, 1], 'one booster each side');
  for (const p of tubes) { assert.equal(p.colour, ARTEMIS.colours.white); near(p.y0, ARTEMIS.srb.y0, 1e-9); near(p.y1, ARTEMIS.srb.y1, 1e-9); }
  for (const p of noses) near(p.y1, ARTEMIS.srb.y1 + ARTEMIS.srb.nose, 1e-9, 'nose tip at 53.9');
  for (const p of skirts) { assert.equal(p.colour, ARTEMIS.colours.dark); near(p.y0, ARTEMIS.srb.y0, 1e-9); }
  assert.ok(Math.max(...srb.map(p => p.y1)) < ARTEMIS.core.y1, 'the boosters end below the core top');
});

test('rocketParts_FourNozzlesHangUnderTheCore_AboveTheDeck', () => {
  const nozzles = rocketParts(ARTEMIS).filter(p => p.colour === ARTEMIS.colours.nozzle && Math.hypot(p.x, p.z) > 1 && Math.hypot(p.x, p.z) < ARTEMIS.core.r);
  assert.equal(nozzles.length, ARTEMIS.core.nozzle.n);
  for (const p of nozzles) { near(p.y1, ARTEMIS.core.y0, 1e-9, 'hangs from the core bottom'); assert.ok(p.y0 >= 0, 'not into the deck'); }
  assert.equal(new Set(nozzles.map(p => `${Math.sign(p.x)},${Math.sign(p.z)}`)).size, 4, 'on a square');
});

test('capsuleParts_ATruncatedConeOnAStand_HeatShieldBelow_TunnelOnTop_StandingOnTheLawn', () => {
  const parts = capsuleParts(ARTEMIS), C = ARTEMIS.capsule;
  const cone = parts.find(p => p.kind === 'cone' && Math.abs(p.r0 - C.r) < 1e-9);
  assert.ok(cone, 'the crew module cone'); near(cone.r1, C.rTop, 1e-9); near(cone.y1 - cone.y0, C.h, 1e-9); near(cone.y0, C.stand.h, 1e-9, 'rests on the stand'); assert.equal(cone.colour, ARTEMIS.colours.shell);
  const shield = parts.find(p => p.colour === ARTEMIS.colours.shield); assert.ok(shield && shield.y1 <= cone.y0 + 1e-9 && shield.y0 >= cone.y0 - C.shield - 1e-9, 'the heat shield sits under the base, inside the stand height');
  const tunnel = parts.find(p => p.kind === 'cyl' && Math.abs(p.r0 - C.tunnel.r) < 1e-9); assert.ok(tunnel && Math.abs(tunnel.y0 - cone.y1) < 1e-9, 'the docking tunnel on top');
  const posts = parts.filter(p => p.colour === ARTEMIS.colours.stand && p.kind === 'cyl'); assert.ok(posts.length >= 4, 'posts'); for (const p of posts) { assert.equal(p.y0, 0); near(p.y1, C.stand.h, 1e-9); assert.ok(Math.hypot(p.x, p.z) < C.r, 'under the shield'); }
  assert.equal(Math.min(...parts.map(p => p.y0)), 0, 'stands on the lawn'); near(Math.max(...parts.map(p => p.y1)), C.stand.h + C.h + C.tunnel.h, 1e-9, 'top');
});
```

- [ ] **Step 2: run red.** `node --test prototype/tests/artemis.test.mjs` fails (module missing).
- [ ] **Step 3: implement `prototype/artemis.js`** with the descriptor above and:
  - `rocketParts(cfg)`: pushes, in this order, the core cylinder (orange), the four nozzles (`'cone'` r 1.2 → 0.7, from `core.y0 - nozzle.h` to `core.y0`, at `(±off, ±off)`), per SRB side `s = ±1`: the tube (white, at `z = s·off`), the nose cone (`r0 = srb.r`, `r1 = 0.05`, `y srb.y1 → srb.y1 + nose`), the aft skirt (dark cone `r0 = skirt.r → r1 = srb.r`, `y srb.y0 → srb.y0 + skirt.h`), a nozzle under it (`'cone'` r 1.0 → 0.6, `y max(0, srb.y0 - 1.2) → srb.y0`; if `srb.y0` is 0 skip it); then the LVSA cone (white, `core.r → lvsa.r1`), the ICPS cylinder (white), the ESM cylinder (white) with a dark band cylinder of `esm.band` height at its top (`r + 0.02`), the CM/ogive cone (white, `esm.r → cm.r1`), the LAS tower cylinder (light `shell`, `las.y0 → las.y1 - las.nose`) and its nose cone (`las.r → 0.02`, to `las.y1`). Every part has `x`, `z` (0 unless stated).
  - `capsuleParts(cfg)`: four posts at `stand.r` on the diagonals (`kind 'cyl'`, r `stand.post`, `y 0 → stand.h`), a thin stand ring approximated by a cylinder `r stand.r + 0.15`, `y stand.h - 0.1 → stand.h` in `colours.dark` (not `stand`: the test counts every `stand`-coloured cylinder as a post standing on y = 0), then the heat shield (`'cone'` r `C.r - 0.1 → C.r`, `y stand.h - shield → stand.h`, colour `shield`), the shell cone (`r → rTop`, `y stand.h → stand.h + h`), the docking tunnel (`'cyl'` r `tunnel.r`, `y stand.h + h → + tunnel.h`, colour `dark`). (The hatch outline is a mesh-task detail, Task 4.)
  - `rocketTop(parts)`.
- [ ] **Step 4: run green.** `node --test prototype/tests/artemis.test.mjs`.
- [ ] **Step 5: commit** `feat(hideout): Artemis II stack and Orion capsule as numbers (artemis.js)` — `Refs #488`.

**verify:** `node --test prototype/tests/artemis.test.mjs` → 5 pass.

---

## Task 2: placement in the room (`artemisPlacement`)

**Files:** `prototype/tests/artemis.test.mjs`, `prototype/artemis.js`.

**Interface:**

```js
// where the rocket and the capsule stand in a room ({ centre, frame: { f, v }, portal: { c }, y } as friesPlacement takes it):
// the rocket at the room centre on its mount, turned to the frame (SRBs along v); the capsule at capsule.at, its hatch facing the portal;
// the capsule's gravel ring; the colliders, all `low` (the car stops, the helicopter / hovering walker pass over each top, index.html collide())
export function artemisPlacement(room, cfg = ARTEMIS);
// -> { rocket: { x, z, th }, capsule: { x, z, th }, ring: [[x, z] * 33, closed], colliders: [mount, core, srbA, srbB, capsule] }
```

Collider shape as everywhere (`rooms.js:69`): `{ x, z, hw, hd, c, s, h, low: true, artemis: 'mount' | 'core' | 'srb' | 'capsule' }`.
`c, s` = `(f[0], f[1])` for the rocket boxes (so `hd` runs along `v`), the capsule's box turned to its `th`.
Heights: mount `room.y + pad.lift + deck.h`; core `room.y + pad.lift + deck.h + cfg.h + 2`; SRBs
`room.y + pad.lift + deck.h + srb.y1 + srb.nose + 2`; capsule `room.y + stand.h + h + clear`.
Half widths: mount `deck.w / 2`; core `core.r + 0.4`; SRB `srb.r + 0.35` at `z = ±srb.off` (i.e. at
`loc(0, ±off)`); capsule `capsule.hw`.

- [ ] **Step 1: write the failing tests** (append to `artemis.test.mjs`):

```js
import { artemisPlacement } from '../artemis.js';
import { roomLayout, ROOM_Y, ROOM_HALF } from '../rooms.js';

const R2 = roomLayout(2), inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const toWorld = (R, a, b) => [R.centre[0] + R.frame.f[0] * a + R.frame.v[0] * b, R.centre[1] + R.frame.f[1] * a + R.frame.v[1] * b];
const A = artemisPlacement({ centre: R2.centre, frame: R2.frame, portal: R2.portal, y: ROOM_Y }, ARTEMIS);

test('artemisPlacement_RocketOnTheRoomCentre_CapsuleAtItsSpot_FacingThePortal', () => {
  assert.deepEqual([A.rocket.x, A.rocket.z], R2.centre); near(A.rocket.th, Math.atan2(R2.frame.f[1], R2.frame.f[0]), 1e-9, 'turned to the room frame');
  assert.deepEqual([A.capsule.x, A.capsule.z], toWorld(R2, ...ARTEMIS.capsule.at));
  const want = Math.atan2(R2.portal.c[1] - A.capsule.z, R2.portal.c[0] - A.capsule.x); assert.ok(Math.abs(Math.atan2(Math.sin(A.capsule.th - want), Math.cos(A.capsule.th - want))) < 1e-9, 'hatch to the portal');
  const [a, b] = ARTEMIS.capsule.at; assert.ok(a < 0 && Math.abs(b) > 20 + ARTEMIS.capsule.ring.r, 'on the portal side, off the drive line');
  assert.ok(Math.hypot(a, b) + ARTEMIS.capsule.ring.r + ARTEMIS.capsule.ring.hw < 95 - 4, 'the ring stays inside the 95 m loop');
  assert.ok(Math.hypot(a, b) - ARTEMIS.capsule.ring.r - ARTEMIS.capsule.ring.hw > ARTEMIS.pad.w / 2 * Math.SQRT2 + 3, 'the ring is clear of the pad');
});

test('artemisPlacement_FiveLowColliders_MountCoreBoostersCapsule_SolidToTheirTops', () => {
  assert.equal(A.colliders.length, 5); for (const c of A.colliders) { assert.equal(c.low, true); assert.ok(c.h > ROOM_Y + 1); }
  const by = (k) => A.colliders.filter(c => c.artemis === k);
  const [mount] = by('mount'), [core] = by('core'), srb = by('srb'), [cap] = by('capsule');
  assert.ok(mount && core && cap && srb.length === 2);
  near(mount.hw, ARTEMIS.deck.w / 2, 1e-9); near(mount.h, ROOM_Y + ARTEMIS.pad.lift + ARTEMIS.deck.h, 1e-9, 'the mount is 2 m high');
  assert.ok(core.h >= ROOM_Y + ARTEMIS.h, 'the core is solid to the tip'); assert.ok(core.hw >= ARTEMIS.core.r && core.hw < ARTEMIS.core.r + 1);
  for (const s of srb) { const [a, b] = toLocal(R2, s.x, s.z); near(a, 0, 1e-6); near(Math.abs(b), ARTEMIS.srb.off, 1e-6, 'a booster each side along v'); assert.ok(s.h >= ROOM_Y + ARTEMIS.srb.y1 + ARTEMIS.srb.nose && s.h < ROOM_Y + ARTEMIS.core.y1); }
  assert.deepEqual([cap.x, cap.z], [A.capsule.x, A.capsule.z]); near(cap.h, ROOM_Y + ARTEMIS.capsule.stand.h + ARTEMIS.capsule.h + ARTEMIS.capsule.clear, 1e-9); assert.ok(cap.hw >= ARTEMIS.capsule.r);
});

test('artemisPlacement_TheRingIsAClosed33PointCircleRoundTheCapsule', () => {
  assert.equal(A.ring.length, 33); assert.deepEqual(A.ring[0], A.ring[32]);
  for (const [x, z] of A.ring) near(Math.hypot(x - A.capsule.x, z - A.capsule.z), ARTEMIS.capsule.ring.r, 1e-6);
  for (const [x, z] of A.ring) for (const c of A.colliders) assert.ok(!inside(c, x, z, 2.6), 'the ring runs clear of every collider');
});
```

- [ ] **Step 2: run red** (`artemisPlacement` missing; `roomLayout(2)` is still the empty room, that is fine
  here — the placement takes the frame only).
- [ ] **Step 3: implement `artemisPlacement`** in `artemis.js` (no import from `rooms.js` — it would be
  circular; the room's frame comes in as an argument, as for `friesPlacement`).
- [ ] **Step 4: run green.** `node --test prototype/tests/artemis.test.mjs` → 8 pass.
- [ ] **Step 5: commit** `feat(hideout): place the Artemis stack and the capsule in a room` — `Refs #488`.

**verify:** 8 pass.

---

## Task 3: room 2 takes the object (`rooms.js`, `rooms.test.mjs`)

**Files:** `prototype/tests/rooms.test.mjs`, `prototype/rooms.js`.

**Interfaces (changes):**

```js
import { ARTEMIS, artemisPlacement } from './artemis.js';
export const ROOMS = [ …, { id: 'room2', name: 'Artemis II', object: ARTEMIS, signed: false }, … ];   // #488
// NEXT_ROOMS unchanged: [7, 2, 6, 3, 5, 4] -- comment: 7 (Titanic) and 2 (Artemis II) are taken, 6 is next
// roomLayout(k) returns additionally: artemis: { rocket, capsule, ring, colliders } | null, and a third path { pts: ring, hw: capsule.ring.hw } when set
```

- [ ] **Step 1: rewrite the two affected tests first** in `prototype/tests/rooms.test.mjs`:
  - `ROOMS_EightRooms_OnlyTheEiffelAtomiumAndTitanicHaveAnObject` → rename to
    `ROOMS_EightRooms_EiffelAtomiumArtemisAndTitanicHaveAnObject`; add
    `assert.equal(ROOMS[2].object, ARTEMIS); assert.equal(ROOMS[2].name, 'Artemis II'); assert.equal(ROOMS[2].signed, false);`
    and change the empty loop to `for (const r of ROOMS.slice(3, 7))`. Import `ARTEMIS` from `'../artemis.js'`.
  - `roomLayout_PathsRunFromThePortalToTheCentreAndAroundIt_SpawnFacesIn`: `[rooms[0], rooms[2], rooms[3]]` →
    `[rooms[0], rooms[3], rooms[4]]` (room 2 has three paths now).
  - Leave `NEXT_ROOMS_…` and `spokeSigns_…` untouched: they must stay green by themselves (A6, A7).
- [ ] **Step 2: add the new tests** (after the Titanic block):

```js
import { ARTEMIS } from '../artemis.js';
const artemis = rooms[2];
test('roomLayout_Room2HoldsTheArtemisStackOnTheCentre_AndTheCapsuleBesideIt_UnsignedLikeTheOthers', () => {
  assert.deepEqual([artemis.tower.x, artemis.tower.z], artemis.centre); assert.deepEqual(artemis.feet, []); assert.equal(artemis.hull.length, 0); assert.equal(artemis.basin, null);
  assert.ok(artemis.artemis); assert.deepEqual([artemis.artemis.rocket.x, artemis.artemis.rocket.z], artemis.centre);
  assert.deepEqual([artemis.artemis.capsule.x, artemis.artemis.capsule.z], toWorld(artemis, ...ARTEMIS.capsule.at));
  assert.ok(artemis.towerView && !blocked(artemis, artemis.towerView.x, artemis.towerView.z));
  for (const R of rooms.filter(r => r.k !== 2)) assert.equal(R.artemis, null);
});

test('roomLayout_Room2_MountCoreAndCapsuleAreSolid_TheLawnBetweenAndBothGravelRingsAreFree', () => {
  const D = ARTEMIS.deck.w / 2, C = ARTEMIS.capsule;
  assert.ok(blocked(artemis, ...artemis.centre, 0), 'the core'); assert.ok(blocked(artemis, ...toWorld(artemis, 0, D - 1), 0), 'the mount edge');
  assert.ok(blocked(artemis, ...toWorld(artemis, ...C.at), 0), 'the capsule');
  for (const [a, b] of [[0, D + CAR_R + 2], [-D - CAR_R - 2, 0], [C.at[0], C.at[1] + C.hw * Math.SQRT2 + CAR_R + 1], [-30, 20], [95, 0], [0, -95]]) assert.ok(!blocked(artemis, ...toWorld(artemis, a, b)), `free at ${a},${b}`);
  for (const [x, z] of artemis.paths[2].pts) assert.ok(!blocked(artemis, x, z), 'the capsule ring is drivable');
  for (const [x, z] of artemis.paths[1].pts) assert.ok(!blocked(artemis, x, z), 'the 95 m loop is drivable');
});

test('roomLayout_Room2_ThreePaths_TheThirdRingsTheCapsule_AndTheCarReachesRoundBoth', () => {
  assert.equal(artemis.paths.length, 3); const ring = artemis.paths[2]; assert.equal(ring.hw, ARTEMIS.capsule.ring.hw); assert.equal(ring.pts.length, 33);
  for (const [x, z] of ring.pts) assert.ok(Math.abs(Math.hypot(x - artemis.artemis.capsule.x, z - artemis.artemis.capsule.z) - ARTEMIS.capsule.ring.r) < 1e-6);
  const r = reach(artemis), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  assert.ok(!cell(0, 0), 'the rocket is solid'); assert.ok(cell(40, 0) && cell(0, 40) && cell(0, -40), 'the far side and both sides of the mount');
  const [ca, cb] = ARTEMIS.capsule.at; assert.ok(cell(ca - 12, cb) && cell(ca + 12, cb) && cell(ca, cb + 12) && cell(ca, cb - 12), 'all round the capsule'); assert.ok(r.seen.size > 4000);
});
```

- [ ] **Step 3: run red.** `node --test prototype/tests/rooms.test.mjs`.
- [ ] **Step 4: implement** in `rooms.js`: the import, the `ROOMS[2]` entry, the comment on `NEXT_ROOMS`, and
  in `roomLayout` directly after the figure lines (`:96-97`):

```js
  // #488: the Artemis II stack on its mount in the centre and the Orion capsule beside it (artemis.js places them; artemismesh.js builds them)
  const artemis = (room.object && room.object.capsule) ? artemisPlacement({ centre, frame: { f, v }, portal: { c: P }, y: ROOM_Y }, room.object) : null;
  if (artemis) colliders.push(...artemis.colliders);
```

  and in the paths: `if (artemis) paths.push({ pts: artemis.ring, hw: room.object.capsule.ring.hw });`, plus
  `artemis` in the returned object (next to `figure`). Update the header comment (line 3-4: "the Eiffel, Atomium
  (room 1), Artemis II (room 2) and Titanic (room 7) rooms have an object").
- [ ] **Step 5: run green** `node --test prototype/tests/rooms.test.mjs`, then all `node --test prototype/tests/*.test.mjs`
  (`underground.test.mjs`, `fries.test.mjs`, `room-fly.test.mjs`, `enterables.test.mjs` read `ROOMS`/`roomLayout` — they must stay green with no edit).
- [ ] **Step 6: commit** `feat(hideout): star room 2 holds the Artemis II stack and the Orion capsule` — `Refs #488`.

**verify:** `node --test prototype/tests/*.test.mjs` all pass (today 700+ tests).

---

## Task 4 (graphics task, Fable): the meshes and the room build (`artemismesh.js`, `index.html`)

**Files:** `prototype/artemismesh.js` (new), `prototype/index.html`.

Not unit-tested (three.js); verified by Task 5's browser test and a look at the screenshot it leaves.

**Interfaces:**

```js
// prototype/artemismesh.js -- #488: the Artemis II stack and the Orion capsule as meshes, built from artemis.js's numbers
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARTEMIS, rocketParts, capsuleParts } from './artemis.js';
export function buildRocket(cfg = ARTEMIS);     // THREE.Group, y = 0 at the deck top, +x along f, +z along v; one merged MeshLambertMaterial mesh per colour, userData.role = 'artemis'
export function buildCapsule(cfg = ARTEMIS);    // THREE.Group, y = 0 on the lawn, +x = the hatch side; same material scheme; the hatch outline as a dark flat box on the +x face
export function artemisTriangles(group);        // like friesTriangles
```

- [ ] **Step 1: `artemismesh.js`.** One helper `partGeometry(p)`: `new THREE.CylinderGeometry(p.r1, p.r0,
  p.y1 - p.y0, 32)` (three's radiusTop first), translated to `(p.x, (p.y0 + p.y1) / 2, p.z)`; group the
  parts by `colour`, `mergeGeometries` per colour, one `MeshLambertMaterial({ color })` each, `castShadow =
  receiveShadow = false`, `userData.role = 'artemis'`. `buildCapsule` adds the hatch: a `BoxGeometry(0.1, 1.2,
  0.9)` in `colours.dark` on the cone's +x face at mid height (translate `x = cone radius at that height`). Keep
  it to that: no textures, no text, no flag, no insignia.
- [ ] **Step 2: `index.html`.**
  - imports after line 513: `import { ARTEMIS } from './artemis.js'; import { buildRocket, buildCapsule, artemisTriangles } from './artemismesh.js';`
  - `ROOM` (`:2647`): add `artemis: null`; in `ensureRoom` (`:2810`) reset it with `ROOM.figure = null`.
  - `roomMeshes` (`:2825`): `if (R.artemis) roomArtemis(group, R);` next to the figure call.
  - new `roomArtemis(group, R)` after `roomFigure`:
    - the pad: `orientedBox`-style flat box `pad.w × pad.lift × pad.w` at the centre, turned by the room angle,
      `colours.pad`, `renderOrder = 1` (over the lawn like the gravel);
    - the mount: a box `deck.w × deck.h × deck.w` on the pad, `colours.deck`;
    - `const rocket = buildRocket(ARTEMIS); rocket.position.set(R.artemis.rocket.x, R.y + ARTEMIS.pad.lift + ARTEMIS.deck.h, R.artemis.rocket.z); rocket.rotation.y = -R.artemis.rocket.th; group.add(rocket);`
    - `const cap = buildCapsule(ARTEMIS); cap.position.set(R.artemis.capsule.x, R.y, R.artemis.capsule.z); cap.rotation.y = -R.artemis.capsule.th; group.add(cap);`
    - `ROOM.artemis = { built: R.k, rocket: R.artemis.rocket, capsule: R.artemis.capsule, h: ARTEMIS.h, tris: artemisTriangles(rocket) + artemisTriangles(cap), colliders: R.artemis.colliders.length };`
  - debug hook next to `__mm.fries` (`:2933`):
    `window.__mm.artemis = () => ROOM.artemis && ROOM.built === ROOM.artemis.built ? { ...ROOM.artemis } : null;   // #488`
  - `loadModel`'s console line uses `ROOMS[k].name` — not reached (no `url`), nothing to change. Check with
    `grep -n "object.url" prototype/index.html` that the only guard is `ensureRoom`'s.
- [ ] **Step 3: look at it once** (no test yet): serve `prototype/` (`python3 -m http.server 8000`), open
  `http://localhost:8000/prototype/?dev=1`, Testhub → hideout → ring, drive into spoke 2 (or run Task 5's test
  and open its screenshot). The rocket should read as orange core + white boosters with the LAS tip above
  everything; the capsule as a silver cone on posts with a brown underside. Adjust colours only in
  `ARTEMIS.colours`.
- [ ] **Step 4: commit** `feat(hideout): build the Artemis II stack and the capsule in room 2` — `Refs #488`.

**verify:** `node --test prototype/tests/*.test.mjs` still green (nothing pure changed); `grep -c "role = 'artemis'" prototype/artemismesh.js` ≥ 2; the page's console is empty in Task 5.

---

## Task 5: the one browser test (`test_hideout.py`)

**Files:** `prototype/tests/test_hideout.py`.

- [ ] **Step 1: push the branch first** (`git push -u origin feature/488-artemis-room`), then write the test
  after `test_titanic_room_builds_loads_its_model_on_entering_and_has_a_solid_hull`:

```python
@needs_world
def test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download(server, tmp_path):
    """#488: entering spoke 2 builds the Artemis II stack (98.1 m on its mount) and the Orion capsule from primitives -- no model file is
    fetched; the core, the mount's edge and the capsule are solid, the lawn beside the mount and the capsule's ring are open. Leaves a screenshot."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.artemis()") is None
        into_room(page, 2, "room2")
        page.wait_for_function("() => window.__mm.artemis() && window.__mm.artemis().built === 2", timeout=120000)
        a = page.evaluate("() => window.__mm.artemis()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(2, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          const c = window.__mm.artemis().capsule; return { core: p(0, 0), mount: p(0, 11), beside: p(0, 30), capsule: window.__mm.pushAt(c.x, c.z, -600), ring: p(-50, 45 + 11) }; }""")
        view = page.evaluate("() => { const v = window.__mm.below().tower, th = window.__mm.spoke(2, 0).th; return { x: v.x - Math.cos(th) * 150, z: v.z - Math.sin(th) * 150, th }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "artemis-room.png"))
        br.close()
    print("screenshot:", tmp_path / "artemis-room.png")
    assert errors == []
    assert requests == [], requests
    assert a["built"] == 2 and abs(a["h"] - 98.1) < 1e-6 and 1000 <= a["tris"] <= 20000 and a["colliders"] == 5, a
    assert info["below"]["built"] == 2 and info["below"]["level"] == "room2" and info["below"]["object"] is True and info["counts"].get("artemis") == 1 and "eiffel" not in info["counts"], info
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) > 0.5 for k in ("core", "mount", "capsule")), push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("beside", "ring")), push
```

  (`ride`, `into_room`, `open_page`, `needs_world`, `math` already exist in the file: `test_hideout.py:18, 22, 99, 872`.)
- [ ] **Step 2: run it, foreground, once:** `pytest prototype/tests/test_hideout.py -k artemis -x -q`
  (GPU browser via `PW_CDP_ENDPOINT` when set, as the other room tests; `timeout` ≥ 600 000 ms on the call).
  Open the screenshot it prints and check the look (Task 4 Step 3). If it fails on the push probes, fix
  `artemisPlacement` heights/half widths in `artemis.js` (and its node tests first); never loosen the test.
- [ ] **Step 3: commit** `test(hideout): the Artemis room builds without a download and is solid where it should be` — `Refs #488`.

**verify:** 1 passed; `errors == []`; screenshot shows the stack and the capsule.

---

## Task 6: CHANGELOG, PR

**Files:** `CHANGELOG.md`.

- [ ] **Step 1: CHANGELOG** under `## [Unreleased]` → `### Added`, at the top, timestamp = the commit's time
  (Swiss local, `YYYY-MM-DD HH:MM`), English like the Titanic entry (`CHANGELOG.md:42`):

  > - `2026-10-28 HH:MM` The hideout room **third on the right of the lift** now holds the **Artemis II** rocket, life size: the 98 m SLS with its orange core stage, two white boosters and the Orion spacecraft on top, standing upright on its launch mount as on the pad. Beside it the **Orion capsule** stands on its own, life size at five metres across, on a low stand with its heat shield showing and a gravel ring to drive round. The mount, the rocket and the capsule are solid; the helicopter (<kbd>F</kbd>) flies round the rocket and over its tip. Both are built from simple shapes in the game, no downloaded model. Artemis II took people farther from Earth than anyone before, 406,000 km, on 2026-04-06.
- [ ] **Step 2: final checks:** `node --test prototype/tests/*.test.mjs` green; `git diff --stat main` lists only the
  files of this plan; no `.glb`, no `CREDITS.md`/README/`strings.js` change; `grep -n "room2" prototype/tests/rooms.test.mjs`
  shows the new fixture only.
- [ ] **Step 3: commit** `docs(changelog): Artemis II room` — `Closes #488`; push; open the PR
  `feat(hideout): Artemis II rocket and Orion capsule in star room 2 (#488)` with Summary / Changes / Testing
  (node count, the one Playwright test, the screenshot attached) / Checklist, body ending with the attribution
  lines. The PR must be mergeable Wednesday 2026-10-28 evening; the maintainer updates #420's table after the
  merge (not this PR).

**verify:** PR open, CI green, one CHANGELOG entry, no third-party files.
