# Chase camera: smooth obstacle pull-in (#777)

## Problem

During a handbrake donut next to a building the chase camera pulls in and back out once per spin ("pumping"), from about
7.5 m behind / 2.8 m up to about 1.2 m / 8.9 m and back, with single-frame jumps over 1 m at 20 fps.

## Reproduction (2026-11-09, `main` bf063f2)

Headless Playwright, hand-traced world (`data/world_hochrhein.json` and `data/terrain_hochrhein.mmh` routed to 404),
building `{x: 1871.35, z: -324.925, hw: 20, hd: 6, h: 18.2}` (the `__mm.nearestSolid` of the start position). The car is
placed 2 m off the building's `+x` face, facing the wall (`th = π`), given 25 m/s for 0.1 s, then 0.75 s of
`ControlLeft + KeyA`, 20 settling camera steps, then 4 s of `ControlLeft + KeyA + KeyW`. Per frame:
`__mm.step(dt, keys, dt)` then `__mm.camStep(dt)`. The pull-in loop was instrumented (served copy only) to log the number
of obstructed steps `k`, the target distance and the target height.

| run | max Δ distance / frame | max Δ height / frame | distance range | height range |
|---|---|---|---|---|
| 20 fps | **1.24 m** | **1.23 m** | 2.9 – 7.8 m | 2.6 – 8.2 m |
| 60 fps | 0.43 m | 0.45 m | 3.0 – 8.1 m | 2.6 – 8.2 m |
| open ground (same car, same input), 20 fps | 0.29 m | 0.03 m | 6.9 – 7.9 m | 2.6 – 2.8 m |

Frame log at 20 fps around one pull-in (`k` = obstructed steps, target = the loop's output):

```
frame 47  k 0  target 7.52 m / 2.81 m   camera 7.85 / 2.70
frame 48  k 3  target 3.82 m / 6.42 m   camera 7.01 / 3.65   Δ -0.84 / +0.94
frame 50  k 5  target 1.16 m / 8.86 m   camera 5.04 / 5.72   Δ -0.99 / +1.06
frame 56  k 4  target 2.37 m / 7.72 m
frame 57  k 3  target 3.96 m / 6.52 m
frame 58  k 0  target 7.86 m / 2.92 m   camera 4.64 / 6.41   Δ +1.24 / -1.23
```

**Confirmed root cause** — `stepCamera`, `index.html:4988`:

```js
for (let t = 1; t > 0.25; t -= 0.1) { if (test(t)) { dist *= (t - 0.1); h += 1.2; } else break; }
```

1. The target is a step function of `k`. Each obstructed step multiplies the distance (compounding: k = 3 is ×0.50,
   k = 5 is ×0.15) and adds 1.2 m of height. As the spinning car's heading sweeps the ideal camera spot across the
   wall, `k` jumps 0 → 3 → 5 → 0 within a few frames, so the target jumps by up to 3.9 m in distance and 3.6 m in height
   in one frame.
2. The camera follows the target with one exponential lerp (`camPos.lerp(target, 1 - Math.exp(-6 * dt))`), which hands
   26 % of each target jump into a 20 fps frame — the measured 1.2 m.
3. When the obstruction clears, `k` falls straight back to 0 and the camera swings out again: once per revolution.

## Goal

Next to buildings the chase camera still keeps out of walls, but moves smoothly: no per-frame jump of more than ~0.3 m
in distance or height at 20–60 fps, and no swing up to a high view and back on every spin.

## Design

Replace the step loop with a **continuous, eased, held and look-ahead** pull-in fraction:

1. **Continuous need.** `clearFraction(blocked)` returns the largest fraction `t ∈ [0.2, 1]` of the chase distance whose
   camera point is free: 1 if the ideal spot is free, else a 0.05 scan inward plus 5 bisection steps (≈ 1.5 cm at 7.5 m).
   The point test is the existing OBB test (`hw/hd + 0.8`, same skips for bridges, cave and open lift doors), with the
   height the camera will actually have at that fraction: `P.y + (h + (1 - t) * PULL.rise) * t`.
2. **Look ahead along the spin.** The need is the minimum over headings `th + yawRate · τ` for τ in 0…0.6 s (5 samples;
   a single sample when the car is not turning). The yaw rate is the wrapped heading change per frame, clamped to
   12 rad/s. A spinning car starts pulling in before its line sweeps into the wall, so the eased pull-in never lags
   inside a wall.
3. **Ease and hold.** `pullStep({pull, hold}, need, dt)`: pull in towards the need at most 1.0 /s; every closer need
   re-arms a 1.5 s hold; only after the hold runs out ease back out at 0.4 /s. A donut next to a building therefore
   stays pulled in instead of following each spin.
4. **Bounded rise.** `h += (1 - pull) * 2.5` (at most +2.0 m at pull 0.2) replaces the old +1.2 m per step (up to +9.6 m).
5. **Snap.** When the camera snaps (B look-back), the pull snaps to the need too.

The camera's existing position lerp (rate 6) is unchanged.

Pure helpers (`PULL`, `clearFraction`, `aheadHeadings`, `pullStep`) go into `camera.js` beside `droneSway` and are
unit-tested with `node --test`. `stepCamera` keeps only the world-specific OBB test. `CAM` gains `pull` and `th`.
`window.__mm.camPull()` exposes the state for tests.

### Prototype measurement (same harness, the design injected into the served copy)

| run | max Δ distance | max Δ height | frames with the camera inside the building (0.3 m margin) |
|---|---|---|---|
| eased only, no look-ahead, 20 fps | 0.32 m | 0.15 m | **9** |
| eased only, no look-ahead, 60 fps | 0.11 m | 0.05 m | **26** |
| **design, 20 fps** | **0.31 m** | **0.15 m** | **0** |
| **design, 60 fps** | **0.12 m** | **0.05 m** | **0** |
| old loop, 20 fps / 60 fps | 1.24 / 0.43 m | 1.23 / 0.45 m | 0 / 0 |

Camera distance/height every 3rd frame at 20 fps, old vs new, same donut:

```
old  7.0/2.6 … 7.7/2.7 7.0/3.6 4.3/6.5 3.1/7.9 3.4/7.6 6.4/4.8 7.5/3.7 7.8/3.2 …
new  6.6/2.8 … 7.0/2.8 6.4/3.1 5.6/3.5 4.8/3.9 3.9/4.3 3.2/4.7 2.8/4.8 2.4/4.9 2.0/4.8 1.9/4.8
```

Open-ground runs are unchanged (need = 1 throughout).

## Rejected alternatives

- **Eased pull-in only:** smooth, but measured 9 / 26 frames (≈ 0.45 s) with the camera inside the building at 20 / 60 fps.
- **Faster ease (2 /s):** 0.61 m jumps at 20 fps.
- **Hold while any solid is within the chase radius:** would pull the camera in permanently in every village street,
  not just behind a wall.
- **Keep the step loop and only slow the camera lerp:** slows the camera everywhere (speed changes, turns) and keeps the
  per-spin swing up to a high view.

## Testing

- `tests/camera.test.mjs`: `clearFraction`, `aheadHeadings`, `pullStep` (rates, hold, snap-free behaviour, bounds).
- `tests/test_chase_pull_in.py` (new, hand world): the donut next to the building at 20 and 60 fps asserts max per-frame
  Δ distance ≤ 0.35 m and Δ height ≤ 0.3 m, that the camera did pull in (min distance < 5 m) and that it never sat inside
  the building; plus a parked-with-the-back-to-the-wall check that the settled camera is in front of the wall.
- Existing camera tests stay green: `tests/test_hideout.py::test_camera_stays_under_the_ceiling_while_easing_and_on_the_hill_above_it`,
  `tests/test_look_back.py`, `tests/test_drone.py`, `tests/test_handbrake_wheels.py`.
