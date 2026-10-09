# Blitz mode — implementation plan (#128, first slice)

Spec: `docs/superpowers/specs/2026-10-09-blitz-mode-design.md`. Read it first; the decision table there is the contract. Line numbers below are `prototype/index.html` on `main` @ `42b68df` and will drift a little — search the quoted code, not the number.

**Goal.** A **Blitz** button on the start screen runs the existing five-checkpoint course against a countdown: 90 s at the start, +60 s per checkpoint, rank **S/A/B/C** by the seconds left at the finish, "Time's up" when the clock hits zero. The time trial stays as it is.

## Global Constraints

- Buildless vanilla JS; no packages, no bundler. ES module `prototype/blitz.js` is pure (no DOM, no three.js) so `node --test` imports it.
- Every new UI text goes through `tr()` with an `en` and a `de` entry in `prototype/strings.js`; `strings.test.mjs` fails on a missing key, a mismatched arity or a `ß`.
- Surgical edits to `index.html`: touch only `R`, `startRace`, `stepRace`, `finish`, `resultHtml`, `renderOverlay`, `restartRace`, `rerenderAll`, `hud`, the two markup lines, one CSS rule and the `__mm` hooks. Match the one-statement-per-line style of the file.
- No *Crazy Taxi* / SEGA name, logo, music or asset anywhere (spec, user).
- Tests: `node --test prototype/tests/*.test.mjs` for the pure module; Playwright under pytest for the browser. **Run browser tests in the foreground, never `run_in_background`, and under a memory cap:** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_blitz.py -x -q`. Run only the affected browser tests (`test_blitz.py`, `test_pause.py`, `test_i18n.py`), not the whole suite.
- Commit and push the branch **before** the browser run (CLAUDE.md, "Commit and push the branch before starting verification").
- Branch: `feature/128-blitz-mode`, Conventional Commits, PR to `main`.

## Review Focus

- The trial path is byte-for-byte the same behaviour: `startRace()` with no argument, `fmt(R.t)` in the HUD, `mm.best2` untouched.
- The countdown runs only in `'racing'` (never `'armed'`, never paused — `stepRace` is not called while paused today, keep it that way).
- `renderModeLine()` runs **after** `applyStaticStrings()` in `rerenderAll()`, or a language switch mid-run resets the labels to the trial's.
- The result screen never shows a rank for a time's-up run, and never saves `mm.blitzBest` with a cheat flag set.

## File map

| File | Change |
|---|---|
| `prototype/blitz.js` | **new** — `BLITZ`, `tick`, `addBonus`, `isTimeUp`, `rankFor`, `isNewBest` |
| `prototype/tests/blitz.test.mjs` | **new** — node tests for the module |
| `prototype/strings.js` | 13 new keys, en + de |
| `prototype/index.html` | button markup, CSS for `#time.low`, `R.mode / R.left / R.timeUp`, `startRace(mode)`, countdown + bonus in `stepRace`, rank in `finish`, `timeUp()`, `resultHtml`, `renderOverlay`, `renderModeLine`, `hud`, hooks |
| `prototype/tests/test_blitz.py` | **new** — Playwright: start, bonus, time's up, finish rank, retry labels, trial untouched |
| `CHANGELOG.md` | one `Added` entry |

---

### Task 0: Branch and baseline

1. `git checkout -b feature/128-blitz-mode` from `main`.
2. `node --test prototype/tests/*.test.mjs` — green before you start. Note the count.

### Task 1: Pure module `prototype/blitz.js` (test first)

**Files:** `prototype/blitz.js`, `prototype/tests/blitz.test.mjs`

**Interface:**

```js
export const BLITZ = { start: 90, bonus: 60, low: 10 };            // seconds
export function tick(left, dt)        // → max(0, left - dt)
export function addBonus(left)        // → left + BLITZ.bonus (no cap)
export function isTimeUp(left)        // → left <= 0
export function rankFor(left)         // → 'S' | 'A' | 'B' | 'C'   (≥ 90 / ≥ 60 / ≥ 30 / else)
export function isNewBest(best, left) // → best === null || left > best
```

**Step 1 — write the failing test** `prototype/tests/blitz.test.mjs`:

```js
// #128: Blitz mode — the countdown that checkpoints top up. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLITZ, tick, addBonus, isTimeUp, rankFor, isNewBest } from '../blitz.js';

test('the table: 90 s to start, 60 s per checkpoint, red under 10 s', () => {
  assert.deepEqual(BLITZ, { start: 90, bonus: 60, low: 10 });
});

test('tick counts down and never goes below zero', () => {
  assert.equal(tick(90, 1 / 60), 90 - 1 / 60);
  assert.equal(tick(0.01, 1 / 60), 0);
  assert.equal(tick(0, 1), 0);
});

test('a checkpoint adds the bonus on top of whatever is left, with no cap', () => {
  assert.equal(addBonus(12.5), 72.5);
  assert.equal(addBonus(300), 360);
});

test('time is up at zero, not before', () => {
  assert.equal(isTimeUp(0.2), false);
  assert.equal(isTimeUp(0), true);
});

test('rank by the seconds left at the finish: S >= 90, A >= 60, B >= 30, C below', () => {
  assert.equal(rankFor(90), 'S');
  assert.equal(rankFor(89.9), 'A');
  assert.equal(rankFor(60), 'A');
  assert.equal(rankFor(59.9), 'B');
  assert.equal(rankFor(30), 'B');
  assert.equal(rankFor(29.9), 'C');
  assert.equal(rankFor(0.1), 'C');
});

test('the best is the largest time left; a first finish is always a best', () => {
  assert.equal(isNewBest(null, 5), true);
  assert.equal(isNewBest(40, 41), true);
  assert.equal(isNewBest(40, 40), false);
  assert.equal(isNewBest(40, 12), false);
});
```

Run `node --test prototype/tests/blitz.test.mjs` — fails (module missing).

**Step 2 — minimum implementation** `prototype/blitz.js`:

```js
// blitz.js — Blitz mode rules (#128): a countdown that every checkpoint tops up, a rank letter at the finish.
// Pure: no DOM, no three.js, so node --test can import it. index.html keeps the glue.

export const BLITZ = { start: 90, bonus: 60, low: 10 };   // seconds: on the clock at the start, per checkpoint, "red" threshold

const RANKS = [[90, 'S'], [60, 'A'], [30, 'B']];

export function tick(left, dt) { return Math.max(0, left - dt); }
export function addBonus(left) { return left + BLITZ.bonus; }
export function isTimeUp(left) { return left <= 0; }
export function rankFor(left) { for (const [min, rank] of RANKS) if (left >= min) return rank; return 'C'; }
export function isNewBest(best, left) { return best === null || left > best; }
```

**Step 3 — verify:** `node --test prototype/tests/*.test.mjs` all green. Commit: `feat(modes): blitz rules module (#128)`.

### Task 2: Strings

**Files:** `prototype/strings.js`

Add to `en` (next to `mode` / `time` / `cpToast`) and the matching `de` entries. Keep the `small()` helper for the second line, like `cpToast`.

```js
  // ---- Blitz (#128) ----
  blitz: 'Blitz',
  modeBlitz: 'Blitz · Hochrhein',
  timeLeft: 'Time left',
  blitzIntro: 'The same five checkpoints and the finish — but the clock counts down. 90 seconds to start, every checkpoint adds 60. Finish with time left for a rank.',
  blitzFinishedText: 'Made it before the clock. More seconds left means a better rank — S is the one to chase.',
  blitzTimeUpText: 'The clock ran out. Checkpoints add time, so take the nearest one first.',
  cpToastBlitz: (number, name, bonus) => `Checkpoint ${number}/5 · +${bonus} s<br>${small(name)}`,
  blitzRank: 'Rank',
  blitzLeft: (time) => `${time} left · `,
  blitzBest: (time) => `Best left ${time ?? '—'}`,
  blitzTimeUp: "Time's up",
  blitzCps: (done) => `${done} / 5 checkpoints`,
  keyBlitz: 'Blitz: countdown, +60 s per checkpoint, rank at the finish',
```

```js
  // ---- Blitz (#128) ----
  blitz: 'Blitz',
  modeBlitz: 'Blitz · Hochrhein',
  timeLeft: 'Restzeit',
  blitzIntro: 'Dieselben fünf Checkpoints und das Ziel — aber die Uhr läuft rückwärts. 90 Sekunden zum Start, jeder Checkpoint gibt 60 dazu. Mit Restzeit ins Ziel gibt einen Rang.',
  blitzFinishedText: 'Vor der Uhr im Ziel. Je mehr Restzeit, desto besser der Rang — S ist das Ziel.',
  blitzTimeUpText: 'Die Zeit ist abgelaufen. Checkpoints geben Zeit — nimm zuerst den nächsten.',
  cpToastBlitz: (number, name, bonus) => `Checkpoint ${number}/5 · +${bonus} s<br>${small(name)}`,
  blitzRank: 'Rang',
  blitzLeft: (time) => `${time} Restzeit · `,
  blitzBest: (time) => `Beste Restzeit ${time ?? '—'}`,
  blitzTimeUp: 'Zeit ist um',
  blitzCps: (done) => `${done} / 5 Checkpoints`,
  keyBlitz: 'Blitz: Countdown, +60 s pro Checkpoint, Rang im Ziel',
```

Add one assertion to `strings.test.mjs`'s interpolation test: `assert.equal(translate('de', 'cpToastBlitz', 2, 'Sisslerfeld', 60).startsWith('Checkpoint 2/5 · +60 s'), true);`. Run the node tests — green. Commit: `feat(i18n): Blitz strings (#128)`.

### Task 3: Failing browser tests `prototype/tests/test_blitz.py`

**Files:** `prototype/tests/test_blitz.py`

Hand layout, same bootstrapping as `test_pause.py` (`ARGS`, routes to 404, `READY`, `locale="en-US"`). Write all of it now; it fails until Task 4.

```python
"""#128: Blitz mode — the clock counts down from 90 s, each checkpoint adds 60 s, a rank letter at the finish,
"Time's up" when the clock runs out. Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.blitz && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale=locale).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def blitz(page):
    return page.evaluate("() => window.__mm.blitz()")


def text(page, sel):
    return page.text_content(sel).strip()


def test_blitz_button_starts_a_countdown_that_checkpoints_top_up(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert text(page, "#blitzbtn") == "Blitz"
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "blitz" and s["left"] == 90 and s["timeUp"] is False
        assert text(page, "#tl .mode") == "Blitz · Hochrhein" and text(page, "#tr .lbl") == "Time left"
        assert text(page, "#time").startswith("01:30")                      # armed: the clock has not moved
        x, z = s["cps"][0]
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])         # within 7 m of checkpoint 1
        page.wait_for_function("() => window.__mm.blitz().done === 1", timeout=T)
        s = blitz(page)
        assert 149.5 <= s["left"] <= 150                                     # +60 s, still armed so no countdown
        assert "+60 s" in page.inner_text("#toast")
        assert text(page, "#cpn") == "1"
        assert errors == []
        b.close()


def test_the_clock_counts_down_only_while_racing_and_ends_the_run_at_zero(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.blitzSetLeft(3)")
        page.keyboard.down("KeyW")                                           # the car moves: armed → racing
        page.wait_for_function("() => window.__mm.blitz().left < 3", timeout=T)
        page.wait_for_function("() => document.querySelector('#time').classList.contains('low')", timeout=T)
        page.wait_for_function("() => window.__mm.blitz().timeUp", timeout=T)
        page.keyboard.up("KeyW")
        s = blitz(page)
        assert s["left"] == 0 and s["rank"] is None
        assert not page.evaluate("() => document.getElementById('overlay').hidden")
        r = page.inner_text("#result")
        assert "Time's up" in r and "0 / 5 checkpoints" in r
        assert page.evaluate("() => localStorage.getItem('mm.blitzBest')") is None
        assert text(page, "#blitzbtn") == "Retry" and text(page, "#startbtn") == "Start"
        assert errors == []
        b.close()


def test_finishing_gives_a_rank_and_saves_the_best_time_left(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.blitzSetLeft(75)")
        page.evaluate("() => window.__mm.finishNow()")
        s = blitz(page)
        assert s["rank"] == "A" and s["timeUp"] is False
        r = page.inner_text("#result")
        assert "Rank" in r and "A" in r.split() and "01:15" in r
        assert page.evaluate("() => +localStorage.getItem('mm.blitzBest')") == 75
        assert "Best left 01:15" in text(page, "#best")
        page.click("#blitzbtn")                                              # Retry restarts Blitz
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "blitz" and s["left"] == 90 and s["done"] == 0
        assert errors == []
        b.close()


def test_a_cheated_finish_shows_the_rank_but_keeps_no_best(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.keyboard.press("KeyJ"); page.keyboard.press("Digit1"); page.keyboard.press("Escape")   # a jump sets R.jumped
        page.wait_for_function("() => window.__mm.raceFlags().jumped", timeout=T)
        page.evaluate("() => window.__mm.finishNow()")
        assert blitz(page)["rank"] in ("S", "A", "B", "C")
        assert "not counted" in page.inner_text("#result")
        assert page.evaluate("() => localStorage.getItem('mm.blitzBest')") is None
        b.close()


def test_the_time_trial_is_untouched_and_german_labels_switch_mid_run(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "trial" and text(page, "#tl .mode") == "Time trial · Hochrhein" and text(page, "#tr .lbl") == "Time"
        page.keyboard.press("Escape"); page.click("#pausemenu")                # back to the start screen
        if page.is_visible("#abandonok"): page.click("#abandonok")             # only asked while 'racing'; 'armed' goes straight back
        page.wait_for_function("() => !document.getElementById('overlay').hidden", timeout=T)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.ggSetLang('de')")
        assert text(page, "#tl .mode") == "Blitz · Hochrhein" and text(page, "#tr .lbl") == "Restzeit"
        assert errors == []
        b.close()
```

Run `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_blitz.py -x -q` in the foreground — fails on `#blitzbtn` / `__mm.blitz`. Commit: `test(modes): browser tests for Blitz (#128)`.

### Task 4: Wire Blitz into `prototype/index.html`

**Files:** `prototype/index.html`

All edits, in file order. Search for the quoted text.

**4a — CSS** (next to `#time b{…}`, line 25):

```css
#time.low{color:#ff5a3c}
```

**4b — Markup.** In `#overlay .row` (line 201-204) insert between Start and Style:

```html
      <button id="blitzbtn" class="btn" type="button">Blitz</button>
```

In the overlay `.keys` list (after the `keyPause` row) and in the `#help` panel's key list, add one row so **F1** and the start screen explain the mode:

```html
      <kbd>Blitz</kbd><span data-i18n="keyBlitz">Blitz: countdown, +60 s per checkpoint, rank at the finish</span>
```

**4c — Import** (next to `import { translate } from './strings.js';`, line 244):

```js
import { BLITZ, tick as blitzTick, addBonus as blitzBonus, isTimeUp as blitzTimeUp, rankFor as blitzRank, isNewBest as blitzNewBest } from './blitz.js';
```

**4d — State** (line 1385-1386). Replace:

```js
const R = { state: 'ready', t: 0, best: null, done: 0, shortcut: false, target: null };
try { const b = localStorage.getItem('mm.best2'); if (b) R.best = +b; } catch (e) { }
```

with:

```js
const R = { state: 'ready', mode: 'trial', t: 0, left: 0, timeUp: false, best: null, blitzBest: null, done: 0, shortcut: false, target: null };   // #128: mode 'trial' | 'blitz'; left = Blitz seconds
try { const b = localStorage.getItem('mm.best2'); if (b) R.best = +b; } catch (e) { }
try { const b = localStorage.getItem('mm.blitzBest'); if (b) R.blitzBest = +b; } catch (e) { }
```

**4e — `startRace`** (line 1393). Change the signature to `function startRace(mode = 'trial')` and add, right after `R.flown = false;`:

```js
R.mode = mode; R.left = mode === 'blitz' ? BLITZ.start : 0; R.timeUp = false;
```

and at the end of the function body (after `updatePips();`): `renderModeLine();`.

**4f — `stepRace`** (line 1396). Two edits inside the existing function:

- after `if (R.state === 'racing') R.t += dt;` add:

```js
if (R.state === 'racing' && R.mode === 'blitz') { R.left = blitzTick(R.left, dt); if (blitzTimeUp(R.left)) { timeUp(); return; } }
```

- in the checkpoint branch, replace `toast(tr('cpToast', R.done, best.n), TOAST_S.event);` with:

```js
if (R.mode === 'blitz') { R.left = blitzBonus(R.left); toast(tr('cpToastBlitz', R.done, best.n, BLITZ.bonus), TOAST_S.event); } else toast(tr('cpToast', R.done, best.n), TOAST_S.event);
```

**4g — `finish` and `timeUp`** (line 1397). Replace `finish()` with:

```js
function finish() { stopAuto('reset'); R.state = 'finished'; SFX.finish(); const t = R.t, clean = !R.jumped && !R.auto && !R.flown; let rec = false; if (R.mode === 'blitz') { const rank = blitzRank(R.left); if (clean && blitzNewBest(R.blitzBest, R.left)) { rec = R.blitzBest !== null; R.blitzBest = R.left; try { localStorage.setItem('mm.blitzBest', String(R.left)); } catch (e) { } } R.last = { mode: 'blitz', t, left: R.left, rank, rec }; } else { if (clean && (R.best === null || t < R.best)) { rec = R.best !== null; R.best = t; try { localStorage.setItem('mm.best2', String(t)); } catch (e) { } } R.last = { mode: 'trial', t, rec }; } $('result').hidden = false; renderOverlay(); $('overlay').hidden = false; }
function timeUp() { stopAuto('reset'); R.state = 'finished'; R.timeUp = true; R.last = { mode: 'blitz', timeUp: true, done: R.done }; $('result').hidden = false; renderOverlay(); $('overlay').hidden = false; }   // #128: the Blitz clock hit zero — no rank, no best, no sound
```

**4h — `resultHtml` / `renderOverlay`** (line 1398-1401). Replace both:

```js
const notes = () => `${R.jumped ? tr('notCountedJump') : ''}${R.auto ? tr('notCountedAuto') : ''}${R.flown ? tr('notCountedHeli') : ''}${R.shortcut ? tr('viaHolz') : ''}`;
function resultHtml(last) { if (last.timeUp) return `<small>${tr('blitzTimeUp')}</small>${last.done} / 5<small>${tr('checkpointsLabel')}</small>`; if (last.mode === 'blitz') return `<small>${tr(last.rec ? 'newRecord' : 'blitzRank')}</small>${last.rank}<small>${tr('blitzLeft', fmt(last.left).replace(/<[^>]+>/g, ''))}${notes()}${tr('blitzBest', R.blitzBest === null ? null : fmt(R.blitzBest).replace(/<[^>]+>/g, ''))}</small>`; return `<small>${tr(last.rec ? 'newRecord' : 'finished')}</small>${fmt(last.t)}<small>${notes()}${tr('bestLower')} ${fmt(R.best)}</small>`; }
function renderOverlay() { const done = R.state === 'finished', blitz = R.mode === 'blitz'; $('ovtext').textContent = tr(done ? (R.timeUp ? 'blitzTimeUpText' : blitz ? 'blitzFinishedText' : 'finishedText') : 'intro'); $('startbtn').textContent = tr(done && !blitz ? 'retry' : 'start'); $('blitzbtn').textContent = tr(done && blitz ? 'retry' : 'blitz'); if (done) $('result').innerHTML = resultHtml(R.last); }
function renderModeLine() { const blitz = R.mode === 'blitz'; document.querySelector('#tl .mode').textContent = tr(blitz ? 'modeBlitz' : 'mode'); document.querySelector('#tr .lbl').textContent = tr(blitz ? 'timeLeft' : 'time'); }   // #128: after applyStaticStrings, which resets both to the trial's
$('startbtn').onclick = () => { SFX.start(); startRace(); };
$('blitzbtn').onclick = () => { SFX.start(); startRace('blitz'); };
```

`blitzIntro` is the Blitz button's hover title: add `$('blitzbtn').title = tr('blitzIntro');` inside `renderOverlay`. The `keyBlitz` row on the start screen and under **F1** carries the short form.

**4i — Pause glue** (line 1408-1409): `function restartRace() { closePause(); startRace(R.mode); }`; in `toMainMenu` add `R.timeUp = false;` after `R.t = 0;` and `renderModeLine();` after `renderOverlay();`.

**4j — `rerenderAll`** (line 1456): append `renderModeLine();` as the last call.

**4k — `hud`** (line 1522). Replace `$('time').innerHTML = fmt(R.t); $('best').textContent = tr('best', R.best === null ? null : fmt(R.best).replace(/<[^>]+>/g, ''));` with:

```js
if (R.mode === 'blitz') { $('time').innerHTML = fmt(R.left); $('time').classList.toggle('low', R.left < BLITZ.low); $('best').textContent = tr('blitzBest', R.blitzBest === null ? null : fmt(R.blitzBest).replace(/<[^>]+>/g, '')); } else { $('time').innerHTML = fmt(R.t); $('time').classList.remove('low'); $('best').textContent = tr('best', R.best === null ? null : fmt(R.best).replace(/<[^>]+>/g, '')); }
```

**4l — Hooks** (next to `window.__mm.raceFlags`, line 1291):

```js
window.__mm.blitz = () => ({ mode: R.mode, left: R.left, timeUp: !!R.timeUp, done: R.done, rank: R.last?.rank ?? null, best: R.blitzBest, cps: CPS.map(c => [c.x, c.z]), finish: [FINISH.x, FINISH.z] });   // #128
window.__mm.blitzSetLeft = (s) => { R.left = s; };
```

**4m — Verify.** `node --test prototype/tests/*.test.mjs` green. Commit `feat(modes): Blitz mode — countdown, +60 s per checkpoint, rank (#128)` and **push the branch**. Then, in the foreground: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_blitz.py prototype/tests/test_pause.py prototype/tests/test_i18n.py -x -q` (give the call a `timeout` of 600000). All green; if a `test_blitz.py` assertion is wrong about the game (not the game wrong), fix the test and say so in the commit.

### Task 5: Changelog and the manual check

**Files:** `CHANGELOG.md`

Under `## [Unreleased]` → `### Added`, first bullet:

```markdown
- **Blitz** — a second way to run the course: press **Blitz** on the start screen and the clock counts *down* from 90 seconds; every checkpoint adds 60. Reach the Münsterplatz with time left and you get a rank — S, A, B or C, the more seconds the better — and your best time left is remembered. Run out of time and it's over: "Time's up", with the checkpoints you made. The time trial is still there under Start.
```

Manual playtest (CLAUDE.md checklist): page loads with an empty console; Blitz starts, the clock is red under 10 s, a checkpoint shows `+60 s`, the finish shows a rank; the 390 px viewport wraps the three buttons without overflow. Commit `docs(changelog): Blitz mode (#128)`, push, open the PR against `main` with the template (Summary · Changes · Testing · Checklist), referencing #128.
