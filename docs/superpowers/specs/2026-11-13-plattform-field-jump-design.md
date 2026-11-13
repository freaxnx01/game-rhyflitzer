# #902 — no high jump from the field onto the Plattform yard (design)

## Problem

Driving from the field north of the Plattform Sisslerfeld towards the tower launches the car 6–14 m into the air.

## Measured cause (2026-11-13, GPU browser, measured terrain `terrain_hochrhein.mmh`)

Reproduced with `__mm.sim` + `__mm.step(1/60)` + `__mm.car()`, starting 30 m from the tower centre and driving at it
(world angle a: 270° = north, the field side). Per run: the frame with the largest vertical speed and the peak height above ground.

| from (a, start v) | ground step that frame | at r from centre | ground vs terrain there | launch vy | peak above ground |
|---|---|---|---|---|---|
| 270°, 20 m/s | +0.72 m | 13.8 m | road 0.61 m over terrain | ≈26 m/s | 14.5 m |
| 270°, 10 m/s | +0.66 m | 13.7 m | 0.58 m | ≈24 m/s | 12.4 m |
| 240°, 20 m/s | +0.63 m | 17.4 m | 0.53 m | ≈23 m/s | 11.6 m |
| 300°, 15 m/s | +0.61 m | 14.3 m | 0.55 m | ≈22 m/s | 10.6 m |
| 330°, 20 m/s | +0.45 m | 23.3 m | 0.44 m | ≈16 m/s | 6.3 m |

A slow car pushed sideways onto the same edge by a collider (speed 0.6 m/s) was launched too (+0.44 m, 5.5 m high).
With the `.mmh` blocked (the coarse fallback terrain most Playwright tests use) nothing happens: max 0.03 m above ground.

The step is **not** the Plattform: the KSL yard is draw-only (`index.html:2107-2108`), the core collider is a 1.56 m circle
(`plattform.js:143-146`). It is the north edge of the **Geuerenstrasse** ribbon (OSM -42004, w 7 m, 9.8 m north of the tower,
`pipeline/anchors.json:63`). On the measured terrain the road sits on a low embankment; `ribbonGeo` lifts every quad by the most
the ground rises over it (`ribbonLift`, `world.js:1012`, applied at `index.html:1735`), so the drawn — and driven, `roadSurfH`
in `surfaceGroundH`, `index.html:1631` — north edge stands 0.45–0.72 m proud of the field slope: a vertical kerb.

The launch itself is `stepCar`'s grounded branch (`index.html:5625`):

```js
const lift = gh2 - groundH(P.x - P.vx * dt, P.z - P.vz * dt, P.y); P.vy = Math.max(0, (L && lift > 1 ? 0 : lift) / dt * 0.6);
```

Any rise under 1 m inside one frame becomes `lift / dt * 0.6` — 0.7 m at 60 fps → 25 m/s. Meant for crests and the
Sprungschanze (smooth rises), it treats a kerb as an infinitely steep ramp. The same class of step was already seen on the
Sägeweg (`tests/test_bridge_ends.py:18-21`, a 0.40 m road-drape step "that still launched the car").

## Design

A rise under the car only launches it when it is a **slope**, not a **kerb**:

- Sample the ground along the frame's path (from the pre-move point to the new point) every ≤ 0.25 m.
- If any consecutive pair rises more than `grade` (0.5, i.e. 1:2, 27°) times their spacing, the rise is a kerb: the car is
  set onto it (as now) with `vy = 0`. A path of zero length with a rise (collider push) is a kerb as well.
- Otherwise the launch is unchanged: `vy = lift / dt * 0.6`, dropped below 1 m/s; the OSM `lift > 1` rule stays.

The sampling is frame-rate and speed independent (a fixed spacing, not the frame's run), so a 100 m/s coupe still sees a kerb.
It runs only when the old formula would launch (`lift / dt * 0.6 ≥ 1`), so level driving costs no extra `groundH` calls.

Pure helpers go to `vehicle.js` (already pure and unit-tested): `KERB`, `stepSamples`, `isKerb`, `launchVy`.

Rejected:
- Fixing the ribbon (lower `ribbonLift`, skirt the edge): changes every road's drape, and leaves the physics trap for the next
  embankment, kreisel apron or ramp side.
- A Plattform-local exception: the yard and the collider are innocent.
- A pure grade-over-frame-run rule: at 100 m/s one frame runs 1.7 m, so a 0.6 m kerb reads as a 0.35 grade and still launches.

## Acceptance

- From the field north of the tower (a = 240°, 270°, 300°, 330°, 10 and 20 m/s, measured terrain) the car never gets more than
  0.5 m above the ground (before: 6.3–14.5 m).
- The Sprungschanze still launches the car (`tests/test_jump.py` ramp test: > 1 m above ground past the ramp).
- Unit tests for the helpers; full `node --test` suite green.

## Consequences

- Every kerb-like rise stops launching, world-wide: road-ribbon edges over embankments, the kreisel apron (0.375 m step,
  `index.html:1628`), the ramp's side edges, abutment seams. They become a one-frame pop up onto the higher surface.
- The drawn ribbon still overhangs the field by up to 0.7 m on the Geuerenstrasse; that is visual and not changed here.
