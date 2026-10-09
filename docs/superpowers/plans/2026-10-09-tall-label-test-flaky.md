# Plan: wait for the real chase end state in `test_tall_building_label_stays_on_screen` (#143)

**Goal:** the test reads the height label only when the chase camera is really behind the car, and gets
there in a couple of frames instead of a 25–35-frame fly-in. Spec:
`docs/superpowers/specs/2026-10-09-tall-label-test-flaky-design.md`.

**Cause (measured):** `CHASE_ARRIVED` checks only the distance from the car, so the fly-in from START
satisfies it on the far side of the car (Bodenacker: frame with `d = [-4.78, 2.90, 5.04]`), where the
label is behind the camera and `__mm.debug()` reports `ny: null, clamped: false`. The fly-in itself takes
25–35 drawn frames, which exceeds 120 s at under 1 fps.

**Global constraints:** test-only change in `prototype/tests/test_debug.py`. Do not touch
`prototype/index.html` or any other app file. Do not change the two `assert` lines of the test or its
docstring's claim. No new files. CHANGELOG untouched. Run browser tests in the foreground, never in the
background, under the memory cap, with the main checkout's venv:
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest -q prototype/tests/test_debug.py -k tall_building </dev/null`
(one run takes about 4–5 min; in CI use the repo's own python). Commit and push the branch before the
verification runs.

## Task 1: heading-aware arrival + snap

**Files:** modify `prototype/tests/test_debug.py` (constants at lines 16-17, test at lines ~180-200).

**Interfaces:**
- `CHASE_ARRIVED` stays a JS predicate string (same name, same use with `page.wait_for_function`).
- New helper `snap_chase_camera(page)` returns nothing; presses and releases `B` with a wait for the
  `CAM.back` flag in between.

- [ ] Step 1: replace `CHASE_ARRIVED` (lines 16-17) with:

```python
CHASE_ARRIVED = ("() => { const c = window.__mm.cam(), d = c.d, th = window.__mm.heading(); return c.view === 0"
                 " && Math.hypot(d[0] + 6.9 * Math.cos(th), d[1] - 2.6, d[2] + 6.9 * Math.sin(th)) < 0.3; }")   # #143: at the chase target BEHIND the car, not anywhere on the 6.9 m ring
```

- [ ] Step 2: add the helper after `height_text`:

```python
def snap_chase_camera(page):
    """#143: a change of the look-back flag snaps the chase camera to its target (index.html, CAM.back),
    so hold and release B instead of waiting out the 25-35-frame fly-in from START."""
    page.keyboard.down("KeyB")
    page.wait_for_function("() => window.__mm.cam().back === true", timeout=120000)
    page.keyboard.up("KeyB")
    page.wait_for_function("() => window.__mm.cam().back === false", timeout=120000)
```

- [ ] Step 3: in `test_tall_building_label_stays_on_screen`, call it right after the `__mm.sim(...)`
  teleport and before `page.wait_for_function(CHASE_ARRIVED, timeout=120000)`:

```python
        page.evaluate(f"() => window.__mm.sim({cx}, {cz}, Math.PI, 0, 0, [])")     # heading pi = facing west, at the building
        snap_chase_camera(page)
        page.wait_for_function(CHASE_ARRIVED, timeout=120000)
```

  Everything else in the test (label waits, the two `KeyC` presses, `COCKPIT_ARRIVED`, both asserts) stays
  as is.

- [ ] Step 4: commit `test(debug): wait for the chase camera behind the car in the tall-label test (#143)`
  and push the branch.

## Task 2: verify

- [ ] Step 1: run the test (both params) 3 times in a row, foreground, capped (command above). All 3 must
  be 2/2. If a run fails, record the failing tuple and STOP after 3 attempts (do not loosen anything).
- [ ] Step 2: bite check: temporarily delete `clampDebugHeights();` from `hud()` in
  `prototype/index.html` (the call just before `setFullMap`), run once, expect both params to fail on
  `clamped`; then `git checkout prototype/index.html` and confirm `git status` shows only the test file
  changed.
- [ ] Step 3: do not run the full ~2 h browser suite; only `test_debug.py` changed.
- [ ] Step 4: open the PR with `Closes #143`; in the Testing section list the 3 runs and the bite check.
