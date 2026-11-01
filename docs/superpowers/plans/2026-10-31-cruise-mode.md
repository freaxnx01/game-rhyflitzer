# Cruise mode (#551) Implementation Plan

**Goal:** a fourth mode **Cruise** (no clock, no checkpoints, no finish, no arrow), first on the start screen and the
default (preselected, and used whenever no `?mode=` is given). Spec: `docs/superpowers/specs/2026-10-31-cruise-mode-design.md`.

**Files:** modify `startscreen.js`, `pause.js`, `strings.js`, `index.html`, `CHANGELOG.md`, `tests/startscreen.test.mjs`,
`tests/pause.test.mjs`, `tests/test_start_screen.py`, `tests/test_carselect.py`, `tests/test_world.py`, `tests/test_blitz.py`,
`tests/test_hunt.py`, `tests/test_i18n.py`, `tests/test_pause.py`; create `tests/test_cruise.py`.

**Global constraints**

- The trial button keeps the id `#startbtn` (56 test files click it to start a time trial). Do not rename ids.
- No new key binding. `KeyR` stays "back on the road" (`index.html:3271`).
- Never weaken an existing test: tests that assumed "trial is the default" load `?mode=trial` and keep every assertion;
  only structural lists (bar order, first focus) and the trial button's label change to the new spec values (Task 6).
- Run tests: `node --test tests/*.test.mjs`, then only the Playwright files touched here, in the foreground:
  `pytest tests/test_cruise.py tests/test_start_screen.py tests/test_carselect.py tests/test_world.py tests/test_blitz.py tests/test_hunt.py tests/test_i18n.py tests/test_pause.py -x`.
  Commit and push the branch before starting the Playwright run.

## Task 1 - Pure mode rules in `startscreen.js` (TDD)

- [ ] **Step 1: Write the failing tests.** In `tests/startscreen.test.mjs`, import `startModeFrom, hasCheckpoints` as well,
  and replace the first two tests (`MODES are the three race modes…`, `lastModeFrom: …`) and the `modeTextKey` test with:

```js
test('MODES are cruise and the three race modes in bar order', () => {
  assert.deepEqual(MODES, ['cruise', 'trial', 'blitz', 'hunt']);
});

test('startModeFrom: ?mode= picks a known mode, anything else is cruise', () => {
  assert.equal(startModeFrom('', false), 'cruise');
  assert.equal(startModeFrom('?mode=trial', false), 'trial');
  assert.equal(startModeFrom('?region=ehrendingen&mode=blitz', false), 'blitz');
  assert.equal(startModeFrom('?mode=hunt', false), 'hunt');
  assert.equal(startModeFrom('?mode=cruise', false), 'cruise');
  assert.equal(startModeFrom('?mode=<img onerror=1>', false), 'cruise');
});

test('startModeFrom: a raceless world offers only cruise and hunt', () => {
  assert.equal(startModeFrom('?mode=trial', true), 'cruise');
  assert.equal(startModeFrom('?mode=blitz', true), 'cruise');
  assert.equal(startModeFrom('?mode=hunt', true), 'hunt');
  assert.equal(startModeFrom('', true), 'cruise');
});

test('lastModeFrom: a stored mode wins, junk falls back to cruise, a raceless world keeps only cruise or hunt', () => {
  assert.equal(lastModeFrom('blitz', false), 'blitz');
  assert.equal(lastModeFrom('trial', false), 'trial');
  assert.equal(lastModeFrom(null, false), 'cruise');
  assert.equal(lastModeFrom('<img onerror=1>', false), 'cruise');
  assert.equal(lastModeFrom('blitz', true), 'cruise');
  assert.equal(lastModeFrom('hunt', true), 'hunt');
});

test('modeTextKey: cruise and trial use their intros, blitz and hunt their own intro', () => {
  const strings = { intro: 'introEhrendingen' };
  assert.equal(modeTextKey('cruise', strings), 'cruiseIntro');
  assert.equal(modeTextKey('trial', strings), 'introEhrendingen');
  assert.equal(modeTextKey('blitz', strings), 'blitzIntro');
  assert.equal(modeTextKey('hunt', strings), 'huntIntro');
});

test('hasCheckpoints: only the time trial and Blitz race the checkpoints', () => {
  assert.equal(hasCheckpoints('trial'), true);
  assert.equal(hasCheckpoints('blitz'), true);
  assert.equal(hasCheckpoints('hunt'), false);
  assert.equal(hasCheckpoints('cruise'), false);
});
```

- [ ] **Step 2: Run** `node --test tests/startscreen.test.mjs` - expect failures (missing exports, old MODES).
- [ ] **Step 3: Implement** in `startscreen.js` (replace `MODES`, `lastModeFrom`, `modeTextKey`; add the two new functions):

```js
export const MODES = ['cruise', 'trial', 'blitz', 'hunt'];
// #551: a generated world without a race has no checkpoints, so only these two make sense there
const RACELESS_MODES = ['cruise', 'hunt'];

const allowedModes = (raceless) => (raceless ? RACELESS_MODES : MODES);

// #551: the preselected mode: ?mode= when it names an allowed mode, else cruise (the default)
export function startModeFrom(search, raceless) {
  const wanted = new URLSearchParams(search).get('mode');
  return allowedModes(raceless).includes(wanted) ? wanted : 'cruise';
}

// the mode the slot shows when nothing is focused: the last played one (localStorage mm.lastMode), validated
export function lastModeFrom(stored, raceless) {
  return allowedModes(raceless).includes(stored) ? stored : 'cruise';
}

export function modeTextKey(mode, regionStrings) {
  if (mode === 'cruise') return 'cruiseIntro';
  if (mode === 'blitz') return 'blitzIntro';
  if (mode === 'hunt') return 'huntIntro';
  return regionStrings.intro;
}

// #551: the modes that race the five checkpoints and the finish
export function hasCheckpoints(mode) {
  return mode === 'trial' || mode === 'blitz';
}
```

- [ ] **Step 4: Run** `node --test tests/startscreen.test.mjs` - all pass. Commit `feat(modes): cruise mode rules in startscreen.js (#551)`.

## Task 2 - Pause buttons per mode in `pause.js` (TDD)

- [ ] **Step 1: Write the failing test** (append to `tests/pause.test.mjs`, add `pauseButtonsFor` to the import):

```js
test('pauseButtonsFor_Cruise_HasNoRestart', () => {
  assert.deepEqual(pauseButtonsFor('cruise'), ['pauseresume', 'pausevehicle', 'pauseabout', 'pausemenu']);
});

test('pauseButtonsFor_RaceModes_AreTheFullMenu', () => {
  for (const m of ['trial', 'blitz', 'hunt']) assert.deepEqual(pauseButtonsFor(m), PAUSE_BUTTONS, m);
});
```

- [ ] **Step 2: Run** `node --test tests/pause.test.mjs` - fails.
- [ ] **Step 3: Implement** in `pause.js` below `PAUSE_BUTTONS`:

```js
// #551: cruise has no race to restart, so its menu drops "Restart race"
export function pauseButtonsFor(mode) {
  return mode === 'cruise' ? PAUSE_BUTTONS.filter(id => id !== 'pauserestart') : PAUSE_BUTTONS;
}
```

- [ ] **Step 4: Run** - passes. Commit `feat(modes): pause menu without restart in cruise (#551)`.

## Task 3 - Strings (en + de)

- [ ] In `strings.js`, in **both** language blocks: rename the key `start` to `trial` and set its value to
  `'Time trial'` / `'Zeitfahren'`. Add next to it:

```js
  // en
  cruise: 'Cruise',
  modeCruise: (r) => `Cruising · ${r}`,
  cruiseIntro: 'No clock, no checkpoints. Just drive: cars, on foot, the helicopter, the steam loco. J jumps to any place.',
  // de
  cruise: 'Herumfahren',
  modeCruise: (r) => `Herumfahren · ${r}`,
  cruiseIntro: 'Keine Uhr, keine Checkpoints. Einfach fahren: mit dem Auto, zu Fuss, im Helikopter, mit der Dampflok. J springt an jeden Ort.',
```

- [ ] `grep -n "'start'" index.html` must show no `tr('start')` left after Task 4 (its only use is `renderOverlay`).
- [ ] Run `node --test tests/strings.test.mjs` (key parity, arity) - passes.

## Task 4 - Wire cruise into `index.html`

All edits are in the existing lines named here; keep their surrounding code unchanged.

- [ ] **Imports** (`index.html:626`): add `startModeFrom, hasCheckpoints` to the `./startscreen.js` import. Add
  `pauseButtonsFor` to the existing `./pause.js` import.
- [ ] **Markup** (start bar, `index.html:~409`): insert before `#startbtn`, move `primary` from `#startbtn` to it, and set the
  trial button's fallback text:

```html
        <button id="cruisebtn" class="btn primary" type="button" disabled>Cruise</button>
        <button id="startbtn" class="btn" type="button" disabled>Time trial</button>
```

- [ ] **CSS** (next to the `body.below #arrow…` rule, `index.html:84`):

```css
body.cruise #tl .cps:not(#knockrow),body.cruise #pips,body.cruise #tr,body.cruise #arrow,body.cruise #dist,body.cruise #cpname{display:none}   /* #551: cruise has no clock and nothing to point at */
```

  and in the phone media block (`index.html:203`) append `#cruisebtn{grid-column:1/-1}` so trial/blitz/hunt/car keep their 2x2.
- [ ] **Start mode** (after `const RACELESS = …`, `index.html:4181`):

```js
const START_MODE = startModeFrom(location.search, RACELESS);   // #551: cruise unless ?mode= names another one
R.mode = START_MODE;
```

- [ ] **`startRace`** (`index.html:4182`): replace `if (RACELESS) mode = 'hunt';` with
  `if (RACELESS && mode !== 'cruise') mode = 'hunt';` and replace `const hunt = mode === 'hunt'; for (const c of cpObjs) { … c.g.visible = !hunt; }`
  so the checkpoint visibility reads `c.g.visible = hasCheckpoints(mode);` (keep `const hunt` for the hunt-only parts).
- [ ] **`modeKey`** (`index.html:4184`): `R.mode === 'cruise' ? 'modeCruise' : R.mode === 'hunt' ? 'modeHunt' : …`.
- [ ] **`renderModeLine`** (`index.html:4185`): first statement `document.body.classList.toggle('cruise', R.mode === 'cruise');`.
- [ ] **`stepRace`** (`index.html:4190`): first statement `if (R.mode === 'cruise') { R.target = null; return; }`
  (state stays `armed`: pause works, Main menu never asks to abandon).
- [ ] **`MODE_BTN`** (`index.html:4206`): `{ cruisebtn: 'cruise', startbtn: 'trial', blitzbtn: 'blitz', huntbtn: 'hunt' }`.
- [ ] **`renderOverlay`** (`index.html:4212`): `$('cruisebtn').textContent = tr('cruise');` and the trial label becomes
  `tr(done && R.mode === 'trial' ? 'retry' : 'trial')`.
- [ ] **`focusStart`** (`index.html:4216`):

```js
const startModeButton = () => { const id = Object.keys(MODE_BTN).find(k => MODE_BTN[k] === START_MODE); return id && !$(id).hidden ? $(id) : firstModeButton(); };
function focusStart() { (WORLD_GONE ? $('worldbtn') : startModeButton()).focus(); }   // #551: the preselected mode's button
```

- [ ] **Click handler** next to `$('startbtn').onclick` (`index.html:4219`): `$('cruisebtn').onclick = () => { SFX.start(); startRace('cruise'); };`
- [ ] **`resetMode`** (`index.html:4334`): `R.mode = START_MODE;` instead of `'trial'`; update its comment ("back to the preselected mode").
- [ ] **Pause** (`index.html:4330-4339`): in `openPause` after `PAUSE.on = true;` add
  `$('pauserestart').hidden = !pauseButtonsFor(R.mode).includes('pauserestart');`; in `movePauseFocus` use
  `pauseButtonsFor(R.mode)` instead of `PAUSE_BUTTONS`. `openPause` still focuses `PAUSE_BUTTONS[0]` (Resume, never hidden).
- [ ] **Minimap** (`drawMap`, `index.html:4602`): both `if (R.mode !== 'hunt')` become `if (hasCheckpoints(R.mode))`; the
  hunt branch becomes `else if (R.mode === 'hunt')`.
- [ ] Commit `feat(modes): cruise mode, the new default (#551)`.

## Task 5 - New Playwright test `tests/test_cruise.py`

- [ ] Create (boot helper copied from `tests/test_start_screen.py`, with a `query` argument):

```python
"""#551: cruise -- the default mode, no clock, no checkpoints. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 240000
SHOWN = "(s) => getComputedStyle(document.querySelector(s)).display !== 'none'"


def boot(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def test_cruise_is_preselected_and_enter_starts_it(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start = page.evaluate("() => ({ focus: document.activeElement.id, text: document.querySelector('#ovtext').textContent, label: document.querySelector('#cruisebtn').textContent })")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.keyboard.down("KeyW"); page.wait_for_timeout(1500); page.keyboard.up("KeyW")
        s = page.evaluate("() => ({ ...window.__mm.hunt(), mode: window.__mm.blitz().mode })")
        line = page.text_content("#tl .mode")
        shown = {sel: page.evaluate(SHOWN, sel) for sel in ["#tr", "#arrow", "#dist", "#cpname", "#pips"]}
        b.close()
    assert start["focus"] == "cruisebtn" and "No clock" in start["text"] and start["label"] == "Cruise", start
    assert s["mode"] == "cruise" and s["state"] == "armed" and not s["cpsVisible"] and s["boxesVisible"] == 0, s
    assert line == "Cruising · Hochrhein"
    assert shown == {"#tr": False, "#arrow": False, "#dist": False, "#cpname": False, "#pips": False}, shown
    assert errors == []


def test_cruise_pause_has_no_restart_and_main_menu_goes_straight_back(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#cruisebtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        restart_hidden = page.evaluate("() => document.querySelector('#pauserestart').hidden")
        seen = []
        for _ in range(4):
            page.keyboard.press("ArrowDown")
            seen.append(page.evaluate("() => document.activeElement.id"))
        page.click("#pausemenu")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        after = page.evaluate("() => ({ abandon: !document.querySelector('#abandon').hidden, focus: document.activeElement.id, mode: window.__mm.blitz().mode })")
        b.close()
    assert restart_hidden is True
    assert seen == ["pausevehicle", "pauseabout", "pausemenu", "pauseresume"], seen
    assert after == {"abandon": False, "focus": "cruisebtn", "mode": "cruise"}, after
    assert errors == []


def test_mode_query_preselects_the_time_trial(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?mode=trial")
        got = page.evaluate("() => ({ focus: document.activeElement.id, mode: window.__mm.blitz().mode, line: document.querySelector('#tl .mode').textContent })")
        b.close()
    assert got == {"focus": "startbtn", "mode": "trial", "line": "Time trial · Hochrhein"}, got
    assert errors == []
```

- [ ] Commit `test(modes): cruise default, HUD and pause (#551)`.

## Task 6 - Keep the existing Playwright tests working (no assertion weakened)

Each file below assumed "the time trial is the default". Two kinds of change only:
**(a)** load `?mode=trial` so the test keeps every assertion it had, or **(b)** update a structural expectation that the
spec changes on purpose (bar order, first focus, trial button label).

- [ ] `tests/test_start_screen.py`
  - (b) `BAR = ["cruisebtn", "startbtn", "blitzbtn", "huntbtn", "carbtn"]`; in `test_bar_order_focus_order_and_enter_starts`
    `first == "cruisebtn"` and `order == ["startbtn", "blitzbtn", "huntbtn", "carbtn", "worldbtn"]`.
  - (a) `boot()` gets `query=""` (appended to `index.html`); `test_mode_text_follows_focus_and_remembers_the_last_mode`
    boots with `"?mode=trial"` (the reload keeps the query; stored `blitz` still wins for the unfocused slot).
  - `test_phone_layout_and_screenshots` stays unchanged: `#cruisebtn` spans the full row, trial/blitz share the next one.
- [ ] `tests/test_carselect.py`
  - (b) `test_choose_car_opens_the_screen_with_the_compact`: bar list `["cruisebtn", "startbtn", "blitzbtn", "huntbtn", "carbtn"]`.
  - (a) the same test and `test_third_vehicle_and_race` call `open_page(p, server, query="?mode=trial")`
    (subtitle "Time trial · Hochrhein", raced mode `trial`).
- [ ] `tests/test_world.py`
  - `MODES_DISABLED` lists `['cruisebtn', 'startbtn', 'blitzbtn', 'huntbtn']`, so the two asserts become `[True] * 4` / `[False] * 4` (stricter).
  - (b) line 167: focus after DRIVE HERE is `"cruisebtn"` (the first and preselected mode button).
- [ ] `tests/test_blitz.py`: `open_page(..., query="")`; (a) `test_abandoning_a_blitz_run_returns_the_start_screen_to_the_time_trial`
  and `test_the_time_trial_is_untouched_and_german_labels_switch_mid_run` load `?mode=trial`;
  (b) line 74: `text(page, "#startbtn") == "Time trial"`.
- [ ] `tests/test_hunt.py`: `open_page(..., query="")`; (a) `test_main_menu_after_a_hunt_is_the_time_trial_start_screen` loads
  `?mode=trial`; (b) line 79: `#startbtn == "Time trial"`.
- [ ] `tests/test_i18n.py`: `open_page(..., query="")`; (a) `test_browser_language_decides_without_a_stored_choice` and
  `test_toggle_switches_live_and_persists` load `?mode=trial` (mode line and intro stay the trial's);
  (b) line 114: `live["startbtn"] == "Zeitfahren"`.
- [ ] `tests/test_pause.py`: `open_page(..., query="")`; (a) `test_keyboard_navigation_and_main_menu_asks_first` loads
  `?mode=trial` (focus back on `startbtn`); (b) line 144: `start_text == "Time trial"`.
- [ ] Check once more for missed assumptions:
  `grep -rnE "\"Start\"|activeElement.id\"\) == \"startbtn|'mode'\] == \"trial|Time trial · |Zeitfahren · " tests/*.py` - every hit
  must either click `#startbtn`/`startHunt` first or load `?mode=trial`.
- [ ] Run the Playwright files from the Global constraints (foreground). Commit `test: keep trial-default tests on ?mode=trial (#551)`.

## Task 7 - Changelog

- [ ] Under `## [Unreleased]` → `### Added` (create the heading if missing), with the go-live time:

```markdown
- `YYYY-MM-DD HH:MM` New mode **Cruise**: just drive around, with no clock, no checkpoints and no arrow. It is now the first button on the start screen and the one that starts with Enter; the time trial has its own **Time trial** button.
```

- [ ] Commit `docs(changelog): cruise mode (#551)`.
