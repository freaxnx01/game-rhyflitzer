# A refused multiplayer checkpoint re-asks every frame (#1184)

## Problem

Same loop as #1169 (refused finish), for checkpoints. When the host refuses a guest's `cp`, it answers
`cpno i`; `netReopenCp(i)` (`index.html:7337-7343`) reopens the checkpoint while the car still stands inside
its 7 m radius. The next `stepRace` step (`index.html:6416`, branch `best.i >= 0 && bd < 7`) marks it done
again, plays `SFX.checkpoint()`, shows the toast and sends a new `cp` (`netRaceCp`, `index.html:7322-7326`).

### Measured (reproduced headless, 2026-11-25)

Probe (throwaway Playwright file, same `pair` fixtures as `tests/test_multiplayer_race_finish.py`): after
`start_race`, the guest is placed on checkpoint 0 with `__mm.place(x, z, 0)`, then 4 s are observed. A patch of
`RTCDataChannel.prototype.send` on the guest counts messages per channel and, in the second run, drops the
binary pose records so the host has no pose near the checkpoint (a laggy or lossy link).

| Run | `ev:cp` messages sent in 4 s | `cpno` (refusals) | checkpoint 0 at the end |
|---|---|---|---|
| normal link | 2 | 1 | done (host accepted the second ask) |
| poses withheld | **107** (about 27 per second) | **107** | open again, flipping each step |

So the loop is real but self-healing on a good link: the host's pose buffer catches up after one round trip
and accepts the second `cp`; the player then gets the pass sound and toast twice. While the host has no near
pose (round trip or pose loss longer than the refusal round trip) it repeats at frame rate, with sound, toast
and a `cp` flood each time. `netMarkCpDone` alone cannot trigger it (it never sends a `cp`); the trigger is a
real pass.

### Cause

- `index.html:7337-7343` `netReopenCp(i >= 0)` reopens the checkpoint with no memory that the car is inside.
- `index.html:6416` `stepRace`, branch `best.i >= 0 && bd < 7`, passes it again on the next step.
- Host side is correct: `acceptCp` (`netrace.js:106`) refuses a pass with no near pose, `netHostPass`
  (`index.html:7329-7334`) answers `cpno`.

## Design

Mirror #1169 for checkpoints, reusing `finishHeld(held, dist)` (`netrace.js:135`) without a second copy.

- `index.html` `netReopenCp(i >= 0)`: after reopening, add `i` to `NET.race.cpHold` (a `Set`, created on demand).
- `index.html` `stepRace`: before choosing the target, drop every held index whose distance makes
  `finishHeld(true, dist)` false (the car left the radius). Done for all held indices, not only the nearest
  checkpoint, so a hold cannot go stale when the car leaves, drives elsewhere and comes back.
- The checkpoint branch also requires `!NET.race?.cpHold?.has(best.i)`.
- `NET.race` is created fresh per session, so the hold never carries into the next race.

Leaving the radius and re-entering asks the host again, once per entry.

## Acceptance criteria

- With the guest on a checkpoint and the host refusing, `cp` messages stay at 1 and `cpno` at 1 for at least 3 s;
  the checkpoint is open and visible meanwhile.
- Leaving the 7 m radius and coming back sends exactly one new `cp`.
- `finishHeld` is reused, not copied; the existing tests in `test_multiplayer_race_cp.py` and
  `test_multiplayer_race_finish.py` pass unchanged.

## Assumptions

- **A1** [confirmed] A reopened checkpoint re-arms only after the car has left it, the same rule as the
  finish in #1169, reusing `finishHeld(held, dist)` from `netrace.js` (PR#1185, commit 7705b63) instead of a
  second copy. Maintainer answer for #1169: "Erst nach Verlassen des Ziels".
- **A2** [high] The hold lives in `NET.race.cpHold`, next to `NET.race.finishHold` (`index.html:7338`).
  Rejected: a field on `cpObjs[i]`. `NET.race` is rebuilt per session, so nothing needs resetting.
- **A3** [high] A `Set` of indices, updated for all held indices each step. Rejected: one boolean like
  `finishHold`. Several checkpoints can be reopened, and `stepRace` only measures the nearest open
  checkpoint (`index.html:6416`), so a single flag could stay stale.
- **A4** [med] The test withholds pose records by patching `RTCDataChannel.prototype.send` on the guest
  page, inside the test file only; no new `__mm` hook in `index.html`. Rejected: a debug hook that stops
  `netSendPose` (`index.html:7399`). Keeps test-only code out of the product file.
- **A5** [med] No host change. On a normal link a refused pass now counts only after driving out and in
  again (before: the host's second acceptance came for free after one round trip). Same trade-off as the
  finish in #1169.

## Consequences

- A guest refused once and parked in the checkpoint no longer gets the pass for free on the second ask; it
  has to leave and re-enter. Same as the finish.
- The pass sound and toast no longer repeat while parked in a refused checkpoint.

## Out of scope (discovery)

None found.
