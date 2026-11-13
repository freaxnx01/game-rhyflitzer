# One key for nitro in every context (#913)

## Why

Nitro sits on two keys in the car, Shift and N (`controls.js:30`, `index.html:5601`, the key bar shows Shift), but only
on N on foot (`foot.js:17`, `controls.js:52`) and in the helicopter (`heli.js:19`, `controls.js:62`). There Shift means
down / sink (`foot.js:16`, `heli.js:23`, `controls.js:51,62`). One action, two keys in one place and a different key
in the others: the key bar, the tutorial and the help list disagree with what players learn elsewhere.

## What the player sees

- Nitro is **N** in the car, on foot and in the helicopter. Shift is no longer nitro anywhere; in the car it does nothing.
- The key bar in the car shows **N Nitro** (was "Shift Nitro").
- The tutorial nitro step teaches **N** ("Hold N for nitro, one second"; the cap comes from the key bar entry, so no
  string changes).
- The F1 help row reads `N` instead of `Shift · N` (`index.html:481`).
- Shift keeps its other jobs: down on foot, sink in the heli, the record modifier on ä (`campath.js:201`).

## Assumptions

- **A1** [confirmed] Which key is nitro in every context? Answer: "N everywhere": N already means nitro on foot, in the
  heli and in the car. Shift is 'down'/'sink' on foot and in the heli, so it can't be nitro there; in the car Shift is
  dropped and the key bar shows N.
- **A2** [high] The car's nitro entry becomes `entry('nitro', ['KeyN'], { ..., cap: 'N' })`; the action name `nitro`
  stays (the tutorial step and `howTo` look it up by action, `tutorial.js:14,48`). Rejected: renaming it to unify with
  `footNitro` / `heliNitro`; that would touch the tutorial and tests for no player-visible gain.
- **A3** [high] The car's input read in `index.html:5601` drops `inp.ShiftLeft || inp.ShiftRight`; `KeyN` stays, and
  nitro still implies gas (`... || nitro`) as today. Evidence: that line is the only place that reads Shift in the car
  (grep over all root `*.js` and `index.html`).
- **A4** [high] `TAKE_OVER_KEYS` (`route.js:31`) loses `ShiftLeft` / `ShiftRight`: the autopilot hands the car back on
  a press of a nitro key, and Shift is not one any more. Its comment and the test at `tests/route.test.mjs:131` follow.
- **A5** [high] Touch has no nitro control (`controls.js:30`, no `touch` field), so nothing changes on phones.
- **A6** [confirmed] No migration hint: a player used to Shift in the car simply gets nothing and sees N in the key bar. Confirmed 2026-11-12: "No hint, key bar shows N".
  Rejected: a one-off toast; the key bar already teaches the key and a toast is extra UI nobody asked for.
- **A7** [high] Tests that press Shift for nitro in the car are changed to N (they test the old binding, not a
  behaviour to keep): `tests/controls.test.mjs:28`, `tests/test_controls.py:30-41`, `tests/test_tutorial.py:115,151,154`,
  `tests/test_keybar.py:54`, `tests/tutorial.test.mjs:49`, `tests/route.test.mjs:131`. Foot / heli tests that press
  Shift for down stay (`tests/foot.test.mjs:21`, `tests/heli.test.mjs:35-36`, `tests/test_heli.py:78`).
- **A8** [high] Scope stays nitro. Other double bindings seen are listed under Notes and not planned.

## Design

Three small edits, one test sweep:

1. `controls.js`: car `nitro` entry keys `['KeyN']`, cap `'N'`.
2. `index.html`: nitro read in the car loop (`:5601`) is `inp.KeyN` only; help row `<kbd>` text `N`.
3. `route.js`: drop Shift from `TAKE_OVER_KEYS`, fix the comment.
4. Tests follow (A7), plus a new node test that no context binds one action to Shift and N together, and a
   Playwright check that Shift in the car gives `nitro === 0`.

## Consequences

- Holding Shift in the car no longer boosts: a deliberate behaviour change for players who learned it (#535).
- Shift no longer cancels the autopilot (it did only because it was nitro).
- The Space + Shift + B combined-hold test (#535) now proves Space + N + B; Shift is checked as inert.

## Notes (not planned)

Other multi-key bindings in `controls.js`, noticed while reading, left as they are because they are alternatives for one
action, not a key shared by two actions: gas on `Space` / `W` / `ArrowUp` in the car (`:29`), horn `H` / `Enter` /
`NumpadEnter`, pause `Escape` / `P`, handbrake `Ctrl` left / right, radio track `7` / `8`. `H` is horn in the car and
whistle on the train, `F` is heli / hover / land per context: same key, different context, by design. The issue text
names `Space` in the car as "drive": it is gas, and `W` / `Up` do the same by design.

## Dependencies

Lands before #914: both edit `controls.js` (this one only the car `nitro` line, `:30`). Whichever lands second rebases;
the hunks do not overlap.
