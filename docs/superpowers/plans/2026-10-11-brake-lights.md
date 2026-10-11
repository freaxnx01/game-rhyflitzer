# Brake lights (#230) — plan

Spec: `docs/superpowers/specs/2026-10-11-brake-lights-design.md`. Requires #270 merged. Anchors are identifiers; PR #281 and the #216/#105 runs touch `prototype/index.html`.

### Task 1: Feed LIGHTS.braking from stepCar (TDD)

Files: modify `prototype/index.html`, `prototype/tests/lights.test.mjs`, `prototype/tests/test_lights.py`.

- [ ] Playwright first, in `test_lights.py` (hand layout, `start_hand` copied from `tests/test_toast.py`): drive with `Space` until `__mm.lights().braking` is false and tail level is the idle value; hold `KeyS`; assert `braking` true and `tailLevel` 2.4; release and assert idle again. Also: with `KeyL` on and no brake, `tailLevel` is 1.0, with brake 2.4. Run it: fails (braking never set).
- [ ] In `function stepCar`, inside the `if (!air)` branch where `brake` is applied, set `LIGHTS.braking = !!((brake || hb) && vf > 0.5);` and set `LIGHTS.braking = false` in the air/fly paths and at the top of the step, so it never sticks. `applyLamps()` from #270 already reads it.
- [ ] Re-run the Playwright file: passes. Node suite: `node --test prototype/tests/*.test.mjs` (the brake-beats-rear-light case already lives in `lights.test.mjs` from #270).

### Task 2: CHANGELOG

- [ ] `[Unreleased]` / `### Added` entry, Zurich timestamp at merge: "`<timestamp>` The **brake lights** glow brighter red when you brake, with the lights on or off."
- [ ] Verification: node suite + `test_lights.py` only.
