# MP race: hide checkpoints and the arrow after the own finish (#1120)

## Problem

After a player reaches the finish of a multiplayer race, the checkpoint pillars, the finish gate and the navigation arrow stay on screen while the player waits for the others. Expected: hide them, as a single-player finish does.

## Reproduction (headless, 2026-11-20)

Throwaway Playwright script, one page, local `env PW_CDP_ENDPOINT=` under a 2 GB cap. A temporary hook faked the guest role (`NET.role='G'`, `NET.race={go:true}`, stub link) so the real `stepRace` -> `netRaceFinish()` path ran. The two-page `pair` fixture does not start in this environment (`#mpbtn` click times out, the existing `test_multiplayer_race_cp.py` fails the same way), so the single-page fake was used.

State read 1.5 s after the own finish (all five checkpoints passed, finish reached):

| | single-player trial | multiplayer race |
|---|---|---|
| `R.state` | finished | finished |
| `R.target` | finish point (-1290.3, -91.4) | finish point (-1290.3, -91.4) |
| `#arrow` computed display | **none** | **block** |
| `#cpname` / `#dist` | hidden with the HUD | "Finish · Münsterplatz Bad Säckingen" / "0 m", visible |
| `cpObjs[i].g.visible` (5 of 5) | true | true |
| `finishG.visible` | true (set at `R.done === 5`, never cleared) | true |
| `#overlay` open | **true** | **false** |

## Cause

The single-player finish does not hide any marker. `finish()` (`index.html:6386`) opens `#overlay` (`:6386`, `$('overlay').hidden = false`), and the CSS rule `body:has(#overlay:not([hidden])) :is(#tl,#tr,#bl,#br,...)` (`index.html:303`) hides the whole HUD, arrow included. The 3D pillars and the gate stay in the scene, behind the opaque overlay.

The multiplayer finish `netRaceFinish()` (`index.html:6389-6393`) must not open the overlay (A10), so nothing hides the HUD. It sets `R.target = null`, but `stepRace` (`index.html:6283`) keeps running in state `finished` and recomputes `R.target = best` (the finish) every frame, so the arrow keeps showing the finish and `hud()` (`:8289`) keeps updating `#dist` and `#cpname`. Pillars (`cpObjs[i].g`) and `finishG` are never hidden. The minimap also still draws the checkpoint and finish markers (`drawMap`, `hasCheckpoints(R.mode)` twice, `:8118`).

## Design

- `stepRace`: in a network race with `R.state === 'finished'`, set `R.target = null` and return (no re-targeting).
- New `setNetFinished(on)`: toggles `body.mpdone`; on `true` also hides `cpObjs[i].g` and `finishG`. CSS `body.mpdone #arrow, body.mpdone #dist, body.mpdone #cpname {display:none}` next to the `body.cruise` rule (`index.html:129`).
- `netRaceFinish`: call `setNetFinished(true)`.
- `netReopenCp(-1)` (host refused the finish): clear the class and show all `cpObjs[i].g` and `finishG` again.
- `netEndSession`: remove the class (rematch and back-to-lobby pass through it; `startRace` already resets `g.visible` and `finishG`).
- `drawMap`: a `raceMarks()` helper (`hasCheckpoints(R.mode) && !body.mpdone`) replaces the two `hasCheckpoints(R.mode)` calls for the checkpoint and finish squares.
- Test hook `window.__mm.netRace()` gains `state`, `cpVisible`, `finishVisible`, `arrowShown`.

Functions touched in `index.html`: `stepRace`, `netRaceFinish`, `netReopenCp`, `netEndSession`, `drawMap`, the `__mm.netRace` hook, one CSS rule. Not touched: `netStartSession`, `cloneStageVehicle`, `buildNetCar`, `stepNetCars` (other in-flight MP fixes).

## Assumptions

- **A1** [high] Fix lives in the multiplayer path only; the single-player finish is unchanged. Rejected: hiding pillars in `finish()` too. `index.html:303` shows the overlay already hides the HUD, and the issue only asks for MP.
- **A2** [high] The stale arrow is hidden by a body class, not by a new overlay. Rejected: opening `#overlay` on the MP finish. `index.html:6387-6388` (A10) forbids the trial overlay in a network race.
- **A3** [med] The minimap checkpoint and finish squares are hidden too, since they are "the checkpoints". Rejected: leaving the map untouched. The issue text names checkpoints and the arrow, not the map.
- **A4** [med] The `#pips` progress dots and the count stay visible after the finish (they read "5/5", a result, not a pointer). Rejected: hiding the whole `#tl` cps block.
- **A5** [high] A refused finish (`cpno -1`) brings markers and arrow back, because the race state returns to `racing` (`index.html:7177`).

## Consequences

- The finished player sees an empty road with only the position line (`#netpos`) and the board, no marker clutter.
- `stepRace` skips the ring spin and `cpMat` pulse for a finished network racer; nothing is visible then.
