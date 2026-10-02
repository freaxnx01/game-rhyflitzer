# V hides the car's shadow too (#37) — Implementation Plan

**Goal:** Pressing **V** hides the car **and** its ground shadow (`blob`); pressing it again brings both back. The shadow still hides in water, in the air and in the eye cameras.

**Architecture:** one condition in `stepCar` gains `&& !HUD.carHidden`; the test hook `window.__mm.hud()` exposes `shadowVisible`; the existing `test_hud_bundle` smoke test asserts it. Spec: `docs/superpowers/specs/2026-10-02-car-toggle-shadow-design.md`.

**Tech Stack:** Vanilla JS + three.js in one buildless file (`prototype/index.html`); Playwright smoke tests with pytest (`prototype/tests/`).

## Global Constraints

- TDD: write the failing assertion first, watch it fail, then fix.
- Never modify an existing assertion to make it green; only add new ones. If a test still fails after 3 attempts, stop and report.
- Test command (slow, run it in the **foreground**, never in the background, with a generous timeout): `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_smoke.py -q -k hud_bundle`. If `pipeline/.venv` is missing, use any Python with `pytest` and `playwright` installed.
- Commits: Conventional Commits, scope `ui`, reference `#37`.
- Stage explicit paths only (no `git add -A`).

## Task 1 — failing test

**Files:** `prototype/index.html` (test hook only), `prototype/tests/test_smoke.py`.

1. In `prototype/index.html`, line ~856, add `shadowVisible: blob.visible` to the object returned by `window.__mm.hud`, right after `carVisible: car.visible`:

   ```js
   ... carVisible: car.visible, shadowVisible: blob.visible, blinker: HUD.blinker, ...
   ```

2. In `prototype/tests/test_smoke.py`, `test_hud_bundle` (line ~388), replace the single **V** line

   ```python
   page.keyboard.press("KeyV"); car_off = hud()["carVisible"]; page.keyboard.press("KeyV"); car_on = hud()["carVisible"]
   ```

   with (same `car_off`/`car_on` reads, plus a frame wait and the shadow read — `blob.visible` is recomputed in `stepCar`, i.e. on the next frame):

   ```python
   page.keyboard.press("KeyV"); car_off = hud()["carVisible"]; page.wait_for_timeout(200); shadow_off = hud()["shadowVisible"]
   page.keyboard.press("KeyV"); car_on = hud()["carVisible"]; page.wait_for_timeout(200); shadow_on = hud()["shadowVisible"]
   ```

   and below the existing `assert car_off is False and car_on is True` add:

   ```python
   assert shadow_off is False and shadow_on is True, (shadow_off, shadow_on)   # V hides the car's ground shadow too (#37)
   ```

3. Run the test command. Expected: **FAIL** on the new assert with `(True, True)`.

## Task 2 — fix

**Files:** `prototype/index.html`.

1. In `stepCar`, line ~899, change

   ```js
   blob.visible = wl === null && (P.y - gh2) < 6 && !CAM_VIEWS[camView].eye;
   ```

   to

   ```js
   blob.visible = wl === null && (P.y - gh2) < 6 && !CAM_VIEWS[camView].eye && !HUD.carHidden;
   ```

2. Run the test command. Expected: PASS.
3. Run the full smoke suite: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q` (foreground, several minutes). All green.

## Task 3 — changelog and commit

1. `CHANGELOG.md`, `[Unreleased]` → `### Fixed`, append one line:

   ```markdown
   - **V** now hides the car's shadow too — no more dark disc left on the road.
   ```

2. Commit `prototype/index.html prototype/tests/test_smoke.py CHANGELOG.md`:
   `fix(ui): V hides the car's shadow too (#37)` with body `Closes #37`.

## Manual check

Start the game, press **V**: car and dark disc gone. Press **V** again: both back. Drive into the Rhine or jump: the disc still disappears as before. Press **C** to an eye camera: the disc is hidden as before.
