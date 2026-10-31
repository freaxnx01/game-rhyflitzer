# Cruise mode: free roam, no clock, no checkpoints (#551) - Design

**Issue:** #551 (older duplicate: #198). Comes before the viewpoint mode #508, which builds on it.
**Maintainer addendum 2026-10-31:** Cruise is the **default mode**: preselected on the start screen and whenever no `?mode=` is given.

## Goal

A fourth mode, **Cruise** (en "Cruise", de "Herumfahren"): drive, walk, fly, take the loco, enter the hideout - with no clock,
no checkpoints, no finish, no arrow. It is the first button on the start screen and the preselected one.

## Today (evidence)

- `startscreen.js:4` `MODES = ['trial', 'blitz', 'hunt']`; `lastModeFrom` falls back to `'trial'`.
- `index.html:4163` `R = { state: 'ready', mode: 'trial', … }`; `index.html:4182` `startRace(mode = 'trial')`; `index.html:4334`
  `resetMode()` puts `R.mode = 'trial'` on every way back to the start screen.
- `index.html:4206` `MODE_BTN = { startbtn: 'trial', blitzbtn: 'blitz', huntbtn: 'hunt' }`; `focusStart` focuses the first visible
  mode button (`index.html:4215-4216`). The trial button's label is the string key `start` ("Start").
- No `?mode=` URL parameter exists today (no `get('mode')` anywhere).
- `stepRace` (`index.html:4190`) drives the clock, the checkpoint pickup and `R.target` (the arrow). `R.state` goes
  `armed → racing` on the first movement; `canPause` accepts `armed`/`racing`, `needsAbandonConfirm` only `racing` (`pause.js:10-17`).
- `KeyR` = `clearNavi(); resetCar()` = back on the road at `P.safe` (`index.html:3271`). Not changed.
- No discoveries code (#545) exists yet (`grep -n discover` finds nothing).

## Design

### Modes and defaults (pure, `startscreen.js`)

- `MODES = ['cruise', 'trial', 'blitz', 'hunt']` (bar order).
- `startModeFrom(search, raceless)`: `?mode=` if it is one of `MODES` (raceless worlds: only `cruise`/`hunt`), else `'cruise'`.
- `lastModeFrom(stored, raceless)`: a valid stored mode wins (raceless: only `cruise`/`hunt`), else `'cruise'`.
- `modeTextKey('cruise') → 'cruiseIntro'`.
- `hasCheckpoints(mode)`: `true` for `trial` and `blitz` only.

### Game wiring (`index.html`)

- `START_MODE = startModeFrom(location.search, RACELESS)`; `R.mode` starts as `START_MODE`; `resetMode()` returns to `START_MODE`.
- New first button `#cruisebtn` (class `primary`, moved off `#startbtn`); `MODE_BTN` gains `cruisebtn: 'cruise'`.
  `focusStart()` focuses the button of `START_MODE` (falls back to the first visible mode button).
- Trial button `#startbtn` keeps its id (56 test files click it), but its label becomes **Time trial / Zeitfahren**
  (string key `start` renamed `trial`), since "Start" next to a preselected Cruise would be misleading.
- `startRace('cruise')`: checkpoints, finish and presents hidden, no toast, `R.state = 'armed'` and it stays there
  (`stepRace` returns early with `R.target = null`), so pause works and Main menu never asks to abandon.
  `RACELESS` no longer forces cruise into hunt.
- HUD: `renderModeLine` toggles `body.cruise`. CSS hides the checkpoint counter, pips, the clock plate `#tr`, `#arrow`,
  `#dist`, `#cpname`. The mode line stays ("Cruising · Hochrhein" / "Herumfahren · Hochrhein"); speedo, minimap, knock row stay.
- Minimap: checkpoints and finish only when `hasCheckpoints(R.mode)`.
- Pause menu: `pauseButtonsFor('cruise')` (pure, `pause.js`) omits `pauserestart`; the button is hidden and focus
  navigation skips it.
- Start point Sisseln (`START`), like the race. `R` unchanged.
- Phone layout: `#cruisebtn` spans both grid columns, so the existing 2x2 of trial/blitz/hunt/car stays intact.

### Strings (`strings.js`, en + de)

`cruise` (button), `modeCruise(r)` (HUD/car screen line), `cruiseIntro` (start-screen slot), `trial` (renamed from `start`).

## Out of scope

Discoveries (#545) counting in cruise; "last visited place" as start point; the viewpoint mode (#508).

## Tests

- Unit: `startscreen.test.mjs` (MODES, `startModeFrom`, `lastModeFrom` new fallback, `hasCheckpoints`, `modeTextKey`),
  `pause.test.mjs` (`pauseButtonsFor`).
- New Playwright `tests/test_cruise.py`: default focus/start, hidden HUD and checkpoints, pause without restart, Main menu
  straight back, `?mode=trial` preselects the trial.
- Existing Playwright tests that assumed the trial is the default keep their exact assertions by loading `?mode=trial`;
  tests that assert the bar's structure or the trial button's label get the new expected values (see plan Task 6).
