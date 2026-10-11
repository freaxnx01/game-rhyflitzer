# Holzbrücke True to Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the covered wooden bridge Stein–Bad Säckingen along its real S-shaped line with six piers, three chapels and a timber frame inside, and move its deck and rails onto that line.

**Architecture:** A new pure module `prototype/holzbruecke.js` holds the measurements and turns the bridge's polyline into frame and pier stations. A new function `heroWood` in `prototype/index.html` builds the geometry and the rail colliders from those stations with the existing helpers (`strip`, `box`, `rawGeo`, `push`, `pushOBB`). The wooden pieces lose their straight `hero` chord, so `onBridge` measures them against the polyline, as it already does for every piece without `hero`.

**Tech Stack:** Vanilla JavaScript ES modules, three.js r170 from the import map, `node --test` for unit tests, pytest + Playwright (Chromium, SwiftShader) for browser tests. No build step, no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-holzbruecke-true-to-plan-design.md`

## Global Constraints

- No GLB, no `GLTFLoader`, no new package, no `package.json`. Geometry comes from three.js primitives only.
- Deck half-width stays `hw = 2.6`. The shortcut toast (`ob.b.kind === 'wood' && ob.t > 40`) stays untouched.
- Roof colour stays `#6a3a2a`; timber colours stay `#c8a880` (light) and `#b08a60` (dark); pier stone `#a8a296`.
- Measurements: eave 4.2 m and ridge 6.4 m above the deck, roof overhang 0.9 m, parapet 1.1 m, frame bay ≤ 5 m, pier width 3.05 m, pier fractions from the Stein end `0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497`.
- Chapels: pier index 4 south `polygon` depth 3.0 length 4.0; pier index 4 north `polygon` depth 1.7 length 4.0; pier index 2 south `pent` depth 1.0 length 2.0. South is game `+z`.
- All geometry goes through `push(role, geometry)` with the roles `wood`, `roof`, `stone`, so both graphic styles work.
- Match the file's style: long single-line statements in `index.html`, a comment with the issue number above new blocks.
- Run Playwright in the **foreground** with a generous timeout. Never `run_in_background`. Commit and push the branch **before** starting browser verification.
- Run only the tests named in this plan, not the whole browser suite (it takes about two hours).
- Never edit a test to make it pass. The one test that changes (`test_holzbruecke_deck_reaches_its_rails`) changes because the requirement changed: the deck now follows the line, not the chord.
- Commits follow Conventional Commits; the PR closes #241.

## Review Focus

- **Rail joints and bends.** The rails become one collider per 2 m instead of one per side. A car sliding along a rail must not snag on a joint or at one of the four bends. Pinned by the four crossing runs in Task 2 and by the existing `test_car_slides_along_holzbruecke_rails`.
- **OSM way direction.** A rebuilt world may list the bridge west→east. Pier stations and chapel sides are defined from Stein. Pinned by the `orientEastWest` test in Task 1.
- **Bridge split into several OSM ways.** `bridgeChain` exists because that happens. Pinned by the `joinPolylines` tests in Task 1.
- **Duplicate consecutive points** in a polyline give a zero-length segment and a direction of `NaN`. Pinned by the `frameStations` duplicate-point test in Task 1.
- **Hand-traced fallback.** With the world file missing, the game builds the bridge from `BRIDGES` (two points). It must still load without a console error. Pinned by running the existing `test_hand_traced_fallback` in Task 2.

---

### Task 1: Layout module `prototype/holzbruecke.js`

**Files:**
- Create: `prototype/holzbruecke.js`
- Test: `prototype/tests/holzbruecke.test.mjs`

**Interfaces:**
- Consumes: `polylineLength(pts)` from `prototype/world.js` (`pts` is `[[x, z], …]`, returns metres).
- Produces:
  - `HOLZ` — `{ eave, ridge, overhang, parapet, bay, pierFractions: number[6], pierWidth, chapels: [{ pier, side, kind, depth, length }] }`
  - `orientEastWest(pts) → pts` — first point is the eastern end
  - `joinPolylines(lines, tol = 0.5) → pts` — one polyline from pieces that share endpoints
  - `frameStations(pts, bay) → [{ x, z, ux, uz, t }]`
  - `pierStations(pts, fractions) → [{ x, z, ux, uz, t }]`

- [ ] **Step 1: Write the failing test**

Create `prototype/tests/holzbruecke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLZ, orientEastWest, joinPolylines, frameStations, pierStations } from '../holzbruecke.js';

// the bridge line of data/world_hochrhein.json (OSM w85692214), Stein -> Säckingen
const LINE = [[-1079.9, -75.0], [-1111.5, -79.5], [-1135.8, -81.8], [-1161.9, -81.5], [-1220.4, -86.8], [-1284.7, -94.2]];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('HOLZ carries the measured roof and the six pier stations from the Stein end', () => {
  assert.equal(HOLZ.eave, 4.2);
  assert.equal(HOLZ.ridge, 6.4);
  assert.deepEqual(HOLZ.pierFractions, [0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497]);
});

test('HOLZ.chapels: two polygonal ones on the second pier from Säckingen, a pent one on the fourth', () => {
  assert.deepEqual(HOLZ.chapels, [
    { pier: 4, side: 1, kind: 'polygon', depth: 3.0, length: 4.0 },
    { pier: 4, side: -1, kind: 'polygon', depth: 1.7, length: 4.0 },
    { pier: 2, side: 1, kind: 'pent', depth: 1.0, length: 2.0 },
  ]);
});

test('orientEastWest puts the eastern (Stein) end first', () => {
  assert.deepEqual(orientEastWest(LINE), LINE);
  assert.deepEqual(orientEastWest(LINE.slice().reverse()), LINE);
});

test('joinPolylines returns a single piece unchanged', () => {
  assert.deepEqual(joinPolylines([LINE]), LINE);
});

test('joinPolylines chains pieces that share an endpoint, whatever their direction', () => {
  const a = LINE.slice(0, 3), b = LINE.slice(2, 5).reverse(), c = LINE.slice(4);
  const joined = joinPolylines([b, c, a]);
  assert.deepEqual(orientEastWest(joined), LINE);
});

test('joinPolylines leaves out a piece that touches nothing', () => {
  const stray = [[500, 500], [510, 500]];
  assert.deepEqual(joinPolylines([LINE, stray]), LINE);
});

test('frameStations puts a frame on every vertex and keeps every gap within the bay', () => {
  const f = frameStations(LINE, HOLZ.bay);
  for (const [x, z] of LINE) assert.ok(f.some(s => near(s.x, x) && near(s.z, z)), `no frame at ${x}, ${z}`);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].t - f[i - 1].t <= HOLZ.bay + 1e-9 && f[i].t > f[i - 1].t);
  assert.ok(f.length >= 40);
  const last = f[f.length - 1], end = LINE[LINE.length - 1];
  assert.ok(near(last.x, end[0]) && near(last.z, end[1]));
});

test('a frame on a vertex points along the segment that starts there; the last frame along the last segment', () => {
  const f = frameStations([[0, 0], [-10, 0], [-10, 10]], 5);
  assert.deepEqual(f.map(s => [s.x, s.z, s.ux, s.uz]), [[0, 0, -1, 0], [-5, 0, -1, 0], [-10, 0, 0, 1], [-10, 5, 0, 1], [-10, 10, 0, 1]]);
});

test('frameStations ignores a repeated point instead of producing NaN directions', () => {
  const f = frameStations([[0, 0], [0, 0], [-10, 0], [-10, 0]], 5);
  assert.deepEqual(f.map(s => [s.x, s.z, s.ux, s.uz]), [[0, 0, -1, 0], [-5, 0, -1, 0], [-10, 0, -1, 0]]);
});

test('frameStations refuses a line without two distinct points', () => {
  assert.throws(() => frameStations([[1, 1], [1, 1]], 5), /at least two/);
});

test('pierStations: six piers at the documented fractions, in order, with unit directions', () => {
  const p = pierStations(LINE, HOLZ.pierFractions), len = 205.9;
  assert.equal(p.length, 6);
  p.forEach((s, i) => {
    assert.ok(Math.abs(s.t - HOLZ.pierFractions[i] * len) < 0.1, `pier ${i} at ${s.t}`);
    assert.ok(near(Math.hypot(s.ux, s.uz), 1, 1e-9));
    assert.ok(i === 0 || s.t > p[i - 1].t);
  });
});

test('the piers stand close to the bends of the OSM line (the bends are the piers)', () => {
  const p = pierStations(LINE, HOLZ.pierFractions);
  for (const [i, v] of [[0, 1], [1, 2], [2, 3], [4, 4]]) assert.ok(Math.hypot(p[i].x - LINE[v][0], p[i].z - LINE[v][1]) < 3, `pier ${i}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test prototype/tests/holzbruecke.test.mjs`
Expected: FAIL, `Cannot find module '…/prototype/holzbruecke.js'`.

- [ ] **Step 3: Write the implementation**

Create `prototype/holzbruecke.js`:

```js
// #241: the covered wooden Holzbrücke Stein–Bad Säckingen, laid out from measurements instead of by eye. Pure: no three.js, no DOM.
// Sources: swisstopo swissBUILDINGS3D 3.0, tile 1049-33 (2024), BuildingPart ID_62E48E33-707A-4079-8CA2-B966E2A4E3D5 (roof heights,
// chapel extents) and de.wikipedia.org "Holzbrücke Bad Säckingen" (seven openings of 29.10, 31.10, 26.21, 26.61, 21.19, 23.14 and
// 28.06 m from Säckingen on six piers; chapels on the second and fourth pier). See docs/superpowers/specs/2026-10-10-holzbruecke-true-to-plan-design.md
import { polylineLength } from './world.js';

export const HOLZ = {
  eave: 4.2, ridge: 6.4,            // m above the deck surface
  overhang: 0.9,                    // roof edge beyond the deck edge
  parapet: 1.1,                     // boarded lower wall
  bay: 5,                           // largest frame spacing, m
  pierFractions: [0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497],   // pier centres along the bridge, from the Stein end
  pierWidth: 3.05,                  // along the bridge
  chapels: [                        // pier: index into pierFractions; side: +1 = south (+z), -1 = north; depth: out from the wall
    { pier: 4, side: 1, kind: 'polygon', depth: 3.0, length: 4.0 },
    { pier: 4, side: -1, kind: 'polygon', depth: 1.7, length: 4.0 },
    { pier: 2, side: 1, kind: 'pent', depth: 1.0, length: 2.0 },
  ],
};

// Stein is the eastern end; fractions and chapel sides count from there, and the direction of an OSM way is no contract
export function orientEastWest(pts) { return pts[0][0] >= pts[pts.length - 1][0] ? pts : pts.slice().reverse(); }

// one polyline from pieces that share endpoints (an OSM bridge may be split into several ways); a piece touching nothing is left out
export function joinPolylines(lines, tol = 0.5) {
  const touch = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const rest = lines.slice().sort((a, b) => polylineLength(b) - polylineLength(a));
  let out = rest.shift().slice();
  for (let grown = true; grown;) {
    grown = false;
    for (let i = 0; i < rest.length; i++) {
      const l = rest[i], back = l.slice().reverse(), head = out[0], tail = out[out.length - 1];
      const next = touch(tail, l[0]) ? out.concat(l.slice(1)) : touch(tail, back[0]) ? out.concat(back.slice(1))
        : touch(head, back[0]) ? l.slice(0, -1).concat(out) : touch(head, l[0]) ? back.slice(0, -1).concat(out) : null;
      if (!next) continue;
      out = next; rest.splice(i, 1); grown = true; break;
    }
  }
  return out;
}

function distinct(pts) {
  const out = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (out.length < 2) throw new Error('holzbruecke: a line needs at least two distinct points');
  return out;
}

// point and unit direction at arc length t; on a vertex the direction is that of the segment starting there
function station(line, t) {
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (acc + L > t || i === line.length - 2) {
      const u = Math.min(1, Math.max(0, (t - acc) / L));
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, ux: (bx - ax) / L, uz: (bz - az) / L, t };
    }
    acc += L;
  }
}

// a frame on every vertex, and evenly spaced frames in between so that no gap exceeds bay
export function frameStations(pts, bay) {
  const line = distinct(pts), out = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const L = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]), n = Math.max(1, Math.ceil(L / bay));
    for (let k = 0; k < n; k++) out.push(station(line, acc + L * k / n));
    acc += L;
  }
  out.push(station(line, acc));
  return out;
}

export function pierStations(pts, fractions) {
  const line = distinct(pts), len = polylineLength(line);
  return fractions.map(f => station(line, f * len));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test prototype/tests/holzbruecke.test.mjs`
Expected: PASS, 12 tests, 0 failed.

- [ ] **Step 5: Run the neighbouring unit tests**

Run: `node --test prototype/tests/world.test.mjs prototype/tests/landmarks.test.mjs`
Expected: PASS (nothing in them changed; this guards the import of `world.js`).

- [ ] **Step 6: Commit**

```bash
git add prototype/holzbruecke.js prototype/tests/holzbruecke.test.mjs
git commit -m "feat(world): layout module for the true-to-plan Holzbrücke (#241)"
```

---

### Task 2: Build the bridge along its line in `prototype/index.html`

**Files:**
- Create: `prototype/tests/test_holzbruecke.py`
- Modify: `prototype/index.html` — the import block (around line 330), `heroBridge` (around line 1218), the `BRIDGES` loop (around line 1248), the hero loop of the OSM layout (around line 1251)
- Modify: `prototype/tests/test_smoke.py` — remove `test_holzbruecke_deck_reaches_its_rails` (around lines 173–200)

Line numbers drift; find each place by the quoted text.

**Interfaces:**
- Consumes from Task 1: `HOLZ`, `orientEastWest(pts)`, `joinPolylines(lines)`, `frameStations(pts, bay)`, `pierStations(pts, fractions)`.
- Consumes from `index.html` (existing, inside the world-building function): `strip(pts, w, y, role, c, tileLen, hFn)`, `box(w, h, d, x, y, z, rot, c, role, tile, dark)` (`y` is the base, local x runs along `rot`), `rawGeo(pos, nrm, uv, rot, x, z, c, role)`, `push(role, geo)`, `colorize(geo, c)`, `pushOBB({ x, z, hw, hd, c, s, h, bridge, y0 })`, `resample(pts, step)`, `col(hex)`, `bridgeLocal(b, x, z)`, `bridgeProfile(b, t)`; from `world.js` (already imported): `offsetPolyline`, `nearestOnPolyline`, `bridgeSurfaceAt`, `polylineLength`, `pointAtLength`.
- Produces: `heroWood(pts, hs, pierBase, y0)`; `window.__mm.counts.holzbruecke = { frames, piers, chapels }`.

- [ ] **Step 1: Write the failing browser test**

Create `prototype/tests/test_holzbruecke.py`:

```python
"""#241: the Holzbrücke follows its S-shaped line, stands on six piers and carries three chapels."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

pytestmark = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def bridge_line():
    """The bridge's OSM line, from the Stein (eastern) end."""
    w = json.loads(WORLD.read_text(encoding="utf-8")); hb = w["anchors"]["landmarks"]["holzbruecke"]
    road = min((r for r in w["roads"] if r.get("bridge")), key=lambda r: min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]))
    return road["pts"] if road["pts"][0][0] >= road["pts"][-1][0] else road["pts"][::-1]


def at(pts, t, s=0.0):
    """([x, z], heading) at arc length t along pts, s metres to one side of the line."""
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if acc + seg >= t or b is pts[-1]:
            u = (t - acc) / seg; ux, uz = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            return [a[0] + (b[0] - a[0]) * u + uz * s, a[1] + (b[1] - a[1]) * u - ux * s], math.atan2(uz, ux)
        acc += seg


@pytest.fixture(scope="module")
def bridge(server):
    pts = bridge_line(); length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    inside = [(t, s) for t in range(10, int(length) - 9, 5) for s in (-2.2, 2.2)]
    outside = [(t, s) for t in range(60, 141, 10) for s in (-4.5, 4.5)]
    starts = [(t, *at(pts, t)) for t in (5, 40, 70, 120)]
    msgs = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        counts = page.evaluate("() => window.__mm.counts.holzbruecke || null")
        ground = lambda ps: page.evaluate(f"() => {json.dumps([at(pts, t, s)[0] for t, s in ps])}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")
        g_in, g_out = ground(inside), ground(outside)
        runs = [(t, [x, z], page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 15, 3)")) for t, (x, z), th in starts]
        br.close()
    # own-page messages only, as in test_smoke.load: the terrain 404 is on purpose, third-party resources are not under test
    own = [t for t, u in msgs if "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]
    return {"counts": counts, "inside": list(zip(inside, g_in)), "outside": list(zip(outside, g_out)), "runs": runs, "msgs": own}


def test_six_piers_three_chapels_and_a_frame_every_five_metres(bridge):
    assert bridge["counts"] is not None, "window.__mm.counts.holzbruecke is not set"
    assert bridge["counts"]["piers"] == 6
    assert bridge["counts"]["chapels"] == 3
    assert bridge["counts"]["frames"] >= 40


def test_deck_follows_the_line(bridge):
    """2.2 m either side of the line is deck all the way; 4.5 m either side over the Rhine is water, so the deck is not just wider."""
    holes = [(ts, g) for ts, g in bridge["inside"] if g <= -1]
    widened = [(ts, g) for ts, g in bridge["outside"] if g >= -1]
    assert holes == [], holes
    assert widened == [], widened


def test_car_crosses_every_bend(bridge):
    """Started on the line at 15 m/s with the gas held, the car runs through the bends at 32, 56, 82 and 141 m without stopping on a
    rail joint and without ending in the Rhine."""
    for t, start, r in bridge["runs"]:
        assert r["y"] > -1, (t, r)                                          # not in the river
        assert math.dist(start, (r["x"], r["z"])) > 35 and r["speed"] > 10, (t, r)   # kept going


def test_no_console_errors(bridge):
    assert bridge["msgs"] == []
```

- [ ] **Step 2: Run it to verify it fails**

Run (foreground, timeout 15 minutes): `python -m pytest prototype/tests/test_holzbruecke.py -q`
Expected: `test_six_piers_three_chapels_and_a_frame_every_five_metres` FAILS with "window.__mm.counts.holzbruecke is not set". `test_deck_follows_the_line` FAILS with holes near the bends (the deck is still on the chord). The other two may pass.

If Playwright or Chromium is missing: `pip install playwright pytest && playwright install chromium`.

- [ ] **Step 3: Import the module**

In `prototype/index.html`, directly after the line

```js
import { LANDMARK_INFO, landmarkEntries, filterLandmarks, gemeindenOf, faceToward, rampApproach } from './landmarks.js';
```

add

```js
import { HOLZ, orientEastWest, joinPolylines, frameStations, pierStations } from './holzbruecke.js';
```

- [ ] **Step 4: Add `heroWood` and reduce `heroBridge` to the stone bridge**

Find `function heroBridge(b, hAt, pierBase) {`. Its body is an `if (b.kind === 'stone') { … } else { … }`. Delete the whole `else { … }` branch (it starts with `else { strip(pts, b.hw * 2, 0.06, 'wood', col('#ffffff'), 4, hf);` and ends with the three-pier loop `for (const t of [0.25, 0.5, 0.75]) { … push('stone', c); } }`). Turn the remaining `if (b.kind === 'stone') { … }` into a plain block by removing the `if (b.kind === 'stone')` test and its braces, so the function body is: the `hf`/`pts`/`off` line, the `wall` line, then the stone statements.

Replace the three comment lines above `heroBridge` (they start with `// bridges: the hero models (stone Fridolinsbrücke:`) with:

```js
  // bridges: the stone hero model on one straight span (deck, parapets, piers) -- the hand layout's Fridolinsbrücke and the OSM one while
  // its chain is no two-bank crossing. b: straight span a -> b (len, ux, uz, rot, hw); hAt(t): deck surface height at distance t along it;
  // pierBase: height the piers start at (5 m under the water surface). The wooden Holzbrücke is heroWood below.
```

Directly **after** the closing brace of `heroBridge`, add:

```js
  // #241: the covered wooden Holzbrücke along its line (S-shaped: the bends sit on the piers) -- deck, boarded parapets, posts, braces,
  // wall plates, a gabled roof that shows from below, a truss per frame, six stone piers and the three chapels (prototype/holzbruecke.js).
  // pts: the line from the Stein end; hs(x, z): deck surface height; pierBase: where the piers start; y0: floor of the rail colliders
  function heroWood(pts, hs, pierBase, y0) {
    const hw = 2.6, H = HOLZ, wallAt = hw + 0.2, line = resample(pts, 2), frames = frameStations(pts, H.bay), piers = pierStations(pts, H.pierFractions);
    const timber = col('#c8a880'), dark = col('#b08a60'), roofC = col('#6a3a2a');
    // a metres along f's direction and d metres out on side s (+1 = south while the line runs east -> west), then lifted y above the deck
    const P = (f, a, s, d) => [f.x + f.ux * a + f.uz * s * d, f.z + f.uz * a - f.ux * s * d];
    const V = ([x, z], y) => [x, hs(x, z) + y, z];
    const quad = (A, B, C, D, c, role) => {   // both windings: boards and the roof show from either side
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1, pos = [], nrm = [];
      for (const v of [A, B, C, A, C, D]) { pos.push(...v); nrm.push(n[0] / l, n[1] / l, n[2] / l); }
      for (const v of [A, C, B, A, D, C]) { pos.push(...v); nrm.push(-n[0] / l, -n[1] / l, -n[2] / l); }
      rawGeo(pos, nrm, [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1], 0, 0, 0, c, role); };
    strip(line, hw * 2, 0.06, 'wood', col('#ffffff'), 4, hs); strip(line, hw * 2 + 0.8, -0.5, 'wood', dark, 4, hs);
    for (const s of [-1, 1]) {
      strip(offsetPolyline(line, s * wallAt), 0.3, H.eave, 'wood', timber, 4, hs);   // wall plate
      const rail = offsetPolyline(line, s * (hw + 0.3));   // colliders per 2 m piece, overlapping a little so a bend leaves no gap
      for (let i = 0; i < rail.length - 1; i++) { const [x0, z0] = rail[i], [x1, z1] = rail[i + 1], len = Math.hypot(x1 - x0, z1 - z0) || 1;
        pushOBB({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: len / 2 + 0.1, hd: 0.3, c: (x1 - x0) / len, s: (z1 - z0) / len, h: 2, bridge: true, ...(y0 !== undefined ? { y0 } : {}) }); }
    }
    for (let i = 0; i < frames.length; i++) { const f = frames[i], g = frames[i + 1], rot = Math.atan2(f.uz, f.ux), yf = hs(f.x, f.z), top = P(f, 0, 1, 0);
      box(2 * wallAt, 0.25, 0.25, f.x, yf + H.eave - 0.25, f.z, rot + Math.PI / 2, dark, 'wood', [1, 1], 0);   // tie beam
      box(0.2, H.ridge - H.eave, 0.2, f.x, yf + H.eave, f.z, rot, dark, 'wood', [1, 1], 0);                     // king post
      for (const s of [-1, 1]) { const w = P(f, 0, s, wallAt);
        box(0.3, H.eave, 0.3, w[0], hs(w[0], w[1]), w[1], rot, timber, 'wood', [1, 1], 0);                      // post
        quad(V(w, H.eave), V(top, H.ridge), V(top, H.ridge - 0.25), V(w, H.eave - 0.25), dark, 'wood');         // rafter
        if (!g) continue;
        const w1 = P(g, 0, s, wallAt), top1 = P(g, 0, 1, 0);
        quad(V(w, 0), V(w1, 0), V(w1, H.parapet), V(w, H.parapet), timber, 'wood');                              // boarded parapet
        quad(V(w, H.parapet), V(w1, H.eave - 0.25), V(w1, H.eave), V(w, H.parapet + 0.25), dark, 'wood');        // brace
        quad(V(P(f, 0, s, hw + H.overhang), H.eave), V(P(g, 0, s, hw + H.overhang), H.eave), V(top1, H.ridge), V(top, H.ridge), roofC, 'roof'); } }
    // piers: hexagonal in plan, pointed up- and downstream, pierWidth along the bridge and 2 * hw + 3 across
    for (const p of piers) { const top = hs(p.x, p.z) - 0.55, c = new THREE.CylinderGeometry(1, 1, top - pierBase, 6);
      c.scale(H.pierWidth / 2 / 0.866, 1, hw + 1.5); c.rotateY(-Math.atan2(p.uz, p.ux)); c.translate(p.x, (top + pierBase) / 2, p.z); c.computeVertexNormals(); colorize(c, col('#a8a296')); push('stone', c); }
    // chapels stand outside the rails on a pier: a half-hexagon with a half-pyramid roof, or a box with a lean-to roof
    for (const ch of H.chapels) { const p = piers[ch.pier], rot = Math.atan2(p.uz, p.ux), yd = hs(p.x, p.z), half = ch.length / 2;
      if (ch.kind === 'pent') { const [cx, cz] = P(p, 0, ch.side, wallAt + ch.depth / 2);
        box(ch.length, H.eave - 1.2, ch.depth, cx, yd, cz, rot, timber, 'wood', [1, 1], 0);
        quad(V(P(p, -half - 0.2, ch.side, wallAt), H.eave - 0.6), V(P(p, half + 0.2, ch.side, wallAt), H.eave - 0.6), V(P(p, half + 0.2, ch.side, wallAt + ch.depth + 0.2), H.eave - 1.2), V(P(p, -half - 0.2, ch.side, wallAt + ch.depth + 0.2), H.eave - 1.2), roofC, 'roof');
        continue; }
      const phi = Math.atan2(-p.ux * ch.side, p.uz * ch.side), [bx, bz] = P(p, 0, ch.side, wallAt);   // local +x points out of the wall
      const body = new THREE.CylinderGeometry(1, 1, H.eave, 6, 1, true, 0, Math.PI); body.scale(ch.depth, 1, half); body.rotateY(-phi); body.translate(bx, yd + H.eave / 2, bz); body.computeVertexNormals(); colorize(body, timber); push('wood', body);
      const cap = new THREE.ConeGeometry(1, 1.4, 6, 1, true, 0, Math.PI); cap.scale(ch.depth + 0.3, 1, half + 0.3); cap.rotateY(-phi); cap.translate(bx, yd + H.eave + 0.7, bz); cap.computeVertexNormals(); colorize(cap, roofC); push('roof', cap); }
    window.__mm.counts.holzbruecke = { frames: frames.length, piers: piers.length, chapels: H.chapels.length };
  }
```

- [ ] **Step 5: Call `heroWood` from the hand layout**

Replace the line

```js
  for (const b of BRIDGES) heroBridge(b, (t) => bridgeProfile(b, t), b.kind === 'stone' ? -5 : -4.5);
```

with

```js
  for (const b of BRIDGES) { if (b.kind === 'wood') heroWood(orientEastWest([b.a, b.b]), (x, z) => bridgeProfile(b, bridgeLocal(b, x, z)[0]), -4.5); else heroBridge(b, (t) => bridgeProfile(b, t), -5); }
```

- [ ] **Step 6: Call `heroWood` from the OSM layout**

Find the hero loop. It contains

```js
    for (const kind in heroes) {
      if (kind === 'stone' && STONE_AXIS) { heroStone(heroes.stone); continue; }
```

Directly after that `if` line, add:

```js
      if (kind === 'wood') {   // #241: along the pieces' own line, not a chord; no hero span, so onBridge measures the line too
        const wood = heroes.wood, wpts = orientEastWest(joinPolylines(wood.map(p => p.r.pts))), mid = pointAtLength(wpts, polylineLength(wpts) / 2);
        const hs = (x, z) => { let bp = null; for (const p of wood) { const n = nearestOnPolyline(p.r.pts, x, z); if (!bp || n.d < bp.n.d) bp = { p, n }; } return bridgeSurfaceAt(bp.p, bp.n.t); };
        const wy0 = Math.min(...wood.map(p => Math.min(p.h0, p.h1))) - 1.5, wl = REAL ? (WATER.levelAt(mid[0], mid[1]) ?? wy0 - 4) : 0;
        heroWood(wpts, hs, wl - 4.5, wy0); continue; }
```

The rest of the loop body now only ever runs for the stone bridge without `STONE_AXIS`. In its last line, replace `heroBridge(hb, hAt, wl - (kind === 'stone' ? 5 : 4.5));` with `heroBridge(hb, hAt, wl - 5);`.

Update the two comment lines above the loop (they start with `// OSM: one straight hero span per kind,`) to:

```js
  // OSM: the wooden bridge is drawn along its own line (heroWood); the stone one along its chain (heroStone) or, while that chain is no
  // two-bank crossing, on one straight span between its farthest-apart points (heroBridge). Generic bridges stay flat strips.
```

- [ ] **Step 7: Check the page loads in both layouts**

Run: `node --test prototype/tests/holzbruecke.test.mjs` — Expected: PASS.

Run (foreground): `python -m pytest prototype/tests/test_smoke.py -q -k "hand_traced_fallback or osm_layout"`
Expected: both PASS with `msgs == []`. A failure here is a syntax or reference error in the edits above; read the message, fix the edit.

- [ ] **Step 8: Move the #137 deck test**

In `prototype/tests/test_smoke.py`, delete the whole function `test_holzbruecke_deck_reaches_its_rails`, including its `@pytest.mark.skipif` decorator line. Its replacement is `test_deck_follows_the_line` in `prototype/tests/test_holzbruecke.py`: the same points, measured from the line instead of from the chord, because the deck now follows the line (decided with the user on 2026-10-10).

Leave `test_car_slides_along_holzbruecke_rails` in place and unchanged.

- [ ] **Step 9: Commit and push before the browser run**

```bash
git add prototype/index.html prototype/tests/test_holzbruecke.py prototype/tests/test_smoke.py
git commit -m "feat(world): Holzbrücke along its S-shaped line with piers, chapels and trusses (#241)"
git push -u origin HEAD
```

- [ ] **Step 10: Run the browser tests**

Run (foreground, timeout 20 minutes):
`python -m pytest prototype/tests/test_holzbruecke.py prototype/tests/test_smoke.py -q -k "holzbruecke or hand_traced_fallback or osm_layout"`

Expected: PASS — the four tests of `test_holzbruecke.py`, plus `test_car_slides_along_holzbruecke_rails`, `test_hand_traced_fallback` and `test_osm_layout`.

Reading a failure:

- `test_deck_follows_the_line` holes → a wooden piece still carries `hero`, or `heroWood` was not reached. Check Step 6 sits before the straight-span code.
- `test_car_crosses_every_bend` with `speed` near 0 → the car is stuck on a rail joint. Check the collider line in Step 4: `hw: len / 2 + 0.1` (overlap) and `c`/`s` taken from the segment, not from `rot`.
- `test_car_slides_along_holzbruecke_rails` fails with `bridge` false or `along` small → its start point (40 m along the **chord**) now lies up to 1.5 m off the deck centre. The spec allows one change to it: take the start from the line instead. Replace its two lines `ux, uz = …` and `x, z = …` by the line-based start

  ```python
      line = min((r for r in w["roads"] if r.get("bridge") and near(r)), key=lambda r: min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]))["pts"]
      (x, z), (bx, bz) = line[1], line[2]
      ux, uz = (bx - x) / math.dist(line[1], line[2]), (bz - z) / math.dist(line[1], line[2])
      x, z = x + ux * 5, z + uz * 5
  ```

  and keep its three assertions as they are. Do this only if the unchanged test fails for that reason.

After three failed attempts at the same test, stop and report what fails and why.

- [ ] **Step 11: Look at it**

Serve the repo (`python3 -m http.server 8000`) and take two screenshots with Playwright in the foreground: one from the bank and one from the deck. Read both images. The roof must close along the ridge, the posts must stand on the deck edge, the piers must reach the water, and the chapels must sit on the 2nd and 4th pier from the Säckingen (western) end.

```python
from playwright.sync_api import sync_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 960, "height": 540})
    page.goto("http://localhost:8000/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    page.click("#startbtn")
    for name, (x, z, th) in {"deck": (-1100.0, -77.9, 3.0), "bank": (-1060.0, -40.0, 3.6)}.items():
        page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 0, 0.1, [])")
        page.wait_for_timeout(8000)
        page.screenshot(path=f"holzbruecke-{name}.png")
    br.close()
```

Do not commit the screenshots. If a part is visibly wrong (roof open, chapel on the wrong side, pier floating), fix the geometry in `heroWood`, re-run Step 10, and commit the fix.

- [ ] **Step 12: Commit any fixes**

```bash
git add prototype/index.html prototype/tests/test_smoke.py
git commit -m "fix(world): Holzbrücke geometry after the first look (#241)"
git push
```

Skip this step if Steps 10 and 11 needed no change.

---

### Task 3: Changelog and concept doc

**Files:**
- Modify: `CHANGELOG.md` — `## [Unreleased]` → `### Changed`
- Modify: `docs/01-concept.md:79`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the changelog entry**

In `CHANGELOG.md`, under `## [Unreleased]`, find the `### Changed` heading and add this as its first list item:

```markdown
- The Holzbrücke now looks like the real one: it runs in a gentle S across the Rhine instead of dead straight, stands on six stone piers, and carries its three little chapels — two on the second pier from Bad Säckingen and the one with the lean-to roof on the fourth. Drive through it and you see the timber frame overhead: a tie beam, a king post and rafters every few metres, with a boarded parapet and diagonal braces along the sides. It is still the forbidden shortcut, and the rails still hold the car.
```

- [ ] **Step 2: Correct the concept doc**

In `docs/01-concept.md`, in the table row that starts with `| Holzbrücke Bad Säckingen |`, replace

```text
203.7 m long, 5 m wide, 9 spans, roofed.
```

with

```text
203.7 m long, 3.4–5 m wide, seven openings on six piers, S-shaped in plan, roofed. Built procedurally in the game since #241.
```

Leave the rest of the row as it is.

- [ ] **Step 3: Run the unit tests once more**

Run: `node --test prototype/tests/*.test.mjs`
Expected: PASS, 0 failed.

- [ ] **Step 4: Commit and push**

```bash
git add CHANGELOG.md docs/01-concept.md
git commit -m "docs(world): changelog and concept doc for the true-to-plan Holzbrücke (#241)"
git push
```

- [ ] **Step 5: Open the pull request**

Title: `feat(world): Holzbrücke along its S-shaped line with piers, chapels and trusses`

Body sections: Summary; Changes; Testing (the commands of Task 2 Step 10 and Task 3 Step 3 with their results, and what the two screenshots showed); `Closes #241`.
