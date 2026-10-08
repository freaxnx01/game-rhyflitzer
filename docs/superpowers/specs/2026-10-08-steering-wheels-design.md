# Front wheels turn when steering (#132)

## Goal

When the player steers, the car's front wheels visibly yaw into the turn. As a cheap extra, all four wheels roll with the distance driven.

## Today

- `buildCompact` (`prototype/index.html:1096-1111`) builds each wheel once: a `THREE.Group` with tyre, rim and hub cylinders (each `rotation.x = π/2`, so the axle is the local z axis), placed from `VEH.wheels` (`[x, z]` pairs, mirrored to ±z, `:1106`). Nothing ever rotates them.
- Steering lives in `stepCar` (`:1278`): `steer` (-1..1) comes from keys, touch or the autopilot (`ap.steer`, can be fractional). `P.th` grows with `steer` (D), and the car is drawn with `car.rotation.y = -P.th`. The signed forward speed is `vf`.
- `VEHICLES.compact.wheels` is `[[1.38, 0.86], [-1.38, 0.86]]` (`:1082`): the front axle is the larger x (the car points along +x in model space).
- The loop skips every step while paused (`:1455`, `PAUSE.on`); in helicopter mode `stepFly` runs instead of `stepCar` and the car is hidden (`:1311`).

## Decisions

| Topic | Decision |
|---|---|
| Which wheels steer | The wheels whose model x equals the largest x in `VEH.wheels` (the front axle). Computed in the builder from `v.wheels`, not hard-coded, so a future vehicle works. |
| Steering angle | `target = steer * maxYaw / (1 + speed / 30)`, `maxYaw = 30°` (π/6). The `1 / (1 + speed/30)` fade is the same one the physics uses for its steering authority (`stepCar`, `sf`), so the wheels agree with the car: 30° standing, 15° at 30 m/s, about 10° at top speed. |
| Smoothing | Exponential approach, `yaw += (target - yaw) * (1 - exp(-10 * dt))` (time constant 0.1 s). A key press swings the wheels in about a quarter of a second instead of snapping. |
| Direction | `yaw > 0` is steer right (D), the same sign as `P.th`. The wheel group is drawn with `rotation.y = -yaw`, like `car.rotation.y = -P.th`. In reverse the wheels point the same way as the input (as on a real car). |
| Wheel spin | All four wheels roll: `spin += vf * dt / wheelR` (signed forward speed, so reversing rolls backwards), wrapped to 2π. Drawn as `rotation.z = -spin` on an inner group, so the yaw (outer group) and the roll (inner group) do not fight. |
| State vs render | State `WHEEL_STATE = { yaw, spin }` is written only by `stepWheels` (called from `stepCar`). A separate `drawWheels()` in the loop, right before the render call, only reads it and writes the wheel groups' rotations. Rule: render reads state, never mutates it. |
| Wheel list | `buildCompact` records `g.userData.wheels = [{ front, steer: group, roll: group }]`; `drawWheels` reads `car.userData.wheels` (`?? []` for a model without wheels). A rebuild (`setVehicle`) replaces the list. |
| Pause | No change needed: the loop skips `stepCar` while paused, so the state, and with it the wheels, stand still. The paused branch of the loop does not call `drawWheels`. |
| Helicopter | `stepFly` does not call `stepWheels`; the car is hidden. The state freezes, nothing animates. |
| Reset | `resetCar()` zeroes `WHEEL_STATE.yaw`, so the car does not re-appear with turned wheels. The spin is left alone (invisible). |
| Test hook | Read-only `window.__mm.wheelYaw()` returns `{ yaw, spin, front: [...], rear: [...] }`, where `front`/`rear` are the `rotation.y` values of the wheel groups actually on the car. |
| Pure helper | New `prototype/steering.js` (no three.js, no DOM): `WHEEL`, `wheelTargetYaw`, `stepWheelYaw`, `stepWheelSpin`, `frontAxleX`. Unit-tested by `node --test`. |

## Assumptions

- **A1** [high] Front wheels steer by yaw about the vertical axis of the wheel group. Rejected: rotating the whole model. `index.html:1106` already builds one group per wheel.
- **A2** [high] Front = largest x in `VEH.wheels`. Rejected: a `front: true` flag in the vehicle table; the car points along +x (`index.html:1081`) and the table is already the single source for wheel positions.
- **A3** [med] Max angle 30°, scaled down with speed by `1/(1 + v/30)`. Rejected: a fixed angle, which at 60 m/s looks like a toy car. Taste value; the physics fade (`sf` in `stepCar`, `index.html:1278+`) is the evidence for the shape.
- **A4** [med] The wheels also roll with the distance driven. The feedback asks only for steering. Rejected: leaving them still. A still wheel next to a turning one looks odd, and the cost is one line.
- **A5** [med] Smoothing time constant 0.1 s. Rejected: instant (snaps with the key). Feel value, to be judged in `test-todo.md`.
- **A6** [high] Spin follows `vf`, not a wheel-slip model: no burn-out, no locked wheels under the handbrake. Rejected: a slip model, out of scope for a visual extra.
- **A7** [high] Wheels in the air keep rolling and keep their steering angle (state is not gated by `air`). Rejected: freezing them; it would need another state and nobody asked.
- **A8** [high] The autopilot's `ap.steer` drives the wheels the same way as the keys, since `stepCar` reads one `steer`.

## Consequences

- The car's bounding box (`__mm.carSize`, `index.html:1271`) widens while the wheels are turned (a yawed tyre sticks out further). The existing test reads it at rest (yaw 0), and collision uses a circle (`collision.r`), so there is no gameplay effect.
- `stepCar` gains one call and a few floats of state; `drawWheels` touches four groups per frame. Negligible against `physMs`.
- A new module `prototype/steering.js` is imported from `index.html` (same pattern as `heli.js`); no build step.

## Tests

- `node --test prototype/tests/steering.test.mjs`: the constants, the target angle (sign, standing, speed fade, clamp), the smoothing (converges, no overshoot, frame-rate independent), the spin (sign, reverse, wrap), `frontAxleX`.
- Playwright (`prototype/tests/test_wheels.py`): after `__mm.sim` with D held, the front wheels' `rotation.y` is negative (-yaw), the rear wheels' stays 0; after steering left it is positive; with no input it returns to about 0; the spin changes when driving; a rebuilt car (`use_vehicle`) still steers; pausing freezes the wheels.
- Regression: `test_vehicles.py`, `test_look_back.py`, `test_heli.py`, `test_pause.py`.

## Docs

- CHANGELOG `[Unreleased]` → `Added`: "The front wheels turn with the steering now, and all four wheels roll as you drive."
- `test-todo.md`: a "Steering wheels (#132)" section.

## Out of scope

- Wheel-slip visuals, tyre marks, suspension travel, body roll. Steering-wheel animation inside the cockpit.
