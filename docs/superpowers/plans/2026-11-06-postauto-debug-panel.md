# Postauto debug section in F3 (#707): implementation plan

**Goal:** F3 shows the fleet clock, a row per Postauto, click = chase cam behind the bus, Esc / button = back.

**Spec:** [docs/superpowers/specs/2026-11-06-postauto-debug-panel-design.md](../specs/2026-11-06-postauto-debug-panel-design.md)

**Global constraints:**
- Buildless; `postautodebug.js` is pure (no DOM, no three.js). Do not touch `postauto.js`.
- Tests: `node --test tests/postautodebug.test.mjs`, then full `node --test tests/`; Playwright **only** `tests/test_postauto_debug.py` (foreground, generous timeout). Not the whole suite.
- Strings in `strings.js`, both `en` and `de` (real umlauts), keys prefixed `dbgPa`.
- CHANGELOG entry under `[Unreleased]` -> `### Added`, in player/tester voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit and push after each task.

### Task 1: pure module `postautodebug.js`

**Files:** `postautodebug.js`, `tests/postautodebug.test.mjs`

**Interfaces:**
- `hhmmss(secs) -> 'HH:MM:SS'` (wraps at 86400)
- `clockLine(clock, patime, t) -> string` (`patime` = seconds or null; `t(key, args)`; keys `dbgPaClockWall`, `dbgPaClockPatime`)
- `busRow(bus, player, t) -> { key, line1, line2 }` with `bus = { key, line, to, phase, v, k, n, x, z }`, `player = { x, z }`
- `nextDeparture(trips, now) -> { dep, line, to } | null`: the earliest `trip.calls[0][2]` (mod 86400) at or after `now`, wrapping past midnight
- `chaseCam(pose, back = 14, up = 5) -> { x, y: up, z, lookX, lookZ }` (pose `{x, z, th}`, th = atan2(dz, dx); `y` is an offset above the bus, the caller adds ground height)

- [ ] **Write the failing test** (`tests/postautodebug.test.mjs`):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hhmmss, clockLine, busRow, nextDeparture, chaseCam } from '../postautodebug.js';

const t = (key, a = {}) => ({ dbgPaClockWall: `Uhr ${a.time} (Zürich)`, dbgPaClockPatime: `Uhr ${a.time} (patime ${a.given})`,
  dbgPaDrive: `fahrt ${a.kmh}`, dbgPaStand: 'steht', dbgPaStop: `Halt ${a.k}/${a.n}`, dbgPaAway: `${a.dist} entfernt` })[key];

test('hhmmss_WrapsAndPads', () => {
  assert.equal(hhmmss(7 * 3600 + 31 * 60 + 5.9), '07:31:05');
  assert.equal(hhmmss(86400 + 61), '00:01:01');
});
test('clockLine_PatimeOrWall', () => {
  assert.equal(clockLine(27065, 27000, t), 'Uhr 07:31:05 (patime 07:30)');
  assert.equal(clockLine(27065, null, t), 'Uhr 07:31:05 (Zürich)');
});
test('busRow_DrivingAndStanding', () => {
  const bus = { key: 'a:1', line: '133', to: 'Stein-Säckingen', phase: 'drive', v: 30 / 3.6, k: 3, n: 11, x: 2100, z: 0 };
  assert.deepEqual(busRow(bus, { x: 0, z: 0 }, t), { key: 'a:1', line1: '133 → Stein-Säckingen  fahrt 30', line2: 'Halt 4/11 · 2.1 km entfernt' });
  assert.equal(busRow({ ...bus, phase: 'stand', v: 0, x: 300 }, { x: 0, z: 0 }, t).line2, 'Halt 4/11 · 300 m entfernt');
  assert.match(busRow({ ...bus, phase: 'stand', v: 0 }, { x: 0, z: 0 }, t).line1, /steht$/);
});
test('nextDeparture_PicksNextAndWrapsMidnight', () => {
  const trips = [{ line: '133', to: 'Frick', calls: [[1, 0, 27720]] }, { line: '133', to: 'Stein', calls: [[1, 0, 3600 + 86400]] }];
  assert.deepEqual(nextDeparture(trips, 27065), { dep: 27720, line: '133', to: 'Frick' });
  assert.deepEqual(nextDeparture(trips, 80000), { dep: 3600, line: '133', to: 'Stein' });
  assert.equal(nextDeparture([], 0), null);
});
test('chaseCam_SitsBehindTheBusLookingAtIt', () => {
  const c = chaseCam({ x: 100, z: 50, th: 0 }, 14, 5);   // bus heads east
  assert.ok(Math.abs(c.x - 86) < 1e-9 && Math.abs(c.z - 50) < 1e-9 && c.y === 5);
  assert.ok(c.lookX > 100 - 1e-9);
});
```

- [ ] Run it, see it fail (module missing).
- [ ] **Implement** `postautodebug.js` (small functions, guard clauses): km/h = `Math.round(v * 3.6)`; distance `< 1000` -> `${Math.round(d)} m`, else `${(d / 1000).toFixed(1)} km`; `line2` = `t('dbgPaStop', {k: k + 1, n})` + ` · ` + `t('dbgPaAway', {dist})`.
- [ ] Run the test green, commit, push.

### Task 2: panel, follow cam, strings, hook

**Files:** `index.html`, `strings.js`, `CHANGELOG.md`

- [ ] Add strings (`en` + `de`): `dbgPaTitle` ("Postauto"), `dbgPaClockWall`, `dbgPaClockPatime`, `dbgPaDrive`, `dbgPaStand`, `dbgPaStop`, `dbgPaAway`, `dbgPaEmpty` ("no Postauto in service now" / "kein Postauto im Einsatz"), `dbgPaNext` ("next {time} · {line} → {to}" / "nächste Abfahrt {time} · {line} → {to}"), `dbgPaBack` ("Back to car" / "Zurück zum Auto"), `dbgPaGone` toast ("Postauto left the map" / "Das Postauto hat die Karte verlassen").
- [ ] Markup: in `#debug` (`index.html:433`) add `<div id="debugpa" hidden><div id="debugpaclock"></div><div id="debugparows"></div><button id="debugpaback" type="button" hidden data-i18n="dbgPaBack">Back to car</button></div>` after `#debugtext`. CSS next to the `#debuglinks` rules (`index.html:59`): row buttons styled like `#debuglinks button`, `white-space:pre-wrap`, `flex:none`, `[hidden]{display:none}`, the followed row highlighted.
- [ ] Import `postautodebug.js` next to the postauto import (`index.html:720`). Add `follow: null` to `POSTAUTO` (`index.html:3833`).
- [ ] `drawPostautoPanel()`, called from `debugTick()` (`index.html:5322`); the section stays hidden while `!POSTAUTO.ready`. Builds the clock line, rows from `POSTAUTO.buses` (skip `phase === 'done'`; `n = b.calls.length`; position from `busPose`), or the empty state plus `nextDeparture(POSTAUTO.trips, postautoClock())`. Rows are `<button data-key>` elements; mark the followed one.
- [ ] Delegated click on `#debugparows`: `e.stopPropagation()`; find `button[data-key]`; `startFollow(key)` only when `LEVELS.isSurface()` and the bus exists; blur the button (Enter is the horn). `#debugpaback` click: `stopFollow()` (stopPropagation, blur).
- [ ] `stepCamera` (`index.html:4694`): when `POSTAUTO.follow` is set and the bus is alive, set the camera from `chaseCam(busPose(b.route, b.s))` plus the ground height the mesh placement in `stepPostauto` uses, `camera.lookAt` the bus, `camTail()`, return. If the bus is gone: `stopFollow()` with the `dbgPaGone` toast.
- [ ] Esc: in the keydown handler (`index.html:3665`), before the pause binding: `if (e.code === 'Escape' && POSTAUTO.follow) { e.preventDefault(); if (!e.repeat) stopFollow(); return; }`. Check the open-overlay branches (help, jump, about, border info) still close first.
- [ ] `window.__mm.postauto()` (`index.html:4402`): add `follow: POSTAUTO.follow` and `panel: { rows, clock }` (row count and clock text of the DOM).
- [ ] CHANGELOG `[Unreleased]` -> `### Added` entry.
- [ ] Run `node --test tests/` green. Commit, push.

### Task 3: Playwright test

**Files:** `tests/test_postauto_debug.py`

- [ ] Model it on `tests/test_postauto.py` (`open_at`, `needs_data`, foreground). Test `test_f3_lists_buses_and_follow_returns_to_car`: open at `hhmm(trip["calls"][1][2] + 60)`, wait for a bus, press F3, assert `__mm.postauto().panel.rows == len(buses)` and the clock text contains `patime`; record the car position (existing `__mm` hook) and click the first `#debugparows button`; wait until `__mm.postauto().follow` is set and the camera (`__mm.cam()`) is within 30 m of that bus (poll the end state, `timeout=120000`: headless renders under 1 fps); assert the car position is unchanged; press Escape; assert `follow` is null and the game is not paused. No console errors.
- [ ] Run only this file, foreground, `timeout` 600000. Commit, push.
