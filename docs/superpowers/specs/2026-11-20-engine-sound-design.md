# A livelier, more realistic engine sound (#1130)

## Why

Testers keep saying the engine sounds unrealistic, and that a long stretch in the top gear is monotonous. The cause is in
`sound.js`. The engine is a clean additive synth: a sawtooth plus triangle harmonics through one lowpass
(`buildEngine`). Load is either 0 or 1 (`engineMix`: `load = input.gas ? 1 : 0`). At a steady speed in the top gear,
the rpm, filter and level all stop moving, so what you hear is a perfectly static tone. There is no wind and no tyre
noise.

The maintainer chose to improve the synthesis rather than switch to recorded samples.

## Goals

1. **Combustion roughness.** The engine no longer sounds like a clean organ tone. Each firing varies slightly: a
   band-limited noise voice tracks the firing frequency, and/or the level is modulated by noise near f0. The rasp
   grows with load and rpm.
2. **Continuous load.** `load` becomes a number in 0..1. It comes from throttle, longitudinal acceleration and the
   climb rate `P.vy`. Without gas it is 0. With gas held at a steady top speed on the flat it sits at a cruise value
   (about 0.5). Uphill or while accelerating it is 1. `engineMix` scales the filter, level and roughness by it, so
   cruising sounds different from pulling hard.
3. **Slow life.** While driving, a small random-walk rpm drift (±1–2 %, about 0.2–1 Hz) and a slight level wander run,
   so a steady cruise is never one frozen tone. The drift is pure and seeded by an injected `rng`, so it can be
   tested.
4. **Wind and tyres.** A wind voice (high-passed or band-passed noise) is added. It is inaudible below about 40 km/h
   and grows roughly with speed² up to the top speed. The existing road voice gets a slow random level variation, so
   the tyre roll is not constant. Both are silent in the air, in flight, and when the engine is off (same rules as
   `road` today).

## Non-goals

- No recorded samples. No new assets.
- No change to the vehicle physics, the gears, or `gearAt`. The manual gearbox is a separate issue (#1129).
- No surface-dependent tyre sound. The game has no surface type to read yet.

## Anti-goals

- No new dependency and no build step. An `AudioWorklet` is allowed only if native nodes cannot do it. Prefer native
  nodes.
- No clipping. The existing peaks stay below 1.0, and the limiter chain in index.html is unchanged.
- Existing vehicle presets keep working without edits. New preset fields are optional, with defaults in `sound.js`.
  `checkSound` validates them when present.
- Mute, Sound off, holds (tab hidden, menu), engine off (#475), wreck (#105) and flight behave exactly as today.
- At most about 4 extra audio nodes per engine voice. This also applies to the Postauto bus voices (`busEngines`).

## Decisions

- The pure part (load, drift, the extended `engineMix`) lives in `sound.js` with node tests. The graph builders
  (`buildEngine`, `applyEngine`) get the new voices.
- `SFX.update` input gains `accel` (m/s², forward) and `climb` (m/s, `P.vy`). `load` for the car is computed in
  `sound.js` (`engineLoad(input)`), not in index.html.
- The bus voices pass `accel: 0, climb: 0` and get the drift and wind like the car.
- `__mm.audio()` keeps its fields. `mix` gains `load`, `wind` and `rough`, so tests can read them.

## Left to the builder

- The exact roughness technique (noise bandpass tracking f0, gain modulation, or both) and its constants. Judge them by
  ear against `test-todo.md`, within the node budget.
- Default values for the new optional preset fields.

## Acceptance

See the issue's acceptance criteria.
