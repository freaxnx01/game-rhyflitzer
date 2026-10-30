# Little Classic (Mr. Bean's Mini look-alike) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth selectable car, `mini` ("Little Classic"), a primitives-built look-alike of Mr. Bean's 1976 Mini, with an optional empty armchair on the roof that lifts the cockpit view and sways it gently.

**Architecture:** Pure data and maths go in a new `prototype/mini.js` (profiles, chair dimensions, sway step), unit-tested in node, like `prototype/delorean.js`. `prototype/index.html` gets the `VEHICLES.mini` entry, a `buildMini` builder registered in `MODELS`, the chair toggle glue, and the cockpit-eye/sway hook. The chair flag lives in the vehicle choice (`prototype/carselect.js`, `mm.car`).

**Tech Stack:** three.js, vanilla ES modules, buildless; `node --test` for pure modules, Playwright (Python) for targeted browser checks.

**Spec:** `docs/superpowers/specs/2026-10-24-mini-classic-design.md` — read it first; its Decisions table is binding.

## Global Constraints

- No visible "Mr. Bean", "Mini", "Austin", "BMW" name, logo, badge or lettering anywhere in the game; plate text exactly `AG · 1976`.
- In-game strings: `veh_mini_name` en `Little Classic`, de `Kleiner Klassiker`; every new string in both `en` and `de` in `prototype/strings.js`.
- `VEHICLES.mini.drive` = `{ top: 54, topNitro: 85, accel: 17, accelNitro: 34, brake: 24, reverse: 8, reverseMax: 12, grip: 10, gripHandbrake: 1.8, steerRate: 3.0, airSteer: 0.4 }`, `mass: 0.75`, `scale: 1.0`, `paint: false`, `wheels: [[1.02, 0.62], [-1.02, 0.62]]`, `wheelR: 0.26`, `collision: { shape: 'circle', r: 1.0 }`.
- Compact, DeLorean and hatchback must not change: no edits to their entries, their existing tests stay green unedited.
- No new dependency, no build step, no `package.json`.
- Browser tests: run only the targeted files named per task (`test_vehicles.py`, `test_carselect.py`, `test_lights.py`), never the full suite; run them in the foreground; commit and push before running them.

## Review Focus

- **Old stored choice:** an `mm.car` written before this change (`{"id":"compact","paint":"navy"}`) must load as chair off with no error — pinned in Task 3 (`parseChoice` test).
- **Chair flag on a car without the option:** `{"id":"delorean","chair":true}` must not put a chair on the DeLorean or move its cockpit eye — pinned in Task 3 (Playwright).
- **Switching away and back:** mini + chair on → compact → mini keeps the chair on; the compact shows no chair — pinned in Task 3 (Playwright).
- **Cancelled vehicle swap (#189):** opening *Change vehicle*, toggling the chair, then Esc restores the previous chair state — pinned in Task 3 (Playwright).
- **Sway at rest:** standing still with the wheels straight gives exactly zero roll and pitch, so the cockpit picture does not drift on the start screen — pinned in Task 1 (`stepSway` test).

---

### Task 1: Pure Mini data and sway (`mini.js`)

**Files:**
- Create: `prototype/mini.js`
- Test: `prototype/tests/mini.test.mjs`

**Interfaces:**
- Produces:
  - `MINI_BODY: [x, y][]` — side profile in model metres (x forward, y up), closed polygon, extruded along z by the builder. Length 2.95 m between the extremes (3.05 m with a 0.05 bevel), roof at 1.30 (1.35 with bevel), lowest point ≥ 0.18.
  - `MINI_GLASS: [x, y][]` — cabin glass profile, inside the body in x, under the roof, above the belt line (y > 0.85).
  - `profileSize(pts) -> { minX, maxX, minY, maxY }` — same contract as `delorean.js`'s (import it from `./delorean.js` rather than duplicating).
  - `CHAIR: { seatY: number, seat: [l, h, w], back: [t, h, w], arm: [l, h, t], eye: [x, y, z] }` — chair box sizes in model metres, seat top at `seatY` above the roof (roof = 1.35), `eye` the cockpit eye in the chair (y in 2.4–2.5, x ≈ -0.2, z = 0); the arm tops and the back's front face must lie below / behind the eye.
  - `SWAY: { roll: number, pitch: number, rate: number }` — max roll ≤ 0.07 rad, max pitch ≤ 0.035 rad, smoothing rate in 1/s.
  - `stepSway(sway: {roll, pitch}, input: {steer: number, speed: number}, dt: number) -> {roll, pitch}` — `steer` is the front-wheel yaw in rad (`WHEEL_STATE.yaw`), `speed` in m/s ≥ 0. Target roll ∝ steer × speed factor (saturating, `Math.tanh`-style), target pitch from speed; approaches the target frame-rate independently (`1 - Math.exp(-rate * dt)`), never overshoots, no randomness.

- [ ] **Step 1: Write the failing tests** in `prototype/tests/mini.test.mjs`:
  - `body profile: 2.95 m long and 1.30 m to the roof (3.05 x 1.35 with the bevel)` — `profileSize(MINI_BODY)`: `maxX - minX` ≈ 2.95 (± 0.05), `maxY` ≈ 1.30 (± 0.05), `minY >= 0.18`.
  - `glass profile: inside the body, under the roof, above the belt line`.
  - `chair: eye sits above the arms and in front of the back, seat on the roof` — `CHAIR.eye[1]` in [2.4, 2.5]; eye y > `1.35 + CHAIR.seatY + CHAIR.arm[1]`; eye x > the back's front face x.
  - `stepSway: zero at rest` — `stepSway({roll:0,pitch:0}, {steer:0, speed:0}, 1/60)` deep-equals `{ roll: 0, pitch: 0 }`, also after 600 steps.
  - `stepSway: bounded and mirror-symmetric` — for steer ±0.5, speed 50, 600 steps of 1/60: `|roll| <= SWAY.roll`, `|pitch| <= SWAY.pitch`, roll(+0.5) === -roll(-0.5), pitch equal.
  - `stepSway: same real time gives the same sway at 30 and 60 fps` — 60 steps of 1/60 vs 30 of 1/30, within 1e-3.

- [ ] **Step 2: Run** `node --test prototype/tests/mini.test.mjs` — expected FAIL (module not found).

- [ ] **Step 3: Implement** `prototype/mini.js` with the exports above; header comment in the style of `delorean.js` (look-alike, no logo, pure, unit-tested).

- [ ] **Step 4: Run** `node --test prototype/tests/mini.test.mjs` — expected PASS; then `node --test prototype/tests/*.test.mjs` — all PASS.

- [ ] **Step 5: Commit** `feat(vehicles): Mini look-alike profiles and chair sway (pure)`.

---

### Task 2: `VEHICLES.mini`, `buildMini`, strings, lamps, sound

**Files:**
- Modify: `prototype/index.html` — `VEHICLES` (~L2193, new entry after `hatchback`), new `buildMini(g, v)` next to `buildDelorean` (~L2292), `MODELS` (~L2316), `applyLamps` (~L4037) and the `delLamps` hoist (~L2224)
- Modify: `prototype/strings.js` — `veh_mini_name/_class/_desc` in en (~L296) and de (~L632)
- Modify: `prototype/tests/test_vehicles.py` (new tests at the end)
- Modify: `CHANGELOG.md`, `docs/07-brands-and-permissions.md`

**Interfaces:**
- Consumes: `MINI_BODY`, `MINI_GLASS` from Task 1.
- Produces: `VEHICLES.mini` with the Global Constraints values plus `engineAt`, `camera` (chase/near/cockpit/bumper/drone; cockpit eye on the right, `z > 0`) and `sound`; `options: { chair: true }`; `camera.chair: { eye: CHAIR.eye }` (consumed by Task 3). `buildMini(g, v)` registered as `MODELS.mini`.

- [ ] **Step 1: Write the failing Playwright tests** in `prototype/tests/test_vehicles.py`, using the existing `open_hand` / `open_hand_query` helpers and a `MINI_JS` like `DELOREAN_JS`:
  - `test_mini_is_in_the_table_and_true_to_size` — after Start, wheels straight: `vehicle().model == "mini"`, `carSize()` l ≈ 3.05, h ≈ 1.35 (abs 0.05), w ≈ 1.41 (abs 0.1, mirrors in).
  - `test_mini_drives_on_par_with_the_compact` — same gas run as `test_delorean_drives_slower_than_compact`: mini speed after the run is > the DeLorean's and within 15 % of the compact's.
  - `test_vehicle_query_selects_the_mini` — `?vehicle=mini` picks `mini`, no page errors.
  - `test_mini_lamps_follow_the_lights` — with `L` on, the mini's head lamp material is brighter than with it off (read through whatever hook `applyLamps` writes; add a small `window.__mm` read if none exists).
- [ ] **Step 2: Commit and push**, then run `pytest prototype/tests/test_vehicles.py -k mini` — expected FAIL.
- [ ] **Step 3: Implement** the `VEHICLES.mini` entry (sound: `cylinders: 4`, `gears` with five entries ending in `999`, horn `notes` above the compact's `[415, 523]`, shorter `dur`, crash `weight` < 1 — tune by ear; must pass `checkSound`/`checkCrash`), `buildMini` (extruded body in Citron Green ≈ `#b5b83a`, its own non-paint material; matte black bonnet box; chrome bumpers and grille surround; black sills; round head lamps; small vertical tail lamps; outer seams and external hinges as thin dark boxes; `BLINK` indicators; nitro flames; `buildWheels(g, v)`; plate `textTex('AG · 1976', …)`), the strings (class/desc in the DeLorean strings' voice, may hint at an armchair, never name the series), and lamp handling so #270/#230/#271 drive the mini's lamps (generalise `delLamps` if it stays small).
- [ ] **Step 4: Run** `pytest prototype/tests/test_vehicles.py` and `pytest prototype/tests/test_lights.py` — all PASS, the existing compact/DeLorean/hatchback tests unedited; `node --test prototype/tests/*.test.mjs` PASS (incl. `strings.test.mjs` en/de parity).
- [ ] **Step 5: Docs** — `CHANGELOG.md` under `[Unreleased]`: one entry, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords, player voice, may name Mr. Bean; `docs/07-brands-and-permissions.md`: tracker row "Mini (BMW) shape / Mr. Bean (Tiger Aspect)" — not asked, look-alike, decided 2026-10-24 (primitives, no logo or lettering, no name in the game, the armchair as the one series nod).
- [ ] **Step 6: Commit** `feat(vehicles): Little Classic, a Mr. Bean's Mini look-alike`.

---

### Task 3: Armchair option

**Files:**
- Modify: `prototype/carselect.js` — `parseChoice` (~L54), new `withChair`, new `chairable`
- Modify: `prototype/index.html` — car-selection markup (~L451, a toggle row under the paint row), `renderCarSel` (~L3699), its click handler next to `$('cspaints').onclick` (~L3709), `openVehicleSwap`/`restoreVehicleSwap` (~L3677–3679), `buildMini` (chair group), `measureCar` (~L2381), the eye-camera branch (~L3553)
- Modify: `prototype/strings.js` — toggle label strings en/de
- Test: `prototype/tests/carselect.test.mjs`, `prototype/tests/test_carselect.py`

**Interfaces:**
- Consumes: `CHAIR`, `stepSway`, `SWAY` from Task 1; `VEHICLES.mini.options.chair`, `camera.chair.eye` from Task 2.
- Produces:
  - `chairable(def) -> boolean` — `def.options?.chair === true`.
  - `withChair(choice, on: boolean) -> choice` — copy with `chair: true`, or without the `chair` field when off.
  - `parseChoice` keeps `chair: true` only when the stored object has `chair === true`; otherwise the field is absent, so every existing `deepEqual` stays valid.
  - `chairOn() -> boolean` in `index.html` = `CHOICE.chair === true && chairable(VEH)`.
  - The chair is a child group `car.userData.chair` built by `buildMini` on every build, `visible = chairOn()`; toggling only flips `visible` (no rebuild). `measureCar` skips it like `flames`.
  - Eye camera: `viewEye(k)` returns `VEH.camera.chair.eye` scaled when `k === 'cockpit' && chairOn()`, else `vehEye(k)`; the eye branch uses `viewEye`. `aimMirror` keeps `vehEye('cockpit')`. With `chairOn()` in the cockpit view, step a module-level sway with `stepSway(SWAY_S, { steer: WHEEL_STATE.yaw, speed: Math.hypot(P.vx, P.vz) }, dt)`, add `pitch` as a look-target y offset, and `camera.rotateZ(roll)` after `lookAt`.
  - `window.__mm.chair() -> { on: boolean, visible: boolean, eye: number[] }` for tests.

- [ ] **Step 1: Write the failing node tests** in `carselect.test.mjs`:
  - `parseChoice: keeps a true chair flag, drops anything else` — `'{"id":"mini","paint":"navy","chair":true}'` → includes `chair: true`; `chair: "yes"` / `1` / `false` → no `chair` field; `'{"id":"compact","paint":"navy"}'` deep-equals `{ id: 'compact', paint: 'navy' }`.
  - `withChair: on adds the flag, off removes it` and `chairable: only vehicles that declare the option`.
  - `statBars: the mini's numbers` — `statBars({ drive: { top: 54, accel: 17, grip: 10 }, mass: 0.75 })` deep-equals `{ top: 7, accel: 9, handling: 9, mass: 3 }`.
- [ ] **Step 2: Run** `node --test prototype/tests/carselect.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** the three `carselect.js` changes. **Run** — PASS.
- [ ] **Step 4: Write the failing Playwright tests** in `test_carselect.py`:
  - `test_chair_toggle_only_for_the_mini` — the toggle is visible for `mini`, hidden for compact, DeLorean and hatchback.
  - `test_chair_persists_and_lifts_the_cockpit_eye` — mini, toggle on → `__mm.chair()` `on` and `visible` true, `eye[1]` in [2.4, 2.5]; `mm.car` holds `"chair":true`; after a reload still on; `carSize().h` unchanged vs chair off (≈ 1.35).
  - `test_chair_survives_switching_cars` — mini + chair → compact (no chair visible, compact cockpit eye unchanged) → mini (chair on again).
  - `test_chair_flag_on_a_car_without_the_option_is_ignored` — `localStorage mm.car = {"id":"delorean","paint":"navy","chair":true}` → no chair, DeLorean cockpit eye as in its table.
  - `test_cancelled_swap_restores_the_chair` — start a race with mini + chair off, pause → *Change vehicle* → toggle on → Esc → `chair().on` false.
- [ ] **Step 5: Commit and push**, then run `pytest prototype/tests/test_carselect.py -k chair` — expected FAIL.
- [ ] **Step 6: Implement** the toggle row (a `button` with `aria-pressed`, de/en label, hidden when `!chairable(def)`), the click handler (`Object.assign(CHOICE, withChair(CHOICE, !CHOICE.chair))`, flip `car.userData.chair.visible`, `saveChoice()`, re-render), `CARSEL.swap` capturing and restoring `chair`, the chair group in `buildMini` (upholstered fabric colour, seat + back + two arms + four short legs + two roof straps, sizes from `CHAIR`), `measureCar` skip, `viewEye` + sway, `window.__mm.chair`.
- [ ] **Step 7: Run** `pytest prototype/tests/test_carselect.py prototype/tests/test_vehicles.py` and `node --test prototype/tests/*.test.mjs` — all PASS.
- [ ] **Step 8: Changelog** — extend the Task 2 entry (or add one) with the **armchair** on the roof.
- [ ] **Step 9: Commit** `feat(vehicles): armchair on the Little Classic's roof`.

---

### Task 4: Manual playtest

- [ ] Serve with `python3 -m http.server 8000`, open `http://localhost:8000/prototype/?vehicle=mini`.
- [ ] Drive the Sisseln loop with the chair off and on in chase, near, cockpit, bumper and drone views: the car reads as a classic Mini at real size next to the compact, no lettering anywhere, the chair visible, the cockpit view sits in the chair and sways only while driving and steering; lights (`L`), hazard (`1`), brake lights and blinkers (`Q`/`E`) work; horn (`H`) sounds thin and high; empty console.
- [ ] Note the result in the PR's Testing section.
