# Maps link button test: frame-free click (#174) — implementation plan

**Goal:** make `test_map_links_open_the_cars_spot_in_a_new_tab` pass under load without loosening it. Test-only change, one file: `prototype/tests/test_debug.py`.

**Spec:** `docs/superpowers/specs/2026-10-10-debug-maps-button-clickable-design.md` (root cause: the click's "stable" check needs animation frames, the real-world scene draws under 1 frame per several seconds).

## Global constraints

- Do **not** edit `prototype/index.html` or any other file.
- Never raise a timeout, never `force=True`, never delete or weaken an assertion.
- Playwright runs in the **foreground** (never `run_in_background`), under a cap, output to a file:
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -k "<expr>" -q > /tmp/out.txt 2>&1` (give the call a timeout of 600000 ms; the file is the output). If `pipeline/.venv` is missing in your checkout use the one of the main checkout (`/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python`) with `cd <your checkout>`.
- Commit message `fix(debug): click the Maps link buttons without waiting for animation frames (#174)`; PR body `Closes #174`.

### Task 1: Add `click_now` and use it in the map-links test

**Files:** Modify `prototype/tests/test_debug.py` only.

- [ ] **Step 1: Add the helper.** Find the line `SPY_OPEN = ("() => { window.__opened = [];` (about line 351). Insert directly **above** it:

```python
CLICK_NOW = """(sel) => {
  const el = document.querySelector(sel);
  if (!el || el.hidden || el.disabled) return 'missing-or-disabled';
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return 'outside-viewport';
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (hit !== el) return 'covered-by:' + (hit && (hit.id || hit.tagName));
  el.focus(); el.click(); return 'ok';
}"""


def click_now(page, selector):
    """#174: Playwright's click waits two animation frames ("stable"), and the real-world scene draws under one frame per
    several seconds on SwiftShader, so it timed out. Same checks in one evaluate (exists, enabled, in the viewport, not covered), no frames."""
    got = page.evaluate(CLICK_NOW, selector)
    assert got == "ok", (selector, got)
```

- [ ] **Step 2: Use it.** In `test_map_links_open_the_cars_spot_in_a_new_tab` make exactly these two replacements:

Before: `        page.click("#startbtn", timeout=180000)                              # the start overlay would swallow the clicks`
After:  `        click_now(page, "#startbtn")                                         # the start overlay would swallow the clicks`

Before: `            page.click(f'#debuglinks button[data-map="{kind}"]')`
After:  `            click_now(page, f'#debuglinks button[data-map="{kind}"]')`

Do not touch anything else in the test. Note: `click_now` is defined above the test, so no import changes.

- [ ] **Step 3: Run the test twice** (command in Global constraints, `-k test_map_links_open_the_cars_spot_in_a_new_tab`). Expected: `1 passed` both times. If it fails with `covered-by:...` or `outside-viewport`, that is a real layout bug: stop and report the string, do not work around it.

### Task 2: Regression run and commit

- [ ] **Step 1:** run the whole `test_debug.py` once, without `-k`. Expected: everything that passed on `main` still passes (the `needs_world` tests need `data/world_hochrhein.json`, which is on main).
- [ ] **Step 2:** `git add prototype/tests/test_debug.py && git commit` with the message above, push the branch, open the PR (`Closes #174`).
