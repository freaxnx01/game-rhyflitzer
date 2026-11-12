# Plattform deck: E goes down, V opens the Verein website (#914) Implementation Plan

**Goal:** On the Plattform deck E keeps its context chain (hop down), and the Verein website moves to its own key V; the
Verein plate becomes the second line of the E prompt.

**Architecture:** `controls.js` loses the `'website'` E result and gains a `WALK` entry `'website'` on `KeyV`; the
`index.html` dispatcher opens the site on V while `platOnDeck()`; the plate is restyled to sit flush under `#prompt`; strings updated.

**Spec:** `docs/superpowers/specs/2026-11-12-plattform-deck-e-website-design.md`

**Lands after #913** (nitro key): both edit `controls.js`. Rebase onto it before starting; no logical overlap.

## Global Constraints

- Key is `KeyV` (spec A2). Not N, not Shift. V in the `car` table stays `hideCar`.
- URL only from `ABOUT_LINKS.plattform` (`about.js:10`).
- Keep: pause when the tab opens (`index.html:6525`), the click/tap link, de + en strings.
- Playwright only `tests/test_plattform_verein.py`, foreground, under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Node tests: `node --test tests/controls.test.mjs tests/foot.test.mjs`.
- Changelog entry under `[Unreleased]` `### Changed`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`. Never `git cliff -o`.

## Files

- Modify: `controls.js`, `index.html`, `strings.js`, `tests/controls.test.mjs`, `tests/test_plattform_verein.py`, `CHANGELOG.md`

## Task 1: controls.js (TDD)

**Files:** `controls.js`, `tests/controls.test.mjs`

- [ ] **Step 1: Replace the #887 tests (`tests/controls.test.mjs:140-150`) with failing ones**

```js
// #914: the Verein's website is on V, never on E
test('contextKeyAction_OnDeckNothingElse_IsNull', () => {
  assert.equal(contextKeyAction({ onDeck: true }), null);
});
test('contextKeyAction_HopDownOnDeck_StaysDown', () => {
  assert.equal(contextKeyAction({ hop: 'down', onDeck: true }), 'down');
  assert.equal(contextKeyAction({ stopPrompt: true, onDeck: true }), 'timetable');
});
test('actionFor_FootAndIndoorsKeyV_IsWebsite', () => {
  assert.equal(actionFor('foot', 'KeyV'), 'website');
  assert.equal(actionFor('indoors', 'KeyV'), 'website');
});
test('actionFor_CarKeyV_StillHidesTheCar', () => {
  assert.equal(actionFor('car', 'KeyV'), 'hideCar');
});
test('contextLabel_Website_IsGone', () => {
  assert.equal(contextLabel('website'), null);
});
```

Run: `node --test tests/controls.test.mjs` -> the new tests fail (red).

- [ ] **Step 2: Implement**

In `controls.js`:
- `CONTEXT_LABELS`: delete `website: 'barWebsite'`; drop `, #887` from its comment.
- `contextKeyAction`: remove the `onDeck = false` parameter and the final line; end with `return null;` after the `stopPrompt` line. Update the comment above it (drop "over the Verein's website ... (#887)").
- `WALK`: after `entry('footNitro', ...)` add
  `entry('website', ['KeyV'], { label: 'keyWebsite' }),   // #914: the Verein's site from the Plattform deck; no touch entry, the plate's link is the tap`.
  `keyWebsite` need not exist in strings.js unless a test iterates labels: run the suite; if a labels test fails, add `keyWebsite` ('Verein website ↗' / 'Verein-Website ↗') to both languages in strings.js.
- Keep the existing `conflicts()` test green (V is not in WALK elsewhere).

Run: `node --test tests/controls.test.mjs tests/foot.test.mjs` -> green. Commit `fix(plattform): move the Verein website off E onto V (#914)`.

## Task 2: dispatcher, plate, strings (index.html, strings.js)

**Files:** `index.html`, `strings.js`

- [ ] **Step 1: index.html**
  - `contextAction()` (`:4926`): drop `, onDeck: platOnDeck()` from the `contextKeyAction` call.
  - `runContextKey()` (`:4930`): delete the `else if (a === 'website') window.open(...)` branch.
  - New helper next to `platOnDeck` (`:4920`):
    `const openVerein = () => window.open(ABOUT_LINKS.plattform, '_blank', 'noopener');   // #914: V on the deck`
  - Keydown dispatcher (`:4368`): directly before `if (FOOT.on) { const fa = footKeyAction(...` insert
    `if (FOOT.on && actionFor('foot', e.code) === 'website' && platOnDeck()) { e.preventDefault(); openVerein(); return; }`
    (after `keys[e.code] = true` and the Z handling; `footKeyAction` would otherwise swallow V, `foot.js:115`). Off the deck V falls through and stays swallowed.
  - Markup `:466`: `<div id="vereinplate" hidden><span data-i18n="vereinName">Verein Plattform Sisslerfeld</span> · <a id="vereinlink" target="_blank" rel="noopener" data-i18n="vereinOpen"></a></div>`
  - CSS (`:57`): make the plate the prompt's second line: `#prompt:not(:empty)+#vereinplate{margin-top:0;border-top:1px dashed #d8e8a0}` and keep `#vereinplate` alone-standing styling otherwise. Same width is not required; left edges align because both are in the same column. Check the stacked look is not clipped at 960x540 by taking one screenshot of the deck at the 272 degree spot.
  - Update the comments at `:4919` / `:4923` (E is no longer the website key).
- [ ] **Step 2: strings.js** (en `:237`, de `:1002`): `vereinOpen: 'V Website ↗'` (en), `'V Website öffnen ↗'` (de). Delete `barWebsite` at `:348` and `:1111`. `rg barWebsite` must find nothing.

Run `node --test tests/*.test.mjs` for strings parity tests (en/de key sets). Commit `fix(plattform): Verein plate as second line of the E prompt (#914)`.

## Task 3: update the #887 Playwright tests

**Files:** `tests/test_plattform_verein.py`

- [ ] **Step 1: edit `test_deck_shows_the_verein_plate_and_e_opens_the_website`** (rename `..._and_v_opens_the_website`): at polar(285, 2.5) replace `key(page, "e")` with `key(page, "v")`; the `window.open` stub stays; assert `action is None` (E has nothing there) instead of `"website"`; assert plate text contains `V Website`.
- [ ] **Step 2: add `test_deck_hop_band_shows_down_and_the_plate_and_e_still_hops`**: put the walker at polar(272, 2.5) (the 'down' band; `plat["facing"]`, `plat["deckY"]`), wait for the plate, assert `window.__mm.platHop() == "down"`, `#prompt` text equals the `hopDownPrompt` string, the plate is visible, V pushes `[VEREIN_URL, "_blank"]` into `window.__opened`, then E drops the walker (`platHop()` null and the plate hidden once on the ground).
- [ ] **Step 3: keep `test_in_the_car_on_the_deck_there_is_no_plate`** and add: pressing `v` in the car does not call `window.open` and `window.__mm.keybar().action != "website"` (the assertion already covers the action).
- [ ] **Step 4: run** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_plattform_verein.py -x` in the foreground (generous timeout, never in background). Commit `test(plattform): website on V (#914)`.

## Task 4: changelog and push

- [ ] Add under `[Unreleased]` -> `### Changed` (newest first, timestamp now, Zurich):
  `- \`<date time>\` On the **Plattform deck** <kbd>E</kbd> now always goes **down**; the **Verein Plattform Sisslerfeld** line sits under that prompt and opens its **website** with <kbd>V</kbd> (or a click / tap).`
- [ ] Open the PR (`fix(plattform): E goes down, V opens the Verein website`, `Closes #914`). `main` needs a PR; wait for checks.

## Review Focus

- At the stair head E still hops down and V opens the site (Task 3 step 2).
- V in the car still hides the car; V on foot off the deck does nothing.
- No `'website'` left in `contextKeyAction`; `rg barWebsite` empty; en/de key sets equal.
- Rebased on #913 without a controls.js conflict.
