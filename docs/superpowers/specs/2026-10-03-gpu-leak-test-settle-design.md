# Spec: `test_rebuilds_free_gpu_memory` must measure after the scene has settled (#64)

## Problem

`prototype/tests/test_vehicles.py::test_rebuilds_free_gpu_memory` compares `window.__mm.gpu()`
(`renderer.info.memory`) after the first `setVehicle` rebuild (`first`) with the counts after five more
(`last`). It failed on `main` as `248 <= 247` once under load, and deterministically (geometries 280 -> 281
on another enrichment's `main`; 225 -> 281 geometries and 48 -> 62 textures in this enrichment's run 1).

## Cause (measured, not a leak)

`renderer.info.memory` counts GPU objects that have been **uploaded**, and three.js uploads a mesh's
geometry or texture the first time it is drawn, i.e. the first time it is inside the camera frustum. The
follow camera starts at `START + (14, 5, 4)` (`prototype/index.html:1225`) and eases into the chase pose
`(9, 3.4, 0)` relative to the car, so for roughly the first 30 drawn frames the frustum moves and static
world meshes (for example the 70 x 8.75 Hallenbad facade label plane, `prototype/index.html:587`) are
uploaded for the first time. The test takes `first` after only 2 frames, so those uploads land between
`first` and `last`; how many depends on how many frames the page drew before the test started, which is
what load changes.

Counts (3 runs, `systemd-run` cap 2G, isolated):

- Run 1, the test as is: `first` {geometries 225, textures 48}, `last` {281, 62}: FAIL.
- Run 2, hooked replay of the test: boot 247 / 57, `first` 248 / 57, after 5 rebuilds 249 / 57. The
  +1 geometry is the Hallenbad label plane (`PlaneGeometry 70 x 8.75`, owner `Mesh < Group < Scene`).
  Car parts: every rebuild uploads its own geometries and the plate texture (`256x64`) and disposes the
  previous ones; no car object survives.
- Run 3, no rebuild at all, 150 frames: geometries 247 -> 248 (frame 10) -> 249 (frame 20), constant from
  frame 20 on; textures 57 throughout; camera offset reaches `(9, 3.4, 0)` at frame ~30.

So the camera settling alone raises the geometry count with zero rebuilds. `setVehicle` does not leak
(`freeCar` at `prototype/index.html:936` disposes geometries, per-build materials, maps).

## Fix

Test-only. The leak assertions stay exactly as they are; only the baseline is taken from a settled scene.

Add a helper `wait_settled(page)` to `test_vehicles.py`: repeat `wait_frames(page, 5)` and sample
`{ gpu: __mm.gpu(), d: __mm.cam().d }`; stop when two consecutive samples have equal `gpu` and camera
offsets within 0.01 m of each other (arrival, not stillness: the exponential ease never reaches zero);
fail with the last two samples after a bounded number of rounds (40). Call it once, after the first
`use_vehicle`, before reading `first`.

No app change, no new debug hook (`__mm.cam()` and `__mm.gpu()` exist).

## Acceptance criteria

- `test_rebuilds_free_gpu_memory` passes 3 times in a row in isolation.
- The three assertions (`first["textures"] > 0`, textures `<=`, geometries `<=`) are unchanged.
- `wait_settled` fails with a readable message instead of hanging when the scene never settles.
- The full `prototype/tests` suite still passes.

## Assumptions

- **A1** [high] Not a real leak. Evidence: run 3 shows the count rising with zero rebuilds, and run 2 shows
  car geometries and the plate texture uploaded and disposed in balance per rebuild.
- **A2** [med] Fix the test (settle before the baseline) instead of making the baseline "include the known
  lazy objects" by name. Rejected: a named allow-list, which rots with every new world object and would
  have to track the Hallenbad plane and whatever comes next. A settled baseline keeps the check as strict.
- **A3** [med] "Settled" is read from the existing `__mm.cam()` offset plus unchanged `gpu()` counts rather
  than from a fixed frame count. Rejected: `wait_frames(page, 40)`, which is load-dependent in exactly the
  way this issue is about.

## Consequences

- The test takes about 30 more drawn frames before its baseline; under swiftshader at under 1 fps that can
  add tens of seconds to this one test.
