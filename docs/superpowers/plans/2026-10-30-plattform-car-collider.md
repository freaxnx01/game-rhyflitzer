# Plattform Sisslerfeld Car Collider Implementation Plan (#567)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The car stops at the Plattform Sisslerfeld's core cylinder instead of driving through it, while on foot the door, the spiral stair and the deck work exactly as today.

**Architecture:** A pure builder `plattformCoreCollider(frame, base)` in `prototype/plattform.js` returns one circle collider (r = `PLATTFORM.core.r`) flagged `carOnly`. `plattformTower()` adds it with `addSolid()`; `footSolids()` skips `carOnly` colliders, so the walker keeps using only the walkway walls of `plattformWalk`.

**Tech Stack:** three.js 0.170 buildless, Node 24 test runner (`node --test`), Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-30-plattform-car-collider-design.md`

**Model routing:** no graphics work; default model for all tasks.

## Global Constraints

- Collider shape: `{ x: frame.x, z: frame.z, hw: r, hd: r, c: 1, s: 0, h: base + PLATTFORM.roof.eaves, circle: r, carOnly: true }` with `r = PLATTFORM.core.r` (1.56). No door gap (the gap is 0.81 m, narrower than any car).
- Added with `addSolid()`, **not** `addOBB()`: no minimap entry (like trees, #131). The three corner-post `addOBB` calls stay as they are.
- `footSolids()` is the only consumer that skips `carOnly`. `collide()`, `heliFloor`, the camera test and `free()` keep reading it.
- No change to `plattformWalk`, `stairTreads`, `PLATTFORM` numbers, or the rendered geometry.
- Memory rule on the agent box: every node/Python/browser command under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`; if it exits 137 or 143, shrink the job, never raise the cap. Use the GPU browser when `PW_CDP_ENDPOINT` is set (the conftest hook does this).
- Browser tests in the foreground only; commit and push the branch before running them. Run only the targeted files listed below, not the full suite.
- Commits: Conventional Commits, English, ending with the session's `Co-Authored-By` line. CHANGELOG entry hand-written, player voice, under `## [Unreleased]` → `### Fixed`, with the go-live time.

## Review Focus

1. **The walker is untouched:** `footSolids()` filters `carOnly`; the walker still enters through the door and reaches the deck (Task 2 Playwright + `test_plattform_stair.py`).
2. **No minimap change:** the core collider goes through `addSolid`, not `addOBB`/`pushOBB`.
3. **All three gaps blocked:** door side (φ 0°) and the two back gaps (120°, 240°) — the door side matters most, since that is where the road and the parking lie.
4. **Smoke test tightened, not loosened:** `test_plattform_tower_blocks_the_car` must now require the stop *before* the ring.

---

## File Structure

| Path | Responsibility |
|---|---|
| `prototype/plattform.js` (modify) | New export `plattformCoreCollider(frame, base, P)`. |
| `prototype/tests/plattform.test.mjs` (modify) | Node tests for the collider. |
| `prototype/index.html` (modify) | Import, `addSolid(plattformCoreCollider(f, b))` in `plattformTower`, `!o.carOnly` in `footSolids`. |
| `prototype/tests/test_plattform_car.py` (new) | Playwright: car stops at the ring from all three gaps; walker walks through the door. |
| `prototype/tests/test_smoke.py` (modify) | Tighter assertion in `test_plattform_tower_blocks_the_car`. |
| `CHANGELOG.md` (modify) | `### Fixed` entry. |

---

### Task 1: `plattformCoreCollider` (pure, node-tested)

**Files:**
- Modify: `prototype/plattform.js`, `prototype/tests/plattform.test.mjs`

**Interfaces:**
- Produces: `plattformCoreCollider(frame, base, P = PLATTFORM) -> { x, z, hw, hd, c, s, h, circle, carOnly }`.

- [ ] **Step 1: Write the failing tests**

In `prototype/tests/plattform.test.mjs`, extend the import from `../plattform.js` with `plattformCoreCollider`, add `import { colliderPush } from '../world.js';` below the other imports, and append:

```js
// #567: the core cylinder is one solid circle for the car; the walker skips it (carOnly) and keeps the walkway walls
test('plattformCoreCollider_Shape_CircleOverTheCoreUpToTheEaves', () => {
  const o = plattformCoreCollider(F, BASE);
  assert.ok(near(o.x, F.x) && near(o.z, F.z), 'centred on the central post');
  assert.equal(o.circle, PLATTFORM.core.r);
  assert.equal(o.hw, PLATTFORM.core.r);
  assert.equal(o.hd, PLATTFORM.core.r);
  assert.equal(o.h, BASE + PLATTFORM.roof.eaves);
  assert.equal(o.carOnly, true);
});

test('plattformCoreCollider_CarCircleAtTheDoor_PushedOutward', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(0, PLATTFORM.core.r + 0.5), hit = colliderPush(o, x, z, 0.9);
  assert.ok(hit, 'the door gap does not let a car in');
  assert.ok(near(hit.pen, 0.4, 1e-9), `pen ${hit.pen}`);
  assert.ok(near(hit.wx, Math.cos(F.facing), 1e-9) && near(hit.wz, Math.sin(F.facing), 1e-9), 'pushed away from the centre');
});

test('plattformCoreCollider_CarCircleNearTheCentre_PushedPastTheRing', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(120, 0.4), hit = colliderPush(o, x, z, 0.9);
  assert.ok(near(hit.pen, PLATTFORM.core.r + 0.9 - 0.4, 1e-9), `pen ${hit.pen}`);
});

test('plattformCoreCollider_CarCircleClearOfTheRing_NoHit', () => {
  const o = plattformCoreCollider(F, BASE), [x, z] = F.polar(240, PLATTFORM.core.r + 0.9 + 0.01);
  assert.equal(colliderPush(o, x, z, 0.9), null);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/plattform.test.mjs`
Expected: FAIL — `plattformCoreCollider` is not exported (SyntaxError on import).

- [ ] **Step 3: Implement**

In `prototype/plattform.js`, after `plattformEntrance`:

```js
// #567: the core cylinder as one solid circle -- the batten ring and the central post inside it -- for the car, the helicopter
// floor and the camera. carOnly: footSolids() skips it, so on foot the walkway walls of plattformWalk (open at the door) still rule.
// No door gap: the gap (2 x door.half at core.r, ~0.81 m) is narrower than any car.
export function plattformCoreCollider(frame, base, P = PLATTFORM) {
  const r = P.core.r;
  return { x: frame.x, z: frame.z, hw: r, hd: r, c: 1, s: 0, h: base + P.roof.eaves, circle: r, carOnly: true };
}
```

- [ ] **Step 4: Run and see them pass**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/plattform.test.mjs`
Expected: all tests PASS (the 4 new ones included).

- [ ] **Step 5: Commit**

```bash
git add prototype/plattform.js prototype/tests/plattform.test.mjs
git commit -m "feat(world): plattformCoreCollider, the core cylinder as a car-only circle

Refs #567"
```

---

### Task 2: Wire the collider in; the walker skips it

**Files:**
- Create: `prototype/tests/test_plattform_car.py`
- Modify: `prototype/index.html`, `prototype/tests/test_smoke.py`

**Interfaces:**
- Consumes: `plattformCoreCollider` (Task 1); hooks `__mm.plattform()`, `__mm.sim`, `__mm.place`, `__mm.setFootY`, `__mm.footSim`.

- [ ] **Step 1: Write the failing Playwright test**

Create `prototype/tests/test_plattform_car.py`:

```python
"""#567: the car stops at the Plattform Sisslerfeld's core cylinder; on foot the door stays open. Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
CORE_R = 1.56   # PLATTFORM.core.r
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


# 15 m out on the gap at phi (degrees from facing), aimed at the centre, 8 m/s with W held; 40 chained 0.1 s steps.
# Returns the closest approach to the centre and the end position along the approach axis (+ = the side it came from).
APPROACH = """([phi]) => { const p = window.__mm.plattform(), t = p.facing + phi * Math.PI / 180;
  let x = p.x + 15 * Math.cos(t), z = p.z + 15 * Math.sin(t), th = t + Math.PI, v = 8, minD = 1e9;
  for (let i = 0; i < 40; i++) { const s = window.__mm.sim(x, z, th, v, 0.1, ['KeyW']); x = s.x; z = s.z; th = s.th; v = s.speed;
    minD = Math.min(minD, Math.hypot(x - p.x, z - p.z)); }
  return { minD, along: (x - p.x) * Math.cos(t) + (z - p.z) * Math.sin(t) }; }"""


@needs_world
def test_car_aimed_at_the_centre_stops_at_the_ring(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        runs = {phi: page.evaluate(APPROACH, [phi]) for phi in (0, 120, 240)}   # the door gap and the two back gaps
        b.close()
    assert errors == []
    for phi, r in runs.items():
        assert r["minD"] > CORE_R + 0.5, (phi, r)   # before #567: 0.37-0.40 m, straight past the central post
        assert r["along"] > 0, (phi, r)             # before #567: -2.03 m, stopped only by the far corner post


@needs_world
def test_walker_walks_through_the_door_into_the_core(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = page.evaluate("() => window.__mm.plattform()")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [plat["x"] + 20, plat["z"]])
        page.keyboard.press("z")
        page.wait_for_timeout(300)
        foot = page.evaluate("""() => { const p = window.__mm.plattform(), t = p.facing;
            window.__mm.place(p.x + 2 * Math.cos(t), p.z + 2 * Math.sin(t), t + Math.PI); window.__mm.setFootY(p.base);
            const f = window.__mm.footSim(0.5, ['KeyW']); return { on: f.on, d: Math.hypot(f.x - p.x, f.z - p.z), dy: f.y - p.base }; }""")
        b.close()
    assert errors == []
    assert foot["on"] is True, foot
    assert foot["d"] < 1.0, foot          # inside the ring (1.56 m); measured 0.47 m before and after #567
    assert abs(foot["dy"]) < 0.1, foot
```

In `prototype/tests/test_smoke.py`, `test_plattform_tower_blocks_the_car`, replace

```python
    assert r["x"] < a["x"], r   # stopped at the tower, not driven through it
```

with

```python
    assert r["x"] < a["x"] - 1.56, r   # #567: stopped at the core cylinder (r 1.56 m), not only by a far corner post
```

- [ ] **Step 2: Run and see the car test fail**

Commit and push the branch first (browser runs can die mid-check). Then:

Run: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_plattform_car.py -x -q`
Expected: `test_car_aimed_at_the_centre_stops_at_the_ring` FAILS with `minD` ≈ 0.39 (the car crosses the centre); the walker test passes.

- [ ] **Step 3: Implement**

In `prototype/index.html` line 605, extend the import:

```js
import { PLATTFORM, plattformFrame, facingToRoad, stairTreads, plattformWalk, plattformEntrance, plattformYard, plattformCoreCollider } from './plattform.js';
```

In `plattformTower()`, replace the central post line

```js
  box(centrePost, apex, centrePost, x, b, z, facing, spruce, timber, [1, 1], 0);   // the central post, no OBB (the walkway wall covers the walker; the car never gets inside the ring)
```

with

```js
  box(centrePost, apex, centrePost, x, b, z, facing, spruce, timber, [1, 1], 0);   // the central post: no collider of its own, it lies inside the core's
  addSolid(plattformCoreCollider(f, b));   // #567: the core cylinder is solid for the car (one circle over ring and post); carOnly, so on foot the walkway walls of plattformWalk still rule
```

In `footSolids` (≈ line 3522), add `!o.carOnly &&` to the filter:

```js
const footSolids = (x, z) => [...gridQuery(OBB_GRID, x, z, WALKER.radius + 2)].filter(o => !o.off && !o.carOnly && !(o.bodenacker6 && INT.bodyOff) && !(o.liftDoor && LIFT_RIDE.doorAt(o.liftDoor) >= 0.9)).concat((FOOT.car ? [parked()] : []));   // #567: carOnly colliders (the Plattform core) are not the walker's
```

- [ ] **Step 4: Run the targeted tests**

```bash
cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/plattform.test.mjs tests/foot.test.mjs && cd ..
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_plattform_car.py prototype/tests/test_plattform_stair.py "prototype/tests/test_smoke.py::test_plattform_tower_blocks_the_car" -q
```

Expected: all PASS. Measured with the trial fix on 2026-10-30: the car ends **2.86 m** from the centre on its own side from all three gaps; the walker reaches **0.47 m** from the centre through the door.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_plattform_car.py prototype/tests/test_smoke.py
git commit -m "fix(world): car stops at the Plattform Sisslerfeld core cylinder

Only the three corner posts had colliders, so the car drove through the
5.7 m gaps and the batten ring. One car-only circle over the core blocks
it; the walker skips carOnly colliders and keeps the walkway walls.

Closes #567"
```

---

### Task 3: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the entry**

Under `## [Unreleased]` → `### Fixed` (create the heading only if it is missing), at the top of the list, with the Swiss local go-live time:

```markdown
- `YYYY-MM-DD HH:MM` The car no longer drives through the **Plattform Sisslerfeld**: it now stops at the slatted core cylinder, from every side. On foot nothing changes, you still walk in through the door and up the spiral stair to the deck.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): car stops at the Plattform Sisslerfeld

Refs #567"
```
