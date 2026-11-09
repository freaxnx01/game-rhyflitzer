# Declutter the driving HUD (#773) Implementation Plan

**Goal:** Approach B. Everything except speed, direction, time and map fades to a low-opacity ghost after 4 s without
change and lights for 3 s on a change; the damage plate shows only above 0 %; the blinker glyphs only while signalling;
the key bar ghosts after 30 s and returns on a new context; the compass lives in the minimap (needle on the car marker,
heading text in the map bar) and the standalone `#compass` is gone; `#stylebtn` is gone on every device (pause menu +
T); `#game-nav` is hidden while driving on every width.

**Architecture:** one pure ES module `hudfade.js` (timers, phases, mode rules, heading text; `node --test`), wired in
`index.html` by a `stepHudFade(dt)` called from `hud(dt)` that samples the DOM and toggles the `ghost` / `gone` classes;
CSS for the ghost, the blinkers, the compass removal and the footer. Spec:
`docs/superpowers/specs/2026-11-09-hud-declutter-design.md`.

## Global Constraints

- **Anchor every `index.html` edit on the code text quoted below, never on line numbers.** #783 (two lines in
  `stepEnter()`) is in the pipeline now, and `index.html` moves with every merge.
- Do not redo PR#785 (#776) or PR#774 (#735): `#pausestyle`, the phone `#game-nav` rule, `#radiobtn` and `radioShow()`
  exist; build on them.
- No framework, bundler or `package.json`. Not a dc-tool game: `index.html` is edited directly.
- Unit tests: `node --test tests/hudfade.test.mjs` (CI runs `node --test tests/*.test.mjs`).
- Playwright: **foreground only**, never `run_in_background`; commit and push the branch **before** running it. Run
  only the touched files, never the full suite:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_hud_fade.py tests/test_hud_toggle.py tests/test_phone_hud.py tests/test_pause.py tests/test_tutorial.py tests/test_i18n.py tests/test_cruise.py tests/test_keybar.py tests/test_shots.py -x -q`
- The hand layout (terrain `.mmh` and `data/world_hochrhein.json` routed to 404) is enough for every browser check here.
- Game time, not wall clock: fading is asserted through `window.__mm.hudFade(secs)`; a headless renderer draws under
  1 fps and `dt` is clamped to 0.05 s.
- CHANGELOG: one player-facing English entry under `[Unreleased]` → `### Changed`, timestamped in Swiss local time,
  newest first, 1–3 bold keywords.

## Task 1: `hudfade.js` — the pure rules (TDD)

**Files:** create `hudfade.js`, create `tests/hudfade.test.mjs`.

- [ ] **Step 1: Write the failing tests.** Full file `tests/hudfade.test.mjs`:

```js
// #773: the driving HUD's fade rules -- hold, wake, hidden, the key bar's own timer, what a mode shows, the heading text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADE_S, GHOST_OPACITY, FADED, createFader, resetFader, sample, phase, phases, createKeybar, keybarPhase, visibleInMode, headingText } from '../hudfade.js';

test('FADE_S_AreTheDecidedSeconds', () => {
  assert.deepEqual(FADE_S, { hold: 4, wake: 3, keybar: 30 });
  assert.ok(GHOST_OPACITY > 0 && GHOST_OPACITY < 0.5);
  assert.deepEqual(FADED, ['tl', 'dmgplate', 'gearplate', 'tripplate', 'watername', 'roadname', 'autoline', 'prompt', 'best']);
});

test('phase_FreshValue_HoldsFourSecondsThenGhosts', () => {
  const f = createFader(0);
  sample(f, { roadname: 'Bahnhofstrasse' }, 0);
  assert.equal(phase(f, 'roadname'), 'awake');
  sample(f, { roadname: 'Bahnhofstrasse' }, 3.9);
  assert.equal(phase(f, 'roadname'), 'awake');
  sample(f, { roadname: 'Bahnhofstrasse' }, 4.0);
  assert.equal(phase(f, 'roadname'), 'ghost');
});

test('phase_ChangedValue_WakesThreeSecondsThenGhosts', () => {
  const f = createFader(0);
  sample(f, { gearplate: '2' }, 0);
  sample(f, { gearplate: '2' }, 10);
  assert.equal(phase(f, 'gearplate'), 'ghost');
  sample(f, { gearplate: '3' }, 10);
  assert.equal(phase(f, 'gearplate'), 'awake');
  sample(f, { gearplate: '3' }, 12.9);
  assert.equal(phase(f, 'gearplate'), 'awake');
  sample(f, { gearplate: '3' }, 13);
  assert.equal(phase(f, 'gearplate'), 'ghost');
});

test('phase_NullValue_IsHidden_AndAppearingHoldsFour', () => {
  const f = createFader(0);
  sample(f, { dmgplate: null }, 0);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
  sample(f, { dmgplate: null }, 20);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
  sample(f, { dmgplate: '22 %' }, 20);
  assert.equal(phase(f, 'dmgplate'), 'awake');
  sample(f, { dmgplate: '22 %' }, 23.5);
  assert.equal(phase(f, 'dmgplate'), 'awake');          // appearance holds 4 s, not the 3 s wake
  sample(f, { dmgplate: '22 %' }, 24);
  assert.equal(phase(f, 'dmgplate'), 'ghost');
  sample(f, { dmgplate: null }, 25);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
});

test('phase_UnknownId_IsHidden_AndPhasesListsEverySampledId', () => {
  const f = createFader(0);
  assert.equal(phase(f, 'best'), 'hidden');
  sample(f, { tl: 'Cruising · Hochrhein|0', best: 'Best —' }, 0);
  sample(f, { tl: 'Cruising · Hochrhein|0', best: 'Best —' }, 5);
  assert.deepEqual(phases(f), { tl: 'ghost', best: 'ghost' });
});

test('resetFader_ForgetsEveryValue_SoARunStartHoldsFourSecondsAgain', () => {
  const f = createFader(0);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 0);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 90);       // the start screen sat open for a while
  assert.equal(phase(f, 'tl'), 'ghost');
  resetFader(f);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 90);
  assert.equal(phase(f, 'tl'), 'awake');
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 94);
  assert.equal(phase(f, 'tl'), 'ghost');
});

test('sample_OnlyTheChangedIdWakes', () => {
  const f = createFader(0);
  sample(f, { roadname: 'A', watername: 'Rhein' }, 0);
  sample(f, { roadname: 'B', watername: 'Rhein' }, 6);
  assert.deepEqual(phases(f), { roadname: 'awake', watername: 'ghost' });
});

test('keybarPhase_ThirtySecondsPerContext_NewSignatureRestarts', () => {
  const k = createKeybar(0);
  assert.equal(keybarPhase(k, 'true|car|null|en', 0), 'awake');
  assert.equal(keybarPhase(k, 'true|car|null|en', 29.9), 'awake');
  assert.equal(keybarPhase(k, 'true|car|null|en', 30), 'ghost');
  assert.equal(keybarPhase(k, 'true|foot|null|en', 30), 'awake');   // Z: on foot -- a new context brings it back
  assert.equal(keybarPhase(k, 'true|foot|null|en', 59.9), 'awake');
  assert.equal(keybarPhase(k, 'true|foot|enter|en', 60), 'awake');  // a door's E action is a new context too
});

test('visibleInMode_MirrorsTheCruiseAndTutorialCss', () => {
  for (const id of ['tr', 'best', 'cps', 'pips', 'arrow', 'dist', 'cpname']) assert.equal(visibleInMode(id, 'cruise'), false, id);
  for (const id of ['tl', 'roadname', 'watername', 'gearplate', 'dmgplate', 'tripplate', 'keybar', 'br', 'speedo']) assert.equal(visibleInMode(id, 'cruise'), true, id);
  assert.equal(visibleInMode('tr', 'tutorial'), false);
  assert.equal(visibleInMode('best', 'tutorial'), false);
  assert.equal(visibleInMode('arrow', 'tutorial'), true);
  for (const m of ['trial', 'blitz', 'hunt', 'view']) for (const id of ['tr', 'best', 'pips', 'arrow', 'tl']) assert.equal(visibleInMode(id, m), true, `${m} ${id}`);
});

test('headingText_RoundsAndNamesTheEightPoints_WithTheEastLetter', () => {
  assert.equal(headingText(0), 'N 0°');
  assert.equal(headingText(37.4), 'NE 37°');
  assert.equal(headingText(37.4, 'O'), 'NO 37°');
  assert.equal(headingText(90, 'O'), 'O 90°');
  assert.equal(headingText(135, 'O'), 'SO 135°');
  assert.equal(headingText(359.6), 'N 0°');
  assert.equal(headingText(-90), 'W 270°');
  assert.equal(headingText(247.5), 'W 248°');
});
```

- [ ] **Step 2: Run it, see it fail.** `node --test tests/hudfade.test.mjs` → `Cannot find module '../hudfade.js'`.

- [ ] **Step 3: Write `hudfade.js`.**

```js
// hudfade.js (#773): pure rules for the driving HUD's secondary elements -- when they fade to a ghost, when they wake,
// what a mode shows, the heading text of the map bar. No DOM: node --test imports it; hud() in index.html samples
// the DOM and applies what these rules say.
export const FADE_S = Object.freeze({ hold: 4, wake: 3, keybar: 30 });   // seconds of game time
export const GHOST_OPACITY = 0.28;
// the elements the fader manages, by the id that gets the class (the three #gear plates get ids in index.html)
export const FADED = Object.freeze(['tl', 'dmgplate', 'gearplate', 'tripplate', 'watername', 'roadname', 'autoline', 'prompt', 'best']);

export function createFader(t = 0) { return { t, items: {} }; }
export function resetFader(f) { f.items = {}; }   // a run start: everything holds its 4 s again

// values = { id: string | null } -- null means "nothing to show". A fresh or re-appearing value holds for FADE_S.hold,
// a change of a shown value lights it for FADE_S.wake. Mutates and returns the fader.
export function sample(f, values, t) {
  f.t = t;
  for (const id of Object.keys(values)) {
    const v = values[id], it = f.items[id];
    if (!it) { f.items[id] = { value: v, since: t, changed: false }; continue; }
    if (v === it.value) continue;
    it.changed = it.value !== null && v !== null;
    it.value = v; it.since = t;
  }
  return f;
}

export function phase(f, id) {
  const it = f.items[id];
  if (!it || it.value === null) return 'hidden';
  return f.t - it.since < (it.changed ? FADE_S.wake : FADE_S.hold) ? 'awake' : 'ghost';
}

export function phases(f) { return Object.fromEntries(Object.keys(f.items).map(id => [id, phase(f, id)])); }

// the key bar has one timer of its own, restarted by a new context signature (KEYBAR.sig in index.html)
export function createKeybar(t = 0) { return { sig: null, since: t }; }
export function keybarPhase(k, sig, t) {
  if (k.sig !== sig) { k.sig = sig; k.since = t; }
  return t - k.since < FADE_S.keybar ? 'awake' : 'ghost';
}

// what a mode shows at all -- mirrors the CSS in index.html: body.cruise hides the clock, the pips and the target
// (#551), body.tutorial hides the clock (#534). Blitz, hunt and view are timed and show everything.
const TRIAL_ONLY = new Set(['tr', 'best', 'cps', 'pips', 'arrow', 'dist', 'cpname']);
export function visibleInMode(id, mode) {
  if (mode === 'cruise') return !TRIAL_ONLY.has(id);
  if (mode === 'tutorial') return id !== 'tr' && id !== 'best';
  return true;
}

// 'NE 37°' for the map bar; east is 'E' or the language's letter ('O' in German), so NE → NO and SE → SO
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function headingText(deg, east = 'E') {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${POINTS[Math.round(d / 45) % 8].replace('E', east)} ${d}°`;
}
```

- [ ] **Step 4: Run the tests, see them pass.** `node --test tests/hudfade.test.mjs`.
- [ ] **Step 5: Commit.** `feat(hud): hudfade.js, the pure fade and heading rules (#773)`

## Task 2: Wire the fade into `index.html`

**Files:** modify `index.html` (markup, CSS, import, `hud()`, keydown, debug hook).

- [ ] **Step 1: Give the `#gear` plates ids.** In the markup starting `<div id="gear">`, change the three plates:

```html
      <div id="dmgplate" class="plate"><span data-i18n="damage">Damage</span> <b id="dmgpct">0%</b><div id="dmg" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-i18n-aria="damage"><i></i></div></div>
      <div id="gearplate" class="plate"><span data-i18n="gear">Gear</span><b id="gearn">N</b></div>
      <div id="switcharrow" class="plate" hidden></div>
      <div id="tripplate" class="plate"><span data-i18n="trip">Trip</span><b id="trip">0.0</b> km<div id="odo" style="font-size:12px;letter-spacing:1px;color:var(--steel-l)">Total 0 km · K resets trip</div></div>
```

- [ ] **Step 2: CSS.** Right after the line `#blink{display:flex;gap:10px;...}#blink .on{color:#ff9a1a}` add:

```css
/* #773: the secondary HUD fades to a ghost 4 s after its last change and lights for 3 s when it changes (hudfade.js);
   a glyph of the blinker row shows only while that signal is on; the damage plate is gone at 0 % */
#tl,#gear .plate,#watername,#roadname,#autoline,#prompt,#best,#keybar{transition:opacity .6s}
.ghost{opacity:.28}
.gone{display:none!important}
#blink span:not(.on){visibility:hidden}
```

  and extend the reduced-motion line to `@media (prefers-reduced-motion:reduce){#arrow,#navarrow,#tl,#gear .plate,#watername,#roadname,#autoline,#prompt,#best,#keybar{transition:none}}`.

- [ ] **Step 3: Import.** Next to `import { actionFor, contextKeyAction, barEntries, menuEntries, contextLabel, KEYBAR_KEY, keybarOnFrom } from './controls.js';   // #535` add:

```js
import { FADED, createFader, resetFader, sample, phase, phases, createKeybar, keybarPhase, visibleInMode, headingText } from './hudfade.js';   // #773
```

- [ ] **Step 4: State and step.** Directly above `function hud(dt) {` add:

```js
// #773: the fader -- game time, so a slow tab and the __mm.hudFade hook agree; the sampled values are what the player sees
const FADER = createFader(0), KEYBAR_FADE = createKeybar(0);
function fadeValues() {
  const text = (id) => $(id).textContent || null;
  return {
    tl: `${$('modetext').textContent}|${$('cpn').textContent}`,
    dmgplate: Math.round(P.dmg * 100) > 0 ? $('dmgpct').textContent : null,
    gearplate: $('gearn').textContent,
    tripplate: `${Math.floor(P.trip)}|${HUD.tripResets || 0}`,
    watername: text('watername'), roadname: text('roadname'), autoline: text('autoline'), prompt: text('prompt'),
    best: visibleInMode('best', R.mode) ? $('best').textContent : null,
  };
}
function stepHudFade(dt) {
  sample(FADER, fadeValues(), FADER.t + dt);
  for (const id of FADED) { const ph = phase(FADER, id); $(id).classList.toggle('ghost', ph === 'ghost'); if (id === 'dmgplate') $(id).classList.toggle('gone', ph === 'hidden'); }
  $('keybar').classList.toggle('ghost', keybarPhase(KEYBAR_FADE, KEYBAR.sig, FADER.t) === 'ghost');
}
window.__mm.hudFade = (secs = 0) => { stepHudFade(secs); return { t: FADER.t, phases: phases(FADER), keybar: $('keybar').classList.contains('ghost') ? 'ghost' : 'awake', compass: !!$('compass'), heading: $('maphead').textContent }; };
```

  (`$('compass')` returns `null` once Task 3 has removed the element; `$('maphead')` exists after Task 3 — do Task 3 before running the page.)

- [ ] **Step 5: Call it every frame.** In `function hud(dt) { ... }`, the statement list ends with `... setFullMap(!!keys.Tab && $('overlay').hidden); drawMap();`. Insert `stepHudFade(dt);` before `drawMap();` so it reads `setFullMap(!!keys.Tab && $('overlay').hidden); stepHudFade(dt); drawMap();`.

- [ ] **Step 6: A run start resets the fader.** `hud()` runs on the start screen too, so without a reset every plate would already be a ghost when the run begins. In `function startRace(mode = 'trial', rng = Math.random) {` find `R.done = 0; R.t = 0;` and change it to `R.done = 0; R.t = 0; resetFader(FADER); KEYBAR_FADE.sig = null;   /* #773: every plate holds its 4 s from the run start, the key bar its 30 s */`.

- [ ] **Step 7: K counts resets.** In the keydown handler change `if (e.code === 'KeyK') { P.trip = 0; }` to `if (e.code === 'KeyK') { P.trip = 0; HUD.tripResets = (HUD.tripResets || 0) + 1; }   /* #773: a reset wakes the trip plate */`.

- [ ] **Step 8: Commit.** `feat(hud): fade the secondary HUD to a ghost, damage only above 0, blinkers only while on (#773)`

## Task 3: Compass into the minimap

**Files:** modify `index.html`, `strings.js`.

- [ ] **Step 1: Remove the element.** Delete the whole line starting `  <svg id="compass" viewBox="-50 -50 100 100" aria-label="Compass" data-i18n-aria="compassAria">` (one line, ends `</svg>`).
- [ ] **Step 2: Remove its CSS.** Delete the line `#compass{position:fixed;right:16px;top:calc(124px + env(safe-area-inset-top,0px));width:76px;height:76px}`. In the `body.hud-off ...{visibility:hidden}` line drop `body.hud-off #compass,`. In the three `body:has(#overlay:not([hidden])) :is(#tl,#tr,#bl,#br,#compass,#stylebtn,...)` lines (overlay, worlds, about) drop `#compass,` (Task 4 drops `#stylebtn,` from the same lists). Update the two comments that place things "under the compass" (`/* #106 Navi panel: right edge, under the compass and the pause button, above the minimap */` → `under the pause button`; the `#tc` comment `clear of the compass and of the pause/radio column` → `clear of the pause/radio column`).
- [ ] **Step 3: Heading in the map bar.** Change `<span id="mapfloor" hidden></span><b>N ↑</b></div>` to `<span id="mapfloor" hidden></span><b><span id="maphead">N 0°</span> · N ↑</b></div>`.
- [ ] **Step 4: Write the heading, drop the rose.** In `function hud(dt) {` replace `$('rose').setAttribute('transform', `rotate(${-bearing()})`);` with `$('maphead').textContent = headingText(bearing(), tr('compassEast'));`.
- [ ] **Step 5: The needle on the car marker.** In `function drawMap() {`, the marker ends `mg.fillStyle = '#f5efe0'; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = '#1c1f26'; mg.stroke(); mg.restore(); }`. Insert before `mg.restore();`: `mg.beginPath(); mg.moveTo(10, 0); mg.lineTo(22, 0); mg.lineWidth = 2; mg.strokeStyle = '#ffc61a'; mg.stroke();   /* #773: the heading needle, the compass lives here now */`.
- [ ] **Step 6: Strings.** In `strings.js` delete `  compassAria: 'Compass',` and `  compassAria: 'Kompass',` (keep `compassEast` in both languages).
- [ ] **Step 7: Check in the browser.** `grep -n "compass" index.html` must show only the `bearing` comment (`// compass bearing: 0 = north`), `COMPASS_PTS`, `__mm.hud`'s `compass:` field and the helicopter / on-foot comments. Load the page, start cruise: no console error, `#maphead` shows e.g. `N 0°`.
- [ ] **Step 8: Commit.** `feat(hud): move the compass into the minimap, heading in the map bar (#773)`

## Task 4: `#stylebtn` goes, `#pausestyle` everywhere, `#game-nav` only in dialogs

**Files:** modify `index.html`, `pause.js`, `tests/pause.test.mjs`, `tests/test_pause.py`, `tests/test_tutorial.py`, `tests/test_phone_hud.py`.

- [ ] **Step 1: Update the node test first.** In `tests/pause.test.mjs` change the three expectations:
  - `assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pausevehicle', 'pausestyle', 'pauseabout', 'pausekeybar', 'pauserestart', 'pausemenu']);   // #509: About after Change vehicle; #535: the key bar toggle after About; #773: the style switch after Change vehicle`
  - `assert.deepEqual(pauseButtonsFor('cruise'), ['pauseresume', 'pausevehicle', 'pausestyle', 'pauseabout', 'pausekeybar', 'pausemenu']);`
  - `assert.deepEqual(pauseButtonsFor('tutorial'), ['pauseresume', 'pausevehicle', 'pausestyle', 'pauseabout', 'pausekeybar', 'pausetutorial']);`
  Run `node --test tests/pause.test.mjs` → fails.
- [ ] **Step 2: `pause.js`.** `PAUSE_BUTTONS = ['pauseresume', 'pausevehicle', 'pausestyle', 'pauseabout', 'pausekeybar', 'pauserestart', 'pausemenu']` and `TUTORIAL_PAUSE = ['pauseresume', 'pausevehicle', 'pausestyle', 'pauseabout', 'pausekeybar', 'pausetutorial']`. Run the node test → passes.
- [ ] **Step 3: `index.html` markup.** Delete the line `  <button id="stylebtn" type="button"><span data-i18n="styleLabel">Style:</span> <b id="stylename">Original</b> · T</button>` and, since `renderStyleName()` writes `$('stylename')`, change it to `function renderStyleName() { const name = tr(STYLES[styleKey].nameKey); for (const id of ['stylebtn2', 'pausestyle']) $(id).textContent = `${tr('styleLabel')} ${name}`; }   // #773: the pause dialog and the start screen carry the style switch; T too`. Change `for (const id of ['stylebtn', 'stylebtn2', 'pausestyle']) document.getElementById(id).onclick = toggleStyle;` to `for (const id of ['stylebtn2', 'pausestyle']) ...`. Update the `#pausestyle` comment in the pause markup to `<!-- #773: the style switch while driving (T on a keyboard) -->`.
  `grep -n "stylename" index.html tests/*.py` → `tests/test_phone_hud.py` waits on `#stylename` (Step 6 fixes it); nothing else may reference it.
- [ ] **Step 4: `index.html` CSS.** Delete the `#stylebtn{position:fixed;...}` line, the `#stylebtn b{color:var(--sun)}` line, the two-line `/* #776: on a phone the button lay over the minimap ... a tablet keeps the button. */` comment, `#pausestyle{display:none}` and `@media (max-width:600px) and (pointer:coarse){#stylebtn{display:none}#pausestyle{display:block}}`. Drop `body.hud-off #stylebtn,` from the `hud-off` line and `#stylebtn,` from the three `:is(...)` lists. Drop the `#stylebtn` mention in the comment `above #stylebtn: the HUD owns both bottom corners` (→ `the HUD owns both bottom corners`).
- [ ] **Step 5: `#game-nav` while driving on every width.** In the `<style>` above `<nav id="game-nav"`, change
  `  @media (max-width: 600px) { body:not(:has(:is(#overlay,#worlds,#about,#carsel,#pause,#abandon):not([hidden]))) #game-nav { display: none !important; } }`
  to
  `  body:not(:has(:is(#overlay,#worlds,#about,#carsel,#pause,#abandon):not([hidden]))) #game-nav { display: none !important; }`
  and its comment to `/* #776, #773: the footer is for dialogs only; while driving it is clutter (and on a phone it lay over the minimap) */`.
- [ ] **Step 6: Focus-order and phone tests.**
  - `tests/test_pause.py`: in `test_keyboard_navigation_and_main_menu_asks_first` change `["ArrowDown"] * 5` to `["ArrowDown"] * 6` (comment: `# #509/#535/#773: seven buttons`) and the expectation to
    `assert seen == ["pauseresume", "pausevehicle", "pausestyle", "pauseabout", "pausekeybar", "pauserestart", "pausemenu", "pauserestart", "pausemenu", "pauseresume", "pausemenu"]`.
  - `tests/test_tutorial.py`: `assert seen == ["pausevehicle", "pausestyle", "pauseabout", "pausekeybar", "pausetutorial"], seen`.
  - `tests/test_phone_hud.py`: in `test_phone_pause_switches_style` replace `page.wait_for_function("() => document.getElementById('stylename').textContent === 'Glatt'", timeout=T)` with `page.wait_for_function("() => document.getElementById('pausestyle').textContent === 'Stil: Glatt'", timeout=T)`. Replace `test_tablet_keeps_the_style_button` by:

```python
def test_tablet_has_the_style_switch_in_pause_only(server):
    """#773: #stylebtn is gone on every device; the pause dialog carries the switch everywhere."""
    with sync_playwright() as p:
        b, page = open_phone(p, server, width=900, height=600)
        start(page, "#cruisebtn")
        gone = page.evaluate("() => document.getElementById('stylebtn') === null")
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        pausestyle = page.evaluate("() => getComputedStyle(document.getElementById('pausestyle')).display")
        b.close()
    assert gone
    assert pausestyle != "none"
```

  (`open_phone` must accept `width`/`height` as it does on `main`; keep its signature.)
- [ ] **Step 7: Commit.** `feat(hud): drop #stylebtn for the pause switch and T, hide the footer while driving (#773)`

## Task 5: Update the existing HUD tests and the screenshot tool

**Files:** modify `tests/test_hud_toggle.py`, `tests/test_i18n.py`, `tests/test_toast.py`, `tests/test_navi.py`, `tests/test_shots.py`, `scripts/shots.py`.

- [ ] **Step 1: `tests/test_hud_toggle.py`.** `HUD_PARTS = ["#tl", "#tr", "#bl", "#br", "#pausebtn", "#arrow"]` (the compass is gone, the footer is `display:none` while driving and no longer a HUD part).
- [ ] **Step 2: `tests/test_i18n.py`.** In the big `shown` evaluate replace the two lines
  `east: document.querySelector('#rose text:nth-of-type(2)').textContent,` and
  `compass: document.querySelector('#compass').getAttribute('aria-label'),` with
  `heading: document.querySelector('#maphead').textContent,` and the assertion
  `assert shown["east"] == "O" and shown["compass"] == "Kompass" and shown["speedo"] == "Tachometer"` with
  `assert shown["heading"].endswith("°") and shown["speedo"] == "Tachometer"`. (The start car heads roughly north-east: a German page must read `NO ...°` once a frame has run; the test samples before the start, so only the degree sign is asserted here. The de letter is covered by `hudfade.test.mjs`.)
- [ ] **Step 3: `tests/test_toast.py`.** In `RECTS_JS` drop `compass: r('compass'),` and in the loop `for name in ("tl", "tr", "compass", "debug"):` drop `"compass"`.
- [ ] **Step 4: `tests/test_navi.py`.** In `RECTS_JS` the list `['tl', 'tr', 'compass', 'br', 'debug', 'toast', 'pausebtn', 'stylebtn']` becomes `['tl', 'tr', 'br', 'debug', 'toast', 'pausebtn']`.
- [ ] **Step 5: `scripts/shots.py` + `tests/test_shots.py`.** `HIDDEN_SELECTORS = ("#tl", "#tr", "#bl", "#br", "#pausebtn", "#arrow", "#game-nav", "#debug", "#toast", "#keybar", "#navi", "#touch", "#radiobtn", "#radiopanel")` and in `test_hidden_selectors_cover_the_hud_the_toast_and_the_footer` the tuple becomes `("#tl", "#tr", "#bl", "#br", "#game-nav", "#debug", "#toast", "#arrow")`.
- [ ] **Step 6: Commit.** `test(hud): follow the compass and style button into the map and the pause menu (#773)`

## Task 6: Playwright test for the fade, the modes and the merged compass

**Files:** create `tests/test_hud_fade.py`.

- [ ] **Step 1: Write the test.** Full file:

```python
"""#773: the secondary HUD fades to a ghost after 4 s of game time and wakes for 3 s on a change; damage only above 0;
the key bar ghosts after 30 s and returns on a new context; cruise hides the clock and the target; the compass lives
in the minimap; #stylebtn is gone; the footer hides while driving. Hand layout (terrain + world blocked), game time
through window.__mm.hudFade(secs) -- never wall-clock waits. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.hudFade && document.querySelector('#worldstatus')?.textContent"
T = 120000
SHOWN = "(s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }"
FADE = "(secs) => window.__mm.hudFade(secs)"


def open_hand(p, server, start="#cruisebtn", query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=240000)
    page.click(start)
    page.wait_for_function("() => ['armed', 'racing'].includes(window.__mm.pause().state) && window.__mm.pause().frame >= 5", timeout=T)
    return b, page, errors


def ghost(page, sel):
    return page.evaluate("(s) => document.querySelector(s).classList.contains('ghost')", sel)


def test_secondary_hud_ghosts_after_four_seconds_and_wakes_on_change(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        lit = page.evaluate(FADE, 0)
        after = page.evaluate(FADE, 5)                       # 5 s of game time, no change
        classes = {s: ghost(page, s) for s in ["#tl", "#gearplate", "#tripplate", "#roadname"]}
        kept = page.evaluate("() => ['speedo', 'br', 'pausebtn'].map(id => document.getElementById(id).classList.contains('ghost'))")
        page.evaluate("() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 1, [])")   # rolls at 72 km/h: a gear, not N
        page.wait_for_function("() => document.querySelector('#gearn').textContent !== 'N'", timeout=T)
        woke = page.evaluate(FADE, 0)
        still = page.evaluate(FADE, 2.5)                     # frames between the calls add up to 0.05 s each, so stay clear of the 3 s edge
        faded = page.evaluate(FADE, 0.6)
        b.close()
    assert lit["phases"]["tl"] == "awake" and lit["phases"]["gearplate"] == "awake", lit
    assert after["phases"]["tl"] == "ghost" and after["phases"]["gearplate"] == "ghost" and after["phases"]["tripplate"] == "ghost", after
    assert all(classes.values()), classes
    assert kept == [False, False, False]                      # speed, map, pause never fade
    assert woke["phases"]["gearplate"] == "awake" and woke["phases"]["tl"] == "ghost", woke   # only the changed plate wakes
    assert still["phases"]["gearplate"] == "awake" and faded["phases"]["gearplate"] == "ghost", (still, faded)
    assert errors == []


def test_damage_plate_appears_only_above_zero(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        fresh = page.evaluate(FADE, 0)
        gone = page.evaluate("() => getComputedStyle(document.getElementById('dmgplate')).display")
        page.evaluate("() => window.__mm.setDamage(0.3)")
        page.wait_for_function("() => document.querySelector('#dmgpct').textContent !== '0%'", timeout=T)
        hurt = page.evaluate(FADE, 0)
        shown = page.evaluate("() => getComputedStyle(document.getElementById('dmgplate')).display")
        later = page.evaluate(FADE, 4)
        b.close()
    assert fresh["phases"]["dmgplate"] == "hidden" and gone == "none", (fresh, gone)
    assert hurt["phases"]["dmgplate"] == "awake" and shown != "none", (hurt, shown)
    assert later["phases"]["dmgplate"] == "ghost", later
    assert errors == []


def test_key_bar_ghosts_after_thirty_seconds_and_returns_on_a_new_context(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        car = page.evaluate(FADE, 0)
        later = page.evaluate(FADE, 31)
        page.evaluate("() => window.__mm.place(1810, 610, 0)")
        page.keyboard.press("z")                               # out of the car: the foot context
        page.wait_for_function("() => window.__mm.keybar().ctx === 'foot'", timeout=T)
        foot = page.evaluate(FADE, 0)
        b.close()
    assert car["keybar"] == "awake" and later["keybar"] == "ghost" and foot["keybar"] == "awake", (car, later, foot)
    assert errors == []


def test_cruise_hides_the_clock_and_the_target_and_the_trial_shows_them(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        cruise = {s: page.evaluate(SHOWN, s) for s in ["#tr", "#pips", "#arrow", "#dist", "#cpname", "#tl", "#bl", "#br"]}
        cruise_phases = page.evaluate(FADE, 0)["phases"]
        b.close()
    with sync_playwright() as p:
        b, page, errors2 = open_hand(p, server, start="#startbtn", query="?mode=trial")
        trial = {s: page.evaluate(SHOWN, s) for s in ["#tr", "#pips", "#arrow", "#tl"]}
        trial_phases = page.evaluate(FADE, 5)["phases"]
        time_ghost = ghost(page, "#time"); best_ghost = ghost(page, "#best")
        b.close()
    assert cruise == {"#tr": False, "#pips": False, "#arrow": False, "#dist": False, "#cpname": False, "#tl": True, "#bl": True, "#br": True}, cruise
    assert cruise_phases["best"] == "hidden"                   # the fader never wakes what the mode hides
    assert trial == {"#tr": True, "#pips": True, "#arrow": True, "#tl": True}, trial
    assert trial_phases["best"] == "ghost" and best_ghost and not time_ghost   # Bestzeit fades, the clock stays lit
    assert errors == [] and errors2 == []


def test_compass_is_in_the_minimap_and_the_style_button_and_footer_are_gone(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z]; }")
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 0, 0.02, [])")      # heading +x = east
        page.wait_for_function("() => document.getElementById('maphead').textContent.startsWith('E ')", timeout=T)
        east = page.evaluate(FADE, 0)
        page.evaluate(f"() => window.__mm.sim({x}, {z}, -Math.PI / 2, 0, 0.02, [])")   # heading -z = north
        page.wait_for_function("() => document.getElementById('maphead').textContent === 'N 0°'", timeout=T)
        gone = page.evaluate("() => ['compass', 'stylebtn'].map(id => document.getElementById(id) === null)")
        nav_driving = page.evaluate(SHOWN, "#game-nav")
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        nav_paused = page.evaluate(SHOWN, "#game-nav")
        pausestyle = page.evaluate(SHOWN, "#pausestyle")
        b.close()
    assert east["compass"] is False and east["heading"] == "E 90°", east
    assert gone == [True, True]
    assert nav_driving is False and nav_paused is True and pausestyle is True
    assert errors == []
```

- [ ] **Step 2: Commit and push the branch**, then run in the foreground:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_hud_fade.py -x -q`
  If `test_secondary_hud_ghosts...` finds `tl` awake after the 5 s step, check that `renderModeLine()` / the language
  re-render did not rewrite `#modetext` between the two calls (the sampled value must be identical); if the gear never
  leaves `N`, the roll point is off the hand layout's road — use `window.__mm.car()` for the position instead.
- [ ] **Step 3: Commit.** `test(hud): fade, modes, merged compass and the gone style button (#773)`

## Task 7: CHANGELOG

**Files:** modify `CHANGELOG.md`.

- [ ] **Step 1:** Under `## [Unreleased]` → `### Changed`, as the **first** entry, with the Swiss local time of the commit (`TZ=Europe/Zurich date +"%Y-%m-%d %H:%M"`):

```markdown
- `2026-11-09 HH:MM` A **tidier driving HUD**: everything but the speedometer, the clock, the checkpoint arrow and the map now fades to a faint ghost four seconds after it last changed and lights up again for three seconds when it does — the mode plate, gear and trip, the road and water names, the best time. The **damage** plate appears only once the car has taken damage, the blinker glyphs only while a signal is on, and the key bar dims after half a minute and returns when you get out, fly or board. The **compass** has moved into the minimap: the car marker has a needle and the map bar shows the heading in degrees. The style button under the road is gone — switch the style in the **pause** menu or with <kbd>T</kbd> — and the footer links show only on the start screen and in pause.
```

- [ ] **Step 2: Commit.** `docs(changelog): tidier driving HUD (#773)`

## Task 8: Verify and open the PR

- [ ] **Step 1:** `node --test tests/*.test.mjs` passes.
- [ ] **Step 2:** Push, then in the foreground:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_hud_fade.py tests/test_hud_toggle.py tests/test_phone_hud.py tests/test_pause.py tests/test_tutorial.py tests/test_i18n.py tests/test_cruise.py tests/test_keybar.py tests/test_toast.py tests/test_shots.py -x -q`
  (`test_shots.py` and `test_i18n.py` skip their world-dependent cases without `data/world_hochrhein.json`; that is fine.)
- [ ] **Step 3:** Manual checklist in a real browser (desktop): page loads with an empty console; after ~4 s the plates
  dim; a gear change, a new road name or K lights the plate; `#best` dims while `#time` stays; the map bar reads e.g.
  `NE 37° · N ↑` and the marker has a yellow needle; no compass top right; no style button bottom centre; Esc shows
  the pause menu with `Style: Original` as the third button and the footer under it; resume hides the footer.
- [ ] **Step 4:** PR `feat(hud): declutter the driving HUD — fading secondary, compass in the map (#773)` with
  `Closes #773`, listing the removed `#compass` / `#stylebtn` and the three focus-order test changes under Changes.
