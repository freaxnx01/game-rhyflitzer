# Fridolinsbrücke Level Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You drive across the Fridolinsbrücke without being thrown into the air. The deck runs level from the Bad Säckingen road to the Stein road, and the whole span is the stone bridge, with parapets (#78).

**Architecture:** Everything happens in the browser. No pipeline change, no world rebuild.

- In `prototype/index.html`, the stone hero piece grows into a chain of same-named bridge pieces that share endpoints (pure `bridgeChain` in `prototype/world.js`).
- `fillBridgeHeights` gives that chain a straight deck line between the two **bank tops**. A bank top is the first point on the approach roads where the terrain flattens below 8 %.
- It adds flat **approach pieces** (abutments) that carry the deck over the bank-climbing approach roads up to that height.
- `onBridge` treats approach pieces as solid ground, and ignores the area past their far end.
- The 0.3 m surface offset fades only at open ends.
- The stone hero is drawn per piece along its polyline. Its parapet walls come in 2 m OBBs, dropped where they would stand on another piece of the chain.

**Tech Stack:** Vanilla JS ES modules in the buildless `prototype/`. `node --test` for `world.js`. Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-fridolinsbruecke-level-deck-design.md`. It holds the measured reproduction: deck V from 3.49 down to −1.66 and up to 2.65, roads at 7.3 and 15.7, steps of −1.86 m and +2.79 m, air of 1.77, 1.94, 2.69 and 2.13 m.

## Global Constraints

- **Landing order:** #79 → #78 → #76.
  - #79 (J → Swiss side) does not touch bridge geometry. If it is already on `main`, its jump spot (−1211.0, 535.5) must keep landing on the road with `__mm.car().bridge === false`. This plan's hooks keep that true.
  - #76 (rail bridges, world rebuild) rebases onto this plan. Keep the hero grouping as `kind === 'wood' || kind === 'stone'`, and let chain growth take only `kind === 'generic'` pieces, so #76's `kind: 'rail'` decks never join. If #76 has already landed, do the same, and leave its `railBridges`, cuts and patches untouched.
- **No world rebuild**, and no change to `pipeline/` or `data/`.
- **Unchanged:**
  - The Holzbrücke (`wood`) keeps today's endpoint heights and its straight-chord `heroBridge`.
  - Generic bridges keep today's heights, offset fade and `onBridge` behaviour.
  - The hand-traced layout (`BRIDGES`, `bridgeProfile`) is untouched.
  - The existing tests in `prototype/tests/world.test.mjs` for `bridgeDeckAt`, `bridgeDeckOffset` and `bridgeSurfaceAt` stay unchanged and green (pieces without `fade0`/`fade1` behave exactly as today).
- **Style in `prototype/index.html`:** dense one-line style (long single-line statements, short `//` comments). Match the surrounding code and do not reformat neighbours.
  - No framework, no bundler, no `package.json`, no new dependency.
  - New code must **not** call `rr()` or `rnd()`, which would shift every later random draw.
  - No new UI strings.
- **Commands** (from the repo root):
  - Node: `node --test prototype/tests/*.test.mjs`. The glob is needed on Node 24.
  - Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_fridolinsbruecke.py -q`.
  - These runs are slow (minutes). Run them in the **foreground only, never `run_in_background`**.
  - Exit 137 means the memory cap was hit: stop and report.
  - Without `systemd-run --user` (CI runner), run the same command without the prefix.
  - One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- **Data:** the new Playwright tests need `data/world_hochrhein.json` **and** `data/terrain_hochrhein.mmh`. Both are committed. The tests load the bundled terrain (they do not block the `.mmh` route) and wait for `#mmhstatus.real`.
- **Commits:** commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **No step, no launch.** Any ground step between 0 and 1 m launches the car (`stepCar`, `vy = lift / dt × 0.6`). The profile test's 0.15 m bound is the guard, so do not loosen it. If it fails, find the step (print the profile around the worst Δ) and fix the heights, not the test.
- **Abutment ends:**
  - The surface must meet the terrain (offset fade to 0, `h1 = H` at the point where `terrainH ≥ H`).
  - `onBridge` must stop exactly there (`pastEnd`). Otherwise the endpoint-clamp plateau comes back.
- **Wall drop rule.** At the CH carriageway split (`w175815130`/`w175815131` share (−1272.3, 524.1)) and at every approach branch, walls standing on another chain piece must be dropped. A wall left there blocks a carriageway.
- **#79 compatibility:** `__mm.car().bridge` / `__mm.sim().bridge` are false on approach pieces, and `__mm.place` lands on the abutment.

## File Structure

- Modify `prototype/world.js`: new exports `bridgeChain`, `bankTop`, `pastEnd`, `deckLine`, `cutPolyline`. `bridgeDeckOffset` honours `b.fade0` / `b.fade1`.
- Modify `prototype/tests/world.test.mjs`: tests for the above.
- Create `prototype/tests/test_fridolinsbruecke.py`: the Playwright reproduction tests.
- Modify `prototype/index.html`:
  - chain growth after the `OSM_BRIDGES` loop (around line 372);
  - `fillBridgeHeights` (line 374) plus the new helpers `roadsFrom`, `bankHeight`, `approachPieces`, `buildStoneChain`;
  - `onBridge` (line 340);
  - the hero drawing block (lines 737-748), with a new `heroStone`;
  - the hooks `__mm.car` / `__mm.sim` (lines 982-983), and a new `__mm.stoneChain`.
- Modify `TODO.md`: drop the entry "Fridolinsbrücke only two-thirds a stone bridge in OSM mode" (line 49). #78 replaces it.
- Modify `CHANGELOG.md`: one `Fixed` entry under `[Unreleased]`.

---

### Task 1: Failing reproduction tests (Playwright, measured terrain)

**Files:**
- Create: `prototype/tests/test_fridolinsbruecke.py`

**Interfaces used:**
- Existing hooks: `__mm.ground(x, z, y)`, `__mm.probe(x, z)`, `__mm.sim(x, z, th, v, secs, hold)`, `__mm.car()`, `__mm.place(x, z, th)`.
- `__mm.stoneChain()` is new (Task 3). It returns `{ ids: [osm way ids of the bridge pieces], approaches: n, banks: [{ x, z, h }, ...] }`, ordered DE (west) then CH (east). Until Task 3 the call throws, so that test is red.

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/test_fridolinsbruecke.py`:

```python
"""#78: the Fridolinsbrücke deck meets the roads on both banks and the car crosses without a jump. Measured terrain only: the
bug lives in the swissALTI3D bank shape (bridge removed, OSM bridge ends at the foot of the bank). Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[2] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# crossing centre line (starts 14 m into Fricktalstraße: a pre-existing 0.7 m road-drape step sits at (-1494, 450)): Fricktalstraße (DE) -> w28495792 -> w319324523 -> w175815130 (reversed) -> w1382560045 -> w175815139 (reversed) (CH)
LINE = [(-1488.0, 452.4), (-1474.0, 456.8), (-1462.6, 459.1), (-1337.2, 502.4), (-1272.3, 524.1), (-1254.5, 527.5), (-1233.5, 533.5),
        (-1222.9, 536.1), (-1215.6, 536.4), (-1207.9, 534.3), (-1196.2, 526.9)]
BESIDE = (-1330.9, 483.4)                     # the Rhine 20 m beside the deck (2026-10-03: level -1.62)
CHAIN = {28495792, 319324523, 175815130, 175815131}


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


def drive(page, x, z, th, secs, v=20):
    """deterministic trace: sim re-run from the same start for 0.1, 0.2, ... secs; air = y - ground at the end of each run"""
    js = (f"() => [...Array({round(secs * 10)}).keys()].map(k => {{ const r = window.__mm.sim({x}, {z}, {th}, {v}, (k + 1) / 10); "
          f"const c = window.__mm.car(); return {{ ...r, ground: c.ground, water: c.water }}; }})")
    return page.evaluate(js)


def test_chain_and_banks(page):
    c = page.evaluate("() => window.__mm.stoneChain()")
    assert set(c["ids"]) == CHAIN, c
    assert c["approaches"] >= 3, c                                  # Fricktalstraße (2 ways) on the DE bank, the CH junction
    de, ch = c["banks"]
    assert de["x"] < ch["x"], c
    assert 6.5 < de["h"] < 8.5 and 14.5 < ch["h"] < 16.5, c          # dry run 2026-10-03: about 7.34 and 15.43


def test_deck_profile_has_no_steps(page):
    g = profile(page, resample(LINE))
    steps = [abs(b - a) for a, b in zip(g, g[1:])]
    worst = max(range(len(steps)), key=steps.__getitem__)
    assert steps[worst] <= 0.15, (worst, g[max(0, worst - 5):worst + 6])          # 2026-10-03: +2.79 at the CH end, -1.86 at the DE end
    grades = [abs(g[i + 10] - g[i]) / 10 for i in range(len(g) - 10)]
    assert max(grades) <= 0.10, max(grades)                                        # 2026-10-03: 0.5-0.7 per metre up the Stein bank


def test_deck_stands_above_the_rhine(page):
    water = page.evaluate(f"() => window.__mm.probe({BESIDE[0]}, {BESIDE[1]}).water")
    assert water is not None
    river = [p for p in resample(LINE) if -1430 < p[0] < -1280]
    assert min(profile(page, river)) >= water + 5, water                          # 2026-10-03: deck -1.66, water -1.62


def test_drive_de_to_ch_without_a_jump(page):
    trace = drive(page, -1490.0, 450.0, 0.321, 6.5)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])             # 2026-10-03: 1.77 at the DE end, 1.94 mid-river
    assert trace[-1]["bridge"] and all(r["water"] is None for r in trace), trace[-1]


def test_drive_ch_to_de_without_a_jump(page):
    x, z = -1215.6, 536.4
    trace = drive(page, x, z, math.atan2(527.5 - z, -1254.5 - x), 2.0)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])             # 2026-10-03: launched off the Stein bank road
    assert all(r["water"] is None for r in trace), trace[-1]


@pytest.mark.parametrize("side", [1, -1])
def test_parapets_hold_on_the_mid_piece(page, side):
    """the former generic piece w319324523 had no walls: a car steered into its side drove off into the Rhine"""
    x, z, th = -1304.75, 513.25, math.atan2(21.7, 64.9)
    r = page.evaluate(f"() => window.__mm.sim({x}, {z}, {th + side * math.radians(8)}, 15, 3)")
    c = page.evaluate("() => window.__mm.car()")
    assert r["bridge"] and c["water"] is None, (r, c)


def test_jump_spot_lands_on_the_abutment(page):
    """#79's J spot on the Swiss approach: on the abutment deck, not on the bank road buried under it, and not reported as a bridge"""
    ch = page.evaluate("() => window.__mm.stoneChain()")["banks"][1]
    page.evaluate("() => window.__mm.place(-1211.0, 535.5)")
    c = page.evaluate("() => window.__mm.car()")
    assert c["y"] >= ch["h"] - 0.5 and not c["bridge"] and c["water"] is None, (c, ch)   # 2026-10-03: y 14.23 on the bank road
```

- [ ] **Step 2: Run them and watch them fail.** Run (foreground) `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_fridolinsbruecke.py -q`.

  Expected: all tests FAIL.
  - `test_chain_and_banks` and `test_jump_spot_lands_on_the_abutment` fail with `stoneChain is not a function`.
  - The profile test reports a step of about 2.79.
  - The Rhine test reports a deck of about −1.66.
  - The drive tests report air of about 1.9 and about 2.1.
  - Both parapet tests report `bridge: False` or water.

  If a test passes on today's code, the reproduction is wrong. Stop and report.

- [ ] **Step 3: Commit.** `git add prototype/tests/test_fridolinsbruecke.py && git commit -m "test(bridges): reproduce the Fridolinsbrücke jump and sagging deck (#78)"`. Push the branch.

---

### Task 2: Pure helpers in `world.js`

**Files:**
- Modify: `prototype/world.js` (after `bridgeAccepts`, line 78; `bridgeDeckOffset` at line 74)
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- `bridgeChain(pieces, seed)` → `number[]` (indices, `seed` first). `pieces[i] = { name, kind, pts }`. The seed's group grows with every `kind === 'generic'` piece of the same non-empty `name` that has an endpoint within 0.5 m of an endpoint already in the group. It repeats until stable. An empty seed name → `[seed]`.
- `bankTop(hs, maxGrade = 0.08, run = 4)` → the index of the first sample (samples 1 m apart) whose signed rise over the next `run` samples, divided by `run`, is below `maxGrade`. If none qualifies, the last index.
- `pastEnd(pts, x, z)` → `-1` behind the first vertex (projection onto the first segment before its start), `1` beyond the last vertex (projection onto the last segment past its end), else `0`.
- `deckLine(a, ha, b, hb, x, z)` → the height linear in the projection of `(x, z)` onto the segment `a → b`, clamped to `[0, 1]`.
- `cutPolyline(pts, s)` → the polyline from the start up to arc length `s` (clamped to `[0, length]`), with an interpolated last vertex.
- `bridgeDeckOffset(b, t)`: an end flagged `b.fade0 === false` / `b.fade1 === false` does not fade. Unflagged → exactly today.

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/world.test.mjs`:

```js
import { bridgeChain, bankTop, pastEnd, deckLine, cutPolyline } from '../world.js';
test('bridgeChain grows a hero piece along same-named generic pieces that share an endpoint (#78)', () => {
  const P = (name, kind, pts) => ({ name, kind, pts });
  const pieces = [P('Fridolinsbrücke', 'stone', [[0, 0], [100, 0]]), P('Fridolinsbrücke', 'generic', [[100, 0], [150, 0]]),
    P('Fridolinsbrücke', 'generic', [[180, 3], [150.3, 0.2]]), P('Fridolinsbrücke', 'generic', [[150.2, 0], [180, -3]]),
    P('Andere', 'generic', [[0, 0], [-50, 0]]), P('Fridolinsbrücke', 'rail', [[100, 0], [100, 40]]), P('Fridolinsbrücke', 'generic', [[300, 0], [400, 0]])];
  assert.deepEqual(bridgeChain(pieces, 0).sort(), [0, 1, 2, 3]);       // other name, rail deck (#76) and a detached piece stay out
  assert.deepEqual(bridgeChain([P('', 'stone', [[0, 0], [1, 0]]), P('', 'generic', [[1, 0], [2, 0]])], 0), [0]);
});
test('bankTop is the first sample where the rise over the next 4 m drops below 8 %', () => {
  assert.equal(bankTop([2.6, 3.5, 4.5, 5.4, 6.6, 7.8, 8.4, 8.5, 8.55, 8.6, 8.6]), 6);   // index 5 rises (8.55 - 7.8) / 4 = 0.19, index 6 (8.6 - 8.4) / 4 = 0.05
  assert.equal(bankTop([0, 0.05, 0.1, 0.15, 0.2, 0.25]), 0);
  assert.equal(bankTop([0, 1, 2, 3, 4, 5]), 5);
  assert.equal(bankTop([5, 4, 3, 2, 1, 0]), 0);                                          // falling ground is not a bank to climb
});
test('pastEnd tells before the start, past the end and on the polyline apart', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.equal(pastEnd(pts, -1, 2), -1);
  assert.equal(pastEnd(pts, 5, 3), 0);
  assert.equal(pastEnd(pts, 11, 12), 1);
  assert.equal(pastEnd(pts, 9, 10), 0);
});
test('deckLine is linear along a -> b and clamped beyond both ends', () => {
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, 50, 30), 11);
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, -20, 0), 7);
  assert.equal(deckLine([0, 0], 7, [100, 0], 15, 130, 0), 15);
});
test('cutPolyline keeps the first s metres', () => {
  assert.deepEqual(cutPolyline([[0, 0], [10, 0], [10, 10]], 15), [[0, 0], [10, 0], [10, 5]]);
  assert.deepEqual(cutPolyline([[0, 0], [10, 0]], 50), [[0, 0], [10, 0]]);
  assert.deepEqual(cutPolyline([[0, 0], [10, 0]], 0), [[0, 0], [0, 0]]);
});
test('bridgeDeckOffset does not fade at ends flagged as joints (#78)', () => {
  const b = { len: 40, h0: 0, h1: 0, fade0: false };
  assert.equal(bridgeDeckOffset(b, 0), 0.3);
  assert.equal(bridgeDeckOffset(b, 40), 0);
  assert.equal(bridgeDeckOffset({ ...b, fade1: false }, 40), 0.3);
  assert.equal(bridgeDeckOffset({ len: 40, h0: 0, h1: 0 }, 0), 0);      // unflagged: today's fade
});
```

- [ ] **Step 2: Run and watch them fail.** `node --test prototype/tests/*.test.mjs`. Expected: the new tests FAIL, because the imports are missing.

- [ ] **Step 3: Implement.** In `prototype/world.js`, replace line 74 (`bridgeDeckOffset`) with:

```js
// Surface sits up to 0.3 m above the deck, fading in over the first/last 5 m so the bridge meets the terrain at both ends; an end
// flagged fade0/fade1 === false is a joint with the next piece of a chain (#78) and keeps the full offset.
export function bridgeDeckOffset(b, t) { const a = b.fade0 === false ? Infinity : t, e = b.fade1 === false ? Infinity : b.len - t; return 0.3 * Math.max(0, Math.min(1, Math.min(a, e) / 5)); }
```

and add after `bridgeAccepts`:

```js
// #78: indices of the bridge pieces that join the hero piece `seed`: same non-empty name and an endpoint within 0.5 m of the group,
// generic pieces only (so #76's rail decks never join). The Fridolinsbrücke is four OSM ways.
export function bridgeChain(pieces, seed) {
  const out = [seed], name = pieces[seed].name, ends = (p) => [p.pts[0], p.pts[p.pts.length - 1]];
  const touches = (p) => ends(p).some(e => out.some(j => ends(pieces[j]).some(q => Math.hypot(e[0] - q[0], e[1] - q[1]) <= 0.5)));
  if (!name) return out;
  for (let grew = true; grew;) { grew = false; for (let i = 0; i < pieces.length; i++) { const p = pieces[i]; if (out.includes(i) || p.kind !== 'generic' || p.name !== name || !touches(p)) continue; out.push(i); grew = true; } }
  return out;
}
// #78: first sample (1 m apart) whose rise over the next `run` samples is below maxGrade: the top of the bank an approach road climbs
export function bankTop(hs, maxGrade = 0.08, run = 4) { for (let i = 0; i + run < hs.length; i++) if ((hs[i + run] - hs[i]) / run < maxGrade) return i; return hs.length - 1; }
// #78: -1 behind the polyline's first vertex, 1 beyond its last, else 0 (nearestOnPolyline clamps, this does not)
export function pastEnd(pts, x, z) {
  const n = pts.length, [ax, az] = pts[0], [bx, bz] = pts[1], [cx, cz] = pts[n - 2], [dx, dz] = pts[n - 1];
  if ((x - ax) * (bx - ax) + (z - az) * (bz - az) < 0) return -1;
  return (x - dx) * (dx - cx) + (z - dz) * (dz - cz) > 0 ? 1 : 0;
}
// #78: height on the straight deck line from bank point a (height ha) to bank point b (height hb), clamped at both banks
export function deckLine(a, ha, b, hb, x, z) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return ha + (hb - ha) * u; }
// #78: the first s metres of a polyline
export function cutPolyline(pts, s) {
  const out = [pts[0]]; let acc = 0; s = Math.max(0, s);
  for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (acc + L >= s) { const u = L ? (s - acc) / L : 0; out.push([x0 + (x1 - x0) * u, z0 + (z1 - z0) * u]); return out; } out.push(pts[i + 1]); acc += L; }
  return out;
}
```

- [ ] **Step 4: Run.** `node --test prototype/tests/*.test.mjs`. Expected: all PASS, the old `bridgeDeckOffset` tests included.
- [ ] **Step 5: Commit.** `git add prototype/world.js prototype/tests/world.test.mjs && git commit -m "feat(bridges): chain, bank-top and deck-line helpers for split bridges (#78)"`

---

### Task 3: Heights, abutments and `onBridge` (physics)

**Files:**
- Modify: `prototype/index.html`:
  - the import (line 203);
  - after the `OSM_BRIDGES` loop (line 372);
  - `fillBridgeHeights` (line 374);
  - `onBridge` (line 340);
  - the hooks (lines 982-983).

**Interfaces:**
- Each `OSM_BRIDGES` entry gains:
  - optional `fade0` / `fade1` (`false` = joint);
  - `approach: true` on abutment pieces, whose `r` is a shallow copy of the road with the cut `pts`;
  - `id` = `r.id`.
- `STONE_AXIS`: `null`, or `{ a: [x, z], ha, e: [x, z], he }`. Set by `buildStoneChain` when the stone chain has exactly two banks.
- `__mm.stoneChain()` → `{ ids, approaches, banks: [{ x, z, h }, { x, z, h }] }`, ordered by `x` (DE west first).

- [ ] **Step 1: Import.** Extend the `./world.js` import on line 203 with `bridgeChain, bankTop, pastEnd, deckLine, cutPolyline`.

- [ ] **Step 2: Grow the hero chains.** Directly after the `if (L) for (const r of L.bridges) { ... }` loop (ends line 372), add:

```js
// #78: a hero piece grows along same-named generic bridge pieces sharing an endpoint (the Fridolinsbrücke is four OSM ways); rail decks (#76) never join
for (const kind of ['wood', 'stone']) { const seed = OSM_BRIDGES.findIndex(b => b.kind === kind); if (seed < 0) continue; for (const i of bridgeChain(OSM_BRIDGES.map(b => ({ name: b.r.n, kind: b.kind, pts: b.r.pts })), seed)) if (OSM_BRIDGES[i].kind === 'generic') Object.assign(OSM_BRIDGES[i], { kind, hw: kind === 'wood' ? 2.6 : 4.2 }); }
```

The grid entries were registered with the old, wider `hw`. That is fine, because the grid is only a broad phase.

- [ ] **Step 3: Heights and abutments.** Replace `fillBridgeHeights` (line 374) with today's per-piece rule followed by `buildStoneChain()`, and add the helpers before it. Write them in the file's dense style. Reference implementation:

```js
let STONE_AXIS = null;
// #78: roads (no bridges, none in skip) with an endpoint within 0.5 m of p, each oriented away from p
const roadsFrom = (p, skip) => { const out = []; for (const r of ROADS) { if (r.bridge || skip.has(r)) continue; const a = r.pts[0], e = r.pts[r.pts.length - 1]; if (Math.hypot(a[0] - p[0], a[1] - p[1]) <= 0.5) out.push({ r, pts: r.pts }); else if (Math.hypot(e[0] - p[0], e[1] - p[1]) <= 0.5) out.push({ r, pts: [...r.pts].reverse() }); } return out; };
const sampleH = (pts, step = 1) => { const n = Math.floor(polylineLength(pts) / step), hs = []; for (let k = 0; k <= n; k++) { const q = cutPolyline(pts, k * step), [x, z] = q[q.length - 1]; hs.push(terrainH(x, z)); } return hs; };
// #78: height of the bank an open end sits under: mean over its roads of the terrain at the bank top, walking on (first continuation) up to 60 m
function bankHeight(ends) { const tops = []; for (const p of ends) for (const first of roadsFrom(p, new Set())) { let pts = first.pts; const seen = new Set([first.r]); while (polylineLength(pts) < 60) { const nx = roadsFrom(pts[pts.length - 1], seen)[0]; if (!nx) break; seen.add(nx.r); pts = [...pts, ...nx.pts.slice(1)]; } const hs = sampleH(cutPolyline(pts, 60)); tops.push(hs[bankTop(hs)]); } return tops.length ? tops.reduce((s, h) => s + h, 0) / tops.length : null; }
// #78: arc length where the terrain along pts first reaches h (1 m samples, linear between), null if not within maxS
function reachAt(pts, h, maxS) { const hs = sampleH(pts); for (let k = 0; k < hs.length && k <= maxS; k++) if (hs[k] >= h) return k === 0 ? 0 : k - 1 + (h - hs[k - 1]) / (hs[k] - hs[k - 1]); return null; }
// #78: the abutment pieces from open end p: every connected road (and onward, branching, up to 60 m in all) up to where its terrain reaches H
function approachPieces(p, H, seen, acc = 0, out = []) { for (const { r, pts } of roadsFrom(p, seen)) { seen.add(r); const len = polylineLength(pts), s = reachAt(pts, H, 60 - acc); if (s !== null) { out.push({ r, pts: cutPolyline(pts, s), reached: true }); continue; } const cut = Math.min(len, 60 - acc); out.push({ r, pts: cutPolyline(pts, cut), reached: false, joint: cut >= len && acc + len < 60 }); if (cut >= len && acc + len < 60) approachPieces(pts[pts.length - 1], H, seen, acc + len, out); } return out; }
function addApproach({ r, pts, reached, joint }, H) { const b = { r: { ...r, pts }, id: r.id, len: polylineLength(pts), hw: Math.max(4.2, r.w / 2), kind: 'stone', approach: true, h0: H, h1: reached || joint ? H : terrainH(...pts[pts.length - 1]), fade0: false, ...(joint ? { fade1: false } : {}) }; OSM_BRIDGES.push(b); for (let i = 0; i < pts.length - 1; i++) gridAddSegment(BRIDGE_GRID, ...pts[i], ...pts[i + 1], b.hw * 2, b); }
// #78: the stone chain gets one straight deck line between its two bank tops, plus flat abutments over the bank-climbing approach roads
function buildStoneChain() {
  const chain = OSM_BRIDGES.filter(b => b.kind === 'stone' && !b.approach), end = (b, k) => k ? b.r.pts[b.r.pts.length - 1] : b.r.pts[0], near = (p, q, d) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= d;
  const opens = []; for (const b of chain) for (const k of [0, 1]) { const p = end(b, k); if (chain.some(o => o !== b && [0, 1].some(j => near(end(o, j), p, 0.5)))) b['fade' + k] = false; else opens.push({ b, k, p }); }
  const banks = []; for (const { p } of opens) { const bk = banks.find(k => k.some(q => near(q, p, 15))); if (bk) bk.push(p); else banks.push([p]); }
  if (banks.length !== 2) return;   // not a two-bank crossing: keep the endpoint heights
  banks.sort((A, B) => A[0][0] - B[0][0]);
  const H = banks.map(k => bankHeight(k) ?? terrainH(...k[0])), mid = (k) => [k.reduce((s, p) => s + p[0], 0) / k.length, k.reduce((s, p) => s + p[1], 0) / k.length];
  STONE_AXIS = { a: mid(banks[0]), ha: H[0], e: mid(banks[1]), he: H[1] };
  const at = (p) => deckLine(STONE_AXIS.a, H[0], STONE_AXIS.e, H[1], p[0], p[1]); for (const b of chain) { b.h0 = at(end(b, 0)); b.h1 = at(end(b, 1)); }
  const seen = new Set(); banks.forEach((k, i) => { for (const p of k) for (const ap of approachPieces(p, H[i], seen)) addApproach(ap, H[i]); });
  for (const o of opens) if (OSM_BRIDGES.some(x => x.approach && near(x.r.pts[0], o.p, 0.5))) o.b['fade' + o.k] = false;   // an end that continues as an abutment is a joint too
}
function fillBridgeHeights() { for (const b of OSM_BRIDGES) { const p = b.r.pts; b.h0 = terrainH(p[0][0], p[0][1]); b.h1 = terrainH(p[p.length - 1][0], p[p.length - 1][1]); } buildStoneChain(); }
```

`fillBridgeHeights` runs once (line 397), after `terrainH` is usable and before anything drapes or places. Keep it that way. If #76 is on `main`, its crossing and cut computation still runs **after** this call.

- [ ] **Step 4: `onBridge`.** In line 340, change the OSM test to:

```js
if (L) { for (const b of gridQuery(BRIDGE_GRID, x, z, 1)) { const n = nearestOnPolyline(b.r.pts, x, z); if (n.d <= b.hw && !(b.approach && b.fade1 !== false && pastEnd(b.r.pts, x, z) === 1) && (b.approach || bridgeAccepts(bridgeSurfaceAt(b, n.t), y))) return { b, t: n.t, osm: true }; } return null; }
```

Add a comment: an abutment (#78) is solid ground at any height and ends exactly at the bank top, with no endpoint plateau.

- [ ] **Step 5: Hooks.** In `__mm.sim` and `__mm.car` (lines 982-983), replace `bridge: !!onBridge(P.x, P.z, P.y)` with `bridge: isDeck(onBridge(P.x, P.z, P.y))`. Define before them `const isDeck = (ob) => !!ob && !ob.b.approach;   // #78: an abutment is road on fill, not a bridge (keeps #79's "not on a bridge")`. Then add:

```js
window.__mm.stoneChain = () => ({ ids: OSM_BRIDGES.filter(b => b.kind === 'stone' && !b.approach).map(b => b.r.id), approaches: OSM_BRIDGES.filter(b => b.approach).length, banks: STONE_AXIS ? [{ x: STONE_AXIS.a[0], z: STONE_AXIS.a[1], h: STONE_AXIS.ha }, { x: STONE_AXIS.e[0], z: STONE_AXIS.e[1], h: STONE_AXIS.he }] : [] });
```

- [ ] **Step 6: Run the node tests and the reproduction.** Run `node --test prototype/tests/*.test.mjs` (PASS), then the Playwright file from Task 1, in the foreground.
  - Expected PASS: `test_chain_and_banks`, `test_deck_profile_has_no_steps`, `test_deck_stands_above_the_rhine`, both drive tests, `test_jump_spot_lands_on_the_abutment`.
  - The parapet tests may still FAIL, because there are no walls yet (Task 4).
  - If the profile test fails, print the profile around the worst step and fix the cause (a bank height, a joint flag, an abutment end). Never fix it by loosening the 0.15 m bound.
  - Exception: a step that lies **outside** the abutments (before the DE bank point or past the CH bank point) and shows the same number on `main` is a pre-existing road-drape artifact, not this bug. Then shorten `LINE` to the abutments ± 10 m and say so in the PR body.
  - Record the measured `banks` heights and the worst step in the commit body.
- [ ] **Step 7: Commit.** `git add prototype/index.html && git commit -m "fix(bridges): Fridolinsbrücke deck runs level between the bank tops (#78)"`. Push.

---

### Task 4: Draw the whole chain as the stone bridge, with walls

**Files:**
- Modify: `prototype/index.html`, the hero block (lines 737-748)

**Interfaces:**
- `heroStone(pcs)` draws every `kind === 'stone'` piece (bridge and approach pieces) along its polyline. It pushes wall OBBs and draws three piers along the bridge pieces at 0.3, 0.5 and 0.7 of `STONE_AXIS`.

- [ ] **Step 1: Implement `heroStone`** next to `heroBridge`. Reference implementation:

```js
  // #78: the stone hero drawn per piece along its polyline (the Fridolinsbrücke bends and splits into two carriageways at Stein): deck, underside,
  // parapets with 2 m wall OBBs (dropped where they would stand on another piece of the chain), stone skirts under the abutments, three piers
  function heroStone(pcs) {
    for (const p of pcs) {
      const pts = resample(p.r.pts, 2), hs = (x, z) => bridgeSurfaceAt(p, nearestOnPolyline(p.r.pts, x, z).t), onOther = (x, z) => pcs.some(o => o !== p && nearestOnPolyline(o.r.pts, x, z).d < o.hw);
      strip(pts, p.hw * 2, 0.06, 'road', col('#ffffff'), 8, hs); strip(pts, p.hw * 2 + 1.6, -1.0, 'stone', col('#c8c2b6'), 4, hs);
      for (const s of [-1, 1]) { const side = offsetPolyline(pts, s * (p.hw + 0.5)), pos = [], nrm = [], uv = [];
        for (let i = 0; i < side.length - 1; i++) { const [x0, z0] = side[i], [x1, z1] = side[i + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L2 = Math.hypot(x1 - x0, z1 - z0) || 1; if (onOther(mx, mz)) continue;
          strip([side[i], side[i + 1]], 0.5, 1.0, 'stone', col('#d8d2c6'), 4, hs); pushOBB({ x: mx, z: mz, hw: L2 / 2, hd: 0.4, c: (x1 - x0) / L2, s: (z1 - z0) / L2, h: 2, bridge: true, y0: hs(mx, mz) - 1.5 });
          if (p.approach) { const A = [x0, hs(x0, z0) - 1, z0], B = [x1, hs(x1, z1) - 1, z1], C = [x1, terrainH(x1, z1) - 0.5, z1], D = [x0, terrainH(x0, z0) - 0.5, z0], nx = -(z1 - z0) / L2 * s, nz = (x1 - x0) / L2 * s; for (const v of [A, B, C, A, C, D, A, C, B, A, D, C]) { pos.push(...v); nrm.push(nx, 0, nz); } for (let k = 0; k < 4; k++) uv.push(0, 0, 1, 0, 1, 1); } }
        if (pos.length) rawGeo(pos, nrm, uv, 0, 0, 0, col('#b8b2a6'), 'stone'); }
    }
    const { a, e } = STONE_AXIS, main = pcs.filter(p => !p.approach);
    for (const u of [0.3, 0.5, 0.7]) { const x = a[0] + (e[0] - a[0]) * u, z = a[1] + (e[1] - a[1]) * u; let best = null; for (const p of main) { const n = nearestOnPolyline(p.r.pts, x, z); if (!best || n.d < best.n.d) best = { p, n }; } const q = cutPolyline(best.p.r.pts, best.n.t), [px, pz] = q[q.length - 1], top = bridgeSurfaceAt(best.p, best.n.t) - 1.05, wl = WATER.levelAt(px, pz), bottom = wl !== null ? wl - 5 : terrainH(px, pz) - 1, c = new THREE.CylinderGeometry(3.5, 4, top - bottom, 10); c.translate(px, (top + bottom) / 2, pz); colorize(c, col('#b8b2a6')); push('stone', c); }
  }
```

  The skirt pushes both windings, so it shows from either side whatever the material's `side` is. `WATER` is `null` without measured terrain. If `REAL` is null, use `terrainH(px, pz) - 1` for the pier bottom, like today's `REAL ? ... : 0` guard on line 746.

- [ ] **Step 2: Use it.** In the hero block, collect heroes with `ob.kind === 'wood' || ob.kind === 'stone'`. Inside the `for (const kind in heroes)` loop, start with `if (kind === 'stone' && STONE_AXIS) { heroStone(heroes.stone); continue; }`. The straight-chord code stays as the fallback, and the Holzbrücke still uses it. The generic loop (`kind === 'generic'`) is unchanged; grown pieces are no longer generic.
- [ ] **Step 3: Run the reproduction file.** Expected: all tests in `test_fridolinsbruecke.py` PASS, including both parapet tests.
- [ ] **Step 4: Visual check (foreground).** Take one screenshot from the chase camera on the deck at (−1300, 513), heading 0.32. Check that the parapets run along both sides, that there are no walls across the carriageways at (−1272, 524) or at the Stein junction, and that the skirts close the abutment. Save it under `docs/ai-notes/` only if it shows a problem worth keeping. Otherwise do not commit it.
- [ ] **Step 5: Commit.** `git add prototype/index.html && git commit -m "feat(bridges): the whole Fridolinsbrücke is the stone bridge, with parapets (#78)"`. Push.

---

### Task 5: Full suites, TODO and changelog

**Files:**
- Modify: `TODO.md` (line 49), `CHANGELOG.md`

- [ ] **Step 1: Run everything (foreground).**
  - `node --test prototype/tests/*.test.mjs`.
  - Then the whole Playwright suite: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q`.

  Expected: all PASS. Watch in particular:
  - `test_car_slides_along_holzbruecke_rails` (Holzbrücke unchanged);
  - `test_osm_rhine_splash_and_overpass` (generic overpass unchanged);
  - `test_wheels_do_not_sink_into_the_road` and `test_grass_and_fields_stay_below_the_road` (roads under the abutments are skipped through `BRIDGE_GRID`);
  - `test_jump.py` (#79's Fridolinsbrücke test, if #79 is on `main`).

  If an old test fails three times, stop and report what breaks.
- [ ] **Step 2: TODO.md.** Delete the line `- **Fridolinsbrücke only two-thirds a stone bridge in OSM mode.** …` under "OSM world — open from the final review (2026-10-01)". Issue #78 replaces it.
- [ ] **Step 3: CHANGELOG.md.** Under `## [Unreleased]`, in `### Fixed` (create the heading after `### Added`/`### Changed` if missing), add:

```markdown
- The Fridolinsbrücke no longer throws the car into the air. The deck now runs level from the road in Bad Säckingen up to the road in Stein, high above the Rhine instead of sagging to the water, and the whole bridge is the stone bridge with parapets — you can no longer drive off its side into the river.
```

- [ ] **Step 4: Commit and open the PR.** `git add TODO.md CHANGELOG.md && git commit -m "docs(bridges): changelog and TODO for the level Fridolinsbrücke (#78)"`. Push and open the PR titled `fix(bridges): Fridolinsbrücke deck level with the roads (#78)`, with `Closes #78` in the body.
