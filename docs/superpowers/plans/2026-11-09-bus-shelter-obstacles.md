# Bus shelters are obstacles (#760) Implementation Plan

**Goal:** The glass shelters at the Postauto stops are solid for vehicles (the car bounces off them like any wall), but not on foot.

**Architecture:** A pure `shelterCollider(layout, base)` in `busstop.js` returns one oriented box with `carOnly: true` (precedent: `plattformCoreCollider`, `plattform.js:136`). `busStop()` in `index.html` registers it with `addSolid` (solid for car, heli floor and camera; not on the minimap; `footSolids()` skips `carOnly`).

**Tech stack:** buildless three.js; `node --test` for the pure module; Playwright pytest for the in-game check.

**Global constraints**
- Run Playwright in the foreground, only the touched file: `python -m pytest tests/test_bus_stops.py`. Memory-heavy runs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; never raise the cap.
- Commit and push after every task.
- Do not make the stop pole solid; do not use `addOBB`/`pushOBB` (that would put the shelter on the minimap).

---

### Task 1: `shelterCollider` in `busstop.js`

**Files:** `busstop.js` (new export), `tests/busstop.test.mjs` (new tests, extend the import line)

**Interface:**
```js
// returns null for a sign-only stop (layout.shelter === null)
export function shelterCollider(layout, base, cfg = STOP)
// → { x, z, hw, hd, c, s, h, carOnly: true }
```

- [ ] **Step 1: Write the failing tests** — append to `tests/busstop.test.mjs`, and add `shelterCollider` to the `../busstop.js` import:

```js
test('shelterCollider: one car-only box over the shelter, hw along the kerb, top at the roof', () => {
  const lay = { yaw: Math.PI / 6, pole: [0, 0], shelter: { x: 3, z: 4, corners: [] } };
  const o = shelterCollider(lay, 10);
  assert.equal(o.x, 3); assert.equal(o.z, 4);
  assert.ok(near(o.hw, STOP.shelter.w / 2)); assert.ok(near(o.hd, STOP.shelter.d / 2));
  assert.ok(near(o.c, Math.cos(Math.PI / 6))); assert.ok(near(o.s, Math.sin(Math.PI / 6)));
  assert.ok(near(o.h, 10 + STOP.shelter.h + 0.25));
  assert.equal(o.carOnly, true);
});

test('shelterCollider: a sign-only stop has no collider', () => {
  assert.equal(shelterCollider({ yaw: 0, pole: [0, 0], shelter: null }, 0), null);
});

test('shelterCollider: the box covers exactly the shelter corners stopLayout computes', () => {
  const R = road([[0, 0], [200, 0]]);
  const lay = stopLayout({ x: 100, z: 3.5, rot: 0 }, [], [R]);
  const o = shelterCollider(lay, 0);
  for (const [x, z] of lay.shelter.corners) {
    const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    assert.ok(near(Math.abs(lx), o.hw) && near(Math.abs(lz), o.hd), [x, z, lx, lz]);
  }
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/busstop.test.mjs` (`shelterCollider` is not exported).

- [ ] **Step 3: Implement** — in `busstop.js`, after `stopLayout`:

```js
// #760: the shelter as one solid box for the car, the helicopter floor and the camera. carOnly: footSolids() skips it,
// so on foot you step in under the roof. hw along the kerb (u = cos/sin yaw), h absolute: the roof top over the pole's ground.
export function shelterCollider(layout, base, cfg = STOP) {
  if (!layout.shelter) return null;
  const S = cfg.shelter;
  return { x: layout.shelter.x, z: layout.shelter.z, hw: S.w / 2, hd: S.d / 2, c: Math.cos(layout.yaw), s: Math.sin(layout.yaw), h: base + S.h + 0.25, carOnly: true };
}
```

- [ ] **Step 4: Run, expect PASS** — `node --test tests/busstop.test.mjs`.
- [ ] **Step 5: Commit and push** — `feat(busstop): shelter collider box (#760)`.

### Task 2: register it in `busStop()` and prove the car stops

**Files:** `index.html` (import line ~787, `busStop()` ~2102), `tests/test_bus_stops.py` (new test), `CHANGELOG.md`

- [ ] **Step 1: Write the failing test** — append to `tests/test_bus_stops.py`:

```python
@needs_data
def test_car_stops_at_a_shelter_instead_of_driving_through(server):
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        stop = next(s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == RUETTI)
        sx, sz, yaw = stop["shelter"]["x"], stop["shelter"]["z"], stop["yaw"]
        nx, nz = -math.sin(yaw), math.cos(yaw)                     # away from the road, through the shelter
        hd = 1.8 / 2
        start = (sx - nx * (hd + 8), sz - nz * (hd + 8))           # on the road side, nose at the shelter
        page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [*start, math.atan2(nz, nx)])
        page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp'])")
        car = page.evaluate("() => window.__mm.car()")
        depth = (car["x"] - sx) * nx + (car["z"] - sz) * nz        # along n from the shelter centre
        moved = (car["x"] - start[0]) * nx + (car["z"] - start[1]) * nz
        b.close()
    assert moved > 3, f"the car did not drive towards the shelter ({moved:.2f} m)"
    assert depth < -hd, f"the car centre is {depth:.2f} m along n -- inside or past the shelter (face at {-hd})"
```

- [ ] **Step 2: Run, expect FAIL** — `python -m pytest tests/test_bus_stops.py -k shelter` (the car drives through, `depth` > `-hd`).

- [ ] **Step 3: Implement** — `index.html`:
  - add `shelterCollider` to the `./busstop.js` import (line ~787);
  - at the end of the `if (layout.shelter) { ... }` block in `busStop()`:

```js
    addSolid(shelterCollider(layout, b));   // #760: solid for the car, heli floor and camera; carOnly, so on foot you step in under the roof
```

- [ ] **Step 4: Run, expect PASS** — `python -m pytest tests/test_bus_stops.py` (all tests in the file) and `node --test tests/busstop.test.mjs`.

- [ ] **Step 5: CHANGELOG** — under `## [Unreleased]` → `### Changed`, newest first, Swiss local time of the merge:

```markdown
- `YYYY-MM-DD HH:MM` The **glass shelters** at the Postauto stops are now **solid**: the car bumps into them like into a wall instead of driving through. On foot you can still step in under the roof.
```

- [ ] **Step 6: Commit and push** — `feat(busstop): shelters are obstacles for vehicles (#760)`.
