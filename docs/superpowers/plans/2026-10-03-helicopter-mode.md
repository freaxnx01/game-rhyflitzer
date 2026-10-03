# Helicopter Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **F** lifts off in a small helicopter from where the car is, flies over the region for an overview (W/S forward/back, A/D yaw, Space climb, Shift sink, never colliding), and **F** again lands the car on the nearest road below. In a race the timer runs on, nothing is collected from the air, and a run with a flight is not counted (#10).

**Architecture:** A new pure module `prototype/heli.js` holds the flight model (`HELI`, `heliInput`, `heliFloor`, `heliStart`, `stepHeli`), unit-tested with `node --test`. `prototype/index.html` adds a flight state `FLY = { on, v, alt }`, a procedural `heli` model, `takeOff` / `land` / `stepFly` / `flyCamera`, runs `stepFly` instead of `stepCar` while `FLY.on`, and writes the helicopter's position into `P` so every HUD element follows. `resetCar` ends any flight. The race skips checkpoint collection while flying and records `R.flown`. Strings through `tr()` (#9).

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-helicopter-mode-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write the failing test first, watch it fail, implement minimally to pass, verify green. Never edit a test to make it pass.
- **Do not change `stepCar`.** `test_vehicles.py::test_golden_trace_of_the_compact_car` pins it to 1e-6 and must stay green unchanged.
- Key **F** only. Do not add any other key; **B** is claimed by #65. Space and Shift change meaning only while `FLY.on` (read in `heliInput`); the `keydown` listener only gains the F line and the `!FLY.on` guard on C.
- Constants exactly as in `HELI` (Task 1). No collision, no damage in flight.
- Far plane (`index.html:803`) and fog (`STYLES`, `index.html:875-877`) stay unchanged.
- All new UI text through `tr()`, en and de in `prototype/strings.js` (same keys — `strings.test.mjs` enforces it; Swiss spelling, no `ß`).
- No operator livery or logo on the helicopter model (no Rega, no brand).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_heli.py -q` — slow (several minutes), **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- `resetCar` clears `FLY.on`: R, J, the map double-click, landing and `startRace` all end a flight through it. Pinned by `test_r_ends_a_flight` and `test_f_again_lands_on_a_road_without_a_jump`.
- `stepRace` must not collect checkpoints while `FLY.on` (2D distance ignores height). Pinned by `test_no_checkpoint_from_the_air`.
- Landing is **not** a jump (`nearestJumpable` + `resetCar`, not `placeOnRoad`). Pinned by the landing test (`jumped` stays `False`, `flown` is `True`).
- `jumpTo` refactor must keep its behaviour: `test_jump.py` and `test_minimap.py` stay green unchanged.
- `stepCamera` hides the car and shows the helicopter from `FLY.on` every frame; `V` must not show the car in flight.

---

## File map

- Create: `prototype/heli.js`, `prototype/tests/heli.test.mjs`, `prototype/tests/test_heli.py`.
- Modify `prototype/strings.js`: four keys in `en` (~L33, ~L70, ~L92) and `de` (~L131, ~L166, ~L187).
- Modify `prototype/index.html`: F1 help line after the J line (~L120); `heli.js` import after the `strings.js` import (~L205); `FLY` + `heli` model after `setVehicle(VEH);` (~L871); `keydown` listener (~L889); `jumpTo` (~L923); `resetCar` (~L925) and the new flight functions + hooks after it; `raceFlags` hook (~L942); `flyCamera` + `stepCamera` (~L991-996); `startRace` / `stepRace` / `finish` / `resultHtml` (~L1004-1008); `loop` (~L1104).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `e9b20ac`; verify with `grep -n` before editing (other PRs may have shifted them).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the anchors exist exactly once.** From the repo root, each on its own:

```bash
grep -c "R.jumped = false; R.fast = false;" prototype/index.html
grep -c "if (R.state === 'racing' || R.state === 'armed') { if (best.i >= 0 && bd < 7)" prototype/index.html
grep -c "car.visible = !v.eye && !HUD.carHidden;" prototype/index.html
grep -c "if (R.state !== 'ready') stepCar(dt); stepRace(dt);" prototype/index.html
grep -c "if (e.code === 'KeyC' && \$('overlay').hidden) cycleCamera();" prototype/index.html
grep -c "KeyF" prototype/index.html
grep -c "const tr = " prototype/index.html
```

Expected: `1 1 1 1 1 0 1`. If `KeyF` is already used, or an anchor is missing, STOP and report.

- [ ] **Step 2: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: Pure flight model `prototype/heli.js`

**Files:**
- Create: `prototype/heli.js`
- Test: `prototype/tests/heli.test.mjs`

**Interfaces:**
- Produces: `HELI` (constants); `heliInput(keys, touch)` → `{ fwd, yaw, lift }` each in `{-1, 0, 1}`; `heliFloor(ground, boxes, x, z, cfg = HELI)` → number; `heliStart(x, z, y, th, ground, cfg = HELI)` → state `{ x, z, y, th, v, alt }`; `stepHeli(s, input, dt, ground, floor, cfg = HELI)` → new state (pure, `s` untouched).
- Box shape (as in `OBB_GRID`): `{ x, z, hw, hd, c, s, h, bridge? }`, `h` = absolute top height, local frame `lx = dx*c + dz*s`, `lz = -dx*s + dz*c` (same as `collide`, `index.html:963`).

- [ ] **Step 1: Write the failing test** `prototype/tests/heli.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELI, heliInput, heliFloor, heliStart, stepHeli } from '../heli.js';

const IDLE = { fwd: 0, yaw: 0, lift: 0 };
const NO_TOUCH = { l: 0, r: 0, g: 0, b: 0, h: 0 };
const run = (s, input, secs, ground = 0, floor = ground + HELI.clearance) => { for (let i = 0; i < secs * 60; i++) s = stepHeli(s, input, 1 / 60, ground, floor); return s; };
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const at = (y, th = 0) => ({ x: 0, z: 0, y, th, v: 0, alt: y });
const box = (o) => ({ x: 0, z: 0, hw: 5, hd: 5, c: 1, s: 0, h: 30, ...o });

test('HELI: the agreed flight constants', () => {
  assert.deepEqual(HELI, { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, back: 10, accel: 12, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 4, camDist: 35, camH: 22 });
});

test('heliInput: W/S and arrows fly, A/D and arrows yaw, Space climbs, Shift sinks, touch buttons too', () => {
  assert.deepEqual(heliInput({}, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: true, KeyD: true, Space: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: 1 });
  assert.deepEqual(heliInput({ ArrowDown: true, ArrowLeft: true, ShiftRight: true }, NO_TOUCH), { fwd: -1, yaw: -1, lift: -1 });
  assert.deepEqual(heliInput({ ArrowUp: true, ArrowRight: true, ShiftLeft: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: -1 });
  assert.deepEqual(heliInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true, Space: true, ShiftLeft: true }, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: false }, { ...NO_TOUCH, g: 1, l: 1 }), { fwd: 1, yaw: -1, lift: 0 });
  assert.deepEqual(heliInput({}, { ...NO_TOUCH, b: 1, r: 1 }), { fwd: -1, yaw: 1, lift: 0 });
});

test('heliStart: where the car is, standing, aiming for takeoffAgl above the ground', () => {
  assert.deepEqual(heliStart(10, -20, 3, 1.5, 3), { x: 10, z: -20, y: 3, th: 1.5, v: 0, alt: 3 + HELI.takeoffAgl });
});

test('stepHeli: from take-off it climbs to the target altitude and hovers in place', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), IDLE, 10);
  close(s.y, HELI.takeoffAgl, 1, 'y');
  assert.equal(s.x, 0); assert.equal(s.z, 0); assert.equal(s.v, 0);
});

test('stepHeli: it returns a new state and leaves the old one alone', () => {
  const s = at(50); const n = stepHeli(s, { fwd: 1, yaw: 1, lift: 1 }, 1 / 60, 0, 10);
  assert.deepEqual(s, at(50)); assert.notEqual(n, s);
});

test('stepHeli: W accelerates to top speed along the heading, never beyond', () => {
  const s = run(at(50, Math.PI / 2), { ...IDLE, fwd: 1 }, 6);
  close(s.v, HELI.top, 1e-9, 'v'); close(s.x, 0, 1e-6, 'x'); assert.ok(s.z > 150, String(s.z));
});

test('stepHeli: releasing W slows to a hover, S flies slowly backwards', () => {
  let s = run(at(50), { ...IDLE, fwd: 1 }, 4);
  s = run(s, IDLE, 4); assert.equal(s.v, 0);
  s = run(s, { ...IDLE, fwd: -1 }, 3); close(s.v, -HELI.back, 1e-9, 'v');
});

test('stepHeli: D yaws right (heading grows) at yawRate, A left', () => {
  close(run(at(50), { ...IDLE, yaw: 1 }, 1).th, HELI.yawRate, 1e-9, 'D');
  close(run(at(50), { ...IDLE, yaw: -1 }, 1).th, -HELI.yawRate, 1e-9, 'A');
});

test('stepHeli: Space raises the target altitude at climb rate, capped at maxAgl above the ground', () => {
  close(run(at(50), { ...IDLE, lift: 1 }, 2).alt, 50 + 2 * HELI.climb, 1e-6, '2 s');
  close(run(at(50), { ...IDLE, lift: 1 }, 60, 5).alt, 5 + HELI.maxAgl, 1e-9, 'cap');
});

test('stepHeli: Shift sinks, but never below the floor', () => {
  const s = run(at(100), { ...IDLE, lift: -1 }, 20, 0, 30);
  assert.equal(s.alt, 30); close(s.y, 30, 1e-6, 'y');
});

test('stepHeli: a floor above the helicopter lifts it at once (a tall building ahead)', () => {
  const s = stepHeli(at(20), IDLE, 1 / 60, 0, 45);
  assert.equal(s.y, 45); assert.equal(s.alt, 45);
});

test('heliFloor: ground plus clearance with nothing around', () => {
  assert.equal(heliFloor(7, [], 0, 0), 7 + HELI.clearance);
});

test('heliFloor: the top of a box under the rotor counts; bridges and boxes further away do not', () => {
  assert.equal(heliFloor(2, [box()], 0, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin - 0.1, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin + 0.1, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(2, [box({ bridge: true })], 0, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(40, [box()], 0, 0), 40 + HELI.clearance);   // ground above a low box wins
  assert.equal(heliFloor(2, [box(), box({ h: 55 })], 0, 0), 55 + HELI.clearance);   // the highest box wins
});

test('heliFloor: rotated boxes are tested in their own frame', () => {
  const r = box({ hw: 20, hd: 2, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2) });   // long along z
  assert.equal(heliFloor(0, [r], 0, 15), 30 + HELI.clearance);
  assert.equal(heliFloor(0, [r], 15, 0), HELI.clearance);
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test prototype/tests/*.test.mjs` → `heli.test.mjs` fails with `Cannot find module '../heli.js'`.

- [ ] **Step 3: Implement** `prototype/heli.js`:

```js
// #10: helicopter flight model (F) -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Units m, m/s, m/s², rad/s. Same frame as the car: x east, z south, th = heading (0 = +x; D makes it grow, like steering).
export const HELI = { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, back: 10, accel: 12, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 4, camDist: 35, camH: 22 };

const held = (keys, codes) => codes.some(c => keys[c]);
const axis = (plus, minus) => (plus ? 1 : 0) - (minus ? 1 : 0);

// keys: KeyboardEvent.code → bool (the game's keys object); touch: the on-screen buttons { l, r, g, b, h }
export function heliInput(keys, touch) {
  return {
    fwd: axis(held(keys, ['KeyW', 'ArrowUp']) || touch.g, held(keys, ['KeyS', 'ArrowDown']) || touch.b),
    yaw: axis(held(keys, ['KeyD', 'ArrowRight']) || touch.r, held(keys, ['KeyA', 'ArrowLeft']) || touch.l),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
  };
}

// lowest allowed height at (x, z): the ground or the top of any non-bridge box within rotorMargin, plus clearance
export function heliFloor(ground, boxes, x, z, cfg = HELI) {
  let top = ground;
  for (const o of boxes) {
    if (o.bridge) continue;
    const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    if (Math.abs(lx) <= o.hw + cfg.rotorMargin && Math.abs(lz) <= o.hd + cfg.rotorMargin) top = Math.max(top, o.h);
  }
  return top + cfg.clearance;
}

export function heliStart(x, z, y, th, ground, cfg = HELI) {
  return { x, z, y, th, v: 0, alt: ground + cfg.takeoffAgl };
}

const approach = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));

// one fixed step: yaw, speed towards top / -back / 0, target altitude within [floor, ground + maxAgl], y follows it smoothly but never below the floor
export function stepHeli(s, input, dt, ground, floor, cfg = HELI) {
  const th = s.th + input.yaw * cfg.yawRate * dt;
  const target = input.fwd > 0 ? cfg.top : input.fwd < 0 ? -cfg.back : 0;
  const v = approach(s.v, target, cfg.accel * dt);
  const alt = Math.max(floor, Math.min(ground + cfg.maxAgl, s.alt + input.lift * cfg.climb * dt));
  const y = Math.max(floor, s.y + (alt - s.y) * (1 - Math.exp(-cfg.follow * dt)));
  return { x: s.x + Math.cos(th) * v * dt, z: s.z + Math.sin(th) * v * dt, y, th, v, alt };
}
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (baseline + 14).

- [ ] **Step 5: Commit.**

```bash
git add prototype/heli.js prototype/tests/heli.test.mjs
git commit -m "feat(prototype): pure helicopter flight model (#10)"
```

---

### Task 2: Strings

**Files:**
- Modify: `prototype/strings.js`

**Interfaces:**
- Produces: string keys `keyHeli`, `heliOn`, `heliLanded`, `notCountedHeli` in `en` and `de`.

- [ ] **Step 1: Failing check.** `node -e "import('./prototype/strings.js').then(m => { for (const k of ['keyHeli', 'heliOn', 'heliLanded', 'notCountedHeli']) if (!(k in m.STRINGS.en) || !(k in m.STRINGS.de)) { console.error('missing ' + k); process.exit(1); } })"` → exits 1 (`missing keyHeli`).

- [ ] **Step 2: Add the English keys** in `en`:
  - after `notCountedFast: …` (~L33): `  notCountedHeli: 'with the helicopter, not counted · ',`
  - after `fishes: …` (~L70): `  heliOn: 'Helicopter!',` and `  heliLanded: 'Landed',`
  - after `keyJump: …` (~L92): `  keyHeli: 'helicopter: take off · land (Space climbs, Shift sinks)',`

- [ ] **Step 3: Add the German keys** in `de`, at the same places:
  - after `notCountedFast` (~L131): `  notCountedHeli: 'mit Helikopter, zählt nicht · ',`
  - after `fishes` (~L166): `  heliOn: 'Helikopter!',` and `  heliLanded: 'Gelandet',`
  - after `keyJump` (~L187): `  keyHeli: 'Helikopter: abheben · landen (Leertaste steigt, Shift sinkt)',`

- [ ] **Step 4: Verify.** The Step 1 command exits 0; `node --test prototype/tests/*.test.mjs` → all pass (`strings.test.mjs` checks same keys, no `ß`).

- [ ] **Step 5: Commit.** `git add prototype/strings.js && git commit -m "feat(i18n): helicopter strings (#10)"` (run the two commands separately if the shell rejects `&&`).

---

### Task 3: Failing browser tests `prototype/tests/test_heli.py`

**Files:**
- Create: `prototype/tests/test_heli.py`

**Interfaces:**
- Consumes (to be built in Task 4): `__mm.fly()` → `{ on, x, y, z, th, v, alt, ground, heliVisible, carVisible }`; `__mm.flySim(secs, hold=[])` → same as `fly()` after `secs * 60` steps of `stepFly(1/60)` with the key codes in `hold` held; `__mm.raceFlags().flown`.

- [ ] **Step 1: Write the tests.**

```python
"""#10 helicopter mode: F takes off and lands, flight controls, no checkpoints from the air, a flight is not counted.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. (1780, 560) is a vertex of the hand
Bahnhofstrasse and checkpoint 1 (Bahnhof Sisseln). flySim steps the flight headless (a headless frame is slow).
Slow (Playwright): run in the foreground."""
import math

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)
FRAMES = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))"


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def fly(page):
    return page.evaluate("() => window.__mm.fly()")


def fly_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.flySim(s, h)", [secs, list(hold)])


def flags(page):
    return page.evaluate("() => window.__mm.raceFlags()")


def text(page, sel):
    """textContent, not inner_text: #toast and the #result lines are text-transform: uppercase."""
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def take_off(page):
    page.keyboard.press("KeyF")
    return fly_sim(page, 10)


def test_f_does_nothing_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.press("KeyF")
        state = fly(page)
        b.close()
    assert state["on"] is False


def test_f_takes_off_climbs_and_shows_the_helicopter(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        s = take_off(page)
        page.wait_for_function("() => window.__mm.fly().heliVisible && !window.__mm.fly().carVisible", timeout=120000)
        toast = text(page, "#toast")
        b.close()
    assert s["on"] is True
    assert abs(s["alt"] - s["ground"] - 120) < 1e-6, s
    assert abs(s["y"] - s["ground"] - 120) < 1, s
    assert "Helicopter" in toast, toast


def test_flight_controls(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        s0 = take_off(page)
        fwd = fly_sim(page, 3, ["KeyW"])
        before_yaw = fly(page); yawed = fly_sim(page, 1, ["KeyD"])
        before_up = fly(page); up = fly_sim(page, 2, ["Space"])
        down = fly_sim(page, 40, ["ShiftLeft"])
        b.close()
    ahead = (fwd["x"] - s0["x"]) * math.cos(s0["th"]) + (fwd["z"] - s0["z"]) * math.sin(s0["th"])
    assert ahead > 30 and fwd["v"] > 30, (s0, fwd)
    assert abs(yawed["th"] - before_yaw["th"] - 1.2) < 1e-6, (before_yaw, yawed)
    assert abs(up["alt"] - before_up["alt"] - 30) < 1e-6, (before_up, up)
    assert down["ground"] + 10 - 0.01 <= down["y"] < down["ground"] + 60, down


def test_c_does_nothing_while_flying(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyC")
        in_flight = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyF")
        page.keyboard.press("KeyC")
        landed = page.evaluate("() => window.__mm.camView")
        b.close()
    assert in_flight == view and landed != view, (view, in_flight, landed)


def test_f_again_lands_on_a_road_without_a_jump(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        fly_sim(page, 5, ["KeyW"])
        page.keyboard.press("KeyF")
        state = fly(page)
        car = page.evaluate("() => window.__mm.car()")
        road = page.evaluate("() => window.__mm.roadDist()")
        f = flags(page)
        toast = text(page, "#toast")
        page.wait_for_function("() => !window.__mm.fly().heliVisible && window.__mm.fly().carVisible", timeout=120000)
        b.close()
    assert state["on"] is False
    assert road < 0 and abs(car["y"] - car["ground"]) < 0.5, (car, road)
    assert f["flown"] is True and f["jumped"] is False, f
    assert "Landed" in toast, toast


def test_r_ends_a_flight(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.keyboard.press("KeyR")
        state = fly(page)
        b.close()
    assert state["on"] is False


def test_no_checkpoint_from_the_air(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")
        page.evaluate(FRAMES)
        in_air = text(page, "#cpn")
        page.keyboard.press("KeyF")      # lands on the Bahnhofstrasse vertex = the checkpoint
        page.wait_for_function("() => document.querySelector('#cpn').textContent === '1'", timeout=120000)
        b.close()
    assert in_air == "0", in_air


def test_a_run_with_a_flight_is_not_counted(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        take_off(page)
        page.keyboard.press("KeyF")
        page.evaluate("() => window.__mm.finishNow()")
        result = text(page, "#result")
        best = page.evaluate("() => localStorage.getItem('mm.best2')")
        b.close()
    assert "with the helicopter, not counted" in result and "with a jump" not in result, result
    assert best is None


def test_help_lists_f(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.press("F1")
        help_text = page.inner_text("#help")
        b.close()
    assert "helicopter" in help_text, help_text
```

- [ ] **Step 2: Commit and push the branch** (before the long run): `git add prototype/tests/test_heli.py`, `git commit -m "test(prototype): helicopter mode browser tests (#10)"`, `git push -u origin HEAD`.

- [ ] **Step 3: Run, watch them fail** (foreground, see Global Constraints): `test_heli.py` → `test_f_does_nothing_on_the_start_screen` and the others fail with `window.__mm.fly is not a function` (`test_help_lists_f` fails on the missing text). If the browser language is German in this environment, the English assertions are still right: Playwright's Chromium defaults to `en-US`.

---

### Task 4: Wire the helicopter into `prototype/index.html`

**Files:**
- Modify: `prototype/index.html`

**Interfaces:**
- Consumes: `HELI`, `heliInput`, `heliFloor`, `heliStart`, `stepHeli` (Task 1); string keys (Task 2).
- Produces: `FLY`, `heli`, `rotor`, `nearestJumpable(px, pz)`, `toggleFly`, `takeOff`, `land`, `stepFly(dt)`, `flyCamera(dt)`; hooks `__mm.fly`, `__mm.flySim`; `R.flown`.

- [ ] **Step 1: Import.** After `import { translate } from './strings.js';` (~L205) add:

```js
import { HELI, heliInput, heliFloor, heliStart, stepHeli } from './heli.js';
```

- [ ] **Step 2: Flight state and model.** After `setVehicle(VEH);` (~L871) add:

```js
// #10 helicopter (F): FLY is the flight state, P stays the position (so map, compass and HUD follow); a generic procedural model, no operator livery
const FLY = { on: false, v: 0, alt: 0 };
const heli = new THREE.Group(), rotor = new THREE.Group(); heli.visible = false; scene.add(heli);
{ const body = new THREE.MeshLambertMaterial({ color: 0xffc61a }), dark = new THREE.MeshLambertMaterial({ color: 0x2a2e38 }), glass = new THREE.MeshPhongMaterial({ color: 0x1a2430, shininess: 140, specular: 0xffffff }); const cab = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), body); cab.scale.set(1.6, 1, 1); cab.position.y = 1.6; const win = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), glass); win.scale.set(1.4, 0.8, 1.05); win.position.set(1.1, 1.9, 0); const boom = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.5), body); boom.position.set(-4.5, 1.9, 0); const fin = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.15), body); fin.position.set(-6.8, 2.6, 0); heli.add(cab, win, boom, fin); for (const s of [-1, 1]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 0.15), dark); skid.position.set(0, 0.1, s * 1.2); heli.add(skid); } const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), dark); mast.position.y = 3; heli.add(mast); for (const a of [0, Math.PI / 2]) { const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.35), dark); blade.rotation.y = a; rotor.add(blade); } rotor.position.y = 3.4; heli.add(rotor); heli.traverse(o => { o.castShadow = true; }); }
```

(Model x is forward, like the car; `heli.rotation.y = -P.th` aims it.)

- [ ] **Step 3: Keys.** In the `keydown` listener (~L889) replace

`if (e.code === 'KeyC' && $('overlay').hidden) cycleCamera();`

with

`if (e.code === 'KeyC' && $('overlay').hidden && !FLY.on) cycleCamera(); if (e.code === 'KeyF' && $('overlay').hidden) toggleFly();`

- [ ] **Step 4: Split `jumpTo`.** Replace the whole `function jumpTo(p) { … }` line (~L923) with (same loop, renamed point, returns instead of placing):

```js
function nearestJumpable(px, pz) { let best = null; for (const r of ROADS) { if (!jumpable(r)) continue; for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1), x = ax + dx * t, z = az + dz * t, d = Math.hypot(px - x, pz - z); if (!best || d < best.d) best = { d, x, z, th: Math.atan2(dz, dx) }; } } return best; }
function jumpTo(p) { const best = nearestJumpable(p.x, p.z); if (best) placeOnRoad(best.x, best.z, best.th, p.n); }
```

- [ ] **Step 5: `resetCar` ends a flight.** In `function resetCar() { P.x = P.safe[0]; …` (~L925) insert `FLY.on = false; ` right after the opening `{ `, so it reads `function resetCar() { FLY.on = false; P.x = P.safe[0]; …`. Leave the rest of the line and its comment unchanged.

- [ ] **Step 6: Flight functions and hooks.** Directly after the `resetCar` line add:

```js
// #10: F takes off from the car's spot and lands the car on the nearest jumpable road below (not a jump: the flight already marks the run). R, J, the map and Start end a flight through resetCar
function toggleFly() { if (FLY.on) land(); else takeOff(); }
function takeOff() { const s = heliStart(P.x, P.z, P.y, P.th, groundH(P.x, P.z, 1e4)); FLY.on = true; FLY.v = s.v; FLY.alt = s.alt; P.vx = P.vz = P.vy = 0; P.splash = 0; if (R.state === 'racing' || R.state === 'armed') R.flown = true; toast(tr('heliOn')); }
function land() { const spot = nearestJumpable(P.x, P.z); if (spot) P.safe = [spot.x, spot.z, spot.th]; resetCar(); toast(tr('heliLanded')); }
function stepFly(dt) { const ground = groundH(P.x, P.z, 1e4), floor = heliFloor(ground, gridQuery(OBB_GRID, P.x, P.z, HELI.rotorMargin + 2), P.x, P.z); const s = stepHeli({ x: P.x, z: P.z, y: P.y, th: P.th, v: FLY.v, alt: FLY.alt }, heliInput(keys, touch), dt, ground, floor); P.x = s.x; P.z = s.z; P.y = s.y; P.th = s.th; P.vx = Math.cos(s.th) * s.v; P.vz = Math.sin(s.th) * s.v; FLY.v = s.v; FLY.alt = s.alt; heli.position.set(P.x, P.y, P.z); heli.rotation.set(0, -P.th, 0); rotor.rotation.y += dt * 30; blob.visible = false; flames.visible = false; }
window.__mm.fly = () => ({ on: FLY.on, x: P.x, y: P.y, z: P.z, th: P.th, v: FLY.v, alt: FLY.alt, ground: groundH(P.x, P.z, 1e4), heliVisible: heli.visible, carVisible: car.visible });
window.__mm.flySim = (secs, hold = []) => { for (const k of hold) keys[k] = true; for (let i = 0; i < secs * 60; i++) stepFly(1 / 60); for (const k of hold) keys[k] = false; return window.__mm.fly(); };
```

(`R` and `touch` are declared elsewhere in the module; these functions only run after start-up.)

- [ ] **Step 7: Race flag hook.** Replace `window.__mm.raceFlags = () => ({ jumped: !!R.jumped, fast: !!R.fast });` (~L942) with `window.__mm.raceFlags = () => ({ jumped: !!R.jumped, fast: !!R.fast, flown: !!R.flown });`.

- [ ] **Step 8: Camera.** After the `function cycleCamera() { … }` line (~L991) add:

```js
// #10: one heli chase cam, behind and above, looking ahead and down; C does nothing while flying
function flyCamera(dt) { const fx = Math.cos(P.th), fz = Math.sin(P.th); const target = new THREE.Vector3(P.x - fx * HELI.camDist, P.y + HELI.camH, P.z - fz * HELI.camDist); target.y = Math.max(target.y, groundH(target.x, target.z, 1e4) + 5); camPos.lerp(target, 1 - Math.exp(-3 * dt)); camera.position.copy(camPos); camera.lookAt(P.x + fx * 20, P.y - 8, P.z + fz * 20); }
```

In `stepCamera` (~L992-996):
- replace `car.visible = !v.eye && !HUD.carHidden;` with `car.visible = !v.eye && !HUD.carHidden && !FLY.on; heli.visible = FLY.on;`
- replace `  if (v.eye) { const [ex, ey, es] = vehEye(v.k)` with `  if (FLY.on) flyCamera(dt); else if (v.eye) { const [ex, ey, es] = vehEye(v.k)` (the rest of the line unchanged).

- [ ] **Step 9: Race.**
- `startRace` (~L1004): replace `R.jumped = false; R.fast = false;` with `R.jumped = false; R.fast = false; R.flown = false;`.
- `stepRace` (~L1006): replace `if (R.state === 'racing' || R.state === 'armed') { if (best.i >= 0 && bd < 7)` with `if ((R.state === 'racing' || R.state === 'armed') && !FLY.on) { if (best.i >= 0 && bd < 7)`.
- `finish` (~L1007): replace `if (!R.jumped && !R.fast && (R.best === null` with `if (!R.jumped && !R.fast && !R.flown && (R.best === null`.
- `resultHtml` (~L1008): replace `${R.fast ? tr('notCountedFast') : ''}` with `${R.fast ? tr('notCountedFast') : ''}${R.flown ? tr('notCountedHeli') : ''}`.

- [ ] **Step 10: Loop.** In `loop` (~L1104) replace `if (R.state !== 'ready') stepCar(dt); stepRace(dt);` with `if (R.state !== 'ready') { if (FLY.on) stepFly(dt); else stepCar(dt); } stepRace(dt);`.

- [ ] **Step 11: F1 help.** After the line `      <kbd>J</kbd><span data-i18n="keyJump">jump to a landmark</span>` (~L120) add:

```html
      <kbd>F</kbd><span data-i18n="keyHeli">helicopter: take off · land (Space climbs, Shift sinks)</span>
```

- [ ] **Step 12: Run the new tests, watch them pass** (foreground): `test_heli.py` → 9 passed. If a test fails 3 times, STOP and report.

- [ ] **Step 13: Commit and push.**

```bash
git add prototype/index.html
git commit -m "feat(prototype): helicopter mode on F (#10)"
git push
```

---

### Task 5: Full suites, changelog, playtest note

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Full suites** (foreground): `node --test prototype/tests/*.test.mjs` → all pass. Then the whole Playwright suite: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` → all pass, in particular `test_vehicles.py` (golden trace), `test_jump.py`, `test_minimap.py`, `test_smoke.py`, `test_i18n.py` unchanged. `test_rebuilds_free_gpu_memory` is known flaky (#64); re-run it alone once before reporting a failure.

- [ ] **Step 2: CHANGELOG.** Under `## [Unreleased]` → `### Added`, add as the first bullet (player-facing voice; never regenerate the file with `git cliff -o`):

```markdown
- Press **F** to take off in a helicopter and look at the whole region from above: **W**/**S** fly forwards and back, **A**/**D** turn, **Space** climbs, **Shift** sinks. It flies over houses and hills on its own. **F** again lands and puts your car on the nearest road below. In a race the clock keeps running, checkpoints don't count from the air, and the run is not recorded.
```

- [ ] **Step 3: test-todo.** Append a section:

```markdown
## Helicopter mode (#10)

- [ ] **F** during a game: the helicopter climbs to about 120 m and the view gives a real overview (how far can you see before the fog?). Does 120 m feel right?
- [ ] Flying feels controllable: **W**/**S**, **A**/**D**, **Space**/**Shift**; it rides up over the DSM tower and the Bad Säckingen Münster instead of clipping them.
- [ ] **F** again lands on a sensible road below, pointing along it; **R** and **J** while flying also bring the car back.
- [ ] In a race: the clock runs on, no checkpoint is collected from the air, and the result says "with the helicopter, not counted".
- [ ] German: the F1 help line, the toasts and the result text read well.
```

- [ ] **Step 4: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(prototype): changelog and playtest note for helicopter mode (#10)"
git push
```
