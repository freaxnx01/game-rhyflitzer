# Sprungschanze run-up test: measure the jump, not one instant (#931)

## Problem

`tests/test_jump.py::test_sprungschanze_run_up_launches_the_car` is red on `main`: after
`__mm.sim(c.x, c.z, th, 0, 4)` the car is 0.61 m over the ground, the test wants > 1.0 m.

## Measured cause (headless, GPU browser, procedural terrain as in the test)

Per-frame trace of `__mm.sim` from the J -> Sprungschanze start (357.3, 170.2), heading 0, ramp x 397.3..422.7, h 3.4:

| | compact (before #830) | hatchback (main) |
|---|---|---|
| drive.accel / top | 16 / 60 (`index.html:3252`) | 17.5 / 64 (`hatchback.js:8`) |
| reaches ramp foot x0 | 2.65 s, 25.6 m/s | 2.52 s, 27.0 m/s |
| leaves the lip x1 | ~3.52 s | ~3.39 s, 31.2 m/s |
| peak clearance over ground | 3.45 m (x 425.2) | 3.47 m (x 425.4) |
| clearance at t = 4.0 s | 2.22 m (still in the air) | 0.61 m (touching down, x 441.6) |
| touchdown | after 4 s | ~4.0 s, ~19 m past x1 |

`git bisect` (criterion: clearance at 4 s > 1.0) over `c57db6e..origin/main` names
**706dce7** "feat(vehicles): retire the Sissle Speedster, the hatchback becomes the start car (#830)",
`carselect.js:26` `DEFAULT_CHOICE = { id: 'hatchback', ... }`. The test runs with the default car, so since
#830 it drives the quicker hatchback: it reaches the ramp 0.13 s earlier and is landing exactly at the 4 s
sample. The ramp move `c57db6e` still passed (2.22 m). PR#953 (#902) did not change the outcome: the end state
at 706dce7 and on current `main` is bit-identical (y 0.553901466158817). Launch physics (`launchVy`, keep 0.6,
`index.html:5626-5627`) is unchanged since #80.

## Verdict

**Stale test, not a game regression.** The jump with the hatchback is as high (3.47 m vs 3.45 m) and as long as
with the compact. The test sampled a single instant tuned to the compact's acceleration ("2.41 m at x 362.8
after 4 s" was measured on the old ramp position with the compact).

## Design

Replace the fixed-instant check with a car-independent measurement of the jump itself, the way
`test_sprungschanze_stands_on_level_ground_and_launches_on_measured_terrain` already does:

- Sample `__mm.sim(c.x, c.z, th, 0, t)` for t = 2.0 .. 6.0 s in 1/30 s steps (each call restarts from the
  start, so samples are independent and deterministic).
- `clear(t) = y - ground(x, z, -Infinity)`.
- Peak clearance over all samples > 2.5 m (measured 3.47).
- Flight: the first sample past x1 with clearance < 0.05 m (touchdown) lies more than 10 m past x1 (measured ~19 m);
  a car that is still in the air at 6 s also passes.
- Keep: car gets over the ramp (`end.x > x1`), not sideways (`z0 < end.z < z1`) at touchdown/last sample.
- Update the stale comment (no more "2.41 m at x 362.8").

Rejected: lowering the 1.0 threshold or moving the sample time (still tied to one car's acceleration);
pinning `?vehicle=compact` (#830 made the compact a non-selectable stand-in, so the test would cover a car
no player drives).

## Out of scope (discovery)

The apex is only ~0.07 m above the lip: the "launch" is mostly the 3.4 m drop at 31 m/s, because
`launchVy` keeps 0.6 of the ramp's vertical speed. A stronger kick would be a game-design change; not part of #931.
