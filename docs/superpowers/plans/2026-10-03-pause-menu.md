# Pause Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a run, **Esc**, **P** or the on-screen **II** button freeze the game and open a pause menu with **Resume**, **Restart race** and **Main menu**. Car (or helicopter), race timer and sound stand still; hiding the tab pauses too. The menu works by keyboard, mouse and touch at phone width (#83).

**Architecture:** A new pure module `prototype/pause.js` holds the rules (`PAUSE_BUTTONS`, `canPause`, `pauseKeyAction`, `nextFocus`), unit-tested with `node --test`. `prototype/index.html` adds the `#pause` dialog and the `#pausebtn` button, a `PAUSE = { on, frame }` state with `openPause` / `closePause` / `restartRace` / `toMainMenu`, a `pauseKey(e)` guard at the top of the `keydown` listener (after the J dialog), an early return in `loop` while paused, `SFX.suspend()` / `SFX.resume()` / `SFX.state()`, a `visibilitychange` listener and the `__mm.pause()` test hook. Strings through `tr()` (#9).

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, `node --test` for pure modules, pytest + Playwright smoke tests.

**Spec:** `docs/superpowers/specs/2026-10-03-pause-menu-design.md`

## Global Constraints

- Keys: **Esc** and **P** only. Do not add any other key. **F** belongs to #10, **B** to #65; Tab's game meaning is being reworked in #77 — do not touch Tab's existing behaviour in a run.
- Pause only during a run: `#overlay` hidden **and** `R.state` is `'armed'` or `'racing'` (`canPause`). With the J dialog open, the dialog keeps every key (the J check stays first in the listener). With the F1 help open, Esc only closes the help.
- While paused, `loop` runs **only** `debugTick()` and `renderer.render(scene, camera)`; every step function (car, flight if #10 has landed, race, camera, `hud`, `SFX.update`, texture scroll) is skipped. `R.t` and `P` must not change.
- While paused, every key except Esc / P (resume), ↑ ↓ ← → / Tab / Shift+Tab (focus) and F3 (debug) is ignored by the game. **Enter** and **Space** must **not** be `preventDefault`ed while paused: they press the focused button natively.
- `closePause` blurs the focused element, so the next Space / Enter is a game key again.
- Strings go through `tr()`; `prototype/strings.js` gets the same keys in `en` and `de` (`strings.test.mjs` enforces it; Swiss spelling, no `ß`).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_pause.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- **Headless renderer:** it draws under 1 fps and `loop` clamps `dt` to 0.05 s. Browser tests **poll end states** with `page.wait_for_function(…, timeout=120000)`; to check that nothing moves while paused, wait for `frame` to advance (`__mm.pause().frame`), never a fixed `wait_for_timeout`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Space held while pausing:** the player is usually on the gas when pressing Esc. A Space `keyup` landing on the freshly focused **Resume** must not resume the game (a native button click needs the Space keydown on the button). Pinned by `test_esc_freezes_timer_car_and_sound` (Space is released while paused). If that test resumes the game, add a `keyup` guard that `preventDefault`s a Space `keyup` whose `keydown` happened before the pause opened — do not drop the native Enter / Space activation.
- **AudioContext auto-resume:** `SFX`'s `ctx()` resumes a suspended context on every sound call; without the `held` guard any stray sound call during the pause would restart the drone.
- **Esc precedence:** J dialog → F1 help → pause. Pinned by `test_esc_with_the_help_open_closes_the_help_first` and the existing `test_jump.py` (unchanged).
- **Phone width:** the German „Rennen neu starten" is the longest label; `test_phone_pause_button_and_menu_fit` runs in `de-CH` at 360 px.

---

## File map

- Create: `prototype/pause.js`, `prototype/tests/pause.test.mjs`, `prototype/tests/test_pause.py`.
- Modify `prototype/strings.js`: pause keys in `en` (~L99, after `keyHelp`) and `de` (~L194).
- Modify `prototype/tests/strings.test.mjs`: one new test at the end.
- Modify `prototype/index.html`:
  - CSS after the `#stylebtn b` rule (~L82)
  - F1 help line before the F3 line (~L126); start-screen key line before the F1 line (~L182)
  - `#pausebtn` after `#stylebtn` in `#hud` (~L155); `#pause` dialog after `#overlay` (~L196)
  - `pause.js` import after the `strings.js` import (~L205)
  - `keydown` listener (~L889)
  - `SFX` (~L898-914)
  - pause glue + hook after `$('startbtn').onclick` (~L1011)
  - `loop` (~L1104)
  - the `#game-nav` phone rule (~L1114)
- Modify: `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `7e3f272`. Verify them with `grep -n` before editing, because other PRs (#10, #65, #77) may have shifted them.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check i18n (#9) is on the branch and P is still free.** Run each on its own from the repo root:

```bash
grep -c "const tr = " prototype/index.html
grep -c "function startRace" prototype/index.html
grep -c "KeyP" prototype/index.html
grep -c "id=\"pause" prototype/index.html
```

Expected: `1`, `1`, `0`, `0`. **If `KeyP` already appears** (another feature took it), STOP and report the conflict. Do not pick another key.

- [ ] **Step 2: Note which neighbours have landed.** `grep -c "function stepFly" prototype/index.html` (#10 helicopter) and `grep -n "keys.Tab" prototype/index.html` (#77). Nothing to do either way: the pause guard sits before their code. The flight test in Task 3 skips itself without #10.

- [ ] **Step 3: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: Pure pause rules `prototype/pause.js`

**Files:**
- Create: `prototype/pause.js`
- Test: `prototype/tests/pause.test.mjs`

**Interfaces:**
- `PAUSE_BUTTONS: string[]` — the menu's button ids in focus order.
- `canPause(overlayHidden: boolean, raceState: string): boolean`
- `pauseKeyAction(key: { code, shiftKey, repeat }, state: { paused, canPause, helpOpen }): 'pause' | 'resume' | 'next' | 'prev' | 'debug' | 'ignore' | 'pass'` — a `KeyboardEvent` can be passed as `key` directly.
- `nextFocus(ids: string[], current: string, step: 1 | -1): string`

- [ ] **Step 1: Write the failing test** `prototype/tests/pause.test.mjs`:

```js
// #83: the pause menu's key and focus rules. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAUSE_BUTTONS, canPause, pauseKeyAction, nextFocus } from '../pause.js';

const key = (code, extra = {}) => ({ code, shiftKey: false, repeat: false, ...extra });
const RUN = { paused: false, canPause: true, helpOpen: false };
const PAUSED = { paused: true, canPause: true, helpOpen: false };

test('canPause: only with the start / result screen hidden and the race armed or running', () => {
  assert.equal(canPause(true, 'armed'), true);
  assert.equal(canPause(true, 'racing'), true);
  assert.equal(canPause(true, 'ready'), false);
  assert.equal(canPause(true, 'finished'), false);
  assert.equal(canPause(false, 'racing'), false);
});

test('Esc and P pause a run; other keys pass to the game', () => {
  assert.equal(pauseKeyAction(key('Escape'), RUN), 'pause');
  assert.equal(pauseKeyAction(key('KeyP'), RUN), 'pause');
  for (const c of ['KeyW', 'Space', 'Tab', 'KeyF', 'F3', 'Enter', 'ArrowDown']) assert.equal(pauseKeyAction(key(c), RUN), 'pass', c);
});

test('no pause outside a run, on a key repeat, or with Esc while the F1 help is open', () => {
  assert.equal(pauseKeyAction(key('Escape'), { ...RUN, canPause: false }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP'), { ...RUN, canPause: false }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP', { repeat: true }), RUN), 'pass');
  assert.equal(pauseKeyAction(key('Escape'), { ...RUN, helpOpen: true }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP'), { ...RUN, helpOpen: true }), 'pause');
});

test('while paused: Esc / P resume, a held P does not flicker', () => {
  assert.equal(pauseKeyAction(key('Escape'), PAUSED), 'resume');
  assert.equal(pauseKeyAction(key('KeyP'), PAUSED), 'resume');
  assert.equal(pauseKeyAction(key('KeyP', { repeat: true }), PAUSED), 'ignore');
});

test('while paused: arrows and Tab move the focus, F3 stays, every other key is swallowed', () => {
  assert.equal(pauseKeyAction(key('ArrowDown'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('ArrowRight'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('ArrowUp'), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('ArrowLeft'), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('Tab'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('Tab', { shiftKey: true }), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('F3'), PAUSED), 'debug');
  for (const c of ['Enter', 'NumpadEnter', 'Space', 'KeyW', 'KeyH', 'KeyJ', 'KeyF', 'KeyM', 'KeyT', 'F1', 'KeyR']) assert.equal(pauseKeyAction(key(c), PAUSED), 'ignore', c);
});

test('nextFocus wraps both ways and starts at the first button from anywhere else', () => {
  assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pauserestart', 'pausemenu']);
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', 1), 'pauserestart');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pausemenu', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', -1), 'pausemenu');
  assert.equal(nextFocus(PAUSE_BUTTONS, '', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'gl', -1), 'pauseresume');
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test prototype/tests/*.test.mjs` → `pause.test.mjs` fails with `Cannot find module '../pause.js'`.

- [ ] **Step 3: Implement** `prototype/pause.js`:

```js
// #83: pure rules for the pause menu -- no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.

// the menu's buttons, in focus order (ids in prototype/index.html)
export const PAUSE_BUTTONS = ['pauseresume', 'pauserestart', 'pausemenu'];

// a pause only makes sense during a run: start / result screen hidden, race armed or running
export function canPause(overlayHidden, raceState) {
  return overlayHidden && (raceState === 'armed' || raceState === 'racing');
}

const TOGGLE = new Set(['Escape', 'KeyP']);
const NEXT = new Set(['ArrowDown', 'ArrowRight']);
const PREV = new Set(['ArrowUp', 'ArrowLeft']);

// key = { code, shiftKey, repeat }, state = { paused, canPause, helpOpen }
// → 'pause' | 'resume' | 'next' | 'prev' | 'debug' | 'ignore' (swallowed, browser default kept) | 'pass' (normal game key handling)
export function pauseKeyAction(key, state) {
  if (state.paused) return pausedAction(key);
  if (!TOGGLE.has(key.code) || key.repeat || !state.canPause) return 'pass';
  if (key.code === 'Escape' && state.helpOpen) return 'pass';
  return 'pause';
}

function pausedAction(key) {
  if (TOGGLE.has(key.code)) return key.repeat ? 'ignore' : 'resume';
  if (NEXT.has(key.code)) return 'next';
  if (PREV.has(key.code)) return 'prev';
  if (key.code === 'Tab') return key.shiftKey ? 'prev' : 'next';
  if (key.code === 'F3') return 'debug';
  return 'ignore';
}

// the id `step` places after `current` in `ids`, wrapping; an unknown current starts from the first
export function nextFocus(ids, current, step) {
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  return ids[(i + step + ids.length) % ids.length];
}
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (baseline + 6). (This code and test were dry-run green during enrichment.)

- [ ] **Step 5: Commit.**

```bash
git add prototype/pause.js prototype/tests/pause.test.mjs
git commit -m "feat(ui): pure pause menu key and focus rules (#83)"
```

---

### Task 2: Strings

**Files:**
- Modify: `prototype/strings.js` (`en` after `keyHelp` ~L99, `de` after `keyHelp` ~L194)
- Test: `prototype/tests/strings.test.mjs`

- [ ] **Step 1: Write the failing test.** Append to `prototype/tests/strings.test.mjs`:

```js
test('pause menu texts exist in both languages (#83)', () => {
  assert.equal(translate('en', 'pauseTitle'), 'Paused');
  assert.equal(translate('en', 'pauseResume'), 'Resume');
  assert.equal(translate('en', 'pauseRestart'), 'Restart race');
  assert.equal(translate('en', 'pauseMenu'), 'Main menu');
  assert.equal(translate('de', 'pauseTitle'), 'Pause');
  assert.equal(translate('de', 'pauseResume'), 'Weiter');
  assert.equal(translate('de', 'pauseRestart'), 'Rennen neu starten');
  assert.equal(translate('de', 'pauseMenu'), 'Hauptmenü');
  for (const k of ['pauseHint', 'pauseAria', 'keyPause']) assert.notEqual(translate('de', k), k, k);
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test prototype/tests/*.test.mjs` → the new test fails (`'pauseTitle' !== 'Paused'`).

- [ ] **Step 3: Implement.** In `en`, after `keyHelp: 'this help',`:

```js
  keyPause: 'pause: resume · restart race · main menu',
  // ---- pause menu (#83) ----
  pauseTitle: 'Paused',
  pauseResume: 'Resume',
  pauseRestart: 'Restart race',
  pauseMenu: 'Main menu',
  pauseHint: 'Esc · P: resume',
  pauseAria: 'Pause',
```

In `de`, after `keyHelp: 'diese Hilfe',`:

```js
  keyPause: 'Pause: weiter · Rennen neu starten · Hauptmenü',
  pauseTitle: 'Pause',
  pauseResume: 'Weiter',
  pauseRestart: 'Rennen neu starten',
  pauseMenu: 'Hauptmenü',
  pauseHint: 'Esc · P: weiter',
  pauseAria: 'Pause',
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (the equal-keys and no-`ß` tests included).

- [ ] **Step 5: Commit.**

```bash
git add prototype/strings.js prototype/tests/strings.test.mjs
git commit -m "feat(i18n): pause menu strings (#83)"
```

---

### Task 3: Failing browser tests

**Files:**
- Create: `prototype/tests/test_pause.py`

**Interfaces (consumed, built in Tasks 4–5):** `__mm.pause()` → `{ on, frame, state, t, x, z, audio, focus }`; ids `#pause`, `#pausebtn`, `#pauseresume`, `#pauserestart`, `#pausemenu`. Existing hooks used: `__mm.keysDown()`, `__mm.cam()`, `__mm.debug()`, `__mm.car()`, `__mm.raceFlags()`, `__mm.fly()` (only with #10).

- [ ] **Step 1: Write the failing tests** `prototype/tests/test_pause.py`:

```python
"""#83: Esc / P / the II button pause a run; the menu resumes, restarts or goes back to the start screen; a hidden tab
pauses. Hand-traced layout (world + terrain blocked): no data files needed, deterministic and fast.
Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000
HIDE = """(h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}"""


def open_page(p, server, phone=False, start=True):
    b = p.chromium.launch(args=ARGS)
    if phone:
        ctx = b.new_context(viewport={"width": 360, "height": 640}, has_touch=True, is_mobile=True, locale="de-CH")
    else:
        ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    if start:
        page.click("#startbtn")
    return b, page, errors


def pause(page):
    return page.evaluate("() => window.__mm.pause()")


def wait_frames(page, n=5):
    f = pause(page)["frame"]
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f + n}", timeout=T)


def drive(page):
    page.keyboard.down("Space")
    page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=T)


def test_esc_freezes_timer_car_and_sound(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        drive(page)
        page.keyboard.press("Escape")
        page.keyboard.up("Space")   # released while paused: must not press the focused Resume button
        page.wait_for_function("() => window.__mm.pause().on && window.__mm.pause().audio === 'suspended'", timeout=T)
        s1 = pause(page)
        visible = page.is_visible("#pause")
        wait_frames(page)
        s2 = pause(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.pause().on && window.__mm.pause().audio === 'running'", timeout=T)
        hidden = not page.is_visible("#pause")
        page.keyboard.down("Space")
        page.wait_for_function(f"() => window.__mm.pause().t > {s1['t']}", timeout=T)
        b.close()
    assert visible and hidden
    assert s1["focus"] == "pauseresume"
    assert s2["on"] and (s2["t"], s2["x"], s2["z"]) == (s1["t"], s1["x"], s1["z"])
    assert errors == []


def test_p_pauses_and_game_keys_are_silent(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        view = page.evaluate("() => window.__mm.cam().view")
        page.keyboard.down("KeyP")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.keyboard.down("KeyP")   # auto-repeat: must not resume
        page.keyboard.up("KeyP")
        still = pause(page)["on"]
        for k in ["KeyW", "KeyC", "KeyJ", "KeyH", "F1", "Tab"]:
            page.keyboard.down(k)
        silent = page.evaluate("""() => ({ keys: window.__mm.keysDown(), jump: !document.querySelector('#jump').hidden,
            help: !document.querySelector('#help').hidden, view: window.__mm.cam().view, focus: window.__mm.pause().focus })""")
        for k in ["KeyW", "KeyC", "KeyJ", "KeyH", "F1", "Tab"]:
            page.keyboard.up(k)
        dbg0 = page.evaluate("() => window.__mm.debug().on")
        page.keyboard.press("F3")
        dbg1 = page.evaluate("() => window.__mm.debug().on")
        page.keyboard.press("KeyP")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        b.close()
    assert still
    assert silent == {"keys": [], "jump": False, "help": False, "view": view, "focus": "pauserestart"}   # Tab moved the focus
    assert dbg1 != dbg0
    assert errors == []


def test_keyboard_navigation_and_main_menu(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start = page.evaluate("() => window.__mm.car()")
        drive(page)
        page.keyboard.up("Space")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        seen = [pause(page)["focus"]]
        for k in ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Tab", "Shift+Tab"]:
            page.keyboard.press(k)
            seen.append(pause(page)["focus"])
        page.keyboard.press("Enter")   # on "Main menu"
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        s = pause(page)
        car = page.evaluate("() => window.__mm.car()")
        start_text = page.text_content("#startbtn")
        pause_hidden = not page.is_visible("#pause")
        b.close()
    assert seen == ["pauseresume", "pauserestart", "pausemenu", "pauseresume", "pausemenu", "pauseresume", "pausemenu"]
    assert (s["on"], s["state"], s["t"], s["focus"]) == (False, "ready", 0, "startbtn")
    assert pause_hidden and start_text == "Start"
    assert abs(car["x"] - start["x"]) < 0.5 and abs(car["z"] - start["z"]) < 0.5   # back at START (an armed car may settle a little)
    assert errors == []


def test_restart_race(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start = page.evaluate("() => window.__mm.car()")
        drive(page)
        page.keyboard.up("Space")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.click("#pauserestart")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        s = pause(page)
        car = page.evaluate("() => window.__mm.car()")
        overlay_hidden = page.evaluate("() => document.querySelector('#overlay').hidden")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        b.close()
    assert (s["state"], s["t"]) == ("armed", 0)
    assert overlay_hidden and not any(flags.values())
    assert abs(car["x"] - start["x"]) < 0.5 and abs(car["z"] - start["z"]) < 0.5   # back at START (an armed car may settle a little)
    assert errors == []


def test_esc_with_the_help_open_closes_the_help_first(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("F1")
        page.keyboard.press("Escape")
        first = page.evaluate("() => ({ help: !document.querySelector('#help').hidden, paused: window.__mm.pause().on })")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        b.close()
    assert first == {"help": False, "paused": False}
    assert errors == []


def test_hidden_tab_pauses_and_stays_paused_but_not_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, start=False)
        page.evaluate(HIDE, True)
        on_start_screen = pause(page)["on"]
        page.evaluate(HIDE, False)
        page.click("#startbtn")
        page.evaluate(HIDE, True)
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.evaluate(HIDE, False)
        wait_frames(page)
        back = pause(page)["on"]
        b.close()
    assert on_start_screen is False
    assert back is True
    assert errors == []


def test_phone_pause_button_and_menu_fit(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, phone=True)
        btn = page.locator("#pausebtn").bounding_box()
        page.tap("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        fit = page.evaluate("""() => ({
            buttons: ['pauseresume', 'pauserestart', 'pausemenu'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect();
              return { text: e.textContent, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clipped: e.scrollWidth > e.clientWidth }; }),
            pageWidth: document.documentElement.scrollWidth,
            nav: getComputedStyle(document.getElementById('game-nav')).display,
            label: document.getElementById('pausebtn').getAttribute('aria-label') })""")
        page.tap("#pauseresume")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        b.close()
    assert btn["x"] >= 0 and btn["x"] + btn["width"] <= 360 and btn["width"] >= 44 and btn["height"] >= 44
    assert [x["text"] for x in fit["buttons"]] == ["Weiter", "Rennen neu starten", "Hauptmenü"]
    assert all(x["inside"] and not x["clipped"] for x in fit["buttons"])
    assert fit["pageWidth"] <= 360 and fit["nav"] == "none" and fit["label"] == "Pause"
    assert errors == []


def test_pause_freezes_a_flight(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        if not page.evaluate("() => !!window.__mm.fly"):
            b.close()
            pytest.skip("#10 helicopter mode not merged yet")
        page.keyboard.press("KeyF")
        page.wait_for_function("() => window.__mm.fly().on", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        f1 = page.evaluate("() => window.__mm.fly()")
        page.keyboard.press("KeyF")   # ignored while paused
        wait_frames(page)
        f2 = page.evaluate("() => window.__mm.fly()")
        b.close()
    assert f2["on"] and (f2["x"], f2["y"], f2["z"]) == (f1["x"], f1["y"], f1["z"])
    assert errors == []
```

- [ ] **Step 2: Commit and push** (before the slow run):

```bash
git add prototype/tests/test_pause.py
git commit -m "test(ui): pause menu browser tests (#83)"
git push -u origin HEAD
```

- [ ] **Step 3: Run, watch them fail (foreground).** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_pause.py -q` → every test fails on `window.__mm.pause is not a function` or a missing `#pausebtn` (the flight test may skip).

---

### Task 4: Markup, CSS and the help lines

**Files:**
- Modify: `prototype/index.html`

- [ ] **Step 1: CSS.** After the `#stylebtn b{…}` rule (~L82) add:

```css
#pausebtn{position:fixed;right:16px;top:calc(208px + env(safe-area-inset-top,0px));width:48px;height:48px;padding:0;pointer-events:auto;cursor:pointer;background:rgba(20,23,29,.82);border:3px solid var(--steel-l);color:var(--cream);font-family:inherit;font-size:22px;font-weight:800;letter-spacing:2px}
#pausebtn:focus-visible{outline:3px solid var(--sun);outline-offset:3px}
/* #83: light, even dim so the frozen scene, HUD and F3 panel stay readable behind the menu */
#pause{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,8,20,.55);padding:16px;box-sizing:border-box;overflow:auto}
#pause[hidden]{display:none}
#pause .panel{max-width:420px}
#pause .col{display:flex;flex-direction:column;gap:12px}
#pause .btn{width:100%;height:auto;min-height:56px;padding:8px 14px;font-size:clamp(18px,5.5vw,26px);white-space:normal;overflow-wrap:anywhere}
#pause small{font-size:15px;font-weight:600;color:var(--steel-l)}
```

- [ ] **Step 2: Help lines.** In `#help`, before the `<kbd>F3</kbd>` line (~L126):

```html
      <kbd>Esc · P</kbd><span data-i18n="keyPause">pause: resume · restart race · main menu</span>
```

In `#overlay`'s `.keys`, before the `<kbd>F1</kbd>` line (~L182), the same line with 6-space indent.

- [ ] **Step 3: The II button.** In `#hud`, right after the `#stylebtn` button (~L155):

```html
  <button id="pausebtn" type="button" aria-label="Pause" data-i18n-aria="pauseAria">II</button>
```

- [ ] **Step 4: The dialog.** Right after the closing `</div>` of `#overlay` (~L196):

```html
<div id="pause" hidden role="dialog" aria-modal="true" aria-labelledby="pausetitle">
  <div class="panel">
    <h1 id="pausetitle" data-i18n="pauseTitle">Paused</h1>
    <div class="col">
      <button id="pauseresume" class="btn primary" type="button" data-i18n="pauseResume">Resume</button>
      <button id="pauserestart" class="btn" type="button" data-i18n="pauseRestart">Restart race</button>
      <button id="pausemenu" class="btn" type="button" data-i18n="pauseMenu">Main menu</button>
    </div>
    <small data-i18n="pauseHint">Esc · P: resume</small>
  </div>
</div>
```

- [ ] **Step 5: #game-nav on phones.** Replace the rule at ~L1114 with:

```css
  @media (max-width: 600px) { body:has(#overlay:not([hidden])) #game-nav, body:has(#pause:not([hidden])) #game-nav { display: none !important; } }
```

and extend its comment above to „…the start/result dialog and the pause menu fill the screen…".

- [ ] **Step 6: Commit.**

```bash
git add prototype/index.html
git commit -m "feat(ui): pause dialog, II button and help lines (#83)"
```

---

### Task 5: Pause logic

**Files:**
- Modify: `prototype/index.html`

- [ ] **Step 1: Import.** After `import { translate } from './strings.js';` (~L205):

```js
import { PAUSE_BUTTONS, canPause, pauseKeyAction, nextFocus } from './pause.js';
```

- [ ] **Step 2: SFX.** In `SFX` (~L898-914):
  - `let ac = null, eng = null, muted = false;` → `let ac = null, eng = null, muted = false, held = false;   // held: paused (#83), ctx() must not wake the context`
  - in `ctx`: `if (ac.state === 'suspended') ac.resume();` → `if (ac.state === 'suspended' && !held) ac.resume();`
  - add after `toggle() { … },`:

```js
    suspend() { held = true; if (ac) ac.suspend(); },
    resume() { held = false; if (ac) ac.resume(); },
    state() { return ac ? ac.state : null; },
```

- [ ] **Step 3: Pause glue.** After `$('startbtn').onclick = …;` (~L1011):

```js
// #83: pause menu (Esc / P / the II button; automatic on a hidden tab). Rules in pause.js; loop() skips every step while PAUSE.on.
const PAUSE = { on: false, frame: 0 };
const inRun = () => canPause($('overlay').hidden, R.state);
function openPause() { if (PAUSE.on || !inRun()) return; PAUSE.on = true; for (const k in keys) keys[k] = false; $('help').hidden = true; $('pause').hidden = false; SFX.suspend(); $(PAUSE_BUTTONS[0]).focus(); }
function closePause() { if (!PAUSE.on) return; PAUSE.on = false; $('pause').hidden = true; document.activeElement?.blur(); SFX.resume(); }   // blur: the next Space / Enter is a game key again
function restartRace() { closePause(); startRace(); }
function toMainMenu() { closePause(); R.state = 'ready'; R.t = 0; P.safe = [START.x, START.z, START.th]; resetCar(); $('result').hidden = true; renderOverlay(); $('overlay').hidden = false; $('startbtn').focus(); }   // the run is abandoned, never recorded
function movePauseFocus(step) { $(nextFocus(PAUSE_BUTTONS, document.activeElement?.id || '', step)).focus(); }
const PAUSE_KEYS = { pause: openPause, resume: closePause, next: () => movePauseFocus(1), prev: () => movePauseFocus(-1), debug: () => toggleDebug() };
// true = the key is the pause menu's; 'ignore' keeps the browser default so Enter / Space press the focused button
function pauseKey(e) { const a = pauseKeyAction(e, { paused: PAUSE.on, canPause: inRun(), helpOpen: !$('help').hidden }); if (a === 'pass') return false; if (a !== 'ignore') { e.preventDefault(); PAUSE_KEYS[a](); } return true; }
$('pausebtn').onclick = () => openPause(); $('pauseresume').onclick = () => closePause(); $('pauserestart').onclick = restartRace; $('pausemenu').onclick = toMainMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden) openPause(); });
window.__mm.pause = () => ({ on: PAUSE.on, frame: PAUSE.frame, state: R.state, t: R.t, x: P.x, z: P.z, audio: SFX.state(), focus: document.activeElement?.id || '' });
```

  If #10 has landed, `resetCar` already ends a flight — nothing else to add for Restart / Main menu.

- [ ] **Step 4: keydown.** In the listener (~L889), right after `if (!$('jump').hidden) { jumpKey(e); return; }` insert:

```js
 if (pauseKey(e)) return;
```

  (it must come **before** `if (e.repeat) return;`, the F / Tab / Esc lines and the final `preventDefault` list).

- [ ] **Step 5: loop.** In `loop` (~L1104), right after `last = now;` insert:

```js
 PAUSE.frame++; if (PAUSE.on) { debugTick(); renderer.render(scene, camera); requestAnimationFrame(loop); return; }   // #83: frozen, but F3 and resizes still draw
```

- [ ] **Step 6: Run the node tests.** `node --test prototype/tests/*.test.mjs` → all pass.

- [ ] **Step 7: Commit and push** (before the slow run):

```bash
git add prototype/index.html
git commit -m "feat(ui): pause and resume, restart race, back to the main menu (#83)"
git push
```

- [ ] **Step 8: Run the browser tests (foreground).** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_pause.py ../prototype/tests/test_jump.py ../prototype/tests/test_i18n.py -q` → all green (the flight test skips without #10). If a test fails 3 times, stop and report what goes wrong instead of iterating.

---

### Task 6: Docs, manual playtest entry and full verification

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Added`, add as the first entry, in the player-facing voice (never regenerate the file with `git cliff -o`):

```markdown
- Press **Esc** or **P** (or tap the **II** button) to pause. The car, the clock and the engine stop, and a menu lets you carry on, restart the race or go back to the start screen. Switching to another tab pauses the game too.
```

- [ ] **Step 2: test-todo.** Append:

```markdown
## Pause menu (#83)

- [ ] Racing at full throttle, press **Esc**: everything freezes (clock, car, engine sound), the menu shows with **Resume** highlighted. Let go of Space: the game stays paused.
- [ ] **Esc** or **P** again resumes exactly where you stopped; the clock goes on from the same tenth.
- [ ] ↑ ↓ and Tab move through the three buttons; Enter presses one. **Restart race** starts a fresh run at the start; **Main menu** shows the start screen, and **Start** from there works.
- [ ] Switch to another tab for a few seconds and come back: the game is paused and silent, and stays paused until you resume.
- [ ] Phone (portrait and landscape): the **II** button is reachable and does not cover the compass or the timer; the menu buttons fit, nothing scrolls sideways, the nav links are hidden while the menu is open.
- [ ] With **F3** on, pause: the debug panel stays readable behind the menu.
- [ ] In browser fullscreen, **Esc** leaves fullscreen instead of pausing (expected); **P** pauses.
- [ ] Feels right? Should **Main menu** ask „abandon this run?" first?
```

- [ ] **Step 3: Full verification (foreground).** `node --test prototype/tests/*.test.mjs`, then `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` (several minutes) → all green. Open the page once in Playwright, start a run, pause and resume, and confirm the console is empty.

- [ ] **Step 4: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): pause menu (#83)"
git push
```
