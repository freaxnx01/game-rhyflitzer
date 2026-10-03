# Trees off the Car Parks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every tree (trunk and crown footprint) off the OSM car parks (#72) without moving any other tree.

**Architecture:** A pure `parkingIndex(lots)` in `prototype/world.js` answers "does a disc of radius r overlap any lot surface?" (bbox prefilter, point-in-ring, edge distance; holes are not car park). The forest scatter in `prototype/index.html` draws the tree height first (same RNG position as before) and only pushes the tree when `PARKING.clear(x, z, 0.45 · h)`. A Playwright smoke test checks `window.__TREES` against the world file's `parking` rings in Python, independently of the JS helper.

**Tech Stack:** three.js buildless, Node 24 test runner (`node:test`), Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-trees-off-car-parks-design.md`

## Global Constraints

- Tree footprint radius = `0.45 · h` (crown billboards are `h · 0.9` wide in `prototype/index.html` ~line 816; the cone is `0.42 · h`).
- Do **not** touch `free()`: it is shared with houses and halls, changing it would move buildings.
- The seeded RNG sequence must stay unchanged: `rr(6, 12)` is drawn exactly where it was drawn before (after `free`/road/rail/stream checks pass), then the car-park check decides whether the tree is pushed.
- No pipeline change and no world rebuild: `data/world_hochrhein.json` (committed) already carries `parking` (330 lots). Never hand-edit it.
- Buildless stack: no npm packages, no bundler.
- Browser tests are slow under software rendering (60–120 s per page load with measured terrain). Run them in the **foreground** with a generous timeout; never `run_in_background`. Commit and push before the browser verification.
- Memory-heavy commands on the shared agent box run under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`.

## Review Focus

- **Other trees unchanged:** the diff in the tree loop must keep `rr(6, 12)` at the same position in the RNG stream (drawn once per accepted candidate, before the car-park check). The hand layout must be identical — `test_no_trees_on_the_railway[hand]` still passes and `parkingIndex([])` is always clear.
- **Crown, not just trunk:** the radius passed to `clear` is `0.45 * h`, not `0` or a fixed `3`.
- **Test independence:** the pytest check reimplements point-in-ring and edge distance in Python; it must not call `parkingIndex` through the page.

---

### Task 1: `parkingIndex` in `world.js` (unit-tested)

**Files:**
- Modify: `prototype/world.js` (after `waterIndex`, ~line 40)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- Consumes: lots shaped like the world file's `parking` entries: `{ ring: [[x, z], ...], holes?: [[[x, z], ...]] }`; the existing module-private `inRing(r, x, z)` in `world.js`.
- Produces: `export function parkingIndex(lots) -> { clear(x, z, r = 0): boolean }` — `true` when the disc `(x, z, r)` overlaps no lot surface (ring minus holes).

- [ ] **Step 1: Write the failing tests** — add `parkingIndex` to the import list at the top of `prototype/tests/world.test.mjs` and append:

```js
test('parkingIndex keeps a tree disc off the lot surface but allows the islands', () => {
  const lot = { ring: [[0, 0], [20, 0], [20, 10], [0, 10]], holes: [[[8, 3], [12, 3], [12, 7], [8, 7]]] };
  const p = parkingIndex([lot]);
  assert.equal(p.clear(5, 5, 0), false);      // trunk on the asphalt
  assert.equal(p.clear(5, 5, 3), false);
  assert.equal(p.clear(25, 5, 3), true);      // 5 m off the east edge, 3 m crown
  assert.equal(p.clear(22, 5, 3), false);     // crown reaches 1 m over the edge
  assert.equal(p.clear(10, -2.5, 2), true);   // 2.5 m north of the lot, 2 m crown
  assert.equal(p.clear(10, 5, 1), true);      // small tree in the island, 2 m from its kerb
  assert.equal(p.clear(10, 5, 3), false);     // crown spills over the island onto the bays
  assert.equal(p.clear(500, 500, 5), true);   // far away (bbox prefilter)
});

test('parkingIndex with no lots is always clear', () => {
  const p = parkingIndex([]);
  assert.equal(p.clear(0, 0, 0), true);
  assert.equal(p.clear(0, 0, 100), true);
});

test('parkingIndex accepts closed rings and lots without holes', () => {
  const p = parkingIndex([{ ring: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }]);
  assert.equal(p.clear(5, 5), false);
  assert.equal(p.clear(-0.5, 5, 1), false);   // crown over the closing edge's neighbour (x = 0)
  assert.equal(p.clear(-2, 5, 1), true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test prototype/tests/world.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../world.js' does not provide an export named 'parkingIndex'`.

- [ ] **Step 3: Implement** — in `prototype/world.js`, directly after `waterIndex`:

```js
// car parks (#72): is a disc (a tree's footprint) clear of every lot surface? holes are islands, not car park
function ringDist(r, x, z) {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[j], [bx, bz] = r[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
export function parkingIndex(lots) {
  const items = lots.map(l => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of l.ring) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return { rings: [l.ring, ...(l.holes || [])], bb: [a, b, c, d] }; });
  return {
    clear(x, z, r = 0) {
      for (const { rings, bb } of items) {
        if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue;
        if (inRing(rings[0], x, z) && !rings.slice(1).some(h => inRing(h, x, z))) return false;
        if (rings.some(ring => ringDist(ring, x, z) < r)) return false;
      }
      return true;
    },
  };
}
```

- [ ] **Step 4: Run all node tests**

Run: `node --test prototype/tests/*.test.mjs`
Expected: PASS, no failures (the three new tests included).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): parkingIndex tells whether a disc overlaps a car park (#72)"
```

---

### Task 2: Browser test that pins "no trees on car parks" (failing first)

**Files:**
- Modify: `prototype/tests/test_smoke.py` (append after `test_parking_loaded`)

**Interfaces:**
- Consumes: `window.__TREES` (`[[x, z, h, ty], ...]`, set in `prototype/index.html` after the tree scatter); `world_parking()`, `MMH`, `MMH_ROUTE`, `ARGS` already defined in `test_smoke.py`.
- Produces: `test_no_trees_on_car_parks[flat]`, `test_no_trees_on_car_parks[measured]`.

- [ ] **Step 1: Write the failing test** — append to `prototype/tests/test_smoke.py`:

```python
def _in_ring(r, x, z):
    c = False
    j = len(r) - 1
    for i in range(len(r)):
        (xi, zi), (xj, zj) = r[i], r[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
        j = i
    return c


def _ring_dist(r, x, z):
    best = float("inf")
    for i in range(len(r)):
        (ax, az), (bx, bz) = r[i - 1], r[i]
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2)) if l2 else 0.0
        best = min(best, math.hypot(x - ax - t * dx, z - az - t * dz))
    return best


def _tree_on_lot(lot, x, z, rad):
    xs = [p[0] for p in lot["ring"]]; zs = [p[1] for p in lot["ring"]]
    if x < min(xs) - rad or x > max(xs) + rad or z < min(zs) - rad or z > max(zs) + rad:
        return False
    rings = [lot["ring"], *lot.get("holes", [])]
    if _in_ring(rings[0], x, z) and not any(_in_ring(h, x, z) for h in rings[1:]):
        return True
    return any(_ring_dist(r, x, z) < rad for r in rings)


@pytest.mark.skipif(not world_parking(), reason="world file predates #40: rebuild it with pipeline/osm.py build")
@pytest.mark.parametrize("terrain", ["flat", "measured"])
def test_no_trees_on_car_parks(server, terrain):
    """#72, playtest 2026-10-03: "Keine Bäume auf Parkplatz" — a tree stood in the middle of the Hallenbad bays.
    A tree's footprint is a disc of 0.45 · h (the crown billboards are h · 0.9 wide); it must not overlap any lot."""
    if terrain == "measured" and not MMH.exists():
        pytest.skip("run pipeline/terrain.py first")
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        if terrain == "flat":
            page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__TREES && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        if terrain == "measured":
            page.wait_for_selector("#mmhstatus.real", timeout=240000)
        trees = page.evaluate("() => window.__TREES.map(([x, z, h]) => [x, z, h])")
        br.close()
    lots = world_parking()
    bad = [(round(x, 1), round(z, 1), lot.get("name", lot["id"])) for x, z, h in trees for lot in lots if _tree_on_lot(lot, x, z, 0.45 * h)]
    assert len(trees) > 1000 and bad == [], bad[:10]
```

Add `import math` at the top of the file if it is not imported yet (the file starts with `import json` / `from pathlib import Path`).

- [ ] **Step 2: Run it against the tree loop as it is (Task 3 not done yet)** — foreground, generous timeout:

Run: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_smoke.py -k car_parks -v`
Expected: both FAIL with a non-empty `bad` list (dry run on `main` 2026-10-03: flat 18 trees, measured 27, incl. `Privat Parkplatz Rhyblick` by the Hallenbad). If Task 1 is already merged into the working tree this still fails — the loop does not use `parkingIndex` yet.

- [ ] **Step 3: Commit the failing test together with Task 3** (do not push a red suite on its own; continue to Task 3).

---

### Task 3: Use `parkingIndex` in the tree scatter

**Files:**
- Modify: `prototype/index.html` (import line ~202; the forest scatter ~line 769)
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Fixed`)

**Interfaces:**
- Consumes: `parkingIndex` (Task 1); `L.parking` (always an array when `L` is set — `layoutFromWorld` defaults it to `[]`).
- Produces: `window.__TREES` without trees on car parks; every other tree unchanged.

- [ ] **Step 1: Import** — add `parkingIndex` to the `import { … } from './world.js';` list (~line 202), e.g. after `waterIndex`.

- [ ] **Step 2: Change the scatter** — directly before the `for (let i = 0; i < 9000; i++)` forest loop (after the `const TREES = [], SW = …` line with the river trees), add:

```js
  const PARKING = parkingIndex(L ? L.parking : []), TREE_CROWN = 0.45;   // #72: a tree's footprint (billboards are h · 0.9 wide) stays off the car parks
```

and in the loop replace the tail

```js
if (free(tx, tz, 3) && roadDist(tx, tz) > 6 && railDist(tx, tz) > 7 && streamH(tx, tz) === -Infinity) TREES.push([tx, tz, rr(6, 12)]); }
```

with

```js
if (free(tx, tz, 3) && roadDist(tx, tz) > 6 && railDist(tx, tz) > 7 && streamH(tx, tz) === -Infinity) { const h = rr(6, 12); if (PARKING.clear(tx, tz, TREE_CROWN * h)) TREES.push([tx, tz, h]); } }
```

(`rr(6, 12)` is drawn at the same point of the RNG stream as before, so no other tree moves.)

- [ ] **Step 3: Changelog** — under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md`, add as the first bullet:

```markdown
- No more trees on the car parks — the one in the middle of the Hallenbad bays is gone, and so are the others standing on asphalt and parking lines across the region.
```

- [ ] **Step 4: Unit tests**

Run: `node --test prototype/tests/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit and push before the browser verification**

```bash
git add prototype/index.html prototype/tests/test_smoke.py CHANGELOG.md
git commit -m "fix(prototype): keep trees off the car parks (#72)"
git push -u origin HEAD
```

- [ ] **Step 6: Browser tests (foreground)**

Run: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_smoke.py -k "car_parks or trees_on_the_railway or parking_loaded or hand_traced" -v`
Expected: PASS — `test_no_trees_on_car_parks[flat]`, `[measured]` (or skipped if `data/terrain_hochrhein.mmh` is absent), `test_no_trees_on_the_railway[hand]`, `[osm]`, `test_parking_loaded`, `test_hand_traced_fallback`.

- [ ] **Step 7: Full suite**

Run: `node --test prototype/tests/*.test.mjs` and `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests -v` (foreground, timeout ≥ 30 min).
Expected: PASS (skips only where local caches are missing, as on `main`). If a failure also happens on `main`, note it in the PR body rather than fixing it here.

- [ ] **Step 8: Manual check** — `python3 -m http.server 8000`, open `http://localhost:8000/prototype/index.html`, press **J** → Hallenbad, look at the Hallenbad-Parkplatz and the Rhyblick lot: asphalt and bays, no tree on them; console empty.
