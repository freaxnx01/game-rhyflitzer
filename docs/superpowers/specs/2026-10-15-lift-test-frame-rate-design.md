# Lift shaft pattern test: frame-rate independent recording (#317)

## Problem

`prototype/tests/test_hideout.py::test_lift_shaft_pattern_rises_riding_down_and_sinks_riding_up` records the ride with
`RECORD_RIDE` (`test_hideout.py:701-709`). The loop breaks on `l.phase === 'idle' && rows.length`. The lift is `idle` during the
dwell before a ride (`prototype/lift.js:35-40`), so at ~60 fps the second frame is still `idle` (dwell 0.1 s), the loop stops before
the ride starts, and `descent_rows` returns nothing (`AssertionError: (0, 0)`). At ~1 fps (SwiftShader) the dwell is over after one
frame, which is the only reason it passes today.

## Design

Test-only. `RECORD_RIDE` tracks whether a non-idle phase was seen and breaks on `idle` only after that. The recording then spans the
whole ride (`closing` -> `descending` -> `opening` -> `idle`) at any frame rate. `descent_rows` still filters to `descending`.
Nothing else in the test changes; the assertions (`len > 5`, monotone scroll, indicator count) hold at 60 fps because `ride: 2` s
gives ~120 descending frames.

The 200 s loop timeout stays as the guard against a ride that never starts.

## Assumptions

- **A1** [high] Fix only `RECORD_RIDE`; no change to `lift.js` or the game. Rejected: lengthening the dwell/ride times in the test.
  The phase machine is correct (`lift.js:8-40`); only the recorder's stop condition is frame-rate dependent.
- **A2** [high] `RECORD_RIDE` and `descent_rows` are used by this one test only (grep of `prototype/tests/*.py` shows `test_hideout.py:701,713,724,729`).
- **A3** [med] No 60 fps run is part of the plan: the issue pins the cause and this lane's cost rules forbid a trial run on the GPU browser; the
  plan verifies at SwiftShader only and reasons about 60 fps from the phase machine. Rejected: running on the GPU browser (#304, local sessions only).

## Consequences

- At ~1 fps the recording now also includes the `opening` frames and one `idle` end frame; filtered out by `descent_rows`, no effect.
