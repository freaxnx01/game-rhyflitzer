# Solid trees (#131) — design

**Issue:** [#131](https://github.com/freaxnx01/game-rhyflitzer/issues/131) — "fix(world): the car drives through trees"
**Date:** 2026-10-08 · enriched in quick mode (no clarifying questions; decisions recorded as assumptions in the issue body)

## Problem

The car drives straight through trees. Trees are built once in the world build
(`prototype/index.html:1018-1021`, ~9000 placement attempts, a few thousand trees,
exported as `window.__TREES` = `[x, z, h]`, later `[x, z, h, ty]`) and drawn either as
crossed billboards (`treeBill`, `:1067-1068`) or as instanced cone + trunk
(`treeCone`/`treeTrunk`, `:1069-1071`) depending on the style. None of them gets a
collider. Car collision `collide(r)` (`:1277`) only looks at `OBB_GRID`.

Lamps and hydrants are the model to follow: they are thin solids registered at
build time (`PROP_SOLID`, `:779`, registered via `addOBB` at `:822-823`) and need no
special case anywhere in the physics.

## Design

### Collider shape

One **circle** collider per tree, around the **trunk**, not the canopy — the car
should be able to brush the crown, and a canopy-sized disc would make forests a wall
of invisible bumpers.

- Radius: `treeTrunkR(h) = 0.06 · h` → 0.36 m for the smallest tree (h 6 m),
  0.72 m for the tallest (h 12 m; river-bank trees on the hand path reach 13 m →
  0.78 m). That sits between the drawn billboard trunk (12/128 of a 0.9·h wide
  texture → radius ≈ 0.04·h, `:298`) and the instanced cone-style trunk
  (cylinder radius 0.12–0.16 × 0.9·h → 0.11–0.14·h, `:1069-1071`), one value for
  both styles.
- Height: `h = base + treeHeight` (top of the tree), so `o.low` never applies and
  the helicopter floor sees the crown height.
- Shape object, the same shape `collide()` already understands for the Smile-Kreisel
  island (`:641`): `{ x, z, hw: r, hd: r, c: 1, s: 0, h, circle: r, tree: true }`.
  `hw`/`hd` are set so the existing coarse bounds check in `collide()` and the box
  tests in `heliFloor` / the chase camera work unchanged. `tree: true` is only a
  marker for tests and debugging; no code branches on it.

The object is built by a new pure helper `treeCollider(x, z, h, base)` in
`prototype/world.js` (node-tested), next to `ringPush`.

### Registration

- Trees are added to **`OBB_GRID` only**, not to the `OBB` array. `OBB` feeds the
  minimap's building layer (`:1395`), so `pushOBB` would paint thousands of tree "houses"
  on the map. `pushOBB` (`:622`) is split into `OBB.push(o)` + a new
  `addSolid(o)` that does just the grid insert; trees call `addSolid`.
- Registration happens **after** the tree placement loop (right after `:1020`,
  before `window.__TREES = TREES`). The tree loop itself uses `free()` → `OBB_GRID`;
  registering trees inside the loop would make each tree reject its neighbours
  within 3 m + r and thin out every forest. The tree loop is the last `free()` user
  in the build, so nothing placed later is affected.
- `base` is `terrainH(x, z)`, the same value the renderer stores as `t[3]`
  (`:1067`). Terrain (`REAL`) is final before the world build, so the two agree.
- Both layouts (OSM and the hand path) go through the same lines, so both get solid
  trees.

### Behaviour (no physics change)

`collide()` treats a tree exactly like a lamp: push-out along the centre line,
speed loss and **damage scaled by impact speed and `VEH.mass`, crash sound above
3 m/s** (`:1277`). No special crash rules for trees.

- **Helicopter** (`heliFloor`, `heli.js:19`): trees within `rotorMargin` raise the
  floor to the crown top + clearance, like lamps and buildings. This is the right
  behaviour — the rotor should not cut through a forest.
- **Chase camera clearance test** (`:1313`): a tree is a 0.36–0.78 m box + 0.8 m
  margin up to its crown top. The camera pulls in only when its line crosses a trunk,
  as with lamps. Accepted, not special-cased.
- **`free()`**: no later caller, so unchanged.

### Roads, rail, car parks — trees must not block driving

Already guaranteed by placement and kept by the small radius:

- OSM / random trees: `roadDist > 6` and `free(tx, tz, 3)` (road + 1.5 m + 3 m),
  `railDist > 7`, off car parks by 0.45·h (`:1019-1020`).
- Hand-path river-bank trees: `roadDist > 4`, off bridges by 12 m (`:1018`).
- Car radius is 1.3 m (`:1084`, `scale` 1.0). Worst case reach of tree + car is
  1.3 + 0.78 = 2.08 m < 4 m, so a car whose centre is on a road edge never touches
  a tree. A test pins this (`__mm.treesOnRoad()` = 0).

### Building-collision regression test

`test_no_invisible_building_colliders_region_wide` samples points inside building
rectangles. Trees keep `3 + hypot(hw, hd)` from every building centre (`free`), so
any such point is ≥ 3 m from a tree centre, more than 1.3 + 0.78. Trees add no
pushes there; the test must stay green unchanged.

### Performance

A few thousand extra entries in a 32 m grid; each is one cell (r < 1 m, a few straddle two).
A forest cell holds a few dozen trees at most; `collide()` runs once per frame on
the 1–4 cells around the car, the camera test up to 8 point queries. Negligible.

### Forests from OSM (#13, future)

Out of scope. When #13 adds OSM forests, it should push its trees into the same
`TREES` list before the registration step, so they become solid with no extra
work. Noted in the code comment.

## Tests

- **Node** (`prototype/tests/world.test.mjs`): `treeTrunkR` scales with height;
  `treeCollider` returns a circle object centred on the tree, top at base + h,
  `hw = hd = circle = r`, `tree: true`.
- **Playwright** (`prototype/tests/test_tree_collision.py`, OSM world, flat terrain
  as in the other collision tests):
  1. `pushAt` 0.5 m east of 50 sample trees pushes every one of them east by
     ≈ `rCar + rTree − 0.5`.
  2. Driving straight at a tree whose approach is clear stops the car in front of
     the trunk, not behind it.
  3. `__mm.treesOnRoad()` is 0: no tree collider reaches a car on any road.
- Existing `test_building_collision.py` (all three) and `test_smoke.py`'s tree tests
  stay green.

## Out of scope

- Canopy collision, falling or breaking trees, tree-specific crash effects.
- OSM forests (#13).
- Any change to the helicopter or camera logic.
