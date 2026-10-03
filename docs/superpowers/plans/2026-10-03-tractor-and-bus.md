# Tractor and Yellow Bus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `VEHICLES.tractor` and `VEHICLES.bus` to `prototype/index.html`, load their Kenney Car Kit (CC0) glTF models from vendored files, collide the 12 m bus along its length (`shape: 'obb'`), make both reachable via `?vehicle=<id>`, credit the asset source — with the compact's golden trace untouched.

**Architecture:** Pure helpers (`obbSamples`, `fitTransform`, `vehicleFromQuery`) in a new ES module `prototype/vehicle.js`, unit-tested with `node --test`. In `index.html`: a `MODELS.gltf` builder that returns synchronously and inserts a cached, fitted glTF clone when it arrives; `collide` refactored into a per-circle step driven by `obbSamples` with a per-vehicle `bounce`; `checkVehicle` widened; two table entries; `?vehicle=` at startup; a `credits` string. Playwright tests in `prototype/tests/test_vehicles.py` drive it all through the existing `window.__mm` hooks.

**Tech Stack:** Vanilla JS + three.js 0.170 (CDN import map, `GLTFLoader` from `three/addons/`), one buildless `prototype/index.html`; Playwright + pytest and `node --test` in `prototype/tests/`.

**Spec:** `docs/superpowers/specs/2026-10-03-tractor-and-bus-design.md`

## Global Constraints

- TDD per task: failing test first, watch it fail, minimal implementation, green, then the full suite.
- Surgical edits in the dense one-line style of `prototype/index.html`; match surrounding style; do not reformat neighbours.
- **Golden trace** (`test_vehicles.py::test_golden_trace_of_the_compact_car`) must pass after every task. `compact` changes by exactly one field: `collision.bounce: 1.25`.
- No framework, bundler, `package.json`, `node_modules`. New runtime files: `prototype/vehicle.js` and `prototype/models/car-kit/*` only.
- Models are **local files** under `prototype/models/car-kit/`; `GLTFLoader` is imported from `three/addons/loaders/GLTFLoader.js` (import map, `index.html:198`). No model URL points at a CDN.
- The bus is yellow (`#f5c400`), **no logo, lettering, livery or three-tone horn** (docs/07). Its model file source is **A2 in the spec — decided by a human before Task 6 runs**; the plan's Task 6 has two branches.
- `setVehicle` stays synchronous. Physics never waits for a model.
- Test commands (foreground only, never `run_in_background`):
  - node: `node --test prototype/tests/`
  - pytest (slow, minutes): `python3 -m pytest prototype/tests -q` (pytest ≥ 8 and `playwright` from `pipeline/requirements-dev.txt`; if a venv exists under `pipeline/.venv`, use its python). Single file: `python3 -m pytest prototype/tests/test_vehicles.py -q`.
- Commit after every task (Conventional Commits, explicit `git add <paths>`, repo attribution lines). Push the branch **before** long verification runs.
- Line numbers below are from `main` @ `27fe8a6`; verify with `grep -n` before editing.

## Review Focus

- `collide` refactor neutrality: with `bounce: 1.25` and one sample `[0]`, the circle path must produce the *same floating-point operations* in the same order as today (`P.x += wx * pen` … `P.vx -= wx * vn * 1.25`). Multiplying by a variable `1.25` instead of the literal is bit-identical; changing operation order is not. Golden trace guards it, review confirms.
- `MODELS.gltf` late arrival: the clone must only be added if `CAR_GEN` is unchanged since the build started (a quick `setVehicle(compact)` after `setVehicle(bus)` must not leave a bus body inside the compact).
- `freeCar` must skip `userData.shared` objects (cache clones share geometry/material) — otherwise the second glTF build renders black/missing (disposed shared material).
- Shadow blob for `obb`: `(hl / 2.6 · scale, hw / 2.6 · scale)`; the blob is `CircleGeometry(2.6)` (`:887`) rotated with the car, x along heading.
- `checkVehicle` runs **before** anything is swapped (unchanged contract, `test_set_vehicle_rejects_inherited_model_and_missing_collision`).
- `?vehicle=` must run after `setVehicle(VEH)` (`:896`) and before the loop starts, i.e. next to `debugFromQuery` (`:1126`).

---

## File map

- Create `prototype/vehicle.js` — pure helpers: `obbSamples(hl, hw)`, `fitTransform(box, length, yaw)`, `vehicleFromQuery(search, ids)`.
- Create `prototype/tests/vehicle.test.mjs` — node tests for the helpers.
- Create `prototype/models/car-kit/` — `tractor.glb`, the kit wheel `.glb`, referenced textures, `bus.glb` (per A2), `LICENSE.txt`.
- Modify `prototype/index.html`:
  - imports (`:200-205`): `GLTFLoader`, `vehicle.js` helpers.
  - `VEHICLES` (`:855-861`): `compact.collision.bounce`, new `tractor`, `bus`.
  - car section (`:864-896`): `MODELS.gltf`, `GLTF_CACHE`, `CAR_GEN`, `freeCar` shared-skip, `buildCar` blob scaling, `checkVehicle`, `carRadius` → `carSamples`.
  - `collide` (`:991`) and its call in `stepCar` (`:1005`).
  - `window.__mm.sim` (`:982`): add `vx, vz`; new hooks `modelReady`, `modelBox`.
  - startup (`:1126`): `?vehicle=`.
  - start panel (`:194`): `<p id="credits">`.
- Modify `prototype/strings.js` — `credits` in `en` and `de`.
- Modify `prototype/tests/test_vehicles.py` — rewrite the `#6` validation test; add obb, bounce, tractor, bus, glTF, GPU, startup tests.
- Modify `prototype/tests/strings.test.mjs` — `credits` key present in both languages (follow the file's existing pattern).
- Modify `README.md` (License section), `CHANGELOG.md` (`[Unreleased] / Added`).

---

### Task 1: Pure helpers in `prototype/vehicle.js`

**Files:**
- Create: `prototype/vehicle.js`, `prototype/tests/vehicle.test.mjs`

**Interfaces:**
- `obbSamples(hl, hw) -> number[]` — offsets along the heading axis (model metres, unscaled).
- `fitTransform({ min: {x,y,z}, max: {x,y,z} }, length, yaw) -> { scale, yaw, offset: [x, y, z] }` — `scale` makes the extent along the axis that becomes +x after `yaw` equal `length`; `offset` (applied after scaling and rotating, in the fitted frame) puts min y at 0 and the x/z centre at 0.
- `vehicleFromQuery(search, ids) -> string | null`.

- [ ] **Step 1: Write the failing tests**

```javascript
// prototype/tests/vehicle.test.mjs — #6: pure vehicle helpers (no three.js, no DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obbSamples, fitTransform, vehicleFromQuery } from '../vehicle.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('obbSamples: a 12 m bus of half-width 1.3 is five circles from -4.7 to 4.7', () => {
  const s = obbSamples(6, 1.3);
  assert.equal(s.length, 5);
  [-4.7, -2.35, 0, 2.35, 4.7].forEach((v, i) => close(s[i], v));
});

test('obbSamples: a square footprint is one circle at the centre', () => {
  assert.deepEqual(obbSamples(1.3, 1.3), [0]);
});

test('obbSamples: never fewer than three samples for any longer-than-wide box', () => {
  assert.equal(obbSamples(1.5, 1.3).length, 3);
});

test('fitTransform: scales a box 2 units long to 12 m, base on the ground, centred', () => {
  const t = fitTransform({ min: { x: -1, y: 0.2, z: -0.3 }, max: { x: 1, y: 1.0, z: 0.3 } }, 12, 0);
  close(t.scale, 6);
  assert.equal(t.yaw, 0);
  close(t.offset[0], 0); close(t.offset[1], -0.2 * 6); close(t.offset[2], 0);
});

test('fitTransform: with yaw pi/2 the z extent becomes the length', () => {
  const t = fitTransform({ min: { x: -0.5, y: 0, z: -2 }, max: { x: 0.5, y: 1, z: 2 } }, 4.4, Math.PI / 2);
  close(t.scale, 1.1);
  assert.equal(t.yaw, Math.PI / 2);
});

test('fitTransform: an off-centre box is re-centred in x and z (fitted frame, yaw 0)', () => {
  const t = fitTransform({ min: { x: 1, y: 0, z: 2 }, max: { x: 3, y: 1, z: 3 } }, 4, 0);
  close(t.scale, 2); close(t.offset[0], -2 * 2); close(t.offset[2], -2.5 * 2);
});

test('vehicleFromQuery: known id, unknown id, no parameter', () => {
  const ids = ['compact', 'tractor', 'bus'];
  assert.equal(vehicleFromQuery('?vehicle=bus', ids), 'bus');
  assert.equal(vehicleFromQuery('?debug&vehicle=tractor', ids), 'tractor');
  assert.equal(vehicleFromQuery('?vehicle=tank', ids), null);
  assert.equal(vehicleFromQuery('?debug', ids), null);
  assert.equal(vehicleFromQuery('', ids), null);
  assert.equal(vehicleFromQuery('?vehicle=constructor', ids), null);
});
```

- [ ] **Step 2: Run, watch it fail** — `node --test prototype/tests/` → `Cannot find module '../vehicle.js'`.

- [ ] **Step 3: Implement**

```javascript
// prototype/vehicle.js — pure helpers for the vehicle table (#6): no three.js, no DOM, unit-tested with node --test.

// Sample offsets along the heading axis for a long vehicle: circles of radius hw at these offsets approximate the
// hl x hw box (corners rounded by hw). A square footprint is one circle.
export function obbSamples(hl, hw) {
  const reach = hl - hw;
  if (reach < 1e-9) return [0];
  const n = Math.max(2, Math.ceil(reach / hw)) + 1;
  return Array.from({ length: n }, (_, i) => -reach + (2 * reach * i) / (n - 1));
}

// Uniform scale + yaw + offset that puts a model's long axis along +x with `length` metres, its base at y = 0 and
// its footprint centred. `yaw` is given (tuned per model); the extent measured is the one that ends up along x.
export function fitTransform(box, length, yaw) {
  const ex = box.max.x - box.min.x, ez = box.max.z - box.min.z;
  const alongX = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw));
  const scale = length / (alongX ? ex : ez);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // the box centre after rotation about y by yaw (three.js: x' = x cos + z sin, z' = -x sin + z cos)
  const rx = cx * c + cz * s, rz = -cx * s + cz * c;
  return { scale, yaw, offset: [-rx * scale, -box.min.y * scale, -rz * scale] };
}

// `?vehicle=<id>` → id when it names a vehicle in `ids`, else null (own keys only: no 'constructor').
export function vehicleFromQuery(search, ids) {
  const id = new URLSearchParams(search).get('vehicle');
  return id !== null && ids.includes(id) ? id : null;
}
```

- [ ] **Step 4: Run** — `node --test prototype/tests/` → all pass (existing `world`, `strings`, `debug`, `landmarks` tests too).

- [ ] **Step 5: Commit** — `git add prototype/vehicle.js prototype/tests/vehicle.test.mjs` · `feat(vehicles): pure helpers for long-vehicle collision, glTF fit and ?vehicle= (#6)`.

---

### Task 2: `bounce` field and `collide` refactor (neutral for the compact)

**Files:**
- Modify: `prototype/index.html` (`VEHICLES.compact`, `collide`, `carRadius`, `stepCar` call, `sim` hook), `prototype/tests/test_vehicles.py`

**Interfaces:**
- `VEH.collision.bounce` (number) replaces the literal `1.25` in `collide`.
- `collideCircle(px, pz, r)` — one circle test at a point; returns nothing, mutates `P` (position and velocity) exactly like today's loop body.
- `collide()` — iterates `vehicleSamples()` (world-space sample points from `obbSamples` × `scale`, rotated by `P.th`) and calls `collideCircle` with `vehicleRadius()`.
- `window.__mm.sim(...)` additionally returns `vx, vz`.

- [ ] **Step 1: Write the failing tests** (append to `test_vehicles.py`)

```python
def test_bounce_is_read_from_the_table(server):
    """Head-on into the island at 15 m/s: bounce 1.25 is today's rebound (2.074 m/s left, see mass test);
    bounce 1.0 removes the normal velocity without rebound, so less speed is left."""
    crash = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, []).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, "c.collision.bounce = 1.25")
        rebound = page.evaluate(crash)
        use_vehicle(page, "c.collision.bounce = 1.0")
        stop = page.evaluate(crash)
        table = page.evaluate("() => window.__mm.vehicles().compact.collision.bounce")
        b.close()
    assert rebound == pytest.approx(2.074, abs=0.005), rebound
    assert stop < rebound * 0.5, (stop, rebound)
    assert table == 1.25


def test_sim_reports_velocity(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        r = page.evaluate("() => window.__mm.sim(1882.9, -292.2, Math.PI, 10, 0.5, [])")
        b.close()
    assert r["vx"] < 0 and abs(r["vz"]) < 1e-9 and r["speed"] == pytest.approx(abs(r["vx"]), abs=1e-9), r
```

- [ ] **Step 2: Run** — `python3 -m pytest prototype/tests/test_vehicles.py -q -k "bounce or velocity"` → fails (`bounce` undefined → NaN speed / `vx` missing).

- [ ] **Step 3: Implement.** In `VEHICLES.compact` (`:858`): `collision: { shape: 'circle', r: 1.3, bounce: 1.25 }`. Replace `carRadius` (`:895`) and `collide` (`:991`):

```javascript
// collision footprint: circle → one sample at the centre, obb → circles of radius hw along the heading (vehicle.js obbSamples)
const vehicleRadius = () => (VEH.collision.shape === 'obb' ? VEH.collision.hw : VEH.collision.r) * VEH.scale;
const vehicleSamples = () => (VEH.collision.shape === 'obb' ? obbSamples(VEH.collision.hl, VEH.collision.hw) : [0]).map(o => o * VEH.scale);
```

```javascript
// one circle (px, pz, r) against the static obstacles; the whole vehicle moves by the push, the velocity responds as before
function collideCircle(px, pz, r) { for (const o of gridQuery(OBB_GRID, px, pz, r + 2)) { if (Math.abs(o.x - px) > o.hw + o.hd + r + 2 || Math.abs(o.z - pz) > o.hw + o.hd + r + 2) continue; if (o.bridge && P.y < (o.y0 ?? 0.4)) continue; const dx = px - o.x, dz = pz - o.z; let wx, wz, pen; if (o.circle) { const dd = Math.hypot(dx, dz) || 1e-4; if (dd > r + o.circle) continue; wx = dx / dd; wz = dz / dd; pen = r + o.circle - dd; } else { const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd); let nx = lx - cx, nz = lz - cz; let d = Math.hypot(nx, nz); if (d > r) continue; if (d < 1e-4) { const px2 = o.hw - Math.abs(lx), pz2 = o.hd - Math.abs(lz); if (px2 < pz2) { nx = Math.sign(lx) || 1; nz = 0; d = -px2; } else { nx = 0; nz = Math.sign(lz) || 1; d = -pz2; } } else { nx /= d; nz /= d; } wx = nx * o.c - nz * o.s; wz = nx * o.s + nz * o.c; pen = r - d; } P.x += wx * pen; P.z += wz * pen; px += wx * pen; pz += wz * pen; const vn = P.vx * wx + P.vz * wz; if (vn < 0) { const bounce = VEH.collision.bounce; P.vx -= wx * vn * bounce; P.vz -= wz * vn * bounce; const keep = 1 - Math.min(0.5, -vn * 0.025 / VEH.mass); P.vx *= keep; P.vz *= keep; P.dmg = Math.min(1, P.dmg + Math.min(0.12, -vn * 0.004 / VEH.mass)); if (vn < -3) SFX.crash(Math.min(1, -vn / 25)); } } }
function collide() { const r = vehicleRadius(), fx = Math.cos(P.th), fz = Math.sin(P.th); for (const o of vehicleSamples()) collideCircle(P.x + fx * o, P.z + fz * o, r); }
```

Note `px += wx * pen; pz += wz * pen` keeps the sample point in step with `P` for the remaining obstacles of the same loop — for the single centre sample this is exactly today's behaviour (`P.x` *was* the sample point). In `stepCar` (`:1005`) replace `collide(carRadius());` with `collide();`. Import `obbSamples` from `./vehicle.js` (`:205`). In `window.__mm.sim` (`:982`) return `{ x: P.x, z: P.z, y: P.y, vx: P.vx, vz: P.vz, speed: …, bridge: … }`.

- [ ] **Step 4: Run** — `python3 -m pytest prototype/tests/test_vehicles.py -q` → **golden trace green**, new tests green.

- [ ] **Step 5: Commit** — `refactor(vehicles): collide per sample circle with a per-vehicle bounce (#6)`.

---

### Task 3: `checkVehicle` accepts `obb` and `gltf`; `shape: 'obb'` collides along the length

**Files:**
- Modify: `prototype/index.html` (`checkVehicle`, `buildCar` blob), `prototype/tests/test_vehicles.py`

**Interfaces:**
- `checkVehicle(def)` — accepts `collision.shape` `'circle'` (`r > 0`) or `'obb'` (`hl >= hw > 0`); `model` must be an own key of `MODELS`; `model === 'gltf'` requires `def.gltf` with string `url`, `length > 0`, numeric `yaw`.

- [ ] **Step 1: Rewrite the validation test and add the OBB test.** Replace `test_set_vehicle_validates_and_round_trips` with:

```python
def test_set_vehicle_validates_and_round_trips(server):
    """Unsupported shapes, a malformed obb, an unknown model and a gltf entry without a file throw and leave the
    active vehicle alone; a plain copy of compact drives exactly like the golden trace."""
    bad = """(patch) => { const c = window.__mm.vehicles().compact; c.drive.top = 30; patch(c);
      try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return e.message; } }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        hexa = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'hexagon', r: 1 }}; }})")
        obb = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'obb', hl: 6 }}; }})")
        model = page.evaluate(f"() => ({bad})(c => {{ c.model = 'bus'; }})")
        gltf = page.evaluate(f"() => ({bad})(c => {{ c.model = 'gltf'; c.gltf = {{ length: 12, yaw: 0 }}; }})")
        top = page.evaluate("() => window.__mm.vehicle().drive.top")
        use_vehicle(page, "")
        got = page.evaluate(GOLDEN_JS)
        b.close()
    assert "'circle' or 'obb'" in hexa, hexa
    assert "hw" in obb, obb
    assert "bus" in model, model
    assert "url" in gltf, gltf
    assert top == 60
    for k, want in GOLDEN.items():
        assert got[k] == pytest.approx(want, abs=1e-6), (k, got[k], want)


def test_obb_collides_along_the_length(server):
    """A 12 x 2.6 m box (hl 6, hw 1.3) standing 11.8 m from the island centre (island 9.5): side-on (heading pi/2)
    its flank clears by 1.0 m and it stays; end-on (heading 0) the rear sample at 4.7 m behind the centre is 7.1 m
    from the island and the bus is pushed out until that sample clears: centre at 9.5 + 1.3 + 4.7 = 15.5 m."""
    stand = "(th) => { const r = window.__mm.sim(1218.3, -127, th, 0, 0.1, []); return Math.hypot(r.x - 1206.5, r.z + 127); }"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, "c.collision = { shape: 'obb', hl: 6, hw: 1.3, bounce: 1.0 }; c.scale = 1")
        side = page.evaluate(f"() => ({stand})(Math.PI / 2)")
        end = page.evaluate(f"() => ({stand})(0)")
        shape = page.evaluate("() => window.__mm.vehicle().collision.shape")
        b.close()
    assert shape == "obb"
    assert side == pytest.approx(11.8, abs=0.01), side
    assert end == pytest.approx(15.5, abs=0.05), end
```

- [ ] **Step 2: Run** — fails (`checkVehicle` still rejects `obb`).

- [ ] **Step 3: Implement `checkVehicle`** (`:893`):

```javascript
// fail fast, before anything is swapped: own builder ids only, a complete gltf entry, and a circle or an obb footprint
function checkVehicle(def) { if (!Object.hasOwn(MODELS, def.model)) throw new Error(`Unknown vehicle model '${def.model}' (builders: ${Object.keys(MODELS).join(', ')})`); if (def.model === 'gltf' && !(def.gltf && typeof def.gltf.url === 'string' && def.gltf.length > 0 && typeof def.gltf.yaw === 'number')) throw new Error(`Vehicle gltf entry needs { url, length, yaw }`); const c = def.collision; if (!c) throw new Error(`Vehicle '${def.model}' has no collision entry (expected { shape: 'circle', r, bounce } or { shape: 'obb', hl, hw, bounce })`); if (c.shape === 'circle') { if (!(c.r > 0)) throw new Error(`Vehicle circle collision needs r > 0`); } else if (c.shape === 'obb') { if (!(c.hw > 0 && c.hl >= c.hw)) throw new Error(`Vehicle obb collision needs hl >= hw > 0`); } else throw new Error(`Vehicle collision shape '${c.shape}' is not supported, only 'circle' or 'obb'`); if (!(c.bounce >= 0)) throw new Error(`Vehicle collision needs bounce >= 0`); }
```

In `buildCar` (`:891`) replace `blob.scale.set(VEH.scale, 0.55 * VEH.scale, 1)` with `const bc = VEH.collision; if (bc.shape === 'obb') blob.scale.set(bc.hl / 2.6 * VEH.scale, bc.hw / 2.6 * VEH.scale, 1); else blob.scale.set(VEH.scale, 0.55 * VEH.scale, 1);`.

`MODELS` has no `gltf` builder until Task 4, so the `"url" in gltf` assertion would see "Unknown vehicle model 'gltf'". Register a no-op stub in this step — `const MODELS = { compact: buildCompact, gltf: () => {} };` — so the model-id check passes and the entry check throws `url`. Task 4 replaces the stub with the real builder.

- [ ] **Step 4: Run** — `python3 -m pytest prototype/tests/test_vehicles.py -q` → green incl. golden trace. Also run `test_table_collision_radius_scales` (unchanged, circle path) — green.

- [ ] **Step 5: Commit** — `feat(vehicles): obb collision footprint and wider vehicle validation (#6)`.

---

### Task 4: `MODELS.gltf` — vendored Kenney tractor, loader, fit, cache, hooks

**Files:**
- Create: `prototype/models/car-kit/tractor.glb`, `prototype/models/car-kit/<wheel>.glb`, any referenced texture, `prototype/models/car-kit/LICENSE.txt`
- Modify: `prototype/index.html` (imports, `GLTF_CACHE`, `CAR_GEN`, `MODELS.gltf`, `freeCar`, hooks), `prototype/tests/test_vehicles.py`

**Interfaces:**
- `MODELS.gltf(g, v)` — synchronous builder; adds the fitted scene clone + wheels to `g` when loaded, if `g`'s build generation is still current.
- `window.__mm.modelReady() -> Promise<void>` resolves when the active vehicle's model (and wheels) are in the car group (immediately for procedural models).
- `window.__mm.modelBox() -> { size: [x, y, z], min: [x, y, z] }` — world AABB of `car` (`THREE.Box3().setFromObject(car)`).

- [ ] **Step 1: Get the files.** Download Kenney Car Kit 3.1 (kenney.nl/assets/car-kit, CC0) **outside the repo** (`/tmp`), unzip, and inspect the glTF folder. Copy into `prototype/models/car-kit/`: `tractor.glb`, one wheel model (prefer the default wheel the kit pairs with the tractor; note its name), and — only if the `.glb` references an external image — that image (check: `node -e "const b=require('fs').readFileSync(process.argv[1]);const n=b.readUInt32LE(12);console.log(JSON.parse(b.subarray(20,20+n).toString()).images||'embedded/none')" prototype/models/car-kit/tractor.glb`). Print the node names the same way (`.nodes.map(n=>n.name)`) for the plan record (not used by code). Write `LICENSE.txt`:

```text
Kenney Car Kit 3.1 — https://kenney.nl/assets/car-kit
License: Creative Commons Zero (CC0 1.0) — https://creativecommons.org/publicdomain/zero/1.0/
Files in this folder taken from the kit's glTF export: tractor.glb, <wheel>.glb[, <texture>]
Credited in the game (start screen) and in README.md although CC0 does not require it.
```

- [ ] **Step 2: Write the failing tests** (append):

```python
def open_hand_with_query(p, server, query):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 320, "height": 180})
    msgs = []
    page.on("pageerror", lambda e: msgs.append(str(e)))
    page.on("console", lambda m: msgs.append(m.text) if m.type in ("error", "warning") and (not m.location.get("url") or m.location.get("url", "").startswith(server)) and "world_hochrhein.json" not in m.location.get("url", "") and "terrain_hochrhein.mmh" not in m.location.get("url", "") else None)
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, msgs


def test_gltf_tractor_is_loaded_and_fitted(server):
    """?vehicle=tractor: the Kenney tractor arrives after setVehicle returned; fitted to 4.4 m along the heading,
    base on the ground, narrower than long; no console errors (model and texture found)."""
    with sync_playwright() as p:
        b, page, msgs = open_hand_with_query(p, server, "?vehicle=tractor")
        page.evaluate("() => window.__mm.modelReady()")
        box = page.evaluate("() => window.__mm.modelBox()")
        car = page.evaluate("() => window.__mm.car()")
        veh = page.evaluate("() => window.__mm.vehicle()")
        b.close()
    assert veh["model"] == "gltf" and veh["gltf"]["url"].startswith("models/car-kit/")
    assert box["size"][0] == pytest.approx(4.4, abs=0.05), box          # car at START heading pi: length along world x
    assert box["size"][2] < box["size"][0], box
    assert abs(box["min"][1] - car["y"]) < 0.1, (box, car)
    assert msgs == [], msgs


def test_gltf_rebuilds_free_gpu_memory(server):
    """A cached glTF scene is shared across rebuilds: after the first tractor build, five more keep GPU counts flat."""
    with sync_playwright() as p:
        b, page, _ = open_hand_with_query(p, server, "?vehicle=tractor")
        page.evaluate("() => window.__mm.modelReady()"); wait_frames(page)
        first = page.evaluate("() => window.__mm.gpu()")
        for _ in range(5):
            page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().tractor); return window.__mm.modelReady(); }"); wait_frames(page)
        last = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert first["textures"] > 0, first
    assert last["textures"] <= first["textures"] and last["geometries"] <= first["geometries"], (first, last)


def test_late_model_does_not_land_in_the_next_vehicle(server):
    """setVehicle(tractor) immediately followed by setVehicle(compact): the tractor's scene must not be added to the
    compact's group when the download finishes."""
    with sync_playwright() as p:
        b, page, _ = open_hand_with_query(p, server, "")
        page.evaluate("() => { const v = window.__mm.vehicles(); window.__mm.setVehicle(v.tractor); window.__mm.setVehicle(v.compact); }")
        page.wait_for_timeout(1500); wait_frames(page)
        box = page.evaluate("() => window.__mm.modelBox()")
        b.close()
    assert box["size"][0] == pytest.approx(4.5 * 1.3, abs=0.35), box     # compact only (extruded body 4.52 m * 1.3)
```

These need `VEHICLES.tractor` (Task 5) and `?vehicle=` (Task 7). To keep this task red→green on its own, Step 3 adds a **minimal** `tractor` entry (the Task 5 values) and `?vehicle=` wiring is moved here: implement `vehicleFromQuery` startup now (it is three tokens) — Task 7 then only tests it. Adjust: Task 7's implementation step says "already done in Task 4; verify".

- [ ] **Step 3: Implement.** Imports (`:200-205`):

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { obbSamples, fitTransform, vehicleFromQuery } from './vehicle.js';
```

After `MODELS` (`:886`) — replace `const MODELS = { compact: buildCompact };` with:

```javascript
// glTF vehicles (#6): Kenney Car Kit files under models/car-kit (CC0, see LICENSE.txt there). The builder returns at once; the scene
// is fetched once per url (GLTF_CACHE), then a clone is fitted (vehicle.js fitTransform) and added -- only if the car was not rebuilt
// in the meantime (CAR_GEN). Clones share geometry and materials with the cache, so freeCar leaves them alone (userData.shared).
const GLTF_LOADER = new GLTFLoader(), GLTF_CACHE = new Map();
let CAR_GEN = 0, MODEL_READY = Promise.resolve();
function loadGltf(url) { if (!GLTF_CACHE.has(url)) GLTF_CACHE.set(url, new Promise((res, rej) => GLTF_LOADER.load(url, (g) => res(g.scene), undefined, rej))); return GLTF_CACHE.get(url); }
function fitClone(scene, length, yaw) { const box = new THREE.Box3().setFromObject(scene); const t = fitTransform(box, length, yaw); const g = new THREE.Group(); const c = scene.clone(true); c.rotation.y = t.yaw; c.scale.setScalar(t.scale); g.add(c); g.position.set(...t.offset); g.traverse(o => { o.userData.shared = true; }); return g; }
function buildGltf(g, v) { const gen = CAR_GEN; const wheelUrl = v.gltf.wheel; MODEL_READY = Promise.all([loadGltf(v.gltf.url), wheelUrl ? loadGltf(wheelUrl) : null]).then(([scene, wheel]) => { if (gen !== CAR_GEN) return; g.add(fitClone(scene, v.gltf.length, v.gltf.yaw)); if (wheel) for (const [x, z] of v.wheels) for (const s of [1, -1]) { const w = fitClone(wheel, 2 * v.wheelR, 0); w.position.set(x, 0, s * z); g.add(w); } g.traverse(o => { o.castShadow = true; }); }).catch(e => console.error(`Vehicle model ${v.gltf.url} failed to load: ${e.message || e}`)); }
const MODELS = { compact: buildCompact, gltf: buildGltf };
```

`fitClone` for the wheel: `fitTransform` measures the long horizontal axis — a wheel's diameter is its x/z extent (Kenney wheels lie flat on the ground plane with the axle along z; if the kit's wheel axle is along x, pass `Math.PI / 2` as yaw — check visually in Step 5). `v.gltf.wheel` is the wheel file's URL (added to the entries in Task 5).

`freeCar` (`:890`): `car.traverse(o => { if (o.userData.shared) return; o.geometry?.dispose(); … })`. `buildCar` (`:891`): first statement `CAR_GEN++;` and for procedural builders set `MODEL_READY = Promise.resolve()` before calling the builder (`buildGltf` overwrites it).

Hooks (after `:986`):

```javascript
window.__mm.modelReady = () => MODEL_READY;
window.__mm.modelBox = () => { const b = new THREE.Box3().setFromObject(car); return { size: b.getSize(new THREE.Vector3()).toArray(), min: b.min.toArray() }; };
```

Startup (next to `:1126`): `{ const id = vehicleFromQuery(location.search, Object.keys(VEHICLES)); if (id) setVehicle(VEHICLES[id]); }`.

Minimal `tractor` entry (full values in Task 5; `yaw` starts at `0`, `wheel` is the vendored wheel file).

- [ ] **Step 4: Tune `yaw`.** Run only `test_gltf_tractor_is_loaded_and_fitted`. If the x-extent is the tractor's *width* (≈ 2 m) the kit's forward axis is z: set `yaw: Math.PI / 2` (or `-Math.PI / 2` — decide the sign in Step 5 by looking). Re-run until 4.4 ± 0.05.

- [ ] **Step 5: Look at it (foreground Playwright screenshot).** `page.goto(server + '/prototype/index.html?vehicle=tractor')`, `modelReady()`, press `C` once (near chase) and screenshot to `/tmp/tractor.png` (not in the repo); Read the image. The tractor must face away from the camera (front at +x of the car = direction of travel), wheels on the ground, big wheels at the rear (`wheels` x positive = front). If it faces backwards, add π to `yaw`. If the wheels float or sink, fix `wheelR` (and the wheel `fitClone` yaw). Then run the three new tests + the full `test_vehicles.py`.

- [ ] **Step 6: Commit** — `git add prototype/index.html prototype/models/car-kit prototype/tests/test_vehicles.py` · `feat(vehicles): glTF vehicle models from the Kenney Car Kit, tractor first (#6)`.

---

### Task 5: Table entries — tractor and bus values, drive tests

**Files:**
- Modify: `prototype/index.html` (`VEHICLES`), `prototype/tests/test_vehicles.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_tractor_is_slow_and_glued_to_the_road(server):
    """40 km/h top: 4 s on the gas ends between 8.5 and 11.1 m/s. Grip: after 1 s of handbrake-turn at 15 m/s the
    slip angle (velocity vs heading) stays under 2 deg for the tractor and is over 10 deg for the compact."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    slip = """() => { const r = window.__mm.sim(1882.9, -292.2, Math.PI, 15, 1, ['KeyW', 'KeyD', 'ControlLeft']); const th = window.__mm.heading();
      let a = Math.atan2(r.vz, r.vx) - th; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) * 180 / Math.PI; }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        compact_slip = page.evaluate(slip)
        page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().tractor)")
        speed = page.evaluate(gas)
        tractor_slip = page.evaluate(slip)
        veh = page.evaluate("() => window.__mm.vehicle()")
        b.close()
    assert veh["drive"]["top"] == pytest.approx(11.1) and veh["scale"] == 1.0 and veh["collision"]["shape"] == "circle"
    assert 8.5 < speed < 11.1, speed
    assert compact_slip > 10, compact_slip
    assert tractor_slip < 2, tractor_slip


def test_bus_is_sluggish_and_turns_wide(server):
    """4 s on the gas ends under 14 m/s (compact 31.47); 2 s of W+A at 15 m/s turns the heading less than 60 % of
    the compact's; the entry is a 12 m obb of mass 8 with no rebound."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    turn = "() => { const th0 = Math.PI; window.__mm.sim(1882.9, -292.2, th0, 15, 2, ['KeyW', 'KeyA']); return Math.abs(window.__mm.heading() - th0); }"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        compact_turn = page.evaluate(turn)
        page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().bus)")
        speed = page.evaluate(gas)
        bus_turn = page.evaluate(turn)
        veh = page.evaluate("() => window.__mm.vehicle()")
        b.close()
    assert veh["collision"] == {"shape": "obb", "hl": 6, "hw": 1.3, "bounce": 1.0} and veh["mass"] == 8 and veh["gltf"]["length"] == 12
    assert speed < 14, speed
    assert bus_turn < 0.6 * compact_turn, (bus_turn, compact_turn)
    assert veh["sound"]["horn"] == [349, 440]      # two notes, a major third: not the PostAuto three-tone (docs/07)
```

- [ ] **Step 2: Run** — fails (`vehicles().bus` undefined).

- [ ] **Step 3: Implement** — the two entries after `compact` (`:861`), `WHEEL` = the vendored wheel URL from Task 4:

```javascript
  // #6: real metres (scale 1). Models: Kenney Car Kit (CC0), models/car-kit; yaw tuned so the front faces +x. mass only softens the crash.
  tractor: { model: 'gltf', gltf: { url: 'models/car-kit/tractor.glb', wheel: WHEEL, length: 4.4, yaw: 0 }, scale: 1.0, wheels: [[1.3, 0.95], [-1.1, 0.95]], wheelR: 0.55,
    drive: { top: 11.1, topNitro: 16, accel: 6, accelNitro: 10, brake: 14, reverse: 4, reverseMax: 6, grip: 30, gripHandbrake: 12, steerRate: 2.2, airSteer: 0.2 },
    mass: 2.5, collision: { shape: 'circle', r: 1.4, bounce: 1.25 },
    camera: { chase: { dist: 10, h: 3.8 }, near: { dist: 7, h: 2.8 }, cockpit: { eye: [-0.3, 2.3, 0] }, bumper: { eye: [2.2, 0.9, 0] } },
    sound: { horn: [300], hornDur: 0.5, engineBase: 30, enginePerRpm: 60, gears: [0, 10, 20, 30, 999] } },
  // generic yellow bus: no logo, no lettering, own two-note horn (docs/07). obb: half-length 6, half-width 1.3; bounce 1 = pushes, no rebound
  bus: { model: 'gltf', gltf: { url: 'models/car-kit/bus.glb', wheel: WHEEL, length: 12, yaw: 0 }, scale: 1.0, wheels: [[4.2, 1.1], [-3.6, 1.1]], wheelR: 0.5,
    drive: { top: 22, topNitro: 28, accel: 4, accelNitro: 8, brake: 10, reverse: 3, reverseMax: 5, grip: 6, gripHandbrake: 1.2, steerRate: 1.1, airSteer: 0.2 },
    mass: 8, collision: { shape: 'obb', hl: 6, hw: 1.3, bounce: 1.0 },
    camera: { chase: { dist: 20, h: 6.5 }, near: { dist: 13, h: 4.5 }, cockpit: { eye: [5.0, 2.4, -0.6] }, bumper: { eye: [6.1, 0.8, 0] } },
    sound: { horn: [349, 440], hornDur: 0.8, engineBase: 38, enginePerRpm: 70, gears: [0, 15, 30, 50, 70, 999] } },
```

Keep the tractor `yaw` found in Task 4. The bus `yaw` is tuned in Task 6.

- [ ] **Step 4: Run** `test_vehicles.py` → green (the bus drive tests do not need the model file: physics is table-only; a 404 for `bus.glb` is logged by `buildGltf`'s catch — acceptable until Task 6, and these two tests do not assert on console messages).

- [ ] **Step 5: Commit** — `feat(vehicles): tractor and yellow bus table entries (#6)`.

---

### Task 6: The bus model — **A2 branch** (human decision recorded in the issue)

**Files:**
- Create: `prototype/models/car-kit/bus.glb` (+ texture if external); update `LICENSE.txt`
- Modify: `prototype/index.html` (bus `yaw`, and `buildBus` only on branch B), `prototype/tests/test_vehicles.py`

- [ ] **Step 1: Write the failing test**

```python
def test_gltf_bus_is_loaded_and_fitted(server):
    with sync_playwright() as p:
        b, page, msgs = open_hand_with_query(p, server, "?vehicle=bus")
        page.evaluate("() => window.__mm.modelReady()")
        box = page.evaluate("() => window.__mm.modelBox()")
        car = page.evaluate("() => window.__mm.car()")
        b.close()
    assert box["size"][0] == pytest.approx(12, abs=0.05), box
    assert 2.2 < box["size"][2] < 3.0, box
    assert abs(box["min"][1] - car["y"]) < 0.1, (box, car)
    assert msgs == [], msgs
```

- [ ] **Step 2: Branch A — the kit (or another CC0 pack) has a bus.** Copy it to `prototype/models/car-kit/bus.glb`; if it is not from the Car Kit, add its name, author, version, URL and licence (must be CC0 or equivalent) to `LICENSE.txt`, and extend the `credits` string (Task 8) and README. Make sure it carries **no lettering or logo** (Kenney/Quaternius models are plain); yellow is the model's own colour or — if the file is another colour — recolour in `fitClone` is **not** done; instead pick a yellow variant of the pack or branch B.

- [ ] **Step 2: Branch B — no suitable file.** Add a procedural builder in the kit's flat-shaded look and register it: `MODELS.bus = buildBus`; set the entry to `model: 'bus'` with `gltf: null` (keep `wheels`/`wheelR`; `buildBus` draws kit wheels via `loadGltf(WHEEL)` the same way `buildGltf` does, or procedural cylinders like `buildCompact`). Body: `BoxGeometry(12, 2.6, 2.55)` at y 0.6..3.2 in `MeshLambertMaterial({ color: 0xf5c400 })`, a darker window band `BoxGeometry(11.2, 0.9, 2.6)` at y 2.0 (`0x1a2430`), black bumpers, white roof — **no text, no logo**. Adjust the test's `veh["model"]`/`gltf` assertions in Task 5 accordingly (`model == 'bus'`), and keep the box-size test above (it holds for the procedural body too).

- [ ] **Step 3: Tune `yaw`/look** exactly like Task 4 Steps 4–5 (screenshot in `/tmp`, front faces +x, wheels on the ground, 12.0 ± 0.05 m).

- [ ] **Step 4: Run** the full `test_vehicles.py` → green. **Step 5: Commit** — `feat(vehicles): yellow bus model (#6)`.

---

### Task 7: `?vehicle=` startup selection — test

**Files:**
- Modify: `prototype/tests/test_vehicles.py`

- [ ] **Step 1: Write the test** (implementation landed in Task 4):

```python
def test_vehicle_query_selects_at_startup(server):
    with sync_playwright() as p:
        b, page, _ = open_hand_with_query(p, server, "?vehicle=bus")
        bus = page.evaluate("() => { const v = window.__mm.vehicle(); return [v.collision.shape, v.mass]; }")
        b.close()
        b, page, _ = open_hand_with_query(p, server, "?vehicle=tank")
        fallback = page.evaluate("() => window.__mm.vehicle().drive.top")
        b.close()
    assert bus == ["obb", 8]
    assert fallback == 60
```

- [ ] **Step 2: Run** → green (if red, the startup block from Task 4 Step 3 is missing or placed before `setVehicle(VEH)` — fix). **Step 3: Commit** — `test(vehicles): ?vehicle= selects tractor or bus at startup (#6)`.

---

### Task 8: Credits, README, CHANGELOG

**Files:**
- Modify: `prototype/strings.js`, `prototype/tests/strings.test.mjs`, `prototype/index.html` (start panel), `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Failing node test** — add to `prototype/tests/strings.test.mjs`, following its existing pattern for "key exists in both languages":

```javascript
test('credits line names the Kenney Car Kit in both languages', () => {
  assert.match(translate('en', 'credits'), /Kenney Car Kit \(CC0\)/);
  assert.match(translate('de', 'credits'), /Kenney Car Kit \(CC0\)/);
});
```

- [ ] **Step 2: Implement.** `strings.js` `en`: `credits: 'Vehicle models: Kenney Car Kit (CC0) · kenney.nl',` `de`: `credits: 'Fahrzeugmodelle: Kenney Car Kit (CC0) · kenney.nl',` (append the bus source on branch A-non-Kenney). `index.html` after `#blurb` (`:194`): `<p id="credits" data-i18n="credits" style="font-size:13px;color:var(--steel)">Vehicle models: Kenney Car Kit (CC0) · kenney.nl</p>`. `README.md` License section: `- **Vehicle models**: [Kenney Car Kit](https://kenney.nl/assets/car-kit), CC0 1.0 — vendored under `prototype/models/car-kit/` (see its `LICENSE.txt`)`. `CHANGELOG.md` under `## [Unreleased]` / `### Added`, first bullet, in the file's player voice:

```markdown
- Two new vehicles to try before the garage opens: a **tractor** (40 km/h, sticks to the road like glue) and a long **yellow bus** (12 m, slow to get going, wide turns, and it shoves past lamp posts instead of bouncing off). Add `?vehicle=tractor` or `?vehicle=bus` to the address to drive one; the vehicle picker is coming. Models from the free Kenney Car Kit.
```

- [ ] **Step 3: Run** `node --test prototype/tests/` and `python3 -m pytest prototype/tests/test_i18n.py -q` (static strings applied) → green. **Step 4: Commit** — `docs(vehicles): credit the Kenney Car Kit, changelog for tractor and bus (#6)`.

---

### Task 9: Full verification and playtest

- [ ] **Step 1:** `git push -u origin <branch>` first.
- [ ] **Step 2:** `node --test prototype/tests/` → all green.
- [ ] **Step 3:** `python3 -m pytest prototype/tests -q` (foreground, long timeout) → all green, golden trace included; `test_smoke.py` console checks clean (no model requests on the default compact).
- [ ] **Step 4: Playtest via Playwright (foreground):** for `?vehicle=tractor` and `?vehicle=bus`: click Start, hold `Space` 3 s, press `C` four times taking a screenshot per view into `/tmp`; press `H` (no crash); drive the bus into the Hallenbad wall (`J` → Hallenbad, steer into it) and confirm it slides along without a rebound (speed does not flip sign). Read the screenshots: body faces forward, wheels grounded, bus ≈ 12 m against the 5.5 m road, no lettering.
- [ ] **Step 5:** `git status` clean except intended files; no `/tmp` artefacts in the repo; `prototype/models/car-kit/` contains only the files listed in `LICENSE.txt`.
- [ ] **Step 6:** Open the PR with the repo's template: Summary, Changes, Testing (node, pytest, playtest screenshots described), Checklist. Title `feat(vehicles): tractor and yellow bus from the Kenney Car Kit (#6)`.
