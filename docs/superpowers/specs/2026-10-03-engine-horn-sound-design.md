# Stronger horn and a more natural engine sound — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #14

## Goal

From the playtests on 2026-10-01 and 2026-10-03: the horn should be **louder and last longer per key press**, and the engine should sound less artificial.

Success: pressing **H** (or Enter) gives a full, steady two-note horn for about 0.9 s — clearly louder than today's 0.45 s decaying beep. The engine idles low when standing, revs with speed in each gear, drops audibly on every upshift, sounds darker off the throttle and brighter under load, free-revs in the air, hisses with nitro (**N**). The sound settings live per vehicle in `VEHICLES[].sound`, so the tractor and the bus (#6) can get their own engine and horn by adding a row. In the helicopter (#10) the engine is silent and a rotor thump plays. When the game is paused (#83) or the tab is hidden, all sound stops.

## Starting point (verified 2026-10-03 on `main` @ `7e3f272`)

- **Synth today:** `SFX` (`prototype/index.html:897-914`). The engine is one sawtooth plus one square an octave down (`detune -1205`) through one lowpass, frequency `engineBase + rpm * enginePerRpm + gear * 6` with `rpm` = position inside the current speed band (0..1) — so the pitch saws up and snaps back at every band edge, with no idle and no real rpm. Road noise is bandpassed white noise (`ng`), silent in the air.
- **Horn today:** `horn()` (`index.html:911`) plays `VEH.sound.horn` = `[420, 528]` Hz with `beep(f, hornDur = 0.45, 'sawtooth', 0.12)`; `beep` ramps exponentially to 0.001 over the duration, so most of the 0.45 s is a fading tail. Measured in an `OfflineAudioContext`: RMS 0.018 over 0.05-0.45 s, below 0.002 after 0.3 s.
- **Vehicle table (#5):** `VEHICLES.compact.sound = { horn, hornDur, engineBase, enginePerRpm, gears }` (`index.html:835`). `checkVehicle` / `setVehicle` (`index.html:868-871`) validate and clone; `setVehicle(VEH)` runs at line 871, **before** `SFX` is defined (line 898), so `setVehicle` cannot call into `SFX`.
- **Readers of `VEH.sound`:** only `SFX` and the HUD gear (`hud`, `index.html:1099`: `while (kmh > gears[gi + 1]) gi++`). `test_vehicles.py::test_table_gears_drive_the_hud` patches `c.sound.gears = [0, 100, 200, 300, 400, 500, 999]` and must keep passing unchanged.
- **Feeding:** `loop` (`index.html:1104`) calls `SFX.update(kmh, P.gas, P.air, dt)` once per frame. `stepCar` sets `P.gas`, `P.air`, `P.nitro` (`index.html:966-968`). The engine starts on the Start button (`SFX.start()`, `index.html:1011`); **M** toggles mute (`index.html:889`).
- **Helicopter (#10):** PR #84 is open. Its spec says the engine follows the helicopter's speed and that a rotor sound is a follow-up (`docs/superpowers/specs/2026-10-03-helicopter-mode-design.md:58,68`). It adds `const FLY = { on, v, alt }`.
- **Pause (#83):** being enriched in parallel; no code yet. Today nothing stops the audio: in a hidden tab `requestAnimationFrame` stops but the engine drone keeps playing at its last setting.
- **Brands:** the PostAuto three-tone horn may be a sound mark; the bus gets its own horn chord (`docs/07-brands-and-permissions.md:23`).
- **Tests:** `node --test prototype/tests/*.test.mjs` for pure modules; pytest + Playwright `prototype/tests/test_*.py` with the hand layout (`open_hand`, `test_vehicles.py`). `test_vehicles.py::test_rebuilds_free_gpu_memory` already fails on `main` @ `7e3f272` (geometries 280 → 281), unrelated to sound.

## Decisions

| Topic | Decision |
|---|---|
| Technique | WebAudio synthesis only, no samples (user decision 2026-10-03). |
| Module | New `prototype/sound.js`: pure functions `gearAt`, `targetRpm`, `engineStep`, `engineMix`, `rotorMix`, `checkSound` (node-tested) and graph builders `buildEngine`, `stopEngine`, `applyEngine`, `buildRotor`, `applyRotor`, `playHorn`, `noiseBuffer` that take any `BaseAudioContext` and touch no DOM (rendered in an `OfflineAudioContext` in Playwright). |
| Preset shape | `sound: { gears, engine: { cylinders, idleRpm, shiftRpm, limitRpm, topKmh, harmonics: [{ mul, gain, detune }], filter: { idle, open, offLoad, q }, gain: { idle, rev, load }, shiftTime, shiftDip, nitroHiss }, horn: { notes, dur, gain, band, wave } }`. `gears` stays where it is (HUD and the #5 test read it). The old fields `horn` (array), `hornDur`, `engineBase`, `enginePerRpm` go. |
| RPM curve | In gear `g` the target rpm is `shiftRpm * kmh / upperBandEdge` (the top gear uses `topKmh`), clamped to `idleRpm..limitRpm` — rpm proportional to road speed like a real gearbox, so an upshift drops it (e.g. 6200 → 2760 at 20 km/h). In the air: `0.92 * limitRpm` with gas, idle without. The heard rpm slews at 12 000 rpm/s up and 20 000 rpm/s down. |
| Gear change | An upshift on the ground starts a throttle lift: for `shiftTime` (0.15 s) the level drops by `shiftDip` (60 %). Downshifts and gear changes in the air don't dip. |
| Engine voice | Firing frequency `f0 = rpm / 60 * cylinders / 2` (four-stroke). One oscillator per harmonic at `f0 * mul`, slightly detuned (`detune` cents), the fundamental a sawtooth and the others triangles, all into one lowpass. |
| Load filter | Cutoff from `filter.idle` (idle) to `filter.open` (limit); off the throttle × `offLoad` (0.55) and lower Q (× 0.6); nitro × 1.25. Level `gain.idle + gain.rev * n + gain.load * gas` (n = rpm position 0..1). |
| Road noise / nitro | Road noise as today (`min(0.25, kmh / 400)`, silent in the air). Nitro adds a bandpassed hiss at 2.6 kHz (`nitroHiss`). |
| Horn | Fixed length per press: `dur` 0.9 s for compact (was 0.45). Each note a pair detuned ±6 cents, `square`, through one bandpass at `band` (1.4 kHz), held flat at `gain` 0.22 with a 15 ms attack and 60 ms release — no decay. Compact chord 415 + 523 Hz (a major third, close to today's 420 + 528). |
| Master | `master` gain 0.5 (unchanged) → a `DynamicsCompressor` used as a limiter (threshold −6 dB, knee 4, ratio 12) → destination, so horn + engine + crash never clip. **M** (mute) ramps the master gain to 0 instead of each voice checking `muted`. |
| Helicopter | `SFX.update` takes `{ kmh, gas, nitro, air, fly }`. With `fly` the engine, road noise and hiss go to 0 and a rotor voice (noise lowpassed at 260 Hz, level pulsed by a sine at 5.5 Hz + 0.012 Hz per km/h) comes in. The loop passes `fly: FLY.on` once #10 is on `main`, `fly: false` before. |
| Pause | `SFX.hold(reason, on)`: a set of reasons; while any is held the `AudioContext` is suspended and the horn, beeps and bursts do nothing. The tab uses `'tab'` (`visibilitychange`); #83's pause menu calls `SFX.hold('menu', paused)`. |
| Preset check | `checkVehicle` calls `checkSound(def.sound)`; a bad preset throws an `Error` naming the field, before anything is swapped. |
| Vehicle swap | `setVehicle` clones `VEH`, so `SFX.update` sees a new `VEH.sound.engine` object and rebuilds the engine voices (no call from `setVehicle` into `SFX`, which is not defined yet when `setVehicle(VEH)` first runs). |
| Test hooks | `__mm.audio()` → `{ ctx, muted, holds, rpm, gear, shift, mix, rotor }`; `__mm.sfxHold(reason, on)`. |
| HUD gear | `hud` reads `gearAt(kmh, VEH.sound.gears)` from `sound.js` (same result as the inline loop for every speed below the last band edge). |

## Assumptions

- **A1** [confirmed] Better WebAudio synthesis, no samples: several detuned harmonics, a load-dependent filter, an RPM curve with gear changes; the horn louder and longer as its own chord, not the PostAuto three-tone horn (`docs/07-brands-and-permissions.md:23`); per-vehicle presets in `VEHICLES` (#5) so the tractor and bus (#6) get their own sound later. User decision 2026-10-03.
- **A2** [med] The horn has a fixed, longer length per press (0.9 s), not hold-to-sustain. Rejected: sounding while H is held — the keydown handler ignores repeats and Enter also confirms dialogs (`index.html:889`), and the playtest asked for "longer per key press".
- **A3** [med] Compact horn: 415 + 523 Hz square pair through a 1.4 kHz bandpass, flat at 0.22. Rendered offline: RMS 0.20 over 0.05-0.8 s vs 0.018 today (~+21 dB), peak 0.77 before the master gain. Rejected: keeping the decaying `beep` envelope with a higher volume — the fade is what makes it sound weak and short.
- **A4** [med] The rpm follows road speed in gear using the existing speed bands `sound.gears` (`index.html:835`), plus `topKmh` for the open-ended top band. Rejected: a separate gearbox (ratios, final drive) — the HUD gear and the #5 test already define gears as speed bands (`index.html:1099`, `test_vehicles.py:141-150`).
- **A5** [med] In the helicopter the engine is muted and a synthesized rotor thump plays. Rejected: only muting (the user allowed either; the rotor is ~6 lines of WebAudio). This takes the "rotor sound" follow-up from #10's spec (`2026-10-03-helicopter-mode-design.md:58`).
- **A6** [med] Pause is a set of hold reasons that suspends the whole `AudioContext`; #83 calls `SFX.hold('menu', on)`. Rejected: one boolean (the hidden-tab and the pause menu would release each other), muting via gain (oscillators keep running and a queued horn plays on).
- **A7** [med] Nitro: hiss layer and a 25 % brighter filter, no extra rpm (nitro already raises speed and so rpm via the curve).
- **A8** [high] Mute via the master gain, a limiter after it. Other sounds (checkpoint, finish, crash, splash) stay as they are.
- **A9** [high] The old preset fields have no other reader (grep: only `SFX` and `hud` read `VEH.sound`), so they are replaced, not kept beside the new ones.
- **A10** [med] The preset numbers (harmonic gains, filter Hz, levels) are a starting point; the manual listening test in `test-todo.md` is the real gate, and tuning them later is a table edit.

## Consequences

- The engine drone no longer plays on in a hidden tab, and it no longer saws up and snaps back at each speed band edge.
- Gear changes are audible as a short dip and an rpm drop; at 20, 45, 75, 110, 150 km/h.
- The HUD and the sound read the same `gearAt`, so the shown gear and the heard gear always agree.
- A vehicle swap while driving rebuilds the engine voices, which may click once.
- Until #10 is on `main`, `fly` is always `false` and the rotor is never heard. If PR #84 lands after this change, its loop edit must pass `fly: FLY.on` (the plan's Task 5 covers the order where #84 is first).
- With mute on, the rotor is silent too; mute and pause are independent.
- The limiter slightly compresses anything above −6 dBFS after the master gain (only horn + engine + crash at once get there).

## Out of scope

Samples, Doppler or 3D panning, other cars' sounds, tyre squeal, the tractor/bus presets themselves (#6), a sound settings UI, the PostAuto horn.
