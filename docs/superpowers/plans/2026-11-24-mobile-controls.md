# Phone controls and HUD layout (#1181) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones the touch controls sit in the bottom corners, smaller and translucent, and no longer cover the car, the road ahead or the HUD panels, in portrait and landscape.

**Architecture:** CSS under `@media (pointer:coarse)` in `index.html` (touch block ~line 323–345, phone HUD block ~148–168), a pure idle-fade helper in `touch.js`, `controls.js` moving Z/J/C from `touch: 'button'` to `touch: 'menu'`, and on phones a small digital speed plate replacing the round dial.

**Tech Stack:** buildless ES modules, `node --test`, Playwright (pytest).

**Spec:** issue #1181 (body = spec) plus the maintainer's wireframe choice of 2026-11-24 (below).

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Only phones/tablets change: every new rule sits under `@media (pointer:coarse)` (plus orientation / size queries). Desktop layout and the desktop key bar stay as they are.
- Sizes (maintainer): stick 132 → 104 px (knob scaled to match), ▲/▼ 84 → 64 px, round buttons 56 → 44 px; 44 px is the minimum touch target. Fill `rgba(20,23,29,.25)` (stick and buttons), border 4 → 2 px. `#tE` (the yellow context button) keeps its look; it must stay readable.
- Idle fade: 4 s after the last touch on `#touch` all controls go to opacity `.3` (transition .4 s); any `pointerdown` anywhere on the page brings them back to 1 at once. The fade never blocks input (pointer-events stay on).
- Z (get out / get in / leave train), J (jump to) and C (camera) leave the screen and appear as rows in the ☰ menu (`menuEntries`), in every context. Stick, ▲/▼, H, ☰ and the context button `#tE` stay.
- Wireframe (chosen by the maintainer):

```
PORTRAIT 390x844                         LANDSCAPE 844x390
+-----------------------------+          +------------------------------------------+
|[MISSION]           [ ZEIT ]|          |[MISSION]     <= 823 m      [ZEIT][map] |
|          <=  823 m  [map]  |          |[=][E]     CHECKPOINT 1          [R][II]|
|   CHECKPOINT 1      [R][II]|          |                                          |
|        (world / road)       |          |              (world/road)        (H)     |
|            [car]            |          | ( stick )      [car]  [52]   (v) (^)    |
|[E]                          |          +------------------------------------------+
|[=]                    (H)   |
| ( stick )   [52]  (v) (^)   |
+-----------------------------+
```

  - stick bottom-left, ▼ ▲ bottom-right, all 16 px + safe-area from the edges; H above ▲; ☰ and E above the stick (portrait) or top-left under the mission plate (landscape, where the height is short);
  - on phones the round speedometer `#speedo` is hidden and a small digital plate `[52 km/h]` (new element, same value the dial shows, same plate style as the HUD) sits at the bottom centre between the thumbs;
  - the minimap `#br` shrinks to about 140×70 and sits top right under `#tr` (portrait) or beside it (landscape); tapping it still opens the full map (`#br.full`), and its bar text may be shortened or hidden at that size;
  - `#pausebtn` / `#radiobtn` stay top right, moved only as far as the map needs.
- Test viewports: portrait 390×844 and 360×640, landscape 844×390 and 640×360.
- German UI text: real umlauts, capitalised Du/Dir. CHANGELOG entry (German, for players, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`).
- Browser tests run only the affected files (`tests/test_touch_controls.py`, `tests/test_phone_hud.py`, plus any file a change breaks), foreground, under `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0`. Node: `node --test tests/*.test.mjs`.
- Updating an existing test is allowed only where this spec changes the behaviour it pins (Z/J/C buttons gone, new positions); say so in the commit body.

## Review Focus

1. Landscape 640×360: nothing overlaps (controls vs. controls, controls vs. `#tl`, `#tr`, `#tc`, `#br`, `#pausebtn`, `#radiobtn`, the speed plate) and nothing leaves the viewport.
2. The centre of the screen stays free: no control or HUD panel intersects the box from 25 % to 75 % width and 35 % to 70 % height (portrait) / 30 %–70 % width, 30 %–75 % height (landscape).
3. A faded control still reacts to the first tap (gas works while faded).
4. On foot, in the heli and in the loco, Z/J/C are reachable through ☰ and the context-specific visibility rules still hold.
5. Desktop (fine pointer, 1280×720) is unchanged: `#speedo` visible, keybar visible, `#touch` hidden.

---

### Task 1: Smaller, translucent controls with idle fade

**Files:** `touch.js`, `index.html` (touch CSS, wiring), tests `tests/touch.test.mjs`, `tests/test_touch_controls.py`, `CHANGELOG.md`

**Interfaces:** `touch.js` exports `TOUCH_FADE = { idleMs: 4000, opacity: 0.3 }` and pure `touchFaded(lastTouchMs, nowMs, cfg = TOUCH_FADE) -> boolean`. `index.html` sets/clears `#touch.faded` from it (in an existing per-frame or interval tick), `pointerdown` on `document` records the time.

- [ ] Node tests: `touchFaded` false before 4000 ms, true at/after, false right after a new touch.
- [ ] Browser test (portrait 390×844): stick box ≈104 px, `#tG` ≈64 px, round buttons ≥44 px; computed background alpha ≤ .3; after waiting 4.5 s `#touch` has class `faded` and a computed opacity ≈ .3, a tap on `#tG` removes it and the car accelerates.
- [ ] Implement, run, commit `feat(touch): smaller, translucent phone controls that fade when idle (#1181)`.

### Task 2: Z, J and C move into the ☰ menu

**Files:** `controls.js`, `index.html` (`#tZ`, `#tJ`, `#tC` markup, CSS and the click wiring ~line 4764), tests `tests/controls.test.mjs` (or the file that tests `menuEntries`), `tests/test_touch_controls.py`

- [ ] Node tests: `menuEntries('car')` contains `KeyZ`, `KeyJ`, `KeyC`; foot contains `KeyZ` (get in) and `KeyJ`; heli/train contain `KeyZ`. The desktop key bar entries (`core`) are unchanged.
- [ ] Browser: `#tZ/#tJ/#tC` are gone; `test_z_button_gets_out_and_the_controls_switch_to_foot` becomes "Z from the menu gets out …" (open ☰, tap `data-cmd=KeyZ`); `test_menu_lists_the_rest_and_runs_a_row` expected count follows `menuEntries`.
- [ ] Implement, run, commit `feat(touch): get out, jump and camera live in the phone menu (#1181)`.

### Task 3: Bottom-corner layout, digital speed plate, small minimap, landscape

**Files:** `index.html` (CSS, the speed plate element and its update next to the dial's), tests `tests/test_touch_controls.py`, `tests/test_phone_hud.py`, `CHANGELOG.md`

- [ ] Browser tests, parametrised over the four viewports, time trial running (as `test_time_trial_phone_hud_nothing_overlaps` does): all shown controls + `#tl`, `#tr`, `#tc` arrow/distance, `#br`, `#pausebtn`, `#radiobtn`, the speed plate are inside the viewport and pairwise non-overlapping; the centre box of Review Focus 2 is free; stick and ▲ are within 24 px + safe area of the bottom edge; the speed plate shows the same number as the dial's text; `#speedo` hidden; tapping `#br` still opens the full map.
- [ ] Desktop test (1280×720, fine pointer): `#speedo` visible, speed plate hidden, `#touch` hidden.
- [ ] Implement, run `test_touch_controls.py` and `test_phone_hud.py` complete, fix any other phone test the move breaks (`test_hud_fade.py`, the hint card / debug panel positions that reference the old 200 px band).
- [ ] Before/after screenshots for the PR via the GPU browser (`PW_CDP_ENDPOINT`, see `tests/gpu_browser.py`) — controller step, not the implementer's.
- [ ] CHANGELOG entry (German), commit `feat(touch): phone controls in the corners, digital speed and a small map (#1181)`.
