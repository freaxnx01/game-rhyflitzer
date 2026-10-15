# Bridge End Seating Implementation Plan (#227)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generic OSM road bridges meet their banks without a step, so the car no longer launches off the Sägeweg bridge over the Sissle (w80728459).

**Architecture:** Two pure helpers in `prototype/world.js` (`seatEnd`, `endFrame`). In `prototype/index.html`, generic deck ends are lifted to the bank top found within 12 m along the continuing road, the ground past an open generic end becomes fill (`max(fill, terrain, road)`) instead of a flat deck plateau, and a lifted end gets a drawn pad laid on the physics ground.

**Tech Stack:** Vanilla JS ES modules, three.js, `node --test` for pure helpers, Playwright (Python, headless Chromium + SwiftShader) for in-page checks.

**Spec:** `docs/superpowers/specs/2026-10-15-bridge-end-seating-design.md`

## Global Constraints

- Only `kind === 'generic'` OSM bridges change. Stone/wood hero chains (`buildStoneChain`, `heroWood`), rail decks (`RAIL_DECKS`, `seatSwitchEnds`) and abutments (`approach: true`) keep today's behaviour.
- `END_SEAT = { reach: 12, maxLift: 3 }` (metres).
- No pipeline change, no world-format change, no world rebuild.
- No new packages. Buildless: no bundler, no `package.json`.
- Playwright runs in the **foreground** only (never `run_in_background`); commit and push before running it. Run only the affected test files (`test_bridge_ends.py`, `test_fridolinsbruecke.py`, `test_holzbruecke.py`), not the full suite.
- Memory: run Playwright under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- CHANGELOG entries are written by hand in player voice; never `git cliff -o CHANGELOG.md`.

## Review Focus

1. A bridge end that meets **two or more roads** (a junction right at the abutment): the end must take the lowest bank top, so no continuing road gets a drop. Pinned by the `seatEnd` "lowest of several" usage in Task 2's `seatGenericEnds` and checked by the world-wide survey in Task 4.
2. A car **driving underneath** an overpass close to its end: the fill must not catch it. `bridgeAccepts(surface, y)` gating stays in front of the fill hit (Task 2, Step 3); `test_underpass*` / `test_fridolinsbruecke.py` stay green.
3. A fill region that overlaps **another bridge's deck** (two bridges meeting at an angle): the deck must win. `onBridge` keeps looking after a fill hit and returns a deck hit first (Task 2, Step 3).
4. **Water next to a bank:** `waterLevelAt` treats any `onBridge` hit as "no water"; the fill region is at most `max(hw, reach)` m past the end on the land side, as the old half-disc plateau was. Survey in Task 4 checks the Sägeweg ends have no `water` in the probe.
5. A **chained generic piece** (end joined only to another bridge piece): `roadsFrom` skips bridges, so the joint gets no continuing road and keeps its height. Pinned by the `seatGenericEnds` guard `if (!roads.length) continue`.

---

### Task 1: Pure helpers `seatEnd` and `endFrame`

**Files:**
- Modify: `prototype/world.js` — insert after `export function deckLine(...)` (currently `world.js:502`)
- Test: `prototype/tests/world.test.mjs` — append at the end

**Interfaces:**
- Consumes: `bankTop(hs, maxGrade = 0.08, run = 4)` and `pastEnd(pts, x, z)` from `world.js` (existing, #78).
- Produces:
  - `export const END_SEAT = { reach: 12, maxLift: 3 }`
  - `export function seatEnd(hs: number[], u = END_SEAT): { h: number, reach: number }`
  - `export function endFrame(pts: [number, number][], x: number, z: number): { e: -1 | 0 | 1, along: number, across: number }`

- [ ] **Step 1: Write the failing tests**

Append to `prototype/tests/world.test.mjs`:

```js
import { seatEnd, endFrame, END_SEAT } from '../world.js';
// #227: bare terrain every 1 m along the Sägeweg from the deck ends of w80728459 (measured 2026-10-15)
const SAEGEWEG_W = [24.43, 24.8, 25.17, 25.37, 25.38, 25.36, 25.3, 25.24, 25.19, 25.13, 25.07, 25.02, 24.96];
const SAEGEWEG_E = [24.62, 25.08, 25.53, 25.99, 26.17, 26.19, 26.22, 26.24, 26.27, 26.3, 26.32, 26.35, 26.37];
test('seatEnd lifts a bridge end to the bank top its road reaches within 12 m (#227)', () => {
  assert.deepEqual(seatEnd(SAEGEWEG_W), { h: 25.37, reach: 3 });
  assert.deepEqual(seatEnd(SAEGEWEG_E), { h: 26.17, reach: 4 });
});
test('seatEnd keeps the end where the road is already flat, falls away, or keeps climbing (#227)', () => {
  assert.deepEqual(seatEnd([5, 5.02, 5.04, 5.06, 5.08, 5.1, 5.12, 5.14, 5.16, 5.18, 5.2, 5.22, 5.24]), { h: 5, reach: 0 });
  assert.deepEqual(seatEnd([5, 4.8, 4.6, 4.4, 4.2, 4, 3.8, 3.6, 3.4, 3.2, 3, 2.8, 2.6]), { h: 5, reach: 0 });
  assert.deepEqual(seatEnd([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]), { h: 0, reach: 0 });   // no bank top within 12 m
});
test('seatEnd does not lift more than END_SEAT.maxLift (#227)', () => {
  assert.equal(END_SEAT.maxLift, 3);
  assert.deepEqual(seatEnd([0, 1, 2, 3, 3.5, 3.52, 3.54, 3.56, 3.58, 3.6, 3.62, 3.64, 3.66]), { h: 0, reach: 0 });
  assert.deepEqual(seatEnd([0, 1, 2, 2.5, 2.52, 2.54, 2.56, 2.58, 2.6, 2.62, 2.64, 2.66, 2.68]), { h: 2.5, reach: 3 });
});
test('endFrame measures along and across from the end a point is past (#227)', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(endFrame(pts, 5, 1), { e: 0, along: 0, across: 0 });
  const a = endFrame(pts, -3, 2);           // behind the first vertex: the first segment points +x, so "on" is -x
  assert.equal(a.e, -1); assert.ok(Math.abs(a.along - 3) < 1e-9); assert.ok(Math.abs(a.across - 2) < 1e-9);
  const b = endFrame(pts, 9, 14);           // beyond the last vertex: the last segment points +z
  assert.equal(b.e, 1); assert.ok(Math.abs(b.along - 4) < 1e-9); assert.ok(Math.abs(b.across - 1) < 1e-9);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test prototype/tests/world.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../world.js' does not provide an export named 'seatEnd'`.

- [ ] **Step 3: Implement the helpers**

Insert after `deckLine` in `prototype/world.js`:

```js
// #227: a generic bridge end sits where the OSM node is, partway down the bank (swissALTI3D removes bridges). Seat it on the bank
// top its road reaches within END_SEAT.reach m, lifting at most maxLift; hs = bare terrain every 1 m along that road, hs[0] at the end
export const END_SEAT = { reach: 12, maxLift: 3 };
export function seatEnd(hs, u = END_SEAT) {
  const k = bankTop(hs), keep = { h: hs[0], reach: 0 };
  if (k === 0 || k === hs.length - 1) return keep;
  if (hs[k] - hs[0] > u.maxLift) return keep;
  return { h: Math.max(hs[0], hs[k]), reach: k };
}
// #227: where (x, z) lies relative to the polyline end it is past: e = pastEnd, along = metres beyond that end along its last
// segment, across = metres off that segment's line; on the polyline (e = 0) both are 0
export function endFrame(pts, x, z) {
  const e = pastEnd(pts, x, z);
  if (e === 0) return { e, along: 0, across: 0 };
  const n = pts.length, [ex, ez] = e > 0 ? pts[n - 1] : pts[0], [px, pz] = e > 0 ? pts[n - 2] : pts[1];
  const len = Math.hypot(ex - px, ez - pz) || 1, ux = (ex - px) / len, uz = (ez - pz) / len, dx = x - ex, dz = z - ez;
  return { e, along: dx * ux + dz * uz, across: Math.abs(dx * uz - dz * ux) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test prototype/tests/*.test.mjs`
Expected: all PASS (the whole node suite, not just the new tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(world): seatEnd and endFrame helpers for bridge ends (#227)"
```

---

### Task 2: Seat generic ends, fill past open ends, draw the pad

**Files:**
- Modify: `prototype/index.html`
  - import line `index.html:363` (add `seatEnd, endFrame, END_SEAT`)
  - `onBridge` `index.html:552-557`
  - `fillBridgeHeights` `index.html:649`
  - `surfaceGroundH` `index.html:814`
  - generic deck drawing loop `index.html:1494-1499`
  - `isDeck` `index.html:2429`
- Create: `prototype/tests/test_bridge_ends.py`

**Interfaces:**
- Consumes: `seatEnd`, `endFrame`, `END_SEAT` (Task 1); existing `roadsFrom(p, skip)`, `sampleH(pts, step)`, `cutPolyline`, `gridAddSegment`, `BRIDGE_GRID`, `bridgeSurfaceAt`, `bridgeAccepts`, `strip`, `resample`, `groundH`, `terrainH`.
- Produces: on each generic OSM bridge object `b`: `b.reach0`, `b.reach1` (metres, 0 when not lifted); `onBridge` hits may carry `fill: true`.

- [ ] **Step 1: Write the failing Playwright test**

Create `prototype/tests/test_bridge_ends.py`:

```python
"""#227: generic bridge ends meet their banks -- no launch off the Sägeweg bridge over the Sissle (w80728459).
Measured terrain only. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[2] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# Sägeweg centre line: w700036726 (west) -> bridge w80728459 -> w80728460 -> w1532972168 (east)
LINE = [(1756.8, 1165.2), (1805.9, 1160.0), (1825.8, 1155.0), (1852.1, 1148.3), (1865.7, 1144.9), (1870.5, 1143.8), (1885.6, 1142.9)]
WEST_END, EAST_END = (1825.8, 1155.0), (1852.1, 1148.3)


def resample(pts, step=1.0):
    out = []
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, z1 - z0) / step))
        out += [(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n) for i in range(n)]
    return out + [pts[-1]]


@pytest.fixture(scope="module")
def page(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={"width": 320, "height": 180})
        pg.goto(f"{server}/prototype/index.html")
        pg.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        pg.wait_for_selector("#mmhstatus.real", timeout=240000)
        yield pg
        b.close()


def profile(page, pts):
    return page.evaluate(f"() => {json.dumps(pts)}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")


def drive(page, x, z, th, secs, v):
    js = (f"() => [...Array({round(secs * 10)}).keys()].map(k => {{ const r = window.__mm.sim({x}, {z}, {th}, {v}, (k + 1) / 10); "
          f"const c = window.__mm.car(); return {{ ...r, ground: c.ground }}; }})")
    return page.evaluate(js)


def near_bridge(pts):
    return [p for p in pts if min(math.dist(p, WEST_END), math.dist(p, EAST_END)) <= 10 or WEST_END[0] <= p[0] <= EAST_END[0]]


def test_saegeweg_ground_has_no_step_at_the_deck_ends(page):
    g = profile(page, near_bridge(resample(LINE)))
    rises = [abs(b - a) for a, b in zip(g, g[1:])]
    worst = max(range(len(rises)), key=rises.__getitem__)
    assert rises[worst] <= 0.35, (worst, g[max(0, worst - 4):worst + 5])     # 2026-10-15: 0.82 (west) and 1.04 (east) in one metre


@pytest.mark.parametrize("v", [22, 32])
@pytest.mark.parametrize("start,toward", [((1885.6, 1142.9), WEST_END), ((1756.8, 1165.2), EAST_END)], ids=["westbound", "eastbound"])
def test_drive_over_the_saegeweg_bridge_without_a_jump(page, v, start, toward):
    th = math.atan2(toward[1] - start[1], toward[0] - start[0])
    trace = drive(page, start[0], start[1], th, 4.0, v)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])         # 2026-10-15: 22.3 m westbound, 5.4 m eastbound


def test_fewer_bridge_ends_rise_more_than_a_metre_in_one_metre(page):
    """the survey from the spec: every OSM road bridge end, 0.5 m inside the deck, then 0..12 m straight on"""
    world = json.loads((DATA / "world_hochrhein.json").read_text(encoding="utf-8"))
    ends = []
    for r in (r for r in world["roads"] if r["bridge"]):
        p = r["pts"]
        for a, b in ((p[0], p[1]), (p[-1], p[-2])):
            d = math.dist(a, b) or 1
            ends.append({"x": a[0], "z": a[1], "ux": (a[0] - b[0]) / d, "uz": (a[1] - b[1]) / d})
    js = """(E) => E.map(e => [-0.5, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(d => window.__mm.ground(e.x + e.ux * d, e.z + e.uz * d, 1e4)))"""
    seqs = page.evaluate(js, ends)
    big = sum(1 for s in seqs if max(b - a for a, b in zip(s, s[1:])) > 1.0)
    assert big < 36, big                                                        # 2026-10-15: 36 of 238 ends
```

- [ ] **Step 2: Commit, push, and run it to verify it fails**

```bash
git add prototype/tests/test_bridge_ends.py
git commit -m "test(world): Sägeweg bridge ends and bridge-end survey (#227)"
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_bridge_ends.py -q
```

Expected: FAIL — the profile test with `0.82`/`1.04`-sized rises, the drive tests with air of several metres (22 m westbound at 22 m/s start), the survey with `36`.

- [ ] **Step 3: Implement — import, `onBridge`, `seatGenericEnds`, `surfaceGroundH`, `isDeck`, pad**

1. `index.html:363`: add `seatEnd, endFrame, END_SEAT` to the `import { ... } from './world.js'` list.

2. Replace the `if (L) { ... }` line inside `onBridge` (`index.html:555`) with:

```js
  if (L) { let fill = null;
    for (const b of gridQuery(BRIDGE_GRID, x, z, 1)) {
      // #227: past an open end of a generic deck the ground is fill (the bank road), not a flat deck plateau; a deck hit still wins
      if (b.kind === 'generic' && !b.approach) { const f = endFrame(b.r.pts, x, z); if (f.e !== 0) {
        const k = f.e > 0 ? 1 : 0, t = k ? b.len : 0;
        if (!fill && b['fade' + k] !== false && f.along <= Math.max(b.hw, b['reach' + k] || 0) && f.across <= b.hw && bridgeAccepts(bridgeSurfaceAt(b, t), y)) fill = { b, t, osm: true, fill: true };
        continue; } }
      const n = nearestOnPolyline(b.r.pts, x, z); if ((n.d <= b.hw || inHeroDeck(b, x, z, n.d)) && ownsEnd(b, x, z) && (b.approach || bridgeAccepts(bridgeSurfaceAt(b, n.t), y))) return { b, t: n.t, osm: true }; }
    return fill; }
```

3. Add `seatGenericEnds` right above `fillBridgeHeights` and call it there (`index.html:649`):

```js
// #227: a generic deck end takes the lowest bank top its continuing roads reach within END_SEAT.reach m (seatEnd); an end joined only
// to another bridge piece has no continuing road and keeps its height. The broad-phase grid gets the fill run past a lifted end.
function seatGenericEnds() {
  for (const b of OSM_BRIDGES) { if (b.kind !== 'generic' || b.approach) continue;
    for (const k of [0, 1]) { const p = b.r.pts, end = k ? p[p.length - 1] : p[0], prev = k ? p[p.length - 2] : p[1];
      const roads = roadsFrom(end, new Set()); if (!roads.length) continue;
      const seat = roads.map(({ pts }) => seatEnd(sampleH(cutPolyline(pts, END_SEAT.reach)))).reduce((a, s) => s.h < a.h ? s : a);
      b['h' + k] = seat.h; b['reach' + k] = seat.reach;
      if (seat.reach > b.hw) { const d = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1, ux = (end[0] - prev[0]) / d, uz = (end[1] - prev[1]) / d;
        gridAddSegment(BRIDGE_GRID, end[0], end[1], end[0] + ux * seat.reach, end[1] + uz * seat.reach, b.hw * 2, b); } } }
}
function fillBridgeHeights() { for (const b of OSM_BRIDGES) { const p = b.r.pts; b.h0 = terrainH(p[0][0], p[0][1]); b.h1 = terrainH(p[p.length - 1][0], p[p.length - 1][1]); } seatGenericEnds(); seatSwitchEnds(); buildStoneChain(); }
```

Note: `sampleH` returns 1 m samples from 0 to `floor(length)`; a continuing road shorter than 12 m yields fewer than 13 samples, and `seatEnd` then searches only that far — intended.

4. `surfaceGroundH` (`index.html:814`): change `if (ob && !ob.b.approach)` to `if (ob && !ob.b.approach && !ob.fill)`. The next line (`const fill = ob ? bridgeSurfaceAt(ob.b, ob.t) : -Infinity;`) already turns a fill hit into `max(fill, terrain, road)`.

5. `isDeck` (`index.html:2429`): `const isDeck = (ob) => !!ob && !ob.b.approach && !ob.fill;   // #78 abutment, #227 fill past a generic end: road, not a bridge`

6. Pad: inside the generic drawing loop (`for (const b of OSM_BRIDGES) if (b.kind === 'generic') { ... }`, `index.html:1494`), after the parapet line, add:

```js
    // #227: a lifted end gets a pad over its fill, laid on the physics ground itself so the car never floats over the drawn road
    for (const k of [0, 1]) { const p = b.r.pts, end = k ? p[p.length - 1] : p[0], prev = k ? p[p.length - 2] : p[1];
      if (b['h' + k] <= terrainH(end[0], end[1]) + 0.05) continue;
      const run = Math.max(b.hw, b['reach' + k] || 0), d = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1, ux = (end[0] - prev[0]) / d, uz = (end[1] - prev[1]) / d;
      const pad = resample([end, [end[0] + ux * run, end[1] + uz * run]], 1), gh = (x, z) => groundH(x, z, 1e4);
      strip(pad, b.r.w, 0.02, 'roadOsm', col('#ffffff'), 8, gh);
      strip(pad, b.r.w + 1.2, -0.6, 'stone', col('#c8c2b6'), 4, gh); }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test prototype/tests/*.test.mjs
git add prototype/index.html && git commit -m "fix(world): seat generic bridge ends on the bank, fill past open ends (#227)" && git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_bridge_ends.py ../prototype/tests/test_fridolinsbruecke.py ../prototype/tests/test_holzbruecke.py -q
```

Expected: all PASS. If the drive test still shows air above 0.3 m, print the trace around the worst sample and the ground profile (`profile(page, ...)` over ±5 m of that point) before changing anything; after 3 failed attempts stop and report the numbers.

---

### Task 3: Changelog

**Files:**
- Modify: `CHANGELOG.md` — `## [Unreleased]` → `### Fixed`

- [ ] **Step 1: Add the entry**

Under `## [Unreleased]` → `### Fixed` (create the heading if missing, keep the existing entries), add:

```markdown
- The car no longer takes off at the end of the **Sägeweg bridge over the Sissle**. Small bridges now meet the road on the bank at its height, instead of ending half a metre to a metre and a half lower with a ramp behind them.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): Sägeweg bridge launch fixed (#227)"
git push
```

---

### Task 4: Final verification

- [ ] **Step 1:** `node --test prototype/tests/*.test.mjs` — all PASS.
- [ ] **Step 2:** Foreground, capped: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_bridge_ends.py ../prototype/tests/test_fridolinsbruecke.py ../prototype/tests/test_holzbruecke.py -q` — all PASS.
- [ ] **Step 3:** In the PR body, record the measured numbers: the worst 1 m rise along the Sägeweg (before 0.82 / 1.04 m), max air for the four drives (before 22.3 / 5.4 m), and the survey count (before 36 of 238).
