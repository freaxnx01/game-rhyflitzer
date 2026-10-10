# Maps link button in the F3 panel never clickable (#174) — design

## Root cause (reproduced 2026-10-10)

The button is **not** covered, off screen or disabled. Measured on `main` (4587571) at 960x540 with the Hochrhein world, car placed at Bodenacker 6, legend closed:

- `#debug` rect 16,157 - 403,308; `#debuglinks` 28,278 - 365,300; the Maps button 71,278 - 117,300: inside the viewport.
- `document.elementFromPoint(centre of the Maps button)` is the `BUTTON` itself. `#debuglegend` is hidden, `#toast` sits at 416,230 (right of the panel).
- At low box load `page.click` works (about 28 s for one click, one run).

The failing run (`1 failed in 97 s`) stops in `page.click('#debuglinks button[data-map="osm"]')` with the Playwright log `waiting for element to be visible, enabled and stable` until the 30 s default timeout. "Stable" needs two consecutive animation frames, and the real-world scene under SwiftShader draws **under one frame per several seconds** after `__mm.place`: a probe counted **0 `requestAnimationFrame` callbacks in 8 s** at box load 13-16. Three clicks need roughly 3 x (stable + hit-target) frames, so they run out of the 30 s default. The test is **frame-bound**, not broken in layout. The first attempt of the run failed the same way earlier, at `page.click("#startbtn", timeout=180000)` (`waiting for locator`, 180 s): that is the already known #187 symptom, same class.

No production code is wrong, so no `index.html` change.

## Design

Test-only fix in `prototype/tests/test_debug.py`: a helper `click_now(page, selector)` that reaches the click in **one `page.evaluate`**, with no animation frame, and keeps every check the Playwright actionability check would make:

1. the element exists, is not `hidden`, not `disabled`;
2. its rect is non-empty and **inside the viewport**;
3. `document.elementFromPoint(centre)` **is the element itself** (nothing covers it);
4. then `el.focus(); el.click()` (focus first, so the existing `in_row` assertion, "focus left the button after the click", still means something: the page handler calls `b.blur()`).

The helper replaces the five `page.click` calls that run while the world scene is heavy: `#startbtn` and the three map buttons of `test_map_links_open_the_cars_spot_in_a_new_tab`. The assertions of the test stay exactly as they are.

## Acceptance Criteria

- [ ] `test_debug.py::test_map_links_open_the_cars_spot_in_a_new_tab` passes, run twice in a row, also while another Playwright run loads the box.
- [ ] No assertion in the test is removed or loosened; `click_now` fails with a message naming the cause (`covered-by:<id>`, `outside-viewport`, `missing-or-disabled`) instead of a timeout.
- [ ] No change to `prototype/index.html`.
- [ ] The other tests of `test_debug.py` that were green stay green (run the file once, see plan Task 2).

## Assumptions

- **A1** [high] Test-only fix. Rejected: shrinking the viewport to 480x270 (the toast tests do) because the issue asks for 960x540; rejected `force=True` (it skips the hit-target check, a loosening). Evidence: probe above, 0 frames in 8 s, hit-test returns the button.
- **A2** [high] The `#startbtn` click is swapped too. Rejected: leaving it to #187. It is the same frame starvation and the test dies there in some runs (`test_debug.py:361`). #187 keeps its own scope (the `wait_for_function` before the click).
- **A3** [med] The phone viewport is not added to this test (real-world scene on SwiftShader at phone size is slower still). Phone geometry of the panel is covered by `test_panel_with_the_legend_open_stays_on_screen[phone]`.

## Consequences

- A button that is genuinely covered by the legend or `#game-nav` still fails the test, now at once and with a readable message.
- `el.click()` is a synthetic (untrusted) click; the page handlers do not look at `isTrusted`.
