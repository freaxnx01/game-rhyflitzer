# Steering Wheels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The car's front wheels yaw visibly with the steering input, and all four wheels roll with the distance driven.

**Architecture:** A pure helper module `prototype/steering.js` computes the target angle, the smoothing and the spin. `stepCar` in `prototype/index.html` advances a small state `WHEEL_STATE = { yaw, spin }`. A separate `drawWheels()` in the loop reads that state and writes the wheel groups (render reads state, never mutates it). `buildCompact` builds each wheel as `steer group > roll group > meshes` and records them in `g.userData.wheels`. A read-only `window.__mm.wheelYaw()` reports the group rotations for a Playwright test.

**Tech Stack:** Vanilla JS ES modules, three.js, `node --test`, pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-08-steering-wheels-design.md` (issue #132).

## Global Constraints

- Angle: `target = steer * maxYaw / (1 + speed / 30)`, `maxYaw = π/6`; smoothing `yaw += (target - yaw) * (1 - exp(-10 * dt))`. `yaw > 0` = steer right (D), drawn as `steerGroup.rotation.y = -yaw`.
- Spin: `spin += vf * dt / wheelR`, wrapped to 2π, drawn as `rollGroup.rotation.z = -spin`.
- Front wheels = those whose model x equals the largest x in `VEH.wheels`.
- State is written only in `stepWheels` (from `stepCar`); `drawWheels` only reads it. No wheel motion while paused or in helicopter mode.
- Buildless static game: no new packages, no framework (CLAUDE.md). `steering.js` has no three.js and no DOM.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest …`. Commit and push before long verification.

## Review Focus

1. **Sign of the yaw.** Expected: D turns the front wheels toward the right of the car, matching the way `P.th` grows. Pinned in Task 2 (the Playwright test checks both directions).
2. **Rebuilding the car** (`setVehicle`). Expected: the new wheel groups are found by `drawWheels` and still steer. Pinned in Task 2 (the test calls `use_vehicle` and checks again).
3. **Paused game and helicopter.** Expected: no wheel motion. Pinned in Task 2 (pause check); the helicopter path never calls `stepWheels`.
4. **`__mm.carSize`** widens while the wheels are turned. Expected: the existing test reads at rest (yaw 0) and still passes; run in Task 2 Step 6.

---

### Task 1: Pure steering helper

**Files:**
- Create: `prototype/steering.js`
- Test: `prototype/tests/steering.test.mjs`

**Interfaces:**
- Produces: `WHEEL = { maxYaw: Math.PI / 6, speedFade: 30, rate: 10 }`; `wheelTargetYaw(steer, speed): number`; `stepWheelYaw(yaw, steer, speed, dt): number`; `stepWheelSpin(spin, vf, wheelR, dt): number`; `frontAxleX(wheels): number` (largest x of `[x, z]` pairs, `-Infinity` for an empty list).

- [ ] **Step 1: Write the failing test.** Create `prototype/tests/steering.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL, wheelTargetYaw, stepWheelYaw, stepWheelSpin, frontAxleX } from '../steering.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('WHEEL: the agreed constants', () => {
  assert.deepEqual(WHEEL, { maxYaw: Math.PI / 6, speedFade: 30, rate: 10 });
});

test('wheelTargetYaw: full lock standing, right is positive, left negative, none is zero', () => {
  close(wheelTargetYaw(1, 0), Math.PI / 6, 1e-9);
  close(wheelTargetYaw(-1, 0), -Math.PI / 6, 1e-9);
  assert.equal(wheelTargetYaw(0, 10), 0);
});

test('wheelTargetYaw: less lock at speed (half at 30 m/s), like the physics steering fade', () => {
  close(wheelTargetYaw(1, 30), Math.PI / 12, 1e-9);
  assert.ok(wheelTargetYaw(1, 60) < wheelTargetYaw(1, 30));
});

test('wheelTargetYaw: steer is clamped to -1..1 (the autopilot can be fractional, never beyond)', () => {
  close(wheelTargetYaw(2, 0), Math.PI / 6, 1e-9);
  close(wheelTargetYaw(0.5, 0), Math.PI / 12, 1e-9);
});

test('stepWheelYaw: moves toward the target without overshooting, and settles', () => {
  let y = 0, prev = 0;
  for (let i = 0; i < 6; i++) { y = stepWheelYaw(y, 1, 0, 1 / 60); assert.ok(y > prev && y < Math.PI / 6); prev = y; }
  for (let i = 0; i < 120; i++) y = stepWheelYaw(y, 1, 0, 1 / 60);
  close(y, Math.PI / 6, 1e-3);
  for (let i = 0; i < 120; i++) y = stepWheelYaw(y, 0, 0, 1 / 60);
  close(y, 0, 1e-3);
});

test('stepWheelYaw: the same real time gives the same angle at 30 and 60 fps', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 6; i++) a = stepWheelYaw(a, 1, 0, 1 / 30);
  for (let i = 0; i < 12; i++) b = stepWheelYaw(b, 1, 0, 1 / 60);
  close(a, b, 1e-9);
});

test('stepWheelSpin: forward rolls v*dt/r, reverse runs backwards (wrapped), the angle stays in 0..2*pi', () => {
  close(stepWheelSpin(0, 10, 0.34, 0.1), 1 / 0.34, 1e-9);
  close(stepWheelSpin(1, -10, 0.34, 0.1), 1 - 1 / 0.34 + 2 * Math.PI, 1e-9);
  close(stepWheelSpin(2 * Math.PI - 0.1, 1, 1, 0.5), 0.4, 1e-9);
});

test('frontAxleX: the largest x', () => {
  assert.equal(frontAxleX([[1.38, 0.86], [-1.38, 0.86]]), 1.38);
  assert.equal(frontAxleX([[-2, 1], [0.5, 1], [3, 1]]), 3);
  assert.equal(frontAxleX([]), -Infinity);
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `node --test prototype/tests/steering.test.mjs`
Expected: FAIL, `Cannot find module '../steering.js'`.

- [ ] **Step 3: Implement.** Create `prototype/steering.js`:

```js
// #132: wheel steering and roll -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Units rad, m, m/s, s. yaw > 0 steers right (D), the same sign as the car's heading P.th.
export const WHEEL = { maxYaw: Math.PI / 6, speedFade: 30, rate: 10 };

const TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// the lock shrinks with speed like the physics' steering authority (1 / (1 + speed / 30) in stepCar)
export function wheelTargetYaw(steer, speed, cfg = WHEEL) {
  return clamp(steer, -1, 1) * cfg.maxYaw / (1 + speed / cfg.speedFade);
}

// exponential approach: frame-rate independent, never overshoots
export function stepWheelYaw(yaw, steer, speed, dt, cfg = WHEEL) {
  return yaw + (wheelTargetYaw(steer, speed, cfg) - yaw) * (1 - Math.exp(-cfg.rate * dt));
}

// vf: signed forward speed; the angle is wrapped to 0..2*pi so it never loses precision
export function stepWheelSpin(spin, vf, wheelR, dt) {
  return (((spin + vf * dt / wheelR) % TAU) + TAU) % TAU;
}

export const frontAxleX = (wheels) => wheels.reduce((m, [x]) => Math.max(m, x), -Infinity);
```

- [ ] **Step 4: Run it to verify it passes.**

Run: `node --test prototype/tests/*.test.mjs`
Expected: all pass, including the 8 new tests.

- [ ] **Step 5: Commit.**

```bash
git add prototype/steering.js prototype/tests/steering.test.mjs
git commit -m "feat(vehicles): pure wheel steering and roll helper (#132)"
```

### Task 2: Wire the wheels into the car

**Files:**
- Modify: `prototype/index.html`: the import block (`:247`), `buildCompact` wheel loop (`:1106`), after `setVehicle(VEH);` (`:1121`), `resetCar` (`:1189`), `stepCar` (`:1278`+), the loop (`:1455`), a new hook next to `window.__mm.carSize` (`~:1271`)
- Test: `prototype/tests/test_wheels.py` (create)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`), `test-todo.md` (append a section)

**Interfaces:**
- Consumes: `WHEEL`, `stepWheelYaw`, `stepWheelSpin`, `frontAxleX` from `./steering.js` (Task 1); `open_hand`, `use_vehicle`, `wait_frames` from `prototype/tests/test_vehicles.py` (import them the way `test_look_back.py` does; copy its header pattern, including the `server` fixture from `conftest.py`).
- Produces: `window.__mm.wheelYaw(): { yaw: number, spin: number, front: number[], rear: number[] }` where `front`/`rear` are the `rotation.y` of the wheel groups on the car.

- [ ] **Step 1: Write the failing test.** Create `prototype/tests/test_wheels.py`:

```python
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, use_vehicle, wait_frames   # same import style as test_look_back.py

WHEELS_JS = "() => window.__mm.wheelYaw()"


def drive(page, key, secs=1.0):
    """Run the physics for secs at 10 m/s with one key held, then wait until the loop has drawn the wheels."""
    page.evaluate("([k, s]) => window.__mm.sim(0, 0, 0, 10, s, [k])", [key, secs])
    wait_frames(page, 2)
    return page.evaluate(WHEELS_JS)


def test_front_wheels_turn_with_the_steering(server):
    """#132: D turns the front wheels right (rotation.y < 0, like car.rotation.y = -th), A left; the rear wheels stay straight."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        right = drive(page, "KeyD")
        left = drive(page, "KeyA")
        b.close()
    assert len(right["front"]) == 2 and len(right["rear"]) == 2, right
    assert all(y < -0.2 for y in right["front"]), right
    assert all(y > 0.2 for y in left["front"]), left
    assert all(abs(y) < 1e-6 for y in right["rear"] + left["rear"]), (right, left)


def test_wheels_return_straight_and_roll(server):
    """#132: with no steering the front wheels swing back to straight; driving rolls the wheels."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        drive(page, "KeyD")
        straight = drive(page, "KeyW", 1.5)
        rolled = drive(page, "KeyW", 0.5)
        b.close()
    assert all(abs(y) < 0.05 for y in straight["front"]), straight
    assert rolled["spin"] != straight["spin"], (straight, rolled)


def test_rebuilt_car_still_steers(server):
    """#132: switching the vehicle rebuilds the wheel groups; the new ones are drawn from the state too."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, "c.drive.top = 30")
        turned = drive(page, "KeyD")
        b.close()
    assert all(y < -0.2 for y in turned["front"]), turned


def test_paused_wheels_stand_still(server):
    """#132: while paused the loop skips the steps and the wheel update, so the wheels do not move."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        drive(page, "KeyD", 0.2)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        before = page.evaluate(WHEELS_JS)
        wait_frames(page, 3)
        after = page.evaluate(WHEELS_JS)
        b.close()
    assert before == after, (before, after)
```

The paused test relies on `Escape` pausing, which needs `inRun()` (`index.html:1338`). If the game is not pausable straight after load, start the run the way `prototype/tests/test_pause.py` does and reuse that setup; do not change the assertion.

- [ ] **Step 2: Run it to verify it fails.**

Run (repo root): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_wheels.py -q -p no:cacheprovider`
Expected: FAIL with `window.__mm.wheelYaw is not a function`.

- [ ] **Step 3: Implement in `prototype/index.html`.**

3a. Import, right after the `heli.js` import (`:247`): `import { WHEEL, stepWheelYaw, stepWheelSpin, frontAxleX } from './steering.js';` (drop `WHEEL` from the list if nothing in `index.html` uses it).

3b. Replace the wheel loop in `buildCompact` (`:1106`, the line starting `for (const [x, z] of v.wheels) for (const s of [1, -1]) {`) with a version that nests the meshes and records the groups:

```js
  g.userData.wheels = []; const frontX = frontAxleX(v.wheels);   // #132: steer group (yaw, front axle only) > roll group (spin) > tyre, rim, hub
  for (const [x, z] of v.wheels) for (const s of [1, -1]) { const w = new THREE.Group(), roll = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(v.wheelR, v.wheelR, 0.24, 16), carMats.tyre); t.rotation.x = Math.PI / 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 10), carMats.rim); r.rotation.x = Math.PI / 2; const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), carMats.dark); hub.rotation.x = Math.PI / 2; roll.add(t, r, hub); w.add(roll); w.position.set(x, v.wheelR, s * z); g.add(w); g.userData.wheels.push({ front: x === frontX, steer: w, roll }); }
```

3c. State and the two functions, right after `setVehicle(VEH);` (`:1121`):

```js
// #132: wheel state is written by stepWheels (from stepCar) only; drawWheels (from the loop) only reads it
const WHEEL_STATE = { yaw: 0, spin: 0 };
function stepWheels(dt, steer, vf, speed) { WHEEL_STATE.yaw = stepWheelYaw(WHEEL_STATE.yaw, steer, speed, dt); WHEEL_STATE.spin = stepWheelSpin(WHEEL_STATE.spin, vf, VEH.wheelR, dt); }
function drawWheels() { for (const w of car.userData.wheels ?? []) { w.steer.rotation.y = w.front ? -WHEEL_STATE.yaw : 0; w.roll.rotation.z = -WHEEL_STATE.spin; } }
```

3d. In `resetCar` (`:1189`) add `WHEEL_STATE.yaw = 0;` at the end of the statement list (inside the braces).

3e. In `stepCar`, directly after the line that sets `P.gas = gas; P.air = air; …` add: `stepWheels(dt, steer, vf, speed);` (`steer`, `vf` and `speed` are all defined at that point).

3f. In `loop` (`:1455`), call `drawWheels();` right before the `renderer.render(scene, camera);` of the **unpaused** path. The early paused branch at the start of `loop` stays as it is.

3g. Directly after the `window.__mm.carSize = …` line add:

```js
// #132: wheel state and the wheel groups actually on the car (read-only, for the test)
window.__mm.wheelYaw = () => { const ws = car.userData.wheels ?? []; return { yaw: WHEEL_STATE.yaw, spin: WHEEL_STATE.spin, front: ws.filter(w => w.front).map(w => w.steer.rotation.y), rear: ws.filter(w => !w.front).map(w => w.steer.rotation.y) }; };
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: the Step 2 command.
Expected: `4 passed`. If only `test_paused_wheels_stand_still` fails because the game cannot pause at load, fix that test's setup (start the run as `test_pause.py` does), not the implementation.

- [ ] **Step 5: Docs.** In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add at the top:

```markdown
- The front wheels turn with the steering now: they swing into the curve when you press A/D (less far the faster you drive), and all four wheels roll as the car moves.
```

Append to `test-todo.md`:

```markdown

## Steering wheels (#132)

- [ ] Chase cam (C): hold A or D while driving slowly: the front wheels swing visibly into the curve, the rear wheels stay straight; let go and they swing back.
- [ ] At top speed the front wheels turn less far than when crawling.
- [ ] Reverse (S) and steer: the wheels point the way you press.
- [ ] The wheels roll while driving and stop when you stop; no strange spinning in the air or in the water.
- [ ] Pause (Esc): the wheels freeze. Helicopter (F), then land again: the car's wheels are straight.
- [ ] Feel: do the swing speed (about a quarter of a second) and the 30 degree lock look right?
```

- [ ] **Step 6: Commit and push, then run the regression.**

```bash
git add prototype/index.html prototype/tests/test_wheels.py CHANGELOG.md test-todo.md
git commit -m "feat(vehicles): front wheels turn visibly when steering (#132)"
git push
```

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_vehicles.py prototype/tests/test_look_back.py -q -p no:cacheprovider`
Then: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_heli.py prototype/tests/test_pause.py -q -p no:cacheprovider`
Then: `node --test prototype/tests/*.test.mjs`
Expected: all pass. A failure: fix the implementation, never the test.
