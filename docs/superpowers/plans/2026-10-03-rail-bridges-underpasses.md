# Rail Bridges and Road Underpasses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Where OpenStreetMap maps a railway bridge over a road, the game draws a rail deck, the road dips into a cut under it with ≥ 4.5 m headroom, and the car drives under it (or over it along the track). Level crossings stay level. (#76)

**Architecture:** The pipeline splits OSM rail into `rail` (non-bridge, unchanged) and a new `railBridges: [{pts, layer}]`. In the browser, rail bridges join `OSM_BRIDGES` as `kind: 'rail'` decks. Pure helpers in `prototype/world.js` find rail-deck/road crossings and shape a cut. `index.html` replaces the 16 m terrain cells under each cut with a 2 m patch, and `terrainH` reads that patch. Roads, the car and the ground mesh all follow it.

**Tech Stack:** Python 3 + shapely (pipeline, pytest); vanilla JS ES modules (`node --test`); three.js prototype; Playwright via pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-rail-bridges-underpasses-design.md`

## Global Constraints

- User decision 2026-10-03: follow OSM `bridge`/`tunnel`/`layer`. Rail decks go over roads. Road underpasses are cuts in the terrain. `railway=level_crossing` stays at grade.
- Constants, exactly: `UNDERPASS = { clear: 4.5, deck: 1.2, grade: 0.08, bank: 2, margin: 1, maxDepth: 6, apron: 3 }`. Rail deck width 5.5 m (`hw` 2.75). Patch subdivision `CUT_N = 8` (2 m in a 16 m cell).
- A rail bridge goes over a road only when the road has `bridge: false` and `(road.layer ?? 0) < deck.layer`. A missing rail `layer` on a bridge is 1.
- Road tunnels stay dropped (`pipeline/world_roads.py` `keep()` unchanged). Road bridges over rail are unchanged.
- The hand-traced layout (no world file) must behave exactly as today. A world file without `railBridges` must also behave exactly as today.
- No new dependencies, no framework, no build step. Never hand-edit `data/world_hochrhein.json`.
- TDD for every task: failing test first, watch it fail, implement minimally, go green.
- Run heavy commands (world build, golden tests, Playwright) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 means the cap was hit: stop and report, do not raise the cap. If `systemd-run --user` is unavailable (CI runner), run the same command without the prefix.
- Commands:
  - pipeline: `cd pipeline && ./.venv/bin/python -m pytest -q`
  - node: `node --test prototype/tests/*.test.mjs` (from the repo root)
  - Playwright: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/<file> -q -s`
- Commit after every task (Conventional Commits, explicit `git add <paths>`, never `-A`). Push the branch **before** any Playwright run.
- Out of scope: #78 (Fridolinsbrücke), road/rail tunnels, piers, abutment walls, parapet collision, and chase-camera behaviour under decks.

## Review Focus

- **Two tracks over one road**: the cuts must overlap with `max`, not add up. Covered by the node test `cutDepth of two overlapping cuts is the max` (Task 2) and by the Laufenburgerstrasse Playwright test (Task 3).
- **Patch border cracks**: the patch must meet the coarse mesh exactly. The node test `patch cells cover the whole footprint` (Task 2) checks this, together with the `grassOverRoad`/`sinkCheck` regression runs (Task 4).
- **Rail decks mistaken for hero bridges** (`index.html:713` takes every `kind !== 'generic'`): the grouping is narrowed in Task 3. A rail deck becoming a stone span would throw or draw a Fridolinsbrücke over Sisseln, so the Playwright console-error check catches it.
- **Old world file / hand layout**: the `layoutFromWorld` default is covered in Task 2, `test_hand_traced_fallback` and `test_osm_layout` in Task 4.
- **Track ends dropping into the cut**: the rail ribbon at the deck ends must meet the deck. `railGap < 0.3` is asserted in Task 3.

## File map

- Create `pipeline/world_rail.py`: splits rail ways into tracks and merged bridge chains.
- Create `pipeline/tests/test_rail.py`.
- Modify `pipeline/osm.py:113-115,135`: uses `world_rail.build`, writes `railBridges`.
- Modify `pipeline/tests/test_golden.py`: Laufenburgerstrasse rail bridges.
- Modify `docs/11-pipeline-osm.md:63` and the Rules section: format line and rule.
- Modify `prototype/world.js`: `layoutFromWorld` gets `railBridges`, plus the pure underpass helpers.
- Modify `prototype/tests/world.test.mjs`.
- Modify `prototype/index.html`: rail decks, cuts, the terrain patch, drawing and debug hooks.
- Create `prototype/tests/test_underpass.py`.
- Modify `CHANGELOG.md` and `TODO.md:60`.
- Modify `data/world_hochrhein.json` (generated, Task 5 only).

---

### Task 1: Pipeline — `railBridges`

**Files:**
- Create: `pipeline/world_rail.py`
- Create: `pipeline/tests/test_rail.py`
- Modify: `pipeline/osm.py:113-115` (rail list), `:135` (output dict), plus the import list
- Modify: `pipeline/tests/test_golden.py` (new test at the end)
- Modify: `docs/11-pipeline-osm.md:63` and the **Roads.** rule paragraph

**Interfaces:**
- Produces: `world_rail.build(ways, clip) -> (rail: list[list[[x, z]]], rail_bridges: list[{"pts": [[x, z], ...], "layer": int}])`. The world JSON gets a `railBridges` key, and `rail` loses the bridge pieces.

- [ ] **Step 1: Write the failing unit tests** in `pipeline/tests/test_rail.py`:

```python
import shapely

import world_rail as RL
from osm_read import Way

CLIP = shapely.box(-1000, -1000, 1000, 1000)


def way(i, tags, pts):
    return Way(i, tags, shapely.LineString(pts))


def test_track_stays_rail_and_bridge_moves_to_rail_bridges():
    rail, bridges = RL.build([way(1, {"railway": "rail"}, [(0, 0), (100.04, 0)]),
                              way(2, {"railway": "rail", "bridge": "yes", "layer": "1"}, [(100.04, 0), (130, 0)])], CLIP)
    assert rail == [[[0.0, 0.0], [100.0, 0.0]]]
    assert bridges == [{"pts": [[100.0, 0.0], [130.0, 0.0]], "layer": 1}]


def test_missing_layer_on_a_bridge_is_1_and_explicit_layer_is_kept():
    _, bridges = RL.build([way(1, {"railway": "rail", "bridge": "viaduct"}, [(0, 0), (10, 0)]),
                           way(2, {"railway": "rail", "bridge": "yes", "layer": "2"}, [(0, 50), (10, 50)])], CLIP)
    assert sorted(b["layer"] for b in bridges) == [1, 2]


def test_bridge_pieces_sharing_an_endpoint_merge_per_layer():
    _, bridges = RL.build([way(1, {"railway": "rail", "bridge": "yes"}, [(0, 0), (16, 0)]),
                           way(2, {"railway": "rail", "bridge": "yes"}, [(16, 0), (34, 2)]),
                           way(3, {"railway": "rail", "bridge": "yes"}, [(0, 7), (34, 9)])], CLIP)
    assert len(bridges) == 2
    assert [[0.0, 0.0], [16.0, 0.0], [34.0, 2.0]] in [b["pts"] for b in bridges]


def test_non_rail_and_outside_ways_are_ignored():
    rail, bridges = RL.build([way(1, {"railway": "disused"}, [(0, 0), (10, 0)]),
                              way(2, {"highway": "primary"}, [(0, 0), (10, 0)]),
                              way(3, {"railway": "rail", "bridge": "yes"}, [(5000, 0), (5010, 0)])], CLIP)
    assert rail == [] and bridges == []


def test_bridge_no_is_a_track():
    rail, bridges = RL.build([way(1, {"railway": "rail", "bridge": "no"}, [(0, 0), (10, 0)])], CLIP)
    assert len(rail) == 1 and bridges == []
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_rail.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'world_rail'`.

- [ ] **Step 3: Implement** `pipeline/world_rail.py`:

```python
"""Railway: track polylines for the ribbon, and the bridge pieces (#76) the prototype lifts onto rail decks."""
from __future__ import annotations

import shapely


def is_bridge(tags) -> bool:
    return tags.get("bridge", "no") != "no"


def layer(tags) -> int:
    v = tags.get("layer", "")
    return int(v) if v.lstrip("-").isdigit() else (1 if is_bridge(tags) else 0)


def _pts(line):
    return [[round(x, 1), round(z, 1)] for x, z in line.coords]


def _clipped(line, clip):
    """The way inside the clip, or None when it misses the clip or falls apart into several pieces (as before #76)."""
    if not line.intersects(clip):
        return None
    part = line.intersection(clip)
    return part if part.geom_type == "LineString" else None


def build(ways, clip):
    rail, decks = [], {}
    for w in ways:
        if w.tags.get("railway") != "rail":
            continue
        part = _clipped(w.line, clip)
        if part is None:
            continue
        if is_bridge(w.tags):
            decks.setdefault(layer(w.tags), []).append(part)
        else:
            rail.append(_pts(part))
    bridges = []
    for lay, parts in sorted(decks.items()):
        merged = shapely.line_merge(shapely.MultiLineString(parts))
        for g in getattr(merged, "geoms", [merged]):
            bridges.append({"pts": _pts(g), "layer": lay})
    bridges.sort(key=lambda b: (b["layer"], b["pts"][0]))
    return rail, bridges
```

In `pipeline/osm.py`, add `import world_rail` to the import list. Replace the `rail = [...]` comprehension (`:113-115`) with:

```python
    rail, rail_bridges = world_rail.build(data.ways, clip)
```

Change the log line's `f"rail {len(rail)}, "` to `f"rail {len(rail)}, rail bridges {len(rail_bridges)}, "`. Add `"railBridges": rail_bridges,` right after `"rail": rail,` in the returned dict.

- [ ] **Step 4: Run, expect pass**

Run: `cd pipeline && ./.venv/bin/python -m pytest tests/test_rail.py -q`
Expected: 5 passed.

- [ ] **Step 5: Golden test** (append to `pipeline/tests/test_golden.py`; it uses the module's `world` fixture):

```python
def test_rail_bridges_over_laufenburgerstrasse(world):
    """#76: both tracks cross Laufenburgerstrasse (Sisseln) on bridges (OSM w35583301, w1496246793, layer 1)."""
    near = [b for b in world["railBridges"] if shapely.LineString(b["pts"]).distance(shapely.Point(1569.7, 625)) < 6]
    assert len(near) == 2 and all(b["layer"] == 1 for b in near), near
    assert 8 <= len(world["railBridges"]) <= 18
    bridge_pts = {tuple(p) for b in world["railBridges"] for p in b["pts"]}
    assert not any(all(tuple(p) in bridge_pts for p in line) for line in world["rail"])   # no bridge piece left in rail
```

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`
Expected: all pass, or all SKIPPED when `cache/osm/hochrhein.osm.pbf` is missing (CI). Note which one in the PR.

- [ ] **Step 6: Docs.** In `docs/11-pipeline-osm.md`, after the `"rail":` line add:

```
  "railBridges": [{ layer, pts: [[x, z], ...] }],
```

At the end of the **Roads.** rule paragraph add: `Railway bridges (`railway=rail` with a `bridge` tag) leave `rail` and go to `railBridges` with their `layer` (1 when untagged); pieces that share an endpoint are merged per layer. The prototype lifts them onto rail decks and cuts the road underneath (#76).`

- [ ] **Step 7: Full pipeline suite and commit**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q`
Expected: no failures.

```bash
git add pipeline/world_rail.py pipeline/tests/test_rail.py pipeline/osm.py pipeline/tests/test_golden.py docs/11-pipeline-osm.md
git commit -m "feat(pipeline): export railway bridges as railBridges (#76)"
```

---

### Task 2: Pure underpass helpers in `world.js`

**Files:**
- Modify: `prototype/world.js` (`layoutFromWorld` at `:66-70`, new helpers after `bridgeAccepts` at `:78`)
- Test: `prototype/tests/world.test.mjs` (append)

**Interfaces:**
- Consumes: the `railBridges` world key (Task 1). It is optional.
- Produces (all exported from `prototype/world.js`):
  - `layoutFromWorld(w).railBridges`: `[{pts, layer}]`, `[]` when absent.
  - `UNDERPASS`: the constants object from Global Constraints.
  - `pointAtLength(pts, t) -> [x, z]`: the point at arc length `t`, clamped to the ends.
  - `railRoadCrossings(roads, railBridges) -> [{road, bridge, x, z, tRoad, tRail, sin}]`. `bridge` is the index into `railBridges`, `tRoad`/`tRail` are arc lengths, and `sin` is the |sine| of the crossing angle.
  - `underpassDepth(deckMin, roadMax, u = UNDERPASS) -> number`.
  - `cutFlat(deckHalfWidth, sin, u = UNDERPASS) -> number`.
  - `cutDepthAt(cut, x, z, u = UNDERPASS) -> number`, where `cut = {pts, t, hw, flat, depth}`.
  - `cutBounds(cut, u = UNDERPASS) -> [x0, z0, x1, z1]`.
  - `patchCells(bounds, G) -> [[i, j], ...]`, where `G = {x0, z0, dx, dz, nx, nz}`.
  - `triLerp(ha, hb, hc, hd, u, v) -> number`: the `terrainH` triangle split, a = (i, j), b = (i, j+1), c = (i+1, j+1), d = (i+1, j).

- [ ] **Step 1: Write the failing tests** (append to `prototype/tests/world.test.mjs`):

```js
import { UNDERPASS, pointAtLength, railRoadCrossings, underpassDepth, cutFlat, cutDepthAt, cutBounds, patchCells, triLerp } from '../world.js';

test('layoutFromWorld passes railBridges through and defaults to none', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], anchors: {}, bbox: [], waterSdf: {} };
  assert.deepEqual(layoutFromWorld(base).railBridges, []);
  assert.deepEqual(layoutFromWorld({ ...base, railBridges: [{ pts: [[0, 0], [1, 0]], layer: 1 }] }).railBridges, [{ pts: [[0, 0], [1, 0]], layer: 1 }]);
});

test('pointAtLength walks the polyline and clamps at the ends', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(pointAtLength(pts, 15), [10, 5]);
  assert.deepEqual(pointAtLength(pts, -3), [0, 0]);
  assert.deepEqual(pointAtLength(pts, 99), [10, 10]);
});

test('railRoadCrossings: a rail bridge over a lower, non-bridge road only', () => {
  const road = (extra) => ({ n: 'R', w: 9, bridge: false, layer: 0, pts: [[0, -20], [0, 20]], ...extra });
  const rb = [{ pts: [[-10, 5], [10, 5]], layer: 1 }];
  const [c, ...rest] = railRoadCrossings([road()], rb);
  assert.equal(rest.length, 0);
  assert.equal(c.bridge, 0); assert.equal(c.x, 0); assert.equal(c.z, 5);
  assert.equal(c.tRoad, 25); assert.equal(c.tRail, 10); assert.ok(Math.abs(c.sin - 1) < 1e-9);
  assert.deepEqual(railRoadCrossings([road({ bridge: true, layer: 1 })], rb), []);   // road bridge: road over or level with the deck
  assert.deepEqual(railRoadCrossings([road({ layer: 1 })], rb), []);                 // same layer: not under it
  assert.deepEqual(railRoadCrossings([road({ pts: [[20, -20], [20, 20]] })], rb), []);   // misses the bridge
  assert.equal(railRoadCrossings([road({ layer: undefined })], rb).length, 1);      // untagged road is layer 0
});

test('underpassDepth keeps 4.5 m under a 1.2 m deck, never negative, at most 6 m', () => {
  assert.ok(Math.abs(underpassDepth(20, 15) - 0.7) < 1e-9);
  assert.equal(underpassDepth(25, 15), 0);
  assert.ok(Math.abs(underpassDepth(16, 15) - 4.7) < 1e-9);
  assert.equal(underpassDepth(10, 15), UNDERPASS.maxDepth);
});

test('cutFlat covers the deck footprint on the road plus the apron, skew-limited', () => {
  assert.equal(cutFlat(2.75, 1), 5.75);
  assert.ok(Math.abs(cutFlat(2.75, 0.1) - (2.75 / 0.3 + 3)) < 1e-9);
});

const CUT = { pts: [[0, -100], [0, 100]], t: 100, hw: 4.5, flat: 6, depth: 3 };   // ramp = 3 / 0.08 = 37.5 m, bank 6 m
test('cutDepthAt: full under the deck, 8 % ramps along the road, 1:2 banks beside it', () => {
  assert.equal(cutDepthAt(CUT, 0, 0), 3);
  assert.equal(cutDepthAt(CUT, 0, 6), 3);
  assert.ok(Math.abs(cutDepthAt(CUT, 0, 6 + 18.75) - 1.5) < 1e-9);
  assert.equal(cutDepthAt(CUT, 0, 50), 0);
  assert.equal(cutDepthAt(CUT, 5.5, 0), 3);
  assert.ok(Math.abs(cutDepthAt(CUT, 8.5, 0) - 1.5) < 1e-9);
  assert.equal(cutDepthAt(CUT, 11.6, 0), 0);
  assert.equal(cutDepthAt({ ...CUT, depth: 0 }, 0, 0), 0);
});

test('cutDepth of two overlapping cuts is the max', () => {
  const other = { ...CUT, t: 107 };
  const both = (x, z) => Math.max(cutDepthAt(CUT, x, z), cutDepthAt(other, x, z));
  assert.equal(both(0, 3.5), 3);
  for (let z = -60; z <= 60; z += 0.5) assert.ok(both(0, z) <= 3 + 1e-9);
});

test('cutBounds holds every point with depth > 0', () => {
  const [x0, z0, x1, z1] = cutBounds(CUT);
  assert.deepEqual([x0, z0, x1, z1], [-11.5, -55, 11.5, 55]);   // 43.5 m along (flat 6 + ramp 37.5) plus the 11.5 m pad
  for (let x = -20; x <= 20; x += 0.5) for (let z = -60; z <= 60; z += 0.5) if (cutDepthAt(CUT, x, z) > 0) assert.ok(x > x0 && x < x1 && z > z0 && z < z1, `${x},${z}`);
});

test('patch cells cover the whole footprint (clamped to the grid)', () => {
  const G = { x0: 0, z0: 0, dx: 16, dz: 16, nx: 10, nz: 10 };
  assert.deepEqual(patchCells([20, 20, 40, 33], G), [[1, 1], [2, 1], [1, 2], [2, 2]]);
  assert.deepEqual(patchCells([-11.5, -43.5, 11.5, 43.5], G), [[0, 0], [0, 1], [0, 2]]);
});

test('triLerp matches the corners and splits along u + v = 1', () => {
  assert.equal(triLerp(1, 2, 3, 4, 0, 0), 1);
  assert.equal(triLerp(1, 2, 3, 4, 0, 1), 2);
  assert.equal(triLerp(1, 2, 3, 4, 1, 1), 3);
  assert.equal(triLerp(1, 2, 3, 4, 1, 0), 4);
  assert.equal(triLerp(1, 2, 3, 4, 0.25, 0.25), 1 + 3 * 0.25 + 1 * 0.25);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test prototype/tests/*.test.mjs`
Expected: FAIL, `does not provide an export named 'UNDERPASS'`.

- [ ] **Step 3: Implement.** In `layoutFromWorld`, add `railBridges: w.railBridges || [],` after `rail: w.rail,`. After `bridgeAccepts` add:

```js
// #76: railway bridges over roads. The road dips into a cut so the deck's underside (surface - deck) clears it by `clear` m;
// the cut ramps out along the road at `grade`, with 1:`bank` grass banks beside it, never deeper than `maxDepth`.
export const UNDERPASS = { clear: 4.5, deck: 1.2, grade: 0.08, bank: 2, margin: 1, maxDepth: 6, apron: 3 };

export function pointAtLength(pts, t) {
  let acc = 0;
  if (t <= 0) return pts[0].slice();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= t) { const u = L ? (t - acc) / L : 0; return [ax + (bx - ax) * u, az + (bz - az) * u]; }
    acc += L;
  }
  return pts[pts.length - 1].slice();
}

function segmentHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az, u = (qx * sz - qz * sx) / den, v = (qx * rz - qz * rx) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v, sin: Math.abs(den) / (Math.hypot(rx, rz) * Math.hypot(sx, sz)) } : null;
}

export function railRoadCrossings(roads, railBridges) {
  const out = [];
  railBridges.forEach((rb, bridge) => {
    for (const road of roads) {
      if (road.bridge || (road.layer ?? 0) >= rb.layer) continue;
      let ta = 0;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1], la = Math.hypot(bx - ax, bz - az);
        let tb = 0;
        for (let j = 0; j < rb.pts.length - 1; j++) {
          const [cx, cz] = rb.pts[j], [dx, dz] = rb.pts[j + 1], lb = Math.hypot(dx - cx, dz - cz), h = segmentHit(ax, az, bx, bz, cx, cz, dx, dz);
          if (h) out.push({ road, bridge, x: ax + (bx - ax) * h.u, z: az + (bz - az) * h.u, tRoad: ta + la * h.u, tRail: tb + lb * h.v, sin: h.sin });
          tb += lb;
        }
        ta += la;
      }
    }
  });
  return out;
}

export function underpassDepth(deckMin, roadMax, u = UNDERPASS) { return Math.min(u.maxDepth, Math.max(0, u.clear + u.deck - (deckMin - roadMax))); }
export function cutFlat(deckHalfWidth, sin, u = UNDERPASS) { return deckHalfWidth / Math.max(0.3, sin) + u.apron; }

export function cutDepthAt(c, x, z, u = UNDERPASS) {
  if (c.depth <= 0) return 0;
  const n = nearestOnPolyline(c.pts, x, z), s = Math.abs(n.t - c.t), ramp = c.depth / u.grade, inner = c.hw + u.margin;
  const along = s <= c.flat ? 1 : Math.max(0, 1 - (s - c.flat) / ramp);
  const side = n.d <= inner ? 1 : Math.max(0, 1 - (n.d - inner) / (c.depth * u.bank));
  return c.depth * along * side;
}

export function cutBounds(c, u = UNDERPASS) {
  const ext = c.flat + c.depth / u.grade, pad = c.hw + u.margin + c.depth * u.bank, n = Math.max(1, Math.ceil(2 * ext / 2));
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k <= n; k++) { const [x, z] = pointAtLength(c.pts, c.t - ext + 2 * ext * k / n); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

export function patchCells([bx0, bz0, bx1, bz1], G) {
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v)), out = [];
  const i0 = cl(Math.floor((bx0 - G.x0) / G.dx), G.nx), i1 = cl(Math.floor((bx1 - G.x0) / G.dx), G.nx);
  const j0 = cl(Math.floor((bz0 - G.z0) / G.dz), G.nz), j1 = cl(Math.floor((bz1 - G.z0) / G.dz), G.nz);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}

export function triLerp(ha, hb, hc, hd, u, v) { return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v); }
```

- [ ] **Step 4: Run, expect pass**

Run: `node --test prototype/tests/*.test.mjs`
Expected: all pass (old and new).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): underpass helpers for rail bridges over roads (#76)"
```

---

### Task 3: Rail decks, cuts and the terrain patch in the game

**Files:**
- Modify: `prototype/index.html`. Line numbers are from `main` @ `188eb0f`; find each by its quoted text:
  - `:202` the import from `./world.js`
  - `:345-352` `OSM_BRIDGES`
  - `:359-366` `TGRID`/`terrainH`
  - `:377` `fillBridgeHeights();`
  - `:465` `railDist`
  - `:669-670` the ground mesh
  - `:713` the hero grouping
  - `:723-728` the generic bridges
  - `:946` debug hooks
  - `:1052` the minimap
- Create: `prototype/tests/test_underpass.py`

**Interfaces:**
- Consumes: everything Task 2 produces. `layoutFromWorld(...).railBridges`.
- Produces: the debug hooks `window.__mm.crossings() -> [{x, z, road, depth, deck, clearance, railGap}]`, `window.__mm.cutDepth(x, z) -> number` and `window.__mm.rayHits(x, z) -> {grass, road, roadOsm, stone, rail}` (top hit y per mesh role, `null` if no hit; roles without a mesh are absent).

- [ ] **Step 1: Write the failing Playwright test** `prototype/tests/test_underpass.py`:

```python
"""#76: rail bridges over roads become decks, the road dips into a cut underneath, level crossings stay level."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# both Laufenburgerstrasse track bridges (OSM w35583301, w1496246793) exactly as the pipeline writes them
LAUFENBURGER = [[[1546.7, 633.0], [1580.3, 626.0]], [[1580.7, 619.1], [1547.5, 626.1]]]
CROSS = (1569.7, 625.0)
LEVEL = [(1857.6, 566.8), (1228.0, 564.0)]          # railway=level_crossing nodes 651841741 and near 1327351950
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def served_world() -> str:
    """Before the #76 rebuild main's world has no railBridges: move the two known bridge pieces out of rail, as the pipeline does."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    if "railBridges" not in w:
        assert all(p in w["rail"] for p in LAUFENBURGER), "Laufenburgerstrasse bridge pieces not found in rail"
        w["rail"] = [p for p in w["rail"] if p not in LAUFENBURGER]
        w["railBridges"] = [{"pts": p, "layer": 1} for p in LAUFENBURGER]
    return json.dumps(w)


def run(server, script):
    body = served_world()
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.crossings && window.__mm.place", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = script(page)
        b.close()
    assert errors == [], errors
    return out


@needs_world
def test_laufenburgerstrasse_underpass(server):
    def script(page):
        r = {"xs": page.evaluate("() => window.__mm.crossings()")}
        page.evaluate(f"() => window.__mm.place({CROSS[0]}, 628.2)")
        page.wait_for_timeout(500)
        r["under"] = page.evaluate("() => window.__mm.car()")
        r["deck"] = page.evaluate("() => window.__mm.ground(1569.7, 628.2, 1e4)")
        r["on_deck"] = page.evaluate("() => window.__mm.sim(1552, 631.9, Math.atan2(-7, 33.6), 6, 2)")
        r["drive"] = page.evaluate("() => window.__mm.sim(1565.5, 675, Math.atan2(619.9 - 675, 1569.8 - 1565.5), 12, 6)")
        r["level"] = page.evaluate(f"() => {json.dumps(LEVEL)}.map(([x, z]) => window.__mm.cutDepth(x, z))")
        r["hits"] = page.evaluate("() => [window.__mm.rayHits(1569.7, 645), window.__mm.rayHits(1569.7, 628.2)]")
        return r
    r = run(server, script)
    print(json.dumps(r, indent=1))
    here = [c for c in r["xs"] if math.hypot(c["x"] - CROSS[0], c["z"] - CROSS[1]) < 15]
    assert len(here) == 2 and all(c["road"] == "Laufenburgerstrasse" for c in here), here
    assert all(c["clearance"] >= 4.45 for c in here), here
    assert all(c["railGap"] < 0.3 for c in here), here
    assert not r["under"]["bridge"] and r["deck"] - r["under"]["y"] >= 1.2 + 4.45 - 0.05, (r["under"], r["deck"])
    assert r["on_deck"]["bridge"] and r["on_deck"]["y"] > r["deck"] - 1.0, r["on_deck"]
    assert r["drive"]["z"] < 600 and not r["drive"]["bridge"], r["drive"]              # drove under both decks
    assert r["level"] == [0, 0]
    assert not any(math.hypot(c["x"] - x, c["z"] - z) < 30 for c in r["xs"] for x, z in LEVEL)
    ramp, deck = r["hits"]
    assert ramp["roadOsm"] >= ramp["grass"] - 0.005, ramp                              # grass stays under the road in the cut
    assert deck["stone"] - deck["roadOsm"] >= 1.2 + 4.45 - 0.1, deck                   # the drawn deck clears the drawn road


@needs_world
def test_every_underpass_has_headroom(server):
    xs = run(server, lambda page: page.evaluate("() => window.__mm.crossings()"))
    print(json.dumps(xs, indent=1))
    assert len(xs) >= 2
    bad = [c for c in xs if (c["clearance"] < 4.45 and c["depth"] < 5.99) or c["railGap"] >= 0.5]
    assert not bad, bad
```

- [ ] **Step 2: Commit and push, then run it and expect failure**

```bash
git add prototype/tests/test_underpass.py
git commit -m "test(world): Laufenburgerstrasse underpass under the rail bridges (#76)"
git push -u origin HEAD
```

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_underpass.py -q -s`
Expected: FAIL, a timeout waiting for `window.__mm.crossings`.

- [ ] **Step 3: Import.** Add to the `./world.js` import at `:202`: `UNDERPASS, pointAtLength, railRoadCrossings, underpassDepth, cutFlat, cutDepthAt, cutBounds, patchCells, triLerp`.

- [ ] **Step 4: Rail decks.** Change `const OSM_BRIDGES = [], BRIDGE_GRID = makeGrid(32);` to `const OSM_BRIDGES = [], BRIDGE_GRID = makeGrid(32), RAIL_DECKS = [];`. Directly after the `if (L) for (const r of L.bridges) { ... }` loop add:

```js
// #76: OSM railway bridges become rail decks -- ground from above like a road bridge (onBridge), nothing to a car underneath
if (L) for (const rb of L.railBridges) {
  const b = { r: { pts: rb.pts, w: 5.5 }, len: polylineLength(rb.pts), hw: 2.75, kind: 'rail', layer: rb.layer, h0: 0, h1: 0 };
  OSM_BRIDGES.push(b); RAIL_DECKS.push(b);
  for (let i = 0; i < rb.pts.length - 1; i++) gridAddSegment(BRIDGE_GRID, ...rb.pts[i], ...rb.pts[i + 1], b.hw * 2, b);
}
```

`fillBridgeHeights` already iterates `OSM_BRIDGES`, so rail decks get `h0`/`h1` from the terrain at their ends.

- [ ] **Step 5: Terrain reads the patch.** Rename the existing `function terrainH(x, z) { ... }` (`:360-366`) to `function meshH(x, z)`, with the body unchanged. Then add right after it:

```js
// #76: 16 m cells under a road cut are replaced by a CUT_N x CUT_N patch (key 'i,j' -> heights, row-major (CUT_N+1)^2);
// terrainH returns the patch surface there, with the mesh's own triangle split, so everything sits on what is drawn.
const CUT_N = 8, CUT_CELLS = new Map(), CUTS = [];
function terrainH(x, z) {
  const G = TGRID, fx = (x - G.x0) / G.dx, fz = (z - G.z0) / G.dz;
  if (CUT_CELLS.size && fx >= 0 && fz >= 0 && fx <= G.nx && fz <= G.nz) {
    const i = Math.min(Math.floor(fx), G.nx - 1), j = Math.min(Math.floor(fz), G.nz - 1), p = CUT_CELLS.get(i + ',' + j);
    if (p) {
      const sx = (fx - i) * CUT_N, sz = (fz - j) * CUT_N, a = Math.min(Math.floor(sx), CUT_N - 1), b = Math.min(Math.floor(sz), CUT_N - 1), W = CUT_N + 1;
      return triLerp(p[b * W + a], p[(b + 1) * W + a], p[(b + 1) * W + a + 1], p[b * W + a + 1], sx - a, sz - b);
    }
  }
  return meshH(x, z);
}
```

- [ ] **Step 6: Build the cuts** right after `fillBridgeHeights();` (`:377`):

```js
// #76: one cut per rail-deck/road crossing, sized on the uncut mesh (meshH), then the patches for every cell a cut touches
function makeCut(c) {
  const b = RAIL_DECKS[c.bridge], hw = c.road.w / 2, flat = cutFlat(b.hw, c.sin), span = hw / Math.max(0.3, c.sin) + 1;
  let deckMin = Infinity; for (const k of [-1, 0, 1]) deckMin = Math.min(deckMin, bridgeSurfaceAt(b, c.tRail + k * span));
  let roadMax = -Infinity; for (let s = -flat; s <= flat; s += 1) { const [x, z] = pointAtLength(c.road.pts, c.tRoad + s); roadMax = Math.max(roadMax, meshH(x, z) + 0.04); }
  return { pts: c.road.pts, t: c.tRoad, hw, flat, depth: underpassDepth(deckMin, roadMax), x: c.x, z: c.z, road: c.road, deck: b, tRail: c.tRail };
}
function cutDepth(x, z) { let d = 0; for (const c of CUTS) if (Math.abs(x - c.x) < 200 && Math.abs(z - c.z) < 200) d = Math.max(d, cutDepthAt(c, x, z)); return d; }
function buildCuts() {
  for (const c of railRoadCrossings(L.roads, L.railBridges)) CUTS.push(makeCut(c));
  const G = TGRID, W = CUT_N + 1;
  for (const c of CUTS) if (c.depth > 0) for (const [i, j] of patchCells(cutBounds(c), G)) {
    const key = i + ',' + j; if (CUT_CELLS.has(key)) continue;
    const p = new Float32Array(W * W);
    for (let b = 0; b < W; b++) for (let a = 0; a < W; a++) { const x = G.x0 + (i + a / CUT_N) * G.dx, z = G.z0 + (j + b / CUT_N) * G.dz; p[b * W + a] = meshH(x, z) - cutDepth(x, z); }
    CUT_CELLS.set(key, p);
  }
}
if (L) buildCuts();
```

- [ ] **Step 7: Ground mesh.** In the build block (`:669-670`), pull the ground colour ramp out of the vertex loop into `const groundCol = (h) => { const t = sm(h / 90); return t < 0.5 ? lo.clone().lerp(mid, t * 2) : mid.clone().lerp(hi, (t - 0.5) * 2); };`. Declare it next to `lo`, `mid` and `hi`, so those move up one scope, and use it in that loop. Its output must stay identical. Before `parts.grass = [ground.toNonIndexed()]`, add:

```js
  if (CUT_CELLS.size) { // #76: drop the coarse cells under a cut and draw their 2 m patches (the same heights terrainH returns)
    const p = ground.attributes.position, idx = ground.index.array, keep = [];
    for (let k = 0; k < idx.length; k += 3) {
      const cx = (p.getX(idx[k]) + p.getX(idx[k + 1]) + p.getX(idx[k + 2])) / 3, cz = (p.getZ(idx[k]) + p.getZ(idx[k + 1]) + p.getZ(idx[k + 2])) / 3;
      if (!CUT_CELLS.has(Math.floor((cx - TGRID.x0) / TGRID.dx) + ',' + Math.floor((cz - TGRID.z0) / TGRID.dz))) keep.push(idx[k], idx[k + 1], idx[k + 2]);
    }
    ground.setIndex(keep);
  }
```

After `parts.grass = [ground.toNonIndexed()];` add:

```js
  for (const key of CUT_CELLS.keys()) {
    const [i, j] = key.split(',').map(Number), g = new THREE.PlaneGeometry(TGRID.dx, TGRID.dz, CUT_N, CUT_N);
    g.rotateX(-Math.PI / 2); g.translate(TGRID.x0 + (i + 0.5) * TGRID.dx, 0, TGRID.z0 + (j + 0.5) * TGRID.dz);
    const q = g.attributes.position, uv = g.attributes.uv, cArr = new Float32Array(q.count * 3);
    for (let v = 0; v < q.count; v++) { const x = q.getX(v), z = q.getZ(v), h = terrainH(x, z), c = groundCol(h); q.setY(v, h); uv.setXY(v, (x - TGRID.x0) / 20, (TGRID.z0 + GD - z) / 20); cArr[v * 3] = c.r; cArr[v * 3 + 1] = c.g; cArr[v * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cArr, 3)); g.computeVertexNormals(); parts.grass.push(g.toNonIndexed());
  }
```

(The UVs match the big plane's: `u = (x − x0)/20`, `v = (z0 + GD − z)/20`.)

- [ ] **Step 8: Hero grouping and deck drawing.** At `:713` change `if (ob.kind !== 'generic')` to `if (ob.kind === 'wood' || ob.kind === 'stone')`. After the generic-bridge loop (`:723-728`) add:

```js
  // #76 rail decks: a stone box per <= 10 m piece with its top at the deck surface, the track on top
  for (const b of RAIL_DECKS) {
    const hs = (x, z) => bridgeSurfaceAt(b, nearestOnPolyline(b.r.pts, x, z).t), pts = resample(b.r.pts, 10);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      box(Math.hypot(x1 - x0, z1 - z0) + 0.1, UNDERPASS.deck, b.r.w, mx, hs(mx, mz) - UNDERPASS.deck, mz, Math.atan2(z1 - z0, x1 - x0), col('#b8b2a6'), 'stone', [4, 3], 0);
    }
    const g = ribbonGeo(b.r.pts, 2.5, 0.03, 4, false, (p) => hs(p[0], p[1])); colorize(g, col('#ffffff')); push('rail', g);
  }
```

The track ribbon at `:731` keeps drawing `L.rail`, which no longer holds the bridge pieces.

- [ ] **Step 9: Rail lines for trees and the minimap.** In `railDist` (`:465`) and in the minimap rail loop (`:1052`), replace `(L ? L.rail : [RAIL_PTS])` with `(L ? [...L.rail, ...L.railBridges.map(b => b.pts)] : [RAIL_PTS])`.

- [ ] **Step 10: Debug hooks** after `window.__mm.probe` (`:946`):

```js
window.__mm.cutDepth = (x, z) => cutDepth(x, z);
window.__mm.crossings = () => CUTS.map(c => {
  let road = -Infinity; for (let s = -c.flat + UNDERPASS.apron; s <= c.flat - UNDERPASS.apron; s += 1) { const [x, z] = pointAtLength(c.pts, c.t + s); road = Math.max(road, roadSurfH(x, z), terrainH(x, z)); }
  const deck = bridgeSurfaceAt(c.deck, c.tRail), p = c.deck.r.pts, ends = [[p[0], c.deck.h0], [p[p.length - 1], c.deck.h1]];
  return { x: c.x, z: c.z, road: c.road.n, depth: c.depth, deck, clearance: deck - UNDERPASS.deck - road,
           railGap: Math.max(...ends.map(([[x, z], h]) => Math.abs(Math.max(terrainH(x, z), roadSurfH(x, z)) - h))) };
});
window.__mm.rayHits = (x, z) => { const ray = new THREE.Raycaster(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)), out = {}; for (const role of ['grass', 'road', 'roadOsm', 'stone', 'rail']) { if (!MESH[role]) continue; const h = ray.intersectObject(MESH[role], false); out[role] = h.length ? h[0].point.y : null; } return out; };
```

- [ ] **Step 11: Run, expect pass**

Run: `node --test prototype/tests/*.test.mjs`, then `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_underpass.py -q -s`
Expected: 2 passed. The printed crossings show the two Laufenburgerstrasse entries with `depth > 0`. Paste the printed crossing list into the PR. If a check still fails after 3 attempts, stop and report the printed values.

- [ ] **Step 12: Commit and push**

```bash
git add prototype/index.html
git commit -m "feat(world): rail decks over roads with an underpass cut (#76)"
git push
```

---

### Task 4: Regression suite, changelog, TODO

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`)
- Modify: `TODO.md:60`

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Regression** (foreground, slow):

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/ -q`
Expected: all pass. That includes `test_hand_traced_fallback`, `test_osm_layout`, `test_grass_and_fields_stay_below_the_road`, `test_wheels_do_not_sink_into_the_road`, `test_no_trees_on_the_railway` and `test_osm_rhine_splash_and_overpass`. These run on `main`'s world. Before the rebuild it has no `railBridges`, so they prove the change is inert there. `test_underpass.py` covers the injected world. A failure here: fix the implementation, never the test.

- [ ] **Step 2: Changelog.** Under `## [Unreleased]` → `### Added`, add:

```markdown
- Railway bridges are real now: where the train crosses a road on a bridge — Laufenburgerstrasse in Sisseln, Hauptstrasse in Stein, Ankengasse in Mumpf and more — the tracks run over a stone deck and the road dips underneath, with room for a lorry. Drive under it, or follow the tracks over it. Level crossings stay level.
```

- [ ] **Step 3: TODO.** In `TODO.md:60`, replace `railway bridges are not modelled; the track ribbon follows the terrain.` with `railway bridges over roads are decks with an underpass cut since #76; elsewhere (and under road bridges) the track ribbon still follows the terrain.` Keep the rest of the line.

- [ ] **Step 4: Commit and push**

```bash
git add CHANGELOG.md TODO.md
git commit -m "docs: changelog and TODO for rail bridges and underpasses (#76)"
git push
```

---

### Task 5: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Task 1. Tasks 2–4 work without it.

The branch is already pushed, so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails**

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, do none of the following: no build, no change to `data/world_hochrhein.json`, no tile downloads, no `osmium` cut. State in the PR: "World not rebuilt: pipeline caches missing on this machine. Run Task 5 of docs/superpowers/plans/2026-10-03-rail-bridges-underpasses.md locally. Until then the game is unchanged on main's world; the Playwright test injects the Laufenburgerstrasse bridges."

- [ ] **Step 2: Golden tests** (they must pass, not skip):

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`
Expected: all pass, no `SKIPPED`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected log: `building heights from swissSURFACE3D: {...}`, and the summary shows `rail bridges N` with 8 ≤ N ≤ 18.

- [ ] **Step 4: Guard: the world may differ from `main` only in `rail` (bridge pieces removed), the new `railBridges` and `params.built`**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
old, new, bridges = a.pop("rail"), b.pop("rail"), b.pop("railBridges")
a.pop("railBridges", None)
assert a == b, ["other keys differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert all(p in old for p in new), "new rail pieces appeared"
bp = {tuple(p) for x in bridges for p in x["pts"]}
gone = [p for p in old if p not in new]
assert gone and all(all(tuple(q) in bp for q in p) for p in gone), ("removed pieces not in railBridges", gone[:5])
assert 8 <= len(bridges) <= 18 and all(x["layer"] >= 1 for x in bridges)
print("guard ok: rail", len(old), "->", len(new), "; railBridges", len(bridges))
EOF
```

Expected: `guard ok: rail 142 -> …; railBridges …`. If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys in the PR. They may come from other issues that changed the pipeline without rebuilding `main`'s world. Leave the rebuild to the maintainer.

- [ ] **Step 5: Re-run the underpass tests on the real world**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_underpass.py -q -s`
Expected: 2 passed. `test_every_underpass_has_headroom` now lists every crossing (about 16). Paste the list into the PR.

- [ ] **Step 6: Commit and push**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild the world with railway bridges (#76)"
git push
```
