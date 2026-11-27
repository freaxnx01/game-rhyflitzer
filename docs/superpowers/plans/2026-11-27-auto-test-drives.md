# Automatic test drives Implementation Plan (#1248)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly, exact road-vs-ground scan of the whole map (every non-bridge road, every 4 m, centre and both edges) that fails on new spots, plus an on-demand visual patrol (screenshots, video, contact sheets) whose vision review produces a `/processing-test-feedback` triage table.

**Architecture:** A new pure module `groundscan.js` answers vertical rays from a 2D grid index over the drawn triangles (no `THREE.Raycaster`, which tests every triangle of a merged mesh). `index.html` exposes it as `__mm.roadScan` / `__mm.indexTop`; `tests/test_road_scan.py` gates it against `tests/road_scan_known.json` and is picked up by the existing nightly run. Stage 2 is `scripts/patrol.py` (Playwright capture + ffmpeg) and the project command `.claude/commands/patrol.md` (one review subagent, files nothing).

**Tech Stack:** vanilla JS ES modules (`node --test`), three.js (game), Python 3 + Playwright + pytest, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-27-auto-test-drives-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- No new dependencies, no `package.json`. Only node built-ins, the vendored three.js, and the Python packages already in `pipeline/requirements.txt` / the test setup (pytest, playwright, pillow). ffmpeg is already required by `scripts/campath_video.py`.
- `groundscan.js` is pure: no DOM, no three.js import (like `route.js`).
- Constants, verbatim: `export const SCAN = { step: 4, inset: 0.3, tol: 0.01, cell: 16, near: 12 };`
- Roles, verbatim: road `['road', 'roadOsm', 'motorway']`, green `['grass', 'field', 'meadow']` — the same as `__mm.grassOverRoad` (index.html:6255).
- `__mm.grassOverRoad` and `test_grass_and_fields_stay_below_the_road` stay unchanged.
- Stage 2 is never wired into `.github/workflows/*`. It spends subscription tokens only when a person runs `/patrol`.
- The review subagent runs on Sonnet by default, Fable only with `--fable`, never Opus. It files no issues and edits no TODO.md.
- Browser tests run in the foreground, only the files you need; with the GPU browser: `PW_CDP_ENDPOINT=http://192.168.1.120:9223`. Anything heavy under `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0`.
- Node tests: `node --test tests/groundscan.test.mjs`. Python unit tests: `python -m pytest tests/test_patrol.py -q`.
- No CHANGELOG entry: nothing here is visible to the player (the changelog is written for the person playing, browser-game overlay).

## Review Focus

1. **Raycaster parity:** `topAt` must return what a ray from the sky hits first. Watch materials with `side: FrontSide`: the Raycaster skips back faces, the index does not. The parity test (Task 5) is the proof; if it fails on a role, filter that role's downward-facing triangles in the hook, not in the test.
2. **matrixWorld:** a role mesh with a non-identity transform must be transformed before indexing (`worldPositions`).
3. **Memory:** the index keeps references to the geometry's own arrays and only stores triangle ids per cell; no copy of the positions unless a transform forces one.
4. **Nightly message:** `tests/nightly_report.py` keeps 40 message lines, so the failure lists at most 30 spots, worst first.
5. **No CI for Stage 2:** `git grep -n patrol .github/` must stay empty.

---

### Task 1: `groundscan.js` — triangle index and `topAt`

**Files:**
- Create: `groundscan.js`
- Test: `tests/groundscan.test.mjs`

**Interfaces:**
- Produces: `SCAN`, `triangleIndex(pos, idx = null, cell = SCAN.cell) → { pos, idx, cell, cells }`, `topAt(index, x, z) → number | null`.

- [ ] **Step 1: Write the failing tests**

```js
// #1248: vertical rays over drawn triangles and the road-vs-ground scan. Pure module, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN, triangleIndex, topAt } from '../groundscan.js';

// a flat 20 x 20 m square at height h from two triangles, as a non-indexed position array (x, y, z per vertex)
const square = (h, x0 = 0, z0 = 0, s = 20) => [x0, h, z0, x0 + s, h, z0, x0, h, z0 + s, x0 + s, h, z0, x0 + s, h, z0 + s, x0, h, z0 + s];

test('SCAN_constants_matchTheSpec', () => {
  assert.deepEqual(SCAN, { step: 4, inset: 0.3, tol: 0.01, cell: 16, near: 12 });
});

test('topAt_pointInsideFlatSquare_returnsItsHeight', () => {
  const index = triangleIndex(new Float32Array(square(5)));
  assert.equal(topAt(index, 3, 7), 5);
  assert.equal(topAt(index, 19.5, 0.5), 5);
});

test('topAt_pointOutsideEveryTriangle_returnsNull', () => {
  const index = triangleIndex(new Float32Array(square(5)));
  assert.equal(topAt(index, 25, 5), null);
  assert.equal(topAt(index, -40, -40), null);
});

test('topAt_slopedTriangle_interpolatesBarycentrically', () => {
  const pos = new Float32Array([0, 0, 0, 10, 10, 0, 0, 20, 10]);   // y = x + 2z
  const index = triangleIndex(pos);
  assert.ok(Math.abs(topAt(index, 2, 3) - 8) < 1e-5);
});

test('topAt_twoStackedSurfaces_returnsTheHigherOne', () => {
  const index = triangleIndex(new Float32Array([...square(1), ...square(3)]));
  assert.equal(topAt(index, 10, 10), 3);
});

test('triangleIndex_indexedGeometry_readsCornersThroughTheIndex', () => {
  const pos = new Float32Array([0, 2, 0, 20, 2, 0, 0, 2, 20, 20, 2, 20]);
  const idx = new Uint32Array([0, 1, 2, 1, 3, 2]);
  assert.equal(topAt(triangleIndex(pos, idx), 15, 15), 2);
});

test('triangleIndex_triangleSpanningManyCells_isFoundInEachCell', () => {
  const index = triangleIndex(new Float32Array(square(4, -50, -50, 100)), null, 16);
  for (const [x, z] of [[-45, -45], [0, 0], [30, -20], [-20, 30]]) assert.equal(topAt(index, x, z), 4);
});

test('topAt_degenerateTriangle_isIgnored', () => {
  const index = triangleIndex(new Float32Array([0, 9, 0, 10, 9, 0, 20, 9, 0, ...square(1)]));
  assert.equal(topAt(index, 5, 0), 1);
});
```

- [ ] **Step 2: Run them, expect failure** — `node --test tests/groundscan.test.mjs` → fails with `Cannot find module '../groundscan.js'`.

- [ ] **Step 3: Implement**

```js
// groundscan.js — #1248: heights where a vertical ray from the sky first meets drawn triangles, from a 2D grid index
// (the Raycaster tests every triangle of a merged mesh), and the whole-map road-vs-ground scan built on it.
// Pure: no DOM, no three.js, so node --test can import it. World metres, x east, z south, y up.

export const SCAN = { step: 4, inset: 0.3, tol: 0.01, cell: 16, near: 12 };

const OFFSET = 32768;
const cellKey = (i, j) => (i + OFFSET) * 65536 + (j + OFFSET);
const corner = (idx, t, k) => (idx ? idx[3 * t + k] : 3 * t + k);

// pos: world-space x, y, z per vertex; idx: three vertex numbers per triangle, or null for a non-indexed array.
// The geometry's own arrays are kept by reference; the index only stores triangle numbers per cell.
export function triangleIndex(pos, idx = null, cell = SCAN.cell) {
  const count = (idx ? idx.length : pos.length / 3) / 3, cells = new Map();
  for (let t = 0; t < count; t++) addTriangle(cells, pos, idx, t, cell);
  return { pos, idx, cell, cells };
}

function addTriangle(cells, pos, idx, t, cell) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < 3; k++) {
    const v = corner(idx, t, k), x = pos[3 * v], z = pos[3 * v + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
    for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const key = cellKey(i, j), list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
}

// the highest drawn y at (x, z), or null where no triangle covers the point
export function topAt(index, x, z) {
  const list = index.cells.get(cellKey(Math.floor(x / index.cell), Math.floor(z / index.cell)));
  if (!list) return null;
  let top = null;
  for (const t of list) {
    const y = heightOnTriangle(index, t, x, z);
    if (y !== null && (top === null || y > top)) top = y;
  }
  return top;
}

const EDGE = -1e-9;   // a point on a shared edge belongs to both triangles
function heightOnTriangle({ pos, idx }, t, x, z) {
  const a = corner(idx, t, 0), b = corner(idx, t, 1), c = corner(idx, t, 2);
  const ax = pos[3 * a], az = pos[3 * a + 2], bx = pos[3 * b], bz = pos[3 * b + 2], cx = pos[3 * c], cz = pos[3 * c + 2];
  const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(det) < 1e-12) return null;   // seen edge-on from above: no plan area
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
  if (l1 < EDGE || l2 < EDGE || l3 < EDGE) return null;
  return l1 * pos[3 * a + 1] + l2 * pos[3 * b + 1] + l3 * pos[3 * c + 1];
}
```

- [ ] **Step 4: Run, expect green** — `node --test tests/groundscan.test.mjs`.
- [ ] **Step 5: Commit** — `git add groundscan.js tests/groundscan.test.mjs && git commit -m "feat(test): vertical-ray triangle index for the road scan (#1248)"`

---

### Task 2: `roadProbes` — every 4 m, centre and both edges

**Files:**
- Modify: `groundscan.js`
- Test: `tests/groundscan.test.mjs`

**Interfaces:**
- Produces: `roadProbes(roads, step = SCAN.step, inset = SCAN.inset) → [{ x, z, n, cls, side }]`, `side` ∈ `'centre' | 'left' | 'right'`. Right is `+normal` with normal `(-dz, dx)/len` (x east, z south: driving east, south is on the right).

- [ ] **Step 1: Write the failing tests** (add `roadProbes` to the import)

```js
const road = (pts, extra = {}) => ({ n: 'Hauptstrasse', cls: 'secondary', w: 6, bridge: false, pts, ...extra });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('roadProbes_straightRoad_probesEveryStepAtCentreAndBothEdges', () => {
  const probes = roadProbes([road([[0, 0], [10, 0]])], 4);
  assert.equal(probes.length, 9);   // stations 0, 4, 8
  const at4 = probes.filter((p) => near(p.x, 4));
  assert.deepEqual(at4.map((p) => p.side), ['centre', 'left', 'right']);
  assert.ok(near(at4[0].z, 0) && near(at4[1].z, -2.7) && near(at4[2].z, 2.7));   // w/2 - inset = 2.7
  assert.deepEqual({ n: at4[0].n, cls: at4[0].cls }, { n: 'Hauptstrasse', cls: 'secondary' });
});

test('roadProbes_stationsRunOnAcrossVertices', () => {
  const centres = roadProbes([road([[0, 0], [6, 0], [6, 6]])], 4).filter((p) => p.side === 'centre');
  assert.deepEqual(centres.map((p) => [p.x, p.z]), [[0, 0], [4, 0], [6, 2], [6, 6]]);
});

test('roadProbes_bridge_isSkipped', () => {
  assert.equal(roadProbes([road([[0, 0], [10, 0]], { bridge: true })]).length, 0);
});

test('roadProbes_zeroLengthSegment_isSkipped', () => {
  const centres = roadProbes([road([[0, 0], [0, 0], [8, 0]])], 4).filter((p) => p.side === 'centre');
  assert.deepEqual(centres.map((p) => p.x), [0, 4, 8]);
});

test('roadProbes_narrowerThanTwiceTheInset_keepsEdgesOnTheCentre', () => {
  const edges = roadProbes([road([[0, 0], [1, 0]], { w: 0.4 })]).filter((p) => p.side !== 'centre');
  assert.ok(edges.every((p) => near(p.z, 0)));
});
```

- [ ] **Step 2: Run, expect failure** (`roadProbes` is not exported).
- [ ] **Step 3: Implement**

```js
// #1248: probe points along every non-bridge road, by arc length across vertices
export function roadProbes(roads, step = SCAN.step, inset = SCAN.inset) {
  const out = [];
  for (const r of roads) if (!r.bridge) probesAlong(r, step, inset, out);
  return out;
}

function probesAlong(r, step, inset, out) {
  const off = Math.max(0, r.w / 2 - inset);
  let next = 0, run = 0;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
    if (!len) continue;
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    for (; next <= run + len + 1e-9; next += step) {
      const u = (next - run) / len, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      out.push(probe(r, x, z, 'centre'), probe(r, x - nx * off, z - nz * off, 'left'), probe(r, x + nx * off, z + nz * off, 'right'));
    }
    run += len;
  }
}

const probe = (r, x, z, side) => ({ x, z, n: r.n, cls: r.cls, side });
```

- [ ] **Step 4: Run, expect green** — `node --test tests/groundscan.test.mjs`.
- [ ] **Step 5: Commit** — `feat(test): road probes every 4 m for the road scan (#1248)`

---

### Task 3: `scanProbes`, `clusterSpots`, `diffKnown`

**Files:**
- Modify: `groundscan.js`
- Test: `tests/groundscan.test.mjs`

**Interfaces:**
- Produces: `scanProbes(probes, roadAt, greenAt, tol = SCAN.tol) → { done, worst, spots: [{ ...probe, yRoad, yGreen, d }] }`; `clusterSpots(spots, r = SCAN.near) → [{ ...worst spot, count }]` sorted by `d` descending; `diffKnown(spots, known, r = SCAN.near) → { fresh, gone }`.

- [ ] **Step 1: Write the failing tests**

```js
const P = (x, z, n = 'A') => ({ x, z, n, cls: 'residential', side: 'centre' });

test('scanProbes_greenAboveRoadBeyondTol_isASpot', () => {
  const res = scanProbes([P(0, 0), P(4, 0), P(8, 0)], () => 10, (x) => (x === 4 ? 10.05 : 9.9));
  assert.equal(res.done, 3);
  assert.ok(near(res.worst, 0.05, 1e-9));
  assert.equal(res.spots.length, 1);
  assert.deepEqual({ x: res.spots[0].x, yRoad: res.spots[0].yRoad, yGreen: res.spots[0].yGreen }, { x: 4, yRoad: 10, yGreen: 10.05 });
});

test('scanProbes_withinTol_isNoSpot', () => {
  assert.equal(scanProbes([P(0, 0)], () => 10, () => 10.009).spots.length, 0);
});

test('scanProbes_missingRoadOrGreen_isNotCounted', () => {
  const res = scanProbes([P(0, 0), P(4, 0)], (x) => (x ? null : 10), (x) => (x ? 11 : null));
  assert.deepEqual([res.done, res.worst, res.spots.length], [0, 0, 0]);
});

test('clusterSpots_neighboursOnTheSameRoad_mergeIntoTheWorst', () => {
  const s = [{ ...P(0, 0), d: 0.02 }, { ...P(4, 0), d: 0.09 }, { ...P(8, 0), d: 0.03 }, { ...P(4, 1, 'B'), d: 0.05 }, { ...P(100, 0), d: 0.04 }];
  const c = clusterSpots(s);
  assert.deepEqual(c.map((x) => [x.n, x.x, x.d, x.count]), [['A', 4, 0.09, 3], ['B', 4, 0.05, 1], ['A', 100, 0.04, 1]]);
});

test('diffKnown_splitsFreshAndGone', () => {
  const spots = [{ ...P(0, 0), d: 0.1 }, { ...P(500, 0), d: 0.1 }];
  const known = [{ x: 5, z: 5, n: 'A', issue: null }, { x: 900, z: 0, n: 'C', issue: 1300 }];
  const { fresh, gone } = diffKnown(spots, known);
  assert.deepEqual(fresh.map((s) => s.x), [500]);
  assert.deepEqual(gone.map((k) => k.x), [900]);
});
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement**

```js
// roadAt / greenAt: (x, z) => the highest drawn y of that surface there, or null
export function scanProbes(probes, roadAt, greenAt, tol = SCAN.tol) {
  let done = 0, worst = 0; const spots = [];
  for (const p of probes) {
    const yRoad = roadAt(p.x, p.z), yGreen = greenAt(p.x, p.z);
    if (yRoad === null || yGreen === null) continue;
    done++;
    const d = yGreen - yRoad;
    worst = Math.max(worst, d);
    if (d > tol) spots.push({ ...p, yRoad, yGreen, d });
  }
  return { done, worst, spots };
}

// one defect is a run of neighbouring probes: one entry per road and r metres, the worst probe standing for it
export function clusterSpots(spots, r = SCAN.near) {
  const out = [];
  for (const s of [...spots].sort((a, b) => b.d - a.d)) {
    const hit = out.find((c) => c.n === s.n && Math.hypot(c.x - s.x, c.z - s.z) <= r);
    if (hit) hit.count++; else out.push({ ...s, count: 1 });
  }
  return out;
}

export function diffKnown(spots, known, r = SCAN.near) {
  const close = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
  return { fresh: spots.filter((s) => !known.some((k) => close(s, k))), gone: known.filter((k) => !spots.some((s) => close(s, k))) };
}
```

- [ ] **Step 4: Run, expect green** — then the whole node suite: `node --test tests/*.test.mjs`.
- [ ] **Step 5: Commit** — `feat(test): scan, cluster and compare road-scan spots (#1248)`

---

### Task 4: Python side of the gate — known list and the failure message

**Files:**
- Create: `tests/road_scan_report.py`, `tests/road_scan_known.json` (content `[]` for now; seeded in Task 6)
- Test: `tests/test_road_scan_report.py`

**Interfaces:**
- Produces: `load_known(path) → list[dict]` (raises `ValueError` on an entry without numeric `x`/`z`), `spot_line(spot) → str`, `failure_message(fresh, gone, limit=30) → str`.
- Consumes: spots from `__mm.roadScan` (`x, z, E, N, n, cls, side, yRoad, yGreen, d, count`).

- [ ] **Step 1: Write the failing tests**

```python
"""#1248: the pure parts of the road-scan gate (no browser)."""
import json

import pytest

import road_scan_report as rs

SPOT = {"x": 1599.56, "z": 962.82, "E": 2639599.6, "N": 1266037.2, "n": "Hauptstrasse", "cls": "secondary",
        "side": "left", "yRoad": 301.12, "yGreen": 301.19, "d": 0.07, "count": 3}


def test_spot_line_names_place_road_side_and_height():
    assert rs.spot_line(SPOT) == ("x 1599.6 z 962.8 | LV95 2639600 / 1266037 | Hauptstrasse (secondary), left | "
                                  "green 0.070 m over road (301.12), 3 probes")


def test_spot_line_without_lv95_or_name():
    line = rs.spot_line({**SPOT, "E": None, "N": None, "n": ""})
    assert "LV95 —" in line and "(unnamed) (secondary)" in line


def test_failure_message_lists_worst_first_and_caps_the_lines():
    fresh = [{**SPOT, "x": float(i), "d": i / 1000} for i in range(40)]
    lines = rs.failure_message(fresh, [], limit=30).splitlines()
    assert lines[0] == "40 new grass-over-road spots (tests/road_scan_known.json lists the known ones):"
    assert len(lines) == 32 and lines[1].startswith("x 39.0") and lines[-1] == "... and 10 more"


def test_failure_message_mentions_gone_spots():
    msg = rs.failure_message([], [{"x": 1.0, "z": 2.0, "n": "A", "issue": 1300}])
    assert "1 known spot no longer found" in msg and "x 1.0 z 2.0 (A, #1300)" in msg


def test_load_known_reads_the_list_and_rejects_bad_entries(tmp_path):
    good = tmp_path / "k.json"
    good.write_text(json.dumps([{"x": 1, "z": 2, "n": "A", "issue": None}]), encoding="utf-8")
    assert rs.load_known(good) == [{"x": 1, "z": 2, "n": "A", "issue": None}]
    bad = tmp_path / "b.json"
    bad.write_text(json.dumps([{"x": "1", "z": 2}]), encoding="utf-8")
    with pytest.raises(ValueError):
        rs.load_known(bad)


def test_committed_known_list_is_valid():
    rs.load_known(rs.KNOWN)
```

- [ ] **Step 2: Run, expect failure** — `python -m pytest tests/test_road_scan_report.py -q` (module missing).
- [ ] **Step 3: Implement** `tests/road_scan_report.py`

```python
"""#1248: the road-scan gate's pure parts -- the known-spot list and the failure message nightly_report.py files."""
import json
from pathlib import Path

KNOWN = Path(__file__).parent / "road_scan_known.json"


def load_known(path=KNOWN):
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    for e in entries:
        if not all(isinstance(e.get(k), (int, float)) and not isinstance(e.get(k), bool) for k in ("x", "z")):
            raise ValueError(f"{path}: every known spot needs numeric x and z, got {e!r}")
    return entries


def spot_line(s):
    lv95 = "LV95 —" if s.get("E") is None else f"LV95 {round(s['E'])} / {round(s['N'])}"
    return (f"x {s['x']:.1f} z {s['z']:.1f} | {lv95} | {s.get('n') or '(unnamed)'} ({s['cls']}), {s['side']} | "
            f"green {s['d']:.3f} m over road ({s['yRoad']:.2f}), {s['count']} probes")


def failure_message(fresh, gone, limit=30):
    lines = []
    if fresh:
        lines.append(f"{len(fresh)} new grass-over-road spots (tests/road_scan_known.json lists the known ones):")
        ordered = sorted(fresh, key=lambda s: -s["d"])
        lines += [spot_line(s) for s in ordered[:limit]]
        if len(ordered) > limit:
            lines.append(f"... and {len(ordered) - limit} more")
    if gone:
        lines.append(f"{len(gone)} known spot no longer found (remove from tests/road_scan_known.json):")
        lines += [f"x {k['x']:.1f} z {k['z']:.1f} ({k.get('n') or '(unnamed)'}, #{k.get('issue')})" for k in gone]
    return "\n".join(lines)
```

(The test imports `road_scan_report` the way the other `tests/*.py` helpers are imported — `tests/` is on the pytest path, see `tests/test_nightly_report.py`.)

- [ ] **Step 4: Run, expect green.**
- [ ] **Step 5: Commit** — `feat(test): road-scan known list and failure message (#1248)`

---

### Task 5: Browser hooks `__mm.roadScan` / `__mm.indexTop` and the Raycaster parity test

**Files:**
- Modify: `index.html` (import line next to the `route.js` import at :1121; hooks right after `window.__mm.grassOverRoad` ends, ~:6276)
- Create: `tests/test_road_scan.py`

**Interfaces:**
- Consumes: `triangleIndex`, `topAt`, `roadProbes`, `scanProbes`, `clusterSpots`, `SCAN` (Tasks 1-3); `debugPosition` (already imported, :1075); `ROADS`, `MESH`, `L`.
- Produces: `window.__mm.indexTop(roles, points) → (number|null)[]`; `window.__mm.roadScan(step = SCAN.step) → { ms, probes, done, worst, spots }`, each spot with `E`, `N` (null in the hand world).

- [ ] **Step 1: Write the failing browser test** `tests/test_road_scan.py` (parity part only; Task 6 adds the gate)

```python
"""#1248: the whole-map road-vs-ground scan on the drawn triangles (groundscan.js). Slow: foreground, OSM world only."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.roadScan && document.querySelector('#worldstatus')?.textContent"
GREEN = ["grass", "field", "meadow"]
ROAD = ["road", "roadOsm"]   # __mm.rayHits has no motorway role
# grassOverRoad's measured spots (#290) plus open ground, a field and a junction near Sisseln
POINTS = [[-2978.85, 610.72], [-2231.9, 705.4], [1075.85, 1181.1], [1599.56, 962.82], [2632.99, -1038.57],
          [-1219.25, 536.25], [271, 417.74], [1559.75, 1974], [1780, 560], [3500, 3000], [1528, 409]]


@pytest.fixture(scope="module")
def page(server):
    if not (WORLD.exists() and MMH.exists()):
        pytest.skip("run pipeline/osm.py build and terrain.py first")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        pg = browser.new_page(viewport={"width": 320, "height": 180})
        pg.goto(f"{server}/index.html")
        pg.wait_for_function(READY, timeout=240000)
        pg.wait_for_selector("#mmhstatus.real", timeout=240000)
        yield pg
        browser.close()


def highest_ray(hits, roles):
    ys = [hits[r] for r in roles if hits.get(r) is not None]
    return max(ys) if ys else None


@pytest.mark.parametrize("roles", [GREEN, ROAD], ids=["green", "road"])
def test_index_heights_match_the_raycaster(page, roles):
    tops = page.evaluate("([roles, pts]) => window.__mm.indexTop(roles, pts)", [roles, POINTS])
    rays = [highest_ray(page.evaluate("([x, z]) => window.__mm.rayHits(x, z)", pt), roles) for pt in POINTS]
    assert sum(r is not None for r in rays) >= 5, rays   # the points must reach drawn surfaces at all
    for pt, top, ray in zip(POINTS, tops, rays):
        assert (top is None) == (ray is None), (pt, top, ray)
        if ray is not None:
            assert abs(top - ray) < 0.001, (pt, top, ray)
```

- [ ] **Step 2: Run, expect failure** — `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest tests/test_road_scan.py -v` → times out on `READY` (no `roadScan`).
- [ ] **Step 3: Implement** in `index.html`

Import (next to the other module imports):

```js
import { SCAN, triangleIndex, topAt, roadProbes, scanProbes, clusterSpots } from './groundscan.js';   // #1248
```

Hooks, right after `grassOverRoad`:

```js
// #1248: the whole-map road-vs-ground scan. A vertical ray only needs the triangles under (x, z), so groundscan.js answers
// it from a 2D grid over each role's CPU positions (#323) instead of the Raycaster, which tests every merged triangle.
function worldPositions(mesh) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position.array;
  if (mesh.matrixWorld.equals(new THREE.Matrix4())) return pos;
  const v = new THREE.Vector3(), out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mesh.matrixWorld); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
}
function rolesTopAt(roles) {
  const indexes = roles.filter((r) => MESH[r]).map((r) => triangleIndex(worldPositions(MESH[r]), MESH[r].geometry.index?.array ?? null));
  return (x, z) => indexes.reduce((top, i) => { const y = topAt(i, x, z); return y !== null && (top === null || y > top) ? y : top; }, null);
}
window.__mm.indexTop = (roles, points) => { const at = rolesTopAt(roles); return points.map(([x, z]) => at(x, z)); };
window.__mm.roadScan = (step = SCAN.step) => {
  const t0 = performance.now(), roadAt = rolesTopAt(['road', 'roadOsm', 'motorway']), greenAt = rolesTopAt(['grass', 'field', 'meadow']);
  const probes = roadProbes(ROADS, step), res = scanProbes(probes, roadAt, greenAt);
  const spots = clusterSpots(res.spots).map((s) => { const p = debugPosition(L && L.origin, s.x, s.z); return { ...s, E: p.E ?? null, N: p.N ?? null }; });
  return { ms: performance.now() - t0, probes: probes.length, done: res.done, worst: res.worst, spots };
};
```

Check `debugPosition`'s return when there is no origin (debug.js:23) and keep `E`/`N` `null` then.

- [ ] **Step 4: Run, expect green** (same command). If a role fails parity, see Review Focus 1.
- [ ] **Step 5: Commit** — `feat(test): __mm.roadScan on a triangle index, checked against the Raycaster (#1248)`

---

### Task 6: The nightly gate and the seeded known list

**Files:**
- Modify: `tests/test_road_scan.py`, `tests/road_scan_known.json`, `tests/shard_durations.json` (one entry for the new file)

**Interfaces:**
- Consumes: `__mm.roadScan` (Task 5), `road_scan_report` (Task 4).

- [ ] **Step 1: Write the failing test** (append to `tests/test_road_scan.py`; add `import road_scan_report as rs` and `NEAR = 12  # groundscan.js SCAN.near`)

```python
def diff_known(spots, known, r=NEAR):
    close = lambda a, b: ((a["x"] - b["x"]) ** 2 + (a["z"] - b["z"]) ** 2) ** 0.5 <= r
    return [s for s in spots if not any(close(s, k) for k in known)], [k for k in known if not any(close(s, k) for s in spots)]


def test_no_new_grass_over_road_spots(page):
    """Every non-bridge road, every 4 m, centre and both edges: drawn grass, field or meadow must not stand over the
    drawn road. Known spots (tests/road_scan_known.json) do not fail; new ones are listed for the nightly issue."""
    res = page.evaluate("() => window.__mm.roadScan(4)")
    print({k: res[k] for k in ("ms", "probes", "done", "worst")}, len(res["spots"]), "spots")
    assert res["probes"] > 200000, res["probes"]          # 420.7 km of non-bridge road x 3 / 4 m ~ 315,000 (2026-11-27)
    assert res["done"] >= 0.8 * res["probes"], (res["done"], res["probes"])
    assert res["ms"] < 120000, res["ms"]
    fresh, gone = diff_known(res["spots"], rs.load_known())
    if gone:
        print(rs.failure_message([], gone))
    assert not fresh, rs.failure_message(fresh, gone)
```

(`diff_known` mirrors `groundscan.js diffKnown` in Python so the gate needs no second page round-trip; `NEAR` must stay equal to `SCAN.near`.)

- [ ] **Step 2: Run, watch it** — `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest tests/test_road_scan.py -v -s`. With the empty list it fails if today's world has spots, or passes if it has none. If `ms` exceeds 120 s, profile the index build (cell size) before touching the limit.
- [ ] **Step 3: Seed the known list** — write every spot of that run into `tests/road_scan_known.json` as `{"x": <1 decimal>, "z": <1 decimal>, "n": "<road>", "d": <3 decimals>, "issue": null}`, sorted by `d` descending. List them in the PR description so the maintainer can file them. Add `"test_road_scan.py": <measured seconds>` to `tests/shard_durations.json` `seconds_per_test`.
- [ ] **Step 4: Run again, expect green.** Then `python -m pytest tests/test_road_scan_report.py tests/test_shard_plan.py -q` and `node --test tests/*.test.mjs`.
- [ ] **Step 5: Commit** — `feat(test): nightly road-vs-ground scan of the whole map (#1248)`

---

### Task 7: Patrol hooks and the pure parts of `scripts/patrol.py`

**Files:**
- Modify: `index.html` (next to `window.__mm.naviStart`, :6083)
- Create: `scripts/patrol.py`, `scripts/patrol_routes.json`
- Test: `tests/test_patrol.py`

**Interfaces:**
- Produces (JS): `window.__mm.dest(name) → { n, x, z, ... } | null`; `window.__mm.naviRoute() → [[x, z], ...] | null`.
- Produces (Python): `load_route(routes, route_id) → (route | None, error | None)`, `stations(pts, step) → [{ x, z, th, s }]`, `frame_of(sheet, tile) → int`, `video_cmd(frames_dir, out, fps) → list[str]`, `sheet_cmd(video, out_dir, fps) → list[str]`, `review_prompt(route_id, frames, sheets) → str`.

- [ ] **Step 1: Write the failing tests** `tests/test_patrol.py`

```python
"""#1248: the pure parts of scripts/patrol.py (no browser)."""
import json
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import patrol  # noqa: E402

ROUTES = Path(__file__).parents[1] / "scripts" / "patrol_routes.json"


def test_committed_routes_have_from_and_to():
    routes = json.loads(ROUTES.read_text(encoding="utf-8"))
    assert routes["sisseln-eiken"] == {"from": "Bahnhof Sisseln", "to": "Bahnhof Eiken"}
    for rid in routes:
        assert patrol.load_route(routes, rid)[1] is None


def test_load_route_unknown_or_incomplete():
    assert "unknown route" in patrol.load_route({"a": {"from": "X", "to": "Y"}}, "b")[1]
    assert "needs" in patrol.load_route({"a": {"from": "X"}}, "a")[1]


def test_stations_every_step_with_the_road_heading():
    st = patrol.stations([[0, 0], [30, 0], [30, 30]], 25)
    assert [(round(s["x"], 6), round(s["z"], 6), round(s["s"])) for s in st] == [(0, 0, 0), (25, 0, 25), (30, 20, 50)]
    assert st[0]["th"] == 0 and math.isclose(st[2]["th"], math.pi / 2)   # route.js: th = atan2(dz, dx)


def test_stations_reject_a_bad_step():
    with pytest.raises(ValueError):
        patrol.stations([[0, 0], [1, 0]], 0)


def test_frame_of_maps_sheet_tiles_row_major():
    assert patrol.frame_of(1, 1) == 1
    assert patrol.frame_of(1, 16) == 16
    assert patrol.frame_of(3, 5) == 37


def test_video_and_sheet_commands():
    assert patrol.video_cmd("d/frames", "d/patrol.mp4", 2) == [
        "ffmpeg", "-v", "error", "-y", "-framerate", "2", "-i", "d/frames/f-%04d.png",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "d/patrol.mp4"]
    assert patrol.sheet_cmd("d/patrol.mp4", "d", 2) == [
        "ffmpeg", "-v", "error", "-y", "-i", "d/patrol.mp4", "-vf", "fps=2,scale=800:-1,tile=4x4", "d/sheet-%02d.jpg"]


def test_review_prompt_names_the_format_and_forbids_filing():
    text = patrol.review_prompt("sisseln-eiken", 120, ["sheet-01.jpg", "sheet-02.jpg"])
    assert "| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link |" in text
    assert "manifest.json" in text and "findings.md" in text and "sheet-02.jpg" in text
    assert "Do not file issues" in text
    assert "(sheet - 1) * 16 + tile" in text
```

- [ ] **Step 2: Run, expect failure** — `python -m pytest tests/test_patrol.py -q`.
- [ ] **Step 3: Implement**

`scripts/patrol_routes.json`:

```json
{
  "sisseln-eiken": { "from": "Bahnhof Sisseln", "to": "Bahnhof Eiken" }
}
```

`index.html`, next to `naviStart`:

```js
window.__mm.dest = (name) => destEntries().find((e) => e.n === name) ?? null;   // #1248: a jump/Navi destination by name (patrol start and goal)
window.__mm.naviRoute = () => (NAVIS.route ? NAVIS.route.pts.map(([x, z]) => [x, z]) : null);   // #1248: the planned polyline the patrol walks
```

`scripts/patrol.py` (pure part; `run`/`main` follow in Task 8):

```python
#!/usr/bin/env python3
"""#1248: the visual patrol -- place the car along a named route every ~25 m, screenshot each step with the debug panel,
build a video and 4x4 contact sheets, and write review.md for the /patrol review subagent.

    python scripts/patrol.py --route sisseln-eiken --out /tmp/patrol-xyz

PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser. ffmpeg must be on the PATH. No tokens, no CI.
"""
from __future__ import annotations

import math

TILES = 16   # 4x4 per contact sheet
TRIAGE_HEADER = "| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link |"


def load_route(routes: dict, route_id: str):
    if route_id not in routes:
        return None, f"unknown route {route_id!r}; known: {', '.join(sorted(routes))}"
    route = routes[route_id]
    if not (isinstance(route, dict) and route.get("from") and route.get("to")):
        return None, f"route {route_id!r} needs 'from' and 'to' destination names"
    return route, None


def stations(pts, step: float) -> list[dict]:
    """Points every step metres along the polyline (arc length across vertices), heading along the segment."""
    if step <= 0:
        raise ValueError(f"step must be positive, got {step}")
    out, run, nxt = [], 0.0, 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        length = math.hypot(x1 - x0, z1 - z0)
        if not length:
            continue
        th = math.atan2(z1 - z0, x1 - x0)
        while nxt <= run + length + 1e-9:
            u = (nxt - run) / length
            out.append({"x": x0 + (x1 - x0) * u, "z": z0 + (z1 - z0) * u, "th": th, "s": nxt})
            nxt += step
        run += length
    return out


def frame_of(sheet: int, tile: int) -> int:
    """Sheet k, tile t (row-major, both 1-based) -> frame number (1-based), one frame per tile."""
    return (sheet - 1) * TILES + tile


def video_cmd(frames_dir: str, out: str, fps: int) -> list[str]:
    return ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", f"{frames_dir}/f-%04d.png",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]


def sheet_cmd(video: str, out_dir: str, fps: int) -> list[str]:
    return ["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"fps={fps},scale=800:-1,tile=4x4", f"{out_dir}/sheet-%02d.jpg"]


def review_prompt(route_id: str, frames: int, sheets: list[str]) -> str:
    return "\n".join([
        f"# Patrol review: {route_id}",
        "",
        f"{frames} frames, one per tile, in {len(sheets)} contact sheets: {', '.join(sheets)}.",
        "Frame number = (sheet - 1) * 16 + tile (tiles row-major, both 1-based). The full frame is frames/f-NNNN.png;",
        "manifest.json gives each frame's x, z, LV95 E/N and heading.",
        "",
        "Look at every sheet. Open the full frame for anything suspicious. List world defects only: grass or field on",
        "the road, stray or coloured triangles, floating or sunken objects, holes in the ground, z-fighting, missing",
        "textures, walls or decks in the wrong place. Not: lighting taste, HUD layout, the car itself.",
        "",
        "Write findings.md in this directory: one row per anomaly in the /processing-test-feedback triage format,",
        "",
        TRIAGE_HEADER,
        "|---|---|---|---|---|---|---|",
        "",
        "Note = what and where (x/z and LV95 from manifest.json); Att. = the frame file; Disposition = a proposal only.",
        "No anomaly: write findings.md with the header and the line 'No anomalies.'.",
        "Do not file issues, do not edit TODO.md, do not change code.",
    ]) + "\n"
```

- [ ] **Step 4: Run, expect green.**
- [ ] **Step 5: Commit** — `feat(test): patrol routes, stations and review prompt (#1248)`

---

### Task 8: `scripts/patrol.py` capture run

**Files:**
- Modify: `scripts/patrol.py`
- Test: `tests/test_patrol.py` (one browser test, foreground)

**Interfaces:**
- Consumes: `shots.serve`, `shots.READY`, `shots.LOADED`, `shots.ARGS`, `shots.T` (scripts/shots.py:173-174, :309); `gpu_browser.resolve_endpoint`; `hermetic_api.route_gallery`; `__mm.place`, `__mm.naviStart`, `__mm.dest`, `__mm.naviRoute`, `__mm.stepped`, `__mm.tick`, `__mm.debug` (index.html:6018, 6083, 9089, 9100, 8778).
- Produces: `main(argv) → int`; in `--out`: `frames/f-0001.png …`, `manifest.json`, `patrol.mp4`, `sheet-01.jpg …`, `review.md`. `--limit N` stops after N stations (for the test).

- [ ] **Step 1: Write the failing browser test** (append to `tests/test_patrol.py`)

```python
WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"


def test_patrol_writes_frames_manifest_video_sheets_and_review(tmp_path):
    """Slow: loads the OSM world. Foreground only."""
    if not WORLD.exists() or patrol.shutil.which("ffmpeg") is None:
        pytest.skip("needs the OSM world and ffmpeg")
    rc = patrol.main(["--route", "sisseln-eiken", "--out", str(tmp_path), "--limit", "3", "--size", "640x360"])
    assert rc == 0
    assert sorted(p.name for p in (tmp_path / "frames").iterdir()) == ["f-0001.png", "f-0002.png", "f-0003.png"]
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert [m["i"] for m in manifest] == [1, 2, 3]
    assert all(m["E"] is not None and m["N"] is not None for m in manifest)
    assert math.hypot(manifest[1]["x"] - manifest[0]["x"], manifest[1]["z"] - manifest[0]["z"]) == pytest.approx(25, abs=0.5)
    assert (tmp_path / "patrol.mp4").stat().st_size > 0
    assert (tmp_path / "sheet-01.jpg").exists()
    assert "sheet-01.jpg" in (tmp_path / "review.md").read_text(encoding="utf-8")
```

- [ ] **Step 2: Run, expect failure** — `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest tests/test_patrol.py -v` (`patrol.main` missing).
- [ ] **Step 3: Implement** — follow `scripts/campath_video.py`'s `run`/`start_page` (lines 106-150) closely:

- `parse_args`: `--route` (required), `--out` (required, `Path`), `--step` (float, 25), `--size` (reuse `campath_video.parse_size`, default 1280x720), `--limit` (int, 0 = all), `--settle` (int, 4: ticks before each screenshot).
- `main`: ffmpeg on the PATH (same message as campath_video), `load_route` from `scripts/patrol_routes.json`, then `run`.
- `run`: resolve the endpoint, `shots.serve`, context with `viewport=size, device_scale_factor=1, locale="en-US"`, `hermetic_api.route_gallery(context)`, collect `pageerror`s; `page.goto(f"{base}/index.html?debug=1")`, wait `shots.READY`, click `#cruisebtn`, wait `shots.LOADED` with `True` (measured terrain). Do **not** hide the car (the chase view is the point).
- Look up both ends with `__mm.dest`; fail with a clear message naming the missing destination. `__mm.place(from.x, from.z)`, `__mm.naviStart(to.n)` (fail if false: "no route from … to …"), `pts = __mm.naviRoute()`, then `__mm.stepped(true)`.
- For each of `stations(pts, step)[:limit or None]`, numbered from 1: `__mm.place(x, z, th)`, `--settle` × `__mm.tick(1 / 30)`, `page.screenshot(path=out/frames/f-{i:04d}.png)` (whole page: the DOM debug panel is in it), `pos = __mm.debug().pos`, append `{i, x, z, E, N, th, s}` (rounded to 0.1 m / 0.001 rad). Print progress every 10 frames.
- In `finally`: `__mm.stepped(false)`, close the browser, shut the server down.
- Afterwards: `manifest.json`; `video_cmd(out/frames, out/patrol.mp4, 2)`; `sheet_cmd(out/patrol.mp4, out, 2)`; `review.md` from `review_prompt(route_id, len(manifest), sorted sheet names)`. Any non-zero ffmpeg exit or a page error → return 1 with the message.

- [ ] **Step 4: Run, expect green** — the browser test, then `python -m pytest tests/test_patrol.py -q` in full.
- [ ] **Step 5: Commit** — `feat(test): visual patrol capture with video and contact sheets (#1248)`

---

### Task 9: `/patrol` command

**Files:**
- Create: `.claude/commands/patrol.md`
- Test: `tests/test_patrol.py` (one static check)

- [ ] **Step 1: Write the failing test**

```python
COMMAND = Path(__file__).parents[1] / ".claude" / "commands" / "patrol.md"


def test_patrol_command_runs_the_script_and_never_files():
    text = COMMAND.read_text(encoding="utf-8")
    assert "scripts/patrol.py" in text and "mktemp -d" in text
    assert 'model: "sonnet"' in text and 'model: "fable"' in text and "never Opus" in text
    assert "/processing-test-feedback" in text and "files nothing" in text


def test_no_workflow_runs_the_patrol():
    workflows = Path(__file__).parents[1] / ".github" / "workflows"
    assert not any("patrol" in p.read_text(encoding="utf-8") for p in workflows.glob("*.yml"))
```

- [ ] **Step 2: Run, expect failure** (file missing).
- [ ] **Step 3: Write `.claude/commands/patrol.md`**

```markdown
---
description: Visual patrol along a named route — screenshots, video, contact sheets, one vision review as a triage table
argument-hint: <route-id> [--fable]
---

Drive the patrol for `$ARGUMENTS` (#1248). Routes: `scripts/patrol_routes.json`.

1. Make your own output directory with `mktemp -d` and use only that one.
2. Run in the foreground (never in the background), with the GPU browser if reachable:
   `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 scripts/patrol.py --route <route-id> --out <dir>`
3. Dispatch exactly one review subagent with the Agent tool: `model: "sonnet"` by default, `model: "fable"` only when
   `--fable` was given, never Opus. Its prompt: "Read <dir>/review.md and follow it." plus the directory path.
4. When it returns, print `<dir>/findings.md` and the directory, then tell the user to run
   `/processing-test-feedback` on those findings. This command files nothing: no issues, no TODO.md, no code.

If you run into blockers, find a solution and update this command for the future.
```

- [ ] **Step 4: Run, expect green** — `python -m pytest tests/test_patrol.py -q -k "command or workflow"`.
- [ ] **Step 5: Commit** — `feat(test): /patrol command for the on-demand visual review (#1248)`

---

### Task 10: Full local verification

- [ ] `node --test tests/*.test.mjs`
- [ ] `python -m pytest tests/test_road_scan_report.py tests/test_patrol.py tests/test_shard_plan.py tests/test_select_tests.py -q` (the browser test in `test_patrol.py` runs too; foreground)
- [ ] `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest tests/test_road_scan.py tests/test_smoke.py -k "road_scan or grass" -v`
- [ ] `git grep -n patrol .github/` prints nothing.
- [ ] PR description: the seeded known spots (Task 6) as a table and the measured `ms`/`probes`/`done`. Do **not** run `/patrol` itself (it spends tokens); the maintainer runs it after merge.
