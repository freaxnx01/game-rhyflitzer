# Car true to size — design

Status: approved headless (`/enrich 69 --headless`) 2026-10-03 · Issue #69

## Goal

The compact car is too big for the roads and the new car parks (#40). Playtest 2026-10-03: „Auto ist zu gross im Verhältnis zur Strasse/Parkplätzen" (`docs/ai-notes/feedback/2026-10-03-playtest.md`).

**Decision (user, 2026-10-03):** the compact goes back to real size, `VEHICLES.compact.scale` **1.0**. Everything tied to the body size scales with it: wheels, collision circle, the four camera offsets (chase, near, cockpit, bumper) and the blob shadow. Grip and steering are re-checked after shrinking.

Success looks like:

- The car fits a 2.5 × 5.0 m parking bay (`pipeline/world_parking.py:14`, `BAY_W, BAY_D`) and looks right on a residential road.
- All four camera views still frame the car the way they did at 1.3×.
- The collision circle still matches the body.
- The drive physics (grip, steer, acceleration) are unchanged; only collisions that touched the bigger circle change.

## History: why the car was 1.3×

Commit `1df347b` ("arcade car scale 1.3x", after the v0.2.0 release) added `CAR_SCALE = 1.3`: "The model is true to size (4.5 m long, like a Mazda 3), but with real-size houses and a 62 degree vertical FOV it read like a toy car. Scale model, shadow blob and collision radius by 1.3; **camera unchanged**." The CHANGELOG line ("The car is 30 % bigger…", `CHANGELOG.md:40`) is still under `[Unreleased] → Changed`. #5 (`f2ed24c`) moved the factor into `VEHICLES.compact.scale` (`prototype/index.html:857`).

So the chase camera (9 m back, 3.4 m up) was set for the true-size car. Making the car bigger was a stand-in for bringing the camera closer. This design does the opposite: real-size car, closer camera.

## Measured (dry runs on `main` @ 13a4ef7, hand layout, `setVehicle` at runtime, no file changed)

| | scale 1.3 (today) | scale 1.0 |
|---|---|---|
| Body box L × W × H (mirrors in, nitro flames out) | 6.06 × 2.83 × 2.01 m | **4.66 × 2.18 × 1.55 m** |
| Width without mirrors (sill) | 2.47 m | 1.90 m |
| Collision radius (`r 1.3 × scale`) | 1.69 m | 1.30 m |
| Fits a 2.5 × 5.0 m bay | no | yes |

The issue estimates 5.2 × 2.2 m today and 4.0 × 1.7 m for a real compact. The model is really 4.66 m long (body outline ±2.26 m plus the 0.07 m bevel, `index.html:874-875`), the size of a Mazda 3 (4.46 × 1.80 m). Scale 1.0 makes it about 4.7 × 1.9 m: a real compact car, slightly bigger than the issue's estimate.

Golden trace (`prototype/tests/test_vehicles.py:17-25`) at scale 1.0: `gas`, `turn`, `handbrake`, `coast` and `brakeReverse` are bit-identical. `nitro` and `kreisel` change, because they touch an obstacle and the circle is smaller:

- `nitro`: the 1.3× car hits an obstacle on the start straight between 2.5 s and 3 s (47.9 → 36.0 m/s). The 1.0× car passes it and hits later (3–3.5 s). New end: `[1739.232868382405, -290.63114851912127, 46.21729428938969]`.
- `kreisel`: the car bounces off the island 0.39 m later. New end: `[1218.7183244804414, -127, 1.0311994537196747]`.

`test_table_collision_radius_scales` (11.8 m free; scale 2 → 12.1 m) and `test_table_mass_softens_the_crash` (light 2.0738; mass 2 → 2.505) give the same numbers at 1.0. A car standing 11.0 m from the island centre is free at 1.0 but pushed out to 11.19 m at 1.3.

Camera dry run (car at rest at START, race running): chase `{ dist: 6.9, h: 2.6 }` settles at (6.94, 2.62), near `{ dist: 4.6, h: 1.85 }` at (4.65, 1.87); no building pull-in at START.

## Decisions

| Topic | Decision |
|---|---|
| Scale | `VEHICLES.compact.scale: 1.0` (`index.html:857`). The model geometry is not touched. |
| Wheels, `wheelR`, collision `r`, cockpit/bumper eyes, blob | No value changes. They are model metres and already multiplied by `VEH.scale`: `car.scale.setScalar` and `blob.scale` in `buildCar` (`index.html:892`), `carRadius()` (`:896`), `vehEye()` (`:1018`). |
| Chase and near camera | World metres (`index.html:855`), so they are divided by 1.3 by hand: chase `{ dist: 6.9, h: 2.6 }` (was 9 / 3.4), near `{ dist: 4.6, h: 1.85 }` (was 6 / 2.4). The car keeps its on-screen size (6.9 / 4.66 ≈ 9 / 6.06). Only the world around it looks bigger. |
| Camera dynamics | Unchanged: the speed pull-back (`dist + speed·0.09`, `h + speed·0.03`), the look-at point (6 m ahead, 1.2 m up), the building pull-in margin (0.8 m), all in `stepCamera` (`index.html:1022-1026`). |
| Drive physics | `VEHICLES.compact.drive` unchanged. `stepCar` is a point mass: grip, steer and acceleration never read the body size (`index.html:993-1010`). Feel is re-checked by a playtest, not retuned blind. |
| Golden trace | Re-record `nitro` and `kreisel` only, with the reason in the comment. The other five values stay pinned to `6d29cb8`. |
| Size test | New read-only hook `__mm.carSize()`: the car group's bounding box in world metres, measured with the car's yaw zeroed and the nitro flames left out (mirrors in). A test pins 4.66 × 2.18 × 1.55 m (±0.02) and `< 5.0 × 2.5` (bay). |
| Camera test | A chase-view and a near-view test wait for the camera to arrive at (6.9, 2.6) and (4.6, 1.85) (±0.1), "wait for arrival, not stillness". |
| Eye-view tests | Expected offsets in `test_table_cockpit_eye_is_used` and `test_look_back.py` (#65, merged) drop the `* 1.3`. |
| CHANGELOG | Remove the unreleased "30 % bigger" line. It never reached a release (v0.2.0 came first). Add one player-facing line under `[Unreleased] → Changed`. |
| Code comment | The "arcade scale … compact.scale 1.3" comment (`index.html:866`) is rewritten to say the model is drawn at real size and the chase cameras sit close instead. |
| Playtest | A `test-todo.md` section: bay fit, road look, four cameras, collisions, grip/steer feel. |

## Acceptance criteria

- [ ] `VEHICLES.compact.scale` is `1.0`; `wheels`, `wheelR`, `collision.r`, `drive`, `mass`, the cockpit/bumper eyes and the blob geometry are unchanged.
- [ ] `__mm.carSize()` reports about 4.66 × 2.18 × 1.55 m, which fits a 2.5 × 5.0 m bay.
- [ ] Chase camera `{ dist: 6.9, h: 2.6 }`, near camera `{ dist: 4.6, h: 1.85 }`; both tests see the camera arrive there.
- [ ] Golden trace: `gas`, `turn`, `handbrake`, `coast`, `brakeReverse` unchanged to 1e-6; `nitro` and `kreisel` re-recorded to the values above.
- [ ] Cockpit/bumper eye tests (`test_vehicles.py`, `test_look_back.py`) expect the eye × 1.0.
- [ ] Full suite green: `node --test prototype/tests/*.test.mjs` and every `prototype/tests/test_*.py`.
- [ ] CHANGELOG: the "30 % bigger" line is gone, one new `Changed` line describes the real-size car and closer cameras.
- [ ] `test-todo.md` has a playtest section for #69.

## Out of scope

- An OBB collision for the long car body (#6).
- A new, smaller model to hit exactly 4.0 × 1.7 m.
- Retuning `drive` (only after the playtest says so, as a follow-up).
- The helicopter (#10) and other vehicles (#6). See Consequences.

## Assumptions

- **A1** [confirmed] `compact.scale` 1.0 (real size, ~4.7 × 1.9 m), decided by the user on 2026-10-03. Rejected: an in-between scale such as 1.1, and a new 4.0 m model.
- **A2** [med] Chase and near cameras move closer by the same factor (÷ 1.3), so the car keeps its on-screen size. Rejected: leaving 9 / 3.4 and 6 / 2.4. That is exactly the pre-`1df347b` view that "read like a toy car" (commit message of `1df347b`).
- **A3** [high] Wheels, `wheelR`, `collision.r`, eyes and blob keep their table values. They are model metres and scale through `VEH.scale` (`index.html:892`, `:896`, `:1018`). Rejected: editing them by hand, which would scale them twice.
- **A4** [med] `drive` stays as it is and the feel is judged in a playtest. Rejected: retuning grip/steer now. `stepCar` never reads the body size (`index.html:993-1010`), so there is no measured reason to change them.
- **A5** [med] The golden trace re-records `nitro` and `kreisel` only. Rejected: pinning the old trace by running the golden test with a 1.3 copy. The golden trace is "today's car" (`test_vehicles.py:1`), and today's car changes on purpose.
- **A6** [med] CHANGELOG: drop the unreleased "30 % bigger" line and add one line for the real-size car and closer cameras. Rejected: keeping both lines. Next to each other they cancel out and confuse a player reading the release.
- **A7** [high] A read-only `__mm.carSize()` hook measures the body for the test. Rejected: asserting only on `scale`, which would not prove that the car fits a bay.

## Consequences

- **Tractor and bus (#6, spec on `main`, not dispatched)**: #6 keeps the compact at 1.3 (its A10) and adds `collision.bounce: 1.25`. Both edit the `compact` entry and `test_vehicles.py`. **Order: #69 first.** #69 is small and has no dependency. #6 then rebases: its "compact gains only `bounce`" AC still holds (scale is already 1.0), its `bounce` test value 2.074 is the same at 1.0 (2.0738 measured), and its golden trace is the one #69 leaves. #6's consequence "until #69 lands, the 1.3× compact is longer than the tractor" goes away. If #6 goes first instead, #69 keeps `bounce: 1.25` in the entry and applies its test edits on top of #6's rewritten `test_set_vehicle_validates_and_round_trips`. That also works, with more conflicts.
- **Look back (#65, merged)**: the closer chase/near values apply when looking back too. The rear-bumper eye (mirrored `2.35`) stays just behind the bumper (−2.33 m). `test_look_back.py` expectations change to the × 1.0 eyes.
- **Helicopter (#10, PR #84 open)**: own camera, does not use `VEHICLES` or the golden trace. Only `CHANGELOG.md` and `test-todo.md` may conflict textually.
- **Night driving (#2, spec on `main`)**: `stepNight` copies `car.scale` onto the light group, so the headlight cones and spot distances shrink by 1/1.3 with the car. The night playtest should check the beam reach.
- **Engine/horn sound (#14, spec on `main`)**: edits the `sound` field of the same `compact` entry; textual conflict only.
- **Car parks (#40, closed)**: the car now fits the 2.5 × 5.0 m bays it was drawn for. A parallel bay is 6.0 m long.
- Narrow gaps (between lamps and walls, at the Holzbrücke rails) are now passable 0.39 m earlier on each side. Bridge-rail scraping happens closer to the rail.
- The world looks 30 % bigger around the car, which was the original "toy car" concern. The closer chase camera counters it. The playtest decides.
- The blob shadow shrinks with the body: 5.2 × 2.9 m ellipse instead of 6.8 × 3.7 m.
- Smoke tests on the OSM world that drive into obstacles may shift slightly with the smaller circle; the full-suite run catches it.
