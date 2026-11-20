# Remote cars roll and steer their wheels (#1108)

## Problem

On the other player's screen a car's wheels stand still. Own car is fine.

## Cause (measured, with file:line)

- `drawWheels` (`index.html:3917`) reads `car.userData.wheels` and the single `WHEEL_STATE` (`index.html:3910`) -- the own car only. It is called from the loop (`index.html:8559`), never for `NETCARS` meshes.
- `stepNetCars` (`index.html:7337-7372`) sets position, rotation, trailer swing (`swingRemoteTrailer`, `index.html:7326`) and lamps. It never touches wheels.
- The remote mesh is `cloneStageVehicle` (`index.html:7512`) = `stage.clone(true)`. three's `Object3D.copy` JSON-copies `userData`, so `mesh.userData.wheels` (the steer/roll node refs from `buildWheels` `index.html:3618` / `wireWheels` `index.html:3851`) is not usable on the clone. The wheel groups are cloned as children, only unreferenced.
- The pose already carries what is needed: `encodePose` call `index.html:7240` sends `vx`, `vz`, `steer: WHEEL_STATE.yaw` (radians, already speed-faded); `sampleRemote` (`netsync.js:68-96`) returns interpolated `vx`, `vz`, `steer`, `ry`.

## Single player while reversing: works

Question from the tester: "auch Single Player?". No.

- `stepCar` computes `vf = P.vx*cos(th) + P.vz*sin(th)` (`index.html:6126`), signed; `S` drives `vf` negative (`index.html:6136`); `stepWheels` -> `stepWheelSpin` (`steering.js:19`) adds `vf*dt/r`, so spin decreases.
- Node: `node --test tests/steering.test.mjs` passes, including the reverse case (`steering.test.mjs:43-46`).
- Headless Playwright (2026-11-20, `__mm.sim` + `__mm.wheelYaw`, compact): holding `KeyW` from +3 m/s, spin 1.056 -> 3.576 rad over 0.1 s (signed delta +2.52, forward). Holding `KeyS` from -3 m/s, spin 2.608 -> 0.472 rad (wrapped signed delta -2.14, backwards). Own-car wheels do roll backwards. No single-player change needed.

## Design

Remote cars get the same two motions as the own car, driven from the sampled pose:

1. **Rig.** `cloneStageVehicle` also returns `wheels`: for each `w` of the stage's `userData.wheels`, the matching node in the clone (`g.children[stage.children.indexOf(w.steer)]`, captured before the drop loop, like `blink`), plus `front`. The roll group is `steer.children[0]`. `buildNetCar` stores it as `entry.wheels` (empty list for wheel-less models: nothing to do).
2. **Speed.** New pure `forwardSpeed(vx, vz, ry)` in `steering.js`: heading `th = -ry` (the car's `rotation.y = -th`), returns `vx*cos(th) + vz*sin(th)`. Signed, so reversing is negative.
3. **Step.** New `stepRemoteWheels(entry, pose, dt)` called from `stepNetCars` after the pose is applied. It keeps `entry.spin` with `stepWheelSpin(entry.spin, forwardSpeed(...), def.wheelR * def.scale, dt)` and sets `steer.rotation.y = front ? -pose.steer : 0`, `roll.rotation.z = -entry.spin` -- exactly the signs of `drawWheels`.
4. `dt` = seconds since this entry's previous step, clamped to 0.1 s (first step: 0), so a hidden tab does not spin the wheels wildly.
5. Read-only test hook: `__mm.netCars` gains `wheels: { spin, front: [rotation.y...] }`.

Out of scope: body-lean compensation of the remote wheels (`plantedWheelY`, `drawWheels` `lean` part), wheel debris on remote wrecks, the trailer wheels (already roll in `swingTrailer`).

## Functions and files touched (for landing order vs #1113, #1114, #1116)

- `index.html`: `cloneStageVehicle` (add `wheels` to the return; shared with the depot, which ignores it), `buildNetCar` (one line), `stepNetCars` (one call), new `stepRemoteWheels`, `window.__mm.netCars` (one field). Imports line for `steering.js` (add `forwardSpeed`).
- `steering.js`: new `forwardSpeed`.
- `tests/steering.test.mjs`, `tests/test_multiplayer_cruise.py`, `CHANGELOG.md`.
- #1116 touches the remote-car clone: it collides with `cloneStageVehicle` / `buildNetCar`. Land this first or rebase onto it; the change here is a few lines in each.

## Acceptance criteria

- [ ] On a second device, the other player's front wheels turn with its steering and all wheels roll while it drives.
- [ ] While it reverses, its wheels roll backwards.
- [ ] A standing remote car keeps its wheels still.
- [ ] Own-car wheels unchanged (`tests/test_wheels.py` still green).
- [ ] CHANGELOG entry under `[Unreleased]`.

## Assumptions

- **A1** [high] Single player already rolls wheels backwards, so no single-player change. Rejected: a defensive rewrite of `stepWheelSpin`. Measured in node and headless Playwright above; `steering.js:19`.
- **A2** [high] Roll uses the interpolated pose velocity, projected on the heading, rather than a distance integral. Rejected: integrating `pose.x/z` deltas. Pose already has `vx`/`vz` and `sampleRemote` interpolates them (`netsync.js:84-95`).
- **A3** [high] Reuse `stepWheelSpin` and the `drawWheels` signs (`-yaw`, `-spin`), so remote wheels turn exactly like the own car's.
- **A4** [med] The remote front yaw is `-pose.steer` with no further smoothing: the sender's `WHEEL_STATE.yaw` is already eased (`steering.js:15`) and the pose is interpolated. Rejected: a second easing on the receiver.
- **A5** [med] No lean compensation (`plantedWheelY`) on remote wheels: they stay in the body's frame, so on a tipped car they lean with it. Rejected: sending lean separately. The own car's compensation is a #542 refinement; remote cars rarely tip.
- **A6** [med] Wheels in the clone are found by the stage's child index, not by name, because that is how `blink` is already captured (`index.html:7519-7521`) and it works for procedural and glTF cars alike.

## Consequences

- Each remote car costs 4 small matrix writes per frame.
- A remote car extrapolating after packet loss (`sampleRemote` `EXTRAP`) keeps its last velocity, so its wheels keep rolling for that time too.
