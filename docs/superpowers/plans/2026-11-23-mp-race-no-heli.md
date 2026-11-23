# No heli / train / foot in an MP race (#1115) Implementation Plan

**Goal:** while `NET.race` is set and not over, <kbd>F</kbd> (take off) and <kbd>Z</kbd> (get out) show a toast `Im Rennen nicht möglich` and do nothing. Cruise and single-player unchanged.
**Spec:** `docs/superpowers/specs/2026-11-23-mp-race-no-heli-design.md`
**Constraints:** buildless vanilla JS, no new files besides tests, no framework. `index.html` lines are very long: use exact-string edits (Edit tool), never reformat. Keep hunks small (#1119 and #1110 edit the same files).
**Verify:** `node --test tests/netrace.test.mjs`, then all `node --test tests/*.test.mjs`. No Playwright, no dry run.

## Task 1: pure lock rule (TDD)

**Files:** `netrace.js`, `tests/netrace.test.mjs`

- [ ] Failing test first. Add `raceLocksSwitch` to the import list at the top of `tests/netrace.test.mjs` and append:

```js
test('raceLocksSwitch_noRace_false', () => {
  assert.equal(raceLocksSwitch(null), false);
});

test('raceLocksSwitch_runningRace_true', () => {
  assert.equal(raceLocksSwitch({ go: false, over: false }), true);   // the countdown counts
  assert.equal(raceLocksSwitch({ go: true }), true);                 // over not set yet
});

test('raceLocksSwitch_raceOver_false', () => {
  assert.equal(raceLocksSwitch({ go: true, over: true }), false);
});
```

- [ ] Run `node --test tests/netrace.test.mjs`: the new tests fail (not exported).
- [ ] In `netrace.js`, directly after the `boardRows` line (`export function boardRows(race) {...}`), add:

```js
// #1115: while a network race runs (countdown included, until the board says over) taking off, walking and the loco are locked
export function raceLocksSwitch(race) { return !!race && !race.over; }
```

- [ ] Run `node --test tests/netrace.test.mjs`: all pass.

## Task 2: strings

**Files:** `strings.js`

- [ ] English block: right after the line `  mpRaceFinished: 'Finished! Waiting for the others',` add:

```js
  mpNoSwitch: 'Not possible during the race',
```

- [ ] German block: right after the line `  mpRaceFinished: 'Im Ziel! Warte auf die anderen',` add:

```js
  mpNoSwitch: 'Im Rennen nicht möglich',
```

- [ ] Run `node --test tests/*.test.mjs` (any en/de key-parity test must pass, both languages are added).

## Task 3: guards in index.html

**Files:** `index.html`

- [ ] Import (line ~1042): in `import { createLobby, ..., boardRows, nearPoint } from './netrace.js';` append `raceLocksSwitch` after `nearPoint`. If #1119 already added names, keep them and just append.
- [ ] Add one helper directly above `function toggleFly()` (line ~5279):

```js
const raceBlocksSwitch = () => { if (!raceLocksSwitch(NET.race)) return false; toast(tr('mpNoSwitch')); return true; };   // #1115: no heli, loco or walking in a network race
```

- [ ] Replace

```js
function toggleFly() { if (WRECK_S.on) return; if (FLY.on) land(); else takeOff(); }
```

with

```js
function toggleFly() { if (WRECK_S.on) return; if (FLY.on) land(); else if (!raceBlocksSwitch()) takeOff(); }
```

- [ ] In `pressZ` (line ~5461-5462) replace the trailing `else getOut(); }` of the line `  if (TRAIN.on) leaveTrain(); else if (FOOT.on) { if (nearLoco()) boardTrain(); else getIn(); } else getOut(); }` with `else if (!raceBlocksSwitch()) getOut(); }`. `leaveTrain`, `boardTrain` and `getIn` stay untouched: they only run when already on foot or in the train, which `resetCar` rules out in a race.
- [ ] `NET` is only read when a key is pressed, so declaration order is not an issue; confirm with `grep -n "^const NET\b" index.html`.
- [ ] Run `node --test tests/*.test.mjs`.

## Task 4: changelog

**Files:** `CHANGELOG.md`

- [ ] Under `## [Unreleased]` / `### Added` (newest first; timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`), add:

```markdown
- `<timestamp>` Im **Mehrspieler-Rennen** bleiben **Helikopter**, **Lok** und **zu Fuss** gesperrt: Von der Startaufstellung bis zum Rennende zeigt <kbd>F</kbd> oder <kbd>Z</kbd> nur noch "Im Rennen nicht möglich". Beim gemeinsamen Herumfahren geht weiterhin alles.
```

## Task 5: final check

- [ ] `git diff --stat` shows only `netrace.js`, `strings.js`, `index.html`, `CHANGELOG.md`, `tests/netrace.test.mjs`.
- [ ] Manual check (human, before release): two players, start a race, press <kbd>F</kbd> and <kbd>Z</kbd> in the countdown and while racing: toast, no state change; after the result screen and in the lobby cruise both work.
