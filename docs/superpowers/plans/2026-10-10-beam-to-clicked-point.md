# Teleport to a clicked point in the landscape (#165) — implementation plan

**Goal:** double-click / double-tap on the 3D view beams the car to the clicked ground point (or the nearest road if that spot is blocked), flagged like a jump during a race.

**Spec:** `docs/superpowers/specs/2026-10-10-beam-to-clicked-point-design.md` (decisions A0-A2 are open for the maintainer; implement the defaults).

## Global constraints

- **No `//` comment in the middle of a one-line statement in `prototype/index.html`.** New code goes on whole new lines; trailing `// ...` only after the last statement of a line. Locate anchors **by quoted content**, not line numbers.
- Pure logic lives in `prototype/beam.js` (no DOM, no three.js), tested with `node --test prototype/tests/*.test.mjs`.
- Frame-bound browser tests use the test hooks below and at most two frames of waiting; no loosened assertions, no longer timeouts.
- Playwright in the **foreground**, capped, output to a file (call timeout 600000 ms):
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest <files> -q > /tmp/out.txt 2>&1` (use `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` if your checkout has no `.venv`). Only the files named per task.
- Strings: `en` and `de` equal keys, Swiss spelling, real umlauts.
- Branch `feature/165-beam`; commit `feat(ui): beam the car to a double-clicked point in the landscape (#165)`; PR body `Closes #165`; one `CHANGELOG.md` line under `[Unreleased]` in the player's voice („Doppelklick in die Landschaft beamt das Auto dorthin; im Rennen zählt das wie ein Sprung nicht.“).

### Task 1: `beam.js` with node tests (TDD)

**Files:** create `prototype/beam.js`, `prototype/tests/beam.test.mjs`.

- [ ] **Step 1: Failing test.** Create `prototype/tests/beam.test.mjs`:

```js
// #165: where a beam to a clicked terrain point lands. Pure module, node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamSpot, BEAM_SNAP } from '../beam.js';

const free = () => false;
const walled = () => true;
const road = (d) => () => ({ d, x: 5, z: 6, th: 1.5 });

test('beamSpot_freeSpot_landsOnTheClickedTerrainPoint', () => {
  assert.deepEqual(beamSpot(10, 20, { blocked: free, nearestRoad: road(1) }), { x: 10, z: 20, kind: 'terrain' });
});

test('beamSpot_blockedWithRoadInReach_landsOnTheRoadWithItsHeading', () => {
  assert.deepEqual(beamSpot(10, 20, { blocked: walled, nearestRoad: road(BEAM_SNAP) }), { x: 5, z: 6, th: 1.5, kind: 'road' });
});

test('beamSpot_blockedAndRoadTooFar_isNull', () => {
  assert.equal(beamSpot(10, 20, { blocked: walled, nearestRoad: road(BEAM_SNAP + 0.1) }), null);
});

test('beamSpot_blockedAndNoRoadAtAll_isNull', () => {
  assert.equal(beamSpot(10, 20, { blocked: walled, nearestRoad: () => null }), null);
});
```
Run `node --test prototype/tests/*.test.mjs`: the new file fails (module missing).

- [ ] **Step 2: Implement.** Create `prototype/beam.js`:

```js
// #165: where a beam to a clicked terrain point lands. No DOM, no three.js: unit-tested with `node --test prototype/tests/*.test.mjs`.

// metres: how far the nearest road may be when the clicked point itself is blocked (water, a building)
export const BEAM_SNAP = 30;

// blocked(x, z) -> bool; nearestRoad(x, z) -> { d, x, z, th } | null
// -> { x, z, kind: 'terrain' } | { x, z, th, kind: 'road' } | null (nowhere to land)
export function beamSpot(x, z, { blocked, nearestRoad }) {
  if (!blocked(x, z)) return { x, z, kind: 'terrain' };
  const road = nearestRoad(x, z);
  if (!road || road.d > BEAM_SNAP) return null;
  return { x: road.x, z: road.z, th: road.th, kind: 'road' };
}
```
Run the node tests: all pass.

- [ ] **Step 3: Strings** in `prototype/strings.js`. `en`: after `  keyJump: 'jump to a landmark',` add `  keyBeam: 'double-click or double-tap the landscape: beam the car there (in a race it does not count)',`, `  beamed: 'Beamed!',`, `  beamNone: 'No place to beam to there',`. `de`: after `  keyJump: 'zu einem Wahrzeichen springen',` add `  keyBeam: 'Doppelklick oder Doppeltipp in die Landschaft: Auto dorthin beamen (im Rennen zählt das nicht)',`, `  beamed: 'Gebeamt!',`, `  beamNone: 'Dort kann man nicht landen',`. Run the node tests again (`strings.test.mjs` checks equal keys).

### Task 2: Failing browser tests

**Files:** create `prototype/tests/test_beam.py`.

- [ ] **Step 1: Create the file** (hand layout: world and terrain blocked, like `test_minimap.py`):

```python
"""#165: double-click / double-tap on the 3D view beams the car to the clicked ground point, flagged like a jump in a race.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
READY = "() => window.__mm && window.__mm.sim && window.__mm.beamPick && document.querySelector('#worldstatus')?.textContent"


def open_hand(p, server, touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, has_touch=touch)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def wait_frames(page, n=2):
    """The camera matrices the pick uses are refreshed by the render loop; a headless renderer can draw under 1 fps."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def car(page):
    return page.evaluate("() => window.__mm.car()")


def test_double_click_beams_to_the_clicked_ground_point_and_flags_the_run(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.click("#startbtn")
        wait_frames(page)
        start = car(page)
        heading = page.evaluate("() => window.__mm.heading()")
        pick = page.evaluate("() => window.__mm.beamPick(1000, 200)")        # upper right: ground well away from the car
        page.mouse.click(1000, 200)
        single = car(page)
        page.mouse.dblclick(1000, 200)
        page.wait_for_function("() => window.__mm.beam() !== null", timeout=T)
        landed = page.evaluate("() => window.__mm.beam()")
        after = car(page)
        heading_after = page.evaluate("() => window.__mm.heading()")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        toast = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert pick is not None
    assert math.hypot(single["x"] - start["x"], single["z"] - start["z"]) < 1               # a single click does nothing
    assert landed["kind"] == "terrain" and math.hypot(landed["x"] - pick["x"], landed["z"] - pick["z"]) < 0.5, (landed, pick)
    assert math.hypot(after["x"] - landed["x"], after["z"] - landed["z"]) < 0.5
    assert abs(heading_after - heading) < 1e-6                                              # heading kept
    assert flags["jumped"] is True                                                          # armed: a placement counts as a jump
    assert toast["text"] == "Beamed!"
    assert errors == []


def test_double_tap_beams_on_a_touch_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, touch=True)
        page.click("#startbtn")
        wait_frames(page)
        pick = page.evaluate("() => window.__mm.beamPick(1000, 200)")
        page.touchscreen.tap(1000, 200)
        page.touchscreen.tap(1000, 200)
        page.wait_for_function("() => window.__mm.beam() !== null", timeout=T)
        landed = page.evaluate("() => window.__mm.beam()")
        b.close()
    assert pick is not None and math.hypot(landed["x"] - pick["x"], landed["z"] - pick["z"]) < 0.5, (landed, pick)
    assert errors == []


def test_double_click_is_ignored_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page)
        before = car(page)
        page.mouse.dblclick(640, 100)
        wait_frames(page)
        after = car(page)
        landed = page.evaluate("() => window.__mm.beam()")
        b.close()
    assert landed is None and (after["x"], after["z"]) == (before["x"], before["z"])
    assert errors == []
```

If `window.__mm.heading` or `window.__mm.toast` do not exist on `main`, check with `grep -n "window.__mm.heading\|window.__mm.toast" prototype/index.html` (both are used by `test_debug.py` and `test_toast.py`, so they do).
The start-screen test clicks at (640, 100): on the start screen the overlay covers the canvas, so the dblclick hits the overlay; the assertion is that nothing moved and `beam()` is still `null`.

- [ ] **Step 2: Run** `test_beam.py -k double_click_is_ignored` first. Expected: FAIL, the `READY` wait times out (no `__mm.beamPick` yet; it takes the full 240 s, so run just this one test, not all three).

### Task 3: The implementation in `prototype/index.html`

- [ ] **Step 1: Import.** After the line starting `import { PAINTS, STAT_KEYS,` (the `./carselect.js` import) add a new line `import { beamSpot } from './beam.js';`.

- [ ] **Step 2: Code block.** Insert these lines **directly above** the comment line `// #18: the route still ahead, cyan with a dark outline, and a dot at the destination`:

```js
// #165: double-click (mouse) or double-tap (touch) on the 3D view beams the car to the ground point under the pointer; a blocked spot (water, a building) snaps to the nearest road within 30 m. Through placeOnRoad, so a race is flagged as a jump
const BEAM = { ray: new THREE.Raycaster(), ndc: new THREE.Vector2(), t: 0, tapT: 0, tapX: 0, tapY: 0, last: null };
const BEAM_ROLES = ['grass', 'field', 'road', 'roadOsm', 'roadPlain'];
const beamAllowed = () => $('overlay').hidden && $('jump').hidden && $('help').hidden && !PAUSE.on && !CARSEL.on && !FLY.on;
function beamPick(cx, cy) { BEAM.ndc.set(cx / innerWidth * 2 - 1, 1 - cy / innerHeight * 2); BEAM.ray.setFromCamera(BEAM.ndc, camera); BEAM.ray.far = 4000; const hit = BEAM.ray.intersectObjects(BEAM_ROLES.map(r => MESH[r]).filter(Boolean), false)[0]; return hit ? { x: hit.point.x, z: hit.point.z } : null; }
function spotBlocked(x, z) { const keep = [P.x, P.z, P.vx, P.vz, P.dmg, P.y]; P.x = x; P.z = z; P.y = groundH(x, z, -Infinity); P.vx = P.vz = 0; collide(carRadius()); const pushed = Math.hypot(P.x - x, P.z - z) > 0.05; [P.x, P.z, P.vx, P.vz, P.dmg, P.y] = keep; return pushed || waterLevelAt(x, z, 1e4) !== null; }
function beamTo(cx, cy) { if (!beamAllowed() || performance.now() - BEAM.t < 500) return; BEAM.t = performance.now(); const hit = beamPick(cx, cy), spot = hit && beamSpot(hit.x, hit.z, { blocked: spotBlocked, nearestRoad: nearestJumpable }); BEAM.last = spot; if (!spot) { toast(tr('beamNone')); return; } placeOnRoad(spot.x, spot.z, spot.th ?? P.th, tr('beamed')); }
$('gl').addEventListener('dblclick', e => beamTo(e.clientX, e.clientY));
$('gl').addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const t = performance.now(); if (t - BEAM.tapT < 300 && Math.hypot(e.clientX - BEAM.tapX, e.clientY - BEAM.tapY) < 30) { BEAM.tapT = 0; beamTo(e.clientX, e.clientY); return; } BEAM.tapT = t; BEAM.tapX = e.clientX; BEAM.tapY = e.clientY; });
window.__mm.beamPick = beamPick; window.__mm.beam = () => BEAM.last && { ...BEAM.last };   // test hooks (#165): the pick under a pointer position, the last landing (null before the first beam)
```

If a name is already declared (`BEAM`, `beamPick`, `spotBlocked`), pick another name for yours; `grep -n "const BEAM\b\|function spotBlocked" prototype/index.html` first. `nearestJumpable`, `placeOnRoad`, `collide`, `carRadius`, `groundH`, `waterLevelAt`, `PAUSE`, `CARSEL`, `FLY` are declared elsewhere in the same module script; `PAUSE` and `CARSEL` are `const`s declared further down, which is fine because they are only read when an event fires.

- [ ] **Step 3: Help row.** In the help panel, after the line `<kbd>J</kbd><span data-i18n="keyJump">jump to a landmark</span>` add `<kbd>2×</kbd><span data-i18n="keyBeam">double-click or double-tap the landscape: beam the car there (in a race it does not count)</span>` (same indentation).

- [ ] **Step 4: Run** `test_beam.py`. Expected: 3 passed. Failure hints: `pick is None` -> the ray misses the meshes (check `BEAM_ROLES` against `Object.keys(MESH)` in the console of a probe, adjust the list); `landed["kind"] == "road"` -> the spot at (1000, 200) was blocked, change the click to another upper-right point such as (900, 250), do not change the assertions.

### Task 4: Neighbouring suites, commit

- [ ] **Step 1:** `node --test prototype/tests/*.test.mjs`; Playwright `test_minimap.py`, `test_jump.py` (one call each). Expected: as on `main`.
- [ ] **Step 2:** CHANGELOG line, commit, push, open the PR.
