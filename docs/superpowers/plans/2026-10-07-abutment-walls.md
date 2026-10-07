# Trough Walls for Rail Underpasses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rail underpasses get an absolute, junction-capped cut floor and stone trough walls instead of graded banks. The world file is then rebuilt with its 18 `railBridges`, so #76 ships in the game.

**Architecture:** Pure cut geometry lives in `prototype/world.js`: floor target, junction cap, reach, floor lookup, bounds and wall stations. `prototype/index.html` builds the cuts from the uncut mesh (`meshH`), bakes `min(meshH, floor)` into 1 m terrain patches, then draws one stone box plus one collider per wall piece. The world rebuild is #76's Task 5 and needs the local pipeline caches.

**Tech Stack:** Vanilla JS ES modules, three.js, `node --test` for pure helpers, pytest + Playwright (Chromium, SwiftShader) for browser tests, Python pipeline (`pipeline/osm.py`).

**Spec:** `docs/superpowers/specs/2026-10-07-abutment-walls-design.md` (issue #119; #76's spec: `docs/superpowers/specs/2026-10-03-rail-bridges-underpasses-design.md`).

## Global Constraints

- Buildless static game. No new packages, no `package.json`, no framework (CLAUDE.md, browser-game overlay).
- `UNDERPASS` after this plan: `{ clear: 4.5, deck: 1.2, lift: 0.04, grade: 0.08, margin: 1, wall: 2, maxDepth: 6, apron: 3 }`. `bank` is gone.
- Terrain patch resolution under cuts: `CUT_N = 16` (1 m cells on the 16 m grid).
- Headroom: uncapped crossings `clearance ≥ 4.45` (or `depth ≥ 5.99`); capped crossings `clearance ≥ 2.0`; every crossing `railGap < 0.3`.
- Walls: face at `hw + margin` from the road centre, `UNDERPASS.wall` = 2 m thick, top = ground behind + 1 m. Under the deck band (`|s| ≤ flat − apron`) the top is `max(ground, deckMin − deck)`, with no parapet. Stone colour `#b8b2a6`, role `'stone'`, like the rail deck.
- Browser tests run in the **foreground**, capped:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest …` (each ~45–90 s). Commit and push before long verification.
- The CHANGELOG is hand-written, player-facing, in English. Never `git cliff -o CHANGELOG.md`.
- A failing pre-existing test is fixed in the implementation, never by editing the test, unless this plan says to change that test.

## Review Focus

1. **Two cuts on one road** (parallel tracks; Laufenburgerstrasse has two decks 7 m apart). Expected: one continuous wall run per side, not two overlapping boxes. Pinned in Task 2's browser test (no two same-side walls within 1 m).
2. **A car on the rail deck above a wall.** Expected: it drives on, not stopped by an invisible collider. Pinned in Task 2 (`pushAt` at deck height does not move it).
3. **A junction or road-piece end inside the reach.** Expected: the floor equals the ground there, so there is no step into the side road or the next piece. Pinned in Task 1's `junctionCap` unit tests, including the piece-end entries.
4. **Grass in front of the wall face or over the road in the trough.** Expected: the road surface is the top surface across the road. Pinned in Task 2 (`rayHits` across the road in the trough).
5. **A crossing whose deck is already high enough** (`f0 ≥ ground`). Expected: no cut, no walls, `depth 0` (Ankengasse). Pinned in Task 1 (`cutReach` returns `[0, 0]` when the floor is at or above the ground) and Task 3's real-world list.

---

### Task 1: Absolute, junction-capped cut floor

**Files:**
- Modify: `prototype/world.js:104` (`UNDERPASS`), `prototype/world.js:145-161` (replace `underpassDepth`, `cutDepthAt`, `cutBounds`)
- Modify: `prototype/index.html:241` (import), `:478` (`CUT_N`), `:500-519` (`makeCut`, `cutDepth`, `buildCuts`), `:1217-1222` (`window.__mm.crossings`)
- Test: `prototype/tests/world.test.mjs:3` (import), `:399-434` (replace the cut tests)
- Test: `prototype/tests/test_underpass.py` (headroom rule)

**Interfaces:**
- Produces (in `world.js`):
  - `UNDERPASS` as in Global Constraints.
  - `cutFloorTarget(deckMin: number, ground: number, u = UNDERPASS): number`: the floor height at the crossing.
  - `junctionCap(f0: number, flat: number, junctions: {s: number, ground: number}[], u = UNDERPASS): { f0: number, capped: object | null }`.
  - `cutFloor(c, s: number, u = UNDERPASS): number`: `c.f0 + u.grade * max(0, |s| − c.flat)`.
  - `cutReach(c, groundAt: (s: number) => number, u = UNDERPASS): [back: number, ahead: number]`.
  - `cutFloorAt(c, x, z, u = UNDERPASS): number | null`.
  - `cutBounds(c, u = UNDERPASS): [x0, z0, x1, z1]`.
  - A cut object `c = { pts, t, hw, flat, f0, reach: [back, ahead], capped, depth, x, z, road, deck, tRail, deckMin }`.
- Produces (in `index.html`): the `CUTS` entries above; `cutFloorMin(x, z)`; `window.__mm.crossings()` entries gain `capped: {x, z, s} | null`.
- Consumes: `nearestOnPolyline`, `pointAtLength`, `cutFlat`, `patchCells`, `triLerp`, `railRoadCrossings` (unchanged, `world.js`); `meshH`, `terrainH`, `bridgeSurfaceAt`, `RAIL_DECKS`, `L.junctions` (`[x, z, r]`) in `index.html`.

- [ ] **Step 1: Write the failing unit tests.** In `prototype/tests/world.test.mjs`, change the import on line 3: replace `underpassDepth, cutFlat, cutDepthAt, cutBounds,` with `cutFlat, cutFloorTarget, junctionCap, cutFloor, cutReach, cutFloorAt, cutBounds,`. Then replace everything from `test('underpassDepth keeps 4.5 m …` through the end of `test('cutBounds holds every point with depth > 0' …});` (lines 399–434, keeping the `cutFlat` test unchanged in place) with:

```js
test('cutFloorTarget keeps 4.5 m plus the road lift under a 1.2 m deck, at most 6 m below the ground', () => {
  assert.ok(Math.abs(cutFloorTarget(20, 15) - (20 - 1.2 - 4.5 - 0.04)) < 1e-9);
  assert.equal(cutFloorTarget(10, 15), 15 - UNDERPASS.maxDepth);
});

test('cutFlat covers the deck footprint on the road plus the apron, skew-limited', () => {
  assert.equal(cutFlat(2.75, 1), 5.75);
  assert.ok(Math.abs(cutFlat(2.75, 0.1) - (2.75 / 0.3 + 3)) < 1e-9);
});

test('junctionCap raises the floor so the ramp meets each junction at its own ground', () => {
  assert.deepEqual(junctionCap(10, 6, []), { f0: 10, capped: null });
  assert.deepEqual(junctionCap(10, 6, [{ s: 50, ground: 12 }]), { f0: 10, capped: null });   // 12 - 0.08 * 44 = 8.48: the ramp is already up
  const one = junctionCap(10, 6, [{ s: 20, ground: 13 }]);                                    // 13 - 0.08 * 14 = 11.88
  assert.ok(Math.abs(one.f0 - 11.88) < 1e-9); assert.equal(one.capped.s, 20);
  const two = junctionCap(10, 6, [{ s: 20, ground: 13 }, { s: -10, ground: 12 }]);           // the second: 12 - 0.32 = 11.68
  assert.ok(Math.abs(two.f0 - 11.88) < 1e-9); assert.equal(two.capped.s, 20);
  const inBand = junctionCap(10, 6, [{ s: -4, ground: 12.5, end: true }]);                    // a piece end under the deck: no cut there at all
  assert.equal(inBand.f0, 12.5); assert.equal(inBand.capped.end, true);
});

const CUT = { pts: [[0, -100], [0, 100]], t: 100, hw: 4.5, flat: 6, f0: 10, reach: [30, 40] };   // crossing at z = 0
test('cutFloor is level under the deck band and ramps out at 8 %', () => {
  assert.equal(cutFloor(CUT, 0), 10);
  assert.equal(cutFloor(CUT, -6), 10);
  assert.ok(Math.abs(cutFloor(CUT, 16) - 10.8) < 1e-9);
  assert.ok(Math.abs(cutFloor(CUT, -16) - 10.8) < 1e-9);
});

test('cutReach ends each side where the floor meets the ground, at most flat + maxDepth / grade', () => {
  const c = { ...CUT, reach: undefined };
  assert.deepEqual(cutReach(c, (s) => (s >= 0 ? 12.4 : 10.4)), [11, 36]);   // behind: 6 + 0.4 / 0.08, ahead: 6 + 2.4 / 0.08
  assert.deepEqual(cutReach(c, () => 100), [81, 81]);
  assert.deepEqual(cutReach(c, () => 9), [0, 0]);                        // the deck is high enough: no cut
});

test('cutFloorAt: the floor inside the corridor (to the middle of the wall) and the reach, else null', () => {
  assert.equal(cutFloorAt(CUT, 0, 0), 10);
  assert.equal(cutFloorAt(CUT, 6.5, 0), 10);                             // hw 4.5 + margin 1 + wall / 2
  assert.equal(cutFloorAt(CUT, 6.6, 0), null);
  assert.ok(Math.abs(cutFloorAt(CUT, 0, 31) - 12) < 1e-9);
  assert.equal(cutFloorAt(CUT, 0, -31), null);
  assert.ok(Math.abs(cutFloorAt(CUT, 0, 40) - 12.72) < 1e-9);
  assert.equal(cutFloorAt(CUT, 0, 40.5), null);
});

test('cutBounds holds every point with a floor, padded by the wall and one cell', () => {
  const [x0, z0, x1, z1] = cutBounds(CUT);
  [-8.5, -38.5, 8.5, 48.5].forEach((want, k) => assert.ok(Math.abs([x0, z0, x1, z1][k] - want) < 1e-9, `${k}: ${[x0, z0, x1, z1][k]}`));   // reach plus hw 4.5 + margin 1 + wall 2 + 1
  for (let x = -20; x <= 20; x += 0.5) for (let z = -60; z <= 60; z += 0.5) if (cutFloorAt(CUT, x, z) !== null) assert.ok(x > x0 && x < x1 && z > z0 && z < z1, `${x},${z}`);
});
```

- [ ] **Step 2: Run the unit tests to verify they fail.**

Run: `cd prototype && node --test tests/world.test.mjs`
Expected: FAIL. The new names do not exist yet (`SyntaxError: The requested module '../world.js' does not provide an export named 'cutFloorTarget'`).

- [ ] **Step 3: Implement the helpers in `prototype/world.js`.** Replace line 104 with:

```js
export const UNDERPASS = { clear: 4.5, deck: 1.2, lift: 0.04, grade: 0.08, margin: 1, wall: 2, maxDepth: 6, apron: 3 };
```

Replace `underpassDepth` (line 145), `cutDepthAt` (148–154) and `cutBounds` (156–161) with the following, keeping `cutFlat` (146) as is:

```js
// #119: a cut is an absolute floor along its road, level across the corridor: f0 under the deck band, ramping out at
// u.grade until it meets the ground. The road ribbon lies u.lift above the floor.
export function cutFloorTarget(deckMin, ground, u = UNDERPASS) { return Math.max(deckMin - u.deck - u.clear - u.lift, ground - u.maxDepth); }
// junctions (and the road piece's own ends) inside the reach keep their ground: the ramp must reach it by then
export function junctionCap(f0, flat, junctions, u = UNDERPASS) {
  let out = { f0, capped: null };
  for (const j of junctions) { const f = j.ground - u.grade * Math.max(0, Math.abs(j.s) - flat); if (f > out.f0) out = { f0: f, capped: j }; }
  return out;
}
export function cutFloor(c, s, u = UNDERPASS) { return c.f0 + u.grade * Math.max(0, Math.abs(s) - c.flat); }
// per side, the first whole metre outward where the floor reaches the ground (groundAt takes the signed distance s)
export function cutReach(c, groundAt, u = UNDERPASS) {
  const max = c.flat + u.maxDepth / u.grade;
  return [-1, 1].map((dir) => { for (let s = 0; s < max; s++) if (cutFloor(c, s, u) >= groundAt(dir * s) - 1e-9) return s; return max; });
}
export function cutFloorAt(c, x, z, u = UNDERPASS) {
  const n = nearestOnPolyline(c.pts, x, z), s = n.t - c.t;
  if (n.d > c.hw + u.margin + u.wall / 2 || s < -c.reach[0] || s > c.reach[1]) return null;
  return cutFloor(c, s, u);
}
export function cutBounds(c, u = UNDERPASS) {
  const a = c.t - c.reach[0], b = c.t + c.reach[1], pad = c.hw + u.margin + u.wall + 1, n = Math.max(1, Math.ceil(b - a));
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k <= n; k++) { const [x, z] = pointAtLength(c.pts, a + (b - a) * k / n); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
```

- [ ] **Step 4: Run the unit tests to verify they pass.**

Run: `cd prototype && for f in tests/*.test.mjs; do node --test $f 2>&1 | grep -E '^ℹ (pass|fail)'; done`
Expected: every file reports `fail 0`. (Pass files one at a time; `node --test tests/` with a directory does not run them.)

- [ ] **Step 5: Write the failing browser test (headroom rule).** In `prototype/tests/test_underpass.py`, replace the last two lines of `test_every_underpass_has_headroom`:

```python
    bad = [c for c in xs if (c["clearance"] < 4.45 and c["depth"] < 5.99) or c["railGap"] >= 0.5]
    assert not bad, bad
```

with:

```python
    # #119: a cut capped by a junction or road-piece end keeps the side road connected and only has to let a car through
    bad = [c for c in xs if (c["clearance"] < (2.0 if c["capped"] else 4.45) and c["depth"] < 5.99) or c["railGap"] >= 0.3]
    assert not bad, bad
    print("capped:", [(c["road"], round(c["clearance"], 2), c["capped"]) for c in xs if c["capped"]])
```

- [ ] **Step 6: Run it to verify it fails.**

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py -q -s -p no:cacheprovider` (from the repo root; in a worktree without its own venv, use the main checkout's `pipeline/.venv/bin/python`)
Expected: FAIL. The page errors on load (`index.html` still imports `underpassDepth` / `cutDepthAt`), so `errors == []` fails, or `KeyError: 'capped'`.

- [ ] **Step 7: Switch the game to the new cut model.** In `prototype/index.html`:

7a. In the import on line 241, replace `underpassDepth, cutFlat, cutDepthAt, cutBounds,` with `cutFlat, cutFloorTarget, junctionCap, cutReach, cutFloorAt, cutBounds,`.

7b. Line 478: `const CUT_N = 8, CUT_CELLS = new Map(), CUTS = [];` → `const CUT_N = 16, CUT_CELLS = new Map(), CUTS = [];`, and in the comment above it change `CUT_N x CUT_N patch` to `CUT_N x CUT_N patch (1 m cells, so a trough wall's step stays behind its face)`.

7c. Replace the comment line `// #76: one cut per rail-deck/road crossing, sized on the uncut mesh (meshH), …` and the functions `makeCut`, `cutDepth` and `buildCuts`, up to and excluding `if (L) buildCuts();`, with:

```js
// #76/#119: one cut per rail-deck/road crossing, an absolute floor sized on the uncut mesh (meshH): level across the
// corridor, ramping out until it meets the ground. Junctions and the road piece's own ends inside its reach cap it, so
// side roads keep their ground (#120 lets them descend instead). Then the patches for every cell a cut touches.
function makeCut(c) {
  const b = RAIL_DECKS[c.bridge], hw = c.road.w / 2, flat = cutFlat(b.hw, c.sin), span = hw / Math.max(0.3, c.sin) + 1;
  let deckMin = Infinity; for (const k of [-1, 0, 1]) deckMin = Math.min(deckMin, bridgeSurfaceAt(b, c.tRail + k * span));
  const groundAt = (s) => { const [x, z] = pointAtLength(c.road.pts, c.tRoad + s); return meshH(x, z); };
  const cut = { pts: c.road.pts, t: c.tRoad, hw, flat, f0: cutFloorTarget(deckMin, groundAt(0)), capped: null, x: c.x, z: c.z, road: c.road, deck: b, tRail: c.tRail, deckMin };
  cut.reach = cutReach(cut, groundAt);
  Object.assign(cut, junctionCap(cut.f0, flat, cutJunctions(cut)));
  cut.reach = cutReach(cut, groundAt); cut.depth = Math.max(0, groundAt(0) - cut.f0);
  return cut;
}
// junctions on the cut road and the road piece's two ends, inside the current reach, with their ground
function cutJunctions(cut) {
  const len = polylineLength(cut.pts), out = [];
  const add = (x, z, s, end) => { if (s >= -cut.reach[0] && s <= cut.reach[1]) out.push({ x, z, s, ground: meshH(x, z), end }); };
  for (const [jx, jz] of L.junctions) { const n = nearestOnPolyline(cut.pts, jx, jz); if (n.d < cut.hw + 2) add(jx, jz, n.t - cut.t, false); }
  add(...cut.pts[0], -cut.t, true); add(...cut.pts[cut.pts.length - 1], len - cut.t, true);
  return out;
}
function cutFloorMin(x, z) { let f = Infinity; for (const c of CUTS) if (c.depth > 0 && Math.abs(x - c.x) < 200 && Math.abs(z - c.z) < 200) { const h = cutFloorAt(c, x, z); if (h !== null) f = Math.min(f, h); } return f; }
function cutDepth(x, z) { return meshH(x, z) - terrainH(x, z); }
function buildCuts() {
  for (const c of railRoadCrossings(L.roads, L.railBridges)) CUTS.push(makeCut(c));
  const G = TGRID, W = CUT_N + 1;
  for (const c of CUTS) if (c.depth > 0) for (const [i, j] of patchCells(cutBounds(c), G)) {
    const key = i + ',' + j; if (CUT_CELLS.has(key)) continue;
    const p = new Float32Array(W * W);
    for (let b = 0; b < W; b++) for (let a = 0; a < W; a++) { const x = G.x0 + (i + a / CUT_N) * G.dx, z = G.z0 + (j + b / CUT_N) * G.dz; p[b * W + a] = Math.min(meshH(x, z), cutFloorMin(x, z)); }
    CUT_CELLS.set(key, p);
  }
}
```

(`polylineLength` is already imported on line 241. `ribbonGeo` and `surfaceAt` are no longer used by `makeCut`; leave them, they draw the roads.)

7d. In `window.__mm.crossings` (line ~1220), change the returned object's first line from
`return { x: c.x, z: c.z, road: c.road.n, depth: c.depth, deck, clearance: deck - UNDERPASS.deck - road,`
to
`return { x: c.x, z: c.z, road: c.road.n, depth: c.depth, capped: c.capped && { x: c.capped.x, z: c.capped.z, s: c.capped.s }, deck, clearance: deck - UNDERPASS.deck - road,`.

- [ ] **Step 8: Run the underpass tests to verify they pass.**

Run: the Step 6 command.
Expected: `2 passed`. Laufenburgerstrasse (injected): both crossings have `clearance ≥ 4.45`, `railGap < 0.3`, and `capped: None`, since no junction lies within reach at y ≈ 621–628.

- [ ] **Step 9: Commit and push.**

```bash
git add prototype/world.js prototype/index.html prototype/tests/world.test.mjs prototype/tests/test_underpass.py
git commit -m "feat(world): absolute underpass floor capped at junctions and road-piece ends (#119)"
git push
```

---

### Task 2: Trough walls

**Files:**
- Modify: `prototype/world.js` (append after `cutBounds`)
- Modify: `prototype/index.html`: import (241), after the `#76 rail decks` drawing loop (~line 937), `collide` (~1243), `window.__mm.pushAt` (~1233), new `window.__mm.walls`
- Test: `prototype/tests/world.test.mjs` (import line 3, append), `prototype/tests/test_underpass.py` (new test)

**Interfaces:**
- Consumes: Task 1's `CUTS` entries (`road`, `t`, `reach`, `flat`, `deckMin`, `depth`), `UNDERPASS.margin/wall/apron/deck`, `terrainH`, `meshH`, `box`, `pushOBB`, `col`.
- Produces:
  - `mergeIntervals(iv: [a, b][]): [a, b][]` (sorted, overlaps joined).
  - `wallStations(pts, intervals, offset, step): { t, side: -1 | 1, len, rot, x, z, nx, nz }[]`, where `(nx, nz)` is the unit normal pointing away from the road.
  - `WALLS: { x, z, nx, nz, rot, len, side, floor, top, under }[]`, exposed as `window.__mm.walls()`.
  - OBB entries `{ …, h: top, low: true }`; `collide` skips a `low` OBB while `P.y ≥ o.h − 0.2`.
  - `window.__mm.pushAt(x, z, y?)`: an optional `y` sets the car height for the probe.

- [ ] **Step 1: Write the failing unit tests.** In `prototype/tests/world.test.mjs` line 3, add `mergeIntervals, wallStations,` before `patchCells`. Append:

```js
test('mergeIntervals joins overlapping spans and sorts them', () => {
  assert.deepEqual(mergeIntervals([[30, 40], [0, 10], [5, 20]]), [[0, 20], [30, 40]]);
  assert.deepEqual(mergeIntervals([]), []);
});

test('wallStations: pieces of about `step` m on both sides at `offset`, normals pointing away from the road', () => {
  const pts = [[0, -100], [0, 100]], ws = wallStations(pts, [[90, 110], [100, 105]], 6.5, 2);   // the second span lies inside the first
  assert.equal(ws.length, 20);
  const first = ws.filter((w) => Math.abs(w.t - 91) < 1e-9);
  assert.equal(first.length, 2);
  for (const w of first) {
    assert.ok(Math.abs(Math.abs(w.x) - 6.5) < 1e-9 && Math.abs(w.z + 9) < 1e-9, `${w.x},${w.z}`);
    assert.ok(Math.abs(w.nx - Math.sign(w.x)) < 1e-9 && Math.abs(w.nz) < 1e-9);
    assert.ok(Math.abs(w.len - 2) < 1e-9 && Math.abs(w.rot - Math.PI / 2) < 1e-9);
  }
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `cd prototype && node --test tests/world.test.mjs`
Expected: FAIL. There is no export named `mergeIntervals`.

- [ ] **Step 3: Implement in `prototype/world.js`** (after `cutBounds`):

```js
export function mergeIntervals(iv) {
  const out = [];
  for (const [a, b] of [...iv].sort((p, q) => p[0] - q[0])) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
}
// #119: wall pieces along a road over the (merged) spans, `offset` m to each side; (nx, nz) points away from the road
export function wallStations(pts, intervals, offset, step) {
  const out = [];
  for (const [a, b] of mergeIntervals(intervals)) {
    const n = Math.max(1, Math.round((b - a) / step)), len = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const t = a + (k + 0.5) * len, [x0, z0] = pointAtLength(pts, t - len / 2), [x1, z1] = pointAtLength(pts, t + len / 2), rot = Math.atan2(z1 - z0, x1 - x0);
      for (const side of [-1, 1]) { const nx = -Math.sin(rot) * side, nz = Math.cos(rot) * side; out.push({ t, side, len, rot, nx, nz, x: (x0 + x1) / 2 + nx * offset, z: (z0 + z1) / 2 + nz * offset }); }
    }
  }
  return out;
}
```

(Check against the test: road along +z gives `rot = π/2` and `(nx, nz) = (−side, 0)`; side −1 sits at `x = +6.5` with `nx = +1`, side 1 at `x = −6.5` with `nx = −1`. Both point away from the road.)

- [ ] **Step 4: Run to verify they pass.**

Run: `cd prototype && node --test tests/world.test.mjs`
Expected: `fail 0`.

- [ ] **Step 5: Write the failing browser test.** Append to `prototype/tests/test_underpass.py`:

```python
@needs_world
def test_trough_walls(server):
    """#119: stone walls line the Laufenburgerstrasse cut on both sides; they stop a car in the trough and on the ground beside
    it, not one on the rail deck above; one run per side for the two decks; the road stays the top surface in the trough."""
    def script(page):
        ws = page.evaluate("() => window.__mm.walls()")
        near = [w for w in ws if math.hypot(w["x"] - CROSS[0], w["z"] - CROSS[1]) < 60]
        under = min((w for w in near if w["under"]), key=lambda w: math.hypot(w["x"] - CROSS[0], w["z"] - CROSS[1]))
        open_ = max((w for w in near if not w["under"]), key=lambda w: w["top"] - w["floor"])
        at = lambda w, d: (w["x"] - w["nx"] * d, w["z"] - w["nz"] * d)            # d m from the wall centre towards the road
        r = {"near": near}
        x, z = at(under, 1.5); r["trough"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {under['floor'] + 0.1})")
        r["deck"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {under['top'] + 1.2})")
        x, z = at(open_, -1.5); r["parapet"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {open_['top'] - 0.9})")
        # across the road in the trough: x of the road centre from the drive line (1565.5, 675) -> (1569.8, 619.9)
        r["across"] = page.evaluate("""() => [-0.5, 0, 0.5].flatMap((f) => [640, 632, 625].map((z) => {
            const x = 1565.5 + (675 - z) * 4.3 / 55.1, h = window.__mm.rayHits(x + f * 4.5, z); return [h.grass, h.roadOsm]; }))""")
        return r
    r = run(server, script)
    near = r["near"]
    assert {w["side"] for w in near} == {-1, 1}, near
    assert any(w["under"] for w in near) and any(not w["under"] for w in near)
    for a in near:                                                                      # the two decks share one wall run per side
        assert not any(b is not a and b["side"] == a["side"] and math.hypot(b["x"] - a["x"], b["z"] - a["z"]) < 1.0 for b in near), a
    assert math.hypot(r["trough"]["dx"], r["trough"]["dz"]) > 0.01, r["trough"]           # the wall stops a car in the trough
    assert math.hypot(r["deck"]["dx"], r["deck"]["dz"]) < 0.01, r["deck"]                 # but not one on the deck above it
    assert math.hypot(r["parapet"]["dx"], r["parapet"]["dz"]) > 0.01, r["parapet"]       # the parapet stops a car beside the trough
    for grass, road in r["across"]:
        assert road is not None and (grass is None or grass <= road + 0.005), r["across"]
```

(`rayHits` positions: on the drive line the existing test already follows, ±0.5 × hw, so they stay on the road even if the line is a metre off its centre.)

- [ ] **Step 6: Run to verify it fails.**

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py::test_trough_walls -q -s -p no:cacheprovider`
Expected: FAIL with `TypeError: window.__mm.walls is not a function` (page error), or a `ValueError` on an empty `min()`.

- [ ] **Step 7: Implement the walls in `prototype/index.html`.**

7a. Import (line 241): add `mergeIntervals, wallStations,` next to `cutBounds,`. (`mergeIntervals` is only needed by `wallStations`; import just `wallStations` if the linter complains about unused names.)

7b. Directly after the `for (const b of RAIL_DECKS) { … }` drawing loop (it ends with `push('rail', g);\n  }`), insert:

```js
  // #119 trough walls: along every road with a cut, a stone wall with its face at hw + margin, from the cut floor to 1 m
  // over the ground behind it (parapet); under a deck up to the deck's underside and no parapet. Solid, but `low`: a car
  // above the top (on the deck) passes over.
  const byRoad = new Map(); for (const c of CUTS) if (c.depth > 0) { if (!byRoad.has(c.road)) byRoad.set(c.road, []); byRoad.get(c.road).push(c); }
  for (const [road, cuts] of byRoad) {
    const hw = road.w / 2, inner = hw + UNDERPASS.margin;
    for (const w of wallStations(road.pts, cuts.map((c) => [c.t - c.reach[0], c.t + c.reach[1]]), inner + UNDERPASS.wall / 2, 2)) {
      const [rx, rz] = pointAtLength(road.pts, w.t), floor = terrainH(rx + w.nx * (inner - 0.25), rz + w.nz * (inner - 0.25)), ground = meshH(rx + w.nx * (inner + UNDERPASS.wall + 0.5), rz + w.nz * (inner + UNDERPASS.wall + 0.5));
      if (ground - floor <= 0.1) continue;
      const under = cuts.find((c) => Math.abs(w.t - c.t) <= c.flat - UNDERPASS.apron), top = under ? Math.max(ground, under.deckMin - UNDERPASS.deck) : ground + 1;
      box(w.len + 0.05, top - floor, UNDERPASS.wall, w.x, floor, w.z, w.rot, col('#b8b2a6'), 'stone', [4, 3], 0);
      pushOBB({ x: w.x, z: w.z, hw: w.len / 2, hd: UNDERPASS.wall / 2, c: Math.cos(w.rot), s: Math.sin(w.rot), h: top, low: true });
      WALLS.push({ x: w.x, z: w.z, nx: w.nx, nz: w.nz, rot: w.rot, len: w.len, side: w.side, floor, top, under: !!under });
    }
  }
```

Next to `const CUT_N = 16, CUT_CELLS = new Map(), CUTS = [];` (line 478), add `, WALLS = []`, so the line reads `const CUT_N = 16, CUT_CELLS = new Map(), CUTS = [], WALLS = [];`.

7c. In `function collide(r)`, directly after `if (o.bridge && P.y < (o.y0 ?? 0.4)) continue;`, insert `if (o.low && P.y >= o.h - 0.2) continue;`.

7d. Replace `window.__mm.pushAt` with:

```js
window.__mm.pushAt = (x, z, y) => { const keep = [P.x, P.z, P.vx, P.vz, P.dmg, P.y]; P.x = x; P.z = z; if (y !== undefined) P.y = y; P.vx = P.vz = 0; collide(carRadius()); const out = { dx: P.x - x, dz: P.z - z }; [P.x, P.z, P.vx, P.vz, P.dmg, P.y] = keep; return out; };   // #36: read-only, for the region-wide collider test; #119: optional car height
window.__mm.walls = () => WALLS;
```

- [ ] **Step 8: Run the underpass file and the collider test.**

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py prototype/tests/test_building_collision.py -q -s -p no:cacheprovider`
Expected: `6 passed` (3 underpass, 3 building collision). `test_no_invisible_building_colliders_region_wide` must stay green: walls are only built where a cut exists, which is the injected Laufenburgerstrasse, away from its sample points.

- [ ] **Step 9: Commit and push.**

```bash
git add prototype/world.js prototype/index.html prototype/tests/world.test.mjs prototype/tests/test_underpass.py
git commit -m "feat(world): stone trough walls along rail underpass cuts (#119)"
git push
```

---

### Task 3: Regression, world rebuild, docs

**Files:**
- Modify: `data/world_hochrhein.json` (generated)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`), `TODO.md` (the „Railway down into the Sissle valley" line)

**Interfaces:**
- Consumes: Tasks 1–2; `pipeline/osm.py build` (Task 1 of #76 already exports `railBridges`).

- [ ] **Step 1: Targeted regression** (foreground). The cut code runs only where `railBridges` exist, which on `main`'s world is nowhere. These tests prove that:

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_smoke.py -q -p no:cacheprovider -k "hand_traced_fallback or osm_layout or grass_and_fields or wheels_do_not_sink or no_trees_on_the_railway or rhine_splash_and_overpass"`
Expected: `9 passed`. A failure here: fix the implementation, never the test.

- [ ] **Step 2: Cache check, and STOP if it fails.** The pipeline caches are not in git. They exist only on the maintainer's machine, in the main checkout's `pipeline/cache` (a worktree can link it: `ln -s <main checkout>/pipeline/cache pipeline/cache`; `cache/` only ignores directories, so never `git add` the link).

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP` (always the case on a CI runner), do none of Steps 3–7. Instead, write in the PR body: "World not rebuilt: pipeline caches missing here. Run Task 3 Steps 2–7 of `docs/superpowers/plans/2026-10-07-abutment-walls.md` locally before merging." Leave `CHANGELOG.md` and `TODO.md` unchanged (Step 8 belongs with the rebuild), push, and stop.

- [ ] **Step 3: Golden tests** (must pass, not skip):

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`
Expected: `16 passed`, no `SKIPPED`.

- [ ] **Step 4: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected log: `building heights from swissSURFACE3D: {...}` and `rail bridges 18`.

- [ ] **Step 5: Guard: the world may differ from `main` only in `rail`, `railBridges` and `params.built`.**

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

Expected: `guard ok: rail 142 -> 124 ; railBridges 18`. If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys in the PR.

- [ ] **Step 6: Underpass tests on the real world.**

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underpass.py -q -s -p no:cacheprovider`
Expected: `3 passed`. `test_every_underpass_has_headroom` lists all 16 crossings and prints the capped ones; paste both into the PR. As measured on 2026-10-07, expect caps at Kapfstrasse, the unnamed road by Bahndammstrasse, Hauptstrasse Stein (~2.1 m) and Laufenburgerstrasse north. Ankengasse stays at `depth 0`. If a capped crossing ends below 2.0 m: **STOP** and report it in the PR (the deck data there is too low; #120 or a deck-height fix is the answer, not a lower threshold).

- [ ] **Step 7: Commit and push the world.**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild the world with railway bridges (#119)"
git push
```

- [ ] **Step 8: Changelog and TODO.** Under `## [Unreleased]` → `### Added` in `CHANGELOG.md`, add at the top:

```markdown
- Railway bridges are real now: where the train crosses a road on a bridge — Laufenburgerstrasse in Sisseln, Hauptstrasse in Stein, Ankengasse in Mumpf and more — the tracks run over a stone deck and the road dips underneath between stone walls, with room for a lorry. Drive under it, or follow the tracks over it. Where a side street turns off right next to the bridge, the underpass is lower — mind your roof. Level crossings stay level.
```

In `TODO.md`, in the line starting `  - **Railway down into the Sissle valley / through water:**`, replace `railway bridges are not modelled; the track ribbon follows the terrain.` with `railway bridges over roads are decks over a walled underpass since #119; elsewhere (and under road bridges) the track ribbon still follows the terrain.` Keep the rest of the line.

```bash
git add CHANGELOG.md TODO.md
git commit -m "docs: changelog and TODO for rail bridges and trough walls (#119)"
git push
```
