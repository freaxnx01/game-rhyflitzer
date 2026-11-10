# Smiley speed display in Sisseln (#745): implementation plan

**Goal:** A speed display on the Hauptstrasse in Sisseln, right of the traffic coming from the Smile-Kreisel, at the
bend: dark until a ground vehicle approaches within 120 m, then the speed in amber km/h and a green 🙂 (≤ 50) or a
red 🙁 (> 50). Display only, no gameplay effect; dark on foot, in the loco and in the helicopter.

**Spec:** [docs/superpowers/specs/2026-11-08-sisseln-speed-display-design.md](../specs/2026-11-08-sisseln-speed-display-design.md)

**Global constraints:**
- Buildless; `speeddisplay.js` is pure (no DOM, no three.js). Do not touch `landmarks.js`, `busstop.js`,
  `pipeline/` or `data/world_hochrhein.json`.
- Tests: `node --test tests/speeddisplay.test.mjs`, then the full `node --test tests/`; Playwright **only**
  `python3 -m pytest tests/test_speed_display.py -x` (foreground, generous timeout). Not the whole suite.
- No gameplay change: nothing in `stepCar`, the race, the HUD or the tutorial.
- CHANGELOG entry under `[Unreleased]` → `### Added`, player voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit and push after each task.

### Task 1: pure module `speeddisplay.js`

**Files:** `speeddisplay.js` (new), `tests/speeddisplay.test.mjs` (new)

**Interfaces:**
- `SPEED_DISPLAY = { x: 1465.45, z: -158.27, approach: [0.99862, -0.05256], limit: 50, range: 120, lateral: 10, minKmh: 3, panel: { w: 0.8, h: 1.2, y: 2.2 }, tex: { w: 256, h: 384 } }`
- `faceYaw(cfg = SPEED_DISPLAY) -> number` = `Math.atan2(-cfg.approach[0], -cfg.approach[1])` (group `rotation.y`; local +z faces the oncoming cars)
- `displayState({ x, z, vx, vz, ground }, cfg = SPEED_DISPLAY) -> { on: false } | { on: true, kmh, happy }`
  - `u = cfg.approach`, `n = [-u[1], u[0]]`
  - off when `!ground`; when `d = (cfg.x - x) * u[0] + (cfg.z - z) * u[1]` is `<= 0` or `> cfg.range`; when
    `Math.abs((x - cfg.x) * n[0] + (z - cfg.z) * n[1]) > cfg.lateral`; when `vx * u[0] + vz * u[1] <= 0`; when
    `kmh = Math.round(Math.hypot(vx, vz) * 3.6) < cfg.minKmh`
  - else `{ on: true, kmh, happy: kmh <= cfg.limit }`
- `displayKey(state) -> string`: `'off'` or `` `${kmh}:${happy ? 'h' : 's'}` ``
- `panelColors(state) -> { digits: '#ffb000', face: state.happy ? '#39d353' : '#ff3b30' }`

- [ ] **Write the failing test** (`tests/speeddisplay.test.mjs`):

```js
// #745: the Sisseln speed display -- when it lights up and what it shows. node --test tests/speeddisplay.test.mjs
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_DISPLAY, faceYaw, displayState, displayKey, panelColors } from '../speeddisplay.js';

const S = SPEED_DISPLAY, [ux, uz] = S.approach;
// a car `back` metres before the sign on the approach axis, driving towards it at `kmh`
const car = (back, kmh, extra = {}) => ({ x: S.x - ux * back, z: S.z - uz * back, vx: ux * kmh / 3.6, vz: uz * kmh / 3.6, ground: true, ...extra });

test('displayState_ApproachingUnderTheLimit_OnAndHappy', () => {
  const s = displayState(car(60, 47));
  assert.deepEqual(s, { on: true, kmh: 47, happy: true });
});

test('displayState_ApproachingOverTheLimit_OnAndSad', () => {
  const s = displayState(car(60, 63));
  assert.deepEqual(s, { on: true, kmh: 63, happy: false });
});

test('displayState_LimitIsInclusive_50HappyAnd51Sad', () => {
  assert.equal(displayState(car(40, 50)).happy, true);
  assert.equal(displayState(car(40, 51)).happy, false);
});

test('displayState_OutOfRange_Off', () => {
  assert.deepEqual(displayState(car(S.range + 1, 50)), { on: false });
  assert.equal(displayState(car(S.range - 1, 50)).on, true);
});

test('displayState_PastTheSign_Off', () => {
  assert.deepEqual(displayState(car(-5, 50)), { on: false });
});

test('displayState_ComingFromTheVillage_Off', () => {
  // 40 m on the village side, driving towards the roundabout: sees the back of the sign
  const c = { x: S.x + ux * 40, z: S.z + uz * 40, vx: -ux * 50 / 3.6, vz: -uz * 50 / 3.6, ground: true };
  assert.deepEqual(displayState(c), { on: false });
});

test('displayState_DrivingAwayInsideTheCorridor_Off', () => {
  const c = car(60, 50); c.vx = -c.vx; c.vz = -c.vz;
  assert.deepEqual(displayState(c), { on: false });
});

test('displayState_BesideTheRoad_Off', () => {
  const nx = -uz, nz = ux, c = car(60, 50);
  assert.deepEqual(displayState({ ...c, x: c.x + nx * (S.lateral + 1), z: c.z + nz * (S.lateral + 1) }), { on: false });
  assert.equal(displayState({ ...c, x: c.x + nx * (S.lateral - 1), z: c.z + nz * (S.lateral - 1) }).on, true);
});

test('displayState_Standing_Off', () => {
  assert.deepEqual(displayState(car(60, 0)), { on: false });
  assert.deepEqual(displayState(car(60, 2)), { on: false });
  assert.equal(displayState(car(60, 3)).on, true);
});

test('displayState_NotAGroundVehicle_Off', () => {
  assert.deepEqual(displayState(car(60, 50, { ground: false })), { on: false });
});

test('displayKey_OffAndOnStates', () => {
  assert.equal(displayKey({ on: false }), 'off');
  assert.equal(displayKey({ on: true, kmh: 47, happy: true }), '47:h');
  assert.equal(displayKey({ on: true, kmh: 63, happy: false }), '63:s');
});

test('panelColors_AmberDigits_GreenOrRedFace', () => {
  assert.deepEqual(panelColors({ on: true, kmh: 47, happy: true }), { digits: '#ffb000', face: '#39d353' });
  assert.deepEqual(panelColors({ on: true, kmh: 63, happy: false }), { digits: '#ffb000', face: '#ff3b30' });
});

test('faceYaw_LocalPlusZPointsAgainstTheApproach', () => {
  const yaw = faceYaw();
  // rotation.y maps local +z to (sin yaw, cos yaw)
  assert.ok(Math.abs(Math.sin(yaw) + ux) < 1e-6 && Math.abs(Math.cos(yaw) + uz) < 1e-6);
  assert.ok(Math.abs(yaw - -1.518) < 0.01);
});

// data guard: the fixed foot stands right of the Hauptstrasse at the bend, 1.0-1.5 m off the asphalt, and the
// approach axis follows the road's centre line back to the straight (spec A6, A7)
const WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
test('SPEED_DISPLAY_StandsBesideTheHauptstrasse_InTheWorldFile', { skip: !fs.existsSync(WORLD) && 'run pipeline/osm.py build first' }, () => {
  const W = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
  const nearest = (x, z) => { let m = { d: Infinity, edge: Infinity, r: null }; for (const r of W.roads) for (let i = 0; i < r.pts.length - 1; i++) { const d = segDist(x, z, r.pts[i], r.pts[i + 1]); if (d - r.w / 2 < m.edge) m = { d, edge: d - r.w / 2, r }; } return m; };
  const foot = nearest(S.x, S.z);
  assert.equal(foot.r.n, 'Hauptstrasse');
  assert.ok(foot.edge >= 1.0 && foot.edge <= 1.5, `edge distance ${foot.edge}`);
  for (const back of [30, 70, 110]) {
    const p = nearest(S.x - ux * back, S.z - uz * back);
    assert.equal(p.r.n, 'Hauptstrasse', `${back} m back`);
    assert.ok(p.d <= 1.5, `${back} m back: ${p.d} m off the centre line`);
  }
});
```

- [ ] **Run it, see it fail** (`node --test tests/speeddisplay.test.mjs`: module not found).
- [ ] **Write the minimum `speeddisplay.js`** to make it pass:

```js
// #745: the smiley speed display at the Sisseln village entrance -- where it stands, which cars it measures and what
// it shows. Pure: no DOM, no three.js. Coordinates from data/world_hochrhein.json (spec 2026-11-08-sisseln-speed-display).
export const SPEED_DISPLAY = {
  x: 1465.45, z: -158.27,            // foot: right of the Hauptstrasse at the middle of the bend, 1.2 m off the asphalt
  approach: [0.99862, -0.05256],     // unit direction of the measured traffic: the straight from the Smile-Kreisel
  limit: 50,                         // km/h: at or under -> happy
  range: 120, lateral: 10,           // m: lights up this far before the sign, within this much of the approach axis
  minKmh: 3,                         // km/h: dark for a standing car
  panel: { w: 0.8, h: 1.2, y: 2.2 }, // m: housing size and centre height
  tex: { w: 256, h: 384 },           // px: the LED face canvas
};

// the sign group's rotation.y: local +z (the LED face) points against the approach, at the oncoming cars
export const faceYaw = (cfg = SPEED_DISPLAY) => Math.atan2(-cfg.approach[0], -cfg.approach[1]);

export function displayState(car, cfg = SPEED_DISPLAY) {
  if (!car.ground) return { on: false };
  const [ux, uz] = cfg.approach, dx = cfg.x - car.x, dz = cfg.z - car.z;
  const ahead = dx * ux + dz * uz;                         // m still to drive to the sign
  if (ahead <= 0 || ahead > cfg.range) return { on: false };
  if (Math.abs(-dx * -uz + -dz * ux) > cfg.lateral) return { on: false };   // (car - sign) . n, n = (-uz, ux)
  if (car.vx * ux + car.vz * uz <= 0) return { on: false };               // not closing
  const kmh = Math.round(Math.hypot(car.vx, car.vz) * 3.6);
  if (kmh < cfg.minKmh) return { on: false };
  return { on: true, kmh, happy: kmh <= cfg.limit };
}

export const displayKey = (s) => s.on ? `${s.kmh}:${s.happy ? 'h' : 's'}` : 'off';

export const panelColors = (s) => ({ digits: '#ffb000', face: s.happy ? '#39d353' : '#ff3b30' });
```

  (Write the lateral term readably, e.g. `const lat = (car.x - cfg.x) * -uz + (car.z - cfg.z) * ux;` — the test
  pins the behaviour, not the spelling.)

- [ ] **Run it, see it pass**, then `node --test tests/`. Commit `feat(world): pure state of the Sisseln speed display (#745)`.

### Task 2: the sign in `index.html` — build, step, debug hook

**Files:** `index.html`

**Interfaces (module-level in index.html):**
- `import { SPEED_DISPLAY, faceYaw, displayState, displayKey, panelColors } from './speeddisplay.js';   // #745`
  next to the `busstop.js` import (`index.html:731`).
- `let SPEEDSIGN = null;` → `{ tex, canvas, key, state, redraws, x, z, yaw }` once built.
- `function drawSpeedPanel(g, w, h, state)`, `function speedDisplayBuild()`, `function stepSpeedDisplay()`.

- [ ] **Add the drawing function** (near `busStop`, `index.html:2044`):

```js
// #745: the LED face of the Sisseln speed display: dark, or amber km/h over a green smile / red frown
function drawSpeedPanel(g, w, h, state) {
  g.fillStyle = '#07080a'; g.fillRect(0, 0, w, h);
  if (!state.on) return;
  const c = panelColors(state);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = c.digits; g.font = `italic 800 ${Math.round(h * 0.42)}px "Barlow Condensed", sans-serif`; g.fillText(String(state.kmh), w / 2, h * 0.27);
  g.globalAlpha = 0.6; g.font = `700 ${Math.round(h * 0.08)}px "Barlow Condensed", sans-serif`; g.fillText('km/h', w / 2, h * 0.5); g.globalAlpha = 1;
  const cx = w / 2, cy = h * 0.76, r = h * 0.15;
  g.strokeStyle = c.face; g.fillStyle = c.face; g.lineWidth = h * 0.025; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  for (const sd of [-1, 1]) { g.beginPath(); g.arc(cx + sd * r * 0.38, cy - r * 0.3, r * 0.09, 0, Math.PI * 2); g.fill(); }
  g.beginPath();
  if (state.happy) g.arc(cx, cy + r * 0.05, r * 0.55, Math.PI * 0.15, Math.PI * 0.85);           // smile: arc below the centre, ends up
  else g.arc(cx, cy + r * 0.75, r * 0.55, Math.PI * 1.15, Math.PI * 1.85);                       // frown: arc above the mouth line, ends down
  g.stroke();
}
```

- [ ] **Add the builder** (after `drawSpeedPanel`):

```js
// #745: pole, anthracite housing and the live LED face, at the fixed foot, facing the straight from the Smile-Kreisel
let SPEEDSIGN = null;
function speedDisplayBuild() {
  const cfg = SPEED_DISPLAY, g = new THREE.Group(), b = terrainH(cfg.x, cfg.z), P = cfg.panel;
  const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), steel); pole.position.y = 1.4; g.add(pole);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.h, 0.12), new THREE.MeshLambertMaterial({ color: 0x2b2f36 })); housing.position.y = P.y; g.add(housing);
  const canvas = document.createElement('canvas'); canvas.width = cfg.tex.w; canvas.height = cfg.tex.h;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(P.w - 0.08, P.h - 0.08), new THREE.MeshBasicMaterial({ map: tex })); face.position.set(0, P.y, 0.065); g.add(face);
  g.position.set(cfg.x, b, cfg.z); g.rotation.y = faceYaw(cfg); signs.add(g);
  SPEEDSIGN = { tex, canvas, key: null, state: { on: false }, redraws: 0, x: cfg.x, z: cfg.z, yaw: g.rotation.y };
  stepSpeedDisplay();   // draws the dark face once
}
// #745: per frame; redraws the canvas only when the shown value changes (relabelFerrisSign pattern)
function stepSpeedDisplay() {
  if (!SPEEDSIGN) return;
  const state = displayState({ x: P.x, z: P.z, vx: P.vx, vz: P.vz, ground: !FOOT.on && !TRAIN.on && !FLY.on });
  const key = displayKey(state);
  SPEEDSIGN.state = state;
  if (key === SPEEDSIGN.key) return;
  SPEEDSIGN.key = key; SPEEDSIGN.redraws++;
  drawSpeedPanel(SPEEDSIGN.canvas.getContext('2d'), SPEEDSIGN.canvas.width, SPEEDSIGN.canvas.height, state);
  SPEEDSIGN.tex.needsUpdate = true;
}
```

  Mind the shadowing: `P` is the player state in `index.html`; name the panel constant `PN` (or similar) inside
  `speedDisplayBuild`, not `P`. `FOOT`, `TRAIN`, `FLY` are declared later in the file (`index.html:4168`, `3125`)
  but `stepSpeedDisplay` only runs after the world is built, so the `const` bindings exist by then — the same
  order the `loop` relies on. If `speedDisplayBuild()`'s initial `stepSpeedDisplay()` runs before those
  declarations (TDZ error in the console), draw the dark face directly in the builder instead and leave the first
  step to the loop.

- [ ] **Call the builder** in the landmark block (`index.html:2425`, right after the `smileKreisel` line):

```js
    if (at('smileKreisel')) speedDisplayBuild();   // #745: the speed display on the Hauptstrasse into Sisseln, same world as the roundabout
```

- [ ] **Step it in the loop** (`index.html:5774`): add `stepSpeedDisplay();` directly after `stepPostauto(dt);`.

- [ ] **Debug hook** (next to `window.__mm.busStops`, `index.html:4600`):

```js
window.__mm.speedDisplay = () => { stepSpeedDisplay(); return SPEEDSIGN ? { x: SPEEDSIGN.x, z: SPEEDSIGN.z, yaw: SPEEDSIGN.yaw, key: SPEEDSIGN.key, state: SPEEDSIGN.state, redraws: SPEEDSIGN.redraws } : null; };   // #745: steps first (headless draws under 1 fps)
```

- [ ] **Smoke in node is not possible** (DOM); run `node --test tests/` to be sure nothing else broke, open the page
  once (`python3 -m http.server 8000`) and check the console is clean. Commit
  `feat(world): smiley speed display on the Hauptstrasse into Sisseln (#745)` and push.

### Task 3: one Playwright test, CHANGELOG, look check

**Files:** `tests/test_speed_display.py` (new), `CHANGELOG.md`

- [ ] **Write the test** (one file, one test; `open_page` as in `tests/test_street_labels.py:15`):

```python
"""#745: the smiley speed display in Sisseln lights up for cars from the Smile-Kreisel. Slow (Playwright): foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
TH = -0.0526   # heading of the straight from the roundabout into the village (atan2 of SPEED_DISPLAY.approach)


def open_page(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.speedDisplay && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


@needs_world
def test_speed_display_shows_speed_and_smiley_for_cars_from_the_kreisel(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        sign = page.evaluate("() => window.__mm.speedDisplay()")
        assert sign and abs(sign["x"] - 1465.45) < 0.01 and abs(sign["z"] + 158.27) < 0.01
        assert sign["state"] == {"on": False}
        # 70 m before the sign on the straight, 60 km/h towards the village: on, over the limit
        page.evaluate(f"() => window.__mm.sim(1395.6, -153.9, {TH}, 60 / 3.6, 0.1)")
        s = page.evaluate("() => window.__mm.speedDisplay().state")
        assert s["on"] and s["kmh"] > 50 and s["happy"] is False
        # same spot at 30 km/h: on, happy
        page.evaluate(f"() => window.__mm.sim(1395.6, -153.9, {TH}, 30 / 3.6, 0.1)")
        s = page.evaluate("() => window.__mm.speedDisplay().state")
        assert s["on"] and s["kmh"] <= 50 and s["happy"] is True
        # past the sign, driving back towards the roundabout: the back of the sign, dark
        page.evaluate(f"() => window.__mm.sim(1480, -175, {TH + 3.14159}, 40 / 3.6, 0.1)")
        assert page.evaluate("() => window.__mm.speedDisplay().state") == {"on": False}
        assert page.evaluate("() => window.__mm.speedDisplay().redraws") >= 3
        assert not errors
        b.close()
```

- [ ] **Run only it**, foreground, generous timeout: `python3 -m pytest tests/test_speed_display.py -x`. If
  `sim`'s 0.1 s of `KeyW` changes the speed more than expected, compare `kmh` against the limit only (as written),
  never against the exact start speed.
- [ ] **Look check (one pass, Playwright screenshot at 1920×1080):** `__mm.place(1400, -154, TH)` and screenshot
  — the panel should be readable down the straight, dark; then `__mm.sim(1400, -154, TH, 60/3.6, 0.1)` and
  screenshot — amber number, red frown. If the face is mirrored, flip the plane (`rotation.y = Math.PI` on the face
  mesh, keep the group yaw) rather than changing `faceYaw`.
- [ ] **CHANGELOG** under `[Unreleased]` → `### Added` (top of the list, Swiss timestamp): at the **Sisseln**
  village entrance, on the Hauptstrasse between the **Smile-Kreisel** and the **Volg**, a **speed display** now shows
  your speed as you come in from the roundabout: a green smile at 50 km/h or under, a red frown above. Only for cars
  heading into the village; it does nothing to the game.
- [ ] **Full unit run** `node --test tests/`, commit `docs(changelog): Sisseln speed display (#745)` and push.
