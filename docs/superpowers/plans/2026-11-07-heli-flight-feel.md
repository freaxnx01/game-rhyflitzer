# A helicopter that flies like slop-newyork's (#731): implementation plan

**Goal:** the helicopter (`F`) leans into acceleration and turns, answers Space/Shift at once, brakes smoothly, is followed by a close
level chase camera in its own frame, and its rotor is a disc that sounds harder when climbing. Handling model, attitude, camera and
load sound are adapted from [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork) (MIT).

**Spec:** [docs/superpowers/specs/2026-11-07-heli-flight-feel-design.md](../specs/2026-11-07-heli-flight-feel-design.md)

**Global constraints:**
- Buildless, no new dependency. `heli.js` stays pure (no three.js, no DOM). Do not touch the helicopter model's shape.
- **No key binding changes.** `controls.js`, `heliInput`, `touch.js` stay as they are.
- Adapted code carries a comment `// adapted from mrdoob/slop-newyork (MIT) js/<file>` and `CREDITS.md` gets the credit (Task 5).
- Tests: `node --test tests/` plus **only** `tests/test_heli.py` and the two room-helicopter tests in `tests/test_hideout.py`
  (`-k "room_helicopter"`), foreground, generous timeout. Not the whole Playwright suite. No `run_in_background`.
- Commit and push after each task (before starting the Playwright run of that task).
- CHANGELOG under `[Unreleased]`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, written for the player (Task 5).
- Heading convention for the new state: `pitch` positive = nose **down**, `roll` positive = **right** side down (bank into D).

### Task 1: the flight model in heli.js, wired into the game

The state changes shape (`alt` goes, `vy`, `pitch`, `roll`, `assist` come), so the pure model and its callers move in one task.

**Files:** `heli.js`, `tests/heli.test.mjs`, `index.html`, `rooms.js`, `tests/room-fly.test.mjs`, `tests/test_heli.py`, `tests/test_hideout.py`

- [ ] **Write the failing tests** in `tests/heli.test.mjs`. Replace the helpers and the tests that touch `alt`, keep the rest:

```js
const at = (y, th = 0) => ({ x: 0, z: 0, y, th, v: 0, vy: 0, pitch: 0, roll: 0, assist: null });
const MOVING = (v, y = 50) => ({ ...at(y), v });

test('HELI: the agreed flight constants', () => {
  assert.deepEqual(HELI, { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 20, accelNitro: 30, drag: 1.8,
    rest: 0.05, yawRate: 1.2, climb: 16, climbAccel: 22, climbDrag: 3.5, assistStop: 5, pitchMax: 0.24, rollMax: 0.28, tiltRate: 5,
    bobAmp: 0.18, bobRate: 2.6, rotorMargin: 8, landRadius: 150, camDist: 16, camH: 6, camAhead: 8, camUp: 2, camRate: 8.5, camSpeedRate: 3 });
});

test('heliStart: where the car is, standing, with the take-off climb armed', () => {
  assert.deepEqual(heliStart(10, -20, 3, 1.5, 3), { x: 10, z: -20, y: 3, th: 1.5, v: 0, vy: 0, pitch: 0, roll: 0, assist: 3 + HELI.takeoffAgl });
});

test('stepHeli: from take-off it climbs by itself to about takeoffAgl and hovers there', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), IDLE, 12);
  assert.ok(s.y > HELI.takeoffAgl - 10 && s.y < HELI.takeoffAgl + 5, String(s.y));
  assert.equal(s.assist, null); assert.equal(s.x, 0); assert.equal(s.v, 0); assert.ok(Math.abs(s.vy) < 0.05, String(s.vy));
});

test('stepHeli: any Space or Shift press cancels the take-off assist', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), { ...IDLE, lift: -1 }, 0.5);
  assert.equal(s.assist, null);
});

test('stepHeli: W reaches top speed in 2.5 s and never goes beyond', () => {
  close(run(at(50), { ...IDLE, fwd: 1 }, 2.5).v, HELI.top, 1e-9, '2.5 s');
  close(run(at(50), { ...IDLE, fwd: 1 }, 8).v, HELI.top, 1e-9, '8 s');
});

test('stepHeli: letting go of W brakes exponentially: under 4 m/s after 1.5 s, never negative, ends at rest -- slop-newyork feel', () => {
  let s = MOVING(HELI.top), prev = s.v;
  for (let i = 0; i < 90; i++) { s = stepHeli(s, IDLE, 1 / 60, 0, 10); assert.ok(s.v < prev && s.v >= 0); prev = s.v; }
  assert.ok(s.v < 4, String(s.v));
  assert.equal(run(MOVING(HELI.top), IDLE, 6).v, 0);
});

test('stepHeli: S flies slowly backwards', () => {
  close(run(at(50), { ...IDLE, fwd: -1 }, 3).v, -HELI.back, 1e-9, 'v');
});

test('stepHeli: Space accelerates the climb to climb m/s and not beyond; letting go stops it within a second', () => {
  let s = run(at(50), { ...IDLE, lift: 1 }, 2);
  close(s.vy, HELI.climb, 1e-9, 'vy');
  s = run(s, IDLE, 1); assert.ok(Math.abs(s.vy) < 0.5, String(s.vy));
});

test('stepHeli: Shift sinks, but never below the floor, and rests there', () => {
  const s = run(at(100), { ...IDLE, lift: -1 }, 20, 0, 30);
  close(s.y, 30, 1e-9, 'y'); assert.ok(s.vy >= 0);
});

test('stepHeli: the ceiling stops the climb and zeroes vy (maxAgl by default, the room passes its own)', () => {
  close(run(at(50), { ...IDLE, lift: 1 }, 60, 5).y, 5 + HELI.maxAgl, 1e-9, 'maxAgl');
  let s = at(50);
  for (let i = 0; i < 600; i++) s = stepHeli(s, { ...IDLE, lift: 1 }, 1 / 60, 0, 10, HELI, 70);
  assert.equal(s.y, 70); assert.ok(s.vy <= 0);
});

test('stepHeli: a floor above the helicopter lifts it at once (a tall building ahead)', () => {
  const s = stepHeli(at(20), IDLE, 1 / 60, 0, 45);
  assert.equal(s.y, 45);
});

test('stepHeli: pitch is nose down flying forward, nose up backing, bounded by pitchMax, settled within a second', () => {
  const f = run(at(50), { ...IDLE, fwd: 1 }, 4), b = run(at(50), { ...IDLE, fwd: -1 }, 4);
  assert.ok(f.pitch > 0.9 * HELI.pitchMax && f.pitch <= HELI.pitchMax + 1e-9, String(f.pitch));
  assert.ok(b.pitch < 0 && b.pitch >= -HELI.pitchMax, String(b.pitch));
  assert.ok(Math.abs(run(f, IDLE, 5).pitch) < 0.01);
});

test('stepHeli: roll banks into the turn (D positive, A negative), bounded by rollMax, levels out when released', () => {
  const r = run(at(50), { ...IDLE, yaw: 1 }, 1), l = run(at(50), { ...IDLE, yaw: -1 }, 1);
  assert.ok(r.roll > 0.9 * HELI.rollMax && r.roll <= HELI.rollMax + 1e-9, String(r.roll));
  assert.ok(l.roll < 0 && l.roll >= -HELI.rollMax);
  assert.ok(Math.abs(run(r, IDLE, 2).roll) < 0.01);
});

test('stepHeli: it returns a new state and leaves the old one alone', () => {
  const s = at(50); const n = stepHeli(s, { fwd: 1, yaw: 1, lift: 1 }, 1 / 60, 0, 10);
  assert.deepEqual(s, at(50)); assert.notEqual(n, s);
});

test('stepHeli: N raises the top speed to topNitro at accelNitro; letting go falls back to top -- #99', () => {
  let s = run(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 6);
  close(s.v, HELI.topNitro, 1e-9, 'nitro top');
  close(stepHeli(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 1, 0, 10).v, HELI.accelNitro, 1e-9, 'one second of nitro from rest');
  s = run(s, { ...IDLE, fwd: 1 }, 3); close(s.v, HELI.top, 1e-9, 'back to top');
  s = run(s, heliInput({ KeyN: true }, NO_TOUCH), 3); close(s.v, HELI.topNitro, 1e-9, 'N alone');
  close(run(at(50), heliInput({ KeyN: true, KeyS: true }, NO_TOUCH), 3).v, 0, 1e-9, 'S + N hover');
});

test('heliBob: a slow, small swing, only ever drawn', () => {
  assert.equal(heliBob(0), 0);
  close(heliBob(Math.PI / 2 / HELI.bobRate), HELI.bobAmp, 1e-12, 'peak');
  for (let t = 0; t < 20; t += 0.1) assert.ok(Math.abs(heliBob(t)) <= HELI.bobAmp + 1e-12);
});

test('heliLoad: hover 0.45, climbing harder, sinking softer, always within 0..1 -- slop-newyork audio-sources.js', () => {
  const hover = heliLoad(0, 0, IDLE);
  close(hover, 0.45, 1e-12, 'hover');
  assert.ok(heliLoad(0, HELI.climb, { ...IDLE, lift: 1 }) > hover + 0.3);
  assert.ok(heliLoad(0, -HELI.climb, { ...IDLE, lift: -1 }) < hover);
  assert.ok(heliLoad(HELI.topNitro, HELI.climb, { fwd: 1, yaw: 0, lift: 1, nitro: 1 }) <= 1);
});
```

  Also update the import line to `import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot, heliAltitude, heliBob, heliLoad } from '../heli.js';`
  and delete the old tests with the same names that are replaced above ('stepHeli: from take-off…', 'W accelerates…', 'releasing W…',
  'Space raises the target altitude…', 'Shift sinks…', 'a floor above…', 'N raises…', 'the agreed flight constants', 'heliStart…', 'it returns a new state…').
  The `heliFloor`, `heliInput`, `landingSpot`, `heliAltitude`, yaw and rotor-margin tests stay unchanged.
- [ ] `node --test tests/heli.test.mjs`: the new tests fail.
- [ ] **Implement** in `heli.js` (replace the header constants, `heliStart`, `approach`/`stepHeli`; keep `heliInput`, `heliFloor`, `landingSpot`, `heliAltitude`):

```js
// #10: helicopter flight model (F) -- pure, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// Units m, m/s, m/s², rad/s. Same frame as the car: x east, z south, th = heading (0 = +x; D makes it grow, like steering).
// #731: handling, attitude and chase camera adapted from mrdoob/slop-newyork (MIT) js/controllers.js updateHelicopter, js/cameras.js:
// speed brakes exponentially (drag) instead of a linear ramp, the climb is a vertical speed with damping instead of a lagging target
// altitude, and the machine leans (pitch nose down with speed, roll into the turn) -- see docs/superpowers/specs/2026-11-07-heli-flight-feel-design.md
export const HELI = { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 20, accelNitro: 30, drag: 1.8,
  rest: 0.05, yawRate: 1.2, climb: 16, climbAccel: 22, climbDrag: 3.5, assistStop: 5, pitchMax: 0.24, rollMax: 0.28, tiltRate: 5,
  bobAmp: 0.18, bobRate: 2.6, rotorMargin: 8, landRadius: 150, camDist: 16, camH: 6, camAhead: 8, camUp: 2, camRate: 8.5, camSpeedRate: 3 };
// rotorMargin covers the model: nose 3.9 m, tail rotor 7.85 m and blades 6 m from the hub (#99). landRadius: F lands only with a road this close (review of #84)
// rest: below this speed the exponential brake snaps to 0 (a hover stays put). assistStop: take-off assist ends this far below its goal
// (the climb coasts climb / climbDrag = 4.6 m after the last push)
```

```js
export function heliStart(x, z, y, th, ground, cfg = HELI) {
  return { x, z, y, th, v: 0, vy: 0, pitch: 0, roll: 0, assist: ground + cfg.takeoffAgl };
}

const approach = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const settle = (value, target, rate, dt) => value + (target - value) * Math.min(1, rate * dt);

function stepSpeed(v, input, dt, cfg) {
  if (input.fwd === 0) { const braked = v * Math.max(0, 1 - cfg.drag * dt); return Math.abs(braked) < cfg.rest ? 0 : braked; }
  const target = input.fwd > 0 ? (input.nitro ? cfg.topNitro : cfg.top) : -cfg.back;
  return approach(v, target, (input.nitro ? cfg.accelNitro : cfg.accel) * dt);
}

// the take-off climb: F arms `assist` (goal height); until the player touches Space/Shift or the goal is near, the step climbs as if Space were held
function stepLift(s, input, cfg) {
  const assisting = input.lift === 0 && s.assist != null && s.y < s.assist - cfg.assistStop;
  return { lift: assisting ? 1 : input.lift, assist: assisting ? s.assist : null };
}

// one fixed step. ceiling defaults to ground + maxAgl; the Eiffel room passes its own
export function stepHeli(s, input, dt, ground, floor, cfg = HELI, ceiling = ground + cfg.maxAgl) {
  const th = s.th + input.yaw * cfg.yawRate * dt;
  const v = stepSpeed(s.v, input, dt, cfg);
  const { lift, assist } = stepLift(s, input, cfg);
  let vy = lift !== 0 ? clamp(s.vy + lift * cfg.climbAccel * dt, -cfg.climb, cfg.climb) : s.vy * Math.max(0, 1 - cfg.climbDrag * dt);
  let y = s.y + vy * dt;
  if (y > ceiling) { y = ceiling; vy = Math.min(vy, 0); }
  if (y < floor) { y = floor; vy = Math.max(vy, 0); }
  const pitch = settle(s.pitch, clamp(v / cfg.top, -1, 1) * cfg.pitchMax, cfg.tiltRate, dt);
  const roll = settle(s.roll, input.yaw * cfg.rollMax, cfg.tiltRate, dt);
  return { x: s.x + Math.cos(th) * v * dt, z: s.z + Math.sin(th) * v * dt, y, th, v, vy, pitch, roll, assist };
}

// drawn only, never physics: a slow swing so the machine is never dead still (slop-newyork: sin(t * 2.6) * 0.18)
export const heliBob = (t, cfg = HELI) => Math.sin(t * cfg.bobRate) * cfg.bobAmp;

// engine load 0..1 for the rotor sound, ported from slop-newyork js/audio-sources.js helicopterLoad: hover 0.45, collective up harder, down softer
export function heliLoad(v, vy, input, cfg = HELI) {
  const unit = (x) => clamp(x, 0, 1);
  return unit(0.45 + 0.28 * Math.max(input.lift, 0) - 0.16 * Math.max(-input.lift, 0)
    + 0.15 * unit(vy / cfg.climb) - 0.08 * unit(-vy / cfg.climb) + 0.1 * Math.abs(input.fwd) + 0.12 * unit(Math.abs(v) / cfg.top));
}
```

  Delete the old `approach`-based body, `follow`, `climb: 15`, `back`-only constants (replaced above).
- [ ] `node --test tests/heli.test.mjs`: passes.
- [ ] **Rooms** (`rooms.js`, `tests/room-fly.test.mjs`): `roomFlyAlt` is dead (no target altitude): delete `rooms.js:192` and its test
  `roomFlyAlt_TargetBelowTheCeiling_…`. Replace the second test with the ceiling passed to the step:

```js
test('roomHeli_HoldingSpace_ReachesTheTowerTopWithin22sAndStaysUnderTheCeiling', () => {
  let s = { x: cx, z: cz, y: ROOM_Y, th: 0, v: 0, vy: 0, pitch: 0, roll: 0, assist: null };
  const floor = heliFloor(ROOM_Y, [], cx, cz);
  let t = 0, reached = null;
  for (; t < 40 * 60; t++) {
    s = stepHeli(s, { fwd: 0, yaw: 0, lift: 1, nitro: 0 }, 1 / 60, ROOM_Y, floor, HELI, roomFlyCeiling());
    if (reached === null && s.y > ROOM_Y + 330) reached = t / 60;
  }
  assert.ok(reached !== null && reached <= 22, `tower top reached after ${reached} s`);   // climb is 16 m/s and there is no 120 m head start now
  assert.ok(s.y > ROOM_Y + 395 && s.y <= ROOM_Y + 420 + 1e-9, `settles at the room ceiling, y=${s.y - ROOM_Y}`);
});
```

  Fix that file's imports (`roomFlyAlt` out, `HELI` in from `../heli.js`; `heliStart` only if still used).
- [ ] **Wire `index.html`.** Exact edits (each `old` occurs once; check with `grep -c`):
  - line 711 import: `roomFlyClamp, roomFlyAlt, ROOMS,` becomes `roomFlyClamp, roomFlyCeiling, ROOMS,`
  - line 742 import: `import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot } from './heli.js';` becomes `... stepHeli, landingSpot, heliBob, heliLoad } from './heli.js';`
  - line 2997: `const FLY = { on: false, v: 0, alt: 0 };` becomes
    `const FLY = { on: false, v: 0, vy: 0, pitch: 0, roll: 0, assist: null, t: 0, load: 0 };`
  - `takeOff()` (line 4033): `FLY.v = s.v; FLY.alt = s.alt;` becomes `FLY.v = s.v; FLY.vy = s.vy; FLY.pitch = s.pitch; FLY.roll = s.roll; FLY.assist = s.assist;`
  - `stepFly` (lines 4418-4419), replace both lines with:

```js
function stepFly(dt) { LIGHTS.braking = false; const ground = heliGround(P.x, P.z), floor = heliFloor(ground, gridQuery(OBB_GRID, P.x, P.z, HELI.rotorMargin + 2), P.x, P.z), room = LEVELS.isSurface() ? null : currentRoom(), input = heliInput(keys, touch);
  const s = stepHeli({ x: P.x, z: P.z, y: P.y, th: P.th, v: FLY.v, vy: FLY.vy, pitch: FLY.pitch, roll: FLY.roll, assist: FLY.assist }, input, dt, ground, floor, HELI, room ? roomFlyCeiling(room.fly, room.y) : ground + HELI.maxAgl);
  P.x = s.x; P.z = s.z; P.y = s.y; P.th = s.th; P.vx = Math.cos(s.th) * s.v; P.vz = Math.sin(s.th) * s.v; FLY.v = s.v; FLY.vy = s.vy; FLY.pitch = s.pitch; FLY.roll = s.roll; FLY.assist = s.assist; FLY.t += dt; FLY.load = heliLoad(s.v, s.vy, input);
  if (room) { const c = roomFlyClamp(P.x, P.y, P.z, room); P.x = c.x; P.z = c.z; P.y = c.y; }
  heli.position.set(P.x, P.y, P.z); heli.rotation.set(0, -P.th, 0); rotor.rotation.y += dt * 30; flames.visible = false; }
```

    (the `heli.position` / `rotation` / rotor line is unchanged here; Task 2 changes it.)
  - `window.__mm.fly` (line 4496): `alt: FLY.alt,` becomes `vy: FLY.vy, pitch: FLY.pitch, roll: FLY.roll,`
- [ ] **Update the Playwright assertions** that read `alt`:
  - `tests/test_heli.py::test_f_takes_off_climbs_and_shows_the_helicopter`: delete the `alt` line; `abs(s["y"] - s["ground"] - 120) < 1` becomes `< 6`.
  - `::test_flight_controls`: the `up["alt"]` line becomes `assert 20 < up["y"] - before_up["y"] < 34, (before_up, up)` (2 s of Space: ~26 m).
  - `tests/test_hideout.py::test_room_helicopter_climbs_past_the_tower_top_and_sinks_back`: `mid["y"] > -600 + 120 + 100` becomes `mid["y"] > -600 + 120`
    (10 s of Space at 16 m/s, no 120 m head start); the docstring's "(it crawled …)" stays true; the other assertions stay.
- [ ] `grep -rn "FLY.alt\|roomFlyAlt\|\.alt\b" *.js tests/*.mjs tests/*.py` finds no leftover use of the removed state (an `img.alt` is fine).
- [ ] Run `node --test tests/`: all green. Then, foreground: `python -m pytest tests/test_heli.py tests/test_hideout.py -k "heli or helicopter" -x -q`.
- [ ] Commit `feat(heli): exponential braking, a climb with vertical speed and a take-off assist (#731)`, push.

### Task 2: lean into it: pitch, roll, bob and a rotor disc

The model is already in `FLY` after Task 1; this task only draws it.

**Files:** `index.html`, `tests/test_heli.py`

- [ ] **Write the failing Playwright test** (append to `tests/test_heli.py`):

```python
def test_the_helicopter_leans_into_speed_and_turns(server):
    """#731: pitch (nose down) with speed, roll into the turn; the drawn model follows the state."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        level = fly(page)
        fwd = fly_sim(page, 3, ["KeyW"])
        turn = fly_sim(page, 1, ["KeyW", "KeyD"])
        b.close()
    assert abs(level["pitch"]) < 0.01 and abs(level["roll"]) < 0.01, level
    assert fwd["pitch"] > 0.1, fwd
    assert turn["roll"] > 0.1, turn
```

- [ ] Run it (`-k leans`): fails, `pitch` is in `__mm.fly()` from Task 1 so it fails on the values only if the drawing is wrong; it
  already passes on the state. Add the model assertion by extending `__mm.fly` in the next step, then re-run (red on `drawn`).
  Extend the test: `turn["drawnRoll"] > 0.1 and fwd["drawnPitch"] > 0.1` and run again: red.
- [ ] **Implement** in `index.html`:
  - once, where the helicopter group is created (line 2998), after `heli.visible = false;`: `heli.rotation.order = 'YZX';   // yaw outermost, then pitch, then roll about the model's own axes (nose +x, right +z)`
  - the rotor disc, as a new line right after the model block (line 2999), outside the block so it casts no shadow:

```js
// #731: the rotor reads as a disc, not as strobing bars (adapted from mrdoob/slop-newyork (MIT) js/controllers.js: translucent disc, opacity 0.13, depthWrite off)
{ const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })); rotor.add(disc); }
```

  - in `stepFly`, the last line becomes (attitude from slop-newyork `tiltPivot.rotation.x/z` and `position.y`, rotor 24 rad/s as theirs):

```js
  heli.position.set(P.x, P.y + heliBob(FLY.t), P.z); heli.rotation.set(s.roll, -P.th, -s.pitch); rotor.rotation.y += dt * 24; flames.visible = false; }
```

  - `__mm.fly` gets `drawnPitch: -heli.rotation.z, drawnRoll: heli.rotation.x,` (read-only, for the test).
- [ ] Run the test: passes; `python -m pytest tests/test_heli.py -x -q` (foreground).
- [ ] Commit `feat(heli): lean into speed and turns, hover bob and a rotor disc (#731)`, push.

### Task 3: the chase camera in the helicopter's frame

**Files:** `heli.js`, `tests/heli.test.mjs`, `index.html`, `tests/test_heli.py`

- [ ] **Write the failing tests** (append to `tests/heli.test.mjs`, add `heliChaseFrom, heliChaseStep` to the import):

```js
const P0 = { x: 0, y: 100, z: 0 };

test('heliChaseStep: at rest the camera settles camDist behind and camH above, looking camAhead ahead', () => {
  let c = heliChaseFrom({ x: -300, y: 40, z: 90 }, P0, 0);
  for (let i = 0; i < 600; i++) c = heliChaseStep(c, P0, 0, 0, 1 / 60);
  close(c.pos.x, -HELI.camDist, 1e-3, 'x'); close(c.pos.y, P0.y + HELI.camH, 1e-3, 'y'); close(c.pos.z, 0, 1e-3, 'z');
  close(c.look.x, HELI.camAhead, 1e-3, 'look x'); close(c.look.y, P0.y + HELI.camUp, 1e-3, 'look y');
});

test('heliChaseStep: flying straight at constant speed the camera keeps a constant distance (no trailing growth)', () => {
  let c = heliChaseFrom({ x: -20, y: 106, z: 0 }, P0, 0), p = { ...P0 }, last = 0;
  for (let i = 0; i < 60 * 12; i++) { p = { ...p, x: p.x + HELI.top / 60 }; c = heliChaseStep(c, p, 0, HELI.top, 1 / 60); if (i === 60 * 10) last = p.x - c.pos.x; }
  close(p.x - c.pos.x, last, 0.05, 'distance still constant after 10 s');
  assert.ok(last > HELI.camDist && last < HELI.camDist * 2, String(last));   // pulled back with speed, not by lag
});

test('heliChaseStep: the offset swings round behind a turning helicopter', () => {
  let c = heliChaseFrom({ x: -HELI.camDist, y: 106, z: 0 }, P0, 0);
  for (let i = 0; i < 300; i++) c = heliChaseStep(c, P0, Math.PI / 2, 0, 1 / 60);
  close(c.pos.x, 0, 1e-3, 'x'); close(c.pos.z, -HELI.camDist, 1e-3, 'z');
});
```

- [ ] `node --test tests/heli.test.mjs`: fail (functions missing).
- [ ] **Implement** in `heli.js`:

```js
// #731 chase camera, adapted from mrdoob/slop-newyork (MIT) js/cameras.js: the offset behind the helicopter is eased in the helicopter's
// own frame (not in world space, which trails a fast target by about speed / rate and swings on turns); only the height base is eased in
// world space; the distance grows with a smoothed speed. State c = { ox, oy, oz (camera offset), lx, ly, lz (look offset), base, speed }.
const chaseGoal = (th, speed, cfg) => {
  const dist = cfg.camDist * (1 + Math.min(0.25, speed * 0.01)) + speed * 0.1, fx = Math.cos(th), fz = Math.sin(th);
  return { ox: -fx * dist, oy: cfg.camH, oz: -fz * dist, lx: fx * cfg.camAhead, ly: cfg.camUp, lz: fz * cfg.camAhead };
};

// start from where the camera really is (car camera, or the camera of the last flight), so the take-off glides instead of cutting
export function heliChaseFrom(cam, p, th, cfg = HELI) {
  const g = chaseGoal(th, 0, cfg);
  return { ox: cam.x - p.x, oy: cam.y - p.y, oz: cam.z - p.z, lx: g.lx, ly: g.ly, lz: g.lz, base: p.y, speed: 0 };
}

export function heliChaseStep(c, p, th, v, dt, cfg = HELI) {
  const speed = c.speed + (Math.abs(v) - c.speed) * (1 - Math.exp(-cfg.camSpeedRate * dt));
  const k = 1 - Math.exp(-cfg.camRate * dt), g = chaseGoal(th, speed, cfg), ease = (a, b) => a + (b - a) * k;
  const base = ease(c.base, p.y), n = { ox: ease(c.ox, g.ox), oy: ease(c.oy, g.oy), oz: ease(c.oz, g.oz), lx: ease(c.lx, g.lx), ly: ease(c.ly, g.ly), lz: ease(c.lz, g.lz), base, speed };
  return { ...n, pos: { x: p.x + n.ox, y: base + n.oy, z: p.z + n.oz }, look: { x: p.x + n.lx, y: base + n.ly, z: p.z + n.lz } };
}
```

  Note `oy` is relative to `base` (the eased height), `heliChaseFrom` therefore seeds `oy` from `cam.y - p.y`, which equals `cam.y - base` at start.
- [ ] `node --test tests/heli.test.mjs`: passes.
- [ ] **Wire `index.html`.** `const FLY = {…}` gets `cam: null`; `takeOff()` sets `FLY.cam = null`. Replace `flyCamera` (line 4766):

```js
function flyCamera(dt) { if (!FLY.cam) FLY.cam = heliChaseFrom(camPos, P, P.th); const c = FLY.cam = heliChaseStep(FLY.cam, P, P.th, FLY.v, dt);
  camPos.set(c.pos.x, Math.max(c.pos.y, groundH(c.pos.x, c.pos.z, 1e4) + 5), c.pos.z); camera.position.copy(camPos); camera.lookAt(c.look.x, c.look.y, c.look.z); }
```

  and add `heliChaseFrom, heliChaseStep` to the `./heli.js` import. The `groundH + 5` floor of the old code stays (applied to the camera, not fed back
  into the eased state). Update the comment above it: `// #10 / #731: one heli chase cam, close and level behind the helicopter, eased in its frame (slop-newyork); C does nothing while flying`.
- [ ] **Playwright** (append to `tests/test_heli.py`; add `camera: {x,y,z}` to `__mm.fly` as `cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z }`):

```python
def test_the_chase_camera_sits_close_behind_and_does_not_trail(server):
    """#731: after settling the camera is within ~3x the machine length behind, at a steady distance in fast flight."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        fly_sim(page, 4, ["KeyW"])
        a = page.evaluate("() => { const f = window.__mm.fly(); return Math.hypot(f.x - f.cam.x, f.z - f.cam.z); }")
        fly_sim(page, 2, ["KeyW"])
        c = page.evaluate("() => { const f = window.__mm.fly(); return Math.hypot(f.x - f.cam.x, f.z - f.cam.z); }")
        b.close()
    assert 10 < a < 40 and abs(a - c) < 1.5, (a, c)
```

  Note: `flySim` steps physics only, the camera moves in the render loop, so wait for real frames: before reading `cam` call
  `page.wait_for_timeout(1500)` after each `fly_sim` (a loaded headless run draws under 1 fps: if the number is unstable, wait for
  `page.wait_for_function` on `camera` distance < 40 with `timeout=120000`). Run: fails first (old camera is 35 m + trailing), passes after.
- [ ] Run `node --test tests/` and `python -m pytest tests/test_heli.py -x -q` (foreground).
- [ ] Commit `feat(heli): a close chase camera eased in the helicopter's frame (#731)`, push.

### Task 4: the rotor sound follows the load

**Files:** `sound.js`, `tests/sound.test.mjs`, `index.html`

- [ ] **Write the failing test** (append to `tests/sound.test.mjs`; the existing `rotorMix` test stays as the "unchanged without load" proof):

```js
test('rotorMix: climbing (load above hover) beats faster and louder, sinking slower and softer; no load is the old mix -- #731', () => {
  const hover = rotorMix(IN({ kmh: 0, fly: true })), up = rotorMix(IN({ kmh: 0, fly: true, load: 0.85 })), down = rotorMix(IN({ kmh: 0, fly: true, load: 0.3 }));
  assert.equal(rotorMix(IN({ kmh: 0, fly: true, load: ROTOR.hoverLoad })).gain, hover.gain);
  assert.ok(up.rate > hover.rate && up.gain > hover.gain);
  assert.ok(down.rate < hover.rate && down.gain < hover.gain);
  assert.equal(rotorMix(IN({ kmh: 0, load: 0.9 })).gain, 0);   // not flying: silent whatever the load
});
```

- [ ] `node --test tests/sound.test.mjs`: fails.
- [ ] **Implement** in `sound.js`: `export const ROTOR = { rate: 5.5, ratePerKmh: 0.012, gain: 1.2, cutoff: 260, hoverLoad: 0.45, ratePerLoad: 1.5, gainPerLoad: 0.5 };`
  (keep the existing comment, add `// #731: the thump follows the engine load (slop-newyork js/audio-sources.js): 0.45 = hover`) and

```js
export function rotorMix(input) {
  if (!input.fly) return { rate: ROTOR.rate, gain: 0, cutoff: ROTOR.cutoff };
  const dl = (input.load ?? ROTOR.hoverLoad) - ROTOR.hoverLoad;
  return { rate: ROTOR.rate + ROTOR.ratePerKmh * input.kmh + ROTOR.ratePerLoad * dl, gain: ROTOR.gain * (1 + ROTOR.gainPerLoad * dl), cutoff: ROTOR.cutoff };
}
```

  In `index.html` line 5614 the sound input `fly: FLY.on,` becomes `fly: FLY.on, load: FLY.load,`. If `checkSound` or another test asserts the
  `ROTOR` object whole, extend it with the three new keys.
- [ ] `node --test tests/`: all green. No Playwright needed (pure + one input field; `tests/test_heli.py::test_car_engine_and_tyres_are_silent_in_flight` runs in Task 5).
- [ ] Commit `feat(heli): the rotor thump follows the engine load (#731)`, push.

### Task 5: credit, changelog, final check

**Files:** `CREDITS.md`, `CHANGELOG.md`

- [ ] `CREDITS.md` is a flat bullet list, one source per line with licence and attribution duty. Append:

```markdown
- Helicopter handling, banking, chase camera and rotor-load sound adapted from slop-newyork (https://github.com/mrdoob/slop-newyork) © 2026 Mr.doob, MIT licence (https://github.com/mrdoob/slop-newyork/blob/main/LICENSE): code only, no assets; adapted code is marked in heli.js, sound.js and index.html
```

  The MIT licence asks that its notice travels with substantial portions: also append the licence text once, below the list under
  `## slop-newyork (MIT)`: the three-paragraph MIT text from the `LICENSE` of that repo, first line `Copyright (c) 2026 Mr.doob`
  (fetch with `gh api repos/mrdoob/slop-newyork/contents/LICENSE -H 'Accept: application/vnd.github.raw'`, copy verbatim).
- [ ] `CHANGELOG.md`: under `## [Unreleased]` add a `### Changed` entry (create the heading if the section has none), newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` The **helicopter** flies much more like a real one: it **leans** forward when it speeds up and **banks** into turns, **climbs and sinks** the moment you press <kbd>Space</kbd> or <kbd>Shift</kbd>, **brakes smoothly** when you let go, and the camera now follows **closer and steadier** behind it. The rotor shows as a **disc** and sounds harder while climbing. Flight model after the helicopter in slop-newyork (MIT).
```

- [ ] Final verification, foreground, generous timeout: `node --test tests/`, then `python -m pytest tests/test_heli.py -q` and
  `python -m pytest tests/test_hideout.py -k "room_helicopter" -q`. All green, empty console.
- [ ] Commit `docs(heli): credit slop-newyork and add the changelog entry (#731)`, push.
- [ ] **Manual handover** (do not claim "feels as good" yourself, the maintainer decides): list the tunables for him in the PR text:
  `HELI.accel/accelNitro/drag` (speed), `climb/climbAccel/climbDrag` (collective), `pitchMax/rollMax/tiltRate` (lean), `camDist/camH/camAhead/camUp/camRate`
  (camera). All are plain numbers in `heli.js`, retuning is a one-line change plus the constants test.
