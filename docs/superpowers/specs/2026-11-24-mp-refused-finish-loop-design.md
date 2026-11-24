# A refused multiplayer finish re-asks every frame (#1169)

## Problem

`tests/test_multiplayer_race_finish.py::test_a_refused_finish_brings_markers_and_arrow_back`
went red in the nightly run on `b3f60d9` (run 45160724625, GPU shard 2: `finishVisible` was `False`).
It passes locally 3 of 3. It is a timing flake, but the flake comes from a real product loop.

### Measured

A probe used the same fixtures. The guest marks every checkpoint locally with `netMarkCpDone` and is
placed on the finish at speed 0. Then `netRace()` is sampled every 50 ms for 6 s on the homelab GPU
browser:

- `cpno` went **1 → 109** in 6 s (about 18 refusals per second), and kept climbing.
- `state` flipped between `racing` and `finished`; `finishVisible` and `arrowShown` flipped with it
  (`[7,'finished',False,False]`, `[30,'racing',True,True]`, ...).

### Cause

- `index.html:7251`: `netReopenCp(-1)` sets `R.state = 'racing'` and shows the gate again, but the
  car is still inside the finish radius.
- `index.html:6329`: `stepRace`'s branch `best.i < 0 && bd < 7 && R.state === 'racing'` fires on the
  next step and calls `netRaceFinish()` again. That sets `R.state = 'finished'`, hides the gate via
  `setNetFinished(true)` (`index.html:6439`), plays `SFX.finish()`, shows `toastBig` and sends a new
  `finish` message to the host.
- The host refuses again (`index.html:6453`, `cpno -1`), and the loop repeats until the car leaves.

The test samples this oscillating state. `wait_for_function` sees a `racing` frame, and the next
`evaluate` can land in a `finished` frame. On a loaded CI runner the gap between the two calls is
longer, so it lands there more often. The test's expectation (after a refusal the markers stay back)
is correct. The product is wrong.

Player-visible effect: a guest who stops inside the gate after a refusal gets the finish sound and
the big toast about 18 times a second, and floods the host with `finish` messages.

## Design

After a refused finish, the gate is **held** until the car has left the finish radius once.

- `netrace.js`: a pure helper `finishHeld(held, dist)` returns `held && dist < RACE.radius`. It
  answers "is the gate still shut for this car" and can be tested with node.
- `index.html` `netReopenCp(-1)`: sets `NET.race.finishHold = true` when it reopens the finish.
- `index.html` `stepRace`: when the target is the finish (`best.i < 0`) and `NET.race?.finishHold`
  is set, it updates the hold with `finishHeld(true, bd)`. The finish branch also requires
  `!NET.race?.finishHold`.
- `netStartSession` creates a fresh `NET.race`, so the hold never carries into the next race.

Driving out of the 7 m radius and back in asks the host again, once per entry.

## Acceptance criteria

- After one refused finish with the car parked in the gate, `cpno` stays at 1 for at least 2 s,
  and `state` stays `racing` with the gate, the checkpoints and the arrow visible.
- Leaving the finish radius and coming back sends one new `finish`.
- `finishHeld` has node unit tests. The existing `test_multiplayer_race_finish.py` tests pass unchanged.

## Out of scope (discovery)

`netReopenCp(i >= 0)` (`index.html:7250-7256`) has the same shape for checkpoints. A refused pass
reopens a checkpoint the car may still be inside, and `stepRace` marks it again and sends a new `cp`.
Not changed here; it needs its own issue.
