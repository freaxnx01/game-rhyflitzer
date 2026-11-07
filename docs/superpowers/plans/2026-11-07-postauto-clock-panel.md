# Postauto clock and time-lapse from the F3 panel (#726) - implementation plan

**Goal:** set the fleet clock and a time-lapse factor from the F3 Postauto section; buses stay on the timetable.
**Spec:** `docs/superpowers/specs/2026-11-07-postauto-clock-panel-design.md` (assumptions A1-A11).
**Size:** M. **Tests:** `node --test` for the pure parts, one Playwright test (foreground, never background).

## Global constraints

- Buildless vanilla JS, ES modules; no new packages. Edits in `index.html` stay local to: `PATIME`/`postautoClock` (3868-3869), `stepPostauto` (3929-3948), the debug panel markup (439), CSS (62-65) and the `drawPostautoPanel` block (5415-5452). Wave-2 issues #709/#711/#712 edit the same file: fetch and rebase on `origin/main` before the last commit, and do not reformat neighbours.
- Strings in `strings.js` in both `en` (~255) and `de` (~846).
- Changelog: one player-facing line under `[Unreleased]` in `CHANGELOG.md` (German, like the other entries).
- Run `node --test tests/paclock.test.mjs tests/postautodebug.test.mjs tests/postauto.test.mjs` after each task; the Playwright test only in Task 5.

### Task 1: `paclock.js` - the pure clock model

**Files:** create `paclock.js`, `tests/paclock.test.mjs`.

**Interfaces** (all pure; `perf` = `performance.now()` in ms, `wall` = `zurichSeconds(new Date())`):

```js
export const PA_SPEEDS = [1, 2, 5, 10, 30, 60];
export const wallClock = () => ({ mode: 'wall', base: 0, t0: 0, factor: 1, given: null });
export function clockNow(c, perf, wall)            // wall mode: wall; set mode: (base + (perf - t0)/1000 * factor) % 86400
export function setTime(c, secs, perf)             // { mode:'set', base:secs, t0:perf, factor:c.factor, given:secs }
export function setFactor(c, factor, perf, wall)   // rebase: base = clockNow(c, perf, wall), t0 = perf, factor; given kept; wall mode becomes set with given null; factor 1 on a wall clock stays wall
export function parseFactor(text)                  // a PA_SPEEDS member as number, else 1
export function fleetSteps(dtFleet, maxStep = 0.05, maxN = 64)  // { n, h }: n = clamp(ceil(dtFleet/maxStep),1,maxN), h = dtFleet/n; dtFleet <= 0 -> { n: 0, h: 0 }
export function jumpLimit(factor, resync)          // resync * Math.max(1, factor)
export function clockQuery(c)                      // { patime: 'HH:MM'|null, pasp: '10'|null } for the address bar (pasp null at 1x)
export function clockFromQuery(patime, pasp)       // parsePatime(patime) / parseFactor(pasp) -> state
```

`clockFromQuery`: valid `patime` gives a set clock (`given` = that time, `t0` = 0 is replaced by the caller via `setTime(wallClock(), secs, perf)`; simplest is to return `{ patime: secs|null, factor }` and let `index.html` build the state). Pick one shape, keep it tested. `pasp` without `patime` gives a wall clock with that factor; the caller applies `setFactor(wallClock(), factor, perf, wall)` once on load. Use `parsePatime` from `./postauto.js` for HH:MM; `clockQuery` formats with `hhmm` logic (copy 4 lines, do not import `postautodebug.js` into the clock model).

- [ ] **Step 1: Write the failing tests** in `tests/paclock.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PA_SPEEDS, wallClock, clockNow, setTime, setFactor, parseFactor, fleetSteps, jumpLimit, clockQuery } from '../paclock.js';

test('clockNow_WallMode_FollowsWall', () => assert.equal(clockNow(wallClock(), 5000, 27000), 27000));
test('setTime_RunsOnInRealTime', () => {
  const c = setTime(wallClock(), 27000, 1000);
  assert.equal(clockNow(c, 1000, 0), 27000);
  assert.equal(clockNow(c, 11000, 0), 27010);
});
test('setFactor_RebasesWithoutJump', () => {
  const c = setTime(wallClock(), 27000, 0), d = setFactor(c, 10, 5000, 0);
  assert.equal(clockNow(d, 5000, 0), clockNow(c, 5000, 0));
  assert.equal(clockNow(d, 6000, 0), 27005 + 10);
  assert.equal(d.given, 27000);
});
test('setFactor_FromWall_StartsAtWallTime', () => {
  const d = setFactor(wallClock(), 30, 2000, 40000);
  assert.equal(d.mode, 'set'); assert.equal(d.given, null);
  assert.equal(clockNow(d, 3000, 0), 40030);
});
test('setFactor_WallToOne_StaysWall', () => assert.equal(setFactor(wallClock(), 1, 0, 0).mode, 'wall'));
test('clockNow_WrapsPastMidnight', () => assert.equal(clockNow(setTime(wallClock(), 86395, 0), 10000, 0), 5));
test('parseFactor_OnlyKnownSpeeds', () => {
  for (const f of PA_SPEEDS) assert.equal(parseFactor(String(f)), f);
  for (const bad of ['0', '7', '-5', 'x', '', null]) assert.equal(parseFactor(bad), 1);
});
test('fleetSteps_SubStepsFleetTime', () => {
  assert.deepEqual(fleetSteps(0.05), { n: 1, h: 0.05 });
  const s = fleetSteps(3);   // 60x at the 0.05 s frame clamp
  assert.equal(s.n, 60); assert.ok(Math.abs(s.n * s.h - 3) < 1e-9 && s.h <= 0.05 + 1e-12);
  assert.equal(fleetSteps(1000).n, 64);
  assert.deepEqual(fleetSteps(0), { n: 0, h: 0 });
});
test('jumpLimit_ScalesWithFactor', () => { assert.equal(jumpLimit(1, 5), 5); assert.equal(jumpLimit(60, 5), 300); });
test('clockQuery_NamesSetTimeAndFactor', () => {
  assert.deepEqual(clockQuery(setFactor(setTime(wallClock(), 27000, 0), 10, 0, 0)), { patime: '07:30', pasp: '10' });
  assert.deepEqual(clockQuery(wallClock()), { patime: null, pasp: null });
});
```

- [ ] **Step 2:** run, expect failure (module missing). **Step 3:** implement `paclock.js` per the interfaces (about 50 lines, guard clauses, no flag arguments). **Step 4:** run, expect pass. **Step 5:** commit `feat(postauto): pure clock model for the F3 panel (#726)`.

### Task 2: `clockLine` shows factor and source

**Files:** modify `postautodebug.js` (`clockLine`, export `hhmm`), `strings.js` (en ~256-257, de ~847-848), `tests/postautodebug.test.mjs`.

New signature `clockLine(clock, source, t)` with `source = { given, factor, wall }` (`given` seconds or null, `factor` number, `wall` true in wall mode):

```js
export function clockLine(clock, { given, factor, wall }, t) {
  const src = wall ? t('dbgPaSrcWall') : given === null ? t('dbgPaSrcWallStart') : t('dbgPaSrcSet', { given: hhmm(given) });
  return t('dbgPaClock', { time: hhmmss(clock), speed: factor > 1 ? ` · ${factor}×` : '', source: src });
}
```

Strings (en): `dbgPaClock: (a) => \`Clock ${a.time}${a.speed} (${a.source})\``, `dbgPaSrcWall: 'real time'`, `dbgPaSrcSet: (a) => \`set ${a.given}\``, `dbgPaSrcWallStart: 'from real time'`. de: `Uhr ...`, `Echtzeit`, `gesetzt ${a.given}`, `ab Echtzeit`. Remove `dbgPaClockWall` / `dbgPaClockPatime` in both languages (grep that nothing else uses them first).

- [ ] **Step 1: Failing test** (replace `clockLine_PatimeOrWall`; adapt the `t` stub at the top of the test file to the new keys):

```js
test('clockLine_SetWallAndLapse', () => {
  assert.equal(clockLine(27065, { given: 27000, factor: 1, wall: false }, t), 'Uhr 07:31:05 (gesetzt 07:30)');
  assert.equal(clockLine(27065, { given: 27000, factor: 10, wall: false }, t), 'Uhr 07:31:05 · 10× (gesetzt 07:30)');
  assert.equal(clockLine(27065, { given: null, factor: 10, wall: false }, t), 'Uhr 07:31:05 · 10× (ab Echtzeit)');
  assert.equal(clockLine(27065, { given: null, factor: 1, wall: true }, t), 'Uhr 07:31:05 (Echtzeit)');
});
```

- [ ] **Step 2-4:** run (fail), implement, run (pass). **Step 5:** commit.

### Task 3: fleet-time stepping in `stepPostauto` and the clock state in `index.html`

**Files:** modify `index.html` (3865 `POSTAUTO` object, 3868-3869, 3929-3948, import near 728-730), `tests/postauto.test.mjs` (one new test).

- [ ] **Step 1: Failing test** in `tests/postauto.test.mjs` next to the `run` helper (line ~105; reuse the route/stop fixtures of the first `stepBus` test). Drive one bus for the same fleet seconds twice: once with `dt = 0.05`, once with `fleetSteps(3)` sub-steps per 3 s (the 60x frame at the dt clamp). Assert both end on the same call index `k` and phase, and `|s1 - s2| < 15` m. Name: `stepBus_SubSteppedFleetTime_KeepsTimetable`. It fails first because `fleetSteps` is imported from `../paclock.js` and the sub-step assertion `h <= 0.05` is part of it.
- [ ] **Step 2:** run, see it fail, **Step 3: implement** in `index.html`:

```js
import { wallClock, clockNow, setFactor, fleetSteps, jumpLimit, clockFromQuery } from './paclock.js';   // #726
// replaces PATIME / PATIME_T0 (3868-3869)
let PACLOCK = initialClock(new URLSearchParams(location.search));   // wall, ?patime=, ?pasp= (shape per Task 1)
function postautoClock() { return clockNow(PACLOCK, performance.now(), zurichSeconds(new Date())); }
```

In `stepPostauto`:

```js
const now = postautoClock(), f = PACLOCK.factor, dtF = dt * f;
const jumped = POSTAUTO.forceSync || (POSTAUTO.prev !== null && fleetJumped(POSTAUTO.prev, now, dtF, { resync: jumpLimit(f, PA.resync) }));
POSTAUTO.forceSync = false;
// sync lines unchanged; in the bus loop replace `stepBus(b, now, dt, gap)` by:
for (let i = 0, { n, h } = fleetSteps(dtF); i < n && b.phase !== 'done'; i++) stepBus(b, now - dtF + (i + 1) * h, h, gap);
```

Add `forceSync: false` to the `POSTAUTO` object. `fleetJumped` only reads `cfg.resync`; do not change `postauto.js`. Leave every other line of `stepPostauto` and `drawPostauto` as is.

- [ ] **Step 4:** run the three node test files. No separate browser dry run; Task 5 covers it. **Step 5:** commit `feat(postauto): step buses in fleet time under time-lapse (#726)`.

### Task 4: the panel row, handlers, URL sync

**Files:** modify `index.html` (markup 439, CSS 62-65, handlers after 5452), `strings.js` (en + de), `CHANGELOG.md`.

Markup, inside `#debugpa` after `#debugpaclock`:

```html
<div id="debugpaset"><input id="debugpatime" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" data-i18n-aria="dbgPaTimeLabel"> <button id="debugpasetgo" type="button" data-i18n="dbgPaSet">Set</button> <button id="debugpawall" type="button" data-i18n="dbgPaWall">Real time</button> <label for="debugpaspeed" data-i18n="dbgPaSpeed">Time-lapse</label> <select id="debugpaspeed"></select></div>
```

Strings en/de: `dbgPaTimeLabel` 'Fleet time (HH:MM)' / 'Flottenzeit (HH:MM)', `dbgPaSet` 'Set' / 'Setzen', `dbgPaWall` 'Real time' / 'Echtzeit', `dbgPaSpeed` 'Time-lapse' / 'Zeitraffer'. CSS: `#debugpaset{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px}#debugpatime{width:5.5ch;font:inherit}#debugpatime.bad{border-color:#e55}`; the existing `#debugpa button` rule styles the buttons.

Handlers (after the `debugpaback` listener):

```js
// #726: set the fleet clock from the panel. Typing must not reach the window keydown handler (Enter = horn, arrows steer, F3, Esc pause)
const PA_SPEED_SEL = $('debugpaspeed');
PA_SPEED_SEL.replaceChildren(...PA_SPEEDS.map((f) => Object.assign(document.createElement('option'), { value: String(f), textContent: `${f}×` })));
PA_SPEED_SEL.value = String(PACLOCK.factor);
for (const id of ['debugpatime', 'debugpaspeed']) for (const type of ['keydown', 'keyup', 'keypress']) $(id).addEventListener(type, (e) => e.stopPropagation());
$('debugpaset').addEventListener('click', (e) => e.stopPropagation());   // a click in the row does not copy the panel
function syncClockUrl() { const u = new URL(location.href), q = clockQuery(PACLOCK); for (const [k, v] of Object.entries(q)) v === null ? u.searchParams.delete(k) : u.searchParams.set(k, v); history.replaceState(null, '', u); }
function applyPaTime() { const secs = parsePatime($('debugpatime').value.trim()); $('debugpatime').classList.toggle('bad', secs === null); if (secs === null) return;
  PACLOCK = setTime(PACLOCK, secs, performance.now()); POSTAUTO.forceSync = true; syncClockUrl(); }
$('debugpasetgo').addEventListener('click', (e) => { applyPaTime(); e.currentTarget.blur(); });
$('debugpatime').addEventListener('keydown', (e) => { if (e.key === 'Enter') { applyPaTime(); e.currentTarget.blur(); } else if (e.key === 'Escape') e.currentTarget.blur(); });
$('debugpawall').addEventListener('click', (e) => { PACLOCK = wallClock(); PA_SPEED_SEL.value = '1'; POSTAUTO.forceSync = true; syncClockUrl(); e.currentTarget.blur(); });
PA_SPEED_SEL.addEventListener('change', (e) => { PACLOCK = setFactor(PACLOCK, parseFactor(e.currentTarget.value), performance.now(), zurichSeconds(new Date())); syncClockUrl(); e.currentTarget.blur(); });
```

Both keydown listeners on `debugpatime` fire (same target); that is intended. Update `drawPostautoPanel` (5418): `clockLine(postautoClock(), { given: PACLOCK.given, factor: PACLOCK.factor, wall: PACLOCK.mode === 'wall' }, tr)`. Import `PA_SPEEDS, setTime, parseFactor, clockQuery` from `./paclock.js` (add to the Task 3 import; remove unused names). Set `aria-label` through the existing `data-i18n-aria` mechanism (check how `debughelp` does it).

`CHANGELOG.md`, `[Unreleased]` > Added: „Im F3-Feld "Postauto" lässt sich die Uhrzeit der Postautos setzen, auf Echtzeit zurückstellen und im Zeitraffer (bis 60-fach) laufen lassen."

- [ ] **Step 1:** implement markup, CSS, strings, handlers. **Step 2:** `node --test` on the three files plus the strings parity test if `tests/strings.test.mjs` exists. **Step 3:** commit `feat(debug): set the Postauto clock and a time-lapse speed from the F3 panel (#726)`.

### Task 5: one Playwright test

**Files:** modify `tests/test_postauto_debug.py` (the existing `given in clock` assertion still holds: `gesetzt 07:30` contains `07:30`); add `test_f3_sets_clock_and_time_lapse`.

- [ ] Write the test with `open_at`, `needs_data`, `hhmm` (file head). Open at a time when a bus drives (`trip["calls"][1][2] + 60`), press `F3`, click `#startbtn`, then in the foreground:
  1. Read the car position from `window.__mm.sim` (check its fields first). Focus `#debugpatime`, `fill("08:15")`, press `ArrowUp` and `Space`, then `Enter` (applies and blurs). Assert the car did not move, `window.__mm.postauto().clock` is within 5 s of 08:15 plus elapsed, and `new URLSearchParams(location.search).get('patime') == '08:15'`.
  2. `select_option("#debugpaspeed", "10")`. Sample `postauto().clock` and one bus `s` (a key present in both samples) 2 s apart: clock delta between 15 and 25 s, the bus `s` not lower than before (no re-place), `pasp == '10'` in the URL, and `#debugpaclock` text contains `10×`.
  3. Click `#debugpawall`: `patime` and `pasp` gone from the URL, clock text contains `Echtzeit` (de) or `real time` (en; the page runs `locale="en-US"`, so assert on the locale in use).
  Assert `errors == []`. Run in the foreground, `timeout=900000`: `pytest tests/test_postauto_debug.py -k clock -x`. Do not run the other Playwright files.
- [ ] Commit `test(debug): Postauto clock and time-lapse from the F3 panel (#726)`.

### Task 6: finish

- [ ] `git fetch origin`, `git rebase origin/main` (resolve any `index.html` overlap with #709/#711/#712 without touching their lines), re-run the three node test files, push the branch and open the PR (title `feat(debug): set the Postauto clock and a time-lapse speed from the F3 panel`, body `Closes #726`).
