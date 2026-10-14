# Editor: "Connection lost" hides again when polling recovers (#320) — design

## Problem

While a world is queued or building, `poll()` in `editor/editor.js` shows `#lost` ("Connection lost, retrying…") after three failed polls (`show('lost', S.misses >= 3)`, line 171). A later successful poll resets `S.misses` (lines 154 and 167) but nothing hides `#lost`; only `backToEdit()` (line 198) does. The sentence stays on screen while the build carries on.

## Design

In `poll()`, on a successful answer (after `parseJob` and the stale-generation check, next to `S.misses = 0`), call `show('lost', false)`. One line, in the one place that already knows the connection is back.

```js
S.misses = 0; show('lost', false); applyJob(job, t0);
```

No new state, no change to `render()`, `applyJob()` or `backToEdit()`.

## Out of scope

- The 404 and `JobFormatError` paths: both end polling through `fail()`, which leaves the progress view, so a stale `#lost` is not visible there.
- Changing the three-miss threshold.

## Acceptance criteria

- After `#lost` has been shown, the first successful poll that returns a queued or building job hides it.
- `#lost` still appears only after the third consecutive miss, and `backToEdit()` still hides it.
- The build keeps polling and finishes normally after recovery.

## Assumptions

- **A1** [high] Hide in `poll()`, not in `render()`. Rejected: hiding in `renderProgress()`; `#lost` is toggled imperatively via `show()` (`editor/editor.js:171`, `:198`), and `render()` does not own it.
- **A2** [high] Test with the existing Playwright stub `Api`, whose `script` serves answers in order (`prototype/tests/test_editor.py:54-67`), as `test_connection_lost_appears_after_three_misses_not_two` (`:429`) already does. Rejected: a node test; the logic sits inside DOM-bound `poll()`, there is no pure function to test.
- **A3** [med] Failure/404/malformed paths need no extra hide, since `fail()` switches away from the progress view. Not verified in a browser (no dry runs).

## Consequences

- None visible beyond the fix; the sentence can now flicker on and off if the connection flaps (three misses show, one hit hides), which is the intended behaviour.
