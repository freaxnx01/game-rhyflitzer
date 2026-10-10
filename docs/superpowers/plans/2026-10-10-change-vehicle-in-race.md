# Change the vehicle during a race (#189) — implementation plan

**Goal:** a "Change vehicle" button in the pause menu opens the existing car selection over the frozen race; applying a different vehicle resumes the run with it and flags the result "does not count".

**Spec:** `docs/superpowers/specs/2026-10-10-change-vehicle-in-race-design.md` (decisions A0-A2 are open for the maintainer; the defaults below are what to implement).

## Global constraints

- **No `//` comment in the middle of a one-line statement in `prototype/index.html`.** The lines below end in a trailing `// ...` comment after the last statement or have none; keep it that way. Every edit is on one existing line or one new line.
- Locate code **by the quoted content**, not by line number (numbers are from `main` 4587571 and drift).
- Frame-bound browser tests reach their end state through test hooks and `element.click()` in `page.evaluate`, never through loosened assertions or longer timeouts. Do not use `drive()` / Space to start the race in the new tests.
- Playwright in the **foreground**, capped, output to a file (call timeout 600000 ms):
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest <files> -q > /tmp/out.txt 2>&1` (use `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` if your checkout has no `.venv`). Node tests: `node --test prototype/tests/*.test.mjs`.
- Run only the files named per task, not the ~2 h full browser suite.
- Strings: `en` and `de` get the same keys, Swiss spelling (no `ß`), real umlauts.
- Branch `feature/189-change-vehicle`; commit `feat(vehicles): change the vehicle from the pause menu during a race (#189)`; PR body `Closes #189`. Add one line under `[Unreleased]` in `CHANGELOG.md` in the player's voice (e.g. „Im Pausenmenü kann das Fahrzeug mitten im Rennen gewechselt werden; so ein Rennen zählt nicht für die Bestzeit.“).

### Task 1: Strings and the pause button order (pure parts, node tests)

**Files:** `prototype/strings.js`, `prototype/pause.js`, `prototype/tests/pause.test.mjs`.

- [ ] **Step 1: Failing node test.** In `prototype/tests/pause.test.mjs`, in the test `nextFocus wraps both ways ...` replace the five `PAUSE_BUTTONS` assertions (the block starting `assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pauserestart', 'pausemenu']);`) with:

```js
  assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pausevehicle', 'pauserestart', 'pausemenu']);
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', 1), 'pausevehicle');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pausemenu', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', -1), 'pausemenu');
  assert.equal(nextFocus(PAUSE_BUTTONS, '', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'gl', -1), 'pauseresume');
```
Run `node --test prototype/tests/*.test.mjs`: expect that one test to fail.

- [ ] **Step 2:** in `prototype/pause.js` change `export const PAUSE_BUTTONS = ['pauseresume', 'pauserestart', 'pausemenu'];` to `export const PAUSE_BUTTONS = ['pauseresume', 'pausevehicle', 'pauserestart', 'pausemenu'];`.

- [ ] **Step 3: strings.** In `prototype/strings.js`, `en` block: after the line `  notCountedHeli: 'with the helicopter, not counted · ',` add `  notCountedSwap: 'with a vehicle change, not counted · ',`; after `  pauseRestart: 'Restart race',` add `  pauseVehicle: 'Change vehicle',`; after `  carselRace: 'Race! ›',` add `  carselDriveOn: 'Drive on ›',`; change `  keyPause: 'pause: resume · restart race · main menu',` to `  keyPause: 'pause: resume · change vehicle · restart race · main menu',`.
  `de` block: after `  notCountedHeli: 'mit Helikopter, zählt nicht · ',` add `  notCountedSwap: 'mit Fahrzeugwechsel, zählt nicht · ',`; after `  pauseRestart: 'Rennen neu starten',` add `  pauseVehicle: 'Fahrzeug wechseln',`; after `  carselRace: 'Los! ›',` add `  carselDriveOn: 'Weiterfahren ›',`; change `  keyPause: 'Pause: weiter · Rennen neu starten · Hauptmenü',` to `  keyPause: 'Pause: weiter · Fahrzeug wechseln · Rennen neu starten · Hauptmenü',`.

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs`: all pass (`strings.test.mjs` checks equal keys).

### Task 2: Failing browser tests

**Files:** `prototype/tests/test_carselect.py` (append), `prototype/tests/test_pause.py`, `prototype/tests/test_navi.py`.

- [ ] **Step 1: Append to `test_carselect.py`:**

```python
CLICK = "(sel) => document.querySelector(sel).click()"
RUN = """() => ({ pause: window.__mm.pause(), dmg: window.__mm.hunt().dmg, top: window.__mm.vehicle().drive.top,
  flags: window.__mm.raceFlags(), paused: !document.querySelector('#pause').hidden })"""


def pause_in_a_run(page):
    """#189: racing, a clock of 12.5 s and 40 % damage in zero frames (test hook), then the pause menu."""
    page.click("#startbtn", timeout=T)
    page.evaluate("() => window.__mm.raceNow(12.5, 0.4)")
    page.keyboard.press("Escape")
    page.wait_for_function("() => window.__mm.pause().on", timeout=T)


def open_swap(page):
    page.evaluate(CLICK, "#pausevehicle")
    page.wait_for_function("() => window.__mm.carsel().open", timeout=T)


def test_changing_the_vehicle_mid_race_keeps_the_run_and_flags_it(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pause_in_a_run(page)
        before = page.evaluate(RUN)
        open_swap(page)
        shown = page.evaluate("() => ({ pauseShown: !document.querySelector('#pause').hidden, drive: document.querySelector('#csrace').textContent })")
        page.evaluate(CLICK, "#csnext")
        page.wait_for_function("() => window.__mm.carsel().id === 'delorean'", timeout=T)
        page.evaluate(CLICK, "#csrace")
        page.wait_for_function("() => !window.__mm.carsel().open && !window.__mm.pause().on", timeout=T)
        after = page.evaluate(RUN)
        page.evaluate("() => window.__mm.finishNow()")
        result = page.inner_text("#result")
        b.close()
    assert before["pause"]["t"] == 12.5 and before["top"] == 60 and before["flags"]["swapped"] is False
    assert shown == {"pauseShown": False, "drive": "Drive on ›"}
    assert after["top"] == 49 and after["flags"]["swapped"] is True
    assert (after["pause"]["x"], after["pause"]["z"]) == (before["pause"]["x"], before["pause"]["z"])
    assert before["pause"]["t"] <= after["pause"]["t"] < before["pause"]["t"] + 1      # the clock resumes where it stopped (a few capped frames at most)
    assert after["dmg"] == 0.4
    assert "with a vehicle change, not counted" in result, result
    assert errors == []


def test_back_in_a_vehicle_change_restores_the_choice_and_flags_nothing(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pause_in_a_run(page)
        open_swap(page)
        page.evaluate(CLICK, "#csnext")
        page.wait_for_function("() => window.__mm.carsel().id === 'delorean'", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.carsel().open", timeout=T)
        got = page.evaluate(RUN)
        stored = page.evaluate("() => JSON.parse(localStorage.getItem('mm.car')).id")
        focus = page.evaluate("() => window.__mm.pause().focus")
        chosen = page.evaluate("() => window.__mm.carsel().id")
        b.close()
    assert chosen == "compact" and stored == "compact" and got["top"] == 60
    assert got["paused"] is True and got["pause"]["on"] is True and focus == "pausevehicle"
    assert got["flags"]["swapped"] is False and got["pause"]["t"] == 12.5
    assert errors == []


def test_a_paint_change_mid_race_is_not_a_vehicle_change(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pause_in_a_run(page)
        open_swap(page)
        page.evaluate("() => document.querySelector('#cspaints button:not([aria-pressed=\"true\"])').click()")
        page.evaluate(CLICK, "#csrace")
        page.wait_for_function("() => !window.__mm.carsel().open && !window.__mm.pause().on", timeout=T)
        got = page.evaluate(RUN)
        b.close()
    assert got["flags"]["swapped"] is False and got["top"] == 60
    assert errors == []
```

- [ ] **Step 2: `test_pause.py`.** In `test_keyboard_navigation_and_main_menu_asks_first` replace `for k in ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Tab", "Shift+Tab"]:` with `for k in ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Tab", "Shift+Tab"]:` and the assertion `assert seen == ["pauseresume", "pauserestart", "pausemenu", "pauseresume", "pausemenu", "pauseresume", "pausemenu"]` with `assert seen == ["pauseresume", "pausevehicle", "pauserestart", "pausemenu", "pauseresume", "pausemenu", "pauseresume", "pausemenu"]`. In `test_phone_pause_button_and_menu_fit` change `buttons: ['pauseresume', 'pauserestart', 'pausemenu'].map(` to `buttons: ['pauseresume', 'pausevehicle', 'pauserestart', 'pausemenu'].map(` and `["Weiter", "Rennen neu starten", "Hauptmenü"]` to `["Weiter", "Fahrzeug wechseln", "Rennen neu starten", "Hauptmenü"]`.

- [ ] **Step 3: `test_navi.py`** (line with `assert before == {"flags": {"jumped": False, "flown": False, "auto": False}, ...`): add `"swapped": False` to the flags dict: `{"jumped": False, "flown": False, "auto": False, "swapped": False}`.

- [ ] **Step 4: Run** `test_carselect.py -k "mid_race or vehicle_change"`: expect the three new tests to FAIL (`raceNow` is not a function).

### Task 3: The implementation in `prototype/index.html`

Seven small edits, each on the quoted line.

- [ ] **Step 1: Button.** After `<button id="pauseresume" class="btn primary" type="button" data-i18n="pauseResume">Resume</button>` insert on a new line (same indentation): `<button id="pausevehicle" class="btn" type="button" data-i18n="pauseVehicle">Change vehicle</button>`.

- [ ] **Step 2: State.** Line `const CARSEL = { on: false, spin: { angle: 0, idle: SPIN_RESUME }, dir: 0, drag: 0, dragX: null };` becomes `const CARSEL = { on: false, spin: { angle: 0, idle: SPIN_RESUME }, dir: 0, drag: 0, dragX: null, swap: null };   // swap: {id, paint} at entry while the pause menu's Change vehicle is open (#189), else null`.

- [ ] **Step 3: Close / cancel / apply.** In the line starting `function closeCarSel() { CARSEL.on = false;` insert `if (CARSEL.swap) { cancelVehicleSwap(); return; } ` right after `function closeCarSel() { `. Directly **after** that line add four new lines:

```js
function openVehicleSwap() { if (!PAUSE.on || PAUSE.confirm) return; CARSEL.swap = { id: CHOICE.id, paint: CHOICE.paint }; $('pause').hidden = true; openCarSel(); }
function leaveVehicleSwap() { CARSEL.swap = null; CARSEL.on = false; CARSEL.dir = 0; $('carsel').hidden = true; }
function cancelVehicleSwap() { const { id, paint } = CARSEL.swap; if (id !== CHOICE.id) selectVehicle(id); if (paint !== CHOICE.paint) { applyPaint(paint); saveChoice(); } leaveVehicleSwap(); $('pause').hidden = false; $('pausevehicle').focus(); }
function applyVehicleSwap() { if (CARSEL.swap.id !== CHOICE.id) R.swapped = true; leaveVehicleSwap(); closePause(); }
```
In the line starting `$('csrace').onclick = () => { CARSEL.on = false;` insert `if (CARSEL.swap) { applyVehicleSwap(); return; } ` right after `() => { `. The line starting `$('pausebtn').onclick = () => openPause();` holds several assignments and ends with `$('abandonok').onclick = toMainMenu;`: append ` $('pausevehicle').onclick = openVehicleSwap;` at its end.

- [ ] **Step 4: Label.** In `function renderCarSel() { const ids = Object.keys(VEHICLES),` insert as the first statement, right after `function renderCarSel() { `: `$('csrace').dataset.i18n = CARSEL.swap ? 'carselDriveOn' : 'carselRace'; $('csrace').innerHTML = tr($('csrace').dataset.i18n); `. (`applyStaticStrings` reads `dataset.i18n`, so a language switch keeps the right label.)

- [ ] **Step 5: Turntable while paused.** In `function loop(now)`, the pause branch `if (PAUSE.on) { fadeToast(dt); debugTick(); clampDebugHeights(); renderer.render(scene, camera);` becomes `if (PAUSE.on) { fadeToast(dt); debugTick(); clampDebugHeights(); if (CARSEL.on) { stepCamera(dt); drawWheels(); drawShadow(); } renderer.render(scene, camera);`.

- [ ] **Step 6: The flag.** (a) `startRace`: `R.auto = false; R.flown = false; R.state = 'armed';` becomes `R.auto = false; R.flown = false; R.swapped = false; R.state = 'armed';`. (b) In **both** `endHunt` and `finish`: `clean = !R.jumped && !R.auto && !R.flown;` becomes `clean = !R.jumped && !R.auto && !R.flown && !R.swapped;` (two occurrences, change both). (c) `const penalties = () => ` template: append `${R.swapped ? tr('notCountedSwap') : ''}` after the `${R.flown ? tr('notCountedHeli') : ''}` part. (d) `window.__mm.raceFlags = () => ({ jumped: !!R.jumped, flown: !!R.flown, auto: !!R.auto });` becomes `... auto: !!R.auto, swapped: !!R.swapped });`.

- [ ] **Step 7: Test hook.** Directly after the line `window.__mm.finishNow = () => finish();` (keep it) add: `window.__mm.raceNow = (t = 12.5, dmg = 0.4) => { R.state = 'racing'; R.t = t; P.dmg = dmg; };   // test hook (#189): a running race with a clock and damage, in zero frames`.

### Task 4: Run, changelog, commit

- [ ] **Step 1:** `node --test prototype/tests/*.test.mjs` (all pass).
- [ ] **Step 2:** Playwright, same capped command, files one call each: `test_carselect.py` (whole file: the start-screen use must be unchanged), `test_pause.py`, `test_navi.py` whole once. Expected: all pass, the three new tests included. If a new test fails 3 times for a reason you cannot explain, stop and report which assertion.
- [ ] **Step 3:** add the `CHANGELOG.md` line, commit, push, open the PR.
