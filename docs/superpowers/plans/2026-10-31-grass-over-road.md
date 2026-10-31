# Grass over the Road / Markings under It Implementation Plan (#290)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draped roads stay on top of the grass everywhere across their width, and road markings lie on the drawn road, never under it — `test_grass_and_fields_stay_below_the_road[osm]` goes green with its limits unchanged, including the Geuerenstrasse strip west of the Plattform Sisslerfeld.

**Architecture:** Three measured causes, three fixes, all as pure functions in `prototype/world.js` (node-tested) wired into `prototype/index.html`: (A) `ribbonLift` replaces `ribbonGeo`'s three-line bulge check with a lattice compared against the strip's own two triangles per quad; (B) `surfTriAt` + `surfFolds` lay markings on the highest drawn strip with the strip's folds as vertices (replacing the bilinear `surfaceAt`); (C) `keptRuns` drops markings on a bank road buried by a #78 abutment. The `grassOverRoad` hook also rays a fixed list of measured spots.

**Tech Stack:** three.js 0.170 buildless, Node 24 test runner (`node --test`), Playwright (Python) + pytest.

**Spec:** `docs/superpowers/specs/2026-10-31-grass-over-road-design.md` (has the measured numbers per spot).

**Model routing:** no graphics work; default model for all tasks.

## Global Constraints

- The check's limits stay as they are: `worst < 0.01`, `marksBelow == 0`, `done >= 2000` (osm) / `>= 200` (hand), `marksSeen > 5`. Never loosen them; the test may only get *more* assertions (the fixed spots).
- The road's 0.04 m lift (`ribbon(…, 0.04, …)`), the marks' 0.03 m lift, `polygonOffset`s and materials stay unchanged.
- `ribbonLift` lifts both ends of a quad by the quad's worst excess, uniformly across the width (as the old loop did). Do not level the road's cross-fall (out of scope, see spec).
- Marks: no `hw + 0.3` slack when another strip lifts a marking: a strip counts only where `surfTriAt` returns non-null.
- Only abutments (`onBridge(...)?.b.approach`) bury markings. A road passing *under* a deck keeps its markings.
- Memory rule on the agent box: every node/Python/browser command under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`; if it exits 137 or 143, shrink the job, never raise the cap. Use the GPU browser when `PW_CDP_ENDPOINT` is set (the conftest hook does this).
- Browser tests in the foreground only; commit and push the branch before running them. Run only the targeted test functions listed below, not the full suite.
- Commits: Conventional Commits, English, ending with the session's `Co-Authored-By` line. CHANGELOG entry hand-written, player voice, under `## [Unreleased]` → `### Fixed`, with the go-live time (`TZ=Europe/Zurich date '+%F %H:%M'`).

## Review Focus

1. **Lift is checked against the drawn triangles**, (A,B,C) and (A,C,D) with A/B = left/right at i, D/C at i+1 — the split `ribbonGeo` emits (`for (const v of [A, B, C, A, C, D])`). Any other split would reproduce cause A.
2. **Marks height = drawn surface**, the same triangle rule as `surfH` (`f >= t` → (A,B,C)), plus fold vertices; not bilinear.
3. **No marks under abutments only**; underpasses unaffected.
4. **Test tightened, not loosened** (fixed spots added, limits unchanged).
5. Load time: report the world build time before/after in the PR body (stopwatch on `#worldstatus` appearing, osm world, GPU browser, one run each).

---

## File Structure

| Path | Responsibility |
|---|---|
| `prototype/world.js` (modify) | New exports `ribbonLift`, `surfTriAt`, `surfFolds`, `keptRuns`. |
| `prototype/tests/world.test.mjs` (modify) | Node tests for the four functions. |
| `prototype/index.html` (modify) | Import them; `ribbonGeo` uses `ribbonLift`; marks loop uses `markGeo` (new, next to `ribbonGeo`) + `keptRuns`; delete `surfaceAt`; `grassOverRoad` fixed spots. |
| `prototype/tests/test_smoke.py` (modify) | `test_grass_and_fields_stay_below_the_road`: assert the fixed spots. |
| `CHANGELOG.md` (modify) | One `### Fixed` entry. |

---

### Task 1: `ribbonLift` — lift a draped strip over every fold under its drawn triangles

**Files:**
- Modify: `prototype/world.js` (append after `trisHeightAt`, which it uses)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- `ribbonLift(left, right, hl, hr, hAt, across = 0.5, along = 1) → Float64Array(left.length)`; `left`/`right` = `[[x, z], …]` edge points, `hl`/`hr` = edge heights (same length), `hAt([x, z])` = the height the strip must stay on or over.

- [ ] **Step 1: Write the failing tests**

Add `ribbonLift` to the `import { sampled, trisHeightAt, motorwayLabelSpots } from '../world.js';` line, then append:

```js
// #290: one 4 m quad along +x, 4 m wide: left edge z = -2, right edge z = +2 (A = left 0, B = right 0, C = right 1, D = left 1)
const QL = [[0, -2], [4, -2]], QR = [[0, 2], [4, 2]];

test('ribbonLift lifts a strip over a ridge between its centre and an edge', () => {
  const ridge = ([, z]) => Math.max(0, 0.1 - Math.abs(z - 1) * 0.2);   // peak 0.1 at z = 1; 0 at both edges and at the centre
  const up = ribbonLift(QL, QR, [0, 0], [0, 0], ridge);
  assert.ok(up[0] >= 0.1 - 1e-9 && up[1] >= 0.1 - 1e-9, `up ${[...up]}`);
});

test('ribbonLift lifts a twisted quad whose drawn diagonal runs under the ground', () => {
  // corners A 0, B 1, C 0, D 1: the drawn diagonal A-C lies at 0, the ground (bilinear through the corners) at 0.5 mid-quad
  const ground = ([x, z]) => { const v = x / 4, u = (z + 2) / 4; return (0 * (1 - v) + 1 * v) * (1 - u) + (1 * (1 - v) + 0 * v) * u; };
  const up = ribbonLift(QL, QR, [0, 1], [1, 0], ground);
  assert.ok(up[0] >= 0.5 - 1e-9 && up[1] >= 0.5 - 1e-9, `up ${[...up]}`);
});

test('ribbonLift leaves a strip on a plane alone', () => {
  const plane = ([x, z]) => 0.1 * x + 0.05 * z;
  const up = ribbonLift(QL, QR, [plane(QL[0]), plane(QL[1])], [plane(QR[0]), plane(QR[1])], plane);
  assert.ok(Math.max(...up) < 1e-9, `up ${[...up]}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs`
Expected: FAIL — `ribbonLift` is not exported (SyntaxError on import).

- [ ] **Step 3: Implement**

Append to `prototype/world.js` after `trisHeightAt`:

```js
// #290: how far to lift each vertex of a draped strip so its drawn triangles stay on or over hAt([x, z]) everywhere on it.
// Per quad (A/B = left/right at i, D/C at i + 1, drawn as (A,B,C) and (A,C,D) like ribbonGeo emits them) a lattice at most
// `across` m apart across and `along` m along, edges included; both ends of the quad take its worst excess. Lifting a quad's
// four corners by e raises both its triangles by e and its neighbours only rise, so one pass is enough.
export function ribbonLift(left, right, hl, hr, hAt, across = 0.5, along = 1) {
  const n = left.length, up = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const A = [left[i][0], hl[i], left[i][1]], B = [right[i][0], hr[i], right[i][1]], C = [right[i + 1][0], hr[i + 1], right[i + 1][1]], D = [left[i + 1][0], hl[i + 1], left[i + 1][1]];
    const tris = [...A, ...B, ...C, ...A, ...C, ...D];
    const wide = Math.max(Math.hypot(B[0] - A[0], B[2] - A[2]), Math.hypot(C[0] - D[0], C[2] - D[2])), long = Math.max(Math.hypot(D[0] - A[0], D[2] - A[2]), Math.hypot(C[0] - B[0], C[2] - B[2]));
    const nu = Math.max(1, Math.ceil(wide / across)), nv = Math.max(1, Math.ceil(long / along));
    let e = 0;
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
      const u = a / nu, v = b / nv, lx = A[0] + (D[0] - A[0]) * v, lz = A[2] + (D[2] - A[2]) * v, rx = B[0] + (C[0] - B[0]) * v, rz = B[2] + (C[2] - B[2]) * v;
      const x = lx + (rx - lx) * u, z = lz + (rz - lz) * u, drawn = trisHeightAt(tris, x, z);
      if (drawn !== -Infinity) e = Math.max(e, hAt([x, z]) - drawn);
    }
    up[i] = Math.max(up[i], e); up[i + 1] = Math.max(up[i + 1], e);
  }
  return up;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): ribbonLift checks a draped strip against its drawn triangles (#290)"
```

---

### Task 2: `surfTriAt`, `surfFolds`, `keptRuns` — markings on the drawn surface

**Files:**
- Modify: `prototype/world.js` (append after `ribbonLift`)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- `surfTriAt(sf, x, z) → number | null`; `sf = { pts, hw, hl, hr }` (a `ribbonGeo` strip's `userData.surf`). Nearest segment i, t = clamped projection, f = clamped `(side / hw + 1) / 2` (f = 0 on the left edge, side = `((x - ax) * -dz + (z - az) * dx) / len`, as `surfH`). Height `f >= t ? hA + (hB - hA)(f - t) + (hC - hA) t : hA + (hC - hA) f + (hD - hA)(t - f)` with hA = hl[i], hB = hr[i], hC = hr[i+1], hD = hl[i+1]. `null` when the nearest segment's distance > `hw + 0.01`.
- `surfFolds(sf, pts) → [[x, z], …]`: `pts` plus the crossings of each line segment with the transverse edges (s = 0, s = 1) and the diagonal (t = f) of the strip segments near it (nearest index to the line segment's midpoint ± 2), inside the strip (s, f in [0, 1]); sorted along the segment; crossings closer than 1e-4 (in segment parameter) to an end or to each other dropped.
- `keptRuns(pts, keep) → [[[x, z], …], …]`: the runs of consecutive points passing `keep(p)`, only runs of ≥ 2 points.

- [ ] **Step 1: Write the failing tests**

Add `surfTriAt, surfFolds, keptRuns` to the import line, then append:

```js
// #290: a strip one 4 m segment long along +x, hw 2, twisted: corners A (left 0) 0, B (right 0) 1, C (right 1) 0, D (left 1) 1
const TWIST = { pts: [[0, 0], [4, 0]], hw: 2, hl: [0, 1], hr: [1, 0] };

test('surfTriAt reads the drawn diagonal, not the bilinear centre', () => {
  assert.ok(Math.abs(surfTriAt(TWIST, 2, 0) - 0) < 1e-9);       // on the diagonal A-C: 0 (bilinear would be 0.5)
  assert.ok(Math.abs(surfTriAt(TWIST, 0, 0) - 0.5) < 1e-9);     // transverse edge A-B, halfway
  assert.ok(Math.abs(surfTriAt(TWIST, 1, 0) - 0.25) < 1e-9);    // t 0.25, f 0.5: triangle (A,B,C)
  assert.equal(surfTriAt(TWIST, 2, 2.5), null);                 // 2.5 m off the centre line, hw 2: not on the strip
});

test('surfFolds adds the diagonal crossing, so a line between its points stays on the drawn strip', () => {
  const line = surfFolds(TWIST, [[0, 0], [4, 0]]);
  assert.deepEqual(line.map(([x, z]) => [+x.toFixed(6), +z.toFixed(6)]), [[0, 0], [2, 0], [4, 0]]);
  for (const x of [0.5, 1, 1.5, 2.5, 3, 3.5]) {                 // linear between the fold points == the drawn surface
    const k = x < 2 ? 0 : 1, [a, b] = [line[k], line[k + 1]], u = (x - a[0]) / (b[0] - a[0]);
    const lin = surfTriAt(TWIST, ...a) * (1 - u) + surfTriAt(TWIST, ...b) * u;
    assert.ok(Math.abs(lin - surfTriAt(TWIST, x, 0)) < 1e-9, `x ${x}`);
  }
});

test('surfFolds leaves a line off the strip as it is', () => {
  assert.deepEqual(surfFolds(TWIST, [[0, 5], [4, 5]]), [[0, 5], [4, 5]]);
});

test('keptRuns splits a polyline around the dropped points', () => {
  const pts = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];
  assert.deepEqual(keptRuns(pts, ([x]) => x !== 2 && x !== 5), [[[0, 0], [1, 0]], [[3, 0], [4, 0]]]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs`
Expected: FAIL — the three names are not exported.

- [ ] **Step 3: Implement**

Append to `prototype/world.js` after `ribbonLift`:

```js
// #290: the height of a registered strip (sf = { pts, hw, hl, hr }) at (x, z) with the split it is drawn with -- triangle
// (A,B,C) where f >= t, (A,C,D) elsewhere, as surfH reads it -- on the nearest segment; null where the strip does not reach
export function surfTriAt(sf, x, z) {
  const { pts, hw, hl, hr } = sf; let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!L2) continue;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (!best || d < best.d) best = { d, i, t, f: Math.min(1, Math.max(0, (((x - ax) * -dz + (z - az) * dx) / Math.sqrt(L2) / hw + 1) / 2)) };
  }
  if (!best || best.d > hw + 0.01) return null;
  const { i, t, f } = best, hA = hl[i], hB = hr[i], hC = hr[i + 1], hD = hl[i + 1];
  return f >= t ? hA + (hB - hA) * (f - t) + (hC - hA) * t : hA + (hC - hA) * f + (hD - hA) * (t - f);
}
// #290: pts plus every point where the line crosses a fold of the strip under it -- a segment's transverse edge (s = 0, 1)
// or its diagonal (t = f) -- so heights from surfTriAt at the points, linear in between, lie on the drawn triangles
export function surfFolds(sf, pts) {
  const out = [pts[0]], eps = 1e-4;
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k], q = pts[k + 1], us = [], i0 = nearestOnPolyline(sf.pts, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2).i;
    for (let i = Math.max(0, i0 - 2); i <= Math.min(sf.pts.length - 2, i0 + 2); i++) {
      const [ax, az] = sf.pts[i], [bx, bz] = sf.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (!L2) continue;
      const len = Math.sqrt(L2), sf2 = ([x, z]) => [((x - ax) * dx + (z - az) * dz) / L2, (((x - ax) * -dz + (z - az) * dx) / len / sf.hw + 1) / 2];
      const [s0, f0] = sf2(p), [s1, f1] = sf2(q), ds = s1 - s0, df = f1 - f0, cand = [];
      if (ds) cand.push(-s0 / ds, (1 - s0) / ds);
      if (ds !== df) cand.push((f0 - s0) / (ds - df));
      for (const u of cand) { const s = s0 + ds * u, f = f0 + df * u; if (u > eps && u < 1 - eps && s >= -eps && s <= 1 + eps && f >= -eps && f <= 1 + eps) us.push(u); }
    }
    us.sort((a, b) => a - b);
    let last = 0; for (const u of us) { if (u - last < eps) continue; out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); last = u; }
    out.push(q);
  }
  return out;
}
// #290: the runs of consecutive points that pass keep (runs of one point dropped)
export function keptRuns(pts, keep) {
  const runs = []; let run = null;
  for (const p of pts) { if (keep(p)) (run ??= []).push(p); else if (run) { runs.push(run); run = null; } }
  if (run) runs.push(run);
  return runs.filter(r => r.length > 1);
}
```

(`sf2` is a local name to avoid shadowing `sf`; rename freely.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): surfTriAt, surfFolds and keptRuns for markings on the drawn road (#290)"
```

---

### Task 3: The check rays the measured spots (red first)

**Files:**
- Modify: `prototype/index.html:3964` (`window.__mm.grassOverRoad`)
- Modify: `prototype/tests/test_smoke.py:274-296` (`test_grass_and_fields_stay_below_the_road`)

- [ ] **Step 1: Extend the hook**

In `window.__mm.grassOverRoad`, after the `segs` loop and before `return`, ray a fixed list (OSM world only, and only when `only === null`). Refactor the per-ray body into a local `probe(x, z)` returning `{ d, marksBelow }` or `null` (no road or no green hit) that also updates `worst`/`bad`/`done`/`marksSeen`/`marksBelow`, call it for the segment points as today and for:

```js
const GRASS_SPOTS = L && only === null ? [   // #290: the measured spots (issue + Geuerenstrasse feedback 2026-10-29/30)
  [-2978.85, 610.72], [-2231.9, 705.4], [-4684.35, 3153.85], [1075.85, 1181.1], [1599.56, 962.82], [2632.99, -1038.57], [-1500.65, 5151.7],
  [-1219.25, 536.25], [-2944.65, 1608.5], [-456.7, 3812.45], [-1483.85, 450.2], [-3385.5, 686.3], [4207.95, -495.3], [1559.75, 1974],
  [271, 417.74], [274, 417.89], [277, 418.05], [280, 418.2], [283, 418.35], [286, 418.5]] : [];
```

pushing `{ at: [x, z], d, marksBelow }` into `spots` for each that returns non-null. Return `{ worst, bad, done, marksSeen, marksBelow, spots }`. Keep the segment sampling and the three ray offsets exactly as they are.

- [ ] **Step 2: Tighten the test**

In `test_grass_and_fields_stay_below_the_road`, after the existing asserts:

```python
    if mode == "osm":
        assert len(res["spots"]) >= 15, res                              # #290: the measured spots are on drawn road and grass
        assert all(s["d"] < 0.01 and s["marksBelow"] == 0 for s in res["spots"]), res["spots"]
```

Keep the existing asserts and limits unchanged.

- [ ] **Step 3: Commit, push, and run the test to verify it fails**

```bash
git add prototype/index.html prototype/tests/test_smoke.py
git commit -m "test(world): grass check rays the measured spots (#290)"
git push -u origin HEAD
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest "prototype/tests/test_smoke.py::test_grass_and_fields_stay_below_the_road" -x -q -s
```

Expected: `[hand]` PASS, `[osm]` FAIL with `worst` ≈ 0.058 and `marksBelow` > 0 (measured before the fix: worst 0.0578, 9 marks below; Geuerenstrasse spots up to 0.047).

---

### Task 4: Roads lift over every fold (cause A)

**Files:**
- Modify: `prototype/index.html:596` (import), `:1223-1225` (`ribbonGeo`)

- [ ] **Step 1: Import**

Add `ribbonLift, surfTriAt, surfFolds, keptRuns` to the `import { … } from './world.js';` list at `prototype/index.html:596`.

- [ ] **Step 2: Replace the bulge loop**

In `ribbonGeo`, replace the two comment lines starting `// edge heights; on terrain, where the ground mesh bulges` and the line starting `  if (onTerrain) { const up = new Float32Array(L);` (keep `const hl = left.map(hAt), hr = right.map(hAt);` between them) with:

```js
  // edge heights; on terrain, #290: lift both ends of a quad by the most the ground rises over its drawn triangles anywhere
  // across and along it (a fold between the edges, or the quad's own twist), so the strip stays on top
  const hl = left.map(hAt), hr = right.map(hAt);
  if (onTerrain) { const up = ribbonLift(left, right, hl, hr, hAt); for (let i = 0; i < L; i++) { hl[i] += up[i]; hr[i] += up[i]; } }
```

- [ ] **Step 3: Commit**

```bash
git add prototype/index.html
git commit -m "fix(world): draped roads stay over the grass across their whole width (#290)"
```

---

### Task 5: Markings on the drawn road, none under an abutment (causes B and C)

**Files:**
- Modify: `prototype/index.html:1216` (delete `surfaceAt`), add `markGeo` after `ribbonGeo`, `:1872-1879` (marks loop)

- [ ] **Step 1: Delete `surfaceAt`** (`prototype/index.html:1216`, one line; its only caller is the marks loop).

- [ ] **Step 2: Add `markGeo` right after `ribbonGeo`**

```js
// #290: a marking laid on the highest drawn road strip under it -- its own road's and any strip overlapping it (a parallel
// carriageway) -- with every fold of those strips as a vertex, so it never dips under the drawn road between its points
function markGeo(run, spec, sf) {
  if (!sf) return ribbonGeo(run, spec.w / 2, 0.03, spec.dash + spec.gap, true);
  const strips = new Set([sf]); for (const p of run) for (const { sf: o } of gridQuery(SURF_GRID, p[0], p[1], 1)) strips.add(o);
  let line = run; for (const s of strips) line = surfFolds(s, line);
  const h = (p) => { let y = -Infinity; for (const s of strips) { const v = surfTriAt(s, p[0], p[1]); if (v !== null && v > y) y = v; } return y; };
  return ribbonGeo(line, spec.w / 2, 0.03, spec.dash + spec.gap, false, h);
}
```

- [ ] **Step 3: Rewrite the marks loop**

Replace the body of `if (L) { // Swiss markings …` (`prototype/index.html:1872-1879`) with:

```js
  if (L) { // Swiss markings from the OSM tags, style-independent like the street names; one merged mesh per dash pattern
    const mats = {}, geos = {};
    const buried = ([x, z]) => { const ob = onBridge(x, z, 1e4); return !!ob && !!ob.b.approach; };   // #290: an abutment (#78) buries its bank road
    for (const r of ROADS) if (!r.bridge) for (const { pts, spec } of markLines(r)) {
      const key = spec.color + spec.dash + spec.gap;
      if (!mats[key]) { mats[key] = new THREE.MeshBasicMaterial({ map: markTex(spec.color === 'yellow' ? '#f2c21a' : '#f4f1e6', spec.dash, spec.gap), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); geos[key] = []; }
      const sf = ROAD_SURF.get(r);
      for (const run of keptRuns(resample(dropRepeats(pts), 4), (p) => !buried(p))) geos[key].push(markGeo(run, spec, sf));
    }
    for (const key in geos) if (geos[key].length) marks.add(new THREE.Mesh(mergeGeometries(geos[key], false), mats[key]));
  }
```

(`mats` line unchanged from today. `resample`/`dropRepeats` are already in scope.)

- [ ] **Step 4: Commit**

```bash
git add prototype/index.html
git commit -m "fix(world): road markings lie on the drawn road, none under the Fridolinsbrücke abutment (#290)"
```

---

### Task 6: Verify, changelog, push

- [ ] **Step 1: Node tests**

Run: `cd prototype && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node --test tests/world.test.mjs && cd ..`
Expected: PASS.

- [ ] **Step 2: CHANGELOG** — under `## [Unreleased]` → `### Fixed`, newest first, e.g.:

```markdown
- `YYYY-MM-DD HH:MM` **Grass** no longer pokes through the **road** on hillside stretches (e.g. the **Geuerenstrasse** towards the Plattform Sisslerfeld), and the **road markings** lie on the asphalt instead of sinking under it.
```

Commit: `git add CHANGELOG.md && git commit -m "docs(changelog): grass over the road and sunken markings (#290)"`, then `git push`.

- [ ] **Step 3: Targeted browser tests (foreground, after the push)**

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest "prototype/tests/test_smoke.py::test_grass_and_fields_stay_below_the_road" "prototype/tests/test_smoke.py::test_wheels_do_not_sink_into_the_road" -x -q -s
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_suedspange.py -x -q -s
```

Expected: all PASS; `[osm]` grass prints `worst < 0.01`, `marksBelow 0`, ≥ 15 spots all `d < 0.01`.

If `[osm]` still shows a spot ≥ 0.01: print that spot's `d`, check whether the strip has a fold the 0.5 m lattice misses (halve `across` for that check), or whether the hit mesh is not the road's own ribbon — do not raise the limit. If a mark spot stays below: check whether a covering strip is a kreisel ring/disc not in `SURF_GRID`. Stop after 3 attempts and report.

- [ ] **Step 4: PR** — body: Summary (three causes, measured numbers from the spec), Testing (node + the three pytest targets with their printed results), world build time before/after.
