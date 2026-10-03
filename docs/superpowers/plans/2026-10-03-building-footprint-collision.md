# Buildings Collide Where They Are Drawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix #36: the car gets stuck clear of a building because flat-roofed OSM buildings collide as their minimum rotated rectangle, not as their drawn footprint.

**Architecture:** A pure, unit-tested `ringPush(ring, x, z, r)` in `prototype/world.js` (circle vs footprint ring, either winding). `osmBuilding`'s flat path in `prototype/index.html` keeps its rectangle OBB for the broad phase and adds `ring: b.ring`; `collide()` uses `ringPush` for obstacles that carry a ring and keeps the rectangle/circle code byte-identical for everything else. A read-only test hook `__mm.pushAt(x, z)` reports the push a resting car would get. Playwright tests pin both playtest spots and a region-wide sample.

**Tech Stack:** three.js buildless, Node 24 test runner (`node:test`), Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-building-footprint-collision-design.md`

## Global Constraints

- **No pipeline change, no world rebuild.** `data/world_hochrhein.json` (committed) already carries every building's `ring`. Never hand-edit it.
- Only the **flat path** of `osmBuilding` gets a ring (the `addOBB` directly before the function's closing `}`, ~line 545). The gable path (`... addOBB(cx, cz, w, d, rot, base + h); return;`, ~line 539) is drawn as a box of its rectangle and stays as it is.
- In `collide()` the circle and rectangle branches and everything after `pen` is computed (push, `1.25` bounce, speed loss, damage, crash sound) must stay character-for-character the same. The golden trace (`test_golden_trace_of_the_compact_car`, hand layout) must still match to 1e-6.
- Do **not** touch `free()`, `stepCamera`, `addOBB`, `pushOBB` or the pipeline. `free()` is shared with house, hall and tree placement (seeded RNG).
- Tests must not hard-code the car radius: read it from `__mm.vehicle()` (`collision.r * scale`), or use a margin that holds for 1.3 and 1.69 m (#69 changes it).
- Buildless stack: no npm packages, no bundler.
- Browser tests are slow under software rendering (60–120 s per page load). Run them in the **foreground** with a generous timeout; never `run_in_background`. Commit and push before the browser verification.
- Memory-heavy commands on the shared agent box run under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`.

## Review Focus

- **Neutral for everything without a ring:** the only change inside `collide()` is the new leading `if (o.ring) { ... } else` in front of `if (o.circle)`.
- **Ring winding:** OSM rings come in both windings (`extrudeFootprint` reverses them for drawing only; `b.ring` itself is untouched). `ringPush` must not depend on it — the unit test runs both.
- **Test independence:** the region test's sampler reimplements point-in-ring and edge distance in Python; it never calls `ringPush` through the page.

## Measured before the fix (2026-10-03, committed world file)

| Check | Today | With the fix (prototyped) |
|---|---|---|
| Lane repro: travel in 3 s, bearing 151° | 0.05 m | 38.6 m |
| East at `209002925`, z 1365: `x + r` vs drawn wall 1425.47 | 1421.10 (4.4 m short) | 1425.47 |
| Region notch points pushed | 23,353 / 23,353 | 37 / 23,353 |

## File Structure

- `prototype/world.js` — add `ringPush` (pure).
- `prototype/tests/world.test.mjs` — unit tests for `ringPush`.
- `prototype/index.html` — import `ringPush`; flat-path OBB gets `ring`; `collide()` ring branch; `__mm.pushAt` hook.
- `prototype/tests/test_building_collision.py` — new: lane repro, drawn-wall stop, region-wide notch sample.
- `CHANGELOG.md` — one `Fixed` entry under `[Unreleased]`.

---

### Task 1: `ringPush` (pure helper)

**Files:**
- Modify: `prototype/world.js` (append at the end)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- `ringPush(ring: [x, z][], x: number, z: number, r: number) → null | { wx, wz, pen }` — `null` when the circle (centre x, z, radius r) is outside the ring and does not touch it; else the unit vector `(wx, wz)` that pushes the centre out of the footprint and the overlap `pen` (`r − d` from outside, `r + d` from inside, `r` on the wall).

- [ ] **Step 1: Write the failing test**

Add `ringPush` to the import list at the top of `prototype/tests/world.test.mjs` (the `import { makeGrid, ... rowHouseTile } from '../world.js';` line: append `, ringPush` before ` } from`). Append at the end of the file:

```js
// #36: flat OSM buildings collide as their drawn footprint. L-shaped ring: a 20 x 20 square without its top-right 10 x 10
// quarter (its minimum rectangle is the full square, which is what made the car stop in the open)
const L_CCW = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
const L_CW = L_CCW.slice().reverse();

test('ringPush: a circle in the cut-out corner is clear, though the min rect would block it', () => {
  for (const ring of [L_CCW, L_CW]) assert.equal(ringPush(ring, 15, 15, 1.7), null);
});

test('ringPush: a circle that touches a wall from outside is pushed straight out by the overlap', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 15, 11, 1.7);   // 1 m above the inner wall z = 10
    assert.ok(Math.abs(h.wx) < 1e-9 && Math.abs(h.wz - 1) < 1e-9, JSON.stringify(h));
    assert.ok(Math.abs(h.pen - 0.7) < 1e-9, JSON.stringify(h));
  }
});

test('ringPush: a centre inside the footprint is pushed out through the nearest wall, by depth + radius', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 2, 5, 1.7);     // 2 m inside the wall x = 0
    assert.ok(Math.abs(h.wx + 1) < 1e-9 && Math.abs(h.wz) < 1e-9, JSON.stringify(h));
    assert.ok(Math.abs(h.pen - 3.7) < 1e-9, JSON.stringify(h));
  }
});

test('ringPush: a centre exactly on a wall is pushed along that wall\'s outward normal', () => {
  for (const ring of [L_CCW, L_CW]) {
    const h = ringPush(ring, 5, 0, 1.7);     // on the bottom wall z = 0: outward is -z
    assert.ok(Math.abs(h.wx) < 1e-9 && Math.abs(h.wz + 1) < 1e-9, JSON.stringify(h));
    assert.equal(h.pen, 1.7);
  }
});

test('ringPush: far away is clear', () => {
  assert.equal(ringPush(L_CCW, 40, 40, 1.7), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test prototype/tests/`
Expected: FAIL — `SyntaxError: The requested module '../world.js' does not provide an export named 'ringPush'`.

- [ ] **Step 3: Implement**

Append to `prototype/world.js`:

```js
// #36: a circle of radius r against a building footprint ring (either winding). null when it is clear; else the unit push
// (wx, wz) out of the footprint and the overlap pen: r - d from outside, r + d from inside, r with the centre on the wall
export function ringPush(ring, x, z, r) {
  let best = Infinity, px = 0, pz = 0, ex = 0, ez = 0, inside = false, area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    area += ax * bz - bx * az;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * dx / dz) inside = !inside;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, cx = ax + dx * t, cz = az + dz * t, d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 < best) { best = d2; px = cx; pz = cz; ex = dx; ez = dz; }
  }
  const d = Math.sqrt(best);
  if (!inside && d > r) return null;
  if (d < 1e-6) { const L = Math.hypot(ex, ez) || 1, sg = area > 0 ? 1 : -1; return { wx: sg * ez / L, wz: -sg * ex / L, pen: r }; }   // centre on the wall: its outward normal
  const k = inside ? -1 / d : 1 / d;
  return { wx: (x - px) * k, wz: (z - pz) * k, pen: inside ? r + d : r - d };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test prototype/tests/`
Expected: PASS, all `node:test` files (the five new tests included).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): ringPush, a circle against a building footprint (#36)"
```

---

### Task 2: Failing reproduction tests

**Files:**
- Create: `prototype/tests/test_building_collision.py`
- Modify: `prototype/index.html` (test hook only)

**Interfaces:**
- `window.__mm.pushAt(x, z) → { dx, dz }` — the position change `collide(carRadius())` gives a car resting at (x, z). Car position, velocity and damage are restored afterwards.

- [ ] **Step 1: Add the read-only hook** (needed by the region test; it does not change behaviour)

In `prototype/index.html`, directly after the line that starts with `window.__mm.car = () => (`, add:

```js
window.__mm.pushAt = (x, z) => { const keep = [P.x, P.z, P.vx, P.vz, P.dmg]; P.x = x; P.z = z; P.vx = P.vz = 0; collide(carRadius()); const out = { dx: P.x - x, dz: P.z - z }; [P.x, P.z, P.vx, P.vz, P.dmg] = keep; return out; };   // #36: read-only, for the region-wide collider test
```

- [ ] **Step 2: Write the failing tests**

Create `prototype/tests/test_building_collision.py`:

```python
"""#36: flat OSM buildings collide where their walls are drawn, not as their minimum rectangle.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
CLEAR = 2.2   # sample points keep this far from every drawn wall: compact radius 1.69 (1.3 after #69) + 0.5 m


def _world():
    return json.loads(WORLD.read_text(encoding="utf-8"))


def _seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dz * dz
    t = 0 if not l2 else max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
    return math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)


def _ring_dist(ring, x, z):
    return min(_seg_dist(x, z, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring)))


def _inside(ring, x, z):
    c = False
    for i in range(len(ring)):
        (x0, z0), (x1, z1) = ring[i], ring[(i + 1) % len(ring)]
        if (z0 > z) != (z1 > z) and x < x0 + (z - z0) * (x1 - x0) / (z1 - z0):
            c = not c
    return c


def _rect_ring(rect):
    cx, cz, w, d, a = rect; c, s = math.cos(a), math.sin(a)
    return [(cx + c * u * w / 2 - s * v * d / 2, cz + s * u * w / 2 + c * v * d / 2) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def _drawn_from_ring(b):
    """osmBuilding: the gable path draws a box of b.rect; every other building extrudes b.ring."""
    return not (b["roof"] == "gable" and not (b.get("hsrc") == "dsm" and b.get("rh", 9) < 0.6))


def _drawn(b):
    return b["ring"] if _drawn_from_ring(b) else _rect_ring(b["rect"])


def notch_points(world, step=3.0):
    """Points inside a ring building's minimum rectangle that are clear of every drawn footprint by CLEAR metres."""
    cell, grid = 64, {}
    for b in world["buildings"]:
        xs, zs = zip(*_rect_ring(b["rect"]))
        for i in range(int(min(xs) // cell) - 1, int(max(xs) // cell) + 2):
            for j in range(int(min(zs) // cell) - 1, int(max(zs) // cell) + 2):
                grid.setdefault((i, j), []).append(b)
    pts = []
    for b in world["buildings"]:
        if not _drawn_from_ring(b):
            continue
        cx, cz, w, d, a = b["rect"]; c, s = math.cos(a), math.sin(a)
        for u in [k * step - w / 2 for k in range(int(w // step) + 1)]:
            for v in [k * step - d / 2 for k in range(int(d // step) + 1)]:
                x, z = cx + c * u - s * v, cz + s * u + c * v
                near = grid.get((int(x // cell), int(z // cell)), [])
                if all(not _inside(_drawn(o), x, z) and _ring_dist(_drawn(o), x, z) > CLEAR for o in near):
                    pts.append([round(x, 2), round(z, 2)])
    return pts


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


@needs_world
def test_lane_between_two_buildings_is_drivable(server):
    """Second playtest repro (2026-10-03, debug panel): x -1392.0, z -466.9, bearing 151 deg, between 91591385 and
    718216439. Their walls are 7.99 m apart but their rectangles only 2.54 m: the car stood still at full gas."""
    th = math.atan2(-math.cos(math.radians(151)), math.sin(math.radians(151)))   # inverse of bearing() in index.html
    with sync_playwright() as p:
        b, page = open_world(p, server)
        r = page.evaluate(f"() => window.__mm.sim(-1392.0, -466.9, {th}, 0, 3)")
        b.close()
    assert math.hypot(r["x"] + 1392.0, r["z"] + 466.9) > 20, r   # today 0.05 m; free driving ~38 m


@needs_world
def test_car_stops_at_the_drawn_wall(server):
    """First repro (#36, towards Bahnhof Sisseln): the long low building 209002925. Driving east at its west wall the
    car must stop with its collision circle on the drawn wall, not metres in front of it (today 4.4 m short)."""
    bld = next(x for x in _world()["buildings"] if x["id"] == 209002925)
    z0 = 1365.0
    ring = bld["ring"]
    wall = min(x0 + (z0 - za) * (x1 - x0) / (z1 - za)
               for (x0, za), (x1, z1) in zip(ring, ring[1:] + ring[:1]) if (za > z0) != (z1 > z0))
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rad = page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")
        r = page.evaluate(f"() => window.__mm.sim(1410, {z0}, 0, 0, 4)")
        b.close()
    assert r["speed"] < 1, r
    assert abs(r["x"] + rad - wall) < 0.3, (r, rad, wall)


@needs_world
def test_no_invisible_building_colliders_region_wide(server):
    """Region-wide: a car resting in the open part of any building's rectangle, clear of every drawn wall, is not
    pushed. Today all 23,353 such points are (559 buildings reach > 1 m beyond their walls). A lamp post or another
    small solid prop may stand at a few of them, hence the 1 % tolerance (0.16 % measured with the fix)."""
    pts = notch_points(_world())
    assert len(pts) > 10000, len(pts)
    with sync_playwright() as p:
        b, page = open_world(p, server)
        pushed = page.evaluate("(pts) => pts.filter(([x, z]) => { const d = window.__mm.pushAt(x, z); return Math.hypot(d.dx, d.dz) > 0.01; }).length", pts)
        b.close()
    assert pushed < 0.01 * len(pts), (pushed, len(pts))
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (foreground, generous timeout): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_building_collision.py -v`
Expected: all three FAIL —
- `test_lane_between_two_buildings_is_drivable`: travel ≈ 0.05 m.
- `test_car_stops_at_the_drawn_wall`: `r["x"] + rad` ≈ 1421.1 vs wall ≈ 1425.47.
- `test_no_invisible_building_colliders_region_wide`: pushed = 23,353 of 23,353.

If one of them passes already, STOP: the world file or the collision code differs from what this plan measured; report the numbers.

- [ ] **Step 4: Commit and push** (red tests on the feature branch, before the slow verification of Task 3)

```bash
git add prototype/index.html prototype/tests/test_building_collision.py
git commit -m "test(collision): reproduce the invisible building walls (#36)"
git push
```

---

### Task 3: Collide flat buildings against their ring

**Files:**
- Modify: `prototype/index.html`

- [ ] **Step 1: Import the helper.** In the `import { makeGrid, gridAdd, ... rowHouseTile } from './world.js';` line (~line 203), append `, ringPush` before ` } from './world.js';`.

- [ ] **Step 2: Give the flat path its ring.** In `osmBuilding`, replace the **last** line of the function (the flat path, directly before the closing `}`):

```js
  addOBB(cx, cz, w, d, rot, base + h);
```

with:

```js
  pushOBB({ x: cx, z: cz, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), h: base + h, ring: b.ring });   // #36: walls drawn from the ring collide as the ring; the rectangle stays for the grid, free() and the camera
```

Leave the gable path's `addOBB(cx, cz, w, d, rot, base + h); return;` alone.

- [ ] **Step 3: Ring branch in `collide()`.** In `function collide(r)` (~line 992) replace exactly

```js
let wx, wz, pen; if (o.circle) {
```

with

```js
let wx, wz, pen; if (o.ring) { const hit = ringPush(o.ring, P.x, P.z, r); if (!hit) continue; ({ wx, wz, pen } = hit); } else if (o.circle) {
```

Nothing else in `collide()` changes. (If #6 has landed and `collide` is split into `collideCircle(px, pz, r)`, make the same edit there with `px, pz` instead of `P.x, P.z`.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run (foreground): `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_building_collision.py -v`
Expected: PASS (measured with the prototype: lane 38.6 m, wall within 0.01 m, 37 of 23,353 points pushed).

- [ ] **Step 5: Run the full suite**

Run: `node --test prototype/tests/` and (foreground, long timeout) `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests -q`
Expected: all pass; `test_golden_trace_of_the_compact_car` unchanged (hand layout, no rings). A failure in an OSM smoke test where the car now drives somewhere it used to stop is a consequence of this fix: investigate with superpowers:systematic-debugging and report old and new numbers; do not re-record an expectation without saying why. If the same test fails 3 times, STOP and report.

- [ ] **Step 6: Commit**

```bash
git add prototype/index.html
git commit -m "fix(collision): flat buildings collide as their drawn footprint (#36)"
```

---

### Task 4: Changelog and manual check

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]`, in `### Fixed` (create the subsection after `### Added`/`### Changed` if it does not exist yet), add:

```markdown
- The car no longer gets stuck next to a building it isn't touching. Buildings with an L-shaped or slanted outline used to block a whole invisible rectangle around them — on the grass beside a long low building near Sisseln, or in a narrow lane between two houses in Bad Säckingen. Now the car stops at the wall you see.
```

- [ ] **Step 2: Manual playtest** (`python3 -m http.server 8000`, open `http://localhost:8000/prototype/`): page loads with an empty console; press **F3** for the debug panel; drive into the lane at x −1392, z −467 (Bad Säckingen) and along the west side of the long low building at x ≈ 1422, z ≈ 1345–1400 near Sisseln; the car passes, and stops only on visible walls. Drive into a courtyard of a U-shaped building.

- [ ] **Step 3: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): buildings collide where they are drawn (#36)"
git push
```
