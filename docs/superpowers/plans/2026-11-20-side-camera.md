# Side camera (#1106) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth camera view in the C cycle that looks at the vehicle from its left, diagonally above and a little behind.

**Architecture:** Two pure functions in `camera.js` compute the offsets (derived from the vehicle's chase numbers or an
optional `camera.side` override, shifted back for a trailer) and the eye/look points; `index.html` `stepCamera` eases the
camera to them in a new `side` branch. Strings de/en, key bar, help, CHANGELOG.

**Tech Stack:** vanilla JS ES modules, three.js r170 (index.html only), `node --test`, Python Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-side-camera-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- View order: chase · near · cockpit · bumper · drone · side; the drone stays index 4, side is index 5, `nameKey: 'camSide'`, `k: 'side'`.
- Derived numbers when `VEH.camera.side` is absent: `dist = chase.dist`, `h = chase.h * 1.6`, `back = chase.dist * 0.3`.
- Trailer (`VEH.trailer = { hitch, length, … }`, #1103): `aimBack = (hitch + length) / 2`, added to `back`; no trailer → `aimBack = 0`.
- Look point 1.2 m above the vehicle origin, `aimBack` m behind it. Left = s 1, right (B held) = s −1.
- Ease rate 6/s like the chase cam; snap on B change and on entering the view; y ≥ ground + 1 m; `underCeiling` applied.
- No obstacle pull-in, no sway, no speed-dependent distance (spec non-goals).
- Texts: en `camSide: 'Side'`, de `camSide: 'Seite'`; `keyCamera` en `camera: chase · near · cockpit · bumper · drone · side`,
  de `Kamera: Verfolger · nah · Cockpit · Stossstange · Drohne · Seite` (strings.js and the static `index.html` key-bar span).
- Run only targeted tests: `node --test tests/*.test.mjs` and the named Playwright files, never the whole Playwright suite.
  Playwright: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest <file> -q`, foreground.
- Commits end their subject with `(#1106)`; CHANGELOG under `[Unreleased]` → `### Added`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, bold 1–3 keywords, keys in `<kbd>`.
- Match the dense one-line style and `// #1106:` comments of `index.html` and the header-comment style of `camera.js`.

## Review Focus

- Switching vehicles while in the side view (Choose car, depot swap): the next frame must use the new vehicle's numbers, not cached ones — Task 2 test.
- B pressed and released in the side view: the camera jumps sides at once (snap), never swings through the car — Task 2 test.
- Heading near ±π (the spawn heads π): left/right must not flip — Task 1 test at th = π.
- A vehicle without `trailer` and one with it — Task 1 tests both.
- Entering the side view from the drone: snap, so the camera does not drift for seconds from the drone's 18 m height — Task 2 asserts arrival.

---

### Task 1: the side offsets and target (pure)

**Files:** Modify `camera.js`, `tests/camera.test.mjs`

**Interfaces:**
- Produces: `export const SIDE = { hFactor: 1.6, backFactor: 0.3, aimUp: 1.2, rate: 6, minClear: 1 }`;
  `export function sideOffsets(camera, trailer)` → `{ dist, h, back, aimBack }` (`camera` = a vehicle's `camera` block,
  `trailer` = `VEH.trailer` or undefined; `camera.side` when present supplies `dist`, `h`, `back` as is);
  `export function sideTarget(pose, off, s)` → `{ eye: [x, y, z], at: [x, y, z] }`, `pose = { x, y, z, th }`, forward
  `(cos th, sin th)`, right `(-sin th, cos th)`; eye = origin − forward·(back + aimBack) − right·dist·s, y + h;
  at = origin − forward·aimBack, y + aimUp.

- [ ] Step 1: tests — `sideOffsets derives from the chase numbers` (chase 6.9 / 2.6 → dist 6.9, h 4.16, back 2.07, aimBack 0, ±1e-9);
  `a camera.side override wins` ({side:{dist:9,h:5,back:1}} → 9/5/1); `a trailer moves the view back` (chase 20/6.5,
  trailer {hitch 5.2, length 3.85} → aimBack 4.525, back 6); `sideTarget sits on the left at th 0` (pose 0,0,0,0, off
  {dist 5,h 3,back 2,aimBack 0}, s 1 → eye [-2, 3, -5], at [0, 1.2, 0]); `s = -1 mirrors to the right` (eye z +5);
  `at th = π the left is +z` (eye ≈ [2, 3, 5]); `the trailer shifts eye and look back` (aimBack 4 → at x −4, eye x −6).
- [ ] Step 2: `node --test tests/camera.test.mjs` → FAIL (exports missing).
- [ ] Step 3: implement in `camera.js` with a `// #1106:` header comment.
- [ ] Step 4: `node --test tests/*.test.mjs` → all pass.
- [ ] Step 5: commit `feat(camera): side camera offsets and target (#1106)`.

### Task 2: the view in the game

**Files:** Modify `index.html` (`CAM_VIEWS`, the view comment, `stepCamera` side branch, key-bar span), `strings.js`
(en + de `camSide`, `keyCamera`), `CHANGELOG.md`; Create `tests/test_sidecam.py` (copy the harness of `tests/test_drone.py`:
`open_hand`, `wait_frames`, the AHEAD/SIDE projections).

**Interfaces:**
- Consumes: `SIDE`, `sideOffsets`, `sideTarget` (Task 1). `window.__mm.cam()` → `{ view, d, back, look }` already exists.
- In `stepCamera`: compute `sideOffsets(VEH.camera, VEH.trailer)` every frame (no caching), target from `sideTarget(P-pose, off, s)`;
  snap when `snap` is set or when the previous frame's view was not side (track it on `CAM`); clamp y to
  `groundH(x, z, …) + SIDE.minClear` and apply `underCeiling`; `car.visible` as for the outside views.

- [ ] Step 1: `tests/test_sidecam.py` — SIDE = 5; `test_side_is_the_sixth_view_and_arrives_left_above_behind` (5× C →
  `camView === 5`; poll arrival: SIDE projection < −(6.9 − 1.5), height ≈ 4.16 ± 1, AHEAD < 0; car visible);
  `test_hold_b_mirrors_to_the_right` (B down → SIDE > 5.4 within the poll, B up → back < −5.4);
  `test_c_from_side_wraps_to_chase` (6th C → `camView === 0`); `test_switching_vehicle_uses_its_numbers` (in the side view
  pick the tanker via `__mm` as `tests/test_tanker.py` does → SIDE < −18.5);
  `test_help_lists_the_side_view` parametrized de-CH "Drohne · Seite" / en-US "drone · side".
- [ ] Step 2: run it → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: `node --test tests/*.test.mjs`; `tests/test_sidecam.py`, `tests/test_drone.py` → pass; a screenshot of the side view
  with the tanker in a curve into your own `mktemp -d` dir, path in the report.
- [ ] Step 5: CHANGELOG `### Added` (e.g. "<kbd>C</kbd> now also cycles to a **side view** from the left, diagonally above …");
  commit `feat(camera): a side view from the left, diagonally above (#1106)`.
