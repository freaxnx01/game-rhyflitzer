# Crash sound scaled by impact strength — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #104

## Goal

„Bei einem Crash soll ein Sound abgespielt werden." Success: a hit on a wall, house or bridge rail, or a hard landing, plays a **synthesized crash** — a noise burst plus a low thump — that is quiet and short for a bump and loud, long and deep for a full-speed hit. Scraping along a wall stays silent, and a car pressed against a wall does not machine-gun. A heavier vehicle (the bus, #6) sounds heavier through its preset. No samples.

## Starting point (verified 2026-10-03 on `main` @ `f6d6a6b`)

- **A crash sound already exists, but is a stub.** `SFX.crash(v)` (`prototype/index.html:996`) is one 0.18 s lowpassed (320 Hz) noise burst at gain `0.5 v + 0.15`, linear fade — a dull tick, no body. `burst()` (`index.html:985`) builds it.
- **Wall hits:** `collide(r)` (`index.html:1071`) computes `vn` = velocity along the wall normal (negative = into the wall). On `vn < 0` it bounces (`vx -= wx * vn * 1.25`), loses speed, adds damage `min(0.12, -vn * 0.004 / VEH.mass)`, and `if (vn < -3) SFX.crash(Math.min(1, -vn / 25))`. So **3 m/s into the wall is the existing "crash" threshold**; scraping has a small `vn`.
- **Landings:** `stepCar` (`index.html:1084`): `P.vy < -9` adds 0.05 damage and calls `SFX.crash(0.5)` (fixed strength).
- **Water entry:** `SFX.splash()` (`index.html:997`), triggered when `P.splash === 0` (`index.html:1083`) — separate, untouched.
- **Called every frame:** `collide` runs each physics step, so a car held against a wall (`vn` just under −3 each frame after the bounce is re-applied by steering) would re-trigger the sound every frame; today nothing gates it.
- **Pause (#83, merged):** `SFX` has `held`, `suspend()`, `resume()` (`index.html:983,1002`); `burst` does not check `held`, so a crash queued while paused would play on resume. #14 replaces this with `SFX.hold(reason, on)` (`docs/superpowers/specs/2026-10-03-engine-horn-sound-design.md`, enriched, not implemented yet: `sound.js` does not exist on `main`).
- **Vehicles (#5):** `VEHICLES.compact.sound` (`index.html:915`) is validated by `checkVehicle` (`index.html:948`); `mass` already exists (`index.html:908`).
- **Tests:** `node --test prototype/tests/*.test.mjs` (pure modules, e.g. `pause.test.mjs`); pytest + Playwright with `open_hand` / `use_vehicle` (`test_vehicles.py`).

## Decisions

| Topic | Decision |
|---|---|
| Module | New pure module `prototype/impact.js`, no DOM: `impactStrength`, `crashVoice`, `crashGate`, `checkCrash` (node-tested) and `playCrash(ctx, dest, voice, when)` which builds the WebAudio graph on any `BaseAudioContext` (rendered offline in Playwright). |
| **Impact strength — defined once** | `impactStrength(speed)` with `speed` = closing speed in m/s along the contact normal (`-vn` for a wall, `-vy` for a landing). `0` below `CRASH_MIN = 3`, then linear to `1` at `CRASH_FULL = 25`: `clamp01((speed - 3) / 22)`. **This is the only definition of impact strength. #105 (damage model) must import and use `impactStrength` for its "damage rises with impact strength" rule instead of computing its own from `vn`; the sound and the damage then always agree.** #104 changes no damage line. |
| Threshold | Keep the existing `vn < -3` (about 11 km/h into the wall) as `CRASH_MIN`; below it is a bump or a scrape and silent. Scraping has a small normal component, so it stays under the threshold. |
| Gate | `crashGate(state, now, s)`: after a crash, ignore further crashes for 0.35 s unless the new strength exceeds the last by 0.25 (a second, harder hit). `now` = `AudioContext.currentTime`. Stops frame-by-frame retriggering against a wall. |
| Voice | Two layers, both scaled by strength `s`. **Noise burst:** white noise through a lowpass at `preset.noise * (0.5 + 0.5 s)`, length `(0.10 + 0.30 s) * weight` s, exponential decay. **Thump:** a sine sweeping from `1.6 * preset.thump` to `preset.thump` Hz over `(0.12 + 0.28 s) * weight` s, exponential decay. Level `preset.gain * (0.12 + 0.88 s)`; thump 0.9, noise 0.6 of that. A bump (`s` near 0) is a short quiet tick, a full hit about 0.5 s and loud. |
| Preset | `VEHICLES[].sound.crash = { weight, thump, noise, gain }`. Compact: `{ weight: 1, thump: 70, noise: 1800, gain: 1 }`. Bus (#6) adds a row, e.g. `{ weight: 1.6, thump: 45, noise: 1200, gain: 1.1 }`. `checkCrash` throws an `Error` naming the field; `checkVehicle` calls it before anything is swapped. If #14 lands first, `crash` is a sibling of its `engine` and `horn` keys and `checkSound` calls `checkCrash`; if this lands first, #14's plan keeps `crash` when it reshapes `sound`. |
| Landing | `SFX.crash(impactStrength(-P.vy))` replaces the fixed 0.5. The `vy < -9` landing threshold and its damage line stay. A landing at −9 m/s is `s = 0.27` (thud), at −20 about 0.77. |
| Water | Unchanged: `splash()` only. A car entering water at speed is not a crash. |
| Pause / mute | `SFX.crash` returns at once when muted or held (today's `held`, #14's `SFX.hold`); it never queues a sound for later. It rides on the master gain, so **M** silences it and, after #14, it goes through the master limiter. |
| Old stub | `crash(v)` and its `burst` call go; `burst` stays for `splash`. |
| Test hook | `__mm.sfxCrashes()` → `{ count, last }` (last strength and time), so a Playwright test can see a crash fire without listening. |

## Assumptions

- **A1** [high] Extend the existing `SFX.crash` and call site rather than add a new sound system: the call sites and the 3 m/s threshold already exist (`index.html:1071`, `index.html:1084`).
- **A2** [med] Threshold stays 3 m/s of normal speed; scraping is excluded by the normal component, not by an extra "tangential" rule. Rejected: a new combined speed rule — `vn` already separates a head-on hit from a graze (`index.html:1071`).
- **A3** [med] A 0.35 s cooldown with a "harder hit overrides" exception. Rejected: playing every frame, or one global once-per-contact flag (the car can bounce between two walls in a corner).
- **A4** [med] Impact strength is `clamp01((speed - 3) / 22)`, defined once in `impact.js` and shared with #105. Rejected: keeping the old `min(1, -vn / 25)`, which jumps to 0.12 right at the threshold and so makes a 3 m/s tap audible as a crash; rejected: each feature computing its own.
- **A5** [med] Noise burst plus a falling sine thump; no samples (user decision). Numbers (70 Hz, 1800 Hz, 0.35 s) are a starting point — the manual listening test in `test-todo.md` is the gate, and tuning is a table edit.
- **A6** [med] Per-vehicle variation through `sound.crash` in the preset, same table as #14's engine and horn. Rejected: scaling by `VEH.mass` — mass is the physics response; the sound character is a separate knob (a light, hollow van).
- **A7** [med] Landings use the same strength mapping from `-vy`, so a hard drop from the Sprungschanze is a big crash and a small step a thud. Rejected: leave the fixed 0.5.
- **A8** [high] Water entry is unchanged (the issue says it has its own handling).

## Consequences

- Taps between 3 and about 6 m/s now sound clearly softer than before (the old formula gave 0.27 at 6 m/s; the new gives 0.14).
- A car pushed against a wall plays one crash, then silence until it leaves and hits again, or hits harder.
- #105 shares `impactStrength`: if damage is later tuned, the sound tracks it; a hit under 3 m/s has strength 0, so #105 decides whether such hits still do damage (today they do, slightly).
- Crash plus engine plus horn together are the loudest mix; until #14's limiter lands the master gain (0.5) is the only headroom.
- A bus row without a `crash` field fails `checkVehicle` loudly instead of falling back to the compact sound.

## Out of scope

Samples, glass or metal debris sounds, tyre screech, Doppler or panning, the damage model itself (#105), engine and horn (#14), a sound settings UI.
