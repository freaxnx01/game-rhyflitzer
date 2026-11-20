# A livelier, more realistic engine sound — plan (#1130)

**Goal:** the engine stops being a static organ tone: combustion roughness, continuous load, slow rpm drift, wind and
tyre noise. Spec: `docs/superpowers/specs/2026-11-20-engine-sound-design.md`.

**Architecture:** pure functions in `sound.js` (node-tested), new voices in `buildEngine`/`applyEngine`, a two-field
input extension in `index.html` (`SFX.update`, `busEngines`).

## Global constraints

- Buildless, no new dependencies, no assets. Prefer native WebAudio nodes; at most ~4 extra nodes per engine voice.
- Existing presets need no edits: new preset fields are optional with defaults in `sound.js`; `checkSound` validates them
  only when present.
- No clipping (peaks < 1.0). Mute, holds, engine off (#475), wreck (#105) and flight stay silent exactly as today.
- Randomness only through an injected `rng` (default `Math.random`) so tests are deterministic.
- Run targeted tests only, in the foreground: `node --test tests/sound.test.mjs` and `tests/test_sound.py`.
- Commit and push after every task.

## Task 1 — continuous load (sound.js)

**Files:** `sound.js`, `tests/sound.test.mjs`
**Interface:** `export function engineLoad(input, engine)` → 0..1. No gas → 0. Gas: `cruise` (default 0.5) plus
acceleration and climb terms, clamped to 1. In the air: gas ? 1 : 0. `engineStep` smooths it into `s.load`
(time constant ~0.3 s). `engineMix` uses `s.load` instead of `input.gas ? 1 : 0` everywhere it used `load`.

- [ ] Failing tests: `engineLoad_NoGas_Zero`, `engineLoad_SteadyFlat_Cruise` (gas, accel 0, climb 0 → 0.5),
  `engineLoad_Uphill_Full` (climb 3 m/s → 1), `engineLoad_Accelerating_AboveCruise`, `engineStep_Load_SmoothsTowardsTarget`.
- [ ] Existing `engineMix` tests stay green with `s.load = 1` for "gas" cases (set `load` on the state in those tests'
  fixtures only where the state object is built — do not change their assertions).
- [ ] Implement; run `node --test tests/sound.test.mjs`. Commit.

## Task 2 — drift and level wander (sound.js)

**Files:** `sound.js`, `tests/sound.test.mjs`
**Interface:** `engineStep(s, input, sound, dt, rng = Math.random)` keeps a random-walk `s.drift` in ±`engine.drift`
(default 0.015) with a slow pull back to 0 (rate ~0.2–1 Hz); it applies only while `kmh > 1` and not in the air.
`engineMix` multiplies f0 by `1 + s.drift` and the level by `1 + s.drift * 2`.

- [ ] Failing tests with a seeded rng (simple LCG in the test): over 10 s of 1/60 steps at constant input, `drift`
  stays within ±0.015, is not constant (std > 0.002), and is exactly 0 at standstill.
- [ ] Implement; run node tests. Commit.

## Task 3 — wind, tyre wander and roughness in the mix (sound.js)

**Files:** `sound.js`, `tests/sound.test.mjs`
**Interface:** `engineMix` returns additionally `wind` (0 below 40 km/h, rising ~kmh² to `engine.wind ?? 0.12` at
`engine.topKmh`), `rough` (0..1 from load and rpm fraction) and `load`. `road` gets the drift-driven wander
(`road * (1 + s.drift * 4)`). `wind` and `rough` are 0 when `fly`, `dead` or `off`; in the `air` the wind stays,
`road` keeps today's rule (0 in the air).
`checkSound`: optional `engine.cruise` (0–1), `engine.drift` (0–0.05), `engine.wind` (0–0.5), `engine.rough` (0–1).

- [ ] Failing tests: `engineMix_Wind_SilentBelow40_RisesWithSpeed`, `engineMix_Rough_GrowsWithLoad`,
  `engineMix_Off_SilencesWindAndRough`, `checkSound_OptionalFieldsOutOfRange_Throw`.
- [ ] Implement; run node tests. Commit.

## Task 4 — the voices (sound.js graph builders)

**Files:** `sound.js`, `tests/test_sound.py`
- [ ] `buildEngine`: add a wind voice (noise → highpass ~1.2 kHz or bandpass ~2 kHz → gain → dest) and a roughness
  voice (noise → bandpass whose frequency tracks f0·2 → gain into the engine `filter`), and/or a noise-driven
  modulation of the harmonic gains. Push new sources into `sources` so `stopEngine` stops them.
- [ ] `applyEngine`: set the wind gain, the roughness band frequency (f0·2) and gain (`rough * engine.rough ?? 0.35`).
- [ ] `tests/test_sound.py` `RENDER_JS`: render 4 s at a constant top-gear state with load 0.5 and the drift advanced
  by `engineStep` with a seeded rng each 50 ms block (OfflineAudioContext with `setValueAtTime` per block). Assert:
  the RMS over 50 ms windows varies (coefficient of variation > 0.02; today's static voice is ~0), peak < 1.0;
  the wind band (highpass render) at 200 km/h > 4× at 50 km/h; the existing horn/idle/load/fly/rotor asserts unchanged.
- [ ] Run `tests/test_sound.py`. Commit.

## Task 5 — game glue (index.html)

**Files:** `index.html` (`SFX.update` call in the loop ~8585, `busEngines` ~4813, `state()` ~4831)
- [ ] Loop: pass `accel` (forward acceleration from the change of `Math.hypot(P.vx, P.vz)` over `dt`, smoothed) and
  `climb: P.vy` into `SFX.update`; 0 on foot and on the train.
- [ ] `busEngines`: input gets `accel: 0, climb: 0`; the wind gain is scaled by `v.gain` like `road`.
- [ ] `state()`: `mix` already spreads; ensure `load`, `wind`, `rough` appear.
- [ ] `tests/test_sound.py::test_engine_follows_the_car_and_nitro`: also assert `coast["mix"]["wind"] > 0` (72 km/h)
  and `coast["mix"]["load"] == 0` (coasting, no gas). Run `tests/test_sound.py`. Commit.

## Task 6 — ear check and CHANGELOG

- [ ] `test-todo.md`, a new section: hold W on the motorway for 30 s in the top gear — the engine never sounds like one
  frozen tone; wind is clearly audible above 100 km/h; uphill sounds harder than flat; idle still sounds calm; the
  Postauto still sounds like a bus.
- [ ] CHANGELOG under `[Unreleased]` › `Changed`, newest first, `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `<ts>` The **engine sound** is livelier: a rougher, uneven combustion, more effort uphill, **wind** at speed — no more monotone drone in the top gear.``
