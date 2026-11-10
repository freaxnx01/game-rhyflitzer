# PostAuto Timetable (#801) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E at a stop's board shows the next departures there; from there or from the pause menu a per-line view shows 4 runs per direction with the bus that is underway.

**Architecture:** All timetable logic is a new pure module `timetable.js` (node --test). `controls.js` gets the `'timetable'` context action, `pause.js` a pause button, `strings.js` the de/en text. `index.html` wires a modal `#timetable` modelled on `#borderinfo` and the About-from-pause flow.

**Tech Stack:** buildless vanilla JS ES modules, three.js page `index.html`, `node --test`, Playwright (pytest).

**Spec:** `docs/superpowers/specs/2026-11-10-postauto-timetable-design.md` (wireframe: `docs/design/postauto-timetable/wireframe.md`)

## Global Constraints

- Never hardcode a line number (133/143): lines come from `trips` (#808 adds 134).
- `TIMETABLE = { runs: 4, rows: 4, soon: 3600, reachFoot: 2.5, reachCar: 6, reachSpeed: 2 }`.
- Priority of E: Ferris > lift > leave > hop > door > depot (`board`) > `timetable`. Train mode unchanged (E = switch).
- Times via `clockText(secs, numberLocale(window.GG_LANG, navigator.language))`; never string-built HH:MM in the view.
- Data reaches the DOM only via `textContent` / attributes, never `innerHTML`.
- Every string in `strings.js` en and de (same keys; `tests/strings.test.mjs` checks).
- Playwright: one file `tests/test_postauto_timetable.py`, stepped fake clock (`open_paused`, `set_fleet_clock` from `tests/test_bus_stops.py`), run in the foreground. Run only that file plus the node tests, not the full suite.
- Run Playwright with `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest` (in CI: the repo's usual python).

## Review Focus

- Clock past the day's last run (23:50): line view must not be empty → starts at the first run (Task 2 test `runWindow_PastLastRun_StartsAtFirst`).
- A stop where a trip only arrives (terminus inside the map): no departure row for it (Task 1 test `stopDepartures_LastCallOfTerminatingTrip_NotListed`).
- ◀ at the first run / ▶ at the last: no page move, no crash (Task 2 `runWindow_Clamped`; Task 4 `ttPage` uses `canPrev`/`canNext`).
- Region without a timetable (`POSTAUTO.ready` false): no pause button, no E prompt (Task 4 `stopNear` guard, `pauseIds` filter).
- Keys while open: game keys (W, Z, J, P) must not reach the game (Task 4 `ttKey` swallows; Task 5 presses KeyZ while open and asserts still on foot).

---

### Task 1: timetable.js — lines, stop departures, directions

**Files:**
- Create: `timetable.js`
- Test: `tests/timetable.test.mjs`

**Interfaces:**
- Consumes: `tripKey(trip)` from `postauto.js:147` (`${trip.route}:${trip.calls[0][2]}`).
- Produces:
  - `export const TIMETABLE` (values in Global Constraints)
  - `lineIds(trips) -> string[]` numeric sort (`localeCompare(b, 'en', { numeric: true })`)
  - `stopLines(trips, uic) -> string[]` lines with any call at `uic`, same sort
  - `stopDepartures(trips, uic, now, count = TIMETABLE.rows) -> { line: string, to: string, dep: number, wait: number }[]`
  - `lineDirections(trips, line) -> { route, to, toOutside: boolean, stops: string[], trips: trip[] }[]`

- [ ] **Step 1: Write the failing tests**

```js
// #801: the PostAuto timetable view -- pure. node --test tests/timetable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMETABLE, lineIds, stopLines, stopDepartures, lineDirections } from '../timetable.js';

const H = (h, m = 0) => h * 3600 + m * 60;
// line 9 east (route 1, leaves the map), line 9 west (route 2, ends inside), line 10 (route 3, ends at C)
const trip = (line, route, to, deps, o = {}) => ({ line, route, to, fromOutside: !!o.from, toOutside: !!o.out, calls: deps.map(([uic, t]) => [uic, t, t]) });
const TRIPS = [
  trip('9', 1, 'East', [['A', H(14, 12)], ['B', H(14, 15)], ['C', H(14, 18)]], { out: true }),
  trip('9', 1, 'East', [['A', H(14, 42)], ['B', H(14, 45)], ['C', H(14, 48)]], { out: true }),
  trip('9', 1, 'B only', [['A', H(15, 0)], ['B', H(15, 3)]]),
  trip('9', 2, 'West', [['C', H(14, 20)], ['B', H(14, 23)], ['A', H(14, 26)]], { from: true }),
  trip('10', 3, 'Cee', [['A', H(16, 41)], ['C', H(16, 50)]]),
];

test('lineIds_SortedNumerically', () => {
  assert.deepEqual(lineIds([...TRIPS, trip('134', 4, 'X', [['A', 1], ['B', 2]])]), ['9', '10', '134']);
});

test('stopLines_LinesCallingAtTheStop', () => {
  assert.deepEqual(stopLines(TRIPS, 'A'), ['9', '10']);
  assert.deepEqual(stopLines(TRIPS, 'B'), ['9']);
});

test('stopDepartures_NextByWait_ThenEveryLineDestinationOnce', () => {
  const rows = stopDepartures(TRIPS, 'A', H(14, 7), 2);
  assert.deepEqual(rows.map((r) => [r.line, r.to, r.dep, r.wait]), [
    ['9', 'East', H(14, 12), 300], ['9', 'East', H(14, 42), 2100],
    ['9', 'B only', H(15, 0), H(0, 53)], ['10', 'Cee', H(16, 41), H(2, 34)],
  ]);
});

test('stopDepartures_LastCallOfTerminatingTrip_NotListed', () => {
  assert.deepEqual(stopDepartures(TRIPS, 'A', H(14, 20)).filter((r) => r.to === 'West'), []);
  assert.ok(stopDepartures(TRIPS, 'C', H(14, 0)).some((r) => r.to === 'East'));   // leaves the map: C is not its end
});

test('stopDepartures_WrapsPastMidnight', () => {
  const rows = stopDepartures(TRIPS, 'A', H(23, 0), 1);
  assert.equal(rows[0].dep, H(14, 12));
  assert.equal(rows[0].wait, H(15, 12));
});

test('lineDirections_OnePerRoute_LongestTripOrder_SortedByName', () => {
  const dirs = lineDirections(TRIPS, '9');
  assert.deepEqual(dirs.map((d) => [d.route, d.to, d.toOutside, d.stops]), [
    [1, 'East', true, ['A', 'B', 'C']], [2, 'West', false, ['C', 'B', 'A']],
  ]);
  assert.deepEqual(dirs[0].trips.map((t) => t.calls[0][2]), [H(14, 12), H(14, 42), H(15, 0)]);
  assert.equal(TIMETABLE.runs, 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/timetable.test.mjs`
Expected: FAIL, `Cannot find module '../timetable.js'`.

- [ ] **Step 3: Implement in `timetable.js`**

Header comment `// timetable.js (#801): ... Pure: no DOM, no three.js; node --test only.` A call "leaves" unless it is the last call of a trip with `!toOutside`. `wait = ((dep - now) % 86400 + 86400) % 86400`, `dep` reported `% 86400`. Directions: group by `trip.route`; `stops` = uics (as strings) of the trip with most calls; `to` = most frequent `to` (tie: alphabetical); `toOutside` = any trip `toOutside`; trips sorted by `calls[0][2]`; directions sorted by `to.localeCompare`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/timetable.test.mjs` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add timetable.js tests/timetable.test.mjs
git commit -m "feat(timetable): departures at a stop and a line's directions (#801)"
```

### Task 2: timetable.js — run window, cells, live bus, time text, reach

**Files:**
- Modify: `timetable.js`
- Test: `tests/timetable.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`lineDirections` direction objects), `tripKey` from `postauto.js`.
- Produces:
  - `nextRun(dir, now) -> number` index of the first trip whose last call arrival `>= now`; `0` when none
  - `runWindow(dir, now, page, width = TIMETABLE.runs) -> { start, next, trips, canPrev, canNext }`; `start = clamp(next + page * width, 0, max(0, n - width))`
  - `cellTime(trip, uic) -> number | null` the call's `dep`
  - `liveStops(buses) -> Map<tripKey, uic>`; bus shape `{ trip, phase, k, calls: [{ uic }] }` (postauto.js buses)
  - `clockText(secs, locale) -> string`; `minutesUntil(wait) -> number` (`Math.ceil(wait / 60)`)
  - `stopInReach(stops, x, z, reach) -> stop | null` (stop has `pole: [x, z]`)

- [ ] **Step 1: Write the failing tests** (append; extend the import line)

```js
import { nextRun, runWindow, cellTime, liveStops, clockText, minutesUntil, stopInReach } from '../timetable.js';
import { tripKey } from '../postauto.js';

const many = { trips: Array.from({ length: 10 }, (_, i) => trip('9', 1, 'East', [['A', H(6 + i)], ['B', H(6 + i, 30)]])) };

test('nextRun_FirstTripNotYetAtItsLastCall', () => {
  assert.equal(nextRun(many, H(8, 10)), 2);   // the 08:00 run is underway until 08:30
  assert.equal(nextRun(many, H(8, 31)), 3);
});

test('runWindow_FourFromNext_PagesByFour', () => {
  const w = runWindow(many, H(8, 10), 0);
  assert.deepEqual([w.start, w.next, w.trips.length, w.canPrev, w.canNext], [2, 2, 4, true, true]);
  assert.equal(runWindow(many, H(8, 10), 1).start, 6);
  assert.equal(runWindow(many, H(8, 10), -1).start, 0);
});

test('runWindow_Clamped', () => {
  const w = runWindow(many, H(8, 10), 5);
  assert.deepEqual([w.start, w.canNext], [6, false]);
  assert.equal(runWindow(many, H(8, 10), -5).canPrev, false);
});

test('runWindow_PastLastRun_StartsAtFirst', () => {
  assert.equal(runWindow(many, H(23, 50), 0).start, 0);
});

test('cellTime_DepOrNullWhenSkipped', () => {
  assert.equal(cellTime(TRIPS[2], 'B'), H(15, 3));
  assert.equal(cellTime(TRIPS[2], 'C'), null);
});

test('liveStops_LastPassedStop_StandingCounts_EdgeDriveLeftOut', () => {
  const calls = [{ uic: 'A' }, { uic: 'B' }, { uic: 'C' }];
  const live = liveStops([
    { trip: TRIPS[0], phase: 'drive', k: 2, calls },
    { trip: TRIPS[1], phase: 'stand', k: 0, calls },
    { trip: TRIPS[3], phase: 'drive', k: 0, calls },
    { trip: TRIPS[4], phase: 'done', k: 1, calls },
  ]);
  assert.deepEqual([...live], [[tripKey(TRIPS[0]), 'B'], [tripKey(TRIPS[1]), 'A']]);
});

test('clockText_RegionalFormat', () => {
  assert.equal(clockText(H(14, 7), 'de-CH'), '14:07');
  assert.equal(clockText(H(14, 7) + 86400, 'en-GB'), '14:07');
  assert.equal(minutesUntil(300), 5);
  assert.equal(minutesUntil(301), 6);
});

test('stopInReach_NearestPoleWithinReach', () => {
  const stops = [{ uic: 'A', pole: [0, 0] }, { uic: 'B', pole: [3, 0] }];
  assert.equal(stopInReach(stops, 2, 0, 2.5).uic, 'B');
  assert.equal(stopInReach(stops, 10, 0, 2.5), null);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/timetable.test.mjs`, Expected: FAIL (`nextRun` not exported).

- [ ] **Step 3: Implement**

`liveStops`: skip `phase === 'done'`; index `k` when standing, `k - 1` when driving; skip index `< 0`; value `calls[index].uic`. `clockText`: `new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(t * 1000))` with `t` wrapped into `[0, 86400)`.

- [ ] **Step 4: Run** — `node --test tests/timetable.test.mjs`, Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(timetable): run window, live bus and time text (#801)"` (add the files first).

### Task 3: context action, pause button, strings

**Files:**
- Modify: `controls.js:88-104` (`contextKeyAction`, `CONTEXT_LABELS`)
- Modify: `pause.js:5-11` (`PAUSE_BUTTONS`, `TUTORIAL_PAUSE`)
- Modify: `strings.js` (en near `depotPrompt`/`barBoard`, de likewise)
- Test: `tests/controls.test.mjs`, `tests/pause.test.mjs`

**Interfaces:**
- Produces: `contextKeyAction({ ..., stopPrompt = false })` returns `'timetable'` when nothing else is up; `contextLabel('timetable') === 'barTimetable'`; pause id `'pausetimetable'` right after `'pausestyle'`; string keys below.

- [ ] **Step 1: Write the failing tests**

In `tests/controls.test.mjs` add:

```js
test('contextKeyAction_TimetableOnlyWhenNothingElseIsUp', () => {   // #801
  assert.equal(contextKeyAction({ stopPrompt: true }), 'timetable');
  assert.equal(contextKeyAction({ boardPrompt: true, stopPrompt: true }), 'board');
  assert.equal(contextKeyAction({ doorPrompt: true, stopPrompt: true }), 'enter');
  assert.equal(contextKeyAction({ hop: 'up', stopPrompt: true }), 'up');
  assert.equal(contextKeyAction({ indoors: true, stopPrompt: true }), 'leave');
  assert.equal(contextLabel('timetable'), 'barTimetable');
  for (const l of ['en', 'de']) for (const k of ['barTimetable', 'ttPrompt', 'ttPauseBtn', 'ttDepartures', 'ttNone', 'keyTimetable', 'ttEarlier', 'ttLater', 'ttBus']) assert.notEqual(translate(l, k), k, `${l} ${k}`);
  assert.equal(translate('de', 'ttLine', '143'), 'Linie 143');
  assert.equal(translate('en', 'ttIn', 5), "in 5'");
});
```

In `tests/pause.test.mjs` update the three expected lists (lines 56, 98, 106) to insert `'pausetimetable'` after `'pausestyle'`, e.g. line 56:

```js
  assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pausevehicle', 'pausestyle', 'pausetimetable', 'pauseabout', 'pausekeybar', 'pauserestart', 'pausemenu']);   // ... #801: Timetable after Style
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/controls.test.mjs tests/pause.test.mjs`, Expected: FAIL.

- [ ] **Step 3: Implement**

`contextKeyAction`: after the `boardPrompt` check, `return stopPrompt ? 'timetable' : null;` and update its comment (`… over a parked depot vehicle (#553) over a stop's timetable board (#801)`). `CONTEXT_LABELS.timetable = 'barTimetable'`. Strings (en / de):

| key | en | de |
|---|---|---|
| `barTimetable` | `timetable` | `Fahrplan` |
| `ttPrompt` | `E: timetable` | `E: Fahrplan` |
| `ttPauseBtn` | `Timetable` | `Fahrplan` |
| `ttDepartures` | `Departures` | `Abfahrten` |
| `ttLine` | ``(n) => `Line ${n}` `` | ``(n) => `Linie ${n}` `` |
| `ttIn` | ``(m) => `in ${m}'` `` | ``(m) => `in ${m}'` `` |
| `ttNone` | `No more departures today` | `Heute keine Abfahrten mehr` |
| `ttEarlier` / `ttLater` | `Earlier runs` / `Later runs` | `Frühere Kurse` / `Spätere Kurse` |
| `ttBus` | `Bus underway, last stop passed` | `Bus unterwegs, zuletzt an diesem Halt` |
| `ttOut` | ``(to) => `(→ ${to})` `` | ``(to) => `(→ ${to})` `` |
| `keyTimetable` | `at a PostAuto stop's board: the timetable (on foot or in the car)` | `an der Postauto-Haltestellentafel: der Fahrplan (zu Fuss oder im Auto)` |

- [ ] **Step 4: Run** — `node --test tests/controls.test.mjs tests/pause.test.mjs tests/strings.test.mjs`, Expected: PASS.

- [ ] **Step 5: Commit** — `feat(controls): E at a stop board is the timetable action (#801)`.

### Task 4: index.html — the `#timetable` overlay and its wiring

**Files:**
- Modify: `index.html` (imports ~line 788; CSS near `#borderinfo` ~314-320 and the keybar rule ~300; markup after `#borderinfo` ~739; help row after `keyHop` ~430; pause markup ~723; keydown ~3918; `contextAction`/`runContextKey` ~4414-4419; `stepEnter` ~4433-4446; pause JS ~5617-5631; loop ~6165; test hooks)

**Interfaces:**
- Consumes: Tasks 1-3; `numberLocale` (`loading.js`, already imported); `POSTAUTO` (`.ready`, `.trips`, `.buses`, `.stops` with `{ uic, name, pole }`); `postautoClock()`; `releaseFootLock()`; `LEVELS.isSurface()`; `WRECK_S`.
- Produces: `window.__mm.timetable() -> { open, from, view, uic, line, dir, page, near, text }` (`near` = `stopNear()?.uic ?? null`, `text` = `$('timetable').innerText`).

- [ ] **Step 1: Markup + CSS**

```html
<!-- #801: the PostAuto timetable; filled by renderTimetable() -->
<div id="timetable" hidden role="dialog" aria-modal="true" aria-labelledby="tttitle"><div class="box">
  <div class="head"><div id="tttitle"></div><div id="ttdirs"></div><div id="ttclock"></div></div>
  <div id="ttbody"></div>
  <div class="foot"><span id="ttlines"></span><button id="ttclose" type="button">✕ Esc</button></div>
</div></div>
```

CSS: copy the `#borderinfo` / `.box` / `#borderinfox` rules for `#timetable` / `#ttclose` and the line-buttons; `.box` width `560px; max-width: calc(100vw - 32px)`; `#ttbody` `overflow:auto`; grid `table.ttgrid` with `th[scope=row]` `max-width: 40vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`; `td.next, th.next` highlighted with `var(--sun)` border/background like `.bline.sel`; `#ttdirs button[aria-pressed=true]` highlighted. Add `body:has(#timetable:not([hidden])) #keybar` to the keybar-hiding rule. Pause: `<button id="pausetimetable" class="btn" type="button" data-i18n="ttPauseBtn">Timetable</button>` after `#pausestyle`. Help: `<kbd data-cmd="KeyE">E</kbd><span data-i18n="keyTimetable">…</span>` after the `keyHop` row.

- [ ] **Step 2: State, reach and the context key**

Import `{ TIMETABLE, lineIds, stopLines, stopDepartures, lineDirections, runWindow, cellTime, liveStops, clockText, minutesUntil, stopInReach } from './timetable.js'` and `tripKey` from `./postauto.js` (extend the existing import if there is one).

```js
// ---------- #801: the PostAuto timetable -- E at a stop's board, or Timetable in the pause menu ----------
const TTV = { open: false, from: 'world', view: 'stop', uic: null, name: '', line: null, dir: 0, page: 0 };
function stopNear() {
  if (!POSTAUTO.ready || TRAIN.on || FLY.on || WRECK_S.on || !LEVELS.isSurface()) return null;
  if (FOOT.on) return INT.indoors ? null : stopInReach(POSTAUTO.stops, P.x, P.z, TIMETABLE.reachFoot);
  if (Math.hypot(P.vx, P.vz) >= TIMETABLE.reachSpeed) return null;
  return stopInReach(POSTAUTO.stops, P.x, P.z, TIMETABLE.reachCar);
}
```

`contextAction()`: foot passes `stopPrompt: !!stopNear()`; car returns `depotNear() ? 'board' : stopNear() ? 'timetable' : null`. `runContextKey()`: `else if (a === 'timetable') openTimetable('world', stopNear());`. Keydown: replace `contextAction() === 'board'` in the car E branch with `contextAction()`; prepend `if (TTV.open) { ttKey(e); return; }` before the `BORDERINFO.open` check. `stepEnter()`: between the depot prompt and the clearing branch, `else if (stopNear()) { $('prompt').textContent = tr('ttPrompt'); HUD.enterShown = true; }`. Loop: `if (PAUSE.on || BORDERINFO.open || TTV.open)`. Add `!TTV.open` to `beamAllowed`.

- [ ] **Step 3: Open, close, keys, pause**

- `openTimetable(from, stop)`: return unless `POSTAUTO.ready`; `releaseFootLock()`; clear `keys`; set `TTV` (`stop` → view `'stop'`, `uic`, `name`; no stop → view `'line'`, `line = lineIds(POSTAUTO.trips)[0]`); `dir = page = 0`; hide `#pause` when `from === 'pause'`; `renderTimetable()`; show; focus `#ttclose`.
- `closeTimetable()`: hide; `from === 'pause'` → show `#pause`, focus `#pausetimetable`; else blur the active element.
- `ttKey(e)`: Escape → close (not on repeat); ArrowLeft/ArrowRight in the line view → `ttPage(∓1)`; Tab/Enter/Space → return without preventDefault (native buttons); everything else `preventDefault()`.
- `ttPage(step)`: compute `runWindow` for the current direction; change `TTV.page` only when `canPrev`/`canNext`; re-render.
- `ttShowLine(line)`: direction = the one whose trips contain the `to` of that line's first row in `stopDepartures(…, TTV.uic, now)` (fallback 0); view `'line'`, page 0.
- Pause: `const pauseIds = () => pauseButtonsFor(R.mode).filter((id) => id !== 'pausetimetable' || POSTAUTO.ready);` used in `openPause` (hidden flags) and `movePauseFocus`; `$('pausetimetable').onclick = () => openTimetable('pause', null);`; `$('ttclose').onclick = closeTimetable;`.

- [ ] **Step 4: Render** (DOM nodes and `textContent` only)

- `renderTimetable()`: `now = postautoClock()`; `#ttclock` = `clockText(now, locale)` with `locale = numberLocale(window.GG_LANG, navigator.language)`; then the stop or line view.
- Stop view: `#tttitle` = stop name; `#ttdirs` empty; `#ttbody` = `ttDepartures` heading + one `.ttdep` row per `stopDepartures` entry: line, `→ to`, time, and `tr('ttIn', minutesUntil(wait))` when `wait < TIMETABLE.soon`; `ttNone` when empty. `#ttlines` = one button `${tr('ttLine', l)} ▸` per `stopLines` → `ttShowLine(l)`.
- Line view: `#tttitle` = `tr('ttLine', line)`; `#ttdirs` = one button `→ ${d.to}` per direction (`aria-pressed`), click sets `dir`, `page = 0`. `#ttbody` = `table.ttgrid`: header row `[◀ button (aria-label ttEarlier, disabled unless canPrev)] + first-call time per run + [▶ (ttLater, canNext)]`; one row per `dir.stops` uic: `th scope=row` with the stop name (`POSTAUTO.stops` name for that uic, else the uic) and `title` = full name, plus ` ${tr('ttOut', dir.to)}` on the last row when `dir.toOutside`; then per run a `td` of `cellTime` text or `–`, prefixed `🚌` (with `title` = `tr('ttBus')`) when `liveStops(POSTAUTO.buses).get(tripKey(run)) === uic`. The column of `trips[next]` gets class `next`. `#ttlines` = a button per other line → `TTV.line = l; dir = page = 0`.
- Test hook `window.__mm.timetable` (Interfaces).

- [ ] **Step 5: Verify the node suite** — `node --test tests/*.test.mjs`, Expected: all PASS. Load `python3 -m http.server` + open `index.html` only if a Playwright run is not planned next.

- [ ] **Step 6: Commit** — `feat(timetable): the PostAuto timetable at stops and in the pause menu (#801)`.

### Task 5: Playwright check + CHANGELOG

**Files:**
- Create: `tests/test_postauto_timetable.py`
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`)

**Interfaces:**
- Consumes: `window.__mm.timetable()`, `window.__mm.place(x, z)`, `window.__mm.busStops()` (stops with `uic`, `pole`), `open_paused`, `set_fleet_clock`, `hhmm`, `TT`, `needs_data` from `tests/test_bus_stops.py`.

- [ ] **Step 1: Write the test**

```python
"""#801: the PostAuto timetable opens at a stop's board and from the pause menu. Slow (Playwright): run in the foreground."""
import json

from playwright.sync_api import sync_playwright

from test_bus_stops import TT, needs_data, open_paused, set_fleet_clock

UNTERDORF = "8572417"


def next_dep(trips, uic, now):
    deps = [c[2] for t in trips for i, c in enumerate(t["calls"])
            if c[0] == uic and (i < len(t["calls"]) - 1 or t["toOutside"])]
    return min(deps, key=lambda d: (d - now) % 86400)


def run(page, ms=500):
    for _ in range(ms // 250):
        page.clock.run_for(250)


@needs_data
def test_timetable_at_the_stop_and_from_pause(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        set_fleet_clock(page, "14:07", 1)
        page.evaluate("() => document.getElementById('startbtn').click()")
        run(page)
        page.keyboard.press("KeyZ")   # on foot
        run(page)
        stop = [s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == UNTERDORF][0]
        page.evaluate("([x, z]) => window.__mm.place(x + 1, z)", stop["pole"])
        run(page)
        assert page.evaluate("() => window.__mm.timetable().near") == UNTERDORF
        page.keyboard.press("KeyE")
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["open"] and tt["view"] == "stop" and tt["uic"] == UNTERDORF
        now = page.evaluate("() => window.__mm.postauto().clock")
        want = page.evaluate("(s) => new Intl.DateTimeFormat(navigator.language, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(s * 1000))",
                             next_dep(trips, UNTERDORF, now) % 86400)
        assert want in tt["text"]
        page.keyboard.press("KeyZ")   # swallowed while open
        assert page.evaluate("() => window.__mm.foot().on")
        page.evaluate("() => document.querySelector('#ttlines button').click()")   # page.click waits on rAF: the clock is paused
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["view"] == "line"
        page.keyboard.press("ArrowRight")
        assert page.evaluate("() => window.__mm.timetable().page") == 1
        page.keyboard.press("Escape")
        assert not page.evaluate("() => window.__mm.timetable().open")
        page.keyboard.press("Escape")   # pause
        run(page)
        page.evaluate("() => document.getElementById('pausetimetable').click()")
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["open"] and tt["from"] == "pause" and tt["view"] == "line"
        page.keyboard.press("Escape")
        assert page.evaluate("() => !window.__mm.timetable().open && window.__mm.pause().on")
        assert errors == []
        b.close()
```

- [ ] **Step 2: Run** — `pipeline/.venv/bin/python -m pytest tests/test_postauto_timetable.py -v` in the foreground (generous timeout). Expected: PASS. If `KeyZ` does not get out on a paused clock, call `run(page)` before it; do not switch to a real-time clock.

- [ ] **Step 3: CHANGELOG** — under `## [Unreleased]` → `### Added`, player voice, e.g. ``- `YYYY-MM-DD HH:MM` At every **PostAuto stop** press <kbd>E</kbd> at the board to see the next **departures**; from there, or from the pause menu → *Timetable*, each line's **timetable** with the next runs in both directions and a 🚌 where a bus is on its way.``

- [ ] **Step 4: Commit** — `test(timetable): the timetable opens at a stop and from pause (#801)`; push the branch before any further verification.
