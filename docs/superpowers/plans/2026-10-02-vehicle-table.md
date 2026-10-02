# Vehicle Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded car in `prototype/index.html` with a `VEHICLES` table (one entry, `compact` = today's car, bit-for-bit identical) and an active vehicle `VEH` that physics, collision, cameras, sound and HUD read from.

**Architecture:** A data object `VEHICLES` next to the car mesh; today's mesh code moves into a builder `buildCompact` registered in `MODELS`; `buildCar()` (re)builds the persistent `car` group from `VEH`; `setVehicle(def)` validates and swaps. A golden-trace Playwright test recorded on unchanged code guards the refactor; table-proof tests change a copy of `compact` via test hooks and observe the effect.

**Tech Stack:** Vanilla JS + three.js in one buildless file (`prototype/index.html`); Playwright smoke tests with pytest (`prototype/tests/`).

**Spec:** `docs/superpowers/specs/2026-10-02-vehicle-table-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Small, surgical edits in the dense one-line style of `prototype/index.html` (long single-line statements, short `//` comments); match the surrounding style, do not reformat neighbouring code.
- No new files except the test file `prototype/tests/test_vehicles.py`. No framework, no bundler, no `package.json`, no build step.
- The active vehicle is called **`VEH`**, not `V`: `V` already exists (`const V = (px, py) => …`, ~L202, the Sisseln screenshot → world converter). Do not rename or touch `V`.
- `compact` values, exactly: `scale 1.3`, `wheels [[1.38, 0.86], [-1.38, 0.86]]`, `wheelR 0.34`, `gltf null`; `drive { top 60, topNitro 90, accel 16, accelNitro 34, brake 24, reverse 8, reverseMax 14, grip 9, gripHandbrake 1.8, steerRate 2.6, airSteer 0.4 }`; `mass 1.0`; `collision { shape 'circle', r 1.3 }`; `camera { chase { dist 9, h 3.4 }, near { dist 6, h 2.4 }, cockpit { eye [-0.25, 1.22, -0.38] }, bumper { eye [2.35, 0.55, 0] } }`; `sound { horn [420, 528], hornDur 0.45, engineBase 55, enginePerRpm 150, gears [0, 20, 45, 75, 110, 150, 999] }`.
- World constants stay literals in `stepCar`: gravity (22, 9.81), drag 0.12 and 0.6, water drag 0.9, slope sampling, the 0.3 m/s stop threshold, the steering speed curve (`speed / 6`, `speed / 30`), handbrake extra yaw 1.2.
- `mass` is used **only** in `collide`: speed-loss fraction and damage gain divided by `VEH.mass`.
- Any `collision.shape` other than `'circle'` throws an `Error` whose message contains `#6`. No OBB, no glTF loading, no wheel animation, no picker (#7).
- No player-visible change. **No `CHANGELOG.md` entry** — the changelog is player-facing and nothing changes for players.
- All existing tests in `prototype/tests/test_smoke.py` stay unchanged and green.
- Test command (slow, several minutes; run in the **foreground**, never in the background): `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`. Single file: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`.
- Commit after every task with Conventional Commits, explicit paths only (`git add <paths>`), ending with the repo's attribution lines. Commit and push the branch **before** long verification runs.

## Review Focus

- `setVehicle` during a race in an inside camera view: the rebuilt car must stay hidden in cockpit/bumper view, and flames and blinkers must keep working (the `flames`/`BLINK` groups are persistent and refilled, never replaced). Test: Task 5 asserts `hud().carVisible === false` after a swap in cockpit view.
- A rejected `setVehicle` (unknown model, OBB) must leave the active vehicle untouched — validation runs before anything is swapped or cleared. Test: Task 2.
- `window.__mm.vehicles()` must return a deep copy: a test that edits its copy must not change `VEHICLES.compact`. Test: Task 3 asserts `vehicles().compact.drive.top === 60` after the swap.
- The golden trace must not click Start: once the race runs, the RAF loop also calls `stepCar` and the trace is no longer the hook's alone. All golden calls run on the menu screen.
- Rebuilding the car repeatedly must not leak GPU geometry: `buildCar` disposes the old geometries before clearing. Not unit-tested; check in review.

---

## File map

- Modify `prototype/index.html`:
  - car section (~L739-762): `CAR_SCALE`, `car`, `flames`, `BLINK`, `carMats`, mesh block, `blob` → `VEHICLES`, `VEH`, `buildCompact`, `MODELS`, `buildCar`, `checkVehicle`, `setVehicle`.
  - `SFX` (~L786-802): `update` and `horn` read `VEH.sound`.
  - test hooks (~L815-833): new `vehicles`, `vehicle`, `setVehicle`, `cam`.
  - `collide` (~L836), `stepCar` (~L837-852): read `VEH`.
  - camera (~L854-866): `CAM_VIEWS` keeps names/order, values come from `VEH.camera`.
  - `hud()` (~L898): gear table from `VEH.sound.gears`.
- Create `prototype/tests/test_vehicles.py`: golden trace + table proofs.

Line numbers are from `main` at `6d29cb8`; verify with `grep -n` before editing.

---

### Task 1: Golden trace of today's car (before any refactor)

**Files:**
- Create: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: existing hooks `window.__mm.sim(x, z, th, v, secs, hold = ['KeyW'])` → `{ x, z, y, speed, bridge }` (fixed 1/60 s steps, keys held), fixture `server` from `prototype/tests/conftest.py`.
- Produces: `open_hand(p, server) -> (browser, page)`, `use_vehicle(page, patch_js)`, constants `GOLDEN_JS`, `GOLDEN` — reused by later tasks in the same file.

The hand-traced layout (world and terrain files blocked) needs no data files and is deterministic (seeded RNG). Start point = hand `START` (1882.9, -292.2, heading π). Smile-Kreisel centre = `W(1435, 450)` = (1206.5, -127), island radius 9.5.

- [ ] **Step 1: Write the test file** with the golden numbers captured on `main` @ `6d29cb8`:

```python
"""#5 vehicle table: a golden trace of today's car (must never change) and proof that the table is really read.
Hand-traced layout (world + terrain blocked): no data files needed, seeded RNG, deterministic. Never click Start
before a golden call: once the race runs, the game loop steps the car too."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# hand START = (1882.9, -292.2), heading pi; Smile-Kreisel = W(1435, 450) = (1206.5, -127), island radius 9.5
GOLDEN_JS = """() => { const m = window.__mm, X = 1882.9, Z = -292.2, TH = Math.PI, KX = 1206.5, KZ = -127, pick = r => [r.x, r.z, r.speed];
  return { gas: pick(m.sim(X, Z, TH, 0, 4)), nitro: pick(m.sim(X, Z, TH, 0, 4, ['KeyW', 'KeyN'])), turn: pick(m.sim(X, Z, TH, 15, 2, ['KeyW', 'KeyA'])),
    handbrake: pick(m.sim(X, Z, TH, 15, 2, ['KeyW', 'KeyD', 'ControlLeft'])), coast: pick(m.sim(X, Z, TH, 20, 3, [])),
    brakeReverse: pick(m.sim(X, Z, TH, 10, 4, ['KeyS'])), kreisel: pick(m.sim(KX + 30, KZ, Math.PI, 12, 4)) }; }"""

# [x, z, speed] recorded on main @ 6d29cb8 (unchanged code) -- the refactor must reproduce them to 1e-6
GOLDEN = {
    "gas": [1803.968653733491, -292.2, 31.468025543467167],
    "nitro": [1746.6700469774994, -290.3246922497351, 41.015723512960825],
    "turn": [1882.5171647865836, -267.454153955126, 21.604638849512714],
    "handbrake": [1873.6407168218582, -300.736676160143, 5.796862538598718],
    "coast": [1834.6722120583554, -292.2, 12.614475983585198],
    "brakeReverse": [1916.5585419172364, -292.2, 13.990973001690463],
    "kreisel": [1219.3204826373772, -127, 0.23503098219921587],
}


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 320, "height": 180})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def use_vehicle(page, patch_js):
    """Activate a modified copy of compact; patch_js edits `c`, e.g. "c.drive.top = 30"."""
    page.evaluate(f"() => {{ const c = window.__mm.vehicles().compact; {patch_js}; window.__mm.setVehicle(c); }}")


def test_golden_trace_of_the_compact_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate(GOLDEN_JS)
        b.close()
    for k, want in GOLDEN.items():
        assert got[k] == pytest.approx(want, abs=1e-6), (k, got[k], want)
```

- [ ] **Step 2: Run it on the unchanged code — it must PASS.**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`
Expected: `1 passed`.

If it fails, `main` changed the physics or the hand layout after `6d29cb8`: recapture on the **unchanged** code and replace the `GOLDEN` numbers with the printed ones (full precision), then rerun:

```bash
cd pipeline && ./.venv/bin/python - <<'EOF'
import http.server, json, sys, threading
from functools import partial
from pathlib import Path
sys.path.insert(0, "../prototype/tests")
from playwright.sync_api import sync_playwright
from test_vehicles import GOLDEN_JS, open_hand
httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(http.server.SimpleHTTPRequestHandler, directory=str(Path("..").resolve())))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b, page = open_hand(p, f"http://127.0.0.1:{httpd.server_address[1]}")
    print(json.dumps(page.evaluate(GOLDEN_JS), indent=1)); b.close()
EOF
```

Run the capture twice; both outputs must be identical (determinism check).

- [ ] **Step 3: Watch it fail (mutation check).** In `stepCar` change `const top = nitro ? 90 : 60;` to `const top = nitro ? 90 : 61;`, rerun the single file → expected FAIL on `gas`. Revert with `git checkout -- prototype/index.html` and rerun → PASS.

- [ ] **Step 4: Commit**

```bash
git add prototype/tests/test_vehicles.py
git commit -m "test(vehicles): golden trace of the compact car before the vehicle table (#5)"
```

---

### Task 2: `VEHICLES` table, car builder, `setVehicle` and hooks

**Files:**
- Modify: `prototype/index.html` (car section ~L739-762, `stepCar` L848, `stepCamera` L864, test hooks after L833)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `VEHICLES`, `let VEH`, `MODELS = { compact: buildCompact }`, `buildCompact(g, v)`, `buildCar()`, `checkVehicle(def)` (throws), `setVehicle(def)`; hooks `window.__mm.vehicles()` (deep copy of `VEHICLES`), `window.__mm.vehicle()` (deep copy of `VEH`), `window.__mm.setVehicle(def)`.

- [ ] **Step 1: Write the failing tests** (append to `test_vehicles.py`):

```python
def test_set_vehicle_validates_and_round_trips(server):
    """Unknown model and non-circle collision throw (OBB is #6) and leave the active vehicle alone; a plain copy of
    compact drives exactly like the golden trace."""
    bad = """(patch) => { const c = window.__mm.vehicles().compact; c.drive.top = 30; patch(c);
      try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return e.message; } }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        obb = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'obb', hw: 1.2, hd: 6 }}; }})")
        model = page.evaluate(f"() => ({bad})(c => {{ c.model = 'bus'; }})")
        top = page.evaluate("() => window.__mm.vehicle().drive.top")
        use_vehicle(page, "")
        got = page.evaluate(GOLDEN_JS)
        b.close()
    assert "#6" in obb and "obb" in obb, obb
    assert "bus" in model, model
    assert top == 60
    for k, want in GOLDEN.items():
        assert got[k] == pytest.approx(want, abs=1e-6), (k, got[k], want)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k round_trips`
Expected: FAIL — `window.__mm.vehicles is not a function`.

- [ ] **Step 3: Implement.** Replace the car section from `// ---------- the car: navy compact hatchback ----------` (~L739) through the `blob` line (~L762) with the following. The mesh lines inside `buildCompact` are today's lines 747-759 **moved verbatim**, with exactly three changes: every `car.add(` becomes `g.add(`; the blinker block (from today's L744) moves in as the first line; the wheel loop (today's L755) is replaced by the version shown. The `car.traverse(… castShadow …)` line (L760) moves into `buildCar`.

```js
// ---------- vehicles (#5): one entry per vehicle, physical units (m, m/s, m/s², rad/s, Hz, km/h); compact = the original car ----------
// model: builder id in MODELS (gltf: reserved for a glTF file, not loaded yet); wheels: [x, z] in model metres, each mirrored to ±z
// mass: only the crash response (speed loss and damage / mass); collision: circle radius in model metres (OBB for long vehicles: #6)
// camera: chase distances in world metres, cockpit/bumper eyes in model metres (x forward, y up, side + = right), scaled with the car
const VEHICLES = {
  compact: { model: 'compact', gltf: null, scale: 1.3, wheels: [[1.38, 0.86], [-1.38, 0.86]], wheelR: 0.34,
    drive: { top: 60, topNitro: 90, accel: 16, accelNitro: 34, brake: 24, reverse: 8, reverseMax: 14, grip: 9, gripHandbrake: 1.8, steerRate: 2.6, airSteer: 0.4 },
    mass: 1.0, collision: { shape: 'circle', r: 1.3 },
    camera: { chase: { dist: 9, h: 3.4 }, near: { dist: 6, h: 2.4 }, cockpit: { eye: [-0.25, 1.22, -0.38] }, bumper: { eye: [2.35, 0.55, 0] } },
    sound: { horn: [420, 528], hornDur: 0.45, engineBase: 55, enginePerRpm: 150, gears: [0, 20, 45, 75, 110, 150, 999] } },
};
let VEH = VEHICLES.compact;   // the active vehicle: physics, collision, cameras, sound and HUD read it; swap with setVehicle

// ---------- the car: navy compact hatchback ----------
// arcade scale: the model is true to size (4.5 m, like a Mazda 3), but next to real-size houses and a wide chase cam it read like a toy car (compact.scale 1.3)
const car = new THREE.Group(); scene.add(car);
const flames = new THREE.Group(); flames.visible = false;
const BLINK = { left: new THREE.Group(), right: new THREE.Group() }; BLINK.left.visible = BLINK.right.visible = false;
const carMats = { /* unchanged: today's L745 object literal */ };
function buildCompact(g, v) {
  { const m = new THREE.MeshBasicMaterial({ color: 0xff9a1a }); for (const [side, z] of [['left', -0.86], ['right', 0.86]]) for (const x of [2.18, -2.22]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), m); b.position.set(x, 0.62, z); BLINK[side].add(b); } }
  // … today's L747-754 verbatim (shape, bodyS, bodyG, glassS, glassG, sill, nitro comment + flames loop), car.add( → g.add( …
  for (const [x, z] of v.wheels) for (const s of [1, -1]) { const w = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(v.wheelR, v.wheelR, 0.24, 16), carMats.tyre); t.rotation.x = Math.PI / 2; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 10), carMats.rim); r.rotation.x = Math.PI / 2; const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), carMats.dark); hub.rotation.x = Math.PI / 2; w.add(t, r, hub); w.position.set(x, v.wheelR, s * z); g.add(w); }
  // … today's L756-759 verbatim (lights, mirrors, grille, plate), car.add( → g.add( …
}
const MODELS = { compact: buildCompact };
const blob = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
// (re)build the car group from VEH; flames and blinkers are persistent groups (other code toggles them), refilled by the builder
function buildCar() { car.traverse(o => o.geometry?.dispose()); for (const grp of [car, flames, BLINK.left, BLINK.right]) grp.clear(); car.scale.setScalar(VEH.scale); car.add(flames, BLINK.left, BLINK.right); MODELS[VEH.model](car, VEH); car.traverse(o => { o.castShadow = true; }); blob.scale.set(VEH.scale, 0.55 * VEH.scale, 1); }
// fail fast, before anything is swapped: only procedural builders and circle collision exist so far
function checkVehicle(def) { if (!MODELS[def.model]) throw new Error(`Unknown vehicle model '${def.model}' (glTF loading is not implemented yet)`); if (def.collision.shape !== 'circle') throw new Error(`Vehicle collision shape '${def.collision.shape}' is not supported yet, only 'circle' (OBB for long vehicles: #6)`); }
function setVehicle(def) { checkVehicle(def); VEH = def; buildCar(); }
setVehicle(VEH);
```

Notes: the four wheels come out in today's order ((1.38, ±0.86), then (-1.38, ±0.86)). The blob keeps its geometry; its scale moves into `buildCar`.

Then replace the two remaining `CAR_SCALE` uses (Tasks 4 and 5 replace them again):
- `stepCar` ~L848: `collide(1.3 * CAR_SCALE);` → `collide(1.3 * VEH.scale);`
- `stepCamera` ~L864: `v.eye.map(k => k * CAR_SCALE)` → `v.eye.map(k => k * VEH.scale)`

Add the hooks after `window.__mm.car = …` (~L833):

```js
// vehicle table (#5): tests activate a modified copy of compact and watch the game change
window.__mm.vehicles = () => structuredClone(VEHICLES);
window.__mm.vehicle = () => structuredClone(VEH);
window.__mm.setVehicle = (def) => { setVehicle(def); };
```

Verify `grep -n CAR_SCALE prototype/index.html` prints nothing.

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`
Expected: `2 passed` (golden still green).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py
git commit -m "refactor(vehicles): build the car from a vehicle table entry (#5)"
```

---

### Task 3: Driving values from the table

**Files:**
- Modify: `prototype/index.html` (`stepCar`, ~L842)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `VEH.drive`, hooks from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```python
def test_table_top_speed_is_used(server):
    """top 30 instead of 60: the same 4 s on the gas end clearly slower (flat-road estimate 21.9 m/s, compact 31.47)."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        fast = page.evaluate(gas)
        use_vehicle(page, "c.drive.top = 30")
        slow = page.evaluate(gas)
        table_top = page.evaluate("() => window.__mm.vehicles().compact.drive.top")
        b.close()
    assert fast == pytest.approx(GOLDEN["gas"][2], abs=1e-6)
    assert 18 < slow < 24, slow
    assert table_top == 60          # the hook hands out a copy; the table itself is untouched
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k top_speed`
Expected: FAIL — `assert 18 < 31.468… < 24`.

- [ ] **Step 3: Implement.** In `stepCar`, replace the `if (!air) { … } else { … }` line (~L842) with (same expressions, same operand order — keep it that way so the floats stay identical):

```js
  const D = VEH.drive;
  if (!air) { const top = nitro ? D.topNitro : D.top; if (gas) vf += (nitro ? D.accelNitro : D.accel) * (1 - Math.max(0, vf) / top) * dt; if (brake) { if (vf > 0.5) vf -= D.brake * dt; else vf -= D.reverse * dt * (vf > -D.reverseMax ? 1 : 0); } vf -= vf * 0.12 * dt + Math.sign(vf) * 0.6 * dt; const sl = (groundH(P.x + fx * 3, P.z + fz * 3, P.y) - groundH(P.x - fx * 3, P.z - fz * 3, P.y)) / 6; vf -= 9.81 * sl / Math.sqrt(1 + sl * sl) * dt; if (Math.abs(vf) < 0.3 && !gas && !brake) vf = 0; const grip = hb ? D.gripHandbrake : D.grip; vs *= Math.exp(-grip * dt); const sf = clamp(speed / 6, 0, 1) * (1 / (1 + speed / 30)); P.th += steer * D.steerRate * sf * dt * (vf < 0 ? -1 : 1) + (hb ? steer * 1.2 * clamp(speed / 20, 0, 1) * dt : 0); } else { P.th += steer * D.airSteer * dt; }
```

(Mutation check, Task 1 Step 3, now applies to `D.top`; the `top = 61` edit no longer exists.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py
git commit -m "refactor(vehicles): read the driving values from the vehicle table (#5)"
```

---

### Task 4: Collision radius and mass from the table

**Files:**
- Modify: `prototype/index.html` (`collide` ~L836, its call in `stepCar` ~L848, a helper next to `setVehicle`)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `VEH.collision`, `VEH.scale`, `VEH.mass`.
- Produces: `carRadius()` → number (world metres).

- [ ] **Step 1: Write the failing tests**

```python
def test_table_collision_radius_scales(server):
    """A standing car 11.8 m from the island centre (island 9.5): compact (radius 1.69) is free; at scale 2
    (radius 2.6) it is pushed out to 12.1 m."""
    stand = "() => { const r = window.__mm.sim(1218.3, -127, Math.PI / 2, 0, 0.1, []); return Math.hypot(r.x - 1206.5, r.z + 127); }"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        small = page.evaluate(stand)
        use_vehicle(page, "c.scale = 2")
        big = page.evaluate(stand)
        b.close()
    assert small == pytest.approx(11.8, abs=0.01), small
    assert big == pytest.approx(12.1, abs=0.01), big


def test_table_mass_softens_the_crash(server):
    """Coasting head-on into the island at 15 m/s: the heavier car keeps clearly more speed after the hit."""
    crash = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, []).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        light = page.evaluate(crash)
        use_vehicle(page, "c.mass = 2")
        heavy = page.evaluate(crash)
        b.close()
    assert light == pytest.approx(2.074, abs=0.005), light      # recorded on main @ 6d29cb8
    assert heavy > light * 1.15, (light, heavy)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k "radius or mass"`
Expected: radius test PASSES already (Task 2 wired `1.3 * VEH.scale`) — that is fine, it pins the behaviour; mass test FAILS (`heavy == light`). To see the radius test fail too, temporarily put back `collide(1.3 * 1.3)` and rerun, then continue.

- [ ] **Step 3: Implement.** Next to `setVehicle` add:

```js
const carRadius = () => VEH.collision.r * VEH.scale;   // circle only (checkVehicle); OBB: #6
```

In `stepCar` ~L848: `collide(1.3 * VEH.scale);` → `collide(carRadius());`

In `collide` (~L836), change only the speed-loss and damage terms, and the comment above it:

```js
// speed lost on a hit scales with the impact: a hard hit halves it, scraping along a wall or bridge rail barely slows; a heavier vehicle (VEH.mass) loses less and takes less damage
```
- `const keep = 1 - Math.min(0.5, -vn * 0.025);` → `const keep = 1 - Math.min(0.5, -vn * 0.025 / VEH.mass);`
- `P.dmg = Math.min(1, P.dmg + Math.min(0.12, -vn * 0.004));` → `P.dmg = Math.min(1, P.dmg + Math.min(0.12, -vn * 0.004 / VEH.mass));`

The bounce (`P.vx -= wx * vn * 1.25 …`) and the crash sound stay as they are.

- [ ] **Step 4: Run to verify they pass**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`
Expected: `5 passed` (golden unchanged: division by 1.0 is exact).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py
git commit -m "refactor(vehicles): collision radius and crash mass from the vehicle table (#5)"
```

---

### Task 5: Camera offsets from the table

**Files:**
- Modify: `prototype/index.html` (`CAM_VIEWS` ~L856-859, `stepCamera` ~L862-865, test hooks)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `VEH.camera`, `VEH.scale`.
- Produces: `CAM_VIEWS` entries `{ n, k, eye? }` (`k` = key into `VEH.camera`, `eye: true` for inside views — other code tests `CAM_VIEWS[camView].eye` for truthiness, keep that); `vehEye(k)` → `[x, y, side]` in world metres; hook `window.__mm.cam()` → `{ view, d: [dx, dy, dz] }` (camera position minus car position).

- [ ] **Step 1: Write the failing test, then add only the hook.**

```python
def test_table_cockpit_eye_is_used(server):
    """Cockpit view, car at START heading pi (forward = -x, right = -z): the camera sits at the scaled eye.
    compact eye (-0.25, 1.22, -0.38) * 1.3; a moved eye (0.5, 1.5, -0.38) * 1.3. The swap mid-race keeps the car hidden."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        page.keyboard.press("KeyC"); page.keyboard.press("KeyC"); page.wait_for_timeout(400)
        before = page.evaluate("() => window.__mm.cam()")
        use_vehicle(page, "c.camera.cockpit.eye = [0.5, 1.5, -0.38]"); page.wait_for_timeout(400)
        after = page.evaluate("() => window.__mm.cam()")
        visible = page.evaluate("() => window.__mm.hud().carVisible")
        b.close()
    assert before["view"] == 2 and after["view"] == 2
    assert before["d"] == pytest.approx([0.325, 1.586, 0.494], abs=1e-3), before
    assert after["d"] == pytest.approx([-0.65, 1.95, 0.494], abs=1e-3), after
    assert visible is False
```

Add the hook next to the Task 2 hooks:

```js
window.__mm.cam = () => ({ view: camView, d: [camera.position.x - P.x, camera.position.y - P.y, camera.position.z - P.z] });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k cockpit`
Expected: FAIL on `after` (still `[0.325, 1.586, 0.494]`: the eye comes from `CAM_VIEWS`, not the vehicle).

- [ ] **Step 3: Implement.** Replace the `CAM_VIEWS` comment line about eye offsets and the `CAM_VIEWS` line:

```js
// offsets per vehicle: VEH.camera[k] (chase: dist/h in world metres; eye views: car-model metres, x forward, y up, side + = right, scaled with the car)
const CAM_VIEWS = [{ n: 'Chase', k: 'chase' }, { n: 'Chase near', k: 'near' }, { n: 'Cockpit', k: 'cockpit', eye: true }, { n: 'Bumper', k: 'bumper', eye: true }];
const vehEye = (k) => VEH.camera[k].eye.map(c => c * VEH.scale);
```

In `stepCamera`:
- `if (v.eye) { const [ex, ey, es] = v.eye.map(k => k * VEH.scale), rx = -fz, rz = fx;` → `if (v.eye) { const [ex, ey, es] = vehEye(v.k), rx = -fz, rz = fx;`
- `else { let dist = v.dist + speed * 0.09, h = v.h + speed * 0.03;` → `else { const vc = VEH.camera[v.k]; let dist = vc.dist + speed * 0.09, h = vc.h + speed * 0.03;`

Everything else in `stepCamera`, `cycleCamera`, the V-key handler and `stepCar` (`!CAM_VIEWS[camView].eye`) stays.

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q -k "vehicle or camera"`
Expected: all selected pass, including the existing `test_camera_cycles_with_c` (names and toasts unchanged).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py
git commit -m "refactor(vehicles): camera offsets from the vehicle table (#5)"
```

---

### Task 6: Horn, engine and gear table from the table

**Files:**
- Modify: `prototype/index.html` (`SFX.update` ~L794, `SFX.horn` ~L799, `hud()` ~L898)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `VEH.sound`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```python
def test_table_gears_drive_the_hud(server):
    """20 m/s = 72 km/h: 3rd gear with compact's table, 1st with a long first gear. The HUD reads the vehicle's table."""
    roll = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 0.02, [])"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(roll); page.wait_for_timeout(400)
        compact = page.inner_text("#gearn")
        use_vehicle(page, "c.sound.gears = [0, 100, 200, 300, 400, 500, 999]")
        page.evaluate(roll); page.wait_for_timeout(400)
        long_first = page.inner_text("#gearn")
        b.close()
    assert (compact, long_first) == ("3", "1")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k gears`
Expected: FAIL — `('3', '3') != ('3', '1')`.

- [ ] **Step 3: Implement.**
- `hud()` ~L898: `const gears = [0, 20, 45, 75, 110, 150, 999];` → `const gears = VEH.sound.gears;`
- `SFX.update` ~L794: `const gears = [0, 20, 45, 75, 110, 150, 999];` → `const S = VEH.sound, gears = S.gears;` and `const f = 55 + rpm * 150 + gi * 6;` → `const f = S.engineBase + rpm * S.enginePerRpm + gi * 6;`
- `SFX.horn` ~L799: `horn() { beep(420, 0.45, 'sawtooth', 0.12); beep(528, 0.45, 'sawtooth', 0.12); },` → `horn() { for (const f of VEH.sound.horn) beep(f, VEH.sound.hornDur, 'sawtooth', 0.12); },`

(`VEH` is defined above `SFX` in the file and read at call time.) Check: `grep -n "0, 20, 45, 75" prototype/index.html` prints only the `VEHICLES` line.

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py
git commit -m "refactor(vehicles): horn, engine and gear table from the vehicle table (#5)"
```

---

### Task 7: Full verification

**Files:** none changed (unless a check fails).

- [ ] **Step 1: Literal sweep.** Each must print only the `VEHICLES` line (or nothing):

```bash
grep -n "CAR_SCALE" prototype/index.html
grep -n "nitro ? 90\|? 1.8 : 9\|steer \* 2.6\|steer \* 0.4\|0, 20, 45, 75\|beep(420\|55 + rpm\|dist: 9, h: 3.4" prototype/index.html
```

- [ ] **Step 2: Push the branch, then run the whole suite in the foreground** (several minutes; do not background it):

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: every test passes (`test_smoke.py` unchanged, `test_vehicles.py` 7 passed; data-dependent tests may skip where the data files are missing, exactly as before).

- [ ] **Step 3: Manual playtest** (`python3 -m http.server 8000` at the repo root, open `http://localhost:8000/prototype/index.html`): empty console; the car looks as before (navy hatchback, four wheels, plate); gas, nitro (blue flames), handbrake, reverse feel unchanged; Q/E blinkers flash on the car; H/Enter horn and engine sound unchanged; C cycles Chase → Chase near → Cockpit → Bumper with the car hidden inside; V hides the car; a crash into a house slows and damages as before.

- [ ] **Step 4: CHANGELOG.** Do **not** add a `CHANGELOG.md` entry: the change is invisible to players, and this repo's changelog is player-facing prose. Say so in the PR description.

- [ ] **Step 5: Commit** only if a fix was needed (`fix(vehicles): …`), with explicit paths.
