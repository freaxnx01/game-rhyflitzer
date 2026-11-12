# One key for nitro (#913) Implementation Plan

**Goal:** Nitro is N in the car, on foot and in the heli; Shift is no longer nitro anywhere.

**Architecture:** `controls.js` car entry, the car input read in `index.html`, `route.js` take-over keys, tests.

**Spec:** `docs/superpowers/specs/2026-11-12-nitro-one-key-design.md`

## Global Constraints

- Lands before #914: both edit `controls.js`; touch only the car `nitro` line (`controls.js:30`). Rebase on `origin/main` first.
- Shift keeps down (foot) and sink (heli); do not touch `foot.js`, `heli.js`, `campath.js`.
- Action name `nitro` stays. No new strings: `barNitro`, `keyNitro`, `tutStepNitro` are unchanged.
- Run only the affected tests: node `--test` on the named files and the named Playwright files, foreground, under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Not the full suite.
- CHANGELOG: one entry under `[Unreleased]` `### Changed`, newest first, time from `TZ=Europe/Zurich date '+%F %H:%M'`.

## Review Focus

- grep `Shift` over root `*.js` and `index.html`: no remaining nitro meaning.
- The key bar in the car reads "N Nitro"; the tutorial hint and cap say N.
- Shift in the car: `drive().nitro === 0`; N still gives nitro and gas.

## Task 1: Node tests first (red)

**Files:** `tests/controls.test.mjs`, `tests/route.test.mjs`, `tests/tutorial.test.mjs`

- [ ] Replace `actionFor_Car_ShiftAndNBothNitro` (`controls.test.mjs:28`):

```js
test('actionFor_Car_OnlyNIsNitro_ShiftIsNothing', () => {
  assert.equal(actionFor('car', 'KeyN'), 'nitro');
  for (const k of ['ShiftLeft', 'ShiftRight']) assert.equal(actionFor('car', k), null, k);
});

test('nitro_EveryContext_OnNAndNeverOnShift', () => {
  const nitro = { car: 'nitro', foot: 'footNitro', indoors: 'footNitro', heli: 'heliNitro' };
  for (const [ctx, action] of Object.entries(nitro)) {
    assert.equal(actionFor(ctx, 'KeyN'), action, ctx);
    for (const k of ['ShiftLeft', 'ShiftRight']) assert.notEqual(actionFor(ctx, k), action, `${ctx} ${k}`);
  }
});
```

- [ ] `route.test.mjs:131`: title "nitro (N, not Shift) ..."; drop `'ShiftLeft', 'ShiftRight'` from the has-list and add
  both to the not-has list.
- [ ] `tutorial.test.mjs:49`: expect `{ via: 'key', cap: 'N' }`.
- [ ] Run `node --test tests/controls.test.mjs tests/route.test.mjs tests/tutorial.test.mjs`; expect the new and changed tests red.

## Task 2: Implementation (green)

**Files:** `controls.js`, `route.js`, `index.html`

- [ ] `controls.js:30` becomes:

```js
  entry('nitro', ['KeyN'], { hold: true, core: true, label: 'barNitro', cap: 'N' }),
```

- [ ] `route.js:30-31`: comment "N is nitro (#913: Shift no longer is)"; remove `'ShiftLeft', 'ShiftRight'` from `TAKE_OVER_KEYS`.
- [ ] `index.html:5601`: `nitro = ap ? 0 : (inp.KeyN ? 1 : 0)` (was `(inp.ShiftLeft || inp.ShiftRight || inp.KeyN) ? 1 : 0`).
- [ ] `index.html:481`: `<kbd data-cmd="hold">N</kbd>`.
- [ ] Re-run the three node files: all green. Run `node --test tests/*.test.mjs` is NOT needed.

## Task 3: Playwright tests follow

**Files:** `tests/test_controls.py`, `tests/test_tutorial.py`, `tests/test_keybar.py`

- [ ] `test_controls.py:30-41`: rename to `test_space_n_and_b_held_together_give_gas_nitro_and_look_back`, keys
  `("Space", "KeyN", "KeyB")`, set check `{"Space", "KeyN", "KeyB"}`.
- [ ] Replace `test_n_still_gives_nitro` (`:44`) with a test that holds `ShiftLeft` and asserts `window.__mm.drive().nitro === 0`
  after a short `wait_for_timeout(500)`, then holds `KeyN` and waits for `nitro === 1`.
- [ ] `test_tutorial.py:115`: `["KeyN", "KeyW"]`; `:151` `"N" in hints["nitro"]`... keep `"J"` / `"WASD"` checks;
  `:154` `kbds["nitro"] == ["N"]`.
- [ ] `test_keybar.py:54`: expected text `"WASD fahrenN NitroZ aussteigenJ springenC KameraF1 alle Tasten"`.
- [ ] Run only these three files, foreground, capped.

## Task 4: Changelog and commit

**Files:** `CHANGELOG.md`

- [ ] Add under `[Unreleased]` `### Changed`, first line:
  `- `<TZ=Europe/Zurich date '+%F %H:%M'>` **Nitro** is now **one key everywhere**: <kbd>N</kbd> in the car, on foot and in the helicopter. <kbd>Shift</kbd> no longer fires nitro in the car; it keeps <kbd>down</kbd> on foot and <kbd>sink</kbd> in the helicopter, and the key bar, the tutorial and the help list all show N.`
- [ ] Commit `fix(controls): one key for nitro in every context (#913)`; PR as the repo requires.
