# Helicopter Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refreshed 2026-10-11 against `main` @ `090402c`.** What changed since the first version: the sound engine (#14) **is** on `main` (`prototype/sound.js`), so Task 5 is now unconditional; `P.nitro` is read by `SFX.update` every frame, so `stepFly` must write it (it is stale from the last car frame otherwise); the helicopter uses the shared `carMats.glass` (pinned by `test_vehicles.py::test_windows_are_dark_and_opaque`, #123), so the new model must keep it; flight height uses `skyGroundH` (hideout hill, #102); `index.html` grew from ~1400 to ~2750 lines, so anchors below are identifiers, not line numbers. Nothing in the issue is obsolete: N, height, look, B and the rotor are all still missing on `main`. Verification is `node --test prototype/tests/*.test.mjs` plus the **one** new Playwright file `test_heli_extras.py`, not the ~2 h full suite.

**Goal:** In the helicopter (#10): **N** boosts speed (60 m/s, 24 m/s²) with blue exhaust flames; the HUD shows the height above ground and, with the measured terrain, above sea level; the helicopter is a dark, sleek gunship-shaped low-poly model with a bubble canopy and no weapons, text or livery; **B** flips the heli camera to look back; the rotor sound (#14, already on `main`) is made subtle and reacts to nitro (#99).

**Architecture:** `prototype/heli.js` (pure, node-tested) gains `HELI.topNitro` / `HELI.accelNitro`, a `nitro` input, nitro-aware `stepHeli`, and `heliAltitude(y, ground, base)`. `prototype/index.html` gets `buildHeli(...)` next to `buildCompact` (built once into the existing `heli` group, plus `tailRotor` and `heliFlames` groups), `stepFly` writing `FLY.nitro` / `P.nitro` and the flames, `flyCamera(dt, s, snap)` honouring #65's look-back, a `#alt` line in the `#tr` plate filled by `hud`, strings via `tr()`, hooks `__mm.fly().nitro` and `__mm.heliModel()`. The rotor sound is a small edit of `ROTOR` / `rotorMix` in `prototype/sound.js` (Task 5); `SFX.update` already passes `P.nitro` and `FLY.on` as `nitro` / `fly`.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`; `node --test` for pure modules; Playwright + pytest for the browser checks (one file: `test_heli_extras.py`).

**Spec:** `docs/superpowers/specs/2026-10-03-heli-extras-design.md`

## Global Constraints

- **`test_heli.py`, `test_look_back.py` and `test_vehicles.py` stay unchanged** (run by CI, not by you — see the test rule below). `heli.test.mjs` changes only where this plan says (the `HELI` constants assertion, the `heliInput` shape, new tests). Never edit a test to make it pass.
- The whole model stays inside `HELI.rotorMargin` 8 m of the hub in x and z: nose ≤ 3.9, tail ≥ −7.85, blades ±6. Do not change `rotorMargin`, `heliFloor` or the camera constants.
- **No weapons, no text, no textures on the helicopter**: no `textTex`, no `material.map`, no gun pods, no cannon. The sensor ball on the nose is the only „eye".
- No new key, no touch button, no new help line (`keyHeli` is extended). **C** stays inactive in flight.
- No sound code outside Task 5. Do not add a new voice to the `SFX` block in `index.html`; only edit `ROTOR` / `rotorMix` in `sound.js`.
- **Keys:** `N` and `B` are already bound in `index.html`'s `keydown` handler / `stepCamera` (`keys.KeyN` in `stepCar`, `keys.KeyB` in `stepCamera`); grep of all `prototype/*.js` (incl. `pause.js`, `route.js`) shows no other use of `KeyN` (only `route.js` `TAKE_OVER_KEYS`, which stops the autopilot — irrelevant in flight) and none of `KeyB` besides `stepCamera`. Add **no** new key handling: `heliInput` reads `keys.KeyN`, `stepCamera` already reads `keys.KeyB`.
- **Glass:** the canopy and the nose ball use the shared `carMats.glass` and the canopy carries `userData.glass = true`. Do not create a second glass material: `test_vehicles.py::test_windows_are_dark_and_opaque` (#123) finds the heli glass by that flag and wants it dark and opaque. Never dispose `carMats.*` (the heli is built once and never rebuilt).
- **Not for #99:** pause (`openPause` already clears `keys`, so N and B release), the rear-view mirror (`mirrorVisible` already hides it while `FLY.on`), the hideout (`takeOff` already refuses under `roofedAt`), Navi (dimmed in flight), the car garage (`CARSEL`), the Testhub, the DeLorean and underwater code. Do not touch them.
- Strings go through `tr()`; `prototype/strings.js` gets the same keys in `en` and `de` (`strings.test.mjs` enforces equal keys; Swiss spelling, no `ß`).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()`.
- Do not touch `data/` or `pipeline/`.
- **Animated camera:** the heli camera lerps (rate 3) and a headless renderer draws under 1 fps. Every browser check **polls the end state** with `page.wait_for_function(…, timeout=120000)` — wait for *arrival* (flag **and** camera on the expected side), never for stillness, never a fixed `wait_for_timeout` on a camera position. `__mm.flySim` steps the flight synchronously; the camera and the HUD update on the next drawn frame, so poll them.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_heli_extras.py -q`. Slow (several minutes). **Run only this one Playwright file, never the full suite (~2 h) and never other `test_*.py` files**; node tests: all of `prototype/tests/*.test.mjs`. **Foreground only, never `run_in_background`.** Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs. Open PR #281 (hideout lift) also edits `prototype/index.html`; it does not touch the helicopter blocks, so a rebase conflict is unlikely — if one appears, keep both sides.
- Task 2 is a graphics task: when subagents are dispatched for it locally, use the Fable model (repo owner's memory).

## Review Focus

- **`heliInput` shape:** every caller and every existing `heli.test.mjs` assertion now needs `nitro`; `IDLE` in the test file gains `nitro: 0`. A missed `nitro` makes `stepHeli` read `undefined` → falsy → no boost, silently.
- **Nitro implies forward** (`fwd` includes `nitro`), like the car's `gas = … || nitro`; **S** + **N** = 0.
- **`flyCamera(dt, s, snap)`:** `s` flips the camera offset *and* the look-at point; `snap` copies instead of lerping. The ground clamp `+5` stays.
- **`P.nitro` in flight:** `SFX.update` reads `P.nitro` every frame; `stepFly` must set it (0/1) or the rotor keeps the last car value after take-off.
- **Model extents** are pinned by `test_heli_model_...` — if a part sticks out past 8 m, move the part, never the margin.
- **`#alt` hidden on the ground**, visible in flight, text from `tr()`, no „a.s.l." in the hand layout (`REAL === null`).

---

## File map

- `prototype/heli.js`: `HELI`, `heliInput`, `stepHeli`, new `heliAltitude` (Task 1).
- `prototype/tests/heli.test.mjs`: `IDLE`, `HELI` assertion, nitro and altitude tests (Task 1).
- `prototype/index.html` (find each by the identifier, not a line number):
  - the `import { HELI, heliInput, … } from './heli.js';` line (add `heliAltitude`)
  - the `#tr` plate (`<div id="best">Best —</div>`) and the CSS rule `#best{…}`
  - the help line `<kbd>F</kbd><span data-i18n="keyHeli">`
  - the helicopter block under `// #10 helicopter (F): FLY is the flight state` (`const FLY`, `const heli`, the `{ const body = new THREE.MeshLambertMaterial({ color: 0xffc61a })…` model block)
  - `function resetCar()`, `function stepFly(dt)`
  - `window.__mm.fly = …`, new `window.__mm.heliModel` after it
  - `function flyCamera(dt)` and the `if (FLY.on) flyCamera(dt); else if (v.eye)` call in `stepCamera`
  - `function hud(dt)`
- `prototype/strings.js`: `altitude` (new) next to `heliNoRoad`, and `keyHeli`, in `en` and `de`.
- `prototype/tests/test_heli_extras.py`: new (Tasks 2–4).
- `prototype/sound.js`, `prototype/tests/sound.test.mjs`: `ROTOR`, `rotorMix` (Task 5).
- `docs/ai-notes/screenshots/2026-10-03-heli-look.png`: new (Task 6; the folder does not exist yet, create it).
- `CHANGELOG.md`, `test-todo.md` (Task 7).

Verified against `main` @ `090402c` on 2026-10-11. Re-check each anchor with `grep -n` before editing (Task 0).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the anchors.** From the repo root, each on its own:

```bash
grep -c "^const FLY = { on: false, v: 0, alt: 0 };" prototype/index.html
grep -c "^const heli = new THREE.Group(), rotor = new THREE.Group(); heli.visible = false; scene.add(heli);" prototype/index.html
grep -c "^function flyCamera(dt) {" prototype/index.html
grep -c "if (FLY.on) flyCamera(dt); else if (v.eye)" prototype/index.html
grep -c "heliAltitude\|heliFlames\|buildHeli" prototype/index.html prototype/heli.js
```

Expected: `1`, `1`, `1`, `1`, then `0` for both files. If the last line is not `0`, STOP and report (someone started this already). If one of the first four is `0`, find the moved line with `grep -n` and adapt, keeping its meaning.

- [ ] **Step 2: Sound check.** `grep -n "export const ROTOR\|export function rotorMix" prototype/sound.js` → both present (they are: #14 is on `main`). If not, STOP and report.

- [ ] **Step 3: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: `heli.js` — nitro and altitude (node, TDD)

**Files:**
- Modify: `prototype/tests/heli.test.mjs`
- Modify: `prototype/heli.js`

**Interfaces:**
- `HELI` gains `topNitro: 60, accelNitro: 24`.
- `heliInput(keys, touch)` → `{ fwd, yaw, lift, nitro }`; `nitro` = `KeyN` held (0/1); `fwd` counts `nitro` as forward.
- `stepHeli(s, input, dt, ground, floor, cfg)`: with `input.nitro` the forward target is `cfg.topNitro` and the step `cfg.accelNitro·dt`.
- `heliAltitude(y, ground, base)` → `{ agl, asl }`, integers; `asl === null` unless `base` is a finite number.

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/heli.test.mjs`:

Change the import and `IDLE`:

```js
import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot, heliAltitude } from '../heli.js';

const IDLE = { fwd: 0, yaw: 0, lift: 0, nitro: 0 };
```

Replace the `HELI: the agreed flight constants` test body with:

```js
  assert.deepEqual(HELI, { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 12, accelNitro: 24, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 8, landRadius: 150, camDist: 35, camH: 22 });
```

Replace the `HELI: the rotor margin covers the model (blades 5.5 m, tail boom to 7.4 m from the hub) -- review of #84` test with:

```js
test('HELI: the rotor margin covers the gunship model (nose 3.9 m, tail rotor 7.85 m, blades 6 m) and nitro is faster -- #99', () => {
  assert.ok(HELI.rotorMargin >= 7.85);
  assert.ok(HELI.topNitro > HELI.top && HELI.accelNitro > HELI.accel);
});
```

In the `heliInput` test (`heliInput: W/S and arrows fly, …`), every one of the 6 expected objects that is not `IDLE` gains `nitro: 0` (`{ fwd: 1, yaw: 1, lift: 1, nitro: 0 }` etc.), and add at its end:

```js
  assert.deepEqual(heliInput({ KeyN: true }, NO_TOUCH), { fwd: 1, yaw: 0, lift: 0, nitro: 1 });            // N alone flies forward, like gas
  assert.deepEqual(heliInput({ KeyN: true, KeyS: true }, NO_TOUCH), { fwd: 0, yaw: 0, lift: 0, nitro: 1 });
```

Append:

```js
test('stepHeli: N raises the top speed to topNitro at accelNitro; letting go falls back to top -- #99', () => {
  let s = run(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 6);
  close(s.v, HELI.topNitro, 1e-9, 'nitro top');
  const one = stepHeli(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 1, 0, 10);
  close(one.v, HELI.accelNitro, 1e-9, 'one second of nitro from rest');
  s = run(s, { ...IDLE, fwd: 1 }, 3); close(s.v, HELI.top, 1e-9, 'back to top');
  s = run(s, { ...IDLE, nitro: 1 }, 3); close(s.v, HELI.topNitro, 1e-9, 'N alone');
});

test('heliAltitude: metres above the ground, and above sea level only with a datum -- #99', () => {
  assert.deepEqual(heliAltitude(130.4, 10.2, 284), { agl: 120, asl: 414 });
  assert.deepEqual(heliAltitude(130.4, 10.2, undefined), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(130.4, 10.2, null), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(130.4, 10.2, NaN), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(5, 5, 284), { agl: 0, asl: 289 });
});
```

- [ ] **Step 2: Run, watch it fail.** `node --test prototype/tests/*.test.mjs` → `heli.test.mjs` fails (`heliAltitude` is not exported; `HELI` deep-equality; `heliInput` shape).

- [ ] **Step 3: Implement** in `prototype/heli.js`:

```js
export const HELI = { takeoffAgl: 120, clearance: 10, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 12, accelNitro: 24, yawRate: 1.2, climb: 15, follow: 2, rotorMargin: 8, landRadius: 150, camDist: 35, camH: 22 };
// rotorMargin covers the model: nose 3.9 m, tail rotor 7.85 m and blades 6 m from the hub (#99). landRadius: F lands only with a road this close (review of #84)
```

(That replaces both the `export const HELI` line and the comment line below it, which today reads „blades 5.5 m, tail boom 7.4 m".)

```js
// keys: KeyboardEvent.code → bool (the game's keys object); touch: the on-screen buttons { l, r, g, b, h }. N (nitro, #99) counts as forward, like gas for the car
export function heliInput(keys, touch) {
  const nitro = held(keys, ['KeyN']) ? 1 : 0;
  return {
    fwd: axis(held(keys, ['KeyW', 'ArrowUp']) || touch.g || nitro, held(keys, ['KeyS', 'ArrowDown']) || touch.b),
    yaw: axis(held(keys, ['KeyD', 'ArrowRight']) || touch.r, held(keys, ['KeyA', 'ArrowLeft']) || touch.l),
    lift: axis(held(keys, ['Space']), held(keys, ['ShiftLeft', 'ShiftRight'])),
    nitro,
  };
}
```

In `stepHeli` replace the two lines computing `target` and `v`:

```js
  const target = input.fwd > 0 ? (input.nitro ? cfg.topNitro : cfg.top) : input.fwd < 0 ? -cfg.back : 0;
  const v = approach(s.v, target, (input.nitro ? cfg.accelNitro : cfg.accel) * dt);
```

Append:

```js
// HUD height (#99): whole metres above the ground under the helicopter, and above sea level when the terrain header's base (m a.s.l. of y = 0) is known
export function heliAltitude(y, ground, base) {
  return { agl: Math.round(y - ground), asl: Number.isFinite(base) ? Math.round(y + base) : null };
}
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (baseline + 2 new tests).

- [ ] **Step 5: Commit.** `git add prototype/heli.js prototype/tests/heli.test.mjs` → `feat(heli): nitro boost and altitude helper in the flight model (#99)`.

---

### Task 2: The gunship model (`buildHeli`) and the model hook

**Files:**
- Create: `prototype/tests/test_heli_extras.py`
- Modify: `prototype/index.html` (the helicopter block; after `window.__mm.fly`)

**Interfaces:**
- `const heli, rotor, tailRotor, heliFlames` groups; `buildHeli(g, rotor, tailRotor, flames)` fills them; `HELI_BOX` = the group's local bounding box, taken once at build time.
- `window.__mm.heliModel()` → `{ meshes, textured, bladeTips, box: { min: [x, y, z], max: [x, y, z] } }`.

- [ ] **Step 1: Write the failing test.** Create `prototype/tests/test_heli_extras.py`:

```python
"""#99 helicopter extras: the gunship look (no weapons, no text), N nitro in flight, the HUD height, B in flight.
Hand-traced layout (world + terrain blocked): no data files, deterministic, no sea-level datum (REAL is null).
The heli camera lerps and a headless renderer draws under 1 fps: every camera check polls arrival. Slow: foreground only."""
import re

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
WAIT = 120000

# camera offset and view direction projected on the heading (same as test_look_back.py)
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
LOOK = "(c => { const th = window.__mm.heading(); return c.look[0] * Math.cos(th) + c.look[2] * Math.sin(th); })(window.__mm.cam())"


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 1280, "height": 720}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.flySim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def fly(page):
    return page.evaluate("() => window.__mm.fly()")


def fly_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.flySim(s, h)", [secs, list(hold)])


def take_off(page):
    page.click("#startbtn")
    page.keyboard.press("KeyF")
    return fly_sim(page, 10)


def test_heli_model_is_a_dark_gunship_inside_the_rotor_margin_without_text(server):
    """Nose, tail rotor and blades stay within HELI.rotorMargin (8 m) so heliFloor covers the whole machine; four blade tips;
    no textured material = no plate, logo or name on the model."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        m = page.evaluate("() => window.__mm.heliModel()")
        take_off(page)
        page.wait_for_function("() => window.__mm.fly().heliVisible", timeout=WAIT)
        b.close()
    assert m["meshes"] >= 20, m
    assert m["textured"] == 0, m
    assert m["bladeTips"] == 4, m
    assert m["box"]["max"][0] <= 8 and m["box"]["min"][0] >= -8 and abs(m["box"]["max"][2]) <= 8 and abs(m["box"]["min"][2]) <= 8, m["box"]
    assert m["box"]["max"][0] > 3.5 and m["box"]["min"][0] < -7.5, m["box"]      # long and low: nose ahead of the canopy, tail rotor far back
    assert m["box"]["max"][1] < 4.0, m["box"]
```

- [ ] **Step 2: Run, watch it fail.** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_heli_extras.py -q` → fails (`__mm.heliModel is not a function`).

- [ ] **Step 3: Implement the model.** Replace the two lines `const heli = new THREE.Group(), rotor = new THREE.Group(); heli.visible = false; scene.add(heli);` and the one-line `{ const body = new THREE.MeshLambertMaterial({ color: 0xffc61a }) … }` block under it (keep the `const FLY` line above, changed in Task 3) with:

```js
const heli = new THREE.Group(), rotor = new THREE.Group(), tailRotor = new THREE.Group(), heliFlames = new THREE.Group(); heli.visible = false; heliFlames.visible = false; scene.add(heli);
// #99: the "fliegendes Auge" look -- a dark, low gunship silhouette with a bubble canopy, stub wings, a long boom, swept fin, tail rotor, four blades, wheels. No weapons, no text, no livery.
// model metres, x forward, y up, z right; everything within HELI.rotorMargin (8 m) of the hub: nose 3.9, tail rotor 7.85, blades 6
const heliMats = { body: new THREE.MeshPhongMaterial({ color: 0x1c2230, shininess: 60, specular: 0x4a5a78 }), glass: carMats.glass, dark: new THREE.MeshLambertMaterial({ color: 0x14171d }) };   // glass is the car's shared dark opaque glass (#123)
function buildHeli(g, rotor, tailRotor, flames) {
  const M = heliMats, box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const shape = (pts) => { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); return s; };
  const bodyG = new THREE.ExtrudeGeometry(shape([[3.9, 1.0], [3.4, 0.55], [2.0, 0.4], [-1.6, 0.45], [-2.2, 0.9], [-2.0, 2.2], [-0.8, 2.5], [1.2, 2.45], [2.6, 1.9], [3.6, 1.35]]), { depth: 2.0, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }); bodyG.translate(0, 0, -1.0); g.add(new THREE.Mesh(bodyG, M.body));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), M.glass); canopy.scale.set(1.9, 0.75, 0.9); canopy.position.set(1.9, 2.05, 0); canopy.userData.glass = true; g.add(canopy);   // the bubble; userData.glass = what __mm.glass() / test_vehicles.py (#123) look for
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), M.glass); eye.position.set(3.1, 0.5, 0); g.add(eye);   // the sensor ball on the nose: an eye, not a gun
  for (const s of [-1, 1]) box(1.2, 0.12, 1.6, M.body, 0.2, 1.2, s * 1.7);   // stub wings, nothing under them
  box(2.4, 0.6, 1.3, M.body, -0.4, 2.75, 0);   // engine cowl
  for (const s of [-1, 1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 10), M.dark); ex.rotation.z = Math.PI / 2; ex.position.set(-1.75, 2.75, s * 0.45); g.add(ex); const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 10), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.85 })); f.rotation.z = Math.PI / 2; f.position.set(-2.3, 2.75, s * 0.45); flames.add(f); }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 5.2, 8), M.body); boom.rotation.z = Math.PI / 2; boom.position.set(-4.6, 1.9, 0); g.add(boom);   // thin end at the tail
  const fin = box(0.9, 1.6, 0.12, M.body, -6.8, 2.6, 0); fin.rotation.z = 0.35;   // swept back
  box(0.5, 0.08, 2.0, M.body, -5.8, 2.0, 0);   // stabiliser
  for (const a of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.16), M.dark); bl.rotation.z = a; tailRotor.add(bl); } tailRotor.position.set(-6.9, 2.2, 0.25); g.add(tailRotor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8), M.dark); mast.position.y = 3.1; g.add(mast); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10), M.dark); hub.position.y = 3.3; g.add(hub);
  for (const a of [0, Math.PI / 2]) { const blade = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.3), M.dark); blade.rotation.y = a; rotor.add(blade); } rotor.position.y = 3.45; g.add(rotor);
  for (const [x, z] of [[2.6, 0], [-0.6, 1.1], [-0.6, -1.1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 12), M.dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.25, z); g.add(w); box(0.08, 0.5, 0.08, M.dark, x, 0.55, z); }
  for (const [z, c] of [[-1.7, 0xe0322d], [1.7, 0x3ddc84]]) box(0.14, 0.1, 0.14, new THREE.MeshBasicMaterial({ color: c }), 0.2, 1.3, z);   // nav lights: red left, green right
  g.add(flames); g.traverse(o => { o.castShadow = true; });
}
buildHeli(heli, rotor, tailRotor, heliFlames);
const HELI_BOX = new THREE.Box3().setFromObject(heli);   // local extents, taken before the group ever moves (the hook reports them)
```

`heli.visible = false` makes `setFromObject` skip nothing — `Box3.setFromObject` reads geometry regardless of visibility. If the box comes back empty (`isEmpty()`), call `heli.updateMatrixWorld(true)` before it.

- [ ] **Step 4: Add the hook.** After `window.__mm.fly = …`:

```js
window.__mm.heliModel = () => { let meshes = 0, textured = 0; heli.traverse(o => { if (o.isMesh) { meshes++; if (o.material.map) textured++; } }); return { meshes, textured, bladeTips: rotor.children.length * 2, box: { min: HELI_BOX.min.toArray(), max: HELI_BOX.max.toArray() } }; };   // #99
```

- [ ] **Step 5: Run, watch it pass.** The same pytest command → 1 passed. Also `node --test prototype/tests/*.test.mjs` still green. Quick sanity (no extra test file): `page.evaluate("() => window.__mm.glass()")` has `heli` non-null, opaque, same colour as `car` — add `assert` for it to the model test if cheap: `g = page.evaluate("() => window.__mm.glass()"); assert g["heli"]["transparent"] is False and g["heli"]["color"] == g["car"]["color"], g`.

- [ ] **Step 6: Commit.** `git add prototype/index.html prototype/tests/test_heli_extras.py` → `feat(heli): dark gunship-style helicopter model with a bubble canopy, no weapons (#99)`.

---

### Task 3: Nitro and the height line in the game

**Files:**
- Modify: `prototype/tests/test_heli_extras.py`
- Modify: `prototype/index.html` (CSS `#best`, `#tr` plate, help line, import, `FLY`, `resetCar`, `stepFly`, `__mm.fly`, `hud`)
- Modify: `prototype/strings.js` (new `altitude` next to `heliNoRoad`, and `keyHeli`, in both languages)

**Interfaces:**
- `FLY = { on, v, alt, nitro }`; `stepFly` sets `FLY.nitro`, `P.nitro`, `heliFlames.visible`, spins `tailRotor`.
- `#alt` in `#tr`; `hud` sets `hidden = !FLY.on` and the text `tr('altitude', agl, asl)`; `agl` uses `skyGroundH` (the same ground `stepFly` flies over, so it is right over the hideout hill too).
- Strings: `altitude: (agl, asl) => …` and the extended `keyHeli`.
- `__mm.fly()` gains `nitro`.

- [ ] **Step 1: Write the failing tests.** Append to `test_heli_extras.py`:

```python
def test_n_boosts_the_helicopter_and_lights_the_flames(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        take_off(page)
        plain = fly_sim(page, 6, ["KeyW"])
        boosted = fly_sim(page, 6, ["KeyW", "KeyN"])
        flames_on = page.evaluate("() => window.__mm.fly().flames")
        alone = fly_sim(page, 3, ["KeyN"])
        released = fly_sim(page, 3, ["KeyW"])
        hover = fly_sim(page, 6)
        b.close()
    assert abs(plain["v"] - 40) < 1e-6 and plain["nitro"] is False, plain
    assert abs(boosted["v"] - 60) < 1e-6 and boosted["nitro"] is True, boosted
    assert flames_on is True
    assert abs(alone["v"] - 60) < 1e-6, alone                       # N alone flies forward
    assert abs(released["v"] - 40) < 1e-6 and released["nitro"] is False, released
    assert hover["v"] == 0 and hover["flames"] is False, hover


def test_height_shows_in_flight_only(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.wait_for_function("() => document.querySelector('#alt').hidden === true", timeout=WAIT)
        page.keyboard.press("KeyF")
        fly_sim(page, 10)
        page.wait_for_function("() => !document.querySelector('#alt').hidden && /\\d+ m/.test(document.querySelector('#alt').textContent)", timeout=WAIT)
        text = page.evaluate("() => document.querySelector('#alt').textContent")
        s = fly(page)
        page.keyboard.press("KeyF")
        page.wait_for_function("() => document.querySelector('#alt').hidden === true", timeout=WAIT)
        b.close()
    shown = int(re.search(r"(\d+) m", text).group(1))
    assert abs(shown - (s["y"] - s["ground"])) <= 1.5, (text, s)    # the HUD lags the sim by at most a frame
    assert "Height" in text and "a.s.l." not in text, text            # hand layout: no sea-level datum


def test_help_lists_nitro_and_look_back_for_the_helicopter(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale="de-CH")
        page.keyboard.press("F1")
        help_text = page.inner_text("#help")
        b.close()
    assert "N Nitro" in help_text and "B schaut zurück" in help_text, help_text
```

- [ ] **Step 2: Run, watch it fail.** The pytest command → the three new tests fail (`#alt` missing, `nitro` undefined, help text).

- [ ] **Step 3: Strings.** In `prototype/strings.js`, `en` — after `heliNoRoad` add, and replace `keyHeli`:

```js
  altitude: (agl, asl) => asl === null ? `Height ${agl} m` : `Height ${agl} m · ${asl} m a.s.l.`,
```

```js
  keyHeli: 'helicopter: take off · land (Space climbs, Shift sinks, N nitro, B looks back)',
```

`de` — after `heliNoRoad`, and `keyHeli`:

```js
  altitude: (agl, asl) => asl === null ? `Höhe ${agl} m` : `Höhe ${agl} m · ${asl} m ü. M.`,
```

```js
  keyHeli: 'Helikopter: abheben · landen (Leertaste steigt, Shift sinkt, N Nitro, B schaut zurück)',
```

`node --test prototype/tests/*.test.mjs` → `strings.test.mjs` green (equal keys, functions of equal arity, no `ß`).

- [ ] **Step 4: Markup, CSS, help copy.** In `index.html`:

After the `#best{…}` rule append on the same line:

```css
#alt{font-size:16px;font-weight:700;color:var(--sun)}#alt[hidden]{display:none}
```

In the `#tr` plate after `<div id="best">Best —</div>`:

```html
    <div id="alt" hidden></div>
```

Static help copy (the `keyHeli` line in `#help`, currently `…(Space climbs, Shift sinks)`):

```html
      <kbd>F</kbd><span data-i18n="keyHeli">helicopter: take off · land (Space climbs, Shift sinks, N nitro, B looks back)</span>
```

Import line (`import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot } from './heli.js';`):

```js
import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot, heliAltitude } from './heli.js';
```

- [ ] **Step 5: State and `stepFly`.** The `const FLY` line:

```js
const FLY = { on: false, v: 0, alt: 0, nitro: false };
```

Replace `stepFly` with (changes vs today: `input` taken once, `FLY.nitro`, `P.nitro`, `tailRotor`, `heliFlames`; `skyGroundH` and everything else as it is):

```js
function stepFly(dt) { const ground = skyGroundH(P.x, P.z), floor = heliFloor(ground, gridQuery(OBB_GRID, P.x, P.z, HELI.rotorMargin + 2), P.x, P.z), input = heliInput(keys, touch); const s = stepHeli({ x: P.x, z: P.z, y: P.y, th: P.th, v: FLY.v, alt: FLY.alt }, input, dt, ground, floor); P.x = s.x; P.z = s.z; P.y = s.y; P.th = s.th; P.vx = Math.cos(s.th) * s.v; P.vz = Math.sin(s.th) * s.v; FLY.v = s.v; FLY.alt = s.alt; FLY.nitro = !!input.nitro; P.nitro = input.nitro; heli.position.set(P.x, P.y, P.z); heli.rotation.set(0, -P.th, 0); rotor.rotation.y += dt * 30; tailRotor.rotation.z += dt * 90; heliFlames.visible = FLY.nitro; blob.visible = false; flames.visible = false; }   // #99: N boosts, flames at the exhausts; P.nitro for #14's rotor
```

`takeOff` and `land` need no change; `land` calls `resetCar`, which starts `function resetCar() { stopAuto('reset'); FLY.on = false;` — add `FLY.nitro = false; heliFlames.visible = false;` right after that `FLY.on = false;`.

Replace the `window.__mm.fly = …` hook:

```js
window.__mm.fly = () => ({ on: FLY.on, x: P.x, y: P.y, z: P.z, th: P.th, v: FLY.v, alt: FLY.alt, nitro: FLY.nitro, flames: heliFlames.visible, ground: groundH(P.x, P.z, 1e4), heliVisible: heli.visible, carVisible: car.visible });
```

- [ ] **Step 6: HUD.** In `function hud(dt)`, directly before its `fadeToast(dt);` insert (`skyGroundH`, like `stepFly`):

```js
$('alt').hidden = !FLY.on; if (FLY.on) { const a = heliAltitude(P.y, skyGroundH(P.x, P.z), REAL ? REAL.hdr.base : null); $('alt').textContent = tr('altitude', a.agl, a.asl); }
```

`REAL.hdr` is the parsed MMH JSON header (`parseMMH` returns it unfiltered) and the shipped `data/terrain_hochrhein.mmh` has `base: 284`, so nothing else is needed; without terrain (`REAL === null`) `asl` is `null` and the line shows only the height.

- [ ] **Step 7: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` green; the pytest command → 4 passed.

- [ ] **Step 8: Commit.** `git add prototype/index.html prototype/strings.js prototype/tests/test_heli_extras.py` → `feat(heli): N nitro in flight and the height line in the HUD (#99)`.

---

### Task 4: B looks back in flight

**Files:**
- Modify: `prototype/tests/test_heli_extras.py`
- Modify: `prototype/index.html` (`flyCamera`, the `flyCamera(dt)` call in `stepCamera`)

**Interfaces:** `flyCamera(dt, s, snap)` — `s` ±1 (from #65), `snap` true on a change of the look-back state.

- [ ] **Step 1: Write the failing test.** Append:

```python
def test_hold_b_looks_back_in_flight(server):
    """#65 in the helicopter: holding B swings the heli camera round in front of the helicopter, looking back past it."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        take_off(page)
        page.wait_for_function(f"() => window.__mm.fly().on && {AHEAD} < -30 && {LOOK} > 0.5", timeout=WAIT)   # arrived behind, looking ahead
        page.keyboard.down("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === true && {AHEAD} > 30", timeout=WAIT)       # in front
        held = page.evaluate(f"() => ({{ ahead: {AHEAD}, look: {LOOK}, up: window.__mm.cam().d[1], heli: window.__mm.fly().heliVisible }})")
        page.keyboard.up("KeyB")
        page.wait_for_function(f"() => window.__mm.cam().back === false && {AHEAD} < -30", timeout=WAIT)
        released = page.evaluate(f"() => {LOOK}")
        b.close()
    assert held["look"] < -0.5 and held["heli"] is True, held
    assert abs(held["up"] - 22) < 3, held                     # same height as the normal heli camera
    assert released > 0.5, released
```

- [ ] **Step 2: Run, watch it fail.** The pytest command → the new test times out at `AHEAD > 30` (the heli camera ignores B).

- [ ] **Step 3: Implement.** Replace `function flyCamera(dt)` (the comment line above it, `// #10: one heli chase cam…`, is replaced by the one below):

```js
// #10: one heli chase cam, behind and above, looking ahead and down; C does nothing while flying. #99: B (s = -1) puts it in front, looking back; snap on change like the chase cam
function flyCamera(dt, s = 1, snap = false) { const fx = Math.cos(P.th) * s, fz = Math.sin(P.th) * s; const target = new THREE.Vector3(P.x - fx * HELI.camDist, P.y + HELI.camH, P.z - fz * HELI.camDist); target.y = Math.max(target.y, groundH(target.x, target.z, 1e4) + 5); if (snap) camPos.copy(target); else camPos.lerp(target, 1 - Math.exp(-3 * dt)); camera.position.copy(camPos); camera.lookAt(P.x + fx * 20, P.y - 8, P.z + fz * 20); }
```

In `stepCamera` change the call `if (FLY.on) flyCamera(dt); else if (v.eye) …` to `if (FLY.on) flyCamera(dt, s, snap); else if (v.eye) …` — nothing else on that line changes (`back`, `snap`, `s` are already computed two lines above, and `CAM.back` already requires `$('overlay').hidden`).

- [ ] **Step 4: Run, watch it pass.** The pytest command → 5 passed.

- [ ] **Step 5: Commit.** `git add prototype/index.html prototype/tests/test_heli_extras.py` → `feat(heli): B looks back from the helicopter camera (#99)`.

---

### Task 5: Subtle rotor, nitro blade rate (`sound.js`)

**Files:**
- Modify: `prototype/sound.js`, `prototype/tests/sound.test.mjs`

`sound.js` (#14) is on `main`: `ROTOR = { rate: 5.5, ratePerKmh: 0.012, gain: 1.2, cutoff: 260 }` and `rotorMix(input)`; `SFX.update` already calls `rotorMix(input)` with `input = { kmh, gas, nitro: P.nitro, air, fly: FLY.on }`, so Task 3's `P.nitro` is all the wiring needed. No change in `index.html`.

- [ ] **Step 1: Write the failing test.** In `prototype/tests/sound.test.mjs` (it imports `ROTOR`, `rotorMix` and defines `IN(o)` already) append:

```js
test('ROTOR: subtle, and nitro speeds up the blade thump -- #99', () => {
  assert.equal(ROTOR.gain, 0.5);
  assert.equal(ROTOR.nitroRate, 1.5);
  const plain = rotorMix(IN({ kmh: 100, fly: true })), boosted = rotorMix(IN({ kmh: 100, fly: true, nitro: 1 }));
  assert.ok(Math.abs(boosted.rate - plain.rate - ROTOR.nitroRate) < 1e-9);
  assert.equal(rotorMix(IN({ kmh: 100, nitro: 1 })).gain, 0);   // nitro on the ground: no rotor
});
```

The existing test `engineMix + rotorMix: flying mutes the engine…` compares to `ROTOR.gain` symbolically and stays green; do not edit it.

- [ ] **Step 2: Run, watch it fail.** `node --test prototype/tests/*.test.mjs` → the new test fails (`gain` is 1.2, `nitroRate` undefined).

- [ ] **Step 3: Implement** in `prototype/sound.js`:

```js
export const ROTOR = { rate: 5.5, ratePerKmh: 0.012, nitroRate: 1.5, gain: 0.5, cutoff: 260 };   // #10 helicopter: blade thump (Hz), lowpassed noise; #99: subtle, faster under nitro
```

```js
export function rotorMix(input) { return input.fly ? { rate: ROTOR.rate + ROTOR.ratePerKmh * input.kmh + (input.nitro ? ROTOR.nitroRate : 0), gain: ROTOR.gain, cutoff: ROTOR.cutoff } : { rate: ROTOR.rate, gain: 0, cutoff: ROTOR.cutoff }; }
```

(Each replaces the existing one-line `export const ROTOR` / `export function rotorMix`.)

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` green. `test_sound.py` (its offline render wants `rotor.rms > 0.02` at the rotor's gain) is **not** run here; the ~0.04 rms margin at 1.2 shrinks at 0.5, so state this in the PR body for CI: „`ROTOR.gain` 1.2 → 0.5; `test_sound.py::…rotor rms > 0.02` is the CI check; if it fails, raise `ROTOR.gain` in steps of 0.05\". Do not run it locally.

- [ ] **Step 5: Commit.** `git add prototype/sound.js prototype/tests/sound.test.mjs` → `feat(sound): subtle rotor, faster thump under nitro (#99)`.

---

### Task 6: Screenshot for the human

**Files:**
- Create: `docs/ai-notes/screenshots/2026-10-03-heli-look.png`

- [ ] **Step 1: Push the branch first** (`git push -u origin <branch>`), then run this once in the **foreground** from `pipeline/` (same `systemd-run` prefix, `./.venv/bin/python - <<'EOF' … EOF`), with `SERVER` a local `python3 -m http.server` on the repo root started beforehand on a free port:

```python
import os
from playwright.sync_api import sync_playwright

SERVER = os.environ["SERVER"]
AHEAD = "(c => { const th = window.__mm.heading(); return c.d[0] * Math.cos(th) + c.d[2] * Math.sin(th); })(window.__mm.cam())"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{SERVER}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.flySim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn"); page.keyboard.press("KeyF")
    page.evaluate("() => window.__mm.flySim(10, [])")
    page.evaluate("() => window.__mm.flySim(2, ['KeyW', 'KeyN'])")          # flames on, rotor turned a little
    page.wait_for_function(f"() => window.__mm.fly().heliVisible && {AHEAD} < -34", timeout=120000)   # camera arrived
    page.screenshot(path="../docs/ai-notes/screenshots/2026-10-03-heli-look.png")
    b.close()
```

- [ ] **Step 2: Look at it yourself** (Read the PNG; if you cannot view images, skip the judgement, keep the file and say so in the PR body): a dark helicopter with a glass bubble nose, stub wings, long boom, tail rotor, four blades, blue flames at the exhausts, the HUD „Height … m" top right, no text on the model. If a part is obviously wrong (floating, inside out, a blade through the boom), fix the number in `buildHeli` and reshoot. Keep the file under 400 KB (`ls -l`); if larger, `page.screenshot(..., type="jpeg", quality=80)` with a `.jpg` name and use that name below.

- [ ] **Step 3: Commit.** `git add docs/ai-notes/screenshots/2026-10-03-heli-look.png` → `docs(heli): screenshot of the new helicopter look for review (#99)`. Link it in the PR body with a one-line ask: „Does it read as the sleek dark gunship with a bubble canopy? Any part to retune?"

---

### Task 7: Changelog and playtest notes

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`, new first entry)
- Modify: `test-todo.md` (new section after „## Helicopter mode (#10)")

- [ ] **Step 1: CHANGELOG** — one player-facing entry, formatted like its neighbours: `- \`YYYY-MM-DD HH:MM\` text` with the Swiss local time of the commit (`TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`), placed as the **first** bullet under `## [Unreleased]` → `### Added`:

```markdown
- `2026-10-11 18:00` The helicopter got an upgrade: it now looks like a sleek, dark gunship with a glass bubble nose (no weapons, promise). Hold **N** in the air for nitro — blue flames and 216 km/h. The top-right plate shows your height above the ground and, in the real Hochrhein, above sea level. Hold **B** to look back over the tail. The rotor sounds quieter now and beats faster under nitro.
```

- [ ] **Step 2: test-todo** — a new section:

```markdown
## Helicopter extras (#99)

- [ ] **Look:** F in a run — the helicopter is a dark, low gunship with a big glass bubble nose, stub wings without pods, a long boom with a swept fin and a tail rotor, four blades, wheels. Does it read as „Das fliegende Auge" without being a copy? Nothing that looks like a weapon? Screenshot: `docs/ai-notes/screenshots/2026-10-03-heli-look.png`.
- [ ] **Nitro:** W + N in the air — clearly faster (216 km/h on the dial), blue flames at the exhausts; letting go of N slows back to 144 km/h. N alone also flies forward.
- [ ] **Height:** the top-right plate shows „Height … m · … m a.s.l." (German „Höhe … m · … m ü. M.") in the real world; over Sisseln about 120 m above ground and ~400 m a.s.l. at take-off. Hidden on the ground.
- [ ] **B:** holding B in flight swings the camera round in front of the helicopter, looking back; letting go returns it without swinging through the machine.
- [ ] **Rotor sound:** in flight a quiet thump, not the car's engine; a little faster with N. Loud enough to notice, quiet enough to leave on? (`ROTOR.gain` 0.5 is the tuning knob.)
- [ ] **Pause** (Esc / P) in flight freezes the height, the flames and the camera; **Tab** and the minimap still follow the helicopter.
```

- [ ] **Step 3: Commit.** `git add CHANGELOG.md test-todo.md` → `docs(heli): changelog and playtest notes for the helicopter extras (#99)`.

---

### Task 8: Final check (targeted, not the full suite)

- [ ] **Step 1:** `node --test prototype/tests/*.test.mjs` → all green.
- [ ] **Step 2 (foreground, the `systemd-run` prefix):** `-m pytest ../prototype/tests/test_heli_extras.py -q` → 5 passed. That is the only Playwright run; `test_heli.py`, `test_look_back.py`, `test_vehicles.py` (shared glass) and `test_sound.py` run in CI, not here.
- [ ] **Step 3:** Push; open the PR with the screenshot, the AC points mapped to the tests, and the Task 5 note (`ROTOR.gain` 0.5 and the `test_sound.py` caveat).

## Done when

- `node --test` green; `test_heli_extras.py` (5 tests) green; `test_heli.py`, `test_look_back.py`, `test_vehicles.py` untouched (CI).
- The helicopter is the dark gunship model inside the 8 m margin, with no textured material; the screenshot is committed and linked.
- N boosts to 60 m/s with flames; `#alt` shows the height in flight only, in both languages; B flips the heli camera.
- Rotor: `ROTOR.gain 0.5` + `ROTOR.nitroRate` in `sound.js`; `P.nitro` is set in flight.
- `CHANGELOG.md` and `test-todo.md` updated.
