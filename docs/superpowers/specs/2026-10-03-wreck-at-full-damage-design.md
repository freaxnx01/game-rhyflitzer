# Wreck at 100 % damage — design

Status: headless enrichment 2026-10-03 (quick mode, assumptions below) · Issue #105 · shares `prototype/impact.js` with #104 (crash sound)

## Goal

„Bei 100 % Schaden sollen wie bei MM die Räder abfallen, Rauch aus dem Motor aufsteigen, und kurz darauf soll ein neues Auto spawnen." (Midtown Madness homage.)

The game already has a damage value (`P.dmg`, 0..1) and a bar in the HUD, but nothing happens at 100 %. This issue makes damage mean something, in a **simple damage model** (user decision 2026-10-03):

- Damage rises with **impact strength**. Buildings, lamps and other solid props count, so do bridge rails; water does not (it keeps its own reset).
- The HUD shows the damage (bar plus percentage).
- At 100 %: the **wheels fall off**, **smoke rises from the engine**, and after about **3 s** a **new car spawns at the last road position**.
- In a race the **run keeps counting**: the timer runs on.

Success: driving into a wall at 15 m/s costs about 16 %; seven such hits wreck the car; the four wheels roll away, the engine smokes, the car can no longer be driven, and 3 s later a repaired car stands on the last road position.

## Context (what the code does today, `main` @ `f6d6a6b`+)

- `P.dmg` exists (`prototype/index.html:1007`), is drawn as `#dmg > i` width (`index.html:159`, `:1237`) and reset by `startRace` (`:1119`). It is **never reset by `resetCar`** (R, J, water) and does nothing at 1.0.
- Wall hits: `collide(r)` (`:1071`) tests the car circle against `OBB_GRID` obstacles (buildings, bridge rails, lamps and hydrants through `PROP_SOLID` `:676`/`:720`, landmarks). On `vn < 0` it bounces, loses speed (unchanged here), and **adds damage every physics step the contact lasts**: `min(0.12, -vn * 0.004 / VEH.mass)`, plus `SFX.crash` when `vn < -3`. So a car pressed against a wall keeps taking damage, and a scrape costs something.
- Landings: `stepCar` (`:1084`): `P.vy < -9` adds 0.05 and plays `SFX.crash(0.5)`.
- Water: `stepCar` (`:1083`) sets `P.splash`, slows the car and calls `resetCar()` after 2.8 s. No damage, and none is added.
- `resetCar` (`:1018`) puts the car on `P.safe` (the last road position, updated while driving on a road, `:1084`) and ends a flight.
- Helicopter (#10, merged): `stepCar` is not called while `FLY.on` (`:1242`), so a flying car takes no damage by construction. `collide` is not reached.
- Pause (#83, merged): the loop returns before any stepping while `PAUSE.on` (`:1242`).
- Vehicles (#5): `VEHICLES.compact` carries `mass` (used as divisor of speed loss and damage), `wheels: [[x, z], …]` mirrored to ±z, `wheelR`, `scale` (1.3). `buildCompact` (`:922`) builds each wheel as a `THREE.Group` and adds it to the car group; nothing keeps a handle to it.
- The car group is rebuilt by `buildCar` (`:944`, through `setVehicle`); `freeCar` disposes its geometry.
- `#104` (crash sound, enriched, `docs/superpowers/specs/2026-10-03-crash-sound-design.md`) defines `impactStrength(speed) = clamp01((speed - 3) / 22)` in `prototype/impact.js` and states that this issue must use it. Not on `main` yet at the time of writing.
- Test setup: `node --test prototype/tests/*.test.mjs` for pure modules, pytest + Playwright (`open_hand`, `window.__mm.sim`) for the browser.

## Decisions

| Topic | Decision |
|---|---|
| Impact strength | **Not redefined.** Imported from `prototype/impact.js`: `impactStrength(speed)` = 0 up to 3 m/s of closing speed along the contact normal, linear to 1 at 25 m/s. `speed` is `-vn` for a wall and `-vy` for a landing. See „Landing order with #104" below. |
| Damage per hit | New pure module `prototype/wreck.js`: `impactDamage(s, mass) = s * 0.3 / mass`. 10 m/s costs 9 %, 15 m/s 16 %, 25 m/s or faster 30 %; the compact is wrecked by 4 full-speed hits or 7 hits at 15 m/s (54 km/h). |
| Scraping | **Free.** A hit with strength 0 (closing speed ≤ 3 m/s, about 11 km/h) costs nothing: the same threshold at which the crash sound starts. Sliding along a wall has a small normal component and stays under it. |
| One hit, one charge | Damage is charged **once per contact step from the closing speed before the bounce**, and the bounce itself removes the closing speed, so a car held against a wall pays once, not every frame. (Today: every step.) The speed-loss maths in `collide` is untouched, so `test_table_mass_softens_the_crash` still holds. |
| What counts | Everything in `OBB_GRID` that `collide` handles: buildings, bridge rails, lamps and hydrants (`PROP_SOLID`), landmarks. Not trees (no collision today), not water, not the ground. |
| Landings | A fall faster than 9 m/s (`vy < -9`, unchanged threshold) now charges `impactDamage(impactStrength(-vy), mass)` instead of the flat 5 % (-9.1 m/s: 8 %, -20 m/s: 23 %). Sprungschanze jumps are therefore costlier. |
| Mass | Heavier vehicles take less damage, through the existing `/ VEH.mass` (tractor 2.5, bus 8 from #6): at 15 m/s the bus loses 2 % per hit and is practically unwreckable. That is intended (a bus plows through). |
| Helicopter | No damage while flying (`stepCar` is not called). `F` is ignored during a wreck. |
| Wreck trigger | `hurt(amount)` adds to `P.dmg` (capped at 1). When `P.dmg` reaches 1 and no wreck is running, `startWreck()` runs. Further hits during a wreck do nothing. |
| Wreck: car | Controls are dead (gas, brake, steer, handbrake, nitro read as released; horn still works) and the car coasts to a stop with an extra drag (`coast` 2.5 /s). The engine sound goes silent. A one-off `SFX.crash(1)` and the centre toast „Total loss!" / „Totalschaden!" (`tr('wrecked')`, game-event duration). |
| Wreck: wheels | The car's wheel groups are registered by the model builder (`car.userData.wheels = [{ obj, lx, lz, r, home }]`) and re-parented to the scene at their world transform. Each is a small rigid body: `detachWheels` gives it the car's velocity plus an outward and upward kick (right wheels go right), `stepDebris` applies gravity 22 m/s², bounce 0.4, rolling drag, and lets it lie still below 0.3 m/s. Ground height from `groundH(x, z, y)`. No physics engine, no wheel–wall collision (a wheel may roll through a house). Wheels stay where they lie until the new car spawns, then are re-attached to the new car. |
| Wreck: smoke | A pool of 24 `THREE.Sprite`s, one shared 64 px radial-gradient texture, one `SpriteMaterial` each (for per-puff opacity), created once at start and hidden. While wrecked, 10 puffs/s are emitted at the engine point (`VEH.engine`, model metres, default `[collision.r, 1, 0]`; compact `[1.5, 1.05, 0]`), rise 1.6 m/s, grow from 1 to 4 m and fade over 2.4 s (`smokeAt`). At most 24 live puffs = 10/s × 2.4 s: no allocation after startup. Puffs live in world space, so they trail behind a moving wreck, and finish fading after the new car spawns. |
| New car | After `delay` = 3 s `stepWreck` calls `resetCar()` and toasts „New car!" / „Neues Auto!". `resetCar` (when a wreck is on) re-attaches the wheels, sets `P.dmg = 0` and ends the wreck. The position is `P.safe` — the last road position, the same spot `R` uses. |
| Damage reset | `P.dmg` returns to 0 on: a new car after a wreck, `startRace` (as today). **Not** on `R`, `J`, the map click or the water reset: those stay free repositioning without a free repair (as today). **Exception:** during a wreck `R`, `J`, the map click, `F`-landing and Start end the wreck at once, with the new car at the place they ask for. |
| Race | Unchanged: `stepRace` runs, `R.t` keeps counting, checkpoints still register if the rolling wreck rolls through one. The respawn is not a „jump" (`R.jumped` stays false): the wreck costs the 3 s and the distance back to the last road position, nothing more. |
| HUD | The existing `#dmg` bar gets a percentage `<b id="dmgpct">` next to the „Damage" label (`Intl.NumberFormat(navigator.language, { style: 'percent' })`) and `role="meter"` with `aria-valuenow`; from 75 % the bar turns red (`#dmg.crit`). Updated only when the rounded value changes. No new string for the label (exists: `damage`). |
| Strings | `wrecked` (en „Total loss!", de „Totalschaden!"), `newCar` (en „New car!", de „Neues Auto!") in `prototype/strings.js` through `tr()`. |
| Pause (#83) | `stepWreck` runs inside the unpaused loop branch, so the countdown, the wheels and the smoke all freeze while paused and continue on resume. |
| Autopilot (#18) | Not on `main`. The wreck's input lock (all keys and touch read as released) already stops a driving autopilot from steering. `startWreck` is the one place #18 hooks `autopilot.stop()`; whichever of #18 and #105 lands second wires it (note in the plan). |
| Footprint collision (#36) | Not on `main`. #36 replaces the building rectangles by their rings inside `collide`. The one rule it must keep: it computes `strength = impactStrength(-vn)` **before** the bounce and calls `hurt(impactDamage(strength, VEH.mass))`; the plan puts both behind a tiny helper `crashHit(strength)` so #36 changes only how `vn` and the normal are found. |
| Car size (#69) | Wheel start positions and the debris radius are scaled by `VEH.scale`, so the wreck looks right at 1.0 and at 1.3. Collision radius and damage values are untouched. |
| Test hooks | `__mm.damage()` → `{ dmg, wrecked, t, wheelsOff, smoke, wheels: [{ x, y, z }], safe }`, `__mm.setDamage(d)` (goes through `hurt`, so 1 starts a wreck), `__mm.wreckSim(secs)` (steps `stepWreck` at 60 Hz). |

### Landing order with #104

Both issues use `prototype/impact.js`, and neither is on `main` yet. **#104 owns the file** (it adds `crashVoice`, `crashGate`, `checkCrash`, `playCrash`); #105 only imports `impactStrength` (and `CRASH_MIN`/`CRASH_FULL` through it).

- If **#104 lands first**: #105 imports from the existing file and adds nothing to it.
- If **#105 lands first**: its first task creates `impact.js` with exactly the three lines of #104's definition (the constants and `impactStrength`, tested in `impact.test.mjs`); #104 then rebases and adds its functions to that file. Either way there is one definition, and no copy in `wreck.js`.
- Both edit the same two lines of `collide` and the landing line in `stepCar`. #104 replaces `SFX.crash(Math.min(1, -vn / 25))` by `SFX.crash(strength)` and the landing `SFX.crash(0.5)` by `SFX.crash(impactStrength(-P.vy))`; #105 replaces the damage lines. The plan writes the combined result (`crashHit`), so the second to land resolves a small conflict by keeping both effects.
- #104 changes no damage line (its spec says so); #105 changes no sound line except calling `crashHit`.

## Out of scope

- A car that drives worse with damage (no handling, speed or steering penalty before 100 %): the model is deliberately simple. Smoke already at 70 % or a cracked windscreen: park as ideas.
- Wheel–wall collision, wheels as obstacles, the body flipping or crumpling, a wreck model, scorch marks.
- Sound of the wheels bouncing or of the smoke (the crash sound is #104).
- Repair pickups, a repair key, a damage limit in races, a time penalty for a wreck.

## Acceptance criteria

- [ ] `impact.js` exports `impactStrength` (0 up to 3 m/s, 1 from 25 m/s) as the only definition; `wreck.js` imports it and defines no second formula.
- [ ] A hit at 15 m/s into a wall adds about 16 % damage; a closing speed of 3 m/s or less adds nothing; a car held against a wall is charged once.
- [ ] Buildings, bridge rails, lamps and hydrants all hurt; entering water does not, and still resets after 2.8 s.
- [ ] The HUD shows the damage as bar and percentage; the bar is red from 75 %.
- [ ] At 100 % all four wheels leave the car, roll and bounce under gravity and come to rest on the ground (never below it); smoke rises from the engine; the car cannot be driven and the engine is silent.
- [ ] 3 s after the wreck a car with 0 % damage and all wheels stands at the last road position and can be driven; the debris is gone; `R.t` ran on the whole time and the run was not marked as jumped.
- [ ] `R`, `J`, a map click and `Start` during a wreck skip the wait; `F` is ignored during a wreck; no damage while flying.
- [ ] A wreck freezes while paused (wheels, smoke, countdown).
- [ ] A heavier vehicle (`mass` 8) takes proportionally less damage; wheels follow `wheels`/`scale` of the vehicle table.
- [ ] No per-frame allocation by the smoke (pool of 24 sprites created once); GPU memory stays flat across a wreck and a respawn (`test_rebuilds_free_gpu_memory`'s counters).
- [ ] `strings.test.mjs` passes with `wrecked` and `newCar` in both languages; `node --test prototype/tests/*.test.mjs` and the Playwright suite are green.

## Assumptions

- **A1** [high] [confirmed] A **simple damage model**: damage rises with impact strength; buildings, lamps and solid props count, water does not (keeps its own reset). Rejected: handling loss, part-by-part damage.
- **A2** [high] [confirmed] A damage indicator in the HUD. Evidence: the bar `#dmg` exists (`index.html:159`, `:1237`); this adds a percentage and a red state.
- **A3** [high] [confirmed] At 100 %: wheels fall off, smoke rises from the engine, after about 3 s a new car spawns at the last road position.
- **A4** [high] [confirmed] In a race the run keeps counting; the timer runs on.
- **A5** [high] Impact strength comes from `impactStrength` in `impact.js`, as #104's spec requires; no second definition. Evidence: `docs/superpowers/specs/2026-10-03-crash-sound-design.md`, „Impact strength — defined once".
- **A6** [med] Damage = strength × 0.3 / mass. Rejected: the current `min(0.12, -vn * 0.004 / mass)` per step (charged every frame of a contact, `index.html:1071`; a car pushed against a wall dies of it). Numbers are a starting point: 7 hits at 54 km/h feel like „a few good crashes"; tuning is one constant (`WRECK.perHit`), the manual playtest is the gate.
- **A7** [med] Hits at or below 3 m/s are free (silent and harmless alike). Rejected: a small damage for every touch (today's behaviour). #104's spec leaves this to #105.
- **A8** [med] Landings use the same strength mapping from `-vy` above the existing 9 m/s threshold, which makes a bad Sprungschanze landing noticeably costlier (23 % at 20 m/s instead of 5 %). Rejected: keep the flat 5 % (a second formula).
- **A9** [med] `R`, `J` and the water reset do not repair. Rejected: R as a free repair (it would make damage meaningless) and the water reset repairing (it would turn the river into a repair shop). A wreck always ends with a repaired car.
- **A10** [med] Wheels are plain rigid bodies without collision against buildings or the car. Rejected: using `OBB_GRID` for the wheels (cost and complexity for something that lies still after 4 s).
- **A11** [med] Smoke as a 24-sprite pool, only while wrecked. Rejected: THREE.Points with a custom shader (more code), a per-frame spawned mesh (allocation), smoke already at high damage (not asked for; idea).
- **A12** [med] Controls are dead for the whole 3 s, the engine goes silent, the car coasts with extra drag. Rejected: steering still working (a wreck should not drive on), an instant freeze (reads as a bug).
- **A13** [med] Respawn position = `P.safe`, exactly what `R` does. Rejected: the wreck spot (it may sit in a building or in the river) and a checkpoint-based respawn.
- **A14** [med] `F` is ignored during a wreck. Rejected: letting the helicopter take off from a wreck (the wheels are left behind mid-air).
- **A15** [med] The vehicle table gets `engine: [x, y, z]` for the smoke point; a vehicle without it falls back to `[collision.r, 1, 0]`, so #6's entries need no change to keep working. Rejected: requiring it in `checkVehicle` (it would break #6 when merged second).
- **A16** [high] Heavier vehicles take less damage through the existing `mass` divisor. Evidence: `index.html:1071`; `VEHICLES.compact.mass` comment `:908`.
- **A17** [high] New text goes through `tr()` with en and de, Swiss spelling (no `ß`). Evidence: `strings.test.mjs`.

## Consequences

- Scraping and slow bumps no longer cost anything (today they do, slightly).
- The Sprungschanze and the Fridolinsbrücke launch ends can wreck a careless car; that is new.
- The bus (mass 8) and, to a lesser degree, the tractor (2.5) are very hard to wreck; the wreck is mostly a compact thing until the masses are tuned.
- A wreck in a race costs the 3 s, the way back from the last road position and the lost speed; the timer keeps running and no record is blocked.
- Smoke is unlit (sprites): at night (#2) it stays grey instead of dark. Acceptable for a few seconds.
- The respawned car faces the heading of the last road position, which can be backwards against the race direction.
- A wheel may roll into or through a house and rest inside it; it vanishes with the respawn.
- `startWreck` becomes the hook point for #18 (autopilot stops) and #104 (crash sound level 1).
