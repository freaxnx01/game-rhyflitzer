# Remote wheels (#1108) Implementation Plan

**Goal:** the other player's car rolls its wheels (signed, reversing rolls backwards) and steers its front wheels.
**Spec:** `docs/superpowers/specs/2026-11-20-remote-wheels-design.md`
**Constraints:** buildless, vanilla JS, no new files besides tests, no framework. Edit only the functions named below (#1113/#1114/#1116 touch `index.html` too; #1116 touches `cloneStageVehicle`/`buildNetCar`). Playwright: foreground, only the files named here, never the full suite:
`env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/<file> -x`

Single player needs no change (reversing already rolls backwards, measured in the spec).

## Task 1: `forwardSpeed` in `steering.js` (TDD)

**Files:** `steering.js`, `tests/steering.test.mjs`

- [ ] Failing test first, in `tests/steering.test.mjs` (add `forwardSpeed` to the import line 3):

```js
test('forwardSpeed: signed speed along the heading, heading th = -ry', () => {
  close(forwardSpeed(10, 0, 0), 10, 1e-9);                 // ry 0 -> th 0 -> +x is forward
  close(forwardSpeed(-10, 0, 0), -10, 1e-9);               // reversing
  close(forwardSpeed(0, 10, -Math.PI / 2), 10, 1e-9);      // ry -pi/2 -> th pi/2 -> +z is forward
  close(forwardSpeed(0, 10, Math.PI / 2), -10, 1e-9);
  close(forwardSpeed(0, 0, 1), 0, 1e-9);
});
```

- [ ] Run `node --test tests/steering.test.mjs`: the new test fails (no export).
- [ ] Add to `steering.js`, after `stepWheelSpin`:

```js
// a remote car's signed forward speed from its pose: heading th = -ry (the car's rotation.y = -th), so a reversing car is negative
export function forwardSpeed(vx, vz, ry) {
  const th = -ry;
  return vx * Math.cos(th) + vz * Math.sin(th);
}
```

- [ ] `node --test tests/*.test.mjs`: all green. Commit `feat(wheels): signed forward speed from a pose (#1108)`.

## Task 2: Find the wheel groups in the clone (`index.html`)

**Files:** `index.html` (`cloneStageVehicle` ~7512, `buildNetCar` ~7313, import line 1115)

- [ ] Import line 1115: add `forwardSpeed` to `{ stepWheelYaw, stepWheelSpin, frontAxleX, plantedWheelY }`.
- [ ] In `cloneStageVehicle`, next to `const blink = { left: null, right: null };` add `let wheels = [];`. Inside `withStageVehicle`, right after `const li = ..., ri = ...;` (indices are captured before the removal loop detaches children, exactly like `blink`), add:

```js
    wheels = (stage.userData.wheels ?? []).map(w => ({ front: w.front, steer: g.children[stage.children.indexOf(w.steer)] })).filter(w => w.steer && w.steer.children[0]).map(w => ({ front: w.front, steer: w.steer, roll: w.steer.children[0] }));   // #1108: the clone's userData has no node refs, so find the wheel groups by child index like the blinkers
```

  NOTE: this line must run BEFORE the `for (const i of dropIdx...) g.remove(...)` loop (indices shift after removal). Place it right after the `li`/`ri` line.
- [ ] Change the return to `return { mesh, paint: bodyPaint, lamps, blink, wheels };` (the depot caller ignores the new field).
- [ ] In `buildNetCar`, after `entry.blink = built.blink;` add `entry.wheels = built.wheels; entry.spin = 0; entry.wheelAt = null;`.
- [ ] In `newNetCar` (one line, ~7261) add `wheels: [], spin: 0, wheelAt: null` to the object literal.

## Task 3: Step the remote wheels (`index.html`)

**Files:** `index.html` (new `stepRemoteWheels` above `stepNetCars`, one call inside it, `window.__mm.netCars`)

- [ ] Add above `stepNetCars`:

```js
// #1108: a remote car's wheels from its sampled pose, with the signs of drawWheels (front yaw = -steer, roll = -spin). The roll
// speed is the signed forward speed, so a reversing car rolls backwards. dt is this entry's own frame time, clamped so a
// backgrounded tab does not spin the wheels wildly.
function stepRemoteWheels(entry, pose) {
  const at = performance.now(), dt = entry.wheelAt === null ? 0 : Math.min((at - entry.wheelAt) / 1000, 0.1);
  entry.wheelAt = at;
  const def = VEHICLES[entry.car];
  if (!def?.wheelR) return;
  entry.spin = stepWheelSpin(entry.spin, forwardSpeed(pose.vx, pose.vz, pose.ry), def.wheelR * def.scale, dt);
  for (const w of entry.wheels) { w.steer.rotation.y = w.front ? -pose.steer : 0; w.roll.rotation.z = -entry.spin; }
}
```

- [ ] In `stepNetCars`, right after `if (entry.trailer) swingRemoteTrailer(entry.trailer, pose);` add `stepRemoteWheels(entry, pose);`.
- [ ] Extend `window.__mm.netCars` (line ~7469) with `wheels: e.mesh ? { spin: e.spin, yaw: e.wheels.filter(w => w.front).map(w => w.steer.rotation.y), rear: e.wheels.filter(w => !w.front).map(w => w.steer.rotation.y), n: e.wheels.length } : null`.
- [ ] Reload the page by hand once: console empty, own car's wheels still turn.

## Task 4: Playwright test (`tests/test_multiplayer_cruise.py`)

Reuse `pair`, `connect`, `ready_both`, `net_car` and the "drive together" setup from `test_two_players_see_each_other_drive`: copy its connect/start lines into a helper `start_session(host, guest)` only if it avoids duplication, otherwise copy the lines as that test does. Add two tests:

- [ ] `test_remote_car_turns_and_rolls_its_wheels`: after the session starts, `host.evaluate("() => window.__mm.driveSim(2, ['KeyW', 'KeyD'])")`, then on the guest wait (timeout `T`) until `net_car(guest, 0)["wheels"]["n"] >= 4`; assert some `yaw` entry has `abs(y) > 0.05` right after (steer is eased back, so read during the drive: run `driveSim` in a second step and poll) and `spin` changed between two reads.
- [ ] `test_remote_car_reversing_rolls_backwards`: `host.evaluate("() => window.__mm.driveSim(2, ['KeyS'])")` from standstill; sample the guest's `wheels.spin` twice 200 ms apart while the host drives; the signed wrapped delta `((b - a + pi) % (2*pi)) - pi` must be negative.
- [ ] Run only this file in the foreground (command above, 2 GB cap). If the headless guest renders under 1 fps, widen the sampling interval, do not skip the assertion.

## Task 5: Changelog and finish

- [ ] `CHANGELOG.md` under `[Unreleased]`, newest first, local time (`TZ=Europe/Zurich date '+%F %H:%M'`), bold 1-3 keywords, for the player:
  `- \`<timestamp>\` The other player's car now **turns its wheels** in multiplayer: they roll, roll backwards when it reverses, and the front wheels steer.`
- [ ] Run `node --test tests/*.test.mjs` and `tests/test_wheels.py` (own car unchanged; foreground, capped).
- [ ] Commit `fix(multiplayer): the other player's car turns its wheels (#1108)`; PR with `Closes #1108`.
