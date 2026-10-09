# Car shadow: soft contact decal on the ground (#163) Implementation Plan

**Goal:** replace the flat 5.2 m disc with a soft, car-sized shadow quad that lies on the ground (pitch and roll from sampled ground heights), is shifted a little away from the sun, is hidden with V, in the eye cameras, over water, above 6 m and in the helicopter, and costs one draw call. Spec: `docs/superpowers/specs/2026-10-09-car-shadow-design.md`.

**Architecture:** pure `prototype/shadow.js` (sizes, alpha profile, tilt, sun shift, opacity, visibility rule) with node tests; in `prototype/index.html` one `shadowMesh` replaces `blob`, `stepCar()` writes `SHADOW_STATE`, a new `drawShadow()` in `loop()` writes the mesh (the #132 split: physics writes state, the loop draws). Texture baked per vehicle build from `CAR_SIZE`, old map disposed. Per-style base opacity in `STYLES`.

**Global constraints for the implementer:**

- `prototype/index.html` is written in long one-line statements. **Never put a `//` comment in the middle of a statement or at the end of a line that other code continues on** — a `//` swallows everything after it on that line. Put a comment on its own line above, or use `/* ... */` if it must sit inline. Match the file's existing style (one statement group per line, `const`/`let`, no `var`).
- Do not touch `blob`'s old visual constants anywhere else; delete every `blob` reference (`:1195`, `:1201`, `:1316`, `:1402`, and `blob.position.set(...)` in the start block `:1620`). `grep -n blob prototype/index.html` must only hit the tree texture (`:319`) and `savePhoto` afterwards.
- Tests: node first (`node --test prototype/tests/*.test.mjs`), then only the affected browser files, in the foreground, under a memory cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest prototype/tests/test_shadow.py prototype/tests/test_vehicles.py -x -k "shadow or gpu_memory or true_to_size"`. Never the ~2 h full suite, never `run_in_background`. Every browser read comes after `wait_frames(page, 2)`; a headless frame can take seconds, so no fixed sleeps and no checks that need many frames.
- Commit and push the branch before the browser verification, not after.
- CHANGELOG entries are English and player-facing (what changed in the game, not in the code).
- Line numbers below are from `main` at `1ae8482`; re-grep before editing.

### Task 1: Pure module `shadow.js` with unit tests

**Files:** create `prototype/shadow.js`, `prototype/tests/shadow.test.mjs`.

- [ ] Write the failing test `prototype/tests/shadow.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW, shadowSize, shadowAlpha, groundTilt, sunShift, shadowOpacity, shadowShown } from '../shadow.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const COMPACT = { l: 4.66, w: 2.18, h: 1.55 };   // test_vehicles.py::test_compact_car_is_true_to_size
const SUN = { x: -300, y: 400, z: -200 };          // index.html sun.position

test('SHADOW: the agreed constants', () => {
  assert.deepEqual(SHADOW, { margin: 0.5, core: 0.92, lift: 0.04, hideAbove: 6, minFade: 0.2, bodyMid: 0.4, roll: 1.0 });
});

test('shadowSize: core from the measured box, quad adds the soft margin on every side', () => {
  const s = shadowSize(COMPACT);
  close(s.cl, 4.66 * 0.92, 1e-9); close(s.cw, 2.18 * 0.92, 1e-9);
  close(s.l, s.cl + 1.0, 1e-9); close(s.w, s.cw + 1.0, 1e-9);
  assert.ok(s.cl < COMPACT.l && s.l < 5.4, 'shorter core than the car, quad shorter than the old 5.2 m disc plus its edge');
});

test('shadowAlpha: 1 in the core, 0 at the edge, monotone and symmetric in between', () => {
  const fu = 0.5 / (5.29 / 2), fv = 0.5 / (3.0 / 2);
  assert.equal(shadowAlpha(0, 0, fu, fv), 1);
  assert.equal(shadowAlpha(1 - fu, 0, fu, fv), 1);
  assert.equal(shadowAlpha(0, 1 - fv, fu, fv), 1);
  assert.equal(shadowAlpha(1, 0, fu, fv), 0);
  assert.equal(shadowAlpha(0, 1, fu, fv), 0);
  assert.equal(shadowAlpha(1, 1, fu, fv), 0);
  let prev = 1;
  for (let u = 1 - fu; u <= 1 + 1e-9; u += fu / 10) { const a = shadowAlpha(u, 0, fu, fv); assert.ok(a <= prev + 1e-12, `monotone at u=${u}`); prev = a; }
  close(shadowAlpha(0.95, 0.2, fu, fv), shadowAlpha(-0.95, -0.2, fu, fv), 1e-12, 'symmetric');
  const mid = shadowAlpha(1 - fu / 2, 0, fu, fv); assert.ok(mid > 0.3 && mid < 0.7, `soft in the middle of the edge: ${mid}`);
});

test('groundTilt: flat is zero; nose up and right side up are positive', () => {
  assert.deepEqual(groundTilt(5, 5, 5, 5, 2, 1), { pitch: 0, roll: 0 });
  const t = groundTilt(5.4, 5.0, 5.0, 5.2, 2, 1);
  close(t.pitch, Math.atan(0.4 / 4), 1e-12, 'pitch'); close(t.roll, Math.atan(0.2 / 2), 1e-12, 'roll');
  assert.ok(groundTilt(5.0, 5.4, 5, 5, 2, 1).pitch < 0 && groundTilt(5, 5, 5.2, 5.0, 2, 1).roll < 0);
});

test('sunShift: straight up is no shift; the scene sun shifts a hand\'s width to +x +z; below the horizon nothing', () => {
  assert.deepEqual(sunShift({ x: 0, y: 1, z: 0 }, 0.62), { x: 0, z: 0 });
  const s = sunShift(SUN, 0.4 * COMPACT.h);
  close(s.x, 0.465, 0.001, 'x'); close(s.z, 0.31, 0.001, 'z');
  assert.deepEqual(sunShift({ x: 1, y: 0, z: 0 }, 1), { x: 0, z: 0 });
  assert.deepEqual(sunShift({ x: 1, y: -1, z: 0 }, 1), { x: 0, z: 0 });
});

test('shadowOpacity: full on the ground, fades with the air height, never below the floor', () => {
  assert.equal(shadowOpacity(0.55, 0), 0.55);
  close(shadowOpacity(0.55, 3), 0.275, 1e-12);
  close(shadowOpacity(0.55, 5.9), 0.55 * 0.2, 1e-12);
  assert.equal(shadowOpacity(0.3, 0), 0.3);
});

test('shadowShown: each reason alone hides it', () => {
  const ok = { fly: false, wet: false, air: 0, eye: false, hidden: false };
  assert.equal(shadowShown(ok), true);
  assert.equal(shadowShown({ ...ok, fly: true }), false);
  assert.equal(shadowShown({ ...ok, wet: true }), false);
  assert.equal(shadowShown({ ...ok, air: 6 }), false);
  assert.equal(shadowShown({ ...ok, air: 5.9 }), true);
  assert.equal(shadowShown({ ...ok, eye: true }), false);
  assert.equal(shadowShown({ ...ok, hidden: true }), false);
});
```

- [ ] Run `node --test prototype/tests/shadow.test.mjs`; expect failure (module missing).
- [ ] Implement `prototype/shadow.js` (ES module, header comment in the style of `heli.js`: pure, no three.js, no DOM, the car frame):

```js
// #163: the car's ground shadow -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Frame as the car: x east, z south, th = heading (0 = +x); car model +x forward, +z right. Metres and radians.
export const SHADOW = { margin: 0.5, core: 0.92, lift: 0.04, hideAbove: 6, minFade: 0.2, bodyMid: 0.4, roll: 1.0 };
// margin: soft edge outside the dark core; core: the box fraction that is tyres and body, not mirror tips; lift: above the ground, against
// z-fighting; hideAbove: air height where the shadow is gone; minFade: opacity floor while fading; bodyMid: the body-centre height as a
// fraction of the car height (what the sun displaces); roll: lateral ground-sample distance for the roll tilt

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

// box: { l, w, h } from measureCar. l/w = quad size, cl/cw = dark core size
export function shadowSize(box) {
  const cl = box.l * SHADOW.core, cw = box.w * SHADOW.core;
  return { l: cl + 2 * SHADOW.margin, w: cw + 2 * SHADOW.margin, cl, cw };
}

// u, v in [-1, 1] across the quad; fu, fv = margin as a fraction of the half size per axis. 1 in the core, a smoothstep to 0 at the edge,
// a rounded rectangle: the distance outside the core box, normalised per axis, combined by length
export function shadowAlpha(u, v, fu, fv) {
  const du = Math.max(0, Math.abs(u) - (1 - fu)) / fu, dv = Math.max(0, Math.abs(v) - (1 - fv)) / fv;
  return smooth(1 - Math.hypot(du, dv));
}

// fore/aft: ground dx ahead of / behind the centre; left/right: ground dz to each side. pitch > 0 = nose up, roll > 0 = right side up
export function groundTilt(fore, aft, left, right, dx, dz) {
  return { pitch: Math.atan((fore - aft) / (2 * dx)), roll: Math.atan((right - left) / (2 * dz)) };
}

// sun: vector from the scene toward the sun (sun.position as-is). Where a point `height` above the ground lands along the light
export function sunShift(sun, height) {
  if (!(sun.y > 0)) return { x: 0, z: 0 };
  const k = height / sun.y;
  return { x: -sun.x * k || 0, z: -sun.z * k || 0 };
}

export function shadowOpacity(base, air) { return base * clamp(1 - air / SHADOW.hideAbove, SHADOW.minFade, 1); }

export function shadowShown({ fly, wet, air, eye, hidden }) { return !fly && !wet && air < SHADOW.hideAbove && !eye && !hidden; }
```

  Check the `sunShift` expectation: `-(-300) / 400 * 0.62 = 0.465`, `-(-200) / 400 * 0.62 = 0.31`. The `|| 0` turns `-0` (sun straight up) into `0`: `assert.deepEqual` from `node:assert/strict` compares with `Object.is`, which tells `-0` from `0`.

- [ ] Run `node --test prototype/tests/*.test.mjs`; expect all pass. Commit `feat(vehicles): pure car-shadow rules (#163)`.

### Task 2: Shadow quad, texture and per-style opacity in `index.html`

**Files:** modify `prototype/index.html` (imports `:261`, `blob` `:1195`, `buildCar` `:1201`, `STYLES` `:1222`/`:1224`).

- [ ] Import next to the `heli.js` import (`:261`): `import { SHADOW, shadowSize, shadowAlpha, groundTilt, sunShift, shadowOpacity, shadowShown } from './shadow.js';`
- [ ] Replace the `blob` line (`:1195`) with the mesh (one statement group per line, comments on their own lines above):

```js
// #163: the car's ground shadow, a soft decal sized from the measured car; the texture is baked per build (bakeShadow), the pose is drawn by drawShadow
const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
const shadowMesh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); shadowMesh.rotation.order = 'YZX'; shadowMesh.renderOrder = 1; shadowMesh.visible = false; scene.add(shadowMesh);
function bakeShadow(box) { const size = shadowSize(box), fu = SHADOW.margin / (size.l / 2), fv = SHADOW.margin / (size.w / 2); shadowMesh.material.map?.dispose(); shadowMesh.material.map = makeTex(128, 64, (g, w, h) => { const img = g.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = shadowAlpha((i + 0.5) / w * 2 - 1, (j + 0.5) / h * 2 - 1, fu, fv); img.data[(j * w + i) * 4 + 3] = Math.round(a * 255); } g.putImageData(img, 0, 0); }, { alpha: true }); shadowMesh.material.needsUpdate = true; shadowMesh.scale.set(size.l, 1, size.w); }
```

  Check `makeTex` (`:298`) returns a `CanvasTexture`; read its `opts.alpha` branch so the wrap/filter settings it applies suit an alpha decal (clamp to edge, linear filter). If `makeTex` sets `colorSpace` to sRGB, that is fine for an alpha-only map. `createImageData` gives RGB 0 (black) by default; only alpha is written.

- [ ] In `buildCar()` (`:1201`) replace `blob.scale.set(VEH.scale, 0.55 * VEH.scale, 1);` and move `CAR_SIZE = measureCar();` before the bake: `... CAR_SIZE = measureCar(); bakeShadow(CAR_SIZE); }`.
- [ ] `STYLES` (`:1222`, `:1224`): add `carShadow: 0.55` to `original` and `carShadow: 0.3` to `smooth`, next to `shadows:`.
- [ ] Load the page once in the browser (`python3 -m http.server` from the repo root, `prototype/index.html`): the console must be clean. Commit `feat(vehicles): soft car-shadow decal sized from the car (#163)`.

### Task 3: State in `stepCar`, draw in the loop, hooks

**Files:** modify `prototype/index.html` (`stepCar` `:1401-1402`, `loop` `:1619`, `__mm.hud` `:1316`, new `__mm.shadow` near `:1372`).

- [ ] Add, next to `WHEEL_STATE` (`:1208`): `const SHADOW_STATE = { y: 0, pitch: 0, roll: 0, wet: false, air: 0 };` with a comment line above: `// #163: written by stepCar only; drawShadow (from the loop) only reads it`.
- [ ] In `stepCar()` replace the `blob` line (`:1402`) with state writes. The slope line (`:1401`) already has `slope` from the forward samples at ±2 m; add the lateral pair at `SHADOW.roll` m (right = `(rx, rz)` from `:1386`, which is `(-fz, fx)`):

```js
  const left = groundH(P.x - rx * SHADOW.roll, P.z - rz * SHADOW.roll, P.y), right = groundH(P.x + rx * SHADOW.roll, P.z + rz * SHADOW.roll, P.y), tilt = groundTilt(gh2 + slope * 2, gh2 - slope * 2, left, right, 2, SHADOW.roll);
  SHADOW_STATE.y = gh2; SHADOW_STATE.pitch = air ? 0 : tilt.pitch; SHADOW_STATE.roll = air ? 0 : tilt.roll; SHADOW_STATE.wet = wl !== null; SHADOW_STATE.air = P.y - gh2;
```

  (`groundTilt` with `fore = gh2 + 2 * slope`, `aft = gh2 - 2 * slope` returns `atan(slope)` exactly, so the forward samples are reused, not taken again. `air` is the existing airborne flag used on `:1401`; in the air the quad lies flat.)

- [ ] Add `drawShadow()` next to `drawWheels()` (`:1210`), reading only state:

```js
function drawShadow() { const St = STYLES[styleKey]; shadowMesh.visible = shadowShown({ fly: FLY.on, wet: SHADOW_STATE.wet, air: SHADOW_STATE.air, eye: !!CAM_VIEWS[camView].eye, hidden: HUD.carHidden }); if (!shadowMesh.visible) return; const shift = sunShift(sun.position, SHADOW.bodyMid * CAR_SIZE.h); shadowMesh.position.set(P.x + shift.x, SHADOW_STATE.y + SHADOW.lift, P.z + shift.z); shadowMesh.rotation.set(SHADOW_STATE.roll, -P.th, SHADOW_STATE.pitch); shadowMesh.material.opacity = shadowOpacity(St.carShadow, SHADOW_STATE.air); }
```

  `drawShadow` references `STYLES`, `styleKey`, `CAM_VIEWS`, `camView`, `HUD`, `FLY`, which are all declared later in the file than `:1210` — that is fine for a function body called from `loop()`, but place the function after `CAM_VIEWS` (`:1409`) if a lint/`const` TDZ concern comes up; it must simply be defined before `loop()` runs.

  Sign check for the tilt: the car's own tilt at `:1401` is `car.rotation.z = atan(slope) * 0.8` with the same `slope` (positive = rising ahead), and `car.rotation.y = -P.th`; so `rotation.z = pitch` with `pitch = atan(slope)` is the same sense. For the roll, right side up must raise the quad's +z (model right) edge: with order `YZX` the X rotation is applied in the car's frame, and a positive rotation about +x lifts +z... verify in the browser test (`test_shadow_lies_on_the_ramp` checks pitch; add a one-line console probe on a banked spot if the roll sign looks wrong, then fix the sign in `drawShadow`, not in `shadow.js`).

- [ ] `stepCar()` does not run on the start screen (`loop()` `:1619`: `if (R.state !== 'ready')`), nor right after a teleport, so the state must be seeded wherever `P.y` is set outside the physics. Add next to `SHADOW_STATE`: `function restShadow() { SHADOW_STATE.y = P.y; SHADOW_STATE.pitch = 0; SHADOW_STATE.roll = 0; SHADOW_STATE.wet = false; SHADOW_STATE.air = 0; }` and call `restShadow();` in the start block (`:1620`, in place of its `blob.position.set(START.x, sy + 0.05, START.z);`, after `P.y = sy`), in `resetCar()` (`:1282`, after `P.y = groundH(...)`) and in `window.__mm.place` (`:1308`, after `P.y = ...`). The old disc had this gap too (it sat at the origin until the first `stepCar`).
- [ ] In `loop()` (`:1619`) add `drawShadow();` right after `drawWheels();`.
- [ ] `__mm.hud` (`:1316`): `shadowVisible: shadowMesh.visible`.
- [ ] Add after `__mm.carSize` (`:1371`): `window.__mm.shadow = () => ({ visible: shadowMesh.visible, opacity: shadowMesh.material.opacity, size: [shadowMesh.scale.x, shadowMesh.scale.z], pos: [shadowMesh.position.x, shadowMesh.position.y, shadowMesh.position.z], rot: [shadowMesh.rotation.x, shadowMesh.rotation.y, shadowMesh.rotation.z], shift: (() => { const s = sunShift(sun.position, SHADOW.bodyMid * CAR_SIZE.h); return [s.x, s.z]; })(), ground: SHADOW_STATE.y });` with the comment line above: `// #163: read-only, for the test`.
- [ ] `grep -n "blob" prototype/index.html` → only the tree texture and `savePhoto`. Run `node --test prototype/tests/*.test.mjs`. Load the page: clean console, the shadow sits under the car on the start screen, both styles (T). Commit `feat(vehicles): car shadow lies on the ground and follows the sun (#163)`.

### Task 4: Browser test, CHANGELOG, verification

**Files:** create `prototype/tests/test_shadow.py`; modify `CHANGELOG.md`.

- [ ] Commit and push the branch first (`git push -u origin <branch>`), so a check that dies mid-run leaves the work recoverable.
- [ ] Write `prototype/tests/test_shadow.py`, hand layout, every read after `wait_frames(page, 2)`:

```python
"""#163: the car's ground shadow is a soft decal sized from the car, lying on the ground and shifted away from the sun.
Hand-traced layout (world + terrain blocked): deterministic, no data files. Every read waits for two drawn frames
(drawShadow runs in the loop). Slow (Playwright): run in the foreground, under a memory cap."""
import math

import pytest
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, open_hand_query, wait_frames

SHADOW_JS = "() => window.__mm.shadow()"
MARGIN = 0.5


def shadow(page):
    wait_frames(page, 2)
    return page.evaluate(SHADOW_JS)


def test_shadow_is_sized_from_the_car(server):
    """#163: compact 4.66 x 2.18 m -> quad 5.29 x 3.0 m with a dark core shorter than the car; the old disc was 5.2 m solid."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        size = page.evaluate("() => window.__mm.carSize()")
        s = shadow(page)
        b.close()
    assert s["visible"] is True, s
    assert s["size"][0] == pytest.approx(size["l"] * 0.92 + 2 * MARGIN, abs=0.02), (s, size)
    assert s["size"][1] == pytest.approx(size["w"] * 0.92 + 2 * MARGIN, abs=0.02), (s, size)
    assert s["size"][0] - 2 * MARGIN < size["l"], (s, size)
    assert s["shift"][0] == pytest.approx(0.465, abs=0.01) and s["shift"][1] == pytest.approx(0.31, abs=0.01), s
    assert s["pos"][1] == pytest.approx(s["ground"] + 0.04, abs=1e-6), s


def test_delorean_shadow_is_shorter(server):
    """#163: the DeLorean (4.27 m) gets a shorter quad than the compact: measured, not drawn."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        compact = shadow(page)["size"]
        b.close()
        b, page, errors = open_hand_query(p, server, "?vehicle=delorean")
        delorean = shadow(page)["size"]
        b.close()
    assert errors == []
    assert delorean[0] < compact[0] - 0.3, (compact, delorean)


def test_shadow_lies_on_the_ramp(server):
    """#163: on the jump ramp the quad pitches with the slope and sits on the ground, not at the flat ground height."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        r = page.evaluate("() => window.__mm.ramp()")
        mx, mz = (r["x0"] + r["x1"]) / 2, (r["z0"] + r["z1"]) / 2
        page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [mx, mz])
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.05, [])", [mx, mz])
        s = shadow(page)
        ground = page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [mx, mz])
        b.close()
    pitch = math.atan(r["h"] / (r["x1"] - r["x0"]))
    assert s["rot"][2] == pytest.approx(pitch, abs=0.03), (s, pitch)
    assert abs(s["pos"][1] - 0.04 - ground) < 0.1, (s, ground)


def test_helicopter_and_eye_cameras_hide_the_shadow(server):
    """#163: F takes off -> no car, no shadow; landing shows it again. The cockpit view hides it too (#37 covers V).
    F does nothing on the start screen (test_heli.py::test_f_does_nothing_on_the_start_screen), so start a run first."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.keyboard.press("KeyF"); page.evaluate("() => window.__mm.flySim(10, [])")
        assert page.evaluate("() => window.__mm.fly().on") is True
        flying = shadow(page)["visible"]
        page.keyboard.press("KeyF"); page.wait_for_function("() => !window.__mm.fly().on", timeout=120000)
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.05, [])", page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z]; }"))
        landed = shadow(page)["visible"]
        page.keyboard.press("KeyC"); page.keyboard.press("KeyC"); cockpit = shadow(page)["visible"]
        b.close()
    assert flying is False and landed is True and cockpit is False, (flying, landed, cockpit)


def test_style_sets_the_base_opacity(server):
    """#163: original 0.55 (the only shadow), smooth 0.3 (a contact darkening under the real shadow-map shadow)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        original = shadow(page)["opacity"]
        page.keyboard.press("KeyT"); smooth = shadow(page)["opacity"]
        b.close()
    assert original == pytest.approx(0.55, abs=1e-6) and smooth == pytest.approx(0.3, abs=1e-6), (original, smooth)


def test_rebuilds_keep_the_texture_count(server):
    """#163: bakeShadow disposes the previous map; two vehicle round trips leave renderer.info.memory.textures unchanged."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        before = page.evaluate("() => window.__mm.gpu().textures")
        for _ in range(2):
            page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().delorean)")
            page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")
        wait_frames(page, 2)
        after = page.evaluate("() => window.__mm.gpu().textures")
        b.close()
    assert after == before, (before, after)
```

  Check `test_heli.py:44-51` for how it waits after `KeyF` (the F key only takes off when a road is within `HELI.landRadius`; the hand start is on a road) and reuse its wait if the simple `wait_for_function` on `fly().on` is not what landing needs (landing may need the car over a road: the start spot is). `open_hand_query` returns `(b, page, errors)` — three values.

- [ ] Run, in the foreground, capped: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest prototype/tests/test_shadow.py -x` and then `... python -m pytest prototype/tests/test_vehicles.py -x -k "gpu_memory or true_to_size"` and `... python -m pytest prototype/tests/test_smoke.py -x -k test_hud_bundle` (the V-toggle shadow assertion lives in `test_hud_bundle`, `test_smoke.py:469`). If a run is killed with 137, lower nothing: run one file at a time.
- [ ] If `test_shadow_lies_on_the_ramp` fails on the sign of `rot[2]`, the pitch sense in `drawShadow` is flipped relative to the ramp (which rises toward +x): negate it there and re-run; do not change `groundTilt`.
- [ ] CHANGELOG `[Unreleased]` / `### Fixed` (create the section if missing, after `### Changed` if that exists): "The car's shadow looks like a shadow now: a soft, dark patch the size of the car instead of a hard oval that was longer than the car. It lies on the road and tilts with it on the ramp and on slopes, sits a little off to the side the way the sun shines, fades as you jump, and is gone in the helicopter and in the cockpit and bumper views. The DeLorean gets its own, shorter shadow."
- [ ] Commit `fix(vehicles): soft car shadow on the ground (#163)`, push, open the PR with `Closes #163`. In the PR body, note the measured `window.__mm.physMs` before and after on the hand layout (two extra `groundH` samples per step) so the frame-cost claim in the spec is on record.
