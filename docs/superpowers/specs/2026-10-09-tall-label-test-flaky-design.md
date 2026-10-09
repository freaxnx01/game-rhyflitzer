# Flaky `test_tall_building_label_stays_on_screen` — design (#143)

## Problem

`prototype/tests/test_debug.py::test_tall_building_label_stays_on_screen` fails intermittently on `main`
in two ways: `clamped=False` with `ny=None` in the chase view (Bodenacker, `171822634`), and 120 s
camera-arrival timeouts under load.

## Measured cause (headless probe, 2026-10-09, 3 runs, load 5–16)

The probe replayed the test's steps and logged, on every drawn frame, `__mm.cam()`, the first entries of
`__mm.debug().heights`, and whether the test's `CHASE_ARRIVED` predicate was true.

1. **False arrival during the fly-in (the `ny=None` mode).** `startRace` puts the camera next to START
   (`prototype/index.html:1393`); `__mm.sim` then teleports the car, and the chase camera flies to it in a
   straight line, `camPos.lerp(target, 1 - exp(-6 dt))` (`prototype/index.html:1381`). For Bodenacker the
   start is 192 m west of the spot, so the line crosses the car's 6.9 m ring on the *far* side.
   `CHASE_ARRIVED` (`prototype/tests/test_debug.py:16-17`) only checks `|d_xz| ≈ 6.9 ± 0.3` and
   `d_y ≈ 2.6 ± 0.3`, not the side. One run caught it:

   | frame | `cam().d` | loose `CHASE_ARRIVED` | at target | label `171822634` |
   |---|---|---|---|---|
   | 33 | `[-4.78, 2.90, 5.04]` | **true** | false | `ny: null, clamped: false` |
   | 46 | `[6.61, 2.61, 0.12]` | true | false (0.31 m off) | `ny: 0.8, clamped: true` |
   | 47 | `[6.69, 2.61, 0.09]` | true | true | `ny: 0.8, clamped: true` |

   At frame 33 the camera stands on the west side of the car, looking south-east at the look point
   6 m ahead of the car, so the roof-top label is behind it: `labelNdcY` returns `NaN` for `zc >= 0`
   (`prototype/debug.js:54-57`), `clampLabelY` therefore leaves it unclamped, and `__mm.debug()` reports
   `ny: null, clamped: false` (`prototype/index.html:1519`). This is exactly the signature in the issue.
   Whether the test resolves on that frame is a coin toss: `d_y` there is 2.90–2.91 against a 0.3
   tolerance, and the car's settling during the flight moves it by a few cm. That is why it fails at low
   and passes at high load, and vice versa.

   `TALLEST` (`155170807`) lies 4.2 km *east* of START, so its fly-in arrives from behind the car and never
   crosses the far side; the issue's `ny=None` failures were all Bodenacker.

2. **Slow fly-in (the timeout mode).** The fly-in needs about 25–35 drawn frames (192 m: arrival at frame
   47 after the teleport at ~19; 4.2 km: frame 57). With `dt` clamped to 0.05 this is a frame count, not a
   time. Measured wall time: 56–101 s at load 5–16; under heavier load (0.1–1 fps) it exceeds the 120 s
   budget, as the issue saw (118 s).

The label itself is fine once the camera is really at its target: in all 6 reads at the true end state
the label was `ny: 0.8, clamped: true`, and 40 frames later unchanged. The panel tick and `clampDebugHeights`
are not involved.

## Design

Test-only change in `prototype/tests/test_debug.py`; no app change, assertion untouched.

1. **Wait for the real end state.** Replace `CHASE_ARRIVED` with a heading-aware predicate: the camera
   offset is within 0.3 m (3D) of the chase target behind the car,
   `(-6.9 cos th, 2.6, -6.9 sin th)` with `th = __mm.heading()` (`prototype/index.html:1279`). A camera on
   the far side of the car can no longer pass.
2. **Skip the fly-in instead of waiting it out.** After the teleport, hold `B` until `cam().back === true`,
   then release it and wait for `back === false`. A change of `CAM.back` snaps the chase camera to its
   target (`prototype/index.html:1378-1381`, `snap`), so the camera is at the chase target a frame later,
   independent of the distance and the frame rate. Then wait for the predicate from 1. This is the same
   key sequence `test_look_back.py` already drives.
3. `COCKPIT_ARRIVED` stays: the cockpit eye is placed, not lerped (`prototype/index.html:1380`), and its
   check is already exact for heading π.
4. Assertions unchanged: `clamped is True` and `-1 <= ny <= 0.8` for both views.

## Acceptance criteria

- `CHASE_ARRIVED` rejects a camera on the far side of the car (heading-aware, 3D within 0.3 m of the chase
  target).
- The chase camera is snapped to the car with a `B` press/release before waiting for arrival.
- The two `assert` lines of the test are unchanged.
- The test (both params) passes 3 times in a row in isolation.
- The check still bites: with `clampDebugHeights();` removed from `hud()` the test fails; reverted.
- CHANGELOG untouched (test-only, nothing player-facing).

## Out of scope

#64 (GPU object count) and #88 (i18n navigation timeout) have their own plans; #64's `wait_settled` is not
on `main` yet and is a different end state (stable GPU counts), so nothing is shared.
