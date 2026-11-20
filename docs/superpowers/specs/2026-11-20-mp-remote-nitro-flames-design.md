# Remote car shows its nitro flames (#1116)

## Problem

In multiplayer the other player's nitro flames never show. `poseFlags()` (`index.html:7213-7217`) already sends
`FLAG.nitro` (`netsync.js:18`) with every pose, but nothing on the receiving side reads it.

## Cause (pinned)

- `cloneStageVehicle(id, paint, keepBlink)` (`index.html:7512`) always puts `flames` in its drop set:
  `const drop = new Set([flames])` (`:7518`). Only the blinkers are conditional (`:7519`, `if (!keepBlink)`). The clone
  therefore never has a flames group.
- Callers of `cloneStageVehicle`: the podium car (`:4332`, no flag), the remote cars (`buildNetCar`, `:7306`,
  `keepBlink = true`) and the depot slot (`buildDepotSlot`, `:7537`, no flag). Podium and depot must keep dropping the
  flames and blinkers; only the remote call site changes.
- Remote pose flags are applied every frame in `stepNetCars` (`:7352-7390`): lamps from `remoteLamps(pose.flags, flashOn)`
  (`:7362`), blinkers (`:7368-7369`). There is no flames line.
- The driven car shows its flames at `:6153`: `flames.visible = !!P.nitro && ...`, and each cone's `scale.y` flickers
  (`0.7 + 0.5*|sin(simNow()*0.04)|`).
- Flames are cones whose position comes from the vehicle builder (`flames.add(...)`, e.g. `:3652`, `addFlames :3858`),
  so a clone made with `stage.clone(true)` carries the right per-vehicle positions once it is not removed.

## Design

1. `cloneStageVehicle`: rename the 3rd parameter `keepBlink` to `remote` (it now means "remote car: keeps blinkers and
   flames"). Drop set becomes empty for a remote clone; a depot/podium clone drops `flames`, `BLINK.left`, `BLINK.right`
   as today. A remote clone captures the cloned flames group by index (before the removal loop, like `li`/`ri`), sets
   `.visible = false`, and returns it as `flames` next to `lamps` and `blink` (`null` when the model has no flames).
2. `buildNetCar`: store `entry.flames = built.flames`.
3. `stepNetCars`: after the blinker lines, when `entry.flames` exists:
   `entry.flames.visible = !!(pose.flags & FLAG.nitro)` and, while visible, flicker each child's `scale.y` the same way
   as `:6153`, using `performance.now()` (a remote car has no sim clock).
4. Test hook: `window.__mm.netCars()` (`:7469`) gains `flames: e.flames ? { n: e.flames.children.length, visible: e.flames.visible } : null`.
5. `netsync.js` is **not** changed: `remoteLamps` is deepEqual-tested; a nitro bit is read inline with `FLAG.nitro`.

## Acceptance criteria

- A built remote car has a flames group with at least one cone (`netCars()[i].flames.n > 0`) for every vehicle that has flames.
- While the sender holds nitro the remote flames are visible on the other page; when released they are hidden again.
- Depot cars and the podium car still have no flames and no blinkers (unchanged).
- Remote blinkers, lamps, fade-out and name tag behave as before; page console stays empty.

## Out of scope

Flame sound for remote cars, flame fade on car leave (hidden-on-leave is not needed: a leaving car keeps its last pose).

## Assumptions

- **A1** [high] Reuse the existing 3rd parameter (renamed `remote`) instead of a new one. Rejected: a second boolean
  (`keepFlames`), since flames and blinkers are kept together for exactly the same callers (`:7306`).
- **A2** [high] Flames toggled from `pose.flags & FLAG.nitro`, no netsync change. Rejected: adding `nitro` to
  `remoteLamps`, whose test `tests/netsync.test.mjs:69-74` uses deepEqual on its result shape.
- **A3** [med] The flicker is applied to the remote flames like the driven car's, using `performance.now()`. Rejected: static cones (looks dead next to the own car).
- **A4** [med] Verified by one new Playwright test in `tests/test_multiplayer_cruise.py` (existing pair fixture), using
  `driveSim(2.5, ['ArrowUp','KeyN'])` on the sender; nitro key in `driveSim` is assumed to be `KeyN` (`tests/controls.test.mjs:29`). Rejected: a headless pre-fix reproduction run (cause is evident from the code, per cost rules).

## Consequences

- `buildNetCar`'s `entry.roof` is measured with `Box3.setFromObject(mesh)` which now includes the (hidden) flame cones: they sit low and behind the body, so the roof height (y) is unchanged.
- Remote cars carry a few more cone meshes and materials each (cloned per mesh by the existing material loop); freed by the same removal path as the car.
- Landing order: #1108 also edits remote-car rendering in `stepNetCars`/`buildNetCar` and likely the `netCars` hook; whichever lands second needs a trivial rebase. #1113 and #1114 touch `index.html` elsewhere.
