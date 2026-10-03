# #88 - test_toggle_switches_live_and_persists flaky: design

## Cause (reproduced)

Runs on 2026-10-03, foreground, `systemd-run ... MemoryMax=2G`, SwiftShader:

- isolated: 1 pass / 2 fail (three runs)
- full `prototype/tests/test_i18n.py`: 1 run, 1 failed / 9 passed (6:54)

Every failure is the same line, not the `#best` wait the issue suspected:

```
prototype/tests/test_i18n.py:108  page.reload(); page.wait_for_function(READY, timeout=240000)
playwright TimeoutError: Page.reload: Timeout 30000ms exceeded.  waiting for navigation until "load"
```

`page.reload()` carries Playwright's default 30 s navigation timeout. Under SwiftShader the game's `load`
event (three.js scene build and textures; the server log shows ~24 s between `GET /prototype/index.html` and the
following requests) lands at about 25-35 s, so it flips between pass and fail with machine load. The `READY`
wait right after it already has 240 s, so the test was only half-protected. `open_page`'s `page.goto(...)` has
the same default 30 s and is the same latent risk (it has not failed yet).

Ruled out from the code: each test launches its own browser and context (`open_page`), so `gg-lang` in
`localStorage` is not shared between tests; the toggle blur is covered by `test_enter_after_toggle_keeps_language`;
`gg-langchange` runs `rerenderAll` synchronously (`prototype/index.html:1163`). Remaining softness, not
observed failing: the `#best` wait depends on the render loop (`hud()`, `prototype/index.html:1218`), which
`rerenderAll` does not update, so it waits on a frame, not on the re-render. It has 120 s and did not fail.

## Fix

Test-only, no assertion changes:

1. `page.reload(timeout=240000)` (same budget as the READY wait that follows it).
2. `page.goto(..., timeout=240000)` in `open_page`.

Out of scope (park): replacing the `#best` frame wait by a condition on the re-rendered DOM.

## Acceptance

- The test passes in isolation and in the full file on three consecutive runs each.
- No assertion removed or loosened.
