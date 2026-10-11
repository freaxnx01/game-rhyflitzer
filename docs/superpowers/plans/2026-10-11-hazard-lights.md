# Hazard lights (#271) — plan

Spec: `docs/superpowers/specs/2026-10-11-hazard-lights-design.md`. Requires #270 merged (`lights.js`, `LIGHTS`, `applyLamps`). Anchors are identifiers; PR #281 and the #216/#105 runs touch `prototype/index.html`.

### Task 1: Key 1 toggles LIGHTS.hazard

Files: modify `prototype/index.html`, `prototype/strings.js`.

- [ ] In the `keydown` handler next to `e.code === 'KeyQ'`: `if (e.code === 'Digit1' && $('overlay').hidden) { LIGHTS.hazard = !LIGHTS.hazard; toast(tr(LIGHTS.hazard ? 'hazardOn' : 'hazardOff')); }`. `applyLamps()` from #270 already reads `LIGHTS.hazard`.
- [ ] Strings en + de (real umlauts): `hazardOn` 'Hazard lights on' / 'Warnblinker an', `hazardOff` 'Hazard lights off' / 'Warnblinker aus', `keyHazard` 'Hazard lights on · off' / 'Warnblinker an · aus'; help rows in both `#help` blocks.
- [ ] `node --test prototype/tests/*.test.mjs` passes.

### Task 2: Test both sides flash (TDD, extends the #270 files)

Files: modify `prototype/tests/lights.test.mjs`, `prototype/tests/test_lights.py`.

- [ ] Node: add a test that `lampState({ hazard: true, flashOn: false })` has both sides false and `flashOn: true` both true (the other hazard-wins case already exists from #270).
- [ ] Playwright in `test_lights.py`: press `Digit1`; poll `__mm.lights()` for up to 1 s until both `left` and `right` are true in the same sample, and never one without the other; press `KeyQ` while hazard is on and assert `left` and `right` are still equal; press `Digit1` again and assert both false and the stored blinker (`__mm.hud().blinker`) shows alone. Run only this file.

### Task 3: CHANGELOG

- [ ] `[Unreleased]` / `### Added` entry, Zurich timestamp at merge: "`<timestamp>` Press <kbd>1</kbd> for the **hazard lights**: both turn signals flash together, with the lights on or off, until you press <kbd>1</kbd> again."
- [ ] Verification: node suite + `test_lights.py` only.
