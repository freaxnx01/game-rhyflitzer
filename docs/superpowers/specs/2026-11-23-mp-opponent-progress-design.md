# Opponent progress list in the multiplayer race (#1119)

**Issue:** #1119. In a multiplayer race every player sees, for each opponent, the checkpoints passed and the metres to that opponent's next checkpoint.

## Behaviour

- A new block `#netopp` sits in the top-right HUD plate (`#tr`, `index.html:530-535`) directly under `#netpos` (the own position line, `index.html:534`, rendered by `renderNetPos`, `index.html:7164-7170`).
- One row per opponent (not the own player), in lobby id order, text only: `Name · 3/8 · 240 m`.
  - `3/8` = checkpoints passed / `CPS.length`.
  - `240 m` = straight-line distance from the opponent's latest known pose to the opponent's next checkpoint.
  - All checkpoints passed and still running: the next target is the finish (`FINISH`), same format with `8/8`.
  - Finished: `Name · Finish`. Did not finish: `Name · DNF` (`mpDnf`, `strings.js:876,1745`).
  - No pose received yet: distance shown as `—` (the dash `gapText` uses, `index.html:7163`).
- Always readable, also when the opponent is off-screen. No label above the car.
- Shown only while a network race runs (`NET.race` set); hidden in the lobby cruise and on session end, exactly like `#netpos` (`index.html:7243`).
- Visible text de + en via `tr()` / `strings.js`.

## Design

- **Which checkpoint is "next".** Passes are accepted in any order (`acceptCp`, `netrace.js:107-112`, one `mask` bit per checkpoint). The next checkpoint is the **nearest not yet passed** one from the opponent's position, the same rule as the own arrow (nearest open checkpoint).
- **Data.** Guests only get `{id, name, times, st}` per board row (`boardRows`, `netrace.js:153`; `parseRow`, `netcodec.js:203-210`); the pass `mask` is dropped as "host-internal". A guest cannot tell which checkpoints an opponent still lacks from the count alone. Fix: `boardRows` also sends `mask`; `parseRow` accepts an optional integer `mask` in `0 .. 2^CP_MAX - 1` (default 0 when absent). The wire change is additive.
- **Position.** `NETCARS.get(id).track.poses` (latest entry, `x`/`z`) exists on every device for every remote car (`netPose`, `index.html:7283-7292`; `trackFor`, `index.html:7305`).
- **Pure helper** in `netrace.js` (testable with `node --test`, no DOM): `nextCheckpoint(mask, cps, pos)` returns the index of the nearest unpassed checkpoint or `-1`; `opponentRows(rows, you, cps, finish, posOf)` returns `[{ id, name, st, done, total, dist }]` with `dist = null` when there is no pose or the racer is not running.
- **Refresh.** Distances change every frame, the board only on a pass. `renderNetOpp()` is called from `netApplyBoard`, from the `gg-langchange` handler (`index.html:8040`) and throttled to 4 Hz from `stepNetRace` (`index.html:7144`). Names go in with `textContent`, never `innerHTML`.
- **Number format.** `toLocaleString(undefined, { maximumFractionDigits: 0 })` + ` m`; like `gapText` it follows the OS region.

## Assumptions

- **A1** [confirmed] Display: "Liste im HUD": under the own position, one row per opponent, like "Name · 3/8 · 240 m". Always readable, even when the opponent is off-screen. No label above the car. (User answer.)
- **A2** [high] The pass mask is added to the board rows rather than derived from counts. Rejected: guessing the next checkpoint by order. `netrace.js:107` accepts any order, so the count alone is not enough.
- **A3** [high] Pure logic in `netrace.js`, DOM in `index.html`. Rejected: inline math in `renderNetPos`. `netrace.js:1-3` is the pure, node-testable module.
- **A4** [med] Next checkpoint = nearest unpassed from the opponent's position (same as the own arrow). Rejected: fixed index order. Passes are any order (`netrace.js:107`).
- **A5** [med] Distance is straight-line, not road distance. Rejected: route length. No road routing exists for remote cars and the HUD value is orientation only.
- **A6** [med] Finished and DNF opponents show `Finish` / `DNF` instead of a distance. Rejected: freezing the last number. A finished car has no next checkpoint.
- **A7** [high] Total is `CPS.length`, the finish is not counted. Matches `createRace(NET.lobby, CPS.length)` (`index.html:7228`).

## Consequences

- Board messages grow by one small integer per row (max 4 rows), negligible.
- The mask is host-authoritative: only the host sends `board` (`parseBoard`, `netcodec.js:213-219`).
- The HUD plate gets up to 3 more lines; on a small phone `#tr` grows downwards, check it does not reach other HUD elements.

## File overlap with parallel issues

- #1115 (no heli in MP race, race code): touches the race start / `netStartSession` area of `index.html` (~7222). This plan edits `renderNetPos` / `stepNetRace` / `netApplyBoard` (~7140-7170) and `gg-langchange` (~8040). Different hunks, a rebase should be clean.
- #1110 (mode switch in lobby): lobby code, lobby functions in `netrace.js`, lobby strings in `strings.js`. This plan appends functions to the race section of `netrace.js` and new `mpOpp*` keys; a conflict is only possible if both append at the same `strings.js` line.
- #1112, #1111: file lists not checked. `index.html` and `strings.js` are shared hot files, so expect to rebase whichever lands second.
- No dependency on another issue's plan.
