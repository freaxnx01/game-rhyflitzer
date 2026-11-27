# Radio: Rock and Cruise wrap after their last song (#1172)

## Problem

`step(dir)` in `index.html:5069` calls `nextTrack(S.pos)` / `prevTrack(S.pos)` without `n`, so both wrap at
`TRACKS.length` (18, `radio.js:67-68`). `S.order` is the station's own list from `stationOrder` (`radio.js:79`):
mix 18, rock 11, cruise 7. Verified in node against origin/main (22a558e), shuffle off:

- rock: `nextTrack(10)` = 11 -> `S.order[11]` is `undefined` (radio goes silent); `prevTrack(0)` = 17 -> `undefined`
- cruise: `nextTrack(6)` = 7 -> `undefined`; `prevTrack(0)` = 17 -> `undefined`
- mix: wraps correctly only because it holds all 18 tracks

The issue's line number (~4883) is stale; the line is now 5069.

## Design

Wrap at the station's own length. To make that testable in node (`step` is a closure inside `index.html`), add one
pure helper to `radio.js`:

```js
export const stepPos = (pos, dir, n) => (dir > 0 ? nextTrack : prevTrack)(pos, n);
```

and `step` becomes `S.pos = stepPos(S.pos, dir, S.order.length);`. `nextTrack` / `prevTrack` stay unchanged.
Shuffle needs no special case: `S.order` is already the shuffled list, so wrapping its length replays the same
shuffled order.

## Acceptance criteria

- Rock and cruise: next on the last song goes to the first; previous on the first goes to the last (shuffle on and off).
- Mix behaves as before.
- Node test in `tests/radio.test.mjs` covers all three stations, both directions, shuffle on and off, and fails before the fix.
- `CHANGELOG.md` has a German player-facing entry under `[Unreleased]`.

## Out of scope

The live stations (SRF 3, Argovia) and the menu-song carry-over logic (`endCarry`); both use `step` unchanged.
