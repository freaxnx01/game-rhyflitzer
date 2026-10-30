# Regional bus in the Swiss Postauto look (stage 1: primitives) — design

Issue: #473 (split out of #6, which keeps the tractor). Date: 2026-10-26.

## Intent

A yellow 12 m regional bus that every Swiss player recognises at a glance as "the Postauto",
driving through Sisseln and Stein. It is the heavy, slow, wide-turning counterpart to the cars:
fun because it is big, not because it is fast.

This is **stage 1**: the bus is built from primitives (like the Little Classic in #463). Stage 2
replaces the look with a real 3D model through the existing `GLTF_CARS` path once the Sketchfab
download is set up (follow-up issue); the primitives bus then stays as the stand-in while the
model loads, exactly like `mini` → `buildMini`.

## Goals

- A selectable vehicle `bus`, recognisably the Swiss Postauto look: Postauto yellow, white roof,
  black window band, thin red stripe below it dipping to the front, orange LED destination display.
- Feels like a bus: slow, sluggish off the line, wide turns, heavy in a crash.
- Its whole 12 m length is solid — the nose and the tail do not drive through walls, lamps or
  bollards.
- Its own horn chord.

## Non-goals

- Doors that open, passengers, bus stops, timetables, a bus mode (later idea, `docs/ideas.md`).
- The real 3D model (stage 2).
- Articulated bus, coach, oldtimer.
- Changing how the other vehicles drive or collide.

## Anti-goals (a failure even if it works)

- Any PostAuto or Swiss Post branding: no post horn emblem, no Swiss-cross "P", no "PostAuto"
  lettering, no three-tone horn (C♯–E–A, "Dü-Da-Do"). Also no "SETRA" / maker lettering.
- A bus whose tail or nose clips through buildings because only a centre circle collides.
- The compact's feel changes (collision refactor must leave a single-circle vehicle bit-identical).

## Reference

Maintainer's photo (2026-10-26): a Setra S 415 UL (MultiClass) on line 811 at the Ofenpass.
Two axles, ~12.2 m, upright front with a big one-piece windscreen in a dark frame, mirrors on
"rabbit-ear" arms, roof-top AC unit. Details listed in the issue body.

## Decisions

| Topic | Decision | Source |
|---|---|---|
| Look vs. brand | Shape, Postauto yellow and the livery areas as close to the original as possible; no logo, emblem, lettering, maker name or the three-tone horn. Refines the docs/07 PostAuto row of 2026-10-01. | User |
| Type | Modern 12 m two-axle regional bus (Setra S 415 UL as reference). | User |
| Scope | Vehicle only; real model as a separate stage-2 issue. | User |
| Id and order | `VEHICLES.bus`, after `mini` (car selection cycles `Object.keys(VEHICLES)`). `?vehicle=bus` already works through `initialChoice`. | My call |
| Name | `veh_bus_name` en "Regional Bus", de "Überlandbus"; class "Regional bus · Class D" / "Überlandbus · Klasse D"; a one-sentence description in the voice of the others (yellow, wide turns, "everybody makes way") — never "PostAuto" or "Postauto". | My call |
| Size | Length 12.2 m, width 2.55 m, height 3.2 m incl. the AC unit (body 3.05 m). Wheelbase 6.08 m, front overhang 2.7 m: `wheels: [[3.4, 1.05], [-2.68, 1.05]]`, `wheelR: 0.5`. `scale: 1.0`. Rear wheels may be drawn as twin tyres. | My call (real S 415 UL numbers) |
| Livery | Body `#f5c000` (tune by eye to the photo under both styles), roof and AC unit light grey `#e6e8e8`, full-length black window band (≈ y 1.55–2.75 m), red stripe `#d6202a` ≈ 0.06 m directly below the band along both sides, dipping at the front corner and running across the front under the windscreen; dark frame around the windscreen; black lower front grille area; silver rims. `paint: false`. | User (look) / my call (values) |
| Front | Large windscreen, orange LED destination display above it showing **`Sisseln`** (no line number), rectangular head lamps low in the front corners, two mirrors on curved arms reaching forward. Front and rear plate fictional `AG · 4332`. | My call |
| Shape data | Pure dimensions and livery constants in a new `prototype/bus.js` (like `mini.js`, `delorean.js`), so they are unit-testable in node; `buildBus(g, v)` in `index.html` draws from them, registered as `MODELS.bus`. | My call |
| Drive | `drive: { top: 22, topNitro: 30, accel: 4, accelNitro: 8, brake: 10, reverse: 3, reverseMax: 5, grip: 6, gripHandbrake: 1.5, steerRate: 1.1, airSteer: 0.2 }` (≈ 79 km/h). Values match the existing `carselect.test.mjs` BUS fixture, so the bars are top 3, accel 2, handling 5, mass 10. | Code (#6 values already in carselect tests) |
| Mass | `mass: 8`: loses little speed and takes little damage in a crash (`collide` divides both by mass). | #6 |
| Collision | New shape `{ shape: 'capsule', r: 1.3, hl: 4.8 }`: circles of radius `r` along the long axis, centres from `-hl` to `+hl` with spacing ≤ `r` (so 1.3 + 4.8 = 6.1 m each way ≈ half the length). `collide` runs once per circle; a `'circle'` vehicle has exactly one circle at the centre and its arithmetic is unchanged. `checkVehicle` accepts `circle` and `capsule` and rejects anything else or a capsule without finite positive `r`/`hl`. | My call (capsule rejected the OBB solver in #6's analysis, same reasons) |
| Capsule orientation | The pure helper takes the heading: `capsuleCircles(x, z, th, hl, r)` → world centres `(x + cos th · d, z + sin th · d)` for each sample `d`; a circle vehicle gets one centre `(x, z)`. | My call (builder check) |
| Several circles hitting | For each obstacle, `collide` uses only the circle with the **deepest** penetration: one push, one velocity response, one `crashHit` and one `SFX.crash` per obstacle, exactly like today. A single-circle vehicle therefore runs today's arithmetic unchanged. | My call (builder check) |
| Turning off a wall | Long vehicles also turn a little: a hit on a circle at offset `d ≠ 0` adds a yaw nudge to `P.th` proportional to `d × push` (the torque of the push about the centre), clamped to a few degrees per hit, so the bus can scrape past a corner instead of sticking. Applies only when `d ≠ 0`, so circle vehicles are untouched. Gain and clamp tuned by feel. | User (push + slight turn) |
| Wide turns | Come from the drive numbers only (`steerRate`, `grip`); no new steering model, no wheelbase term in `stepCar`. | My call (builder check) |
| Height over 12 m | Ground height, bridge/`low` tests, ramps and the lift keep sampling at the centre, as for every vehicle. The bus may go everywhere a car may; overhanging ends that float over a kerb or dip into a ramp for a moment are accepted in stage 1 (consequence, not fixed). | My call (builder check) |
| Model id | `model: 'bus'`, not `'gltf'` (the `carselect.test.mjs` BUS fixture is only a stand-in for the bars; `statBars` reads `top`, `accel`, `grip` and `mass`). | Code |
| Knockable props | `KNOCK`'s car handle gets the same circles as an optional array `circles: [[x, z], …]` (each with radius `r`); `step()` tests a prop against every circle and falls back to the single `(x, z)` when the array is absent, so lamps, bins and bollards are knocked by the nose and the sides, not only the bus's middle. | My call |
| Other `carRadius()` users | Trees-on-road check, lift platform test and the start-spot check keep using the centre radius (`r`); `spotBlocked` gets the full capsule automatically because it calls `collide`. | My call |
| Engine | Rear engine: `engineAt: [-5.6, 1.4, 0]`. 6-cylinder diesel: low idle (≈ 600 rpm), low shift and limit rpm, dark filter, five or six gears, a deep slow voice. Exact numbers by ear. | My call |
| Horn | A deep two- or three-note **chord** (all notes sound together), e.g. `notes: [196, 247, 294]` (G major), `dur` ≈ 1.0, low `band`. Must **not** use the C♯–E–A set (≈ 277/330/440 Hz) in any octave. | User (own chord) / my call (notes) |
| Crash sound | Heavy: `weight` ≈ 2, low `thump`, dark `noise`. | My call |
| Cameras | Chase ≈ `dist 14, h 5`, near ≈ `dist 10, h 4`, cockpit eye on the **left** (Swiss left-hand drive) high up behind the windscreen ≈ `[5.4, 2.3, -0.75]`, bumper ≈ `[6.2, 0.9, 0]`, drone `dist 26, h 16`. Tune so the windscreen frame does not fill the cockpit view; check the rear-view mirror in the cockpit view by eye (it may show the bus's own body). | My call |
| Lamps | Head and tail lamps follow #270 lights, #230 brake and #271 hazard through `LOCAL_LAMPS` like the DeLorean; blinkers via `BLINK` at the four corners. The LED display is always lit (not a lamp). | Existing behaviour |
| Brands doc | Update the PostAuto row in `docs/07-brands-and-permissions.md`: decided 2026-10-26 — Postauto look (shape, yellow, stripe, white roof) without logo, emblem, lettering, maker name or three-tone horn. | Repo rule |
| Changelog | One player-facing entry under `[Unreleased]`, timestamped; may say "Postauto look". | Repo rule |

## Left to the builder

- Exact colours, how the red stripe dips at the front corner, AC unit size, mirror arm shape,
  wheel and twin-tyre detail, sound numbers, camera heights — by eye and ear within the ranges
  above.
- Whether the capsule sampling helper lives in `bus.js` or a small shared helper next to it,
  as long as it is pure and node-tested.

## Tests

- `node --test` — new `prototype/tests/bus.test.mjs`: dimensions (length 12.2 ± 0.05, width
  2.55, wheelbase 6.08 from the `wheels` positions); capsule centres: first `-hl`, last `+hl`,
  spacing ≤ `r`, symmetric, a circle gives exactly `[[0, 0]]`; the horn notes contain no
  C♯/E/A pitch class (±30 cents); the yaw nudge is 0 for `d = 0`, has opposite signs for nose
  and tail hits, and is clamped. `knock.test.mjs`: a prop touching only the nose circle is
  knocked; without `circles` the behaviour is unchanged.
- Playwright, targeted only (`test_vehicles.py`): `?vehicle=bus` loads with no console errors and
  the measured car is ≈ 12.2 m long; a wall touching only the bus's nose pushes it out
  (`__mm.pushAt`) while the same spot is free for the compact; `checkVehicle` rejects a capsule
  without `hl` and an unknown shape. The other vehicles' tests stay green without edits.

## Acceptance criteria

- [ ] `VEHICLES.bus` exists after `mini` with the drive, mass, size and collision values above;
      `buildBus` is registered as `MODELS.bus`; `paint: false`.
- [ ] Car selection shows "Regional Bus" / "Überlandbus" with class, description and bars
      3 / 2 / 5 / 10.
- [ ] Postauto yellow body, white/grey roof with AC unit, black window band, red stripe dipping
      to the front, orange LED display reading "Sisseln".
- [ ] No logo, emblem, lettering, maker name or "PostAuto"/"Postauto" anywhere on the bus or in
      its UI strings.
- [ ] The whole length collides: nose and tail stop at walls and knock props; compact, DeLorean,
      hatchback and Little Classic collide exactly as before (golden trace unchanged apart from
      the known #465 drift).
- [ ] Own diesel engine voice and a horn chord without the C♯–E–A notes.
- [ ] Lights, brake lights, hazards and blinkers work on the bus.
- [ ] Changelog entry and updated brands-doc row.
- [ ] Manual playtest: drive the Sisseln loop and through Stein in all camera views; turns feel
      wide, the bus fits the main roads, no clipping through buildings.
