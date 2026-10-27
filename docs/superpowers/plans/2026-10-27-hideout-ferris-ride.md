# Ride the Ferris wheel on foot (#516) Implementation Plan

**Goal:** in star room 6 the walker boards the lowest gondola at a gravel pad with <kbd>E</kbd>, rides one full
turn with the camera in the gondola, and gets out at the bottom; R/J/beam/Testhub end the ride cleanly.

**Spec:** `docs/superpowers/specs/2026-10-27-hideout-ferris-ride-design.md` (numbers, state machine, assumptions).

**Line numbers.** This plan was written while PR#514 (the wheel, #513) was unmerged. Every `file:line` for
`prototype/index.html`, `prototype/ferris.js`, `prototype/ferrismesh.js`, `prototype/rooms.js`,
`prototype/tests/ferris.test.mjs` and `prototype/tests/test_hideout.py` is the line in the PR#514 branch
(`origin/feature/513-ferris-wheel`) and valid on `main` after the merge. Other files' lines are those of `main`.
Re-find by the quoted function name if a line is off by a few.

**Architecture:** one new pure module `prototype/ferrisride.js` (gondola pose, boarding check, ride state
machine, wheel-clock offset; `node --test`), `ferris.js` gains the pad numbers, `index.html` gets a small ride
block wired into the existing on-foot mode (no new key: <kbd>E</kbd> is already the on-foot "enter" key).

**Key check (done in the spec, repeat nothing):** `grep -n KeyE prototype/*.js` = `foot.js:81` (on foot: enter),
`enterables.js:73` (prompt key), `train.js:198` (loco only), `index.html` keydown (car blinker, swallowed on
foot); `pause.js` has none. <kbd>E</kbd> is reused, nothing new is bound.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependency, `const`/`let` only, no framework.
- TDD for the pure module: write the failing test, run it red, implement, run green. Never edit a test to make
  it pass.
- Node tests: `node --test prototype/tests/<file>.test.mjs` per task; at the end `node --test prototype/tests/*.test.mjs`.
- Browser test: run **only** `pytest prototype/tests/test_hideout.py -k ferris_ride`, in the **foreground**,
  never `run_in_background`, generous `timeout`. Never the full Playwright suite. Commit and push the branch
  **before** starting it.
- Do not touch `rooms.js`, `ferrismesh.js`, `pause.js`, `foot.js`. Do not change the wheel's resting speed.
- **Task 5 (the CHANGELOG entry) is part of the change and must not be skipped.** Do not finish without it.
- Commit per task, Conventional Commits, scope `hideout`, footer `Refs #516`; the last commit `Closes #516`.
  Branch `feature/516-ferris-ride`.

Files: new `prototype/ferrisride.js`, `prototype/tests/ferrisride.test.mjs`; changed `prototype/ferris.js`,
`prototype/tests/ferris.test.mjs`, `prototype/strings.js`, `prototype/index.html`, `prototype/tests/test_hideout.py`,
`CHANGELOG.md`.

---

### Task 1: the pure ride module (`ferrisride.js`, `ferrisride.test.mjs`)

**Files:** `prototype/tests/ferrisride.test.mjs` (new), `prototype/ferrisride.js` (new).

Write the test first and run it red (`node --test prototype/tests/ferrisride.test.mjs` fails: module not found).

```js
// #516: riding the Ferris wheel on foot -- pure. node --test prototype/tests/ferrisride.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRIS, wheelAngle, gondolaAngles } from '../ferris.js';
import { RIDE, gondolaPose, bottomOffset, lowestGondola, toWheel, fromWheel, boardingTarget, rideIdle, rideBegin, rideStep, rideAngle, rideFeet, rideAction, clockOffset } from '../ferrisride.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);
const TAU = 2 * Math.PI;
const run = (s, secs, leave = false, dt = 1 / 60) => { for (let i = 0; i < Math.round(secs / dt); i++) s = rideStep(s, dt, leave); return s; };

test('gondolaPose_AgreesWithThreeXRotationOfThePivot_TheMeshConvention', () => {
  const t = gondolaAngles(FERRIS);
  for (const A of [0, 0.7, 2.1, 4.4, 6.2]) for (const i of [0, 5, 8, 24, 31]) {
    const y0 = FERRIS.rim * Math.sin(t[i]), z0 = FERRIS.rim * Math.cos(t[i]);          // ferrismesh.js pivot, in the wheel group
    const y = y0 * Math.cos(A) - z0 * Math.sin(A), z = y0 * Math.sin(A) + z0 * Math.cos(A);   // wheel.rotation.x = A (three.js)
    const p = gondolaPose(i, A);
    near(p.y, FERRIS.hub.y + y - FERRIS.gondola.drop, 1e-9, `y i${i} A${A}`); near(p.z, z, 1e-9, `z i${i} A${A}`); assert.equal(p.x, 0);
    near(p.floor, p.y - FERRIS.gondola.h / 2, 1e-12, 'floor');
  }
});

test('lowestGondola_AtAngleZero_IsIndex24WithItsFloorSixMetresOverTheLawn', () => {
  const l = lowestGondola(0); assert.equal(l.index, 24); near(l.offset, 0, 1e-9, 'offset');
  near(gondolaPose(24, 0).floor, FERRIS.hub.y - FERRIS.rim - FERRIS.gondola.drop - FERRIS.gondola.h / 2, 1e-9, 'floor');
  near(gondolaPose(24, 0).floor, 6, 1e-9, '6 m');
});

test('lowestGondola_AnyWheelAngle_IsWithinHalfASpacingOfStraightDown', () => {
  for (let k = 0; k < 400; k++) {
    const A = k / 400 * TAU, l = lowestGondola(A);
    assert.ok(Math.abs(l.offset) <= Math.PI / FERRIS.gondola.n + 1e-9, `A ${A}: ${l.offset}`);
    near(l.offset, bottomOffset(l.index, A), 1e-12, 'same offset');
  }
});

test('toWheelFromWheel_RoundTrip_AndTheAxleIsTheRoomsF', () => {
  const w = { x: 120, z: -40, th: 0.9 };
  const [lx, lz] = toWheel(w, ...fromWheel(w, 3, -7)); near(lx, 3, 1e-9, 'lx'); near(lz, -7, 1e-9, 'lz');
  const [x, z] = fromWheel(w, 1, 0); near(x - w.x, Math.cos(w.th), 1e-9, 'f.x'); near(z - w.z, Math.sin(w.th), 1e-9, 'f.z');
});

test('boardingTarget_WithinReachOfTheLowestGondolasFloorPoint_ElseNull', () => {
  const g = gondolaPose(24, 0);
  assert.deepEqual(boardingTarget(0, { x: 0, z: g.z }), { index: 24, dist: 0 });
  assert.equal(boardingTarget(0, { x: RIDE.reach - 0.1, z: g.z }).index, 24);
  assert.equal(boardingTarget(0, { x: RIDE.reach + 0.5, z: g.z }), null);
  assert.equal(boardingTarget(0, { x: 0, z: 30 }), null);
});

test('rideStep_Boarding_HoldsTheWheelThenRides_LeaveIsIgnored', () => {
  let s = rideBegin(0.3, lowestGondola(0.3).index, { x: 1, z: 2 });
  assert.equal(s.phase, 'boarding'); near(rideAngle(s), 0.3, 1e-12, 'held');
  s = run(s, RIDE.board / 2, true); assert.equal(s.phase, 'boarding'); near(rideAngle(s), 0.3, 1e-12, 'still held');
  s = run(s, RIDE.board, false); assert.equal(s.phase, 'riding');
});

test('rideStep_Riding_TurnsAtRideSpeedAndEndsAfterExactlyOneTurn', () => {
  let s = run(rideBegin(0, 24, { x: 0, z: 0 }), RIDE.board + 0.01);
  s = run(s, 10); near(rideAngle(s), 1.0, 0.02, '10 s at 0.1 rad/s');
  s = run(s, TAU / RIDE.spin - 10 + 0.1); assert.equal(s.phase, 'alighting'); near(s.travelled, TAU, 1e-9, 'one turn, clamped');
  s = run(s, RIDE.alight + 0.05); assert.equal(s.phase, 'idle'); near(s.angle, 0, 1e-9, 'back where it started (mod 2pi)');
});

test('rideStep_LeaveInTheBottomWindow_Alights_LeaveElsewhereIsRefused', () => {
  let s = run(rideBegin(0, 24, { x: 0, z: 0 }), RIDE.board + 0.01);
  assert.equal(rideStep(s, 1 / 60, true).phase, 'alighting');            // just boarded: still at the bottom
  s = run(s, 20);                                                         // 2 rad up: far from the bottom
  assert.equal(rideAction(s, rideAngle(s), { x: 0, z: 0 }, true).do, 'wait');
  assert.equal(rideStep(s, 1 / 60, true).phase, 'riding');
  const s2 = run(s, 12); assert.ok(Math.abs(bottomOffset(24, rideAngle(s2))) > RIDE.window);
});

test('rideStep_DoesNotMutateItsInput', () => {
  const s = rideBegin(0, 24, { x: 0, z: 0 }), copy = JSON.stringify(s);
  rideStep(s, 0.5, true); assert.equal(JSON.stringify(s), copy);
});

test('rideFeet_StartsWhereTheWalkerStood_RidesAtTheGondolaFloor_EndsOnTheGround', () => {
  const g = gondolaPose(24, 0);
  let s = rideBegin(0, 24, { x: 2, z: g.z + 1 });
  assert.deepEqual(rideFeet(s), { x: 2, y: 0, z: g.z + 1 });
  s = run(s, RIDE.board + 0.01); near(rideFeet(s).y, 6, 0.05, 'in the gondola'); near(rideFeet(s).x, 0, 1e-9, 'x');
  let top = 0; for (let i = 0; i < 70 * 60 && s.phase === 'riding'; i++) { s = rideStep(s, 1 / 60, false); top = Math.max(top, rideFeet(s) ? rideFeet(s).y : 0); }
  assert.ok(top >= 105, `peak ${top}`);
  near(rideFeet(s).y, 6, 0.1, 'bottom again, alighting begins'); s = run(s, RIDE.alight / 2); assert.ok(rideFeet(s).y < 6 && rideFeet(s).y > 0, 'gliding down');
  s = run(s, RIDE.alight); assert.equal(s.phase, 'idle'); assert.equal(rideFeet(s), null);
});

test('rideAction_Idle_BoardOnlyOnTheGroundWithinReach_NoneInTheAir', () => {
  const g = gondolaPose(24, 0), here = { x: 0, z: g.z };
  assert.deepEqual(rideAction(rideIdle(), 0, here, true), { do: 'board', index: 24 });
  assert.equal(rideAction(rideIdle(), 0, here, false).do, 'none');
  assert.equal(rideAction(rideIdle(), 0, { x: 40, z: 0 }, true).do, 'none');
  assert.equal(rideAction(rideBegin(0, 24, here), 0, here, true).do, 'none');
});

test('rideAction_RidingInTheBottomWindow_Leave', () => {
  const s = run(rideBegin(0, 24, { x: 0, z: 0 }), RIDE.board + 0.01);
  assert.equal(rideAction(s, rideAngle(s), { x: 0, z: 0 }, false).do, 'leave');
});

test('clockOffset_WheelClockAgreesWithTheAngleAtThatMoment_NoJump', () => {
  for (const [a, now] of [[0, 12.5], [1.234, 900], [6.2, 1e5]]) {
    const off = clockOffset(a, now);
    near(wheelAngle(now + off), a, 1e-6, `at ${now}`);
    near(wheelAngle(now + 3 + off), (a + 3 * FERRIS.spin) % TAU, 1e-6, '3 s later it turns at the resting speed');
  }
});

test('RIDE_Pad_CoversTheExitPointOfTheBottomWindow', () => {
  assert.ok(FERRIS.rim * Math.sin(RIDE.window) <= FERRIS.pad.hd, 'exit z inside the pad');
  assert.ok(RIDE.reach >= FERRIS.rim * Math.sin(Math.PI / FERRIS.gondola.n) + 0.05, 'the lowest gondola is always reachable from straight below');
});
```

The last test needs `FERRIS.pad` from Task 2; it stays red until then (that is intended: run Task 2 straight
after, and run the full file green at the end of Task 2).

Then implement `prototype/ferrisride.js`:

```js
// #516: riding the Ferris wheel on foot -- pure numbers and a small state machine, no three.js, no DOM.
// The wheel frame is ferris.js's: x along the axle (the room's f), z across (v), y over the floor. Gondola i is
// the pivot at (0, rim sin t_i, rim cos t_i) of a group turned about x by `angle` (ferrismesh.js), so it sits
// at the effective angle phi = t_i - angle; the cabin hangs upright `drop` m below the pivot.
import { FERRIS, gondolaAngles } from './ferris.js';
import { WALKER } from './foot.js';

const TAU = 2 * Math.PI;
export const RIDE = { reach: 5, window: 0.15, groundTol: 1.5, board: 1.2, alight: 1.2, spin: 0.1, turn: TAU, eye: 1.2 };
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const smooth = (k) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

export function gondolaPose(i, angle, cfg = FERRIS) {
  const phi = gondolaAngles(cfg)[i] - angle, y = cfg.hub.y + cfg.rim * Math.sin(phi) - cfg.gondola.drop;
  return { phi, x: 0, y, z: cfg.rim * Math.cos(phi), floor: y - cfg.gondola.h / 2 };
}

// signed angle from straight down (phi = -pi/2) to gondola i, in (-pi, pi]
export function bottomOffset(i, angle, cfg = FERRIS) {
  const d = wrap(gondolaPose(i, angle, cfg).phi + Math.PI / 2);
  return d > Math.PI ? d - TAU : d;
}

export function lowestGondola(angle, cfg = FERRIS) {
  let index = 0, best = Infinity;
  for (let i = 0; i < cfg.gondola.n; i++) { const d = Math.abs(bottomOffset(i, angle, cfg)); if (d < best) { best = d; index = i; } }
  return { index, offset: bottomOffset(index, angle, cfg) };
}

// world <-> wheel frame for w = { x, z, th } (ferrisPlacement's `wheel`): world = c + f*lx + v*lz, f = (cos th, sin th), v = (-sin th, cos th)
export function toWheel(w, x, z) {
  const dx = x - w.x, dz = z - w.z, c = Math.cos(w.th), s = Math.sin(w.th);
  return [dx * c + dz * s, -dx * s + dz * c];
}
export function fromWheel(w, lx, lz) {
  const c = Math.cos(w.th), s = Math.sin(w.th);
  return [w.x + lx * c - lz * s, w.z + lx * s + lz * c];
}

// the lowest gondola if the walker (local = { x, z } in the wheel frame) is within RIDE.reach of its floor point
export function boardingTarget(angle, local, cfg = FERRIS) {
  const { index } = lowestGondola(angle, cfg), g = gondolaPose(index, angle, cfg), dist = Math.hypot(local.x - g.x, local.z - g.z);
  return dist <= RIDE.reach ? { index, dist } : null;
}

export const rideIdle = (angle = 0) => ({ phase: 'idle', angle });
export const rideBegin = (angle, index, from) => ({ phase: 'boarding', index, a0: wrap(angle), t: 0, travelled: 0, from: { x: from.x, z: from.z } });

function alight(s, travelled, cfg) {
  const aEnd = wrap(s.a0 + travelled);
  return { ...s, phase: 'alighting', t: 0, travelled, aEnd, to: { x: 0, z: gondolaPose(s.index, aEnd, cfg).z } };
}

// one step; never mutates s. `leave` is honoured only while riding, within RIDE.window of straight down
export function rideStep(s, dt, leave = false, cfg = FERRIS) {
  if (s.phase === 'boarding') { const t = s.t + dt; return t >= RIDE.board ? { ...s, phase: 'riding', t: 0 } : { ...s, t }; }
  if (s.phase === 'riding') {
    const travelled = Math.min(RIDE.turn, s.travelled + RIDE.spin * dt), angle = s.a0 + travelled;
    const out = travelled >= RIDE.turn || (leave && Math.abs(bottomOffset(s.index, angle, cfg)) <= RIDE.window);
    return out ? alight(s, travelled, cfg) : { ...s, travelled };
  }
  if (s.phase === 'alighting') { const t = s.t + dt; return t >= RIDE.alight ? rideIdle(s.aEnd) : { ...s, t }; }
  return s;
}

// the wheel's angle while a ride holds or drives it (an idle state remembers the last one)
export function rideAngle(s) {
  if (s.phase === 'boarding') return s.a0;
  if (s.phase === 'riding') return wrap(s.a0 + s.travelled);
  if (s.phase === 'alighting') return s.aEnd;
  return s.angle ?? 0;
}

// the walker's feet in the wheel frame (y over the floor), or null when idle
export function rideFeet(s, cfg = FERRIS) {
  if (s.phase === 'idle') return null;
  const g = gondolaPose(s.index, rideAngle(s), cfg);
  if (s.phase === 'boarding') { const k = smooth(s.t / RIDE.board); return { x: lerp(s.from.x, 0, k), y: lerp(0, g.floor, k), z: lerp(s.from.z, g.z, k) }; }
  if (s.phase === 'alighting') return { x: 0, y: lerp(g.floor, 0, smooth(s.t / RIDE.alight)), z: g.z };
  return { x: 0, y: g.floor, z: g.z };
}

// what E does now: board / leave / wait (riding outside the window) / none
export function rideAction(s, angle, local, grounded, cfg = FERRIS) {
  if (s.phase === 'riding') return { do: Math.abs(bottomOffset(s.index, rideAngle(s), cfg)) <= RIDE.window ? 'leave' : 'wait' };
  if (s.phase !== 'idle' || !grounded) return { do: 'none' };
  const t = boardingTarget(angle, local, cfg);
  return t ? { do: 'board', index: t.index } : { do: 'none' };
}

// the resting wheel turns by the wall clock + an offset; this offset makes the clock agree with `angle` at nowS
export const clockOffset = (angle, nowS, cfg = FERRIS) => wrap(angle) / cfg.spin - nowS;

// the eye of a walker standing in the gondola: P.y is the feet, the camera adds WALKER.eye
export const eyeShift = RIDE.eye - WALKER.eye;
```

Verify: `node --test prototype/tests/ferrisride.test.mjs` is green except the last test (needs Task 2). Commit
`feat(hideout): pure ride state machine for the Ferris wheel (#516)`.

---

### Task 2: the pad numbers and the strings (`ferris.js`, `ferris.test.mjs`, `strings.js`)

**Files:** `prototype/tests/ferris.test.mjs`, `prototype/ferris.js`, `prototype/strings.js`.

Append to `prototype/tests/ferris.test.mjs` (end of file, after the PR#514 placement tests; it already has `P`, `R6`, `near`) and run it red:

```js
test('ferrisPlacement_BoardingPad_CentredUnderTheHubTurnedToTheRoomFrame', () => {
  assert.deepEqual(P.pad, { x: R6.centre[0], z: R6.centre[1], th: P.wheel.th, hw: FERRIS.pad.hw, hd: FERRIS.pad.hd });
  assert.equal(FERRIS.pad.hw, 5); assert.equal(FERRIS.pad.hd, 8);
});
```

Implement in `prototype/ferris.js`: add to `FERRIS` (line 10-18) the line
`pad: { hw: 5, hd: 8, lift: 0.12 },                        // gravel boarding pad under the rim: 10 m along the axle x 16 m across (#516)`
and in `ferrisPlacement` (line 39-49) return `{ wheel: { x: cx, z: cz, th }, colliders, pad: { x: cx, z: cz, th, hw: cfg.pad.hw, hd: cfg.pad.hd } }`.
Do not add a collider and do not change `rooms.js`.

In `prototype/strings.js` add, next to `enterPrompt` / `enterSoon` (`strings.js:163-164`, `:525-526`), in both languages (real umlauts):

```js
  ridePrompt: 'E · Ride the Ferris wheel',   // en
  rideExit: 'E · Get out',
  rideWait: 'You can get out at the bottom',
  ridePrompt: 'E · Riesenrad fahren',        // de
  rideExit: 'E · Aussteigen',
  rideWait: 'Aussteigen kannst Du unten',
```

Run `node --test prototype/tests/ferris.test.mjs prototype/tests/ferrisride.test.mjs prototype/tests/strings.test.mjs prototype/tests/rooms.test.mjs`
(all green; `roomLayout(6).paths.length` is still 2). Commit `feat(hideout): boarding pad numbers and ride strings (#516)`.

---

### Task 3: wire the ride into the page (`prototype/index.html`)

**Files:** `prototype/index.html` only. Line numbers are the PR#514 branch's. No dry run, no new test file here:
Task 4 covers it.

1. **Import** after `:520` (`import { buildWheel, … } from './ferrismesh.js';`) and extend `:519` is not needed:
   `import { RIDE as RIDE_CFG, toWheel, fromWheel, rideIdle, rideBegin, rideStep, rideAngle, rideFeet, rideAction, lowestGondola, eyeShift, clockOffset } from './ferrisride.js';   // #516`
   (`wheelAngle` is already imported on `:519`.)
2. **State and helpers**, directly after `stepFerris` (`:2887`):

   ```js
   // #516: riding the Ferris wheel on foot. RIDE.s is ferrisride.js's state, RIDE.offset the resting wheel's clock offset
   const RIDE = { s: rideIdle(), offset: 0, leave: false };
   const currentWheelAngle = () => RIDE.s.phase !== 'idle' ? rideAngle(RIDE.s) : wheelAngle(performance.now() / 1000 + RIDE.offset);
   function rideContext() {   // null unless the walker is on foot in the built Ferris room
     const F = ROOM.ferris; if (!FOOT.on || !F || ROOM.built !== F.built || LEVELS.id !== ROOMS[ROOM.built].id) return null;
     const w = ROOM.layout.ferris.wheel, [x, z] = toWheel(w, P.x, P.z);
     return { w, local: { x, z }, grounded: !FOOT.hover && P.y - ROOM.layout.y <= RIDE_CFG.groundTol };
   }
   const rideNow = () => { const c = rideContext(); return c ? rideAction(RIDE.s, currentWheelAngle(), c.local, c.grounded) : { do: 'none' }; };
   function releaseWheel(angle) { RIDE.offset = clockOffset(angle, performance.now() / 1000); RIDE.s = rideIdle(); }   // the resting clock continues from `angle`: no jump
   function endRide() { if (RIDE.s.phase !== 'idle') releaseWheel(rideAngle(RIDE.s)); }   // R, J, the beam and the Testhub all end on foot through endFoot
   function pressRide() {   // E on foot at the pad, or in the gondola; true when the ride took the key
     const a = rideNow();
     if (a.do === 'board') { RIDE.s = rideBegin(currentWheelAngle(), a.index, rideContext().local); P.vx = P.vz = 0; FOOT.vy = 0; return true; }
     if (a.do === 'leave') { RIDE.leave = true; return true; }
     if (a.do === 'wait') { toast(tr('rideWait')); return true; }
     return false;
   }
   function stepRide(dt) {   // replaces stepOnFoot while a ride runs: the walker is carried, only the mouse looks
     const c = rideContext(); if (!c) { endRide(); return; }
     const next = rideStep(RIDE.s, dt, RIDE.leave); RIDE.leave = false;
     if (next.phase === 'idle') { releaseWheel(rideAngle(next)); P.y = ROOM.layout.y; FOOT.vy = 0; return; }   // set down on the pad: on foot again next frame
     RIDE.s = next; const f = rideFeet(next), [x, z] = fromWheel(c.w, f.x, f.z);
     P.x = x; P.z = z; P.y = ROOM.layout.y + f.y + eyeShift; P.vx = P.vz = P.vy = 0; FOOT.vy = 0; followCave();
   }
   ```
3. **`stepFerris`** (`:2887`): replace `wheelAngle(performance.now() / 1000)` by `currentWheelAngle()`.
4. **`roomFerris`** (`:2883`): after the wheel, draw the pad from `R.ferris.pad` with the existing `flatStrip`
   (`:2839`; a 2-point path is a rectangle of half width `hw` along the path): gravel
   `flatStrip([fromWheel(w, 0, -hd), fromWheel(w, 0, hd)], hw, R.y + lift, 0xb9ae96)` and a yellow edge line
   `flatStrip([fromWheel(w, -hw, 0), fromWheel(w, hw, 0)], 0.25, R.y + lift + 0.02, 0xe0b13a)` across the boarding
   point, both `group.add`ed (so `disposeGroup` frees them). `w` is `R.ferris.pad` (it has `x, z, th`).
5. **`pressEnter`** (`:3258`): first line `if (pressRide()) return;`.
6. **`stepEnter`** (`:3259`): after `stepEnterGlow();` add
   `const ra = rideNow(); if (ra.do === 'board' || ra.do === 'leave') { $('prompt').textContent = tr(ra.do === 'board' ? 'ridePrompt' : 'rideExit'); HUD.enterShown = true; return; }`
   (the existing `else if (HUD.enterShown)` branch clears it again when the prompt goes away).
7. **`pressZ`** (`:3268`): first statement `if (RIDE.s.phase !== 'idle') return;`. **`toggleHover`** (`:3342`): same guard.
8. **`endFoot`** (`:3341`): after the `if (!FOOT.on) return;` guard add `endRide();`.
9. **Frame loop** (`:4406-4407`): replace `if (FOOT.on) stepOnFoot(dt);` with
   `if (FOOT.on) { if (RIDE.s.phase !== 'idle') stepRide(dt); else stepOnFoot(dt); }`. Keep `stepFerris()` where it is
   (it runs right after, with the same ride angle).
10. **Debug hooks**, next to `window.__mm.ferris` (`:2968`):

    ```js
    window.__mm.ferrisRide = () => {
      const ang = currentWheelAngle(), low = lowestGondola(ang), w = ROOM.layout && ROOM.layout.ferris && ROOM.layout.ferris.wheel;
      const [x, z] = w ? fromWheel(w, 0, gondolaPose(low.index, ang).z) : [null, null];
      return { phase: RIDE.s.phase, index: RIDE.s.index ?? null, travelled: RIDE.s.travelled ?? 0, action: rideNow().do, wheelAngle: ang, floor: ROOM.layout ? ROOM.layout.y : null, lowest: w && { index: low.index, x, z } };
    };
    window.__mm.rideSim = (secs) => { let maxY = -Infinity; for (let i = 0; i < secs * 60; i++) { if (FOOT.on && RIDE.s.phase !== 'idle') stepRide(1 / 60); stepFerris(); maxY = Math.max(maxY, P.y); } stepCamera(1 / 60); return { ...window.__mm.ferrisRide(), maxY, y: P.y, foot: FOOT.on }; };
    ```
    Add `gondolaPose` to the `ferrisride.js` import of item 1.
11. **Check by reading, not by running a dry run**: `grep -n "RIDE" prototype/index.html` shows no name clash (the
    import alias is `RIDE_CFG`), `node --check` is not applicable to the inline module; keep the lines under
    the file's existing style (long lines are normal there).

Commit `feat(hideout): ride the Ferris wheel on foot (#516)`.

---

### Task 4: the one browser test (`prototype/tests/test_hideout.py`)

**Files:** `prototype/tests/test_hideout.py` (append after the PR#514 Ferris test, which starts at `:1128`).

Run **only** this test, in the foreground, after pushing the branch:
`pytest prototype/tests/test_hideout.py -k ferris_ride` (generous timeout; GPU browser, as for the Ferris room test).

```python
@needs_world
def test_ferris_ride_boards_rides_one_turn_gets_out_and_reset_ends_it(server):
    """On foot at the pad: E boards the lowest gondola, the walker is carried up (> 105 m), E halfway is refused, after one turn the
    walker stands on the pad again; a second ride ends cleanly with R. Uses rideSim (headless renders under 1 fps)."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        into_room(page, 6, "room6")
        page.wait_for_function("() => window.__mm.ferris() && window.__mm.ferris().built === 6", timeout=120000)
        info = page.evaluate("() => window.__mm.ferrisRide()"); low, floor = info["lowest"], info["floor"]
        th = page.evaluate("() => window.__mm.spoke(6, 0).th")
        page.evaluate(f"() => window.__mm.sim({low['x']}, {low['z']}, {th}, 0, 0.2, [], {floor})")    # park the car under the lowest gondola
        page.keyboard.press("z"); page.wait_for_function("() => window.__mm.foot().on", timeout=30000)
        info = page.evaluate("() => window.__mm.ferrisRide()")
        assert info["phase"] == "idle" and info["action"] == "board", info
        page.keyboard.press("e")
        boarded = page.evaluate("() => window.__mm.rideSim(2)")
        assert boarded["phase"] == "riding", boarded
        page.keyboard.press("z"); assert page.evaluate("() => window.__mm.ferrisRide().phase") == "riding"      # Z does not get back in the car
        page.evaluate("() => window.__mm.rideSim(25)")
        page.keyboard.press("e")                                                  # halfway up: refused
        assert page.evaluate("() => window.__mm.ferrisRide().phase") == "riding"
        done = page.evaluate("() => window.__mm.rideSim(45)")                     # the turn takes 63 s in total
        assert done["maxY"] > floor + 105, done
        assert done["phase"] == "idle" and done["foot"] is True and abs(done["y"] - floor) < 0.5, done
        page.keyboard.press("e"); page.evaluate("() => window.__mm.rideSim(3)")   # ride again, then R ends it
        assert page.evaluate("() => window.__mm.ferrisRide().phase") == "riding"
        page.keyboard.press("r")
        after = page.evaluate("() => ({ ...window.__mm.ferrisRide(), foot: window.__mm.foot().on })")
        br.close()
    assert errors == []
    assert after["phase"] == "idle" and after["foot"] is False, after
```

Do not weaken an assertion to pass: if the ride does not start,
fix `index.html`, not the test. Commit and push first, then run. Commit `test(hideout): ride the Ferris wheel (#516)`.

---

### Task 5: CHANGELOG entry, full node run, PR

**Files:** `CHANGELOG.md`. **This task is mandatory.** The entry goes under `## [Unreleased]` → `### Added`
(the first `### Added` in the file, line ~25), newest first, player-facing, English, timestamp in Swiss local time.
Run exactly this from the repo root (inserts one line right below the blank line after `### Added`):

```bash
TS="$(TZ=Europe/Zurich date '+%Y-%m-%d %H:%M')"
python3 - "$TS" <<'PY'
import sys, re
ts = sys.argv[1]
line = f"- `{ts}` You can now **ride the Ferris wheel** in the hideout's star room 6: get out of the car with <kbd>Z</kbd>, walk to the **boarding platform** under the wheel and press <kbd>E</kbd> at the lowest gondola. The wheel carries you **once round** (the view from the top is over 100 m high); at the bottom you get out again, or press <kbd>E</kbd> there to get out early. While you ride the wheel turns faster than usual.\n"
src = open("CHANGELOG.md", encoding="utf-8").read()
m = re.search(r"(## \[Unreleased\].*?### Added\n\n)", src, re.S)
assert m, "no ### Added under [Unreleased]"
open("CHANGELOG.md", "w", encoding="utf-8").write(src[:m.end()] + line + src[m.end():])
PY
git diff --stat CHANGELOG.md && sed -n 25,28p CHANGELOG.md | cut -c1-120
```

Expected: one added line, directly after `### Added` and its blank line, starting with the current timestamp.
Never run `git cliff -o`. Then `node --test prototype/tests/*.test.mjs` (all green). Commit
`docs(hideout): changelog entry for riding the Ferris wheel (#516)` with footer `Closes #516`, push the branch,
open the PR (title `feat(hideout): ride the Ferris wheel on foot (#516)`), and stop: the maintainer merges on
the evening of 2026-11-04.
