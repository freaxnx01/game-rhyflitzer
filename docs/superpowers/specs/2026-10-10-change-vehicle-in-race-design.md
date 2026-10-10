# Change the vehicle during a race (#189) — design

## Context (state of `main`, 4587571)

- Vehicle choice lives on the car selection screen (#7, #162): `openCarSel()` (`index.html` ~1993), `selectVehicle(id)` swaps the model **live** (`setVehicle` + `buildCar`), `csrace` starts a new race. Two vehicles exist in `VEHICLES` (`index.html:1447`): `compact` (top 60 m/s, accel 16) and `delorean` (top 49, accel 10, fixed paint). The helicopter is not a vehicle but the flight mode on F (`FLY`), flagged `R.flown`.
- Pause menu (#83): `pause.js` `PAUSE_BUTTONS = ['pauseresume','pauserestart','pausemenu']`; while `PAUSE.on` the loop skips every step (`loop()`, `index.html:2182`), so the race clock (`R.t`), the car and the damage (`P.dmg`) are frozen.
- Result flags that mean "does not count": `R.jumped` (J / map double-click / random spot, `placeOnRoad` `index.html:1680`), `R.auto` (autopilot), `R.flown` (heli). `finish()` and `endHunt()` compute `clean = !R.jumped && !R.auto && !R.flown`; `penalties()` (`index.html:1980`) builds the result-screen text from `notCountedJump|Auto|Heli`.
- Keys bound: A B C D E F G H I J K M N O Q R S T V W X; P = pause (and reserved for the pontoon bridge, #100); free: L U Y Z (L is wanted for lights, #2).

## Design

**Entry: a pause-menu button "Change vehicle" (no hotkey).** Esc / P / the II button open the pause menu (works on touch, too); the new button sits second, after "Resume". It opens the **existing car selection overlay** over the frozen scene. Differences from the start-screen use, all driven by one field `CARSEL.swap` (null = start-screen use, `{id, paint}` = the choice at entry):

- the primary button reads "Drive on ›" (`carselDriveOn`) instead of "Race! ›" and **does not start a race**: it keeps the choice, closes the overlay and resumes (`closePause()`);
- "‹ Back" and Esc **cancel**: the vehicle and paint seen at entry are restored (the live preview changed them), and the pause menu returns with the focus on "Change vehicle";
- the turntable runs while paused (the pause branch of `loop()` also calls `stepCamera`, `drawWheels`, `drawShadow` when `CARSEL.on`).

**What happens to the run:** the clock stays frozen while choosing and resumes where it stopped. Position, heading, speed and damage are kept (a swap is not a repair and not a teleport). The new vehicle's physics (`VEH`) apply from the first resumed frame. Checkpoints, route, Blitz clock, hunt boxes are untouched.

**Result flag:** applying a **different vehicle** (not just a different paint colour) sets `R.swapped = true`. A swapped run does not count for the best time / Blitz rank / hunt best (like jump, auto, heli) and the result screen says "with a vehicle change, not counted". `R.swapped` is reset in `startRace`. Test hook `raceFlags()` gets a `swapped` field.

## Acceptance Criteria

- [ ] The pause menu has a fourth button "Change vehicle" / "Fahrzeug wechseln" (id `pausevehicle`), second in focus order; Esc/P/II open the menu as before.
- [ ] It opens the car selection screen over the paused race; the primary button reads "Drive on ›" / "Weiterfahren ›"; the turntable keeps turning.
- [ ] Selecting the other vehicle and "Drive on ›" resumes the race with the new vehicle (`__mm.vehicle().drive.top` changes), with the same clock value, position and damage as before.
- [ ] "‹ Back" and Esc restore the vehicle and paint seen at entry and return to the pause menu; nothing is flagged.
- [ ] Applying a different vehicle sets `raceFlags().swapped`; the result screen shows "with a vehicle change, not counted · " and `R.best` is not updated; changing only the paint colour does not flag.
- [ ] The start-screen use of the car selection ("Race! ›", Back to the start screen) is unchanged.
- [ ] `strings.js` has `pauseVehicle`, `carselDriveOn`, `notCountedSwap` in `en` and `de` (Swiss spelling, equal keys); `keyPause` in the help mentions the new entry.
- [ ] Unit test `pause.test.mjs`, `strings.test.mjs` and the Playwright files `test_carselect.py`, `test_pause.py`, `test_navi.py` pass.

## Assumptions

- **A0** [needs maintainer] **A mid-race swap flags the result as "does not count"** (default: yes, like jump/heli). Reason: the vehicles differ in top speed/accel (compact 60 m/s / 16, DeLorean 49 / 10), so picking the faster one for a stretch is an advantage over a one-vehicle run. The alternative "counts, no flag" is a one-line change (drop `&& !R.swapped` in the two `clean` expressions).
- **A1** [needs maintainer] **Entry point is a pause-menu button, no hotkey.** Rejected: a hotkey (L is wanted for lights #2, U/Y/Z are awkward, a stray key press mid-corner would open a dialog, touch has no keys); rejected: the J-style dialog (a vehicle is picked on a stage with stats, #162).
- **A2** [needs maintainer] **Damage and speed are kept** across the swap (no free repair). Alternative: reset `P.dmg` to 0 (turns the swap into a repair shop; then it would also have to be a flag-worthy exploit).
- **A3** [med] Allowed in every mode (trial, Blitz, hunt) and while armed or racing. While flying (`FLY.on`) it is allowed too: only the ground car changes, the heli stays. Rejected: blocking during flight: no technical reason.
- **A4** [med] The car selection is reused (not a new dialog): `CARSEL.swap` carries the difference. Evidence: `selectVehicle` already rebuilds the live model, so the preview is free; the cost is the cancel path, which restores the entry choice.
- **A5** [med] The choice is stored in `localStorage` (`mm.car`) when applied, like on the start screen; a cancel restores the previous stored value (the preview writes through `selectVehicle`).
- **A6** [low] No collision re-resolve at swap time. The collision radius differs by 0.1 m between the two cars and `collide()` pushes out of walls on the next frame anyway.
- **A7** [high] Test hook `__mm.raceNow(t, dmg)` is added to reach "racing with a clock and damage" in zero frames; the existing pause tests use `drive()` which is frame-bound.

## Consequences

- The pause menu grows by one button (phone fit is checked by `test_phone_pause_button_and_menu_fit`, updated for four buttons).
- A player who changes the vehicle mid-race loses the record for that run; the result text says why.
- `raceFlags()` has a new key, so `test_navi.py:228` (exact dict equality) is updated.
