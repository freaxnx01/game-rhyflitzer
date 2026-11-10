# Postauto section in the F3 debug panel (#707): design

**Issue:** #707. **Builds on:** #500 / PR#696 (Postautos).

## Goal

Make Postautos findable and the fleet clock visible: the F3 panel (`#debug`) gets a Postauto section with the fleet clock and
its source, one row per active bus, a follow camera on click, and a way back.

## Design

- **Pure module `postautodebug.js`** (no DOM, no three.js, node --test): `hhmmss`, `clockLine`, `busRow`, `nextDeparture`,
  `chaseCam`. All text comes from a `t(key, args)` callback so de/en stay in `strings.js`.
- **Panel (index.html):** a `<div id="debugpa">` inside `#debug`, after `#debugtext`. `debugTick()` (250 ms, `index.html:5322`)
  also redraws it: a clock line, then one `<button data-key>` row per bus (two text lines, like the wireframe), or the empty
  state with the next departure. Clicks use event delegation on the container with `stopPropagation` (the panel itself is
  click-to-copy, `index.html:5323`). Rows are matched by `bus.key`, so a redraw between mousedown and click does not lose the target.
- **Follow mode:** `POSTAUTO.follow = key | null`. While set, `stepCamera` (`index.html:4694`) places the camera with
  `chaseCam(busPose(...))` instead of the player chase cam, then calls `camTail()` like `trainCamera` (`index.html:4688`).
  The player's `P`, car mesh, physics and game state are not touched. The camera snaps (no tween) on entry.
- **Back:** button "Zurück zum Auto" (`#debugpaback`, shown only while following) and Esc. Esc is the pause key
  (`controls.js:28`, `pause.js:28`): while following, the first Esc only ends follow mode and does not pause.
- **Debug hook:** `window.__mm.postauto()` (`index.html:4402`) gains `follow` (key or null) and `panel` (row count, clock text) for the test.
- **Clock source text:** `07:31:05 (patime 07:30)` with `?patime=`, else `07:31:05 (Zürich)` / `(Zurich)`.
- **Row text:** line 1 `133 → Stein-Säckingen  fahrt 30` (phase word + km/h while driving, `steht` while standing);
  line 2 `Halt 4/11 · 2.1 km entfernt` (k+1 of calls.length, distance to the player in m under 1000, else km with one decimal).
- **Empty state:** `no Postauto in service now` plus `next 07:42 · 133 → Frick` from the timetable's first departures.

## Assumptions

- **A1** [confirmed] The tool lives in the F3 debug panel. Answer: "Im F3-Debug-Panel". Section inside `#debug`, the wireframe in the issue is approved.
- **A2** [confirmed] Click starts follow mode. Answer: "Kamera folgt, Auto bleibt". Chase cam behind the bus, car stays, no game-state change; Esc / "Zurück zum Auto" returns the camera.
- **A3** [confirmed] Implementation route. Answer: "Issue + Enrich + Pipeline".
- **A4** [high] Row data comes from the same `POSTAUTO.buses` that `__mm.postauto()` reads (`index.html:4402`), phase values `drive` / `stand` as in `postauto.js:134-135`. Rejected: a second bus list.
- **A5** [high] Pure formatting goes in a new `postautodebug.js`, not `postauto.js` or `debug.js`, to keep the PR#696 module untouched. Rejected: extending `debug.js`, which is about position and map links (`debug.js:30-60`).
- **A6** [med] While following, Esc ends follow mode instead of pausing; a second Esc pauses as usual. Rejected: Esc pausing and leaving follow on. Evidence: Esc is the pause key (`controls.js:28`).
- **A7** [med] If the followed bus finishes (`phase === 'done'`, leaves the world), follow ends by itself and the camera returns to the car, with a toast. Rejected: freezing the camera at the last spot.
- **A8** [med] Entering follow does not change `camView`; leaving restores the player's chase cam exactly as it was.
- **A9** [high] Follow starts only on the surface (`LEVELS.isSurface()`); buses are only drawn there (`POSTAUTO.group.visible = surface`, `index.html:3899`). In a room the rows still list, the click is ignored. Rejected: forcing the player out of a room.
- **A10** [high] The panel redraw stays on the existing 250 ms `debugTick`; no new timer.

## Consequences

- While following, the player's own HUD (speed, minimap) still shows the car; only the view moves.
- Physics keeps running for the parked car; a bus that stands on the car's lane can still bump it.
- With 8 buses (`PA.maxBuses`) the section is 16 lines plus the clock; `#debug` already scrolls (`max-height`, `index.html:66`).

## Testing

node --test for the pure module; one Playwright test (`tests/test_postauto_debug.py`): open with `?patime=` at a time with a bus,
press F3, assert a row per bus and the clock text, click a row, assert `follow` is set, the camera is within 30 m of the bus
and `P` unchanged, press Esc, assert follow is null and the game is not paused.
