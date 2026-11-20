# Engine sound in a multiplayer session (#1114)

## Problem
In a multiplayer session (cruise or race, host and guest) the car makes no engine sound.

## Cause (confirmed in the code, no repro run: audio cannot be heard headless, state is checkable)
- `SFX.start()` (`index.html:4776`, `start() { try { ctx(); engine(); } ... }`) is the only thing that creates the AudioContext and the engine voice. `SFX.update` returns at once while `eng` is null (`index.html:4778`).
- Every single-player entry calls it before `startRace`: `cruisebtn` `index.html:6451`, `startbtn` 6452, `deliverybtn` 6564, `blitzbtn` 6568, `huntbtn` 6569, `viewbtn` 6570, `tutorialbtn` 6571, `csrace` (single-player branch) 6716, test hook 8000.
- The multiplayer path never calls it: `netStartSession` (`index.html:7184`) calls `startRace(...)` directly (7190). It is reached from the host's `mpgo` (7438), `mprace` (7443), `netRematch` (7390) and the guest's `start` message (6964). `csrace` in MP mode returns early into `netTakeCar` (6716), skipping `SFX.start()` too.
- Result: a player who has not started a single-player run since page load has no AudioContext and no engine voice. Other sounds (horn, crash) still call `ctx()` lazily, so only the engine is missing.

## Design
One call: `SFX.start()` at the top of `netStartSession` (after the `NET.session` guard). It is the single choke point for host, guest and rematch. `SFX.start()` is idempotent (`ctx()` and `engine()` return the existing objects) and try/catch-wrapped. `ctx()` calls `resume()` when suspended; the guest runs from a data-channel message, but the player has clicked in the lobby (pick car, ready), so the page has user activation.

Not changed: SFX internals, single-player buttons, `csrace`, the pause/hold logic.

## Acceptance criteria
- [ ] After "Drive together" the host and the guest each have an AudioContext (`__mm.audio().ctx !== 'none'`) and an engine mix (`__mm.audio().mix !== null`) without any single-player start first.
- [ ] Same after a race start (`mprace`) and a rematch.
- [ ] Single-player starts behave as before; sound-off and pause holds still silence the engine.
- [ ] No console errors.

## Functions touched (for landing order)
- `index.html`: `netStartSession` only (one line). Other issues editing `netStartSession` or its neighbours at 7184-7198 would conflict; edits elsewhere in `index.html` merge cleanly.
- `tests/test_multiplayer_cruise.py`: one new test.
- `CHANGELOG.md`: one entry under `[Unreleased]`, `### Fixed`.

## Assumptions
- **A1** [high] Fix in `netStartSession`, not in each caller. Rejected: add `SFX.start()` to `mpgo`/`mprace`/`netRematch`/guest handler. `index.html:6964,7390,7438,7443` all converge on `netStartSession`.
- **A2** [high] No change to `csrace` MP branch. Rejected: start audio at the car-pick click. `netStartSession` runs on both peers anyway and covers rematch.
- **A3** [med] The guest's AudioContext resumes without a fresh gesture because the lobby clicks give the page sticky user activation (`index.html:4771`, `ac.resume()` when suspended). Rejected: resuming on the next key press. Real-browser behaviour cannot be proven headless.
- **A4** [high] No dedicated Playwright audio repro; the test checks context and engine-mix state instead (`index.html:4830` `state()`, `5834` `__mm.audio`).

## Consequences
- A mid-session reload as a guest that rejoins runs `netStartSession` and starts audio too: intended.
- Engine sound now plays in MP from the first frame, including under the race countdown if the car idles (idle voice, quiet).
