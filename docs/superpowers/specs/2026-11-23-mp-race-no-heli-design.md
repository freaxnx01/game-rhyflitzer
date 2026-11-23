# No helicopter, train or walking in a multiplayer race (#1115)

**Issue:** #1115. Testers asked whether the helicopter makes sense in a multiplayer race. Decision: it does not. While a network race runs, switching to the helicopter, the train (Lok) or on foot is blocked.

## Behaviour

- **Race lock:** from the race countdown on until the race ends, pressing the key to take off (<kbd>F</kbd>) or to get out of the car (<kbd>Z</kbd>, the only way on foot and to the train) does nothing except a short toast: `Im Rennen nicht möglich` (de) / `Not possible during the race` (en).
- **Window:** the lock starts when the race session starts (`netStartSession`, `index.html:7219-7235`, which sets `NET.race`; the 3-2-1 countdown follows in `stepNetRace`, `index.html:7141-7154`) and ends when the host's board says `over` (`netApplyBoard`, `index.html:7162`) or the session ends (`NET.race = null`, `netEndSession`, `index.html:7242`). A player who finished early stays locked until the race is over.
- **Cruise and single-player unchanged:** in an MP cruise `NET.race` is `null` (`index.html:7227`), everything stays allowed. Single-player has no `NET.race`; `R.flown` and its "not counted" penalty (`index.html:5285`, `6414`) stay as they are.
- **Already airborne, on foot or on the train when the countdown starts:** cannot happen. `netStartSession` calls `startRace` and then `resetCar` with a grid pose (`index.html:7230`); `resetCar` runs `endTrain(); endFoot(); FLY.on = false` (`index.html:5045`), so everyone starts in the car on the grid. Nothing new is needed for that case.
- **Leaving is never blocked:** `land` (<kbd>F</kbd> while flying), `leaveTrain` and `getIn` stay available. Only the entering actions are locked, so nobody can get stuck.

## Key bindings checked (all of them)

Grepped `index.html` and every `*.js` in the repo root (there is no `prototype/` folder in this checkout; the game files live at the root). The switches are reachable through two key codes only:

- <kbd>F</kbd> `KeyF`: hard-wired in the global keydown handler, `index.html:4742` (`if (e.code === 'KeyF' && $('overlay').hidden) toggleFly()`), calls `toggleFly` (`index.html:5279`) and `takeOff` (`index.html:5284`). Listed in `controls.js:38` (menu `heli`), `controls.js:61` (foot `hover`, a hover only, not a mode switch), `controls.js:65` (heli `land`).
- <kbd>Z</kbd>: global handler `(e.key || '').toLowerCase() === 'z'` → `pressZ` (`index.html:4742`, `5461-5462`). `pressZ` branches: in the train `leaveTrain`, on foot `boardTrain` or `getIn`, else `getOut` (`index.html:5520`). `controls.js:31` (`getOut`) and `controls.js:48` (`getIn`).
- **Touch buttons and menu/help commands** have no code path of their own: `pressKey` (`index.html:4750`) and the help dispatcher (`index.html:7815`) fire real `keydown` events with the key's code, so they reach the same handler. `touch.js` has no `KeyF`/`KeyZ`/`toggleFly`/`pressZ` references (grep).
- `pause.js`, `steering.js`, `settings.js`, `tutorial.js`, `hints.js`, `keycaps.js`: no direct switch calls. `hints.js:29,38,39` and `tutorial.js:16-19` only describe the keys. No gamepad code exists (grep `gamepad`: 0 hits).
- No other call site of `takeOff`, `getOut` or `boardTrain` exists.

## Design

- **Pure rule** in `netrace.js` (testable with `node --test`): `raceLocksSwitch(race)` returns `!!race && !race.over`.
- **Guard in two places** in `index.html`, at the entering paths only, so every key, touch button and menu entry is covered:
  - `toggleFly`: when not flying and `raceLocksSwitch(NET.race)`, show the toast and return. Landing stays open.
  - `pressZ`: in the final `else` (the `getOut` branch, i.e. not in the train and not on foot), same check. `leaveTrain` and `getIn` stay open.
- **Toast** `mpNoSwitch` in `strings.js` (en and de), shown with the normal `toast()` (`index.html:6290`).
- **Import** (`index.html:1042`) gets `raceLocksSwitch`.
- CHANGELOG line under `[Unreleased]` (German, per file convention).

## Assumptions

- **A1** [confirmed] Helicopter (and train, on foot) in an MP race? "Im Rennen sperren": from the race countdown on until the race ends, switching to the helicopter, the train (Lok) or on foot is blocked; pressing the key shows a short toast "Im Rennen nicht möglich" (de) / English equivalent. In MP cruise everything stays allowed. Single-player is unchanged. (User answer.)
- **A2** [high] Guard only the entering actions (`takeOff`, `getOut`), not `land`/`leaveTrain`/`getIn`. Rejected: blocking every press of F/Z. A player in the wrong state could get stuck; `resetCar` at the start (`index.html:5045`) already makes the wrong state impossible, so this is belt and braces.
- **A3** [high] Player already in heli/train/on foot at the countdown: nothing to decide, the grid reset puts everyone in the car (`index.html:7230`, `5045`). Rejected: an extra forced-exit routine.
- **A4** [high] Guard in `toggleFly` and `pressZ`, not per key. Rejected: guarding in the keydown handler or in touch code. Touch and menu buttons dispatch real key events (`index.html:4750`, `7815`), so the two functions cover every path.
- **A5** [confirmed: "Wenn Rennen für alle vorbei", maintainer 2026-11-23] The lock ends when the host's board reports `over` (race finished for everyone, 60 s after the first finish, `RACE.dnf`, `netrace.js:77`) or the session ends, not at the player's own finish. Rejected: unlocking at the own finish. The user said "until the race ends", and a finished player flying around while others race is exactly what the testers asked about.
- **A6** [med] Toast text en `Not possible during the race`, de `Im Rennen nicht möglich` (de as given by the user). The English wording is my translation.
- **A7** [med] The toast uses the default info duration (`toast()`, `index.html:6290`) and no sound. Rejected: a big toast; the key press is a minor mistake.

## Consequences

- The key bar and the first-time hints still advertise <kbd>F</kbd> / <kbd>Z</kbd> during a race (`controls.js:31,38`; `hints.js:29,39`; `hintCtx` has a `multiplayer` flag, `index.html:5388`). Pressing them now gives the toast. Hiding them is a separate polish item, not part of this issue.
- `R.flown` / `notCountedHeli` can no longer be set in an MP race; the single-player path is untouched.
- The lock keys on `NET.race.over`, which is set only through the host's board; a guest whose board message is lost stays locked until the next board or the session end (same dependency as the result screen).

## File overlap with parallel issues

- **#1119** (opponent HUD, enriched, plan `docs/superpowers/plans/2026-11-23-mp-opponent-progress.md`): edits `renderNetPos`, `stepNetRace`, `netApplyBoard` (~7140-7170), `gg-langchange` (~8040), `netrace.js` (appends race functions, `boardRows`), `netcodec.js`, `strings.js`. This plan touches `toggleFly` (~5279), `pressZ` (~5461), the import line 1042, and appends one function in `netrace.js` and one `mpNoSwitch` key per language in `strings.js`. Different hunks in `index.html`. `netrace.js` and `strings.js` conflict only if both append at the same line, so place the new code **after** the `boardRows` line in `netrace.js` and **after** `mpRaceFinished` in `strings.js`; expect a trivial rebase. The import line 1042 is the one real collision risk: #1119 also adds names there; resolve by merging both name lists.
- **#1110** (mode switch in lobby, in progress): lobby code, lobby functions in `netrace.js`, lobby strings. Possible conflict at the same `strings.js` and import lines only.
- **#1112, #1111:** file lists not checked; `index.html` and `strings.js` are shared hot files.
- No dependency on another issue's plan.
