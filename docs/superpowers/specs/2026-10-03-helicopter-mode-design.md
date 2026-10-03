# Helicopter mode for an overview — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #10

## Goal

From the playtest on 2026-10-01 (and again on 2026-10-03 as „Schwebemodus"): fly over the region in a helicopter to get an overview.

Success: during a game, **F** lifts off from where the car is. A small helicopter climbs to about 120 m above the ground, seen from a chase camera behind and above it. **W/S** fly forwards and backwards, **A/D** turn, **Space** climbs, **Shift** sinks. It never hits anything: terrain, houses and landmarks push it up. The minimap, compass, speedometer, road name and village names follow the helicopter. **F** again lands: the car is put on the nearest drivable road below, pointing along it. During a race the timer keeps running, checkpoints are not collected from the air, and the run is marked „with the helicopter, not counted".

## Starting point (verified 2026-10-03 on `main` @ `e9b20ac`)

- **Vehicle table (#5, merged):** `VEHICLES` / `VEH` / `setVehicle` (`prototype/index.html:830-871`). `checkVehicle` (`index.html:868`) only accepts procedural models in `MODELS` with `collision.shape === 'circle'`. `VEH.drive` is wheel physics (`grip`, `steerRate`, `reverse`, …) read by `stepCar` (`index.html:964-981`). #6 (tractor, bus) and #7 (selection screen) are open and are about road vehicles.
- **Position state:** `P` (`index.html:917`) holds `x, z, y, th, vx, vz, vy`; the minimap (`drawMap`, `index.html:1070`), compass (`bearing`, `index.html:1072`), HUD road / water names, labels, village names and the debug panel all read `P`. `stepCar` writes `car`, `blob`, `flames` (`index.html:978-980`).
- **Cameras:** `CAM_VIEWS` (chase, near, cockpit, bumper), `cycleCamera` on **C** (`index.html:988-991`), `stepCamera` (`index.html:992-996`) sets `car.visible = !v.eye && !HUD.carHidden` every frame.
- **Race:** `R` (`index.html:999`). `stepRace` (`index.html:1006`) starts the timer when the car moves (`armed` → `racing`) and collects checkpoints / the finish by 2D distance `< 7` — it ignores height. Jumps set `R.jumped` (`placeOnRoad`, `index.html:922`), **Tab** sets `R.fast` (`index.html:889`, `1104`); `finish` (`index.html:1007`) does not record a best time if either is set, and `resultHtml` (`index.html:1008`) explains why.
- **Placement:** `jumpTo(p)` (`index.html:923`) finds the nearest point on a jumpable road (no bridge, no motorway) and calls `placeOnRoad` → `resetCar` (`index.html:925`). **R**, **J**, the map double-click and `startRace` all end in `resetCar`.
- **Obstacles:** `OBB_GRID` holds every building / landmark box with `h` = absolute top height (`addOBB(x, z, w, d, rot, b + h)`, `index.html:460-551`); bridge rails carry `bridge: true`.
- **View distance:** camera far plane 4200 m (`index.html:803`); fog: original style linear 320–1400 m, smooth style `FogExp2(0.00095)` (`index.html:875-877`).
- **Keys** (`index.html:889`, specs): T, C, R, H, Enter, M, F1, `?`, Esc, F3, Tab, V, G, K, Q, E, `+`, `=`, `-`, J, N; driving W A S D, arrows, Space, Ctrl. **B** is claimed by #65 (#24). **F** and **Shift** are free.
- **Tests:** node `prototype/tests/*.test.mjs` for pure modules; pytest + Playwright `prototype/tests/test_*.py`, hand layout via `open_hand` (world and terrain blocked). `test_vehicles.py` has a golden trace of `stepCar` that must never change.
- **i18n (#9, merged):** UI strings through `tr()` from `prototype/strings.js` (en and de, same keys, Swiss spelling).

## Decisions

| Topic | Decision |
|---|---|
| What it is | Its own **flight mode**, toggled on top of whatever car is active — not a `VEHICLES` row and not a camera view. State `FLY = { on, v, alt }`; while `FLY.on`, the loop runs `stepFly` instead of `stepCar`. |
| Position | The helicopter **is** `P` while flying (`P.x/z/y/th`, `P.vx/vz` from its speed), so minimap, compass, speedometer, road and village names, labels and debug follow without changes. |
| Flight model | New pure module `prototype/heli.js` (no three.js, no DOM), unit-tested with `node --test`: `HELI` constants, `heliInput(keys, touch)`, `heliFloor(ground, boxes, x, z)`, `heliStart(x, z, y, th, ground)`, `stepHeli(s, input, dt, ground, floor)`. |
| Key | **F** (fly) toggles take-off / landing, only with the start overlay hidden (like C and J). |
| Controls | W / ↑ forward (up to 40 m/s = 144 km/h), S / ↓ brake and slowly back (10 m/s), A / D / ← → yaw at 1.2 rad/s (D = heading grows, like steering), Space climbs and Shift (left or right) sinks at 15 m/s. Speed changes at 12 m/s². No key held: it slows to a hover in place. Touch: ▲ ▼ ‹ › map to forward / back / yaw; no altitude control and no take-off button on touch. |
| Altitude | Take-off target: ground + 120 m. The target altitude `alt` stays between the **floor** and ground + 400 m; the drawn height `y` follows `alt` smoothly (`1 - exp(-2 dt)`), never below the floor. |
| Collision | None. The floor = max(ground, top `h` of every non-bridge box in `OBB_GRID` within 4 m of the rotor) + 10 m clearance: the helicopter rides up over terrain, houses and landmarks. No damage, no crash, water is ignored. |
| Model & camera | A small procedural helicopter (yellow body, dark rotor, skids; no operator livery). While flying the car, its shadow blob and the nitro flames are hidden. One fixed heli chase cam, 35 m behind and 22 m above, looking ahead and down. **C** does nothing while flying. |
| Landing | **F** again: the car goes to the nearest jumpable road under the helicopter, heading along it (`nearestJumpable`, split out of `jumpTo`). This is not a jump (`R.jumped` untouched). **R**, **J** and the map double-click while flying end the flight too (they all call `resetCar`, which now clears `FLY.on`); those are jumps as before. |
| Race | Flying is allowed in a race. The timer keeps running. No checkpoint, finish or Holzbrücke shortcut is collected while `FLY.on`. Take-off during `armed` / `racing` sets `R.flown`; `finish` records no best time with it, and the result says „with the helicopter, not counted". `startRace` clears `R.flown`. |
| View distance | Far plane and fog unchanged. |
| Strings | New keys in `strings.js` (en / de): `keyHeli` (F1 help line), `heliOn` (take-off toast), `heliLanded` (landing toast), `notCountedHeli` (result). |
| Test hooks | `__mm.fly()` → `{ on, x, y, z, th, v, alt, ground, heliVisible, carVisible }`; `__mm.flySim(secs, hold)` steps `stepFly(1/60)` with keys held (like `__mm.sim`); `__mm.raceFlags()` gains `flown`. |

## Assumptions

- **A1** [med] A flight mode of its own on top of the active car, not a vehicle and not a camera view. Rejected: a `VEHICLES` row — `checkVehicle` (`index.html:868`) only allows circle-collision procedural car models, and `stepCar` (`index.html:964-981`) is ground physics with grip, slopes and water; a heli row would need a second physics path anyway and would show up in #7's car picker. Rejected: a pure free camera — the issue asks for a helicopter, and the HUD / minimap need a moving position (`P`) to show where you are.
- **A2** [med] Key **F** (fly). Rejected: H (horn, `index.html:889`), B (claimed by #65). Free letters were F, I, L, O, P, U, X, Y, Z.
- **A3** [med] Space climbs and Shift sinks in flight; W/S/A/D/arrows keep their driving meaning (forward / back / turn). Rejected: Q/E for altitude (turn signals, `index.html:889`), PageUp/PageDown (far from WASD). Touch gets forward / back / yaw only and no take-off button — **J**, **G** and **F3** are keyboard-only too.
- **A4** [med] Take-off to 120 m, ceiling ground + 400 m, 40 m/s top speed, 15 m/s climb, 1.2 rad/s yaw. Rejected: a fixed altitude (no overview choice). 400 m keeps the ground inside the fog end (1400 m) when looking down at a slant.
- **A5** [med] No collision and no damage; the floor rule lifts it over obstacles. Rejected: crashing into buildings / landmarks — an overview tool should not end in a reset. Trees and floating village names have no boxes and are flown through.
- **A6** [med] In a race: timer runs on, nothing is collected from the air, a run with a flight is not counted. Rejected: blocking F during a race; pausing the timer. Evidence: the house rule for every shortcut is „allowed, but not counted" — jumps (`R.jumped`, `index.html:922`) and Tab (`R.fast`, `index.html:889`).
- **A7** [med] Landing puts the car on the nearest jumpable road below, like J, but does not count as a jump (a flight already marks the run). Rejected: the car waiting where it took off (no reason to fly then); a free touchdown anywhere (roofs, water, motorway).
- **A8** [med] One fixed heli chase camera, C inactive while flying; a simple procedural helicopter model. Rejected: cycling the four car views (cockpit / bumper eyes are car-model metres); a top-down view (YAGNI for now — a follow-up can add it).
- **A9** [high] Far plane and fog stay as they are (`index.html:803`, `875-877`).
- **A10** [high] New UI text goes through `tr()` with en and de entries (`strings.test.mjs` enforces equal keys and no `ß`).

## Consequences

- From 120 m up, the original style's fog (end 1400 m) limits the overview to about 1.4 km around the helicopter; the smooth style's exponential fog is similar.
- The engine sound and the speedometer follow the helicopter's speed: it sounds like the car. A rotor sound is a follow-up.
- The trip odometer and total kilometres do not grow while flying (`stepCar` counts them).
- The HUD road name shows the road under the helicopter; house-number labels (60 m around `P`) are out of sight from the air.
- With Tab held, flight runs at ×3 too (the loop steps it like the car) and marks the run as time-lapse as before.
- The sun shadow box (±180 m around `P`) follows the helicopter; in the smooth style the car's spot loses shadows while you are away.
- **R** while flying ends the flight and puts the car back at its last safe spot (where it was before take-off or a later landing).
- Touch-only players cannot reach the mode.

## Out of scope

Rotor sound, a top-down camera, touch take-off / altitude buttons, a heli entry in #7's selection screen, fog / far-plane changes for altitude, landing on roofs or helipads.
