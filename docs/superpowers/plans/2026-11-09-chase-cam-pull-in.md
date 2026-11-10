# Chase camera: smooth obstacle pull-in (#777) — Implementation Plan

> **For agentic workers:** implement task by task, TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a handbrake donut next to a building the chase camera eases in, holds, and never jumps more than
~0.3 m per frame, while it still keeps out of walls.

**Architecture:** The step-wise pull-in loop in `stepCamera` (`index.html`) is replaced by a continuous pull fraction:
a fine search for the free fraction (`clearFraction`), a look-ahead along the car's yaw rate (`aheadHeadings`), and an
eased, held state (`pullStep`). The three helpers are pure and live in `camera.js` next to `droneSway`; `stepCamera`
keeps only the OBB point test.

**Tech stack:** buildless browser game, vanilla ES modules, `node --test` for pure modules, Playwright (Python) for the
browser test.

**Spec:** `docs/superpowers/specs/2026-11-09-chase-cam-pull-in-design.md` (measurements and root cause).

## Global constraints

- **Anchor every `index.html` edit on code text, not line numbers** — #735 (car radio) edits `index.html` in parallel.
  Line numbers below are as of `bf063f2` and for orientation only.
- Run every browser command in the foreground, under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`, and only the targeted test files named here.
  Do **not** run the full Playwright suite, and do not load the full OSM world (it is OOM-killed under the 2G cap).
- Commit and push the branch before starting a browser verification.
- Do not change the camera's position lerp (rate 6), the drone view, the eye views or the look-back snap behaviour.

## File structure

| File | Change |
|---|---|
| `camera.js` | add `PULL`, `clearFraction`, `aheadHeadings`, `pullStep` |
| `tests/camera.test.mjs` | unit tests for the three helpers |
| `index.html` | import the helpers; `CAM` gains `pull` and `th`; replace the pull-in loop in `stepCamera`; `__mm.camPull` |
| `tests/test_chase_pull_in.py` | new: donut next to a building at 20 and 60 fps; parked with the back to a wall |
| `CHANGELOG.md` | player-facing entry under `[Unreleased]` → `### Fixed` |

---

### Task 1: Failing browser test — the donut next to a building

**Files:** Create `tests/test_chase_pull_in.py`

- [ ] **Step 1: Write the failing test**

```python
"""#777: during a handbrake donut next to a building the chase camera eases in and holds instead of pumping in and out once
per spin; it never jumps more than ~0.3 m in a frame and never sits inside the building.
Hand-traced layout (world + terrain blocked, see test_carselect.open_page): the start position's nearest solid is a
40 x 12 m block, 18 m high. Slow (Playwright): run in the foreground."""
import math

import pytest
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

MAX_JUMP_DIST_M = 0.35   # per frame, horizontal distance car -> camera (the open-ground lerp alone reaches 0.29 at 20 fps)
MAX_JUMP_H_M = 0.3       # per frame, camera height over the car
PULLED_IN_M = 5.0        # the donut must actually bring the camera closer than this, or the building was never in play
WALL_MARGIN_M = 0.3      # the camera counts as inside the block within this margin of its walls

# Place the car `gap` m off the block's local +x face, heading `th`; 25 m/s for 0.1 s, 0.75 s of handbrake + full left
# lock, 20 settling camera steps, then `secs` of handbrake + left + gas. Per frame: one car step, one camera step.
DONUT_JS = """([dt, gap, face, secs, margin]) => { const m = window.__mm, q = m.carPose().pos, o = m.nearestSolid(q[0], q[2]);
  const sx = o.x + o.c * (o.hw + gap), sz = o.z + o.s * (o.hw + gap), th = Math.atan2(o.s, o.c) + face;
  m.place(sx, sz, th); m.sim(sx, sz, th, 25, 0.1, ['KeyW']); m.step(0.75, ['ControlLeft', 'KeyA'], dt);
  for (let i = 0; i < 20; i++) m.camStep(dt);
  const inside = (x, y, z) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    return Math.abs(lx) < o.hw + margin && Math.abs(lz) < o.hd + margin && y < o.h; };
  const rows = []; for (let i = 0; i < secs / dt; i++) { m.step(dt, ['ControlLeft', 'KeyA', 'KeyW'], dt); const c = m.camStep(dt), p = m.carPose().pos;
    rows.push({ d: Math.hypot(c.d[0], c.d[2]), y: c.d[1], inside: inside(p[0] + c.d[0], p[1] + c.d[1], p[2] + c.d[2]) }); }
  return { block: o, rows }; }"""


def jumps(rows):
    return (max(abs(b["d"] - a["d"]) for a, b in zip(rows, rows[1:])),
            max(abs(b["y"] - a["y"]) for a, b in zip(rows, rows[1:])))


@pytest.mark.parametrize("dt", [1 / 20, 1 / 60], ids=["20fps", "60fps"])
def test_donut_next_to_a_building_moves_the_camera_smoothly(server, dt):
    """Measured on bf063f2: 1.24 m / 1.23 m jumps at 20 fps, 0.43 / 0.45 m at 60 fps, swinging between 7.8 m / 2.6 m and
    2.9 m / 8.2 m once per spin. The car starts 2 m off the wall, facing it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        run = page.evaluate(DONUT_JS, [dt, 2.0, math.pi, 4.0, WALL_MARGIN_M])
        b.close()
    rows = run["rows"]
    jump_d, jump_h = jumps(rows)
    assert run["block"]["hw"] == 20 and run["block"]["hd"] == 6, run["block"]   # the hand layout's block next to the start
    assert min(r["d"] for r in rows) < PULLED_IN_M, rows                          # the building was in play
    assert jump_d <= MAX_JUMP_DIST_M, (jump_d, rows)
    assert jump_h <= MAX_JUMP_H_M, (jump_h, rows)
    assert not any(r["inside"] for r in rows), [i for i, r in enumerate(rows) if r["inside"]]
    assert not errors, errors
```

- [ ] **Step 2: Run it and watch it fail**

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  python3 -m pytest tests/test_chase_pull_in.py -x -q
```

Expected: both cases FAIL on `jump_d` (≈ 1.24 at 20 fps, ≈ 0.43 at 60 fps). If `min(d) < 5` fails instead, the car did
not reach the wall — stop and report; do not change the placement to make the test pass.

- [ ] **Step 3: Commit**

```bash
git add tests/test_chase_pull_in.py
git commit -m "test(camera): donut next to a building must not pump the chase cam (#777)"
```

---

### Task 2: Guard — parked with the back to a wall, the camera stays in front of it

**Files:** Modify `tests/test_chase_pull_in.py`

This guards the clipping the old loop prevented. It passes on `main` today and must still pass after Task 4.

- [ ] **Step 1: Add the test**

```python
# The car stands `gap` m off the block's +x face, facing away from it: the ideal chase spot (7 m back) is inside the block.
PARKED_JS = """([gap, margin]) => { const m = window.__mm, q = m.carPose().pos, o = m.nearestSolid(q[0], q[2]);
  const sx = o.x + o.c * (o.hw + gap), sz = o.z + o.s * (o.hw + gap), th = Math.atan2(o.s, o.c);
  m.place(sx, sz, th); m.step(0.1, [], 1 / 60); let c = null; for (let i = 0; i < 240; i++) c = m.camStep(1 / 60);
  const p = m.carPose().pos, x = p[0] + c.d[0], y = p[1] + c.d[1], z = p[2] + c.d[2], dx = x - o.x, dz = z - o.z;
  const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
  return { d: Math.hypot(c.d[0], c.d[2]), y: c.d[1], inside: Math.abs(lx) < o.hw + margin && Math.abs(lz) < o.hd + margin && y < o.h }; }"""


def test_parked_with_the_back_to_a_wall_the_camera_stays_in_front_of_it(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        cam = page.evaluate(PARKED_JS, [3.0, WALL_MARGIN_M])
        b.close()
    assert cam["inside"] is False, cam
    assert cam["d"] < 3.0, cam                 # pulled in to the free strip between car and wall
    assert cam["y"] < 6.0, cam                 # no bird's-eye view
    assert not errors, errors
```

- [ ] **Step 2: Run it**

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  python3 -m pytest "tests/test_chase_pull_in.py::test_parked_with_the_back_to_a_wall_the_camera_stays_in_front_of_it" -q
```

Expected: PASS on the current code except possibly `y < 6.0` (the old loop rises up to +9.6 m). If only the height
assertion fails, that is expected before Task 4 — note it and continue. Any other failure: stop and report.

- [ ] **Step 3: Commit**

```bash
git add tests/test_chase_pull_in.py
git commit -m "test(camera): parked against a wall the chase cam stays out of it (#777)"
```

---

### Task 3: Pure pull-in helpers in `camera.js`

**Files:** Modify `camera.js`, `tests/camera.test.mjs`

**Interfaces:**

```js
export const PULL;                                   // tuning constants
export function clearFraction(blocked, cfg = PULL)   // blocked(t) -> bool; returns t in [cfg.min, 1]
export function aheadHeadings(th, yawRate, cfg = PULL) // -> number[] of headings to check
export function pullStep(state, need, dt, cfg = PULL)  // state { pull, hold } -> new { pull, hold }
```

- [ ] **Step 1: Write the failing unit tests** — append to `tests/camera.test.mjs`, and extend its import line to
  `import { DRONE, droneSway, PULL, clearFraction, aheadHeadings, pullStep } from '../camera.js';`

```js
test('PULL: the agreed pull-in constants (#777)', () => {
  assert.deepEqual(PULL, { min: 0.2, inRate: 1.0, outRate: 0.4, hold: 1.5, rise: 2.5, lookAhead: 0.6, samples: 4, maxYawRate: 12, still: 0.05 });
});

test('clearFraction: 1 when the ideal spot is free', () => {
  assert.equal(clearFraction(() => false), 1);
});

test('clearFraction: finds the wall to within 2 cm, approaching from outside', () => {
  const wall = 0.537;   // points farther out than this are inside the solid
  const t = clearFraction((x) => x > wall);
  assert.ok(t <= wall && wall - t < 0.02, `t ${t}`);
});

test('clearFraction: the floor when nothing is free', () => {
  assert.equal(clearFraction(() => true), PULL.min);
});

test('clearFraction: continuous -- a wall moving 1 cm moves the result less than 3 cm', () => {
  for (let w = 0.25; w < 0.99; w += 0.01) {
    const a = clearFraction((x) => x > w), b = clearFraction((x) => x > w + 0.01);
    assert.ok(Math.abs(b - a) < 0.03, `w ${w}: ${a} -> ${b}`);
  }
});

test('aheadHeadings: one heading when the car is not turning', () => {
  assert.deepEqual(aheadHeadings(1.2, 0), [1.2]);
  assert.deepEqual(aheadHeadings(1.2, PULL.still / 2), [1.2]);
});

test('aheadHeadings: spinning, samples from now to lookAhead seconds ahead, yaw rate clamped', () => {
  const h = aheadHeadings(0, 2);
  assert.equal(h.length, PULL.samples + 1);
  assert.equal(h[0], 0);
  assert.ok(Math.abs(h[h.length - 1] - 2 * PULL.lookAhead) < 1e-12);
  const fast = aheadHeadings(0, -100);
  assert.ok(Math.abs(fast[fast.length - 1] + PULL.maxYawRate * PULL.lookAhead) < 1e-12);
});

test('pullStep: pulls in at most inRate per second, and re-arms the hold', () => {
  const s = pullStep({ pull: 1, hold: 0 }, 0.3, 0.05);
  assert.ok(Math.abs(s.pull - (1 - PULL.inRate * 0.05)) < 1e-12);
  assert.equal(s.hold, PULL.hold);
  assert.equal(pullStep({ pull: 0.32, hold: 0 }, 0.3, 0.05).pull, 0.3);   // never past the need
});

test('pullStep: holds while the hold runs, then eases out at outRate, never past the need', () => {
  let s = { pull: 0.4, hold: PULL.hold };
  for (let t = 0; t < PULL.hold - 0.1; t += 0.05) s = pullStep(s, 1, 0.05);
  assert.equal(s.pull, 0.4);
  for (let i = 0; i < 4; i++) s = pullStep(s, 1, 0.05);
  assert.ok(s.pull > 0.4 && s.pull <= 0.4 + PULL.outRate * 0.05 * 3 + 1e-12, `pull ${s.pull}`);   // 2 or 3 steps out, by float rounding of the hold
  for (let i = 0; i < 200; i++) s = pullStep(s, 0.9, 0.05);
  assert.equal(s.pull, 0.9);
});

test('pullStep: per-step change bounded at any dt up to the loop clamp', () => {
  for (const dt of [1 / 60, 1 / 30, 0.05]) {
    let s = { pull: 1, hold: 0 }, prev = 1;
    for (let i = 0; i < 400; i++) { s = pullStep(s, i % 40 < 20 ? 0.2 : 1, dt); assert.ok(Math.abs(s.pull - prev) <= PULL.inRate * dt + 1e-12); prev = s.pull; }
  }
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
node --test tests/camera.test.mjs
```

Expected: FAIL — `PULL` / `clearFraction` / `aheadHeadings` / `pullStep` are not exported.

- [ ] **Step 3: Implement** — append to `camera.js`:

```js
// #777: the chase cam's obstacle pull-in, eased, held and looking ahead (the old step loop snapped by up to 1.2 m a frame).
// pull is the fraction of the chase distance the camera keeps; min: the closest it gets; inRate / outRate: 1/s;
// hold: s the camera stays in after the last closer need; rise: m of extra height at pull 0; lookAhead: s of the spin
// checked ahead; samples: steps over that window; maxYawRate: rad/s clamp; still: rad/s under which only now is checked
export const PULL = { min: 0.2, inRate: 1.0, outRate: 0.4, hold: 1.5, rise: 2.5, lookAhead: 0.6, samples: 4, maxYawRate: 12, still: 0.05 };

// blocked(t): is the camera point at fraction t of the chase distance inside a solid? Returns the largest free t,
// searching inward from the ideal spot (0.05 scan, then 5 bisection steps), or cfg.min when nothing is free.
export function clearFraction(blocked, cfg = PULL) {
  if (!blocked(1)) return 1;
  let hi = 1, lo = null;
  for (let t = 0.95; t >= cfg.min - 1e-9; t -= 0.05) { if (!blocked(t)) { lo = t; break; } hi = t; }
  if (lo === null) return cfg.min;
  for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m; }
  return lo;
}

// the headings to check: now and, for a turning car, where it will point within cfg.lookAhead s
export function aheadHeadings(th, yawRate, cfg = PULL) {
  if (Math.abs(yawRate) < cfg.still) return [th];
  const w = Math.max(-cfg.maxYawRate, Math.min(cfg.maxYawRate, yawRate)), out = [];
  for (let k = 0; k <= cfg.samples; k++) out.push(th + w * cfg.lookAhead * k / cfg.samples);
  return out;
}

// state { pull, hold } -> next state: in towards a closer need at cfg.inRate, re-arming the hold; out towards a farther
// need at cfg.outRate only once the hold has run out
export function pullStep(state, need, dt, cfg = PULL) {
  if (need < state.pull) return { pull: Math.max(need, state.pull - cfg.inRate * dt), hold: cfg.hold };
  const hold = state.hold - dt;
  if (hold > 0) return { pull: state.pull, hold };
  return { pull: Math.min(need, state.pull + cfg.outRate * dt), hold: 0 };
}
```

- [ ] **Step 4: Run all node tests**

```bash
node --test tests/*.test.mjs
```

Expected: all PASS (`clearFraction` continuity: the bisection resolves 0.05 / 32 ≈ 1.6 mm, far under the 3 cm bound).

- [ ] **Step 5: Commit**

```bash
git add camera.js tests/camera.test.mjs
git commit -m "feat(camera): pure eased pull-in helpers for the chase cam (#777)"
```

---

### Task 4: Use the helpers in `stepCamera`

**Files:** Modify `index.html`

- [ ] **Step 1: Import** — find the line

```js
import { DRONE, droneSway, footView } from './camera.js';
```

and replace it with

```js
import { DRONE, droneSway, footView, PULL, clearFraction, aheadHeadings, pullStep } from './camera.js';
```

- [ ] **Step 2: Camera state** — find

```js
const CAM = { back: false, t: 0, aim: new THREE.Vector3(), aiming: false };
```

and replace that statement (keep the trailing comment, append to it) with

```js
const CAM = { back: false, t: 0, aim: new THREE.Vector3(), aiming: false, pull: { pull: 1, hold: 0 }, th: 0 };
```

appending `; #777: pull = the chase cam's eased obstacle pull-in (camera.js pullStep), th = last frame's heading for the yaw rate`
to the existing `//` comment on that line.

- [ ] **Step 3: Replace the pull-in loop** — in `function stepCamera(dt)`, find this exact text (one line in the file):

```js
const under = caveInside(), test = (t) => { const tx = P.x - bx * dist * t, tz = P.z - bz * dist * t; for (const o of gridQuery(OBB_GRID, tx, tz, 1)) { if (o.bridge || (under && !o.secret) || (o.liftDoor && LIFT_RIDE.doorAt(o.liftDoor) >= 0.9)) continue; const dx = tx - o.x, dz = tz - o.z; const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + 0.8 && Math.abs(lz) < o.hd + 0.8 && P.y + h * t < o.h) return true; } return false; }; for (let t = 1; t > 0.25; t -= 0.1) { if (test(t)) { dist *= (t - 0.1); h += 1.2; } else break; }
```

and replace it with

```js
const under = caveInside(), blockedAt = (ux, uz) => (t) => { const tx = P.x - ux * dist * t, tz = P.z - uz * dist * t, ty = P.y + (h + (1 - t) * PULL.rise) * t; for (const o of gridQuery(OBB_GRID, tx, tz, 1)) { if (o.bridge || (under && !o.secret) || (o.liftDoor && LIFT_RIDE.doorAt(o.liftDoor) >= 0.9)) continue; const dx = tx - o.x, dz = tz - o.z; const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + 0.8 && Math.abs(lz) < o.hd + 0.8 && ty < o.h) return true; } return false; }; const dth = P.th - CAM.th, yaw = dt > 0 ? Math.atan2(Math.sin(dth), Math.cos(dth)) / dt : 0; CAM.th = P.th; const need = Math.min(...aheadHeadings(P.th, yaw).map((a) => clearFraction(blockedAt(Math.cos(a) * s, Math.sin(a) * s)))); CAM.pull = snap ? { pull: need, hold: PULL.hold } : pullStep(CAM.pull, need, dt); dist *= CAM.pull.pull; h += (1 - CAM.pull.pull) * PULL.rise;   // #777: eased, held, looking ahead along the spin -- the old step loop snapped up to 1.2 m a frame
```

Everything after it on that line (`const target = new THREE.Vector3(P.x - bx * dist, …`) stays unchanged. `s` is the
existing look-back sign (`back ? -1 : 1`), `snap` the existing look-back snap flag; both are already in scope.

- [ ] **Step 4: Debug hook** — directly after the line that starts with `window.__mm.camStep = (dt, from) =>`, add

```js
window.__mm.camPull = () => ({ ...CAM.pull });   // #777: the chase cam's eased pull-in state, read-only, for the test
```

- [ ] **Step 5: Run the node tests and the targeted browser tests**

```bash
node --test tests/*.test.mjs
git push -u origin HEAD   # push before the browser run
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  python3 -m pytest tests/test_chase_pull_in.py tests/test_look_back.py tests/test_drone.py tests/test_handbrake_wheels.py -q
```

Expected: all PASS. The prototype of this design measured 0.31 m / 0.15 m (20 fps) and 0.12 m / 0.05 m (60 fps), no
frame inside the block. `tests/test_hideout.py` needs the full world (`needs_world`) and is left to CI — do not run it
locally under the 2G cap.

If `test_donut_next_to_a_building_moves_the_camera_smoothly[20fps]` lands just over 0.35 m, do **not** raise the
threshold: lower `PULL.inRate` in steps of 0.1 (not below 0.8) and re-run; at 0.8 the prototype measured 0.26 m but
6 frames inside the block without look-ahead, so check `inside` stays empty. After 3 attempts, stop and report.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix(camera): ease the chase cam's pull-in next to buildings (#777)"
```

---

### Task 5: CHANGELOG

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Fixed`, add a new entry at the **top** of the list (entries are newest
  first, each stamped with the Swiss local time it goes live, `TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`), followed by a
  blank line before the next entry:

```markdown
- `YYYY-MM-DD HH:MM` During a **handbrake donut next to a building** the camera no longer **pumps in and out** and up to a high view on every spin: it now glides in smoothly, stays close while the wall is near, and only then eases back out.
```

Keep one blank line between this entry and the next one. Do not regenerate the file with `git cliff`.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): smooth chase cam next to buildings (#777)"
```

---

## Acceptance check

- [ ] `node --test tests/*.test.mjs` passes.
- [ ] `tests/test_chase_pull_in.py` passes at 20 and 60 fps; it failed before Task 4.
- [ ] `tests/test_look_back.py`, `tests/test_drone.py`, `tests/test_handbrake_wheels.py` pass.
- [ ] The CHANGELOG entry is at the top of `[Unreleased]` → `### Fixed`.
