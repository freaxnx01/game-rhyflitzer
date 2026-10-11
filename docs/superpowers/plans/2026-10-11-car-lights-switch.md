# Car lights on/off (#270) — plan

Spec: `docs/superpowers/specs/2026-10-11-car-lights-switch-design.md`. Anchors are identifiers, not line numbers. PR #281 and the #216/#105 runs touch `prototype/index.html`: rebase first and merge only your own hunks.

### Task 1: Pure lampState (TDD)

Files: create `prototype/lights.js`, `prototype/tests/lights.test.mjs`.

- [ ] Write the failing test first:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAMP, lampState } from '../lights.js';

test('lampState: lights off is today\'s look', () => {
  const s = lampState({});
  assert.equal(s.headLevel, LAMP.head.off);
  assert.equal(s.tailLevel, LAMP.tail.off);
  assert.deepEqual([s.left, s.right], [false, false]);
});
test('lampState: lights on lights head and tail', () => {
  const s = lampState({ head: true });
  assert.equal(s.headLevel, LAMP.head.on);
  assert.equal(s.tailLevel, LAMP.tail.rear);
});
test('lampState: brake beats rear light, with lights off too', () => {
  assert.equal(lampState({ braking: true }).tailLevel, LAMP.tail.brake);
  assert.equal(lampState({ head: true, braking: true }).tailLevel, LAMP.tail.brake);
});
test('lampState: a blinker shows only its side, only on the flash phase', () => {
  assert.deepEqual([lampState({ blinker: 'left', flashOn: true }).left, lampState({ blinker: 'left', flashOn: true }).right], [true, false]);
  assert.equal(lampState({ blinker: 'left', flashOn: false }).left, false);
});
test('lampState: hazard flashes both sides and wins over a blinker', () => {
  const s = lampState({ hazard: true, blinker: 'left', flashOn: true });
  assert.deepEqual([s.left, s.right], [true, true]);
});
```

- [ ] Run `node --test prototype/tests/lights.test.mjs`: fails (no module).
- [ ] Implement `LAMP = { head: { off: 0.35, on: 2.0 }, tail: { off: 0.45, rear: 1.0, brake: 2.4 } }` and `lampState` exactly as in the spec. Test passes.

### Task 2: Wire L, the lamps and the debug hook

Files: modify `prototype/index.html`, `prototype/strings.js`.

- [ ] Import `lampState`, `LAMP` from `./lights.js` next to the other module imports.
- [ ] Add `const LIGHTS = { head: false, hazard: false, braking: false };` right after `const HUD =`.
- [ ] In the `keydown` handler (next to `e.code === 'KeyQ'`): `if (e.code === 'KeyL' && $('overlay').hidden) { LIGHTS.head = !LIGHTS.head; toast(tr(LIGHTS.head ? 'lightsOn' : 'lightsOff')); }`.
- [ ] Add `applyLamps()`: computes `flashOn` the way `hud()` does today (`Math.floor(performance.now() / 350) % 2 === 0`), calls `lampState({ head: LIGHTS.head, hazard: LIGHTS.hazard, blinker: HUD.blinker, braking: LIGHTS.braking, flashOn })`, sets `carMats.lampHead.emissiveIntensity`, `carMats.lampTail.emissiveIntensity`, the DeLorean lamp colours, `BLINK[side].visible` and the `#blL` / `#blR` classes. Replace the blinker block inside `function hud` by a call to it.
- [ ] In `buildDelorean`: hoist `hl` and `tl` to a module-level `delLamps` so `applyLamps` can recolour them.
- [ ] `window.__mm.lights = () => ({ ...LIGHTS, ...lampState(...) })` beside `window.__mm.hud`.
- [ ] Strings (`en` and `de`, German with real umlauts, capitalised address forms): `lightsOn` 'Lights on' / 'Licht an', `lightsOff` 'Lights off' / 'Licht aus', `keyLights` 'Lights on · off' / 'Licht an · aus'. Add `<kbd>L</kbd><span data-i18n="keyLights">` rows to both `#help` blocks (the second near `#tH`).
- [ ] `node --test prototype/tests/*.test.mjs` passes (toast.test.mjs checks the new toast keys are plain text).

### Task 3: Playwright check and CHANGELOG

Files: create `prototype/tests/test_lights.py`; modify `CHANGELOG.md`.

- [ ] `test_lights.py` (hand layout: copy `start_hand` from `tests/test_toast.py`; world and terrain blocked): press `KeyL`, assert `__mm.lights()` has `head` true and `headLevel` == 2.0 and the toast "Lights on"; press again, back to 0.35. Switch to the DeLorean via the existing `__mm` vehicle hook (see `tests/test_vehicles.py` for how a test picks the DeLorean) and assert the same levels. Run only this file: `python3 -m pytest prototype/tests/test_lights.py -x`.
- [ ] CHANGELOG `[Unreleased]` / `### Added`, newest first, timestamp = Europe/Zurich time at merge (`TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`): "`<timestamp>` Press <kbd>L</kbd> to switch the **car lights** on and off: the headlights and the tail lights glow, in daylight too. Works for the compact and the DeLorean."
- [ ] Verification: `node --test prototype/tests/*.test.mjs` plus the one Playwright file above. No full suite.
