# Choose car shows only the shadow after a run (#210) — design

Status: enriched 2026-10-10 (`--quick`, no questions asked). Playtest entry 07 of `docs/ai-notes/feedback/2026-10-10-playtest.md`.

## Problem

On **Choose car** the stage shows the car's shadow but no car. The tester did not think **V** (hide car) was pressed.

## Root cause (reproduced 2026-10-10 on `main` @ `cda3b21`, headless Chromium, real world)

`car.position` / `car.rotation` (the mesh) are written in exactly one place, `stepCar`. The loop runs `stepCar` only when
`R.state !== 'ready'`. `toMainMenu()` (pause menu → Main menu, or the result flow) sets `R.state = 'ready'` and calls `resetCar()`,
which moves `P` back to `P.safe` (the start) but **never moves the mesh**. So on the start screen, and on **Choose car**,
the mesh still stands where the abandoned run ended.

The turntable camera, the look target and the shadow (`restShadow()` in `resetCar`) all follow `P`, so the stage looks at the start
and finds an empty road with a shadow on it.

Measured (probe `r210d`): after `__mm.step(2, ['KeyW','KeyA'])`, Escape, Main menu: `heading() = 3.14159` (start) but
`carPose().rot[1] = 0.2815` (the run's heading); the screenshot of **Choose car** is a dark quad on an empty road, no car.

Ruled out (each probed, car shows): the fresh page; **V** pressed before opening (`stepTurntable` forces `car.visible = true`);
paging to the DeLorean look-alike. Not the #183 PBR body, not #162's turntable: the bug is older than both (the fresh page works
only because line `car.position.set(START.x, sy, START.z)` at the end of the script placed the mesh once).

## Fix

`resetCar()` also sets the mesh pose from `P`:
`car.position.set(P.x, P.y, P.z); car.rotation.set(0, -P.th, 0);`

Every caller of `resetCar` (main menu, restart, the R key, jump-less respawns) then leaves mesh and `P` in step, in any state.
`stepCar` writes the same two lines every frame, so nothing else changes while driving.

Rejected: moving the mesh write out of `stepCar` into the loop (touches the hot path, no gain); setting the pose inside
`stepTurntable` only (the start screen behind the overlay would still show the car at the old spot, and the next
**Race!** would flash it there for a frame).

## Test

Read-only hook: `__mm.carPose()` gains `pos: [x, y, z]` (the mesh position). Playwright test in `test_carselect.py`: start a race,
`__mm.step(2, ['KeyW','KeyA'])`, Escape, Main menu (`R.state` is still `armed`, so no confirm dialog); the mesh position must equal `P`
(`__mm.car()`) and the mesh yaw must equal `-heading()`.
