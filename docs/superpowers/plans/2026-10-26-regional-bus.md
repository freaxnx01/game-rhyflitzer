# Regional Bus (Postauto look, stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth selectable vehicle, `bus` ("Regional Bus" / "Überlandbus"), a primitives-built 12.2 m Swiss regional bus in the Postauto look, whose whole length collides (capsule of circles, slight yaw off walls).

**Architecture:** Pure data and maths in a new `prototype/bus.js` (dimensions, livery colours, `capsuleOffsets`, `capsuleCircles`, `wallYaw`), unit-tested with `node --test`, like `prototype/mini.js`. `prototype/index.html` gets the `VEHICLES.bus` entry, `buildBus` registered as `MODELS.bus`, `checkVehicle` accepting `'capsule'`, a `collide` that runs per circle (deepest circle per obstacle) and the knock handle's `circles`. `prototype/knock.js` tests every circle when the handle carries them.

**Tech Stack:** three.js, vanilla ES modules, buildless; `node --test` for pure modules, Playwright (Python) for targeted browser checks.

**Spec:** `docs/superpowers/specs/2026-10-26-regional-bus-design.md` — read it first; its Decisions table is binding.

## Global Constraints

- No "PostAuto", "Postauto", "Post", "SETRA"/"Setra" text, no post horn emblem, no Swiss-cross "P" anywhere on the bus or in its strings. LED display text exactly `Sisseln`; plate text exactly `AG · 4332`.
- Strings: `veh_bus_name` en `Regional Bus`, de `Überlandbus`; `veh_bus_class` en `Regional bus · Class D`, de `Überlandbus · Klasse D`; `veh_bus_desc` one sentence each in en and de (`prototype/strings.js`, next to the `veh_mini_*` keys).
- `VEHICLES.bus`: `model: 'bus'`, `gltf: null`, `scale: 1.0`, `paint: false`, `wheels: [[3.4, 1.05], [-2.68, 1.05]]`, `wheelR: 0.5`, `drive: { top: 22, topNitro: 30, accel: 4, accelNitro: 8, brake: 10, reverse: 3, reverseMax: 5, grip: 6, gripHandbrake: 1.5, steerRate: 1.1, airSteer: 0.2 }`, `mass: 8`, `engineAt: [-5.6, 1.4, 0]`, `collision: { shape: 'capsule', r: 1.3, hl: 4.8 }`; placed after `mini`.
- Horn `notes`: no frequency within ±30 cents of any C♯, E or A in any octave.
- Compact, DeLorean, hatchback and mini entries are not edited; a `'circle'` vehicle's collision arithmetic stays identical (golden trace in `test_vehicles.py` unchanged; the 3 known #465 drifts stay as they are).
- No new dependency, no build step, no `package.json`.
- Browser tests: only the files named per task, in the foreground; commit and push before running them.

## Review Focus

- **Two obstacles in one frame, circle car:** the compact touching the island and a kerb post together must still get one hit per obstacle with today's numbers — pinned by the unchanged golden trace and `test_table_collision_radius_scales` / `test_table_mass_softens_the_crash` (Task 2, run unedited).
- **Bus hits a wall with several circles at once:** one `crashHit` per obstacle, not one per circle — pinned in Task 2 (`deepestHit` node test).
- **Head-on into a wall:** the push is along the bus's axis, so the yaw nudge is zero; the bus must not spin — pinned in Task 1 (`wallYaw` test) and Task 4 (Playwright head-on).
- **Lamp post at the nose:** knocked by the nose circle, not passed through — pinned in Task 3 (`knock.test.mjs`).
- **Malformed capsule:** `{ shape: 'capsule', r: 1.3 }` without `hl`, or `hl <= 0`, throws a clear `Error` and leaves the active vehicle alone — pinned in Task 2 (Playwright).

---

### Task 1: Pure bus data and capsule maths (`bus.js`)

**Files:**
- Create: `prototype/bus.js`
- Test: `prototype/tests/bus.test.mjs`

**Interfaces:**
- Produces:
  - `BUS = { length: 12.2, width: 2.55, height: 3.05, acHeight: 0.15, bandLow: 1.55, bandHigh: 2.75, stripe: 0.06, frontOverhang: 2.7, wheelbase: 6.08 }` (metres; the builder may add fields).
  - `BUS_COLOURS = { body: 0xf5c000, roof: 0xe6e8e8, band: 0x111418, stripe: 0xd6202a, led: 0xff9a1a }`.
  - `BUS_HORN = { notes: [196, 247, 294], dur: 1.0, gain: 0.22, band: 700, wave: 'sawtooth' }` (notes may be retuned by ear within the constraint).
  - `capsuleOffsets(collision) → number[]`: `[0]` for `shape: 'circle'`; for `'capsule'` evenly spaced offsets from `-hl` to `+hl`, count `Math.ceil(2 * hl / r) + 1`.
  - `capsuleCircles(x, z, th, offsets) → [x, z][]`: world centres `x + cos(th)·d`, `z + sin(th)·d`.
  - `wallYaw(d, th, wx, wz, pen, gain, clamp) → number`: yaw change from a push `(wx, wz)·pen` applied at offset `d` along heading `th`; `0` when `d === 0`; torque sign = cross product of the lever `(cos th·d, sin th·d)` and the push; result clamped to `±clamp`.
  - `noteClass(f) → number`: pitch class 0–11 (C = 0) and `centsOff(f) → number` to the nearest semitone, for the horn test.

- [ ] **Step 1: Write the failing tests** in `prototype/tests/bus.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUS, BUS_HORN, capsuleOffsets, capsuleCircles, wallYaw, noteClass, centsOff } from '../bus.js';
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('size: 12.2 m long, 2.55 m wide, wheelbase 6.08 m with a 2.7 m front overhang', () => {
  close(BUS.length, 12.2, 0.05); close(BUS.width, 2.55, 0.01); close(BUS.wheelbase, 6.08, 0.01);
  close(BUS.length / 2 - BUS.frontOverhang - BUS.wheelbase, -2.68, 0.01);
});
test('capsuleOffsets: a circle is one centre, a capsule spans -hl..+hl with spacing <= r, symmetric', () => {
  assert.deepEqual(capsuleOffsets({ shape: 'circle', r: 1.3 }), [0]);
  const o = capsuleOffsets({ shape: 'capsule', r: 1.3, hl: 4.8 });
  close(o[0], -4.8, 1e-9); close(o.at(-1), 4.8, 1e-9);
  for (let i = 1; i < o.length; i++) assert.ok(o[i] - o[i - 1] <= 1.3 + 1e-9);
  for (let i = 0; i < o.length; i++) close(o[i], -o[o.length - 1 - i], 1e-9);
});
test('capsuleCircles: offsets run along the heading', () => {
  const [[x0, z0], [x1, z1]] = capsuleCircles(10, 20, Math.PI / 2, [-2, 2]);
  close(x0, 10, 1e-9); close(z0, 18, 1e-9); close(x1, 10, 1e-9); close(z1, 22, 1e-9);
});
test('wallYaw: zero at the centre and head-on, opposite for nose and tail, clamped', () => {
  assert.equal(wallYaw(0, 0, 0, 1, 0.5, 1, 0.05), 0);
  close(wallYaw(4.8, 0, -1, 0, 0.5, 1, 0.05), 0, 1e-12);                 // push along the axis
  const nose = wallYaw(4.8, 0, 0, 1, 0.01, 1, 0.05), tail = wallYaw(-4.8, 0, 0, 1, 0.01, 1, 0.05);
  assert.ok(nose !== 0 && Math.sign(nose) === -Math.sign(tail), `${nose} ${tail}`);
  assert.equal(Math.abs(wallYaw(4.8, 0, 0, 1, 10, 1, 0.05)), 0.05);
});
test('horn: a chord without the C#-E-A notes of the three-tone horn', () => {
  assert.ok(BUS_HORN.notes.length >= 2);
  for (const f of BUS_HORN.notes) assert.ok(![1, 4, 9].includes(noteClass(f)) || Math.abs(centsOff(f)) > 30, f);
});
```

- [ ] **Step 2: Run** `node --test prototype/tests/bus.test.mjs` → FAIL (`Cannot find module '../bus.js'`).
- [ ] **Step 3: Implement** `prototype/bus.js` with the exports above (header comment `// #473: the regional bus's pure data — size, livery, capsule collision, wall yaw. Pure module, node --test only.`).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit and push** — `feat(vehicles): bus data and capsule maths (#473)`.

---

### Task 2: Capsule collision in `checkVehicle` and `collide`

**Files:**
- Modify: `prototype/index.html` (`checkVehicle` ~L2458, `carRadius` ~L2460, `collide` ~L3586, import from `./bus.js`)
- Modify: `prototype/bus.js` (add `deepestHit`)
- Test: `prototype/tests/bus.test.mjs`, `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `capsuleOffsets`, `capsuleCircles`, `wallYaw` (Task 1).
- Produces:
  - `deepestHit(o, circles, r, push) → { hit, i } | null` in `bus.js`: calls `push(o, x, z, r)` (in the game: `colliderPush`) for each circle and returns the hit with the largest `pen` and its circle index; `null` when none hits.
  - `carCircles() → [x, z][]` in `index.html`: `capsuleCircles(P.x, P.z, P.th, VEH_OFFSETS)` with offsets scaled by `VEH.scale`; `VEH_OFFSETS` recomputed in `buildCar`.
  - `checkVehicle` accepts `shape: 'circle'` (as today) and `shape: 'capsule'` with finite `r > 0` and `hl > 0`; any other shape throws `Error("Vehicle collision shape '<shape>' is not supported, only 'circle' or 'capsule'")`. The `#6` wording in the message and the `carRadius` comment go.
  - `collide(r)`: per obstacle, `deepestHit` over `carCircles()`; then exactly today's push/velocity/`keep`/`crashHit`/`SFX.crash` block once; if the circle's offset `d ≠ 0`, `P.th += wallYaw(d, P.th, wx, wz, pen, YAW_GAIN, YAW_CLAMP)` (constants tuned by feel, start `1.0` and `0.05` rad).

- [ ] **Step 1: Write the failing tests.** In `bus.test.mjs`:

```js
test('deepestHit: one hit per obstacle, the deepest circle wins; none -> null', () => {
  const push = (o, x) => (x > 3 ? { wx: -1, wz: 0, pen: x - 3 } : null);
  assert.deepEqual(deepestHit({}, [[0, 0], [4, 0], [5, 0]], 1.3, push), { hit: { wx: -1, wz: 0, pen: 2 }, i: 2 });
  assert.equal(deepestHit({}, [[0, 0]], 1.3, push), null);
});
```

In `test_vehicles.py` (reuse `open_hand`, `import math` if missing; the island at (1206.5, -127) has radius 9.5, see `test_table_collision_radius_scales`):

```python
BUS_JS = "() => window.__mm.setVehicle(window.__mm.vehicles().bus)"

def test_bus_nose_and_tail_collide(server):
    """#473: standing 15.5 m from the island centre the compact is free; the bus facing the island (nose circle
    at 10.7 m) or facing away (tail circle) is pushed out, straight back without turning."""
    stand = "(th) => { const r = window.__mm.sim(1222.0, -127, th, 0, 0.1, []); return [Math.hypot(r.x - 1206.5, r.z + 127), r.th]; }"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        compact = page.evaluate(stand, math.pi)
        page.evaluate(BUS_JS)
        nose = page.evaluate(stand, math.pi)
        tail = page.evaluate(stand, 0)
        b.close()
    assert compact[0] == pytest.approx(15.5, abs=0.01), compact
    assert nose[0] > 15.55 and tail[0] > 15.55, (nose, tail)
    assert nose[1] == pytest.approx(math.pi, abs=1e-3), nose

def test_set_vehicle_rejects_a_malformed_capsule(server):
    """#473: a capsule needs a positive hl; unknown shapes still throw; the active vehicle stays."""
    bad = """(patch) => { const c = window.__mm.vehicles().compact; patch(c);
      try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return `${e.name}: ${e.message}`; } }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        nohl = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'capsule', r: 1.3 }}; }})")
        box = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'box', r: 1.3 }}; }})")
        model = page.evaluate("() => window.__mm.vehicle().model")
        b.close()
    assert nohl.startswith("Error: ") and "hl" in nohl, nohl
    assert box.startswith("Error: ") and "capsule" in box, box
    assert model == "compact"
```

If `__mm.sim`'s result has no `th`, add it to the returned object (read-only hook, `index.html` near `window.__mm.sim`). These tests need `VEHICLES.bus` (Task 4); write them now, they stay red until Task 4 — run only the node test and the malformed-capsule test in this task.

- [ ] **Step 2: Run** `node --test prototype/tests/bus.test.mjs` → FAIL (`deepestHit` missing).
- [ ] **Step 3: Implement** `deepestHit` in `bus.js` and the `checkVehicle`, `carCircles`, `collide` changes in `index.html` as specified under Interfaces. `carRadius()` keeps returning `VEH.collision.r * VEH.scale` (comment: centre circle; the capsule's other circles: `carCircles`).
- [ ] **Step 4: Run** `node --test prototype/tests/bus.test.mjs` → PASS, then `pytest prototype/tests/test_vehicles.py -k "golden or collision_radius or mass_softens or rejects" -v` → PASS (golden trace only with the known #465 drift).
- [ ] **Step 5: Commit and push** — `feat(vehicles): capsule collision for long vehicles (#473)`.

---

### Task 3: Knock props with every circle

**Files:**
- Modify: `prototype/knock.js` (`step()` ~L378)
- Modify: `prototype/index.html` (`kcar` handle ~L1621)
- Test: `prototype/tests/knock.test.mjs`

**Interfaces:**
- Consumes: `carCircles()` (Task 2).
- Produces: the `car()` handle may carry `circles: [x, z][]`; `step()` treats a prop as touched when `touches()` holds for any circle (same `y`, `r`); without `circles` it uses `(x, z)` as today. The `#428` lying-prop shove keeps using the centre.

- [ ] **Step 1: Write the failing test** in `knock.test.mjs`, following the file's existing `createKnock` setup: a lamp at `(5, 0)`, a car at `(0, 0)` moving at 10 m/s with `r: 1.3` — not knocked without `circles`; knocked with `circles: [[-4.8, 0], [0, 0], [4.8, 0]]`.
- [ ] **Step 2: Run** `node --test prototype/tests/knock.test.mjs` → FAIL on the circles case.
- [ ] **Step 3: Implement** in `knock.js`; in `index.html` set `kcar.circles = VEH.collision.shape === 'capsule' ? carCircles() : null`.
- [ ] **Step 4: Run** `node --test prototype/tests/knock.test.mjs` → PASS (all existing knock tests unchanged).
- [ ] **Step 5: Commit and push** — `feat(knock): long vehicles knock props along their length (#473)`.

---

### Task 4: `VEHICLES.bus`, `buildBus`, strings

**Files:**
- Modify: `prototype/index.html` (`VEHICLES` after `mini`, `buildBus` after `buildMini`, `MODELS`)
- Modify: `prototype/strings.js` (en + de, next to `veh_mini_*`)
- Test: `prototype/tests/test_vehicles.py`

**Interfaces:**
- Consumes: `BUS`, `BUS_COLOURS`, `BUS_HORN` (Task 1); `buildWheels`, `textTex`, `LOCAL_LAMPS`, `BLINK`, `flames`, `carMats` (existing, see `buildDelorean`).
- Produces: `VEHICLES.bus` (values in Global Constraints; cameras, engine sound, crash sound per spec Decisions), `buildBus(g, v)`, `MODELS.bus = buildBus`.

- [ ] **Step 1: Write the failing tests** in `test_vehicles.py`:

```python
def test_bus_is_in_the_table_and_true_to_size(server):
    """#473: 12.2 m long, 2.55 m wide (mirrors may add up to 0.5 m), 3.2 m high with the AC unit."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(BUS_JS)
        page.click("#startbtn", timeout=180000)
        page.wait_for_function("() => Math.abs(window.__mm.wheelYaw().yaw) < 1e-3", timeout=120000)
        model = page.evaluate("() => window.__mm.vehicle().model")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert model == "bus"
    assert size["l"] == pytest.approx(12.2, abs=0.1), size
    assert 2.5 < size["w"] < 3.1, size
    assert size["h"] == pytest.approx(3.2, abs=0.1), size

def test_vehicle_query_selects_the_bus(server):
    """#473: ?vehicle=bus starts with the bus, no page errors."""
    with sync_playwright() as p:
        b, page, errors = open_hand_query(p, server, "?vehicle=bus")
        picked = page.evaluate("() => window.__mm.vehicle().model")
        b.close()
    assert picked == "bus"
    assert errors == [], errors

def test_bus_accelerates_slowly(server):
    """#473: the golden 4 s gas run ends far below the compact's 31.47 m/s (top 22, accel 4)."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(BUS_JS)
        bus = page.evaluate(gas)
        b.close()
    assert bus < 17, bus
```

- [ ] **Step 2: Run** `pytest prototype/tests/test_vehicles.py -k bus -v` → FAIL (`vehicles().bus` undefined).
- [ ] **Step 3: Implement** the entry and `buildBus` per the spec's Livery/Front rows: body box in `BUS_COLOURS.body`, roof cap + AC unit, full-length black window band, red stripe dipping across the front, windscreen with dark frame, LED display `textTex('Sisseln', …)` in orange on black (`MeshBasicMaterial`, not in `LOCAL_LAMPS`), head/tail lamps via `LOCAL_LAMPS`, four `BLINK` boxes at the corners, mirrors on arms, plates `AG · 4332` front and rear, `buildWheels(g, v)`, nitro flames at the rear. Strings in en and de.
- [ ] **Step 4: Run** `pytest prototype/tests/test_vehicles.py -k "bus or delorean or mini or golden" -v` and `node --test prototype/tests/carselect.test.mjs prototype/tests/bus.test.mjs` → PASS (golden only with the #465 drift). Also run `pytest prototype/tests/test_carselect.py -v` if it exists (vehicle count may be asserted there — if it hard-codes the count, the test is wrong for a growing table only when it pins `4`; update the count and say so in the PR).
- [ ] **Step 5: Look at it.** Screenshot `?vehicle=bus` on the start screen (side and front) and the cockpit view into the scratchpad; compare with the reference photo in the issue: yellow, white roof, black band, red stripe dipping at the front, orange display. Tune by eye; check that no text other than `Sisseln` and the plate is visible.
- [ ] **Step 6: Commit and push** — `feat(vehicles): regional bus in the Postauto look (#473)`.

---

### Task 5: Docs — brands row, changelog, README

**Files:**
- Modify: `docs/07-brands-and-permissions.md` (PostAuto row), `CHANGELOG.md` (`[Unreleased]`), `README.md` (vehicle list, if it has one)

- [ ] **Step 1:** Replace the PostAuto row's decision text with: **Not asked — decided 2026-10-01, refined 2026-10-26 (#473).** Postauto look (shape after a modern regional bus, Postauto yellow, white roof, black window band, red stripe) without post horn emblem, Swiss-cross "P", "PostAuto" lettering, maker name or the three-tone horn (own horn chord).
- [ ] **Step 2:** Changelog entry under `[Unreleased]`, timestamped like its neighbours, player voice, 1–3 bold keywords (e.g. **Überlandbus**, **Postauto-Look**).
- [ ] **Step 3: Verify** `git diff --name-only origin/main...HEAD` lists only files named in this plan.
- [ ] **Step 4: Commit and push** — `docs(vehicles): bus in brands doc and changelog (#473)`.

The manual playtest (spec's last acceptance criterion) is the human's; list it in the PR as outstanding.
