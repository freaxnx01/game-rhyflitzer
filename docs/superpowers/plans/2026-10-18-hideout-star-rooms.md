# Hideout redesign: drive-through freight lift, tunnel ring, 8 star rooms (#361) Implementation Plan

**Goal:** behind the Hübel gate, T1 ends in a round lift hall with a drive-through freight lift; below, a short
exit leads into a tunnel ring with 8 spokes, each ending (after a dark level switch) in its own room level. The
Eiffel room is room 0, rooms 1–7 are the same template without an object. Only the Eiffel spoke is signed.

**Spec:** `docs/superpowers/specs/2026-10-18-hideout-star-rooms-design.md` (layout sketch, numbers, rules).

**Architecture:** four pure layout modules (no three.js, no DOM, `node --test`): `hideout.js` (surface: hall,
lift, doors), `lift.js` (ride + doors + cabin level), new `underground.js` (ring, exit, spokes, switch, signs),
`rooms.js` (the room template, renamed from `room-eiffel.js`). `index.html` only draws and wires them.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework. `const`/`let` only.
- TDD for the pure modules: write the failing test, run it red, implement, run green. Never edit a test to
  make it pass; the test rewrites below are the specified change and are written **before** the code.
- Node tests: `node --test prototype/tests/<file>.test.mjs`; at the end of each pure task run all of
  `node --test prototype/tests/*.test.mjs`.
- Browser tests: run **only** `prototype/tests/test_hideout.py` (plus `test_credits.py` if the Eiffel credit
  is touched — it should not be), in the **foreground**, never `run_in_background`, generous `timeout`.
  The full Playwright suite takes ~2 h — do not run it. Commit and push the branch **before** starting the
  Playwright run.
- `index.html` is also changed by open PR#350 (on foot, #202: `liftOnPlatform`, `roomFlyClamp(..., ROOM.layout)`,
  `followCave`) and the planned #346 start screen: `git fetch origin && git rebase origin/main` before Task 5
  and again before opening the PR; resolve conflicts keeping both features. Keep `ROOM.layout` as the name of
  "the current room's layout".
- Never put IPs or homelab addresses into the repo, the PR or the issue.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` (Task 7). Never run
  `git cliff -o`.
- Tasks 1–4 change the pure modules `index.html` imports, so the game itself may not load between Task 1 and Task 6;
  that is expected inside the branch (the PR is the unit). Do not run Playwright before Task 6 is done.
- Commit per task, Conventional Commits, scope `world` (e.g. `feat(world): …`), footer `Refs #361`; the last
  commit `Closes #361`.

Files per task are listed in each task; new: `prototype/underground.js`, `prototype/tests/underground.test.mjs`;
renamed: `room-eiffel.js` → `rooms.js`, `room-eiffel.test.mjs` → `rooms.test.mjs`.

---

## Task 1: the surface layout — lift hall, lift, doors (`hideout.js`)

**Files:** `prototype/tests/hideout.test.mjs`, `prototype/hideout.js`.

**Interfaces:**

```js
export const HIDEOUT;            // cavernHw: 23 (was 20) -> cavernR() === 25
export const CAVE = { nodes: { hall: { c: R0, r: 23, ceiling: 'lid' } }, links: [], stubs: [] };
export const CAVE_LAMPS = { hall: { off: 16, y: 9, intensity: 180, distance: 60, decay: 2 } };
export const LIFT = { c: CAVE.nodes.hall.c, th: HIDEOUT.heading, hw: 4, hd: 11, door: { hw: 3, h: 5 }, wall: 0.5, height: 8, near: 15 };
export function onLiftPlatform(x, z, pad = 0, l = LIFT);       // unchanged
export function inCabin(x, z, halfLen = 0, l = LIFT);         // the whole vehicle inside: |along| <= hd - halfLen and |across| <= hw
export function liftDoor(level, l = LIFT);                     // 'top' -> door A at c - f*hd, 'bottom' -> door B at c + f*hd; { x, z, th } th = the way out through it
export function nearLiftDoor(x, z, level, l = LIFT);           // within l.near of that door, or in the cabin
export function liftColliders(level, y, l = LIFT);             // OBBs { x, z, hw, hd, c, s, h, secret: true }, the door panel also { liftDoor: level }
```

- [ ] **Step 1: Rewrite the affected tests first.** In `prototype/tests/hideout.test.mjs`:
  - import list: drop `sightBlocked`, `stubPts`; add `inCabin`, `liftDoor`, `nearLiftDoor`, `liftColliders`.
  - **delete** `sightBlocked_MouthToLobby` (the lift is meant to be visible from the gate, spec "Consequences").
  - replace `hideoutCuts_CavernIsAFlatDiscOfRadius22`, `CAVE_LayoutIsTheSpecsSketch`,
    `caveCuts_EightLevelCutsOnOneFloor`, `roomAt_corridorAt_caveRoofed`, `ringArcs_LeaveEveryExitOpen`,
    `ceilingAt_TunnelsCappedRoomsLidLobbyLow`, `caveLamps_AlongTheDrive_NoFlareAndNoJump`,
    `LIFT_PlatformSitsInTheLobbyAndFacesDownT2b` with the tests below; in `inHideout_IsTheOpenTrenchAndT1Only`
    drop the `lobby`/`n1` lines and change `inCavern(cx + 21 / 23 / 23, 2)` to `24 / 26 / 26, 2`.
  - keep every other test as it is (`floorAt…` and `hideoutCuts_FloorMeetsTheGroundAtTheMouth` read
    `cavernR()`, so they follow the new radius by themselves).

```js
test('hideoutCuts_HallIsAFlatDiscOfRadius25', () => {
  const { cavern, f0 } = hideoutCuts(hill), [cx, cz] = A.centre;
  for (const [dx, dz] of [[0, 0], [24, 0], [0, -24], [17, 17]]) close(cutFloorAt(cavern, cx + dx, cz + dz, cavern.u), f0, 1e-6, `${dx},${dz}`);
  assert.equal(cutFloorAt(cavern, cx + 26, cz, cavern.u), null);
  assert.equal(cavernR(), 25);
});

test('CAVE_IsTheGateTunnelAndTheLiftHallOnly', () => {
  assert.deepEqual(Object.keys(CAVE.nodes), ['hall']); assert.deepEqual(CAVE.links, []); assert.deepEqual(CAVE.stubs, []);
  close(CAVE.nodes.hall.c[0], A.centre[0], 0.1); close(CAVE.nodes.hall.c[1], A.centre[1], 0.1);
  assert.equal(nodeR(CAVE.nodes.hall), 25); assert.equal(nodeR(CAVE.nodes.hall), cavernR()); assert.equal(CAVE.nodes.hall.ceiling, 'lid');
  assert.equal(EIFFEL.h, 330); assert.equal(EIFFEL.feet.length, 4);
});

test('caveCuts_T1AndTheHallOnOneFloor', () => {
  const { cuts, f0 } = caveCuts(plateau);
  assert.deepEqual(cuts.map(c => c.id), ['t1', 'hall']);
  close(cuts[1].f0, f0); assert.ok(cuts[1].depth > 70, `hall depth ${cuts[1].depth}`);
});

test('roomAt_corridorAt_caveRoofed_TheHall', () => {
  const [hx, hz] = CAVE.nodes.hall.c;
  assert.equal(roomAt(hx, hz), 'hall'); assert.equal(roomAt(hx + 24, hz), 'hall'); assert.equal(roomAt(hx + 30, hz), null);
  assert.equal(corridorAt(hx, hz), null, 'no corridors any more');
  assert.ok(caveRoofed(hx, hz, 10)); assert.ok(!caveRoofed(hx + 300, hz, 10));
  assert.ok(caveRoofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, 10)); assert.ok(!caveRoofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, 10), 'the open trench');
});

test('ringArcs_TheHallOpensOnlyTowardsT1', () => {
  const arcs = ringArcs('hall'), R = nodeR(CAVE.nodes.hall) - TUNNEL.wall / 2;
  assert.equal(arcs.length, 1);
  const gap = 2 * Math.PI - (arcs[0].a1 - arcs[0].a0); close(gap, 2 * Math.asin((HIDEOUT.hw + TUNNEL.margin + TUNNEL.wall) / R), 1e-9);
  const mid = (arcs[0].a1 + arcs[0].a0) / 2 + Math.PI;   // the middle of the opening
  close(Math.cos(mid), Math.cos(HIDEOUT.heading + Math.PI), 1e-9); close(Math.sin(mid), Math.sin(HIDEOUT.heading + Math.PI), 1e-9);
});

test('ceilingAt_T1CappedHallIsTheHill', () => {
  const [hx, hz] = CAVE.nodes.hall.c;
  close(ceilingAt(hx, hz, plateau, 10), 150 - 0.6, 1e-6, 'the hall keeps the hill');
  close(ceilingAt(A.mouth[0] + A.ux * 60, A.mouth[1] + A.uz * 60, plateau, 10), Math.min(150 - 0.6, floorAt(60, 75) + TUNNEL_CEIL), 1e-6, 'T1 capped');
  assert.equal(ceilingAt(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, plateau, 10), null, 'the open trench');
  assert.equal(ceilingAt(hx + 400, hz, plateau, 10), null);
});

test('caveLamps_AlongT1IntoTheHall_NoFlareAndNoJump_AndClearOfTheCabin', () => {
  const lamps = caveLamps(), n = Math.round(Math.hypot(A.centre[0] - A.mouth[0], A.centre[1] - A.mouth[1]) + 20);
  assert.equal(lamps.length, 2); for (const l of lamps) { assert.equal(l.room, 'hall'); assert.ok(!onLiftPlatform(l.x, l.z, 3), 'not over the cabin'); }
  let prev = null, peak = 0, worst = 1;
  for (let s = 0; s < n; s++) {
    const e = lampLight(lamps, A.mouth[0] + A.ux * s, A.mouth[1] + A.uz * s); peak = Math.max(peak, e);
    if (prev !== null && Math.max(prev, e) > 0.05) worst = Math.max(worst, Math.max(e, prev) / Math.max(1e-6, Math.min(e, prev)));
    prev = e;
  }
  assert.ok(peak <= 2.5, `hot spot ${peak}`); assert.ok(worst <= 1.25, `jump x${worst}`);
});

test('LIFT_StandsInTheHallOnT1sAxis_ACabinForAnArticulatedBus', () => {
  assert.deepEqual(LIFT.c, CAVE.nodes.hall.c); close(LIFT.th, HIDEOUT.heading, 1e-12);
  assert.ok(2 * LIFT.hd >= 18 + 2 && 2 * LIFT.hw >= 2.55 + 4, 'an 18 m bus fits with room to spare');
  assert.ok(LIFT.hd + LIFT.wall + 10 <= cavernR(), 'room to drive up to door A inside the hall');
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)];
  assert.ok(onLiftPlatform(LIFT.c[0] + f[0] * 10.9, LIFT.c[1] + f[1] * 10.9)); assert.ok(!onLiftPlatform(LIFT.c[0] + f[0] * 11.2, LIFT.c[1] + f[1] * 11.2));
  assert.ok(inCabin(LIFT.c[0] + f[0] * 1.9, LIFT.c[1] + f[1] * 1.9, 9), 'a bus (half length 9) centred within 2 m is fully inside');
  assert.ok(!inCabin(LIFT.c[0] + f[0] * 2.1, LIFT.c[1] + f[1] * 2.1, 9)); assert.ok(inCabin(LIFT.c[0] - f[1] * 3.9, LIFT.c[1] + f[0] * 3.9, 9), 'the width is not shrunk');
});

test('liftDoor_AFacesTheTunnelAbove_BFacesAwayBelow', () => {
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], a = liftDoor('top'), b = liftDoor('bottom');
  close(a.x, LIFT.c[0] - f[0] * LIFT.hd); close(a.z, LIFT.c[1] - f[1] * LIFT.hd); close(Math.cos(a.th), -f[0]); close(Math.sin(a.th), -f[1]);
  close(b.x, LIFT.c[0] + f[0] * LIFT.hd); close(b.z, LIFT.c[1] + f[1] * LIFT.hd); close(Math.cos(b.th), f[0]); close(Math.sin(b.th), f[1]);
  assert.ok(axisCoords(a.x, a.z).s < axisCoords(b.x, b.z).s, 'A is the end the car reaches first from the gate');
  assert.ok(nearLiftDoor(a.x - f[0] * 14.5, a.z - f[1] * 14.5, 'top')); assert.ok(!nearLiftDoor(a.x - f[0] * 15.5, a.z - f[1] * 15.5, 'top'));
  assert.ok(nearLiftDoor(...LIFT.c, 'top') && nearLiftDoor(...LIFT.c, 'bottom'), 'in the cabin counts as near');
  assert.ok(LIFT.door.hw * 2 >= 6 && LIFT.door.h >= 5);
});

test('liftColliders_TheWorkingDoorIsTheOnlyGap_TheOtherEndIsShut', () => {
  const f = [Math.cos(LIFT.th), Math.sin(LIFT.th)], v = [-f[1], f[0]], hit = (os, x, z) => os.some(o => { const dx = x - o.x, dz = z - o.z; return Math.abs(dx * o.c + dz * o.s) <= o.hw && Math.abs(-dx * o.s + dz * o.c) <= o.hd; });
  for (const level of ['top', 'bottom']) {
    const os = liftColliders(level, 70), solid = os.filter(o => !o.liftDoor), open = level === 'top' ? -1 : 1, end = LIFT.hd + LIFT.wall / 2;
    assert.ok(os.every(o => o.secret && o.h === 70 + LIFT.height), level);
    assert.equal(os.filter(o => o.liftDoor === level).length, 1, `${level}: one door panel`);
    const at = (a, b) => [LIFT.c[0] + f[0] * a + v[0] * b, LIFT.c[1] + f[1] * a + v[1] * b];
    assert.ok(!hit(solid, ...at(open * end, 0)) && !hit(solid, ...at(open * end, 2.9)), `${level}: the working door's opening is free without its panel`);
    assert.ok(hit(os, ...at(open * end, 0)), `${level}: the shut panel blocks it`);
    assert.ok(hit(solid, ...at(-open * end, 0)) && hit(solid, ...at(-open * end, 3.5)), `${level}: the other end is a wall`);
    assert.ok(hit(solid, ...at(0, LIFT.hw + LIFT.wall / 2)) && hit(solid, ...at(0, -(LIFT.hw + LIFT.wall / 2))), `${level}: side walls`);
    assert.ok(!hit(os, ...LIFT.c), 'the cabin floor is free');
  }
});
```

- [ ] **Step 2: Run red.** `node --test prototype/tests/hideout.test.mjs` — the new tests fail (no `hall`,
  no `liftDoor`).
- [ ] **Step 3: Implement** in `prototype/hideout.js`:
  - `HIDEOUT.cavernHw: 23`.
  - `CAVE = { nodes: { hall: { c: R0, r: HIDEOUT.cavernHw, ceiling: 'lid' } }, links: [], stubs: [] }`; update
    the header comment (#361: T1 ends in the lift hall).
  - `CAVE_LAMPS = { hall: { off: 16, y: 9, intensity: 180, distance: 60, decay: 2 } }`; `caveLamps(h)` returns
    the two hall lamps at `centre ± (ux, uz) * 16` with `room: 'hall'` (drop the lobby loop and the T2B lookup).
  - `caveCuts`: `cavern.id = 'hall'`; `cuts = [tunnel, cavern, ...links, ...stubs]` (no `n1`/`lobby` discs).
  - `ringArcs`: `if (id === 'hall') exits.push({ a: HIDEOUT.heading + Math.PI, hw: HIDEOUT.hw })`.
  - Delete `inCaveAir`, `sightBlocked`, the `T2B` constant.
  - `LIFT` and the helpers:

```js
// #361: the freight lift in the lift hall, on T1's axis: cabin 8 x 22 m, a door at each end of the one driving axis. Door A (towards
// the tunnel) works on the surface ('top'), door B (away from it) on the ring level below ('bottom'); the other end is a wall there.
export const LIFT = { c: CAVE.nodes.hall.c, th: HIDEOUT.heading, hw: 4, hd: 11, door: { hw: 3, h: 5 }, wall: 0.5, height: 8, near: 15 };
const liftAt = (l, a, b) => [l.c[0] + Math.cos(l.th) * a - Math.sin(l.th) * b, l.c[1] + Math.sin(l.th) * a + Math.cos(l.th) * b];
export function inCabin(x, z, halfLen = 0, l = LIFT) { const dx = x - l.c[0], dz = z - l.c[1]; return Math.abs(dx * Math.cos(l.th) + dz * Math.sin(l.th)) <= l.hd - halfLen && Math.abs(-dx * Math.sin(l.th) + dz * Math.cos(l.th)) <= l.hw; }
export function liftDoor(level, l = LIFT) { const k = level === 'top' ? -1 : 1, [x, z] = liftAt(l, k * l.hd, 0); return { x, z, th: level === 'top' ? l.th + Math.PI : l.th }; }
export function nearLiftDoor(x, z, level, l = LIFT) { const d = liftDoor(level, l); return Math.hypot(x - d.x, z - d.z) <= l.near || onLiftPlatform(x, z, 0, l); }
export function liftColliders(level, y, l = LIFT) {
  const w = l.wall, h = y + l.height, c = Math.cos(l.th), s = Math.sin(l.th), open = level === 'top' ? -1 : 1, end = l.hd + w / 2, jamb = (l.hw - l.door.hw) / 2;
  const box = (a, b, hw, hd, extra = {}) => { const [x, z] = liftAt(l, a, b); return { x, z, hw, hd, c, s, h, secret: true, ...extra }; };
  return [box(0, l.hw + w / 2, l.hd + w, w / 2), box(0, -(l.hw + w / 2), l.hd + w, w / 2),   // the side walls
    box(-open * end, 0, w / 2, l.hw + w),                                                    // the shut end
    box(open * end, l.door.hw + jamb, w / 2, jamb), box(open * end, -(l.door.hw + jamb), w / 2, jamb),   // the jambs
    box(open * end, 0, w / 2, l.door.hw, { liftDoor: level })];                              // the door panel
}
```

- [ ] **Step 4: Run green**, then `node --test prototype/tests/*.test.mjs`. `room-eiffel.test.mjs` /
  `room-fly.test.mjs` may now fail because the lift moved; that is fixed in Task 4 — note it, do not touch
  them here.
- [ ] **Step 5: Commit** `feat(world): the hideout's lift hall and drive-through lift layout` (`Refs #361`).

---

## Task 2: doors and the cabin's level (`lift.js`)

**Files:** `prototype/tests/lift.test.mjs`, `prototype/lift.js`.

**Interfaces:** `createLift(times)` → adds `get cabin` (`'top' | 'bottom'`, starts `'top'`), `get door` (0 shut … 1
open, at the cabin's level), `doorAt(level)` (0 when the cabin is elsewhere), `place(level)`. `step(dt, { onPlatform,
near = onPlatform, level = cabin, speed, dir })`. The cabin flips at the `'switch'` event. Existing getters and events
unchanged; every existing test stays as it is.

- [ ] **Step 1: Append the failing tests** to `prototype/tests/lift.test.mjs`:

```js
const NEAR = { onPlatform: false, near: true, level: 'top', speed: 3, dir: 'down' };
const AWAY = { onPlatform: false, near: false, level: 'top', speed: 3, dir: 'down' };

test('door_OpensWhenTheCarComesNearOnTheCabinsLevel_AndClosesWhenItLeaves', () => {
  const l = createLift(); assert.equal(l.cabin, 'top'); assert.equal(l.door, 0);
  run(l, LIFT_TIMES.open / 2, NEAR); assert.ok(l.door > 0.4 && l.door < 0.6, `${l.door}`);
  run(l, LIFT_TIMES.open, NEAR); assert.equal(l.door, 1); assert.equal(l.doorAt('top'), 1); assert.equal(l.doorAt('bottom'), 0);
  run(l, LIFT_TIMES.close + 0.1, AWAY); assert.equal(l.door, 0);
});

test('door_StaysShutWhenTheCabinIsOnTheOtherLevel', () => {
  const l = createLift(); run(l, 3, { ...NEAR, level: 'bottom' }); assert.equal(l.door, 0); assert.equal(l.doorAt('bottom'), 0);
  assert.deepEqual(run(l, 3, { onPlatform: true, near: true, level: 'bottom', speed: 0, dir: 'up' }), [], 'no ride from the wrong level');
});

test('ride_ShutsTheDoorFlipsTheCabinAtTheSwitchAndOpensTheArrivalDoor', () => {
  const l = createLift(), T = LIFT_TIMES; run(l, T.dwell + 0.05); assert.equal(l.phase, 'closing'); assert.equal(l.cabin, 'top');
  run(l, T.close + T.ride / 2 - 0.2); assert.equal(l.door, 0); assert.equal(l.cabin, 'top');
  run(l, 0.4); assert.equal(l.cabin, 'bottom', 'flipped at the midpoint');
  run(l, T.ride / 2 + T.open + 0.1, { onPlatform: true, near: true, level: 'bottom', speed: 0, dir: 'down' });
  assert.equal(l.phase, 'idle'); assert.equal(l.doorAt('bottom'), 1); assert.equal(l.doorAt('top'), 0);
});

test('place_PutsTheCabinOnALevelWithItsDoorShut', () => {
  const l = createLift(); run(l, 2, NEAR); l.place('bottom'); assert.equal(l.cabin, 'bottom'); assert.equal(l.door, 0);
  run(l, 2, { ...NEAR, level: 'bottom' }); assert.equal(l.doorAt('bottom'), 1);
  l.abort(); l.place('top'); assert.equal(l.cabin, 'top'); assert.equal(l.phase, 'idle');
});
```

- [ ] **Step 2: Run red** (`node --test prototype/tests/lift.test.mjs`).
- [ ] **Step 3: Implement.** In `createLift` add `cabin = 'top', door = 0`. In `advance`, at the switch also
  `cabin = cabin === 'top' ? 'bottom' : 'top'`; at `done` set `door = 1`. `abort()` also sets `door = 0`.
  New members:

```js
    get cabin() { return cabin; },
    // the door at the cabin's level: proximity-driven while idle, the inverse of the ride's gate during a ride
    get door() { return phase === 'idle' ? door : 1 - this.gate; },
    doorAt(level) { return level === cabin ? this.door : 0; },
    place(level) { cabin = level; door = 0; },
```

  and at the top of the idle branch of `step` (destructure `{ onPlatform, near = onPlatform, level = cabin, speed, dir }`):

```js
      const here = level === cabin;
      door = here && near ? Math.min(1, door + dt / T.open) : Math.max(0, door - dt / T.close);
      if (!onPlatform) { armed = true; dwell = 0; return out; }
      if (!here || !armed || speed >= T.stopSpeed) { dwell = 0; return out; }
```

  Update the header comment (#361: doors, cabin level).
- [ ] **Step 4: Run green** (whole `lift.test.mjs`, then all node tests).
- [ ] **Step 5: Commit** `feat(world): freight-lift doors that open as the car comes near` (`Refs #361`).

---

## Task 3: the ring level layout (`underground.js`, new)

**Files:** create `prototype/underground.js`, `prototype/tests/underground.test.mjs`.

**Interfaces:**

```js
export const BELOW_Y = -600;
export const RING = { r: 60, hw: 8, ceiling: 9, wall: 1 };
export const EXIT = { from: LIFT.hd, to: RING.r - RING.hw, hw: 5, ceiling: 7 };
export const SPOKE = { n: 8, len: 100, hw: 5, ceiling: 7, phase: Math.PI / 8, dark: [40, 60], switchIn: 52, switchOut: 48, ringEnd: 70, roomStart: 30 };
export function spokeFrame(k);                 // { k, a, u, v, start (r 68), end (r 168) }
export function spokeAt(x, z, pad = 0);        // { k, s, d } or null
export function belowLevelAt(current, x, z, roomIds);   // the level the car should be on: 'ring' <-> roomIds[k]
export function ringColliders();               // ring walls, exit walls, spoke walls s 0..70 + caps, liftColliders('bottom', BELOW_Y)
export function ringCeilingAt(x, z);           // BELOW_Y + ceiling in ring / exit / spokes / cabin, else null
export function ringSpawn();                   // { x, z, th }: the exit's ring end, facing out
export function spokeSigns(rooms);             // [{ k, text, x, y, z, th }] for rooms with an object and a name
```

- [ ] **Step 1: Write the failing tests** `prototype/tests/underground.test.mjs`:

```js
// #361: the hideout below the lift -- the ring level's pure layout. node --test prototype/tests/underground.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELOW_Y, RING, EXIT, SPOKE, spokeFrame, spokeAt, belowLevelAt, ringColliders, ringCeilingAt, ringSpawn, spokeSigns } from '../underground.js';
import { HIDEOUT, LIFT, TUNNEL_CEIL } from '../hideout.js';

const C = LIFT.c, F = [Math.cos(LIFT.th), Math.sin(LIFT.th)], IDS = ['eiffel', 'room1', 'room2', 'room3', 'room4', 'room5', 'room6', 'room7'];
const close = (a, b, eps = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} vs ${b}`);
const polar = (r, a) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
const blocked = (x, z, r = 1.3) => ringColliders().some(o => { const dx = x - o.x, dz = z - o.z; return Math.abs(dx * o.c + dz * o.s) <= o.hw + r && Math.abs(-dx * o.s + dz * o.c) <= o.hd + r; });
const onSpoke = (k, s, d = 0) => { const f = spokeFrame(k); return [f.start[0] + f.u[0] * s + f.v[0] * d, f.start[1] + f.u[1] * s + f.v[1] * d]; };

test('clearance_EverythingFitsAnArticulatedBus', () => {
  const bus = { w: 2.55, h: 3.3 }, gaps = { t1: [2 * HIDEOUT.hw, TUNNEL_CEIL], door: [2 * LIFT.door.hw, LIFT.door.h], cabin: [2 * LIFT.hw, LIFT.height], exit: [2 * EXIT.hw, EXIT.ceiling], ring: [2 * RING.hw, RING.ceiling], spoke: [2 * SPOKE.hw, SPOKE.ceiling] };
  for (const [k, [w, h]] of Object.entries(gaps)) assert.ok(w >= bus.w + 2 && h >= bus.h + 1.5, `${k}: ${w} x ${h}`);
  assert.ok(2 * LIFT.hd >= 18 + 2, 'cabin length'); assert.equal(RING.r, 60); assert.equal(2 * RING.hw, 16); assert.equal(BELOW_Y, -600);
});

test('spokeFrame_EightSpokes45DegreesApart_NoneOnTheExitsAxis', () => {
  for (let k = 0; k < 8; k++) {
    const f = spokeFrame(k); close(f.a - spokeFrame(0).a, k * Math.PI / 4, 1e-9);
    close(Math.hypot(f.start[0] - C[0], f.start[1] - C[1]), RING.r + RING.hw); close(Math.hypot(f.end[0] - C[0], f.end[1] - C[1]), RING.r + RING.hw + SPOKE.len);
    const off = Math.acos(Math.max(-1, Math.min(1, f.u[0] * F[0] + f.u[1] * F[1]))); assert.ok(off > 0.3, `spoke ${k} is ${off} rad off the exit`);
  }
  close(spokeFrame(0).a, LIFT.th + Math.PI / 8, 1e-12, 'spoke 0 is the first one past the exit');
});

test('spokeAt_FindsTheSpokeAndTheMetresAlongIt', () => {
  const p = onSpoke(3, 37.5, 2), sp = spokeAt(...p); assert.equal(sp.k, 3); close(sp.s, 37.5); close(sp.d, 2);
  assert.equal(spokeAt(...polar(RING.r, LIFT.th)), null, 'the ring itself is no spoke');
  assert.equal(spokeAt(...onSpoke(3, 50, SPOKE.hw + 1)), null, 'beside the spoke is rock');
});

test('belowLevelAt_SwitchesInTheDarkStretchWithHysteresis', () => {
  for (const k of [0, 5]) {
    assert.equal(belowLevelAt('ring', ...onSpoke(k, 51), IDS), 'ring'); assert.equal(belowLevelAt('ring', ...onSpoke(k, 52.5), IDS), IDS[k]);
    assert.equal(belowLevelAt(IDS[k], ...onSpoke(k, 49), IDS), IDS[k]); assert.equal(belowLevelAt(IDS[k], ...onSpoke(k, 47.5), IDS), 'ring');
  }
  assert.ok(SPOKE.dark[0] < SPOKE.switchOut && SPOKE.switchIn < SPOKE.dark[1], 'both switch points are in the dark');
  assert.ok(SPOKE.roomStart < SPOKE.dark[0] - 8 && SPOKE.ringEnd > SPOKE.dark[1] + 8, 'each level draws 15+ m past the switch for the camera');
  assert.equal(belowLevelAt('room1', ...onSpoke(0, 47), IDS), 'room1', 'another room never switches via a foreign spoke');
  assert.equal(belowLevelAt('ring', ...polar(RING.r, 1), IDS), 'ring');
});

test('ringColliders_TheRingIsClosedExceptTheExitAndTheSpokes', () => {
  for (let i = 0; i < 360; i += 2) {
    const a = i * Math.PI / 180, inner = polar(RING.r - RING.hw - RING.wall / 2, a), outer = polar(RING.r + RING.hw + RING.wall / 2, a);
    const toExit = Math.abs(Math.atan2(Math.sin(a - LIFT.th), Math.cos(a - LIFT.th))), toSpoke = Math.min(...Array.from({ length: 8 }, (_, k) => Math.abs(Math.atan2(Math.sin(a - spokeFrame(k).a), Math.cos(a - spokeFrame(k).a)))));
    if (toExit > 0.2) assert.ok(blocked(...inner, 0), `inner wall open at ${i}`);
    if (toSpoke > 0.15) assert.ok(blocked(...outer, 0), `outer wall open at ${i}`);
    assert.ok(!blocked(...polar(RING.r, a)), `the ring's middle is blocked at ${i}`);
  }
  for (let s = EXIT.from + 3; s <= EXIT.to; s += 2) assert.ok(!blocked(C[0] + F[0] * s, C[1] + F[1] * s), `exit blocked at ${s}`);
  for (let k = 0; k < 8; k++) { for (let s = 0; s <= SPOKE.ringEnd - 3; s += 2) assert.ok(!blocked(...onSpoke(k, s)), `spoke ${k} at ${s}`); assert.ok(blocked(...onSpoke(k, SPOKE.ringEnd + 0.4), 0), `spoke ${k} capped`); }
  assert.ok(ringColliders().some(o => o.liftDoor === 'bottom'), 'door B is in the ring level');
});

test('ringCeilingAt_RingSpokesExitCabin', () => {
  close(ringCeilingAt(...polar(RING.r, 2)), BELOW_Y + RING.ceiling); close(ringCeilingAt(...onSpoke(1, 20)), BELOW_Y + SPOKE.ceiling);
  close(ringCeilingAt(C[0] + F[0] * 30, C[1] + F[1] * 30), BELOW_Y + EXIT.ceiling); assert.ok(ringCeilingAt(...C) >= BELOW_Y + LIFT.door.h);
  assert.equal(ringCeilingAt(C[0] + 500, C[1]), null);
});

test('ringSpawn_AtTheExitsRingEndFacingOut', () => {
  const s = ringSpawn(); close(Math.hypot(s.x - C[0], s.z - C[1]), RING.r - RING.hw - 2); close(s.th, LIFT.th); assert.ok(!blocked(s.x, s.z));
});

test('spokeSigns_OnlyRoomsWithAnObjectAreSigned', () => {
  const rooms = IDS.map((id, k) => ({ id, name: k === 0 ? 'La Tour Eiffel' : null, object: k === 0 ? { h: 330 } : null }));
  const signs = spokeSigns(rooms); assert.equal(signs.length, 1); assert.equal(signs[0].k, 0); assert.equal(signs[0].text, 'La Tour Eiffel');
  const f = spokeFrame(0); assert.ok(Math.hypot(signs[0].x - f.start[0], signs[0].z - f.start[1]) < 1.5, 'at the spoke mouth');
  assert.ok(signs[0].y > BELOW_Y + SPOKE.ceiling && signs[0].y < BELOW_Y + RING.ceiling, 'over the opening, under the ring ceiling');
  assert.deepEqual(spokeSigns([{ id: 'x', name: 'Atomium', object: null }]), [], 'a named room without its object stays unsigned');
});
```

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement `prototype/underground.js`** (header: `// #361: the hideout below the lift -- pure layout
  (no three.js, no DOM) …`). Imports `LIFT, liftColliders, ringStations` from `./hideout.js`. Notes:
  - `spokeFrame(k)`: `a = LIFT.th + SPOKE.phase + k * 2π / SPOKE.n`, `u = [cos a, sin a]`, `v = [-u[1], u[0]]`,
    `start = C + u·(RING.r + RING.hw)`, `end = start + u·SPOKE.len`.
  - `spokeAt`: project on each frame from `start`; hit when `d ≤ SPOKE.hw + pad` and `−pad ≤ s ≤ SPOKE.len + pad`.
  - `belowLevelAt`: `sp = spokeAt(x, z)`; none → `current`; `current === 'ring'` → `sp.s ≥ switchIn ? roomIds[sp.k] : 'ring'`;
    `current === roomIds[sp.k]` → `sp.s ≤ switchOut ? 'ring' : current`; else `current`.
  - `ringColliders()`: `h = BELOW_Y + RING.ceiling` (walls are full height, not `low`). An arc wall = `ringStations(C, R,
    n, a0, a1)` → `{ x, z, hw: len / 2, hd: wall / 2, c: cos rot, s: sin rot, h }` with n ≈ one piece per 4 m. Inner wall
    `R = RING.r − RING.hw − wall/2`, one opening centred on `LIFT.th` of half angle `asin((EXIT.hw + wall) / R)`; outer wall
    `R = RING.r + RING.hw + wall/2`, eight openings on the spoke angles, half angle `asin((SPOKE.hw + wall) / R)` (write a
    small `arcsWithGaps(R, gapAngles, half)` helper). Exit side walls along `F` from `EXIT.from` to `EXIT.to` at
    `±(EXIT.hw + wall/2)`. Each spoke: side walls `s 0..ringEnd` at `±(SPOKE.hw + wall/2)`, cap across at `s = ringEnd + 0.5`.
    Then `...liftColliders('bottom', BELOW_Y)`.
  - `ringCeilingAt`: cabin (`|along| ≤ LIFT.hd + 1`, `|across| ≤ LIFT.hw + 1`) → `BELOW_Y + LIFT.height − 1`; exit strip →
    `EXIT.ceiling`; `|r − RING.r| ≤ RING.hw + wall` → `RING.ceiling`; `spokeAt(x, z, wall)` → `SPOKE.ceiling`; else `null`.
  - `ringSpawn()`: `C + F·(RING.r − RING.hw − 2)`, `th: LIFT.th`.
  - `spokeSigns(rooms)`: for each `k` with `rooms[k].object && rooms[k].name`: `x, z = start − u·0.6`, `y = BELOW_Y +
    (SPOKE.ceiling + RING.ceiling) / 2`, `th = a + π` (facing into the ring), `text = name`.
- [ ] **Step 4: Run green** + all node tests.
- [ ] **Step 5: Commit** `feat(world): the tunnel ring and its eight spokes below the lift` (`Refs #361`).

---

## Task 4: the room template (`rooms.js`) and `levels.ceilingAt`

**Files:** `git mv prototype/room-eiffel.js prototype/rooms.js`, `git mv prototype/tests/room-eiffel.test.mjs
prototype/tests/rooms.test.mjs`; modify `prototype/tests/room-fly.test.mjs`, `prototype/levels.js`,
`prototype/tests/levels.test.mjs`; change the import in `prototype/index.html:361` to `./rooms.js` (and nothing
else in `index.html` yet).

**Interfaces:**

```js
export const ROOM_Y = BELOW_Y, ROOM_HALF = 250;
export const ROOMS = [{ id: 'eiffel', name: 'La Tour Eiffel', object: EIFFEL }, { id: 'room1', name: null, object: null }, … 'room7'];
export const isRoomLevel = (id) => ROOMS.some(r => r.id === id);
export function roomLayout(k, room = ROOMS[k]);
//  -> { id, k, y, half, centre, frame: { f, v }, groundAt, ceilingAt, object, tower|null, feet, colliders, trees, paths,
//       portal: { c, th, hw, h }, spawn, towerView|null }
export const eiffelRoom = () => roomLayout(0);
export const flyAllowed = (level, zone) => zone !== 'lift' && (isRoomLevel(level) ? zone === 'room' : level === 'surface' && zone === 'open');
export function roomFlyClamp(x, y, z, room = eiffelRoom(), cfg = ROOM_FLY);   // clamps in the room's own frame
// levels.js: ceilingAt: (x, z) => current().ceilingAt ? current().ceilingAt(x, z) : null
```

- [ ] **Step 1: Rewrite the tests first.** `rooms.test.mjs` (the ported Eiffel tests, now in the room's rotated frame):

```js
// #277 / #361: the room template -- pure. node --test prototype/tests/rooms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomLayout, eiffelRoom, ROOMS, ROOM_Y, ROOM_HALF, isRoomLevel } from '../rooms.js';
import { EIFFEL } from '../hideout.js';
import { SPOKE, spokeFrame } from '../underground.js';

const CAR_R = 2.6, rooms = ROOMS.map((_, k) => roomLayout(k)), room = rooms[0];
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };
const blocked = (R, x, z, r = CAR_R) => R.colliders.some(o => inside(o, x, z, r));
const toWorld = (R, a, b) => [R.centre[0] + R.frame.f[0] * a + R.frame.v[0] * b, R.centre[1] + R.frame.f[1] * a + R.frame.v[1] * b];   // a: towards the far edge, b: across
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };
const reach = (R, step = 4) => {   // flood fill in the room's frame from the spawn, 8 neighbours
  const n = Math.ceil((ROOM_HALF + 80) / step), seen = new Set(), [a0, b0] = toLocal(R, R.spawn.x, R.spawn.z), todo = [[Math.round(a0 / step), Math.round(b0 / step)]];
  while (todo.length) { const [i, j] = todo.pop(), k = i + ',' + j; if (seen.has(k) || Math.abs(i) > n || Math.abs(j) > n || blocked(R, ...toWorld(R, i * step, j * step))) continue; seen.add(k); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) todo.push([i + a, j + b]); }
  return { seen, step };
};

test('ROOMS_EightRooms_OnlyTheEiffelHasAnObject', () => {
  assert.equal(ROOMS.length, 8); assert.deepEqual(ROOMS.map(r => r.id), ['eiffel', 'room1', 'room2', 'room3', 'room4', 'room5', 'room6', 'room7']);
  assert.equal(ROOMS[0].object, EIFFEL); assert.equal(ROOMS[0].name, 'La Tour Eiffel'); for (const r of ROOMS.slice(1)) { assert.equal(r.object, null); assert.equal(r.name, null); }
  assert.ok(isRoomLevel('eiffel') && isRoomLevel('room7') && !isRoomLevel('ring') && !isRoomLevel('surface'));
});

test('roomLayout_FloorIs600mDown500mSquare_PortalAtTheSpokesEnd', () => {
  for (const [k, R] of rooms.entries()) {
    assert.equal(R.y, -600); assert.equal(ROOM_Y, -600); assert.equal(R.groundAt(R.centre[0] + 12, R.centre[1] - 99, 0), -600);
    const sp = spokeFrame(k); assert.ok(Math.hypot(R.portal.c[0] - sp.end[0], R.portal.c[1] - sp.end[1]) < 1e-6, `room ${k} portal`);
    const [a, b] = toLocal(R, ...R.portal.c); assert.ok(Math.abs(a + ROOM_HALF) < 1e-6 && Math.abs(b) < 1e-6, 'the portal is in the middle of the near edge');
    assert.ok(Math.abs(R.frame.f[0] - sp.u[0]) < 1e-9 && Math.abs(R.frame.f[1] - sp.u[1]) < 1e-9, 'the room faces along its spoke');
  }
});

test('roomLayout_TheEiffelTowerIsCentredWithLegCollidersOnTheFeet_EmptyRoomsHaveNone', () => {
  assert.deepEqual([room.tower.x, room.tower.z], room.centre); assert.equal(room.feet.length, 4);
  EIFFEL.feet.forEach(([fx, fz], i) => { assert.equal(room.feet[i].x, room.tower.x + fx); assert.equal(room.feet[i].z, room.tower.z + fz); assert.equal(room.feet[i].hw, EIFFEL.footHw); assert.ok(blocked(room, room.feet[i].x, room.feet[i].z, 0)); });
  for (const R of rooms.slice(1)) { assert.equal(R.tower, null); assert.deepEqual(R.feet, []); assert.equal(R.towerView, null); assert.ok(!blocked(R, ...R.centre)); }
});

test('roomLayout_SpaceUnderTheTowerIsDrivable_AndReachableFromThePortal', () => {
  for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30]]) assert.ok(!blocked(room, room.tower.x + x, room.tower.z + z), `blocked at ${x},${z}`);
  assert.ok(reach(room).seen.has('0,0'));
});

test('roomLayout_TheTreeRingIsClosed_TheOnlyWayOutIsThePortalTunnel', () => {
  for (const R of [rooms[0], rooms[3]]) {
    const r = reach(R), lim = ROOM_HALF - 3;
    for (const k of r.seen) {
      const [i, j] = k.split(',').map(Number), a = i * r.step, b = j * r.step;
      const inTunnel = a < -lim && Math.abs(b) <= SPOKE.hw && a >= -ROOM_HALF - (SPOKE.len - SPOKE.roomStart);
      assert.ok((Math.abs(a) <= lim && Math.abs(b) <= lim) || inTunnel, `room ${R.k} leaked to ${a},${b}`);
    }
    assert.ok(r.seen.size > 4000, `room ${R.k}: ${r.seen.size} cells`);
    assert.ok([...r.seen].some(k => Number(k.split(',')[0]) * r.step < -ROOM_HALF - 30), 'the portal tunnel is drivable');
  }
});

test('roomLayout_TreesStandInTwoClosedRows_WithAGapOnlyAtThePortal', () => {
  for (const R of [rooms[0], rooms[5]]) {
    const local = R.trees.map(t => [...toLocal(R, t[0], t[1]), t[2]]), cheb = ([a, b]) => Math.max(Math.abs(a), Math.abs(b));
    assert.ok(R.trees.length > 600); for (const t of local) { assert.ok(cheb(t) > ROOM_HALF - 16 && cheb(t) < ROOM_HALF - 2); assert.ok(t[2] >= 8 && t[2] <= 15); }
    const edge = (sel, along) => local.filter(sel).map(along).sort((p, q) => p - q), gaps = (xs) => xs.slice(1).map((x, i) => [x - xs[i], x]);
    for (const [sel, along] of [[t => t[0] > ROOM_HALF - 9, t => t[1]], [t => t[1] > ROOM_HALF - 9, t => t[0]], [t => t[1] < -ROOM_HALF + 9, t => t[0]]]) for (const [g, at] of gaps(edge(sel, along))) assert.ok(g < 7, `gap ${g} at ${at}`);
    const near = gaps(edge(t => t[0] < -ROOM_HALF + 9, t => t[1])), wide = near.filter(([g]) => g >= 7);
    assert.equal(wide.length, 1, 'one gap on the near edge'); assert.ok(Math.abs(wide[0][1] - wide[0][0] / 2) < 4, 'centred on the portal'); assert.ok(wide[0][0] < 2 * (SPOKE.hw + 6) + 7);
  }
});

test('roomLayout_PathsRunFromThePortalToTheCentreAndAroundIt_SpawnFacesIn', () => {
  for (const R of [rooms[0], rooms[2]]) {
    assert.equal(R.paths.length, 2); const [toCentre, loop] = R.paths;
    assert.ok(Math.hypot(toCentre.pts[0][0] - R.portal.c[0], toCentre.pts[0][1] - R.portal.c[1]) < 25, 'starts at the portal');
    const end = toCentre.pts[toCentre.pts.length - 1]; assert.ok(Math.hypot(end[0] - R.centre[0], end[1] - R.centre[1]) < 120);
    assert.ok(loop.pts.length >= 24 && Math.hypot(loop.pts[0][0] - loop.pts[loop.pts.length - 1][0], loop.pts[0][1] - loop.pts[loop.pts.length - 1][1]) < 1e-6);
    const [a] = toLocal(R, R.spawn.x, R.spawn.z); assert.ok(a > -ROOM_HALF + 15 && a < -ROOM_HALF + 30, 'just inside the tree ring'); assert.ok(!blocked(R, R.spawn.x, R.spawn.z));
    assert.ok(Math.abs(Math.atan2(R.centre[1] - R.spawn.z, R.centre[0] - R.spawn.x) - R.spawn.th) < 1e-6, 'facing the centre');
  }
});

test('roomLayout_TowerViewLooksAtTheTowerFromTheLawn', () => {
  const v = room.towerView, d = Math.hypot(room.tower.x - v.x, room.tower.z - v.z); assert.ok(d > 120 && d < 180, `${d}`);
  assert.ok(Math.abs(Math.atan2(room.tower.z - v.z, room.tower.x - v.x) - v.th) < 0.02); assert.ok(!blocked(room, v.x, v.z));
});

test('roomLayout_CeilingOnlyInThePortalTunnel', () => {
  const R = rooms[1]; assert.equal(R.ceilingAt(...R.centre), null);
  const [x, z] = toWorld(R, -ROOM_HALF - 40, 0); assert.equal(R.ceilingAt(x, z), ROOM_Y + SPOKE.ceiling);
  assert.deepEqual(eiffelRoom().centre, room.centre);
});
```

  In `room-fly.test.mjs`: import from `../rooms.js`; add

```js
test('flyAllowed_EveryRoomButNotTheRing', () => {
  assert.equal(flyAllowed('room4', 'room'), true); assert.equal(flyAllowed('ring', 'ring'), false); assert.equal(flyAllowed('ring', 'room'), false);
});
test('roomFlyClamp_InARotatedRoom_ClampsInItsOwnFrame', () => {
  const R = roomLayout(3), f = R.frame.f, v = R.frame.v, far = roomFlyClamp(R.centre[0] + f[0] * 9999, ROOM_Y + 50, R.centre[1] + f[1] * 9999, R);
  const a = (far.x - R.centre[0]) * f[0] + (far.z - R.centre[1]) * f[1], b = (far.x - R.centre[0]) * v[0] + (far.z - R.centre[1]) * v[1];
  assert.ok(Math.abs(a - ROOM_FLY.wall) < 1e-6 && Math.abs(b) < 1e-6, `${a}, ${b}`);
});
```

  (import `roomLayout` too). The existing `roomFlyClamp_PushedOutward_StopsInsideTheTreeRing` assumes an
  axis-aligned room: rewrite it to push along `room.frame.f` and `room.frame.v` of `eiffelRoom()` and assert the
  local coordinates equal `±ROOM_FLY.wall`; all other room-fly tests stay.
  In `levels.test.mjs` add:

```js
test('ceilingAt_IsTheCurrentLevels_OrNull', () => {
  const lv = make(); lv.register('ring', { groundAt: () => -600, colliders: {}, ceilingAt: () => -591 });
  assert.equal(lv.ceilingAt(0, 0), null); lv.set('ring'); assert.equal(lv.ceilingAt(0, 0), -591);
});
```

- [ ] **Step 2: Run red** (`rooms`, `room-fly`, `levels`).
- [ ] **Step 3: Implement `rooms.js`** from the old `room-eiffel.js` (keep the LCG, `TREE_ROWS`, `TREE_STEP`, the tree
  loop and the paths). Imports `EIFFEL` from `./hideout.js`, `BELOW_Y, SPOKE, spokeFrame` from `./underground.js`.
  - Frame: `sp = spokeFrame(k)`, `f = sp.u`, `v = sp.v`, `P = sp.end`, `at(a, b) = P + f·a + v·b` (a: metres in from the
    near edge), `centre = at(ROOM_HALF, 0)`; local coordinates relative to the centre: `loc(x, b) = centre + f·x + v·b`.
  - Edge colliders (rotated OBBs: `c: f[0], s: f[1]`, so `hw` runs along `f`, `hd` along `v`; `h = ROOM_Y + 40`):
    far strip `loc(ROOM_HALF − 3, 0)`, `hw 3, hd ROOM_HALF`; side strips `loc(0, ±(ROOM_HALF − 3))`, `hw ROOM_HALF, hd 3`;
    the near strip in two pieces leaving `|b| < GAP` (`GAP = SPOKE.hw + 1`): `loc(−ROOM_HALF + 3, ±(GAP + ROOM_HALF) / 2)`,
    `hw 3, hd (ROOM_HALF − GAP) / 2`.
  - Portal tunnel colliders: side walls at `b = ±(SPOKE.hw + 0.5)` from `a = −(SPOKE.len − SPOKE.roomStart)` to `a = 6`
    (through the gap in the strip), `hd 0.5`; a cap across at `a = −(SPOKE.len − SPOKE.roomStart) − 0.5`.
  - Feet only when `room.object && room.object.feet` (world-axis boxes as today: `c: 1, s: 0`, the tower stays unrotated).
  - Trees: the old loop, placed at `loc(x, z)` instead of `[cx + x, cz + z]`; skip a tree when `x < −(r − 3)` and
    `|z| < GAP + 3` (the portal gap). Same seed `rng(277)` for every room is fine.
  - Paths: `start = at(10, 0)`, `end = centre − f·95`, the 95 m loop round the centre.
  - `spawn = { x, z } = at(20, 0)`, `th = atan2(f[1], f[0])`; `towerView` only with an object: `centre − f·150`, same `th`;
    `tower = object ? { x: cx, z: cz } : null`.
  - `portal = { c: P, th: atan2(f), hw: SPOKE.hw, h: SPOKE.ceiling }`; `ceilingAt(x, z)`: local `a ∈ [−(len − roomStart), 0]`
    and `|b| ≤ SPOKE.hw + 1` → `ROOM_Y + SPOKE.ceiling`, else `null`.
  - `roomFlyClamp(x, y, z, room, cfg)`: project `(x − cx, z − cz)` on `f`/`v`; when both are within `±cfg.wall` return `x`, `z`
    untouched (a round trip through the frame is not bit-exact and `roomFlyClamp_InsideTheBox_Unchanged` uses `deepEqual`),
    otherwise clamp both and map back to world; `y` as today. `ROOM_FLY`, `roomFlyCeiling`, `roomFlyAlt` unchanged.
  - `levels.js`: add `ceilingAt: (x, z) => (current().ceilingAt ? current().ceilingAt(x, z) : null)` and mention it in the
    header comment.
- [ ] **Step 4: Run green**, then all node tests (everything green now, including Task 1's leftovers).
- [ ] **Step 5: Commit** `feat(world): the Eiffel room becomes a template for eight rooms` (`Refs #361`).

---

## Task 5: `index.html` — the lift hall and the drive-through lift

**Files:** `prototype/index.html`. Rebase on `origin/main` first (PR#350 / #346, see Global constraints).

- [ ] **Step 1: Imports** (`:358-361`): drop `linkPts`, `stubPts` if unused after this task; add `liftDoor`,
  `nearLiftDoor`, `liftColliders` from `./hideout.js`; from `./underground.js` import `BELOW_Y, SPOKE, spokeFrame,
  spokeAt, belowLevelAt, ringColliders, ringCeilingAt, ringSpawn, spokeSigns, RING, EXIT` (Task 6 uses the rest).
- [ ] **Step 2: `hideoutBuild`** (`:1111-1187`): keep the T1 walls, the gate, the tunnel darkness, T1's gravel and the
  four lamp posts + two lights (now from `caveLamps().filter(m => m.room === 'hall')`, posts on the hall's diagonals at
  `nodeR − 6`); ring walls for `['hall']` only; delete the corridor-wall loop, the stub loop with „KEIN ZUTRITT", the N1
  gravel, `HIDE.stubs`; `HIDE.rooms = { hall: { c, r } }`. Replace `lobbyBuild(fl)` by `liftBuild('top', fl, CAVE_MODE.group)`
  plus a gravel/concrete disc for the hall.
- [ ] **Step 3: `liftBuild(level, y, group)`** replaces `liftGateMesh`/`placeGate`/`liftPlatformMeshes`/`lobbyBuild`/
  `LIFT_GATE`: the deck (dark steel, yellow edge strips, 8 × 22 m), the shaft house from `liftColliders(level, y)` drawn as
  concrete boxes `LIFT.height` tall (one mesh per collider, the door panel in steel grey with a yellow stripe), a lintel over
  the door opening from `LIFT.door.h` to `LIFT.height`, a roof slab. Register the colliders: on the surface with `pushOBB`
  (they are `secret`), on the ring level into its grid (Task 6). Keep a list `LIFT_DOORS[level] = mesh` with
  `userData.y0 = y`; the panel rises: `mesh.position.y = y0 + LIFT.door.h / 2 + doorAt(level) * (LIFT.door.h + 0.2)`.
- [ ] **Step 4: Door collision.** In `collide()` (`:2505`) and the camera wall test (`:2558`) skip an OBB when
  `o.liftDoor && LIFT_RIDE.doorAt(o.liftDoor) >= 0.9`.
- [ ] **Step 5: `stepLift`** (`:2148`): `const level = LEVELS.isSurface() ? 'top' : LEVELS.id === 'ring' ? 'bottom' : null;`
  no lift step at all in a room (`level === null` → only hide `CAB`). `half` = the vehicle's collision half length
  (`VEH.collision.r` for a circle, the OBB's long half extent otherwise, times `VEH.scale` if the collision is in model
  metres — check `index.html:1791-1798`). Input `{ onPlatform: inCabin(P.x, P.z, half) && |P.y − floor| < 1,
  near: nearLiftDoor(P.x, P.z, level), level, speed, dir: level === 'top' ? 'down' : 'up' }`. Animate both door panels
  from `doorAt`. `CAB`: replace the cylinder with a back-faced box `2·LIFT.hd − 0.2 × 7 × 2·LIFT.hw − 0.2` at `LIFT.c`,
  rotated `-LIFT.th`, at the cabin floor + 3.5, visible only while `LIFT_RIDE.phase === 'descending'` (texture and
  `shaftScrollDelta` as today).
- [ ] **Step 6: `liftSwitch(dir)`**: down → `ringBuild()` (written in Task 6), `LEVELS.set('ring')`, `P.y = BELOW_Y`, `P.safe = ringSpawn()`;
  up → `LEVELS.set('surface')`, `P.y = HIDE.floor`, `P.safe` = in front of door A: `liftDoor('top')` moved 6 m further out
  along its `th`, facing `th` (towards the tunnel). `levelFloorY()` → `HIDE.floor` on the surface, `BELOW_Y` below.
- [ ] **Step 7: Cabin placement on teleports.** `placeOnRoad` (`:2251`): after `LIFT_RIDE.abort()` add
  `LIFT_RIDE.place('top')`. Testhub room jump (`:2930`): `LIFT_RIDE.place('bottom')` (Task 6 rewrites the rest of it).
- [ ] **Step 8: Hooks.** `__mm.hideout()`: `centre: CAVE.nodes.hall.c`, `rooms: HIDE.rooms`, `lift: { c, th, hw, hd,
  doors: { top: liftDoor('top'), bottom: liftDoor('bottom') } }`, drop `stubs`. `__mm.lift()`: add `cabin: LIFT_RIDE.cabin,
  door: LIFT_RIDE.door`. `__mm.hideoutRing()` keeps working (only `hall` now).
- [ ] **Step 9: Verify** (node tests green; `ringBuild` arrives in Task 6, so the ride is not playable yet). **Commit** `feat(world): drive-through freight lift in the lift
  hall` (`Refs #361`). The ride down only works after Task 6.

---

## Task 6: `index.html` — the ring level, the rooms, the dark switch

**Files:** `prototype/index.html`, `prototype/testhub-targets.js` (label only, if needed).

- [ ] **Step 1: State.** Replace `ROOM` (`:2031`) with
  `const ROOM = { layouts: HIDE ? ROOMS.map((r, k) => roomLayout(k)) : null, layout: null, built: null, group: null, cab: null, eiffel: null, model: null, placeholder: null };`
  and `const RING_L = { built: false, group: null };`. `ROOM.layout` = the layout of the room whose meshes are built
  (`null` before), so PR#350's `roomFlyClamp(..., ROOM.layout)` keeps meaning "this room". `keepBelow()` adds
  `RING_L.group`. Testhub context `tower: ROOM.layouts[0].towerView`.
- [ ] **Step 2: `ringBuild()`** (once, on the first ride down or a Testhub room jump): a group at `BELOW_Y` with the
  concrete floor (ring annulus, exit strip, eight spoke strips s 0..70, the cabin deck via `liftBuild('bottom', BELOW_Y,
  group)`), walls drawn from `ringColliders()` (concrete boxes up to their ceiling), a ceiling (ring annulus at `RING.ceiling`,
  strips at `SPOKE.ceiling`/`EXIT.ceiling`) with emissive light strips (`MeshBasicMaterial`, warm white) every ~12 m, the
  spoke linings black between `SPOKE.dark` (vertex-colour fade over 10 m each side, like `tunnelDark`), black end caps at
  `ringEnd`, and the signs from `spokeSigns(ROOMS)` (`textTex(name, …)`, the gate sign's style, untranslated). Register
  `LEVELS.register('ring', { groundAt: () => BELOW_Y, colliders: grid(ringColliders()), ceilingAt: ringCeilingAt })` and,
  for every `k`, `LEVELS.register(ROOMS[k].id, { groundAt: L.groundAt, colliders: grid(L.colliders), ceilingAt: L.ceilingAt })`
  with `L = ROOM.layouts[k]` — data only, no meshes (#308). `renderer.compile` once like `roomBuild` does.
- [ ] **Step 3: `ensureRoom(k)`**: if `ROOM.built === k` return; dispose the old `ROOM.group` (remove it from the scene,
  `traverse` → `geometry.dispose()`, `material.dispose()`; never dispose `ROOM.model`'s geometry or shared textures like
  `TEX.grass`; detach `ROOM.model` first); `ROOM.layout = ROOM.layouts[k]`; build the meshes with the old `roomBuild` body
  turned into `roomMeshes(R)`: lawn (rotated `-atan2(f)` about y, same size), paths, `roomTrees`, `roomClouds`, and
  `roomPortal(group, R)` (a concrete face 30 × 14 m across the near edge with the 10 × 7 m opening, the tunnel s 30..100 as
  walls + ceiling + floor, its black lining in `SPOKE.dark`, the cap at `roomStart`) instead of `roomHouse`; the tower only
  when `R.object` (placeholder + `attachModel()` when `ROOM.model` exists). `__mm.counts.eiffel` is set while room 0 is built.
  `ROOM.built = k`; `group.visible = LEVELS.id === ROOMS[k].id`.
- [ ] **Step 4: Level change** (`LEVELS.onChange`, `:2033`): show `RING_L.group` only on `'ring'`, `ROOM.group` only on its
  own room id; the look: `'surface'` → style, `'ring'` → a new `RING_LOOK` (dark fog `#0b0c0e` ~0.006, hemisphere warm grey
  ~0.9, no sun, no sun sprite, shadows off), a room → `ROOM_LOOK` as today. Generalise `setRoomLook(on)` to
  `setBelowLook(kind)`.
- [ ] **Step 5: The switch.** In the frame loop next to the cave code (`:2527`), when `!LEVELS.isSurface()`:
  `const sp = spokeAt(P.x, P.z); if (LEVELS.id === 'ring' && sp && sp.s > 0) ensureRoom(sp.k);`
  `const next = belowLevelAt(LEVELS.id, P.x, P.z, ROOMS.map(r => r.id)); if (next !== LEVELS.id) { LEVELS.set(next); P.safe = next === 'ring' ? safeOf(ringSpawn()) : safeOf(ROOM.layouts[ROOMS.findIndex(r => r.id === next)].spawn); }`
  No y change, no race flag, no toast.
- [ ] **Step 6: Rules.** `flyZone()` (`:2312`): `LIFT_RIDE.busy ? 'lift' : LEVELS.isSurface() ? (roofed ? 'roofed' : 'open') :
  LEVELS.id === 'ring' ? 'ring' : 'room'`. `heliGround` → `BELOW_Y` below. The room helicopter clamp uses `ROOM.layout`
  (the current room). `underCeiling(x, z, y)`: below, `const lid = LEVELS.ceilingAt(x, z)`. `R` keeps using `P.safe`.
  `foundHideout()` stays on `done` + `down`. Remove `levelFloorY`'s `ROOM_Y` use in favour of `BELOW_Y`.
- [ ] **Step 7: Testhub `hideout.tower`** (`:2930`): `ringBuild(); ensureRoom(0); if (!(ROOM.eiffel && ROOM.eiffel.started)) loadEiffel();`
  `placeOnRoad(…); LEVELS.set('eiffel'); LIFT_RIDE.place('bottom'); P.safe = [s.x, s.z, s.th]; resetCar(); …` (camera as
  today). `loadEiffel` uses `ROOM.layouts[0].tower` for the position and attaches only when `ROOM.built === 0`.
- [ ] **Step 8: Hooks.** `__mm.below = () => ({ level: LEVELS.id, spoke: spokeAt(P.x, P.z), built: ROOM.built, rooms: ROOMS.map(r => r.id), signs: spokeSigns(ROOMS).map(s => s.text), ring: !!RING_L.built })`;
  `__mm.hideout().room` → `ROOM.layouts[0]` (centre, tower, spawn, towerView, half, y, portal). `__mm.spoke = (k, s) =>`
  `{ const f = spokeFrame(k); return { x: f.start[0] + f.u[0] * s, z: f.start[1] + f.u[1] * s, th: f.a }; }` for the tests.
- [ ] **Step 9: Verify** in a browser (local server): ride down, drive out of the exit, along spoke 0 into the Eiffel room,
  back, ride up; console empty. Node tests green. **Commit** `feat(world): tunnel ring with eight star rooms below the
  lift` (`Refs #361`) and **push the branch**.

---

## Task 7: browser tests and the changelog

**Files:** `prototype/tests/test_hideout.py`, `CHANGELOG.md`.

The R0/N1/T2/lobby tests describe the removed route; rewrite them as specified (this is the issue's change,
not a test bent to pass). Helpers to add:

```python
def ride(page, h, level):
    """Stand the car at rest in the cabin; the loop's own frames count the dwell."""
    page.evaluate(LIFT_FAST)
    lx, lz = h["lift"]["c"]; th = h["lift"]["th"] if level == "ring" else h["lift"]["th"] + math.pi
    page.evaluate(f"() => window.__mm.place({lx}, {lz}, {th})")
    page.wait_for_function(RIDE_DONE, arg=level, timeout=240000)

def into_room(page, k, room_id):
    """From the ring level: drive from 45 m into spoke k past the switch."""
    s = page.evaluate(f"() => window.__mm.spoke({k}, 45)")
    page.evaluate(f"() => window.__mm.sim({s['x']}, {s['z']}, {s['th']}, 10, 2, ['KeyW'], -600)")
    page.wait_for_function(f"() => window.__mm.below().level === '{room_id}'", timeout=120000)
```

- [ ] **Step 1: Rewrite** (keep `open_page`, `jump_list`, `LIFT_FAST`, `RIDE_DONE`; delete `t2b_point`, `drive_onto_the_lift`,
  `ride_down`; every R0/N1/T2/lobby point becomes the hall centre or a T1 point):
  - `test_floor_lid_hall_and_lift` (was `…rooms_and_walls`): `rooms` is `{hall}`, `r == 25`, centre within 0.1 m of
    (−712.8, 1528.2), lid ≥ 40 m over the floor, `lamps == 4`, no `stubs`, `wallRoleAt` into the hall hits `stone`,
    `"eiffel" not in counts`, `found is False`.
  - `test_t1_into_the_hall_opens_door_a_and_is_no_find`: drive from the mouth at 16 m/s ~6 s → `lift().door > 0.9`,
    `cabin == 'top'`, not found, no stored key.
  - `test_lift_ride_finds_the_hideout_and_the_room`: `ride(page, h, 'ring')` → find toast and `found` only now,
    `cabin == 'bottom'`, `below().signs == ['La Tour Eiffel']`, `below().built is None`.
  - `test_driving_across_the_platform_without_stopping_does_nothing`: through the cabin at 6 m/s → no ride.
  - `test_room_drive_under_the_tower_and_ride_back_up`: ride → `into_room(page, 0, 'eiffel')`, `built == 0`, under the
    tower; back out through the portal tunnel → `'ring'`; ride up facing −f in the cabin → `'surface'`, door A open.
  - new `test_one_room_built_at_a_time_and_empty_rooms_have_no_object`: room3 → `built == 3`, no `counts.eiffel`;
    back and into room 0 → `built == 0`.
  - new `test_r_in_the_ring_and_in_a_room`: `KeyR` in the ring → at `ringSpawn` (50 m from the lift centre along the
    heading); in a room → within 25 m of `room.portal`, inside the lawn.
  - helicopter tests: reach the room with `ride` + `into_room`; clamp checks in the room's frame; on the ring level
    `KeyF` → `hideoutNoSky`, still on the ground.
  - `test_j_below_…` (from the ring and from a room), `test_sky_ground_…`, `test_hill_is_solid_*`,
    `test_map_shows_the_hill_over_the_hall`, `test_forest_stands_on_the_lid`, `test_ring_wall_stays_under_the_hill`,
    `test_corridor_edges_are_covered_from_above`, `test_cave_mode_*`, `test_camera_*`, `test_eiffel_model_*` (feet against
    `h['room']['tower']`), `test_lift_shaft_pattern_*` (`CAB` box while descending): same intent, new points; drop the
    corridor/stub assertions.
  - **delete** `test_lobby_hidden_from_the_mouth` (the lift is visible from the gate by design).
- [ ] **Step 2: Commit and push**, then run in the foreground:
  `python3 -m pytest prototype/tests/test_hideout.py -x -q` (generous timeout, never in the background). Fix the
  implementation, not the tests; after 3 failed attempts on one test, stop and report.
- [ ] **Step 3: CHANGELOG** under `[Unreleased]` → `### Changed` (date-time in Swiss local time, player voice), e.g.:
  `` `YYYY-MM-DD HH:MM` The **hideout in the Hübel** is rebuilt: the tunnel now leads straight to a big **freight lift** whose doors open as you drive up — even a bus fits. Down below a **tunnel ring** leads to **eight rooms**; the one signed „La Tour Eiffel" is the Eiffel Tower's, the others are still waiting for their landmark. ``
- [ ] **Step 4: Final checks:** `node --test prototype/tests/*.test.mjs` green; `test_hideout.py` green; page console empty;
  rebase on `origin/main`; commit `docs(changelog): hideout star rooms` with `Closes #361`; push; open the PR (template
  sections Summary / Changes / Testing / Checklist).
