# Hop prompt clears the get-out toast (#783)

Follow-up from the review of PR#779 (#701). Quick-mode spec, no clarifying questions asked.

## Problem

`stepEnter()` in `index.html` returns early from the deck-hop branch (`const hop = platHop(); if (hop) { ...; return; }`) before the guard that clears the "footOut" toast (`if (HUD.enter && !HUD.enterShown && $('toast').textContent === tr('footOut')) { ... }`, #445). Getting out of the car at the Plattform door therefore shows the hop prompt on top of the still-visible toast.

## Design

One shared condition, no copied guard. Move the toast guard **above** the hop branch and widen its trigger from `HUD.enter` to `HUD.enter || hop`:

- `hop` is computed once, before the guard.
- The guard keeps its `!HUD.enterShown` edge-trigger, so the toast is cleared once when a prompt first appears, and a later `footOut` toast is not eaten while the prompt stays up (same behaviour as the plain enter prompt).
- The hop branch keeps winning over the plain "Enter" prompt, unchanged.

The Ferris-wheel branch above (`ra.do`) is out of scope (it has its own early return, not reported).

## Tests

- New Playwright test in `tests/test_plattform_stair.py`: arrive by car, `Z` gets out near the door, wait for `platHop() === 'up'`, assert `#prompt` shows the hop prompt and `#toast` is not `.show` (and its text is not the footOut text).
- The hover test currently only asserts `platHop()` is null while hovering. Extend it: with hover on at the door, `platHop()` is null; then toggle hover off (`F`) and walk the stair with `footSim`, asserting `y` rises above `base`.

## Assumptions

- **A1** [high] One shared guard, moved above the hop branch, instead of duplicating it inside the hop branch. Rejected: copying the guard into the hop branch. The issue asks for one shared path; `index.html:4407-4408` shows the guard is a single line keyed on `HUD.enter`.
- **A2** [high] The guard keeps `!HUD.enterShown`. Rejected: clearing every frame. `index.html:4408` (#445) is edge-triggered so later toasts survive; the hop branch sets `HUD.enterShown = true` (`index.html:4407`), so the guard must run before it.
- **A3** [med] The test reads the real DOM (`#prompt`, `#toast`) after a real `Z` get-out, not a hook. Rejected: a new `__mm` hook. `index.html:4480` shows `getOut()` calls `toast(tr('footOut'))`, so the real path is reachable; `window.__mm.keybar()` (`index.html:4388`) is the only existing hook near it.
- **A4** [low] Walking the stair from the door with `W` while not hovering raises `y`. Rejected: only renaming the test. `tests/test_plattform_stair.py:53` places the walker at `polar(0, 2.0)` facing the tower, but the repo gives no signal that `W` from there reaches the first tread (the existing stair test starts on `upper:15`). If it does not, rename the test to what it checks (the AC allows it).
- **A5** [high] Ferris-wheel early return left alone. Rejected: widening scope; not in the issue.

## Consequences

- Behaviour: a `footOut` toast is also cleared when the hop prompt appears while the player is within reach of the door on exit; it was previously only cleared for the plain enter prompt.
- #776 and #777 also edit `index.html`; the change is two adjacent lines in `stepEnter()`, so conflicts should be trivial.
