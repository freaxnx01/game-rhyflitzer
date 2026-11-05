# Autopilot: roundabout exit signal, Swiss rule (#680)

## Goal

The autopilot signals a roundabout the Swiss way: no signal on entry, **always right** on exit, switched on from the previous exit of the ring (from the entry for the first exit). Today it signals left on almost every exit.

## Today

- `routeSignals()` (`route.js:224`) emits one signal per roundabout run, at the exit: `side: r.right ? 'right' : 'left'` (`route.js:233`), window `from: sOut - AUTO.roundaboutSignalBefore` (15 m, `route.js:26`) to `sOut + AUTO.signalAfter` (10 m).
- `r.right` comes from `ringRuns()` (`route.js:217`): `headingChange(route, i, k) > 0`, the sign of the total heading change around the ring, i.e. the **direction the ring is driven**, not the side of the exit.
- Right-hand traffic drives a roundabout counter-clockwise, so `headingChange` is negative and `side` is `'left'`.
- Entry: no signal is emitted for the ring run's entry, and the junction loop skips joints inside a run (`route.js:226`). Correct already.
- `blinkerAt()` (`route.js:236`) turns the blinker on for `s` in `[from ?? s - signalBefore, to ?? s + signalAfter]`.

## Reproduction (headless, `node --test`, no browser)

Synthetic counter-clockwise ring (radius 12 m, 32 vertices, angle decreasing, i.e. counter-clockwise on the north-up map with x east and z south), entered from the east arm, left after 1, 2 and 3 quarter turns:

```text
exit 1: signals=[{"s":118.8,"side":"left","from":103.8,"to":128.8}]
exit 2: signals=[{"s":137.6,"side":"left","from":122.6,"to":147.6}]
exit 3: signals=[{"s":156.5,"side":"left","from":141.5,"to":166.5}]
```

All three return `side: 'left'` at `route.js:233`, because `ringRuns` stores `right: false` for a counter-clockwise run (`route.js:217`). The cause is the ring direction used as exit side. The window is 25 m wide at every exit (`from = s - 15`), so exits 2 and 3 do not start at the previous exit (a quarter turn is 18.8 m on this ring, a larger ring is longer).

## Decisions

| Topic | Decision |
|---|---|
| Side | The exit signal is always `'right'`. `ringRuns` no longer computes a direction, so `right` and `headingChange` (used nowhere else, `route.js:200`) are deleted. |
| Start | The signal window starts at the previous exit of the ring that the route passes, i.e. the last route joint with degree 3+ strictly inside the run (`sIn + 0.5 < j.s < sOut - 0.5`); if there is none (first exit), at `sIn`. `from = max(sIn, previous exit s)`. |
| End | Unchanged: `to = sOut + AUTO.signalAfter` (10 m). |
| Constant | `AUTO.roundaboutSignalBefore` (`route.js:26`) is unused afterwards and removed. |
| Entry | Unchanged, no signal. |
| Lanes | Not touched. Lane choice in multi-lane roundabouts (outer lane for right-half exits, lane change means signal and yield) depends on `oneway`/`lanes` data (#679) and the lane offset (#678); out of scope here. |

## Assumptions

- **A1** [confirmed] Swiss rule: "Einfahrt ohne Blinker; Ausfahrt immer rechts blinken, ab Höhe der vorherigen Ausfahrt (bei der ersten Ausfahrt ab der Einfahrt)" (Maintainer, 2026-11-05; sources in the issue comment, Art. 41b VRV).
- **A2** [high] The side is the constant `'right'`, not derived from the geometry. Rejected: comparing the exit arm's bearing with the ring tangent. In right-hand traffic every exit is a right turn off the ring, and the issue says "immer rechts". Evidence: `route.js:217`, `:233`.
- **A3** [high] The "previous exit" is found from `route.joints` (`route.js:152`: joints carry `s` and degree, built at every graph node the route passes). A ring vertex where an arm attaches has degree 3+; a plain ring vertex is not a node. Rejected: counting roads touching the ring from `route.road`, which does not list roads the route does not use.
- **A4** [med] Every crossing arm counts as an exit, including one-way arms that only enter. There is no `oneway` data in the world file yet (#679), so the blinker may start slightly early at such an arm. Harmless, and it improves once #679 lands.
- **A5** [med] The window end stays at `sOut + AUTO.signalAfter` (10 m); the rule only speaks about the start.
- **A6** [med] `AUTO.roundaboutSignalBefore` is deleted rather than kept as a minimum. Nothing else reads it (`grep` over `*.js`, `*.html`, `*.mjs`, `*.py`: only `route.js:26` and `:233`).
- **A7** [med] `tests/test_autopilot.py:111` (`to - from == 25`) encodes the old fixed window and is updated to the new shape (`to - s == AUTO.signalAfter`, `from < s`). It is edited, not run (Playwright dry runs are excluded from enrichment); the implementer's targeted run of that one test confirms it.

## Consequences

- On a ring the signal is now on for longer (from the previous exit rather than 15 m), as in real driving.
- The existing unit test `routeSignals_RoundaboutExit_SideFollowsTheRingDirection` asserts the bug (opposite sides for opposite ring directions) and is replaced.
- `routeSignals_RouteThroughRoundabout_BlinksOnlyAtTheExit` asserts no blinker at the entry point `s = 100`; with the new rule the blinker is on from the entry for the first exit, so that assertion moves to just before the entry (`s = 99`).
- Passing the game's own HUD blinker lamps (`index.html:5143`) needs no change: `side` is still `'left' | 'right'`.

## Dependencies

- None blocking. #678 (lane offset) and #679 (`oneway`/`lanes`) are related: multi-lane roundabout lane choice and the one-way refinement of A4 build on them. This issue's change is independent and can land first.
