# Solid Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The car can no longer drive through trees: every tree has a solid trunk that stops the car like a lamp post does, without blocking any road.

**Architecture:** A pure helper `treeCollider(x, z, h, base)` in `prototype/world.js` builds one circle collider per tree in the object shape `collide()` already understands (`circle`, like the Smile-Kreisel island). `prototype/index.html` inserts these into `OBB_GRID` only (new `addSolid`, split out of `pushOBB`), right after the tree placement loop, so neither the minimap (which draws the `OBB` array) nor the tree placement (`free()`) sees them. No change to `collide()`, `heliFloor` or the camera.

**Tech Stack:** Vanilla JS (ES modules), three.js, `node --test`, pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-08-solid-trees-design.md` (issue #131).

## Global Constraints

- Collider radius `treeTrunkR(h) = 0.06 · h` (trunk, not canopy). Top of the collider = `terrainH(x, z) + h`.
- Trees go into `OBB_GRID` **only**, never into the `OBB` array (the minimap draws `OBB` as buildings, `prototype/index.html:1395`).
- Register trees **after** the placement loop (`prototype/index.html:1020`), never inside it — inside, `free()` would see earlier trees and thin out every forest.
- `collide()`, `heliFloor` (`prototype/heli.js:19`) and the chase-camera test (`prototype/index.html:1313`) stay unchanged.
- Buildless static game: no new packages, no framework (CLAUDE.md).
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest … -q -p no:cacheprovider`. Commit and push before long verification.

## Review Focus

1. **Forest density.** Expected: the number of trees is unchanged, because registration is after the loop. Pinned by `test_smoke.py`'s tree tests (`len(trees) > 1000`) run in Task 2 Step 7; a reviewer should check the `addSolid` loop sits after the `for (let i = 0; i < 9000; …)` loop.
2. **Minimap.** Expected: no tree squares on the minimap — trees never enter `OBB`. Pinned by code review of Task 2 Step 3 (`addSolid`, not `pushOBB`).
3. **Roads stay drivable.** Expected: no tree collider reaches a car on a road. Pinned by `test_no_tree_reaches_a_road` (Task 2).
4. **Building-collision region test.** Expected: still green unchanged — trees keep `3 + hypot(hw, hd)` from every building centre. Pinned by running `test_building_collision.py` in Task 2 Step 7.
5. **Helicopter over forests.** Expected: the floor rises to crown top + 10 m near trees, like over lamps; no code change. Pinned by the existing `test_heli.py` run in Task 2 Step 7.

---

### Task 1: Pure tree-collider helpers

**Files:**
- Modify: `prototype/world.js` (append after `ringPush`, ~line 375)
- Test: `prototype/tests/world.test.mjs` (extend the import on line 3, append tests)

**Interfaces:**
- Produces: `export const TREE_TRUNK = 0.06`; `export function treeTrunkR(h): number`; `export function treeCollider(x, z, h, base): { x, z, hw, hd, c: 1, s: 0, h, circle, tree: true }`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests.** Add `TREE_TRUNK, treeTrunkR, treeCollider` to the `import { … } from '../world.js'` list on line 3 of `prototype/tests/world.test.mjs`, then append:

```js
test('treeTrunkR_TreeHeight_ScalesWithTheTrunkNotTheCrown', () => {
  assert.equal(TREE_TRUNK, 0.06);
  assert.ok(Math.abs(treeTrunkR(6) - 0.36) < 1e-9);
  assert.ok(Math.abs(treeTrunkR(12) - 0.72) < 1e-9);
  assert.ok(treeTrunkR(12) < 0.45 * 12 / 4, 'far inside the crown (0.45 h)');
});

test('treeCollider_TreeOnTerrain_IsACircleAtTheTrunkUpToTheCrownTop', () => {
  const o = treeCollider(100, -50, 10, 4);
  const r = treeTrunkR(10);
  assert.deepEqual(o, { x: 100, z: -50, hw: r, hd: r, c: 1, s: 0, h: 14, circle: r, tree: true });
});
```

- [ ] **Step 2: Run them to see them fail.** Run (repo root): `node --test prototype/tests/world.test.mjs`
Expected: FAIL — `TREE_TRUNK` / `treeTrunkR` / `treeCollider` are not exported.

- [ ] **Step 3: Implement.** Append to `prototype/world.js` after `ringPush`:

```js
// #131: trees are solid at the trunk, not the crown -- one circle per tree, in the shape collide() already reads
// (circle, like the Smile-Kreisel island); hw/hd = r so the coarse bounds, heliFloor and the camera box test work as is.
// Billboard trunks are ~0.04 h wide in radius, the cone style's ~0.14 h: one value in between for both styles.
export const TREE_TRUNK = 0.06;
export function treeTrunkR(h) { return TREE_TRUNK * h; }
export function treeCollider(x, z, h, base) { const r = treeTrunkR(h); return { x, z, hw: r, hd: r, c: 1, s: 0, h: base + h, circle: r, tree: true }; }
```

- [ ] **Step 4: Run all node tests.** Run: `node --test prototype/tests/`
Expected: PASS, all files.

- [ ] **Step 5: Commit.**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): tree trunk collider helper (#131)"
```

---

### Task 2: Register tree colliders and prove the car stops at a trunk

**Files:**
- Modify: `prototype/index.html:241` (import), `:622` (`pushOBB` → `addSolid`), after `:1020` (register trees), next to `window.__mm.treesOnRail` (`:1256`) (two hooks)
- Create: `prototype/tests/test_tree_collision.py`

**Interfaces:**
- Produces: `addSolid(o)` (grid-only insert into `OBB_GRID`); `window.__mm.treeTrunkR(h): number`; `window.__mm.treesOnRoad(): number` (trees whose collider can touch a car whose centre is on a road).
- Consumes: `treeTrunkR`, `treeCollider` from Task 1; existing `window.__TREES`, `window.__mm.pushAt(x, z, y?)`, `window.__mm.sim(x, z, th, v, secs)`, `window.__mm.vehicle()`, `roadDist`, `carRadius`, `terrainH`.

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/test_tree_collision.py`:

```python
"""#131: trees are solid at the trunk, like lamp posts; they never reach a road.
Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

# isolated trees: no other tree within 6 m, so a push comes from this trunk alone
ISOLATED_JS = """(n) => {
  const T = window.__TREES, out = [];
  for (let i = 0; i < T.length && out.length < n; i += 7) {
    const [x, z, h] = T[i];
    if (T.some(([u, v], j) => j !== i && Math.hypot(u - x, v - z) < 6)) continue;
    out.push([x, z, h, window.__mm.treeTrunkR(h)]);
  }
  return out;
}"""

# first tree with 25 m of open ground to its west: pushAt finds nothing on the approach line
APPROACH_JS = """(rc) => {
  for (const [x, z, h] of window.__TREES) {
    const rt = window.__mm.treeTrunkR(h); let clear = true;
    for (let px = x - 25; px <= x - rc - rt - 0.3 && clear; px += 1) { const d = window.__mm.pushAt(px, z); clear = Math.hypot(d.dx, d.dz) < 0.01; }
    if (clear) return [x, z, h, rt];
  }
  return null;
}"""


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__TREES && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


def car_radius(page):
    return page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")


@needs_world
def test_pushAt_besideATrunk_pushesTheCarOut(server):
    """A car resting 0.5 m east of a tree's centre is pushed straight east, out of the trunk (today: not at all)."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        trees = page.evaluate(ISOLATED_JS, 50)
        pushes = page.evaluate("(ts) => ts.map(([x, z]) => window.__mm.pushAt(x + 0.5, z))", trees)
        b.close()
    assert len(trees) >= 20, len(trees)
    bad = [(t, d) for t, d in zip(trees, pushes) if abs(d["dx"] - (rc + t[3] - 0.5)) > 0.05 or abs(d["dz"]) > 0.05]
    assert bad == [], bad[:5]


@needs_world
def test_sim_driveAtATree_stopsInFrontOfTheTrunk(server):
    """Full gas straight at a tree from 25 m west: the car stops with its circle on the trunk, it does not pass through."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        tree = page.evaluate(APPROACH_JS, rc)
        assert tree is not None
        x, z, h, rt = tree
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 0, 5)")
        b.close()
    assert r["x"] < x - rt - rc + 0.3, (r, tree, rc)   # stopped in front of the trunk
    assert r["x"] > x - 25 + 10, (r, tree)             # and it really drove there
    assert abs(r["z"] - z) < 0.5, (r, tree)


@needs_world
def test_no_tree_reaches_a_road(server):
    """No tree collider can touch a car whose centre is on a road: trees never block driving."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        n = page.evaluate("() => [window.__mm.treesOnRoad(), window.__TREES.length]")
        b.close()
    assert n[1] > 1000 and n[0] == 0, n
```

- [ ] **Step 2: Run them to see them fail.** Run (repo root): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_tree_collision.py -q -p no:cacheprovider`
Expected: FAIL — `window.__mm.treeTrunkR is not a function` / `treesOnRoad is not a function`.

- [ ] **Step 3: Split `pushOBB`.** In `prototype/index.html:622` replace

```js
function pushOBB(o) { OBB.push(o); const e = o.hw + o.hd; gridAdd(OBB_GRID, o.x - e, o.z - e, o.x + e, o.z + e, o); }
```

with

```js
function pushOBB(o) { OBB.push(o); addSolid(o); }
// solid for the car, the helicopter floor and the camera, but not a building: not in OBB, so not on the minimap (#131 trees)
function addSolid(o) { const e = o.hw + o.hd; gridAdd(OBB_GRID, o.x - e, o.z - e, o.x + e, o.z + e, o); }
```

- [ ] **Step 4: Import and register.** Add `treeTrunkR, treeCollider` to the `import { … } from './world.js'` list at `prototype/index.html:241`. Then, directly after the tree placement loop (the line starting `  for (let i = 0; i < 9000; i++) {`, `:1020`) and before `  window.__TREES = TREES;`, insert:

```js
  // #131: trees are solid at the trunk. After the loop, so free() above never sees a tree (forest density unchanged);
  // OSM forests (#13) only need to push into TREES before this line.
  for (const [x, z, h] of TREES) addSolid(treeCollider(x, z, h, terrainH(x, z)));
```

- [ ] **Step 5: Add the hooks.** Directly after the `window.__mm.treesOnRail = …` line (`:1256`) add:

```js
window.__mm.treeTrunkR = treeTrunkR;
window.__mm.treesOnRoad = () => (window.__TREES || []).filter(([x, z, h]) => roadDist(x, z) < carRadius() + treeTrunkR(h)).length;   // #131: must stay 0
```

- [ ] **Step 6: Run the new tests.** Same command as Step 2.
Expected: PASS (3 passed).

- [ ] **Step 7: Commit, push, then run the regression set** (foreground):

```bash
git add prototype/index.html prototype/tests/test_tree_collision.py
git commit -m "fix(world): trees stop the car at the trunk (#131)"
git push
```

Then run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_building_collision.py prototype/tests/test_heli.py prototype/tests/test_smoke.py -q -p no:cacheprovider`
Expected: PASS — in particular `test_no_invisible_building_colliders_region_wide`, `test_no_trees_on_car_parks` and the trees-on-rail test unchanged. Also `node --test prototype/tests/` PASS.

---

### Task 3: Changelog and playtest note

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Fixed`)
- Modify: `test-todo.md` (append a section)

**Interfaces:** none.

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Fixed`, add:

```markdown
- Trees are solid now: the car no longer drives straight through them. Hit a trunk and you stop, lose speed and take damage, just like with a lamp post — but you can still brush past the leaves. Trees never stand close enough to a road to get in the way.
```

- [ ] **Step 2: test-todo.md.** Append:

```markdown
## Solid trees (#131)

- [ ] Drive off-road into a tree (e.g. the Sisseln forest east of the village): the car stops at the trunk, the damage bar rises, the crash sound plays. Both tree styles (billboards and cones, style switch) look right — the car stops at, not inside or far in front of, the trunk.
- [ ] Driving along roads through the forest: no invisible bumps from trees at the road edge.
- [ ] Helicopter low over the forest: it keeps above the crowns, no jitter.
- [ ] Chase camera in a forest: no annoying zoom-in jumps when trunks pass behind the car.
```

- [ ] **Step 3: Commit.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): solid trees (#131)"
git push
```
