# Underwater Rhine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Driving into the Rhine no longer resets the car after 2.8 s: it sinks onto a real riverbed and creeps along it at walking pace through blue-green murk, between boulders, waterweed and schools of fish, past a sunken rowing boat and a rusty car; it drives out where the bed meets the bank, or **R** puts it back on the road (#101).

**Architecture:** A pure module `prototype/underwater.js` (node-tested) holds the constants `UW`, the bed profile `bedDepth`, the sampling helper `bedSamples`, the fish helper `schoolPose` and the small predicates `submerged` / `underwaterCamY`. `prototype/index.html` (1) lowers `groundH` and the drawn terrain to the bed and replaces the hand path's gravel sheet by two draped shore strips; (2) changes `stepCar`'s water branch (no reset, sink to the bed, water drag, hint toast); (3) adds `setUnderwater(on)` for fog / sky / lights, makes the `water` material double-sided, pulls the chase camera under the surface and adds the bubbles; (4) builds the content in `buildUnderwater()` (boulders into `stone`, weed into a new `weed` role, fish as one `InstancedMesh`, a `wreck` group) and animates the fish while `UW.on`. One string pair in `prototype/strings.js`. Hooks `__mm.underwater()` and `__mm.bed(x, z)` for the Playwright tests.

**Tech Stack:** Vanilla JS (ES modules), three.js (`InstancedMesh`, `FogExp2`, `Sprite`), `node --test`, pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-09-underwater-rhine-design.md` (issue #101).

## Global Constraints

- Buildless static game: no packages, no framework, no assets (CLAUDE.md). Everything is three.js primitives.
- `test_vehicles.py`'s golden `stepCar` trace runs on land and must not change: every water modifier is gated on `wl !== null`.
- `onBridge` stays first in `groundH` and `waterLevelAt` — bridges are untouched.
- New UI text goes through `tr()` with en and de entries, Swiss spelling (`strings.test.mjs`).
- Line numbers below are from `main` @ `56a2af3`; re-find by the quoted code, not by number.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/<file> -q -p no:cacheprovider`. Commit and push before long verification.

## Review Focus

1. **The land trace.** Expected: `test_vehicles.py` green and unchanged — no water modifier reaches a car on land. Pinned by running it in Task 6.
2. **Bridges.** Expected: the Holzbrücke and Fridolinsbrücke decks are unchanged (`onBridge` precedes the river branch). Pinned by `test_fridolinsbruecke.py` in Task 6.
3. **No step at the shoreline.** Expected: `bedDepth(0) = 0`, so the car drives out of the water without a kerb. Pinned by `test_drives_out_at_the_bank` (Task 3).
4. **Look switches with the camera.** Expected: fog turns blue only once the camera is below the surface and restores when it rises. Pinned by `test_look_follows_the_camera` (Task 4).
5. **Nothing visible from above changes.** Expected: `__mm.waterVisible` counts unchanged on the river (the double-sided surface is the same from above). Pinned by `test_smoke.py` water tests in Task 6.

---

### Task 1: Pure module `underwater.js`

**Files:**
- Create: `prototype/underwater.js`
- Test: `prototype/tests/underwater.test.mjs`

**Interfaces:**
- Produces: `export const UW = { slope: 0.3, maxDepth: 6, sink: 3, drag: 1.2, topFactor: 0.2, camUnder: 0.8, fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5, hintAt: 3, schools: 14, sampleStep: 12, shoreClear: 8 }`; `bedDepth(riverDist)`; `submerged(y, wl)`; `underwaterCamY(targetY, wl)`; `bedSamples(bounds, step, inside, rnd)`; `makeSchool(x, z, bed, rnd)`; `schoolPose(school, k, t)`.
- Consumes: nothing (pure, no three.js, no DOM).

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/underwater.test.mjs`:

```js
// #101: the underwater Rhine -- pure helpers. node --test prototype/tests/underwater.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UW, bedDepth, submerged, underwaterCamY, bedSamples, makeSchool, schoolPose } from '../underwater.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };   // a deterministic rnd()

test('UW: the agreed constants', () => {
  assert.deepEqual(UW, { slope: 0.3, maxDepth: 6, sink: 3, drag: 1.2, topFactor: 0.2, camUnder: 0.8, fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5, hintAt: 3, schools: 14, sampleStep: 12, shoreClear: 8 });
});

test('bedDepth_Shoreline_IsZeroSoTheCarDrivesOut', () => {
  assert.equal(bedDepth(0), 0);
  assert.equal(bedDepth(5), 0, 'on land: nothing');
});

test('bedDepth_InsideTheRiver_ShelvesAtTheSlopeAndCapsAtMaxDepth', () => {
  close(bedDepth(-10), 3);
  close(bedDepth(-20), 6);
  close(bedDepth(-92), 6, 1e-9, 'the smoke test spot at riverDist -92');
});

test('submerged_CarWellUnderTheSurface_True_JustUnderOrAbove_False', () => {
  assert.equal(submerged(4.4, 5.5), true);
  assert.equal(submerged(5.2, 5.5), false);
  assert.equal(submerged(6, 5.5), false);
  assert.equal(submerged(-2, null), false, 'no water: never');
});

test('underwaterCamY_PullsTheChaseTargetUnderTheSurface_LeavesALowerOneAlone', () => {
  close(underwaterCamY(9, 5.5), 5.5 - UW.camUnder);
  close(underwaterCamY(3, 5.5), 3);
});

test('bedSamples_JitteredGridInsideTheWaterOnly', () => {
  const inside = (x, z) => x >= 0 && x < 50 && z >= 0 && z < 50;
  const pts = bedSamples([-30, -30, 80, 80], 10, inside, seq(0.5));
  assert.ok(pts.length > 0);
  for (const [x, z] of pts) assert.ok(inside(x, z), `${x},${z}`);
  assert.equal(pts.length, 25, '5 x 5 cells of 10 m inside a 50 m square, jitter 0.5 keeps them on the cell centre');
  const noWater = bedSamples([0, 0, 100, 100], 10, () => false, seq(0.5));
  assert.equal(noWater.length, 0);
});

test('makeSchool_FromTheRanges_ColourByIndex', () => {
  const s = makeSchool(100, -40, 2.5, seq(0, 1, 0.5), 2);
  assert.deepEqual(Object.keys(s).sort(), ['colour', 'n', 'omega', 'phase', 'r', 'x', 'y', 'z']);
  assert.equal(s.x, 100); assert.equal(s.z, -40);
  assert.ok(s.n >= 8 && s.n <= 14, 'fish per school');
  assert.ok(s.r >= 5 && s.r <= 12, 'radius');
  assert.ok(s.omega >= 0.3 && s.omega <= 0.6, 'rad/s');
  assert.ok(s.y >= 2.5 + 0.8 && s.y <= 2.5 + 2.5, 'swims above the bed, under the surface');
  assert.equal(s.colour, '#d88a4a', 'school 2 is the Rotfeder');
});

test('schoolPose_FishOnTheCircle_HeadingAlongTheTangent_Bobbing', () => {
  const s = { x: 0, z: 0, y: 3, r: 10, n: 4, omega: 0.5, phase: 0, colour: '#b9c3cc' };
  const p0 = schoolPose(s, 0, 0), p1 = schoolPose(s, 1, 0);
  close(Math.hypot(p0.x - s.x, p0.z - s.z), 10, 1e-9, 'on the circle');
  close(Math.hypot(p1.x - s.x, p1.z - s.z), 10);
  close(Math.atan2(p1.z - s.z, p1.x - s.x) - Math.atan2(p0.z - s.z, p0.x - s.x), Math.PI / 2, 1e-9, 'fish 1 is a quarter turn on');
  close(p0.th, Math.atan2(p0.x - s.x, -(p0.z - s.z)) , 1e-9, 'heading is the tangent (counter-clockwise seen from above)');
  assert.ok(Math.abs(p0.y - s.y) <= 0.3, 'bobs within 0.3 m');
  const later = schoolPose(s, 0, 2);
  close(Math.atan2(later.z - s.z, later.x - s.x) - Math.atan2(p0.z - s.z, p0.x - s.x), 1, 1e-9, 'omega 0.5 rad/s for 2 s');
});
```

- [ ] **Step 2: Run them to see them fail.** Run (repo root): `node --test prototype/tests/underwater.test.mjs`
Expected: FAIL — cannot find module `../underwater.js`.

- [ ] **Step 3: Implement.** Create `prototype/underwater.js`:

```js
// #101: the underwater Rhine -- pure helpers (no three.js, no DOM). node --test prototype/tests/underwater.test.mjs
// Units m, m/s, rad/s. riverDist is negative inside the water (index.html riverDist / the pipeline SDF).
export const UW = {
  slope: 0.3, maxDepth: 6,          // bed: 0 at the shoreline, slope x distance in, capped (the Rhine above the Säckingen weir)
  sink: 3, drag: 1.2, topFactor: 0.2,   // a car in the water sinks at 3 m/s; on the bed: 1.2 /s drag, a fifth of the top speed
  camUnder: 0.8,                     // the chase target is pulled this far under the surface once the car is submerged
  fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5,   // the look under the surface
  hintAt: 3,                         // seconds after the splash: "drive up to the bank, or press R"
  schools: 14, sampleStep: 12, shoreClear: 8,   // content: fish schools; bed samples every 12 m, at least 8 m from the shore
};

export function bedDepth(riverDist) { return riverDist >= 0 ? 0 : Math.min(UW.maxDepth, -riverDist * UW.slope); }

// the car counts as submerged half a metre under the surface (the splash itself is not "underwater")
export function submerged(y, wl) { return wl !== null && wl !== undefined && y < wl - 0.5; }

export function underwaterCamY(targetY, wl) { return Math.min(targetY, wl - UW.camUnder); }

// a jittered grid over [x0, z0, x1, z1]: one point per step x step cell, moved by up to +-step/2 * (rnd - 0.5) * 2 ... kept if inside(x, z)
export function bedSamples([x0, z0, x1, z1], step, inside, rnd) {
  const out = [];
  for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
    const px = x + (rnd() - 0.5) * step, pz = z + (rnd() - 0.5) * step;
    if (inside(px, pz)) out.push([px, pz]);
  }
  return out;
}

const COLOURS = ['#b9c3cc', '#7d9a6a', '#d88a4a'];   // silver, green, Rotfeder
const rr = (rnd, a, b) => a + rnd() * (b - a);

// a school circling (x, z), between 0.8 and 2.5 m above the bed, colour by school index
export function makeSchool(x, z, bed, rnd, index = 0) {
  return { x, z, y: bed + rr(rnd, 0.8, 2.5), r: rr(rnd, 5, 12), n: Math.floor(rr(rnd, 8, 15)), omega: rr(rnd, 0.3, 0.6), phase: rr(rnd, 0, Math.PI * 2), colour: COLOURS[index % COLOURS.length] };
}

// fish k of the school at time t: on the circle, a share of the turn ahead of fish 0, heading along the tangent, bobbing 0.3 m
export function schoolPose(s, k, t) {
  const a = s.phase + s.omega * t + (k / s.n) * Math.PI * 2;
  const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
  return { x, y: s.y + 0.3 * Math.sin(t * 2 + k), z, th: Math.atan2(Math.cos(a), -Math.sin(a)) };
}
```

(`th` is the game's heading convention, 0 = +x, growing with +z; the tangent of a counter-clockwise circle at angle `a` is `(-sin a, cos a)`, so `th = atan2(cos a, -sin a)` — the test states it as `atan2(x - cx, -(z - cz))`, the same thing.)

- [ ] **Step 4: Run the tests.** `node --test prototype/tests/underwater.test.mjs`
Expected: all 8 pass. If `makeSchool`'s `n` or `y` fall outside the asserted ranges with the `seq(0, 1, 0.5)` generator, fix the ranges in the implementation, not the test.

- [ ] **Step 5: Run every node test.** `node --test prototype/tests/*.test.mjs`
Expected: green.

- [ ] **Step 6: Commit.** `git add prototype/underwater.js prototype/tests/underwater.test.mjs && git commit -m "feat(world): pure helpers for the underwater Rhine (#101)"`

---

### Task 2: The riverbed

**Files:**
- Modify: `prototype/index.html` — the import line (`:241`), `groundH` (`:560`), the ground vertex loop (`:851`), the hand river ribbons (`:877`), hooks (`:1324` area)
- Test: `prototype/tests/test_underwater.py` (new; hand layout, pattern of `test_heli.py`)

**Interfaces:**
- Produces: `groundH` inside the river = `max(wl - bedDepth(riverDist(x, z)), fill)`; drawn terrain vertices inside the Rhine at that height in sand colour; `__mm.bed(x, z)` → `{ ground, water, depth, drawn }` (`drawn` = raycast hit on `MESH.grass` from above, null if none).
- Consumes: `bedDepth` from `underwater.js`; `riverDist`, `waterLevelAt`, `WATER`, `offsetPolyline` (already imported).

- [ ] **Step 1: Write the failing test.** Create `prototype/tests/test_underwater.py`:

```python
"""#101 the underwater Rhine: a real bed, the car stays and drives down there, the look under the surface, fish and wrecks.
Hand-traced layout (world + terrain blocked): deterministic, water level 0. (863.6, -647.7) is the middle of the hand
Rhine (riverDist -107: the hand river is 42 px x 2.54 = 106.7 m to each bank; bed 6 m); the south bank (+z) is 107 m away.
Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MID_RHINE = (863.6, -647.7)


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 1280, "height": 720}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def car(page):
    return page.evaluate("() => window.__mm.car()")


def bed(page, x, z):
    return page.evaluate("([x, z]) => window.__mm.bed(x, z)", [x, z])


def text(page, sel):
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def test_bed_shelves_from_the_shore_to_six_metres_and_is_drawn(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        mid = bed(page, *MID_RHINE)
        shore = bed(page, 863.6, -647.7 + 105.7)       # 1 m inside the hand river's south edge (hw 106.7 m)
        b.close()
    assert mid["water"] == 0 and mid["depth"] == 6 and mid["ground"] == -6
    assert mid["drawn"] is not None and abs(mid["drawn"] - mid["ground"]) < 0.6, mid   # the grass mesh is lowered to the bed
    assert shore["water"] == 0 and 0 <= shore["depth"] < 1.0, shore                      # no cliff at the shoreline
```

- [ ] **Step 2: Run it to see it fail.** `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underwater.py -q -p no:cacheprovider -k bed_shelves`
Expected: FAIL — `window.__mm.bed is not a function`.

- [ ] **Step 3: Import and lower `groundH`.** In `prototype/index.html`, after the `world.js` import line (`:241`) add:

```js
import { UW, bedDepth, submerged, underwaterCamY, bedSamples, makeSchool, schoolPose } from './underwater.js';
```

In `groundH` (`:560`) replace

```js
  const wl = waterSurface(riverDist(x, z), L && REAL ? WATER.levelAt(x, z) : 0); if (wl !== null) return Math.max(wl - 3, fill);
```

with

```js
  // #101: the bed shelves from the shoreline (0) to 6 m (bedDepth); the car lies and drives on it
  const rd = riverDist(x, z), wl = waterSurface(rd, L && REAL ? WATER.levelAt(x, z) : 0); if (wl !== null) return Math.max(wl - bedDepth(rd), fill);
```

Update the comment on `waterLevelAt` (`:542`): „the river bed is `bedDepth` under it (groundH)".

- [ ] **Step 4: Lower and colour the drawn terrain.** In the ground vertex loop (`:851`) — the line starting `{ const p = ground.attributes.position, uv = ground.attributes.uv, cArr = …` — replace the body of the `for` with:

```js
for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); let h = terrainH(x, z), c = groundCol(h);
  // #101: inside the Rhine the vertex goes down to the bed, in sand (the smooth style ignores vertex colours: green there)
  const rd = riverDist(x, z), wl = rd < 0 ? waterLevelAt(x, z, 1e4) : null;
  if (wl !== null && !onBridge(x, z, 1e4)) { h = Math.min(h, wl - bedDepth(rd)); c = BED_COL; }
  p.setY(i, h); uv.setXY(i, uv.getX(i) * GW / 20, uv.getY(i) * GD / 20); cArr[i * 3] = c.r; cArr[i * 3 + 1] = c.g; cArr[i * 3 + 2] = c.b; }
```

and define `const BED_COL = col('#8c7b5a');` next to `lo, mid, hi` on `:850`. (`waterLevelAt` is defined at `:543`, before the build block — it is in scope. The stream branch of `waterLevelAt` cannot fire here because `rd < 0` is the river.)

- [ ] **Step 5: Hand path — two shore strips instead of the gravel sheet.** Replace `:877`

```js
    ribbon(RIVER.pts, RIVER.hw + 14, 0.03, 'gravel', col('#c8bca4'), 12);
```

with

```js
    for (const s of [-1, 1]) ribbon(offsetPolyline(RIVER.pts, s * (RIVER.hw + 7)), 7, 0.03, 'gravel', col('#c8bca4'), 12, true);   // #101: a strip per bank, draped, so the bed shows between them
```

Check `offsetPolyline`'s sign convention in `world.js:78` (left/right of the polyline direction); either sign works here because both sides are drawn.

- [ ] **Step 6: Hook.** Next to `__mm.probe` (`:1305`) add:

```js
window.__mm.bed = (x, z) => { const rd = riverDist(x, z), water = waterLevelAt(x, z, 1e4); const ray = new THREE.Raycaster(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)); const h = MESH.grass ? ray.intersectObject(MESH.grass, false)[0] : null; return { ground: groundH(x, z, 1e4), water, depth: water === null ? 0 : bedDepth(rd), drawn: h ? h.point.y : null }; };
```

- [ ] **Step 7: Run the test.** Same command as Step 2.
Expected: PASS. If `drawn` misses by more than 0.6 m mid-river, the vertex loop did not run for that vertex — check that `riverDist` there is negative (`__mm.probe`) and that `waterLevelAt(x, z, 1e4)` is 0 on the hand path.

- [ ] **Step 8: Keep the existing water tests green.** `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_smoke.py -q -p no:cacheprovider -k "splash or fishes"`
Expected: 3 passed (the OSM one needs `data/terrain_hochrhein.mmh`, which is in the repo).

- [ ] **Step 9: Commit.** `git add -A prototype && git commit -m "feat(world): a shelving riverbed under the Rhine (#101)"`

---

### Task 3: Stay down there and drive

**Files:**
- Modify: `prototype/index.html` — `stepCar` (`:1350`, `:1355-1358`, `:1361`), `resetCar` (`:1247`), `takeOff` (`:1269`); `prototype/strings.js` (en after `fishes` `:71`, de after `:196`)
- Test: `prototype/tests/test_underwater.py` (extend), `prototype/tests/strings.test.mjs` (runs as is)

**Interfaces:**
- Produces: a car in the river sinks at `UW.sink` to `groundH` and then drives with `UW.topFactor` / `UW.drag`; no `resetCar` from water; `P.hinted` flag; toast `underwaterHint` at `P.splash >= UW.hintAt`; `__mm.car()` gains `submerged`.
- Consumes: `submerged`, `UW`.

- [ ] **Step 1: Write the failing tests.** Append to `test_underwater.py`:

```python
def test_car_sinks_to_the_bed_and_stays(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 5", timeout=180000)
        c = car(page)
        b.close()
    assert c["water"] == 0 and c["splash"] > 5, c            # no reset at 2.8 s
    assert c["submerged"] is True and abs(c["y"] - c["ground"]) < 0.3 and c["ground"] <= -5.5, c   # lying on the bed


def test_drives_on_the_bed_at_walking_pace(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        start = page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.1, [])", list(MID_RHINE))   # drop it, let it settle 0.1 s
        s = page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 6, ['KeyW'])", list(MID_RHINE))
        b.close()
    assert s["speed"] <= 12.5, s                              # a fifth of the compact's 60 m/s top; with the drag it settles near 6 m/s
    assert s["speed"] > 1.5 and s["x"] - MID_RHINE[0] > 8, s   # but it does move


def test_drives_out_at_the_bank(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        # from mid-river straight south (th = pi/2, +z) for 40 s: 107 m of bed at ~6 m/s, then the gravel bank
        s = page.evaluate("([x, z]) => window.__mm.sim(x, z, Math.PI / 2, 0, 40, ['KeyW'])", list(MID_RHINE))
        c = car(page)
        b.close()
    assert c["water"] is None and s["z"] > MID_RHINE[1] + 107, (s, c)   # out of the water, on the bank


@pytest.mark.parametrize("locale,expected", [("en-US", "Drive up to the bank, or press R for the road."), ("de-CH", "Fahr ans Ufer hoch, oder drück R für die Strasse.")])
def test_hint_after_three_seconds_in_the_game_language(server, locale, expected):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        first = text(page, "#toast")
        page.wait_for_function("() => window.__mm.car().splash > 3.3", timeout=180000)
        second = text(page, "#toast")
        b.close()
    assert first in ("Sleep with the fishes!", "Grüss mir die Fische!")
    assert second == expected


def test_r_puts_the_car_back_on_the_road(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 1", timeout=180000)
        page.keyboard.press("KeyR")
        page.wait_for_function("() => window.__mm.car().water === null", timeout=60000)
        c = car(page)
        b.close()
    assert c["splash"] == 0 and c["submerged"] is False
```

- [ ] **Step 2: Run them to see them fail.** `… -m pytest prototype/tests/test_underwater.py -q -p no:cacheprovider -k "sinks or walking or bank or hint or road"`
Expected: `sinks` fails (reset at 2.8 s: `splash` never passes 5), `walking` fails (speed ~0), `hint` fails (no second toast), `road` fails on `submerged` (missing key).

- [ ] **Step 3: Strings.** In `prototype/strings.js` after `fishes` (en, `:71`):

```js
  underwaterHint: 'Drive up to the bank, or press R for the road.',
```

and after the de `fishes` (`:196`):

```js
  underwaterHint: 'Fahr ans Ufer hoch, oder drück R für die Strasse.',
```

- [ ] **Step 4: `stepCar`.** Three edits.

(a) The `!air` ground-physics line (`:1350`): the water modifiers, gated on `wl` (computed *before* the branch — move the `wl` lookup up). Just before `const gh = groundH(P.x, P.z, P.y); const air = …` (`:1347`) add:

```js
  const wet = waterLevelAt(P.x, P.z, P.y) !== null;   // #101: on the bed the engine runs, but slowly
```

In the `!air` block change `const top = nitro ? D.topNitro : D.top;` to

```js
const top = (nitro && !wet ? D.topNitro : D.top) * (wet ? UW.topFactor : 1);
```

and `vf -= vf * 0.12 * dt + Math.sign(vf) * 0.6 * dt;` to

```js
vf -= vf * (wet ? UW.drag : 0.12) * dt + Math.sign(vf) * 0.6 * dt;
```

(b) The water branch (`:1355-1357`). Replace

```js
  const gh2 = groundH(P.x, P.z, P.y), wl = waterLevelAt(P.x, P.z, P.y);
  // toast(tr('fishes')): the Midtown Madness homage, in the game language (#9)
  if (wl !== null) { if (P.splash === 0) SFX.splash(); const was = P.splash; P.splash += dt; P.vx *= 0.9; P.vz *= 0.9; P.y = Math.max(P.y - 6 * dt, wl - 1.2); if (was < 0.35 && P.splash >= 0.35) toast(tr('fishes'), TOAST_S.event); if (P.splash > 2.8) resetCar(); }
```

with

```js
  const gh2 = groundH(P.x, P.z, P.y), wl = waterLevelAt(P.x, P.z, P.y);
  // toast(tr('fishes')): the Midtown Madness homage, in the game language (#9). #101: no reset -- the car sinks onto the bed
  // (gh2, see groundH) and drives on down there; while it sinks the water brakes it, on the bed the drag in the !air block does.
  if (wl !== null) { if (P.splash === 0) { SFX.splash(); P.hinted = false; } const was = P.splash; P.splash += dt; if (air) { const k = Math.exp(-UW.drag * dt); P.vx *= k; P.vz *= k; P.y = Math.max(P.y - UW.sink * dt, gh2); P.vy = 0; } if (was < 0.35 && P.splash >= 0.35) toast(tr('fishes'), TOAST_S.event); if (!P.hinted && P.splash >= UW.hintAt) { P.hinted = true; toast(tr('underwaterHint'), TOAST_S.event); } }
```

(c) On leaving the water the splash counter must reset so the next dive splashes again: in the `else` branch (`:1358`) prepend `P.splash = 0;` — i.e. `else { P.splash = 0; P.vy -= 22 * dt; …`. Also the flames line (`:1360`): `flames.visible = !!P.nitro && !wet && !CAM_VIEWS[camView].eye;`.

Add `hinted: false` to `P` (`:1236`) and `submerged: submerged(P.y, waterLevelAt(P.x, P.z, P.y))` to `__mm.car()` (`:1324`).

- [ ] **Step 5: `resetCar` and `takeOff`.** `resetCar` (`:1247`) already sets `P.splash = 0`; add `P.hinted = false;`. `takeOff` (`:1269`) sets `P.splash = 0` — fine as is.

- [ ] **Step 6: Run the tests.** Step 2's command, then `node --test prototype/tests/strings.test.mjs`.
Expected: all green. If `test_drives_out_at_the_bank` ends still in the water, the car is stuck on the shelving bed: check `bedDepth` at the bank (`__mm.bed`) — a slope of 0.3 is 17°, which the compact climbs; if the hand path's gravel strip (Task 2 Step 5) sits above the bed edge by more than 1 m, the OSM kerb rule (`:1359`, `lift > 1 ? 0 : lift`) does not apply on the hand path and the car bounces — lower the strip's `y` or widen `hw` so it overlaps the lowered bed smoothly.

- [ ] **Step 7: The land trace and the other water tests.** `… -m pytest prototype/tests/test_vehicles.py prototype/tests/test_toast.py prototype/tests/test_i18n.py -q -p no:cacheprovider -k "trace or fishes or splash or water"`
Expected: green, unchanged.

- [ ] **Step 8: Commit.** `git add -A prototype && git commit -m "feat(world): the car sinks onto the riverbed and drives on (#101)"`

---

### Task 4: The look under the surface

**Files:**
- Modify: `prototype/index.html` — `STYLES` (`:1189`, `:1191`), `applyStyle` (`:1194`), `stepCamera` (`:1382-1383`), bubbles next to `blob`/`flames`, the loop (`:1528`), hooks
- Test: `prototype/tests/test_underwater.py` (extend)

**Interfaces:**
- Produces: `const UWS = { on: false }`; `setUnderwater(on)`; `water` material `side: THREE.DoubleSide` in both styles; chase target pulled to `underwaterCamY`; `bubbles` group; `__mm.underwater()` → `{ on, fogDensity, waterDoubleSide, bubbles }` (extended in Task 5).
- Consumes: `UW`, `submerged`, `underwaterCamY`.

- [ ] **Step 1: Write the failing tests.** Append to `test_underwater.py`:

```python
def underwater(page):
    return page.evaluate("() => window.__mm.underwater()")


def test_look_follows_the_camera(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        dry = underwater(page)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.underwater().on", timeout=180000)
        wet = underwater(page)
        cam = page.evaluate("() => window.__mm.cam()")
        page.keyboard.press("KeyR")
        page.wait_for_function("() => !window.__mm.underwater().on", timeout=60000)
        back = underwater(page)
        b.close()
    assert dry["on"] is False and dry["fogDensity"] is None                 # original style: linear fog, no density
    assert wet["on"] is True and abs(wet["fogDensity"] - 0.035) < 1e-6 and wet["waterDoubleSide"] is True
    assert cam["d"][1] < 6, cam                                            # the chase cam came down with the car (under the 0 m surface)
    assert back["on"] is False and back["fogDensity"] is None


def test_t_underwater_keeps_the_murk(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.underwater().on", timeout=180000)
        page.keyboard.press("KeyT")
        page.wait_for_timeout(500)
        u = underwater(page)
        b.close()
    assert u["on"] is True and abs(u["fogDensity"] - 0.035) < 1e-6


def test_bubbles_rise_only_in_the_water(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        dry = underwater(page)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 1", timeout=180000)
        wet = underwater(page)
        b.close()
    assert dry["bubbles"]["visible"] is False
    assert wet["bubbles"]["visible"] is True and wet["bubbles"]["count"] == 24 and wet["bubbles"]["maxY"] <= 0.05
```

- [ ] **Step 2: Run them to see them fail.** `… -k "look or murk or bubbles"` → FAIL: `__mm.underwater is not a function`.

- [ ] **Step 3: Double-sided water.** In `STYLES.original.mat` (`:1189`) add `side: THREE.DoubleSide` to the `water` `MeshPhongMaterial` options; in `STYLES.smooth.mat` (`:1191`) add `side: role === 'water' ? THREE.DoubleSide : THREE.FrontSide` to the `MeshStandardMaterial` options.

- [ ] **Step 4: `setUnderwater`.** After `applyStyle` (`:1194`) add:

```js
// #101: under the surface -- murky blue-green fog, the sky sphere in the same colour, dimmer light; off restores the style
const UWS = { on: false };
function setUnderwater(on) { UWS.on = on; const St = STYLES[styleKey]; if (on) { scene.fog = new THREE.FogExp2(col(UW.fogColor), UW.fogDensity); skyMat.uniforms.top.value.set(UW.fogColor); skyMat.uniforms.hor.value.set(UW.skyHor); hemi.intensity = St.hemi * UW.hemiFactor; sun.intensity = St.sunI * UW.sunFactor; } else { scene.fog = St.fog(); skyMat.uniforms.top.value.set(St.sky[0]); skyMat.uniforms.hor.value.set(St.sky[1]); hemi.intensity = St.hemi; sun.intensity = St.sunI; } }
```

and at the end of `applyStyle`, before `renderStyleName(); resize();`, insert `setUnderwater(UWS.on);` (it must come after `scene.fog = St.fog(); hemi.intensity = …` so the underwater values win while underwater). Guard the forward reference: `applyStyle` is called at load (`applyStyle(styleKey)` further down) — `UWS` must be declared before that call; put the block directly after the `let styleKey` line (`:1193`) instead if the first `applyStyle` call precedes `:1194`.

- [ ] **Step 5: Camera.** In `stepCamera`'s chase branch (`:1382`) after `target.y = Math.max(target.y, groundH(target.x, target.z, target.y) + 1.2);` add:

```js
const wlc = waterLevelAt(P.x, P.z, P.y); if (submerged(P.y, wlc)) target.y = underwaterCamY(target.y, wlc);   // #101: follow the car under the surface
```

At the end of `stepCamera` (after the `sky.position.copy(camera.position); …` line, `:1383`) add:

```js
  const camWl = waterLevelAt(camera.position.x, camera.position.z, camera.position.y), under = camWl !== null && camera.position.y < camWl; if (under !== UWS.on) setUnderwater(under);
```

- [ ] **Step 6: Bubbles.** Next to the `blob` / `flames` definitions (search `const flames`) add:

```js
// #101: 24 bubbles rising from the car's rear while it is in the water; re-spawned at the car when they reach the surface
const bubbles = new THREE.Group(); bubbles.visible = false; scene.add(bubbles);
{ const tex = makeTex(32, 32, (g, w, h) => { const r = g.createRadialGradient(16, 16, 2, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.7, 'rgba(220,240,255,.5)'); r.addColorStop(1, 'rgba(220,240,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, { alpha: true }); const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false }); for (let i = 0; i < 24; i++) { const s = new THREE.Sprite(mat); const r = rr(0.15, 0.35); s.scale.set(r * 2, r * 2, 1); s.userData.age = rr(0, 3); bubbles.add(s); } }
function stepBubbles(dt) { const wl = waterLevelAt(P.x, P.z, P.y); bubbles.visible = wl !== null && P.splash > 0 && !FLY.on; if (!bubbles.visible) return; const fx = Math.cos(P.th), fz = Math.sin(P.th); for (const s of bubbles.children) { s.userData.age += dt; s.position.y += 1.2 * dt; if (s.userData.age > 3 || s.position.y > wl) { s.userData.age = 0; s.position.set(P.x - fx * 2 + rr(-0.4, 0.4), P.y + 0.4, P.z - fz * 2 + rr(-0.4, 0.4)); } } }
```

Call `stepBubbles(dt)` in the loop (`:1528`) next to `drawWheels();`.

- [ ] **Step 7: Hook.** Next to `__mm.bed`:

```js
window.__mm.underwater = () => ({ on: UWS.on, fogDensity: scene.fog && scene.fog.isFogExp2 ? scene.fog.density : null, waterDoubleSide: MESH.water ? MESH.water.material.side === THREE.DoubleSide : null, bubbles: { visible: bubbles.visible, count: bubbles.children.length, maxY: Math.max(...bubbles.children.map(s => s.position.y)) } });
```

(Task 5 extends this object with the content counts.)

- [ ] **Step 8: Run the tests.** `… -k "look or murk or bubbles"` → PASS. Note the smooth style's fog is `FogExp2` too, so `fogDensity` is non-null there on land; `test_look_follows_the_camera` runs in the default original style on purpose.

- [ ] **Step 9: Commit.** `git add -A prototype && git commit -m "feat(world): blue-green murk, a visible surface from below, bubbles (#101)"`

---

### Task 5: Boulders, waterweed, fish and the wrecks

**Files:**
- Modify: `prototype/index.html` — a new `buildUnderwater()` called after the world build (before the `for (const role in parts)` merge at `:1074`, since boulders and weed go through `parts`), `STYLES` (`weed` role in both `mat()`), the loop (`:1528`), the hook
- Test: `prototype/tests/test_underwater.py` (extend)

**Interfaces:**
- Produces: role `weed`; `FISH` (`{ mesh: InstancedMesh, schools: [] }`); `wreck` group; `stepFish(dt)`; `__mm.underwater()` gains `{ fish, schools, stones, weeds, wreck: [x, z] }`.
- Consumes: `bedSamples`, `makeSchool`, `schoolPose`, `UW`, `riverDist`, `waterLevelAt`, `groundH`, `onBridge`, `rnd`, `rr`, `push`, `TGRID`, `RIVER.pts`.

- [ ] **Step 1: Write the failing tests.** Append to `test_underwater.py`:

```python
def test_bed_has_boulders_weed_fish_and_wrecks_in_the_water(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        u = underwater(page)
        wreck = bed(page, *u["wreck"])
        b.close()
    assert u["stones"] > 200 and u["weeds"] > 400, u
    assert u["schools"] == 14 and 8 * 14 <= u["fish"] <= 14 * 14, u
    assert wreck["water"] is not None and wreck["depth"] > 2, wreck            # the wrecks lie in the deep, not on the bank


def test_fish_swim_only_while_you_are_down_there(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        a = page.evaluate("() => window.__mm.fishPose(0)")
        page.wait_for_timeout(400)
        a2 = page.evaluate("() => window.__mm.fishPose(0)")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.underwater().on", timeout=180000)
        w = page.evaluate("() => window.__mm.fishPose(0)")
        page.wait_for_timeout(400)
        w2 = page.evaluate("() => window.__mm.fishPose(0)")
        b.close()
    assert a == a2, "on land the fish are frozen (nobody can see them)"
    assert w != w2, "underwater they swim"
```

- [ ] **Step 2: Run them to see them fail.** `… -k "boulders or swim"` → FAIL: `u["stones"]` is undefined / `fishPose` missing.

- [ ] **Step 3: The `weed` role.** In `STYLES.original.mat` (`:1189`) add `weed: null` to the `map` lookup and, after the `tree` special case, `if (role === 'weed') { m.side = THREE.DoubleSide; }` (Lambert, `vertexColors: true` already). In `STYLES.smooth.mat` (`:1191`) add `weed: '#2f6b3a'` to `flat`, leave it out of the `vertexColors` exclusion list, and set `side: role === 'water' || role === 'weed' ? THREE.DoubleSide : THREE.FrontSide`. In the merge line (`:1074`) add `'weed'` to the `castShadow` exclusion list.

- [ ] **Step 4: `buildUnderwater()`.** Insert before `for (const role in parts)` (`:1074`):

```js
// ---------- #101: the underwater Rhine -- boulders, waterweed, fish schools, two wrecks ----------
const FISH = { mesh: null, schools: [], t: 0 }, wreck = new THREE.Group(); scene.add(wreck);
function buildUnderwater() {
  const G = TGRID, bounds = [G.x0, G.z0, G.x0 + G.GW, G.z0 + G.GD];
  const inWater = (x, z) => riverDist(x, z) < -UW.shoreClear && waterLevelAt(x, z, 1e4) !== null && !onBridge(x, z, 1e4);
  const samples = bedSamples(bounds, UW.sampleStep, inWater, rnd);
  const bedAt = (x, z) => groundH(x, z, 1e4);
  // boulders: every 6th sample, squashed dodecahedra half sunk into the bed, merged into the stone role
  samples.forEach(([x, z], i) => { if (i % 6) return; const r = rr(0.6, 1.8), g = new THREE.DodecahedronGeometry(r, 0); g.scale(1, 0.6, 1); g.rotateY(rr(0, Math.PI)); g.translate(x, bedAt(x, z) + r * 0.2, z); colorize(g, col('#7a7368')); push('stone', g); });
  // waterweed: every 2nd sample, 3-5 standing blades with a random yaw
  samples.forEach(([x, z], i) => { if (i % 2) return; const y = bedAt(x, z); for (let k = 0, n = Math.floor(rr(3, 6)); k < n; k++) { const h = rr(1.5, 3.5), g = new THREE.PlaneGeometry(0.25, h); g.translate(0, h / 2, 0); g.rotateY(rr(0, Math.PI)); g.translate(x + rr(-0.6, 0.6), y, z + rr(-0.6, 0.6)); colorize(g, col(rnd() < 0.5 ? '#2f6b3a' : '#3d7d3a')); push('weed', g); } });
  // fish: one instanced mesh for every school; a fish is a flattened sphere and a tail triangle
  const every = Math.max(1, Math.floor(samples.length / UW.schools));
  for (let s = 0; s < UW.schools && s * every < samples.length; s++) { const [x, z] = samples[s * every]; FISH.schools.push(makeSchool(x, z, bedAt(x, z), rnd, s)); }
  const total = FISH.schools.reduce((n, s) => n + s.n, 0);
  if (total) { const body = new THREE.SphereGeometry(0.35, 8, 6); body.scale(1.6, 0.6, 0.35); const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, -0.95, 0.25, 0, -0.95, -0.25, 0], 3)); tail.computeVertexNormals(); const geo = mergeGeometries([body.toNonIndexed(), tail], false); FISH.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), total); let i = 0; const c = new THREE.Color(); for (const s of FISH.schools) for (let k = 0; k < s.n; k++) FISH.mesh.setColorAt(i++, c.set(s.colour)); FISH.mesh.instanceColor.needsUpdate = true; scene.add(FISH.mesh); stepFish(0, true); }
  // the wrecks: the bend below Bad Säckingen (RIVER.pts 9-10 exists on both paths); the first bed sample if that is dry
  let [wx, wz] = [(RIVER.pts[9][0] + RIVER.pts[10][0]) / 2, (RIVER.pts[9][1] + RIVER.pts[10][1]) / 2]; if (!inWater(wx, wz) && samples.length) [wx, wz] = samples[0];
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), rust = new THREE.MeshLambertMaterial({ color: 0x6b3f2a });
  { const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 5, 10, 1, false, 0, Math.PI), wood); hull.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.4); hull.position.set(wx, bedAt(wx, wz) + 0.5, wz); wreck.add(hull); for (const dz of [-1.4, 1.2]) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.3), wood); t.position.set(wx + dz, bedAt(wx, wz) + 0.9, wz); t.rotation.z = 0.4; wreck.add(t); } }
  { const dir = Math.atan2(RIVER.pts[10][1] - RIVER.pts[9][1], RIVER.pts[10][0] - RIVER.pts[9][0]), cx = wx + Math.cos(dir) * 30, cz = wz + Math.sin(dir) * 30, y = bedAt(cx, cz); const carG = new THREE.Group(); const bodyM = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.8), rust); bodyM.position.y = 0.5; const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.6), rust); cab.position.set(-0.3, 1.4, 0); carG.add(bodyM, cab); carG.position.set(cx, y + 0.2, cz); carG.rotation.set(0, -dir, -0.44); wreck.add(carG); }
  UWS.counts = { stones: samples.filter((_, i) => i % 6 === 0).length, weeds: samples.filter((_, i) => i % 2 === 0).length, wreck: [wx, wz] };
}
// fish only move while the camera is under the surface (through the 0.96-opaque surface nobody sees them); force = build-time placement
function stepFish(dt, force = false) { if (!FISH.mesh || (!UWS.on && !force)) return; FISH.t += dt; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1); let i = 0; for (const s of FISH.schools) for (let k = 0; k < s.n; k++) { const f = schoolPose(s, k, FISH.t); p.set(f.x, f.y, f.z); q.setFromAxisAngle(up, -f.th); m.compose(p, q, one); FISH.mesh.setMatrixAt(i++, m); } FISH.mesh.instanceMatrix.needsUpdate = true; }
buildUnderwater();
```

Mind the order: `UWS` (Task 4) must be declared before `buildUnderwater()` runs — if the style block sits after the world build, move the `const UWS = { on: false };` line up to just after `const parts = {};` (`:580`) and leave `setUnderwater` where it is. `colorize` and `mergeGeometries` are already in scope (`:584`, `:1074`). The `wreck` group's meshes use their own materials and are not touched by `applyStyle` — intended (rust is rust in both styles).

- [ ] **Step 5: Loop and hooks.** In the loop (`:1528`) add `stepFish(dt);` next to `stepBubbles(dt);`. Extend `__mm.underwater()` with `fish: FISH.mesh ? FISH.mesh.count : 0, schools: FISH.schools.length, ...UWS.counts` and add:

```js
window.__mm.fishPose = (i) => { const m = new THREE.Matrix4(); FISH.mesh.getMatrixAt(i, m); return Array.from(m.elements).map(v => +v.toFixed(4)); };
```

- [ ] **Step 6: Run the tests.** `… -k "boulders or swim"` → PASS. Then the whole file: `… -m pytest prototype/tests/test_underwater.py -q -p no:cacheprovider` → all green. If `stones` is under 200 on the hand path, the hand river (~6 km × 213 m ≈ 1.3 km² ⇒ ~9 000 samples at 12 m ⇒ ~1 500 boulders, ~4 500 tufts) is being cut by `shoreClear` — check `riverDist`'s sign on the hand path (`:394`, negative inside). The OSM Rhine is narrower (100–150 m), so expect roughly half of that there.

- [ ] **Step 7: Commit.** `git add -A prototype && git commit -m "feat(world): boulders, waterweed, fish schools and two wrecks on the Rhine bed (#101)"`

---

### Task 6: Changelog, playtest notes, screenshot gate, full verification

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `Added`), `test-todo.md` (new section at the top, after the heading), `docs/ai-notes/screenshots/2026-10-09-underwater.png` (new, < 400 KB)

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` / `### Added` add at the top:

```markdown
- The Rhine has a bottom now. Drive into it and the car no longer pops back onto the road after a splash: it sinks onto a shelving riverbed and creeps along it at walking pace, through blue-green murk with the surface shimmering overhead, between boulders and waterweed and past schools of fish. Somewhere in the deep below Bad Säckingen lie a sunken rowing boat and a rusty old car. Drive up the bank to get out, or press **R** for the road. „Sleep with the fishes!" still greets you on the way down.
```

- [ ] **Step 2: Playtest notes.** At the top of `test-todo.md` (after the first heading) add:

```markdown
## Underwater Rhine (#101)

Screenshot: `docs/ai-notes/screenshots/2026-10-09-underwater.png` — murky blue-green, the surface visible overhead, sand-coloured bed with boulders and weed, a school of fish: does it read as „under the Rhine", or is it too dark / too bright / too blue?

- [ ] Drive off the gravel at Sisseln into the Rhine: splash, „Sleep with the fishes!", the car sinks and lands on the bed; the picture turns blue-green while the camera goes under.
- [ ] After 3 s the hint „Drive up to the bank, or press R for the road." shows once.
- [ ] On the bed the car drives at walking pace, steers, and climbs out where the bed meets the bank — no kerb, no jump.
- [ ] Bubbles rise from the back of the car in the water; none on land.
- [ ] Fish circle in schools (silver, green, orange), weed stands on the bed, boulders lie about; nothing pokes through the surface.
- [ ] The rowing boat and the rusty car lie at the bend below Bad Säckingen (J → Bad Säckingen, then drive in from the Rheinbrückstrasse bank and follow the river).
- [ ] **T** underwater keeps the murk; **F** takes off from the bed, the surface passes, the sky comes back.
- [ ] The Sissle: splashing through it is slow, but you come out the other side (no reset).
- [ ] Holzbrücke and Fridolinsbrücke: unchanged, the car does not fall through.
```

- [ ] **Step 3: Screenshot.** Commit and push the branch first (`git push -u origin <branch>`), then take the screenshot in the foreground with a short Python/Playwright script (hand layout, 1280×720, `page.evaluate("__mm.place(863.6, -647.7)")`, wait for `__mm.underwater().on` and `car().splash > 4`, `page.screenshot(path=…)`), under the memory cap. Save as `docs/ai-notes/screenshots/2026-10-09-underwater.png`; check it is < 400 KB (`ls -l`); link it from the PR body.

- [ ] **Step 4: Full node tests.** `node --test prototype/tests/*.test.mjs` → green.

- [ ] **Step 5: Browser regression, targeted.** In the foreground, capped, one file at a time:
  - `prototype/tests/test_underwater.py` — all green
  - `prototype/tests/test_vehicles.py` — the golden trace unchanged
  - `prototype/tests/test_smoke.py -k "splash or fishes or water"` — unchanged
  - `prototype/tests/test_fridolinsbruecke.py`, `prototype/tests/test_toast.py`, `prototype/tests/test_i18n.py -k fishes`, `prototype/tests/test_heli.py -k "takes_off"` — unchanged
  Expected: all green. A failure in `test_vehicles.py` means a water modifier leaked onto land — re-check the `wet` gates in Task 3 Step 4.

- [ ] **Step 6: Commit and push.** `git add CHANGELOG.md test-todo.md docs/ai-notes/screenshots/2026-10-09-underwater.png && git commit -m "docs(changelog): the underwater Rhine (#101)" && git push`

- [ ] **Step 7: PR.** Title `feat(world): underwater world in the Rhine (#101)`; body per the repo template (Summary · Changes · Testing · Checklist), the screenshot inline, `Closes #101`.
