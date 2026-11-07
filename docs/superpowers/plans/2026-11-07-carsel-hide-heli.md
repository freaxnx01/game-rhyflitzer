# Car selection hides the helicopter (#693) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening Change vehicle while flying shows the car on the turntable, not the helicopter. The heli is back as soon as the swap ends.

**Architecture:** There are two one-statement edits in `index.html`:
- `stepTurntable` hides the heli.
- `leaveVehicleSwap`, the common exit of Drive on and Back, restores `heli.visible = FLY.on`.

**Tech Stack:** Buildless vanilla JS (`index.html`) with three.js; the tests are pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-carsel-hide-heli-design.md`

## Global Constraints

- No new files, no new dependencies, no build step.
- Run only `tests/test_carselect.py` (targeted). Never run the full Playwright suite. Run it in the foreground, never in the background.
- The CHANGELOG entry is hand-written and player-facing, under `## [Unreleased]` → `### Fixed`. Never run `git cliff -o`.

## Review Focus

- **Back, not just Drive on:** after Esc the pause stays open and `stepCamera` does not run, so the heli must be visible again right away (the test asserts this before closing the pause).
- **Not flying:** in an ordinary swap on the ground, `heli.visible` must stay `false` after the swap. `FLY.on` is `false` there, so `leaveVehicleSwap` sets `false`. The existing swap tests must stay green.
- **Still flying after the swap:** `fly().on` must still be `true`. The swap changes only the ground car.

---

### Task 1: Hide the heli on the turntable, restore it on leaving the swap

**Files:**
- Modify: `index.html:4780` (`stepTurntable`)
- Modify: `index.html:5043` (`leaveVehicleSwap`)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Fixed`)
- Test: `tests/test_carselect.py` (append after `test_cancelled_swap_restores_the_chair`)

**Interfaces:**
- Consumes these existing hooks:
  - `window.__mm.fly()` → `{ on, heliVisible, carVisible, … }` (`index.html:4480`)
  - `window.__mm.carsel()` → `{ open, carVisible, … }` (`index.html:5084`)
  - `window.__mm.pause()` → `{ on, … }`
- Consumes these test helpers in `tests/test_carselect.py`: `open_page`, `open_swap`, `wait_frames`, `CLICK`, `T`.
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_carselect.py`:

```python
def test_vehicle_change_while_flying_shows_the_car_not_the_heli(server):
    """#693: in flight, Change vehicle must show the car on the turntable; the heli is hidden while it is open
    and visible again after Back (pause still open) and after Drive on (still flying)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=T)
        page.keyboard.press("KeyF")
        page.wait_for_function("() => window.__mm.fly().on && window.__mm.fly().heliVisible", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        open_swap(page)
        wait_frames(page)
        open_state = page.evaluate("() => ({ heli: window.__mm.fly().heliVisible, car: window.__mm.carsel().carVisible })")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.carsel().open && window.__mm.pause().on", timeout=T)
        back_state = page.evaluate("() => ({ heli: window.__mm.fly().heliVisible, flying: window.__mm.fly().on })")
        open_swap(page)
        page.evaluate(CLICK, "#csrace")
        page.wait_for_function("() => !window.__mm.carsel().open && !window.__mm.pause().on", timeout=T)
        wait_frames(page)
        drive_state = page.evaluate("() => ({ heli: window.__mm.fly().heliVisible, flying: window.__mm.fly().on })")
        b.close()
    assert open_state == {"heli": False, "car": True}
    assert back_state == {"heli": True, "flying": True}
    assert drive_state == {"heli": True, "flying": True}
    assert errors == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m pytest tests/test_carselect.py -k flying -v` (foreground, generous timeout)
Expected: FAIL on `assert open_state == {"heli": False, "car": True}`, with `heli` being `True`.

- [ ] **Step 3: Write the minimal implementation**

In `index.html:4780` (`stepTurntable`), replace

```js
car.visible = true; camPos.set(
```

with

```js
car.visible = true; heli.visible = false; camPos.set(
```

In `index.html:5043`, replace

```js
function leaveVehicleSwap() { CARSEL.swap = null; CARSEL.on = false; CARSEL.dir = 0; $('carsel').hidden = true; }
```

with

```js
function leaveVehicleSwap() { CARSEL.swap = null; CARSEL.on = false; CARSEL.dir = 0; $('carsel').hidden = true; heli.visible = FLY.on; }   // #693: the turntable hid the heli; a paused loop skips stepCamera, so restore it here (Back keeps the pause open)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_carselect.py -v` (the whole file, foreground)
Expected: all PASS, including the new test and the existing swap tests (`test_changing_the_vehicle_mid_race_keeps_the_run_and_flags_it`, `test_back_in_a_vehicle_change_restores_the_choice_and_flags_nothing`, `test_closing_the_pause_during_a_vehicle_change_cancels_it`, `test_cancelled_swap_restores_the_chair`).

- [ ] **Step 5: Add the CHANGELOG entry**

Under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md` (create the `### Fixed` heading after `### Added` if it is missing), add, with the current time:

```markdown
- `YYYY-MM-DD HH:MM` **Change vehicle while flying** now shows your **car** on the turntable instead of the helicopter. You are still in the air afterwards, and the helicopter is back as soon as you drive on or go back.
```

- [ ] **Step 6: Commit and push**

```bash
git add index.html tests/test_carselect.py CHANGELOG.md
git commit -m "fix(carsel): hide the helicopter on the turntable while flying

Closes #693"
git push
```
