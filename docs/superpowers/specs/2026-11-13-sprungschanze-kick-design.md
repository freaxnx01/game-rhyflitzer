# Sprungschanze kick: the ramp throws the car up (#969)

## Problem

The Sprungschanze barely throws the car up. The "jump" is mostly a 3.4 m drop off the lip at 31 m/s.

## Measured (headless, GPU browser, procedural terrain, hatchback, J -> Sprungschanze, full gas, `__mm.sim` per frame)

Ramp x 397.3..422.7, z 152.4..188, h 3.4 (grade 0.134), start (357.3, 170.2), heading 0.

| | value |
|---|---|
| reaches ramp foot x0 | t 2.52 s, 27.0 m/s |
| leaves the lip x1 | t 3.40 s, 31.3 m/s, lip y 3.39 |
| vertical speed leaving the lip | ~2.1 m/s (y +0.035 m/frame) |
| apex | y 3.451 at x 425.4: **0.06 m above the lip** |
| touchdown | t 4.02 s, x 442.1, **19.4 m past the lip** |
| ground past the lip | flat: -0.02 m (x1+5) to -0.16 m (x1+80), no solid within 80 m on the line |
| damage on landing | 0 (see Consequences) |

Cause: on the ramp each grounded frame sets `P.vy = launchVy(lift, dt, kerb)` = `0.6 * lift / dt`
(`vehicle.js:23-27`, `KERB.keep` 0.6 at `vehicle.js:10`; called at `index.html:5626-5627`), i.e. 0.6 x speed x
grade = 0.6 x 31.3 x 0.134 = 2.5 m/s. With gravity 22 m/s^2 (`index.html:5626`) that is an apex of
v^2/2g = 0.14 m at best, measured 0.06 m.

## Options

1. **Global: raise `KERB.keep` to 1.0.** vy = 31.3 x 0.134 = 4.2 m/s, apex 0.40 m. Still not a jump, and it changes
   every slope crest in the world (golden traces, #902 field/plattform tests). Rejected.
2. **Geometry: steeper ramp.** An apex of 2 m needs vy 9.4 m/s; with keep 0.6 that is a lip grade of 0.50, exactly the
   kerb threshold `KERB.grade` (`vehicle.js:10`, `isKerb` is `>`): the ramp would sit on the edge of being treated as
   a kerb (#902) and a slightly faster frame would stop launching. A 7.6 m high ramp at the present length would also
   change the landmark, `rampGap` and the shadow tests. Rejected.
3. **Ramp-specific kick at the lip (chosen).** When a grounded car crosses the ramp's high edge x1 (it started the
   frame on the ramp footprint and ends it past x1), its vertical speed becomes at least `RAMP_KICK x vx` (vx = the
   speed along the ramp's rise, +x; the ramp always rises along +x, `index.html:2780`). Keyed to the ramp's own
   footprint, so no kerb, crest or field edge can ever trigger it; `launchVy`, `isKerb`, `isEdge` and `KERB` stay
   untouched. Proportional to speed, so a slow run-up gives a small hop.

## Design

- `vehicle.js` (pure, unit-tested):
  - `export const RAMP_KICK = 0.30;` launch grade at the lip (~16.7 deg).
  - `export function crossesLip(ramp, ax, az, bx, bz)`: true when (ax, az) lies on the footprint
    (x0 <= ax <= x1, z0 <= az <= z1) and bx > x1 and z0 <= bz <= z1.
  - `export function rampKick(vx, kick = RAMP_KICK)`: `Math.max(0, vx * kick)`.
- `index.html` `stepCar`, right after `const gh2 = groundH(...)` (`index.html:5622`):
  `if (RAMP && !air && crossesLip(RAMP, P.x - P.vx * dt, P.z - P.vz * dt, P.x, P.z)) P.vy = Math.max(P.vy, rampKick(P.vx));`
  `air` is the frame-start flag (`index.html:5610`), so only a car that is driving on the ramp gets the kick.
  The air branch then applies gravity as usual.
- Both layouts (hand and OSM) use the same `RAMP` object, so both get the kick.
- No new key, no new mesh.

## Target (assumption, see A1)

At the J run-up with the default hatchback (31.3 m/s at the lip): vy0 = 9.4 m/s ->
**apex ~2.0 m above the lip** (~5.4 m over the landing ground), **touchdown ~34 m past the lip** at ~4.5 s (flat
ground, measured out to x1+80), no wreck. Acceptance thresholds leave margin: apex > 1.6 m above the lip,
touchdown > 25 m past the lip.

## Assumptions

- A1 [med] Target apex 2.0 m above the lip (RAMP_KICK 0.30). The user may want higher or lower; it is one constant.
- A2 [med] No visual kicker: the drawn ramp stays a 7.6 deg wedge while the launch is ~16.7 deg. A curved lip mesh
  would need groundH, `rampGap` and shadow changes (size M). Can be a follow-up.
- A3 [med] The kick is the same for every vehicle (bus, tractor, ...), scaled only by speed.
- A4 [high] Only crossing x1 in +x direction kicks; leaving over the side edges or backwards down the ramp does not.

## Consequences

- Landing is harder: fall ~15 m/s instead of ~12.6 m/s. It still does no damage, because the 0.6 m landing snap
  (`index.html:5627`, `P.y - gh2 < 0.6 && P.vy <= 0.5`) sets the car down before `landingHurts` (`wreck.js:26`, 9 m/s)
  is ever evaluated: per-frame fall at 15 m/s is 0.26 m < 0.6. Pre-existing; noted, not changed.
- Airtime ~1.1 s instead of ~0.6 s; the car lands ~15 m further, still on open flat ground.
- Golden traces (`tests/test_vehicles.py`, start 1882.9/-292.2 and 1206.5/-127) never touch the ramp: unchanged.
  `tests/test_plattform_field.py` and the #902 kerb tests do not involve the ramp: unchanged.
- `tests/test_shadow.py` ramp tests park the car on the ramp (no lip crossing): unchanged.

## Tests

- `tests/vehicle.test.mjs`: unit tests for `crossesLip` and `rampKick`.
- `tests/test_jump.py::test_sprungschanze_run_up_launches_the_car`: add apex-above-lip > 1.6 m and touchdown > 25 m
  past the lip (existing > 2.5 m clearance and > 10 m assertions stay and still hold).
- `test_sprungschanze_stands_on_level_ground_and_launches_on_measured_terrain`: unchanged (top > 2.5 still holds).
