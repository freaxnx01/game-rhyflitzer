# A helicopter that flies like the one in slop-newyork (#731)

Playtest note 2026-11-07 (maintainer, from the three.js showcase): the helicopter in
[mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork/) feels **much better** than ours. slop-newyork is MIT (LICENSE in its
root): code may be adapted with attribution, assets may not (we take none; its helicopter model is a different, TSL-lofted one).

## What ours does today

| Part | Where | Behaviour |
|---|---|---|
| Flight step | `heli.js:38-45` `stepHeli` | speed: linear `approach` to `top` 40 / `-back` 10 / **0**, at `accel` 12 m/s² (nitro 24, top 60). Releasing W takes 40 / 12 = **3.3 s** to stop. |
| Altitude | `heli.js:42-43` | Space/Shift move a *target* altitude `alt` at `climb` 15 m/s; `y` chases it with `1 - exp(-follow dt)`, `follow` 2: **0.5 s lag**, the helicopter keeps drifting after the key is released. |
| Yaw | `heli.js:39` | `yawRate` 1.2 rad/s, instant. |
| Attitude | `index.html:4419` | `heli.rotation.set(0, -P.th, 0)`: **no pitch, no roll, no hover bob**. The model slides level. |
| Camera | `index.html:4766` `flyCamera` | target = `P - f * camDist(35)`, `y + camH(22)`; `camPos.lerp(target, 1 - exp(-3 dt))` in **world space** (trails the helicopter by about `v / 3` = 13 m at 40 m/s and swings on turns); looks 20 m ahead and 8 m **down**. High and far: the helicopter is a small yellow dot. |
| Rotor | `index.html:4419`, `sound.js:36-38` | blades spin at 30 rad/s (two blades: strobes), no disc. Sound: thump rate `5.5 + 0.012 * km/h`, constant gain; climbing or hovering sounds the same. |
| Keys | `heli.js:10-18`, `controls.js:45` | W/S/arrows fly, A/D/arrows yaw, Space climbs, Shift sinks, N nitro, F lands; touch buttons g/b/l/r. |

Rooms: `index.html:4418` also clamps `FLY.alt` with `rooms.js:192` `roomFlyAlt` (the target must not wind up under the ceiling).

## What slop-newyork does (MIT)

All in `js/controllers.js` (`updateHelicopter`, line 1388), `js/cameras.js` and `js/audio-sources.js`; `js/helicopter.js` is only the
mesh and its material.

- **Speed** (`controllers.js:1388-1410`): W adds `24 m/s²` up to `52 m/s` (backwards `0.6 *` that); **no input: `speed *= 1 - 1.8 dt`**, an
  exponential brake with a ~0.55 s time constant. Stops crisply, but without the abrupt halt of a car.
- **Vertical** (`:1412-1417`): Space/E and Q/C add `22 m/s²` to a real *vertical speed* clamped to `±16 m/s`; no input:
  `vy *= 1 - 3.5 dt` (~0.29 s). The helicopter answers at once and settles at once; there is no target altitude and no lag.
- **Yaw** (`:1419`): `1.45 rad/s`, instant, same model as ours.
- **Attitude** (`:1430-1437`): `targetPitch = speed / 52 * 0.24` rad (nose down when flying forward, nose up when backing), `targetRoll =
  -yaw * 0.28` rad (**banks into the turn**), both eased `+= (target - current) * min(1, dt * 5)`, applied on a `tiltPivot` under the
  yaw node. Plus a **hover bob**: `tiltPivot.position.y = sin(elapsed * 2.6) * 0.18`. This is the main "alive" cue: the machine leans
  into every acceleration and turn and never stands still.
- **Camera** (`cameras.js:187-216`, `:318-345`): chase offset `11.4` m back (`controllers.js:865` `chaseDistance`), `3.3` m up
  (`chaseHeight`), ~1.2 body lengths. The distance grows with a smoothed speed (`dist * (1 + min(0.25, s * 0.01)) + 0.1 * s`,
  `s` smoothed with `1 - exp(-3 dt)`). It looks at `5.2` m ahead of the helicopter, `1.75` m above it (almost level: the machine is the
  subject). **The camera is eased in the helicopter's frame** (`followOffset.lerp(desired - position, 1 - exp(-8.5 dt))`), only the
  height base is eased in world space. So a steady flight keeps the camera steady and only turns and the speed pull-back are eased.
  Mouse drag orbits and recentres at `2.2 / s` while moving.
- **Rotor** (`controllers.js:1100-1102`, `:819-820`): main rotor `24 rad/s`, tail rotor `32 rad/s` (4 blades each) and a translucent
  **blur disc** (radius 4.85, opacity 0.13, `depthWrite: false`) at the rotor plane, so the rotor reads as a disc, not as strobing bars.
- **Sound** (`audio-sources.js:18-33` `helicopterLoad`): engine load `0.45` (hover) `+ 0.28` collective up `- 0.16` collective down
  `+ 0.15` climbing / `- 0.08` sinking (by `vy / 16`) `+ 0.1` forward key `+ 0.12 * speed / 52`. Climbing sounds harder, sinking softer.
- **Not taken**: its collision (cylinder of 4.5 m against a building index), its model, its TSL material, its gamepad and touch layout
  (ours differ: `controls.js`, `touch.js`).

## Differences, in the order they probably matter

1. **No attitude on ours** (no pitch, roll, bob) against lean-into-everything on theirs. Biggest single visual difference.
2. **Camera**: ours is 35 m back / 22 m up looking down, world-space lerp 3/s (trails and swings); theirs is close, low, level and
   eased in the machine's frame with a stiff 8.5/s.
3. **Stopping**: ours coasts 3.3 s linearly to a halt; theirs brakes exponentially in ~1 s.
4. **Altitude**: ours is target altitude plus a 0.5 s lag; theirs is vertical acceleration with 0.3 s damping (answers at once, stops at once).
5. **Acceleration**: 12 against 24 m/s²: ours feels sluggish.
6. **Rotor**: no disc, 30 rad/s strobing; theirs disc + two rotors.
7. **Sound**: ours ignores climb and hover load.

## Decisions (maintainer, 2026-11-07)

- **Top speed stays** 40 m/s (nitro 60); only acceleration and braking change.
- **Camera** 16 m back, 6 m up, look-at 8 m ahead, as designed; tuned after the playtest.
- **Load-following rotor sound** (Task 4) is in.
- **Full MIT notice** (`Copyright (c) 2026 Mr.doob` plus the licence text) in `CREDITS.md`.
- Rotor 24 rad/s as designed; mouse orbit, tail rotor and gamepad stay out of scope.

## Goal

Same handling and look as slop-newyork's helicopter, in our world's scale: the machine leans into acceleration and turns, answers
the collective at once, brakes smoothly, is followed by a close level chase camera that does not trail or swing, and its rotor reads as
a disc and sounds harder when it climbs. Existing keys and touch buttons, take-off, landing (F), nitro, the room (Eiffel) clamp and the
building floor (`heliFloor`) keep working.

## Design

All feel logic is **pure and node-tested** in `heli.js`; `index.html` only applies it.

1. **Flight model** (`heli.js`): the state becomes `{ x, z, y, th, v, vy, pitch, roll, assist }` (`alt` goes).
   - speed: input forward/back: `approach` towards `top` / `-back` at `accel` (nitro: `topNitro`, `accelNitro`); no input:
     `v *= max(0, 1 - drag * dt)`. New constants `drag 1.8`, `accel 20`, `accelNitro 30` (ours was 12 / 24, theirs 24; top stays 40 / 60, our
     world is smaller than Manhattan and a 52 m/s top would cross Stein in 40 s).
   - vertical: `vy` gets `lift * climbAccel (22) * dt`, clamped `±climb (16)`; no lift: `vy *= max(0, 1 - climbDrag (3.5) * dt)`. `y += vy dt`,
     then clamped to `[floor, ceiling]` (`ceiling` defaults to `ground + maxAgl`, the room passes its own); a clamp zeroes `vy` on that side.
     A floor above the helicopter still lifts it at once (tall building ahead).
   - **take-off assist**: `heliStart` sets `assist = ground + takeoffAgl`. While `assist` is set and the player gives no vertical input,
     the step climbs as if Space were held until `y >= assist - 5`, then clears it. Any Space/Shift clears it at once. This keeps today's
     "F lifts you to 120 m" without a teleport.
   - attitude: `pitch` (positive = nose down) eases to `v / top * pitchMax (0.24)`, `roll` (positive = right side down) to `yaw * rollMax
     (0.28)`, both at `min(1, tiltRate (5) * dt)`. Yaw model unchanged (instant, `yawRate` 1.2: theirs is the same model, so not changed).
   - `heliBob(t)`: `sin(t * 2.6) * 0.18`.
2. **Attitude applied** (`index.html` `stepFly`): `heli.rotation.order = 'YZX'` once; `heli.rotation.set(s.roll, -P.th, -s.pitch)`;
   `heli.position.y = P.y + heliBob(clock)`. The yaw stays outermost, pitch then roll are about the model's own axes (nose +x, right +z).
   `P.y` (physics, HUD, map, collisions) is untouched by the bob: the bob is drawn only.
3. **Chase camera** (`heli.js` `heliChaseStep`, `index.html` `flyCamera`): the offset behind the helicopter is eased in its frame
   (`k = 1 - exp(-camRate * dt)`, `camRate` 8.5), height base in world space; speed pull-back as theirs. `camDist 16`, `camH 6`,
   look-at `5.2` m ahead (scaled to our 11 m machine: `8`) and `2` m above the helicopter. The existing `groundH + 5` floor on the camera stays.
4. **Rotor** (`index.html`): a translucent blur disc (radius 5.6, opacity 0.13) in the `rotor` group, blades 24 rad/s (theirs).
5. **Sound** (`heli.js` `heliLoad`, `sound.js` `rotorMix`): `heliLoad` ports their formula to our inputs; `rotorMix` takes an optional
   `input.load`; rate and gain move with `load - ROTOR.hoverLoad (0.45)` (`ratePerLoad 1.5` Hz, `gainPerLoad 0.5`). Without `load` the
   mix is exactly today's (existing sound test unchanged).
6. **Rooms**: `rooms.js` `roomFlyAlt` is no longer needed (no target altitude) and goes, with its test; the room passes its ceiling
   to `stepHeli`, `roomFlyClamp` keeps the x/z walls.
7. **Credit**: a comment at each adapted block names slop-newyork (MIT, mrdoob), and `CREDITS.md` gets a line with the licence.

Keys: **no binding changes.** slop-newyork also climbs on E and sinks on Q/C; we do not adopt those (E enters buildings on foot, C is
the camera, Q is free but unneeded). Space/Shift stay. Touch: unchanged (`heliInput` is untouched).

## Not in scope

Mouse-drag orbit and gamepad support, slop-newyork's model/material, tail rotor, collision rework, a camera preset switch (C stays inert in
flight), first-person cockpit view, yaw smoothing, higher top speed, the Postauto and train cameras.

## Acceptance

Unit tests (`node --test tests/`):
- releasing W from 40 m/s: `v < 4` after 1.5 s and strictly decreasing, never negative (exponential brake)
- W from rest: `v` reaches 40 in 2.5 s or less; nitro still reaches 60
- Space from hover: `vy` reaches `climb` and not beyond; release: `|vy| < 0.5` after 1 s; Shift never below `floor`; ceiling stops the climb and zeroes `vy`
- take-off assist: from the ground it reaches `ground + 120 - 5` or more, stays within 125 m, and one Shift press cancels it
- pitch positive (nose down) when flying forward, negative backing; roll sign equals the yaw sign; both bounded by `pitchMax` / `rollMax` and settle within 1 s
- chase camera: with a constant velocity the camera offset converges to a constant (no trailing growth); at `v = 0` it sits `camDist` behind
- `heliLoad` hover is 0.45, climbing is higher, sinking lower, always in `[0, 1]`; `rotorMix` without `load` is unchanged

Playwright (only the helicopter files, `tests/test_heli.py`, and the room-helicopter tests in `tests/test_hideout.py`): take-off still
reaches about `ground + 120`; controls still fly, yaw and climb (assertions on `alt` change to `y` / `vy`); `__mm.fly()` reports `pitch`,
`roll`; flying forward shows pitch above 0.1 rad, a held D shows roll above 0.1 rad; room helicopter still reaches the tower top in 22 s (holding Space from the start, the node room test relaxes 20 s to 22 s: `climb` is 16 m/s now and no 120 m head start) and stays
under the ceiling; F lands, C stays inert, no console errors.

Manual (maintainer, he decides "feels as good"): fly the same route as in slop-newyork: take off, fast pass, hard turn, stop, climb, sink.
