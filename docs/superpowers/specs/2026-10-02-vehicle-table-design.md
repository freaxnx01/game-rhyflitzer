# Vehicle table — design

Status: approved in chat 2026-10-02 · Issue #5

## Goal

Turn the single hard-coded car in `prototype/index.html` into a **vehicle table**, so further vehicles are data, not code. Today's car becomes the first entry, `compact`, and drives **exactly** as before: same numbers, same mesh, same cameras, same sounds. Nothing changes for the player.

Success looks like:

- A `VEHICLES` table holds every per-vehicle number that today lives as a literal in the car mesh, `stepCar`, `collide`, the cameras, the sound engine and the HUD gear display.
- The active vehicle drives the game; a `setVehicle(def)` call swaps it at runtime and rebuilds the car.
- A golden-trace test, recorded on unchanged `main`, proves the refactor is bit-for-bit neutral (tolerance 1e-6).
- A second set of tests proves the table is really read: change a value in a copy of `compact`, and the game behaves differently in exactly that way.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Where | One `VEHICLES` object in `prototype/index.html`, next to the car mesh. | The prototype is one buildless file; a second file or loader is not needed for one entry. |
| Entry | One entry `compact` = today's car, copied 1:1. | "Must drive exactly as before." |
| Units | Physical units, exactly today's constants (m, m/s, m/s², rad/s, Hz, km/h). | No normalised 0–1 "stats" layer to keep in sync; the Car Select mockup's bars can be derived later (#7). |
| Model | `model: 'compact'` = id of a procedural builder function (today's mesh code moved into it); `scale: 1.3`; `wheels: [[1.38, 0.86], [-1.38, 0.86]]` (each mirrored to ±z); `wheelR: 0.34`. A `gltf` field is reserved (`null`) but **not implemented**. | Keeps the mesh code where it is and makes the next vehicle a new builder or, later, a glTF file. |
| Drive | `drive: { top: 60, topNitro: 90, accel: 16, accelNitro: 34, brake: 24, reverse: 8, reverseMax: 14, grip: 9, gripHandbrake: 1.8, steerRate: 2.6, airSteer: 0.4 }` (each value verified against `stepCar`). | These are the per-car numbers in `stepCar`. |
| World constants | Gravity (22 / 9.81 on slopes), water drag, air/rolling drag (0.12, 0.6), slope sampling, stop threshold, steering speed curve, handbrake extra yaw (1.2) stay literals in `stepCar`. | They describe the world or the arcade feel, not a vehicle. |
| Mass | `mass: 1.0`, used **only** in the collision response: the speed-loss fraction and the damage gain are divided by `mass`. | 1.0 is identical to today; heavier vehicles lose less speed and take less damage. It is not used for acceleration (that is `accel`). |
| Collision | `collision: { shape: 'circle', r: 1.3 }` in model units; radius used = `r * scale` = 1.69 as today. Any other shape throws an `Error` that mentions `#6`. | OBB for long vehicles (bus) is #6; failing loudly beats a silent wrong shape. |
| Camera | `camera: { chase: { dist: 9, h: 3.4 }, near: { dist: 6, h: 2.4 }, cockpit: { eye: [-0.25, 1.22, -0.38] }, bumper: { eye: [2.35, 0.55, 0] } }`. Eyes are scaled by `scale` (as today); chase distances are not (as today). | Same behaviour as `CAM_VIEWS` today; `CAM_VIEWS` keeps only names and order. |
| Sound | `sound: { horn: [420, 528], hornDur: 0.45, engineBase: 55, enginePerRpm: 150, gears: [0, 20, 45, 75, 110, 150, 999] }`. The HUD's duplicated gear table reads `gears` from the vehicle too. | Both sounds are already synthesized; the gear table was duplicated in `SFX.update` and `hud()`. |
| Active vehicle | A module-level `let VEH` (the active vehicle); `stepCar`, `collide`, cameras, `SFX` and the HUD read from it. `setVehicle(def)` validates `def`, swaps `VEH` and rebuilds the car group. | **Naming deviation from the chat (`V`):** `V` is already taken in `prototype/index.html` (`const V = (px, py) => …`, the Sisseln screenshot → world converter, ~L202). `VEH` avoids the clash. |
| Test hooks | `window.__mm.vehicles()` (deep copy of the table), `window.__mm.setVehicle(def)`, `window.__mm.cam()` (camera position relative to the car, plus the view index). | Tests change a *copy* of `compact` and observe behaviour, not internals. |
| Changelog | **No `CHANGELOG.md` entry.** The change is invisible to players, and the repo's changelog is player-facing prose. | Stack overlay: entries say what changed *in the game*; nothing did. |

## Out of scope

- A vehicle picker / Car Select screen (#7).
- OBB collision for long vehicles (#6) — only the guard that throws.
- glTF loading — the `gltf` field is reserved, nothing reads it.
- Wheel animation (spinning, steering wheels).
- A second vehicle entry.
- Any change to the crashcat ball-car spike (TODO.md); the table is shaped so it can feed it later.

## Tests

1. **Golden trace (first, before any refactor):** a Playwright smoke test in the hand-traced layout (world and terrain files blocked, so it needs no data and runs everywhere) records `window.__mm.sim()` results — `x`, `z`, `speed` — for gas, nitro, steering, handbrake turn, coasting, brake-into-reverse and a crash into the Smile-Kreisel island. Expected numbers are captured on unchanged `main` and hard-coded; tolerance 1e-6. It passes on `main` before the refactor and after every task.
2. **Table proof:** `setVehicle` with a modified copy of `compact`:
   - `drive.top = 30` → gas for 4 s ends clearly slower (between 18 and 24 m/s, compact: 31.47).
   - `scale = 2` → a standing car next to the island is pushed out to 9.5 + 2.6 = 12.1 m (compact stays at 11.8 m).
   - `camera.cockpit.eye` moved → the cockpit camera sits at the new, scaled eye.
   - `mass = 2` → the same crash leaves clearly more speed than with mass 1.
   - `sound.gears` changed → the HUD gear display follows it.
   - `collision.shape = 'obb'` → `setVehicle` throws with `#6` in the message, and the active vehicle is unchanged.
3. All existing smoke tests stay unchanged and green.

## Acceptance criteria

- [ ] `VEHICLES.compact` exists in `prototype/index.html` with exactly the fields and values listed under Decisions.
- [ ] `stepCar`, `collide`, `stepCamera`, `SFX.update`, `SFX.horn` and `hud()` contain no per-vehicle literal any more; they read the active vehicle `VEH`.
- [ ] `CAR_SCALE` is gone; the car mesh is built by the `compact` builder through `buildCar()`; the shadow blob follows `VEH.scale`.
- [ ] `setVehicle(def)` validates first (unknown model or non-circle collision throws; the OBB message mentions `#6`), then swaps `VEH` and rebuilds the car.
- [ ] `window.__mm.vehicles()`, `window.__mm.setVehicle(def)` and `window.__mm.cam()` exist.
- [ ] The golden-trace test was added before the refactor, passed on unchanged `main`, and passes after (tolerance 1e-6).
- [ ] The table-proof tests (top speed, collision radius, cockpit eye, mass, gear table, OBB guard) pass.
- [ ] All existing smoke tests pass unchanged.
- [ ] Manual playtest: the car looks, drives, sounds and is filmed as before in all four camera views; no console errors.
- [ ] No `CHANGELOG.md` entry (player-invisible change).
- [ ] No new files except the test file; no framework, no build step.
