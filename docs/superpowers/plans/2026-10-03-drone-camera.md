# Drone Chase Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fifth camera view, **Drone**, after bumper in the **C** cycle: 18 m behind and 12 m above the car, following lazily (position lerp 2.5, lagging aim point) with a small deterministic hover sway. Car and shadow shown; **B** (#65) works by reuse (#93).

**Architecture:** A pure module `prototype/camera.js` holds the `DRONE` constants and `droneSway(t)` (node-tested). In `prototype/index.html`, `CAM_VIEWS` gets a fifth entry `{ nameKey: 'camDrone', k: 'drone', drone: true }`, `VEHICLES.compact.camera` gets `drone: { dist: 18, h: 12 }`, and the chase branch of `stepCamera` gains a `drone` path: sway added to the target, a slower lerp, and a lagging aim point `CAM.aim`. For the four existing views every number stays as today. Strings via `tr()`.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, `node --test` for pure modules, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-drone-camera-design.md`

## Global Constraints

- **The four existing views are byte-for-byte the same behaviour.** `test_vehicles.py` (`test_table_cockpit_eye_is_used`), `test_look_back.py` and `test_heli.py` stay unchanged and green. Only `test_smoke.py::test_camera_cycles_with_c` changes, and only because the cycle now has five views.
- The drone is appended at index **4**. Never reorder `CAM_VIEWS`.
- No new key. The wheel and `+`/`-` stay the minimap zoom (`index.html:964`, `:1182`).
- The building pull-in and the ground clamp in the chase branch are **not** edited; the drone reuses them.
- No HUD element, overlay or frame for the drone.
- Strings go through `tr()`; `prototype/strings.js` gets the same keys in `en` and `de` (`strings.test.mjs` enforces it; Swiss spelling, no `ß`).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()`; the sway uses the camera's own clock `CAM.t`.
- Do not touch `data/` or `pipeline/`.
- **Animated camera:** the drone lerps slowly and never stands still (sway). Every browser check **polls the end state with a tolerance** via `page.wait_for_function(…, timeout=120000)` — wait for *arrival* (view index **and** camera inside ±1.5 m of its target), never for stillness, never a fixed `wait_for_timeout` on a camera position. The loop clamps `dt` to 0.05 s and a headless renderer draws under 1 fps, so one frame advances the sway clock by about 0.05 s.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_drone.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Existing views unchanged:** the `drone ? … : 6`, `drone ? … : 1.2`, `drone ? DRONE.rate : 6` ternaries must resolve to today's constants for every view without `drone`. A mistake here moves every chase camera and breaks `test_look_back.py` and the #69 arrival numbers.
- **Stale aim point:** `CAM.aim` must be re-seeded when the drone view is entered (`!CAM.aiming`) and on a look-back snap; otherwise the first drone frames look at wherever the drone last was.
- **Sway on the true right vector** (`-fz, fx`), not on `b` — the sway must not flip with B.
- **Index 4 everywhere:** the smoke test, the toast list, the help line.

---

## File map

- `prototype/camera.js`: new (Task 1).
- `prototype/tests/camera.test.mjs`: new (Task 1).
- `prototype/tests/test_drone.py`: new (Task 2).
- `prototype/tests/test_smoke.py`: `test_camera_cycles_with_c` (~L94-113) (Task 2).
- `prototype/index.html`:
  - the import block (~L243, after the `heli.js` import)
  - the two static F1 help copies of the C line (~L126, ~L192)
  - `VEHICLES.compact.camera` (~L905)
  - `CAM_VIEWS`, `CAM`, `stepCamera` (~L1082-1094)
- `prototype/strings.js`: `camDrone` and `keyCamera` in `en` (~L68, ~L93) and `de` (~L182, ~L206).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `ccdcca0`. Verify them with `grep -n` before editing, because other PRs may have shifted them.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the ground.** Run each on its own from the repo root:

```bash
grep -c "function stepCamera" prototype/index.html
grep -c "camDrone" prototype/index.html prototype/strings.js
grep -n "const CAM_VIEWS" prototype/index.html
```

Expected: `1`, `0` for both files, one line showing the four views. **If `camDrone` already appears**, STOP and report.

- [ ] **Step 2: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: Pure module `camera.js` (node, TDD)

**Files:**
- Create: `prototype/tests/camera.test.mjs`
- Create: `prototype/camera.js`

**Interfaces:**
- `DRONE = { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 }`
- `droneSway(t, cfg = DRONE)` → `{ side, up }` in metres.

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/camera.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRONE, droneSway } from '../camera.js';

test('DRONE: the agreed camera constants (#93)', () => {
  assert.deepEqual(DRONE, { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 });
});

test('DRONE: lazier than the chase cam (6) and the heli cam (3)', () => {
  assert.ok(DRONE.rate < 3 && DRONE.rate > 0);
  assert.ok(DRONE.aimRate > DRONE.rate);
});

test('droneSway: zero at t = 0, bounded by the amplitudes, not constant', () => {
  assert.deepEqual(droneSway(0), { side: 0, up: 0 });
  let maxSide = 0, maxUp = 0, moved = false, prev = droneSway(0);
  for (let t = 0; t < 20; t += 1 / 60) {
    const s = droneSway(t);
    maxSide = Math.max(maxSide, Math.abs(s.side)); maxUp = Math.max(maxUp, Math.abs(s.up));
    if (Math.abs(s.side - prev.side) > 1e-6) moved = true;
    prev = s;
  }
  assert.ok(maxSide <= DRONE.swaySide + 1e-9 && maxSide > DRONE.swaySide * 0.95, `side ${maxSide}`);
  assert.ok(maxUp <= DRONE.swayUp + 1e-9 && maxUp > DRONE.swayUp * 0.95, `up ${maxUp}`);
  assert.ok(moved);
});

test('droneSway: periodic in each axis', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  const a = droneSway(1.234), b = droneSway(1.234 + 1 / DRONE.swaySideHz), c = droneSway(1.234 + 1 / DRONE.swayUpHz);
  assert.ok(close(a.side, b.side));
  assert.ok(close(a.up, c.up));
});

test('droneSway: a config overrides the amplitudes', () => {
  const s = droneSway(0.25 / 0.33, { ...DRONE, swaySide: 2, swayUp: 0 });
  assert.ok(Math.abs(s.side - 2) < 1e-6 && s.up === 0);
});
```

- [ ] **Step 2: Run, expect failure.** `node --test prototype/tests/*.test.mjs` → `camera.test.mjs` fails with `Cannot find module '../camera.js'`.

- [ ] **Step 3: Implement.** Create `prototype/camera.js`:

```js
// #93: the drone chase camera -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// rate / aimRate: lerp rates (1/s) of the camera position and of its aim point; aimAhead / aimUp: the aim point relative to the car (m);
// sway*: a small deterministic hover around the target, driven by the camera's own clock (CAM.t), so it freezes with the pause and never uses rnd()
export const DRONE = { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 };

// side: along the car's right vector; up: world y
export function droneSway(t, cfg = DRONE) {
  return { side: Math.sin(2 * Math.PI * cfg.swaySideHz * t) * cfg.swaySide, up: Math.sin(2 * Math.PI * cfg.swayUpHz * t) * cfg.swayUp };
}
```

- [ ] **Step 4: Run, expect green.** `node --test prototype/tests/*.test.mjs` → baseline count + 5.

- [ ] **Step 5: Commit.**

```bash
git add prototype/camera.js prototype/tests/camera.test.mjs
git commit -m "feat(camera): drone camera constants and sway (#93)"
```

---

### Task 2: Failing browser tests

**Files:**
- Create: `prototype/tests/test_drone.py`
- Modify: `prototype/tests/test_smoke.py` (`test_camera_cycles_with_c`, ~L94-113)

**Interfaces:**
- Consumes (existing): `window.__mm.cam()` → `{ view, d, back, look }`, `window.__mm.camView`, `window.__mm.heading()`, `window.__mm.hud().carVisible`, `#toast`.

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/test_drone.py`:

```python
"""#93: the drone chase camera, view 4 in the C cycle. Hand-traced layout (no data files), car at START heading pi: forward = -x, right = -z.
The drone lerps slowly and hovers with a small sway, so it never stands still: every check polls ARRIVAL inside a tolerance
(view index AND camera within +-1.5 m of 18 m back / 12 m up), never stillness and never a fixed sleep."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000
DRONE = 4                 # index in CAM_VIEWS
DIST, H, TOL = 18.0, 12.0, 1.5

# camera offset projected on the car's forward / right vectors, and the view direction on forward
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
SIDE = "(c => { const th = window.__mm.heading(); return -c.d[0] * Math.sin(th) + c.d[2] * Math.cos(th); })(window.__mm.cam())"
LOOK = "(c => { const th = window.__mm.heading(); return c.look[0] * Math.cos(th) + c.look[2] * Math.sin(th); })(window.__mm.cam())"
ARRIVED = f"(c => c.view === {DRONE} && Math.abs(Math.hypot(c.d[0], c.d[2]) - {DIST}) < {TOL} && Math.abs(c.d[1] - {H}) < {TOL})(window.__mm.cam())"


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 320, "height": 180}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.cam && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (see test_vehicles.wait_frames)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=WAIT)


def to_drone(page):
    page.click("#startbtn", timeout=180000)
    for _ in range(DRONE):
        page.keyboard.press("KeyC")
    page.wait_for_function(f"() => window.__mm.camView === {DRONE}", timeout=WAIT)


def test_drone_is_the_fifth_view_and_arrives_high_behind_the_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        toast = page.evaluate("() => document.querySelector('#toast').textContent")
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        got = page.evaluate(f"() => ({{ d: window.__mm.cam().d, ahead: {AHEAD}, look: {LOOK}, car: window.__mm.hud().carVisible, shadow: window.__mm.hud().shadowVisible }})")
        b.close()
    assert toast == "Camera: Drone"
    assert got["ahead"] < -(DIST - TOL), got            # behind the car
    assert got["look"] > 0.3, got                       # looking ahead ...
    assert got["car"] is True and got["shadow"] is True, got   # ... at a visible car with its shadow


def test_drone_hovers_with_a_small_sway(server):
    """After arrival the lateral offset keeps moving inside a small band; a still camera (chase) would not."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        sides = []
        for _ in range(20):
            wait_frames(page, 1)
            sides.append(page.evaluate(f"() => {SIDE}"))
        b.close()
    spread = max(sides) - min(sides)
    assert 0.05 < spread < 1.2, sides


def test_hold_b_swings_the_drone_in_front(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        to_drone(page)
        page.wait_for_function(f"() => {ARRIVED}", timeout=WAIT)
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && {AHEAD} > {DIST - TOL}", timeout=WAIT)   # arrived in front
        held = page.evaluate(f"() => ({{ ahead: {AHEAD}, look: {LOOK}, h: window.__mm.cam().d[1], car: window.__mm.hud().carVisible }})")
        page.keyboard.up("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === false && {AHEAD} < -{DIST - TOL}", timeout=WAIT)
        released = page.evaluate(f"() => {LOOK}")
        b.close()
    assert held["look"] < -0.3, held                    # looks back past the car
    assert abs(held["h"] - H) < TOL, held               # still high
    assert held["car"] is True, held
    assert released > 0.3


@pytest.mark.parametrize("locale,text", [("de-CH", "Stossstange · Drohne"), ("en-US", "bumper · drone")])
def test_help_lists_the_drone(server, locale, text):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=WAIT)
        help_text = page.inner_text("#help")
        b.close()
    assert text in help_text, help_text
```

- [ ] **Step 2: Update the cycle test.** In `prototype/tests/test_smoke.py`, `test_camera_cycles_with_c`: `for _ in range(4)` → `for _ in range(5)`; the two asserts become

```python
    assert [v for v, _ in seen] == [1, 2, 3, 4, 0]
    assert [t for _, t in seen] == ["Camera: Chase near", "Camera: Cockpit", "Camera: Bumper", "Camera: Drone", "Camera: Chase"]
```

- [ ] **Step 3: Run, expect failure.** From `pipeline/`: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_drone.py -q -x` (foreground). Expected: `test_drone_is_the_fifth_view…` fails at `camView === 4` (timeout: there are only four views). Stop after the first failure — the whole file takes minutes.

- [ ] **Step 4: Commit.**

```bash
git add prototype/tests/test_drone.py prototype/tests/test_smoke.py
git commit -m "test(camera): drone view tests, five views in the C cycle (#93)"
```

---

### Task 3: The drone view in `index.html` and the strings

**Files:**
- Modify: `prototype/index.html` (import ~L243, help ~L126 and ~L192, `VEHICLES` ~L905, `CAM_VIEWS` / `CAM` / `stepCamera` ~L1082-1094)
- Modify: `prototype/strings.js` (`en` ~L68, ~L93; `de` ~L182, ~L206)

- [ ] **Step 1: Import.** After the `heli.js` import line add:

```js
import { DRONE, droneSway } from './camera.js';
```

- [ ] **Step 2: Vehicle table.** In `VEHICLES.compact.camera` (one line, ~L905) append the drone row after `bumper`:

```js
camera: { chase: { dist: 9, h: 3.4 }, near: { dist: 6, h: 2.4 }, cockpit: { eye: [-0.25, 1.22, -0.38] }, bumper: { eye: [2.35, 0.55, 0] }, drone: { dist: 18, h: 12 } },
```

Extend the comment above the table (`// camera: chase distances in world metres, …`) with `; drone: world metres too, not tied to the car's size (#93)`.

- [ ] **Step 3: Views and state.** Replace the `CAM_VIEWS` line and the `CAM` line:

```js
// five camera views, cycled with C: the original chase cam (default), a closer chase cam, cockpit (driver's eye, left seat), bumper and the drone (#93: high, lazy, hovering)
const CAM_VIEWS = [{ nameKey: 'camChase', k: 'chase' }, { nameKey: 'camNear', k: 'near' }, { nameKey: 'camCockpit', k: 'cockpit', eye: true }, { nameKey: 'camBumper', k: 'bumper', eye: true }, { nameKey: 'camDrone', k: 'drone', drone: true }];
```

```js
const CAM = { back: false, t: 0, aim: new THREE.Vector3(), aiming: false };   // #65: B held = look back (read each frame in stepCamera); #93: the drone's clock and lagging aim point
```

(Also change the existing comment `// four camera views, cycled with C …` above `CAM_VIEWS` to the five-view line shown; keep the two following comment lines about the car model and the per-vehicle offsets.)

- [ ] **Step 4: `stepCamera` chase branch.** Replace only the tail of the `else { const bx = fx * s, … }` branch — from `const target = new THREE.Vector3(` to the closing `}` of the branch — with:

```js
const target = new THREE.Vector3(P.x - bx * dist, P.y + h, P.z - bz * dist); target.y = Math.max(target.y, groundH(target.x, target.z, target.y) + 1.2); const drone = !!v.drone; if (drone) { CAM.t += dt; const sw = droneSway(CAM.t); target.x -= fz * sw.side; target.z += fx * sw.side; target.y += sw.up; } const ahead = drone ? DRONE.aimAhead : 6, aim = new THREE.Vector3(P.x + bx * ahead, P.y + (drone ? DRONE.aimUp : 1.2), P.z + bz * ahead); if (snap) camPos.copy(target); else camPos.lerp(target, 1 - Math.exp(-(drone ? DRONE.rate : 6) * dt)); if (snap || (drone && !CAM.aiming)) CAM.aim.copy(aim); else if (drone) CAM.aim.lerp(aim, 1 - Math.exp(-DRONE.aimRate * dt)); CAM.aiming = drone; camera.position.copy(camPos); camera.lookAt(drone ? CAM.aim : aim); }
```

Everything before `const target` in that branch (the `bx/bz`, `vc`, `dist/h` speed terms and the building pull-in loop) is **unchanged**. For a view without `drone`, this is exactly today's code: lerp rate 6, aim `P + b·6` at `P.y + 1.2`, no sway.

- [ ] **Step 5: Strings.** In `prototype/strings.js`:

`en`: after `camBumper: 'Bumper',` add `camDrone: 'Drone',`; change `keyCamera` to `'camera: chase · near · cockpit · bumper · drone'`.

`de`: after `camBumper: 'Stossstange',` add `camDrone: 'Drohne',`; change `keyCamera` to `'Kamera: Verfolger · nah · Cockpit · Stossstange · Drohne'`.

- [ ] **Step 6: Static help copies.** In `prototype/index.html`, both `<span data-i18n="keyCamera">` lines (~L126 and ~L192) get the new English text `camera: chase · near · cockpit · bumper · drone`.

- [ ] **Step 7: Node tests.** `node --test prototype/tests/*.test.mjs` → all green (`strings.test.mjs` checks en/de key parity).

- [ ] **Step 8: Commit and push** (before the long browser run).

```bash
git add prototype/index.html prototype/strings.js
git commit -m "feat(camera): drone chase view, fifth in the C cycle (#93)"
git push -u origin HEAD
```

- [ ] **Step 9: Browser tests, foreground.** From `pipeline/`: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_drone.py ../prototype/tests/test_smoke.py -q`. Expected: all green. If the arrival poll times out, read `window.__mm.cam().d` once at the timeout and compare with (18, 12): a value stuck near (9, 3.4) means `VEH.camera.drone` is not read; a height far above 12 means the ground clamp or a pull-in fired at START (then report, do not loosen `TOL`).

- [ ] **Step 10: Regression, foreground.** Same prefix, `-m pytest ../prototype/tests/test_look_back.py ../prototype/tests/test_vehicles.py ../prototype/tests/test_heli.py -q`. Expected: green and **unchanged** — if one of them fails, the drone path leaked into the existing views (Review Focus), fix `stepCamera`, never the tests.

---

### Task 4: Changelog and playtest notes

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased] → Added`, after the **B** look-back line)
- Modify: `test-todo.md` (new section at the end)

- [ ] **Step 1: CHANGELOG.** Add under `### Added`, after the „Hold **B** to look back" bullet:

```markdown
- A fifth camera view: press **C** past the bumper cam and a **drone** follows you from high up behind the car. It hangs back when you accelerate, swings wide in bends and hovers a little, like a camera drone keeping station. **B** still looks back from up there too.
```

- [ ] **Step 2: test-todo.** Append:

```markdown
## Drone camera (#93)

- [ ] **C** four times from the start: the toast says „Camera: Drone" / „Kamera: Drohne"; the view is high behind the car (about 18 m back, 12 m up) and the car with its shadow is in the picture.
- [ ] Driving: the drone lags on acceleration and swings out in bends, then catches up; at rest it hovers gently. Does 18 / 12 feel right, or too high / too far? (`VEH.camera.drone` in `prototype/index.html`, `DRONE` in `prototype/camera.js`.)
- [ ] Hold **B** in the drone view: it swings round in front, high, looking back past the car; let go and it returns without swinging through the car.
- [ ] Beside the LANDI tower (**J** → `landi`) and the DSM halls: the drone pulls in and climbs over tall boxes instead of clipping through them; low houses are passed over.
- [ ] **F** (helicopter) and back: the helicopter camera is unchanged; landing keeps the drone view if it was selected.
- [ ] **Esc**: paused, the drone freezes (no hover while the menu is open).
- [ ] **F1**: the C line reads „camera: chase · near · cockpit · bumper · drone" (de: „… Stossstange · Drohne").
```

- [ ] **Step 3: Commit.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): drone chase camera (#93)"
git push
```

---

## Done when

- `node --test prototype/tests/*.test.mjs` green (baseline + 5).
- `test_drone.py` (5 tests) and the updated `test_smoke.py::test_camera_cycles_with_c` green; `test_look_back.py`, `test_vehicles.py`, `test_heli.py` green and unchanged.
- `CAM_VIEWS` has five entries, drone last; `VEH.camera.drone = { dist: 18, h: 12 }`.
- CHANGELOG and test-todo entries present.
