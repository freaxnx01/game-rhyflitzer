# Vehicle depot at the DSM car park (#553) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every vehicle stands on the DSM car park in Sisseln; E next to one swaps into it, the old vehicle goes back to its home slot.

**Architecture:** A pure `depot.js` lays out one home slot per vehicle from the vehicle table and finds the nearest one; `controls.js` learns a `board` context action; `index.html` builds the parked meshes one per frame (re-using the gallery's stage-car build), adds a solid per slot, shows the prompt and swaps through `selectVehicle`. `landmarks.js` gets a J-list row.

**Tech Stack:** vanilla ES modules, three.js r170, `node --test`, Playwright (pytest) on the GPU browser.

**Spec:** `docs/superpowers/specs/2026-11-09-vehicle-depot-design.md`

## Global Constraints

- Hochrhein world only: the depot exists when `L && REGION.id === 'hochrhein'` (the same test `HIDE` uses, `index.html:1293`).
- Strip: centre `(832.3, -107.5)`, long axis +x, usable length 130 m, depth 30 m (edges z = −92.5 and z = −122.5, x = 767.3 … 897.3).
- Pose convention: `{ x, z, th }` with the nose along `(cos th, sin th)` — the same as `P` (`window.__mm.sim`: `P.vx = v·cos th`) and `FOOT.car`.
- Footprint from `def.collision`: `w = 2r`; `l = 2r` (circle) or `2(hl + r)` (capsule). Slot gap 1.2 m beside each vehicle; rear 0.5 m inside the edge.
- Long vehicles: `l > 7`. Row "high" (z = −92.5 edge, nose −z, `th = −π/2`): the other vehicles, from the west end (x = 767.3) eastwards. Row "low" (z = −122.5 edge, nose +z, `th = +π/2`): long vehicles, from the east end (x = 897.3) westwards.
- Build radius 400 m, show radius 300 m (from the strip centre). Boarding: in the car `carReach ≤ 4` and speed `< 2` m/s; on foot `carReach ≤ WALKER.enterReach` (2.5).
- Parked paint: the factory paint, i.e. what a player with no chosen paint gets when picking that vehicle: `paintOnSelect(VEHICLES[id], 'navy', false, 'navy', VEHICLES[id])`.
- Strings in en and de; German with real umlauts, `ss` not `ß`.
- Changelog: one hand-written entry at the top of `[Unreleased]` → `### Added`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`. Never `git cliff -o`.
- Key check: E in the car is unbound today (`controls.js` `CAR` list has no KeyE; the comment "the car keeps E as the right blinker" in `stepEnter` is stale — the right blinker is Period). Grep every `*.js` before binding anything else.
- Browser tests: run only the touched files, in the foreground, on the GPU browser (`PW_CDP_ENDPOINT=http://192.168.1.120:9223`).

## Review Focus

1. **Building a parked mesh must not change the driven car.** After the depot is built, `window.__mm.carStats()` and the paint are unchanged, and the head/tail lamps still work — Task 3's `test_depot_builds_every_vehicle_and_leaves_the_driven_car_alone`.
2. **Repaint after build:** picking another paint in Choose car must not repaint the parked copies (shared materials) — Task 3, same test, repaints and checks a parked body colour.
3. **Boarding while a glTF is still loading:** boarding a slot that shows the fallback still drives that vehicle, as Choose car does — Task 4's `test_e_in_the_car_boards_the_parked_vehicle`, which boards before the model is ready.
4. **Swap during a run** marks the run as swapped — Task 4's `test_boarding_during_a_run_marks_it_swapped`.
5. **On foot, a door and a parked car both in reach:** the door wins (spec priority) — Task 2's `contextKeyAction` test.

---

### Task 1: depot.js — layout and nearest slot

**Files:**
- Create: `depot.js`
- Test: `tests/depot.test.mjs`

**Interfaces:**
- Consumes: `VEHICLE_TYPES`, `galleryOrder(ids, defs, type)` from `carselect.js`; `parkedBox(car, size)`, `carReach(x, z, box)` from `foot.js`.
- Produces:
  - `export const DEPOT = { x: 832.3, z: -107.5, len: 130, depth: 30, gap: 1.2, inset: 0.5, longL: 7, build: 400, show: 300, reachCar: 4, reachSpeed: 2 }`
  - `export function footprint(def) -> { w, l }`
  - `export function depotLayout(ids, defs, cfg = DEPOT) -> [{ id, x, z, th, w, l }]` (one slot per id)
  - `export function nearestSlot(x, z, slots, drivenId, reach) -> { id, d } | null`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPOT, footprint, depotLayout, nearestSlot } from '../depot.js';

const car = (type, r, hl, top = 60, accel = 16) => ({ type, mass: 1, drive: { top, accel, grip: 9 }, collision: hl ? { shape: 'capsule', r, hl } : { shape: 'circle', r } });

test('footprint: a circle is 2r square, a capsule 2(hl + r) long', () => {
  assert.deepEqual(footprint(car('sport', 1.3)), { w: 2.6, l: 2.6 });
  const bus = footprint(car('utility', 1.3, 4.8));
  assert.ok(bus.w === 2.6 && Math.abs(bus.l - 12.2) < 1e-9, bus);
  assert.throws(() => footprint({ collision: { shape: 'box' } }), /collision/);
});

test('depotLayout: short vehicles on the high-z edge from the west, long ones on the low-z edge from the east, noses inwards', () => {
  const defs = { compact: car('everyday', 1.3), hyper: car('sport', 1.3, 0.8, 83.3, 21), bus: car('utility', 1.3, 4.8, 27.8, 4), mini: car('screen', 1.0) };
  const s = Object.fromEntries(depotLayout(Object.keys(defs), defs).map(v => [v.id, v]));
  // types in VEHICLE_TYPES order: everyday (compact), sport (hyper), screen (mini) on the high row; bus alone on the low row
  assert.equal(s.compact.th, -Math.PI / 2); assert.equal(s.bus.th, Math.PI / 2);
  assert.ok(Math.abs(s.compact.x - (767.3 + 3.8 / 2)) < 1e-9, s.compact.x);            // slot = w + gap, from x = 767.3
  assert.ok(Math.abs(s.hyper.x - (767.3 + 3.8 + 3.8 / 2)) < 1e-9, s.hyper.x);
  assert.ok(Math.abs(s.mini.x - (767.3 + 7.6 + 3.2 / 2)) < 1e-9, s.mini.x);
  assert.ok(Math.abs(s.compact.z - (-92.5 - 0.5 - 2.6 / 2)) < 1e-9, s.compact.z);      // rear 0.5 m inside the edge
  assert.ok(Math.abs(s.bus.x - (897.3 - 3.8 / 2)) < 1e-9 && Math.abs(s.bus.z - (-122.5 + 0.5 + 12.2 / 2)) < 1e-9, s.bus);
});

test('depotLayout: fails fast when the rows would meet or a vehicle is longer than the strip is deep', () => {
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`c${i}`, car('everyday', 1.3)]));
  const long = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`b${i}`, car('utility', 1.3, 4.8)]));
  assert.throws(() => depotLayout(Object.keys({ ...many, ...long }), { ...many, ...long }), /rows/);
  assert.throws(() => depotLayout(['x'], { x: car('utility', 1.3, 15) }), /deep/);
});

test('nearestSlot: the closest parked vehicle within reach, never the driven one', () => {
  const slots = [{ id: 'a', x: 0, z: 0, th: 0, w: 2, l: 4 }, { id: 'b', x: 10, z: 0, th: 0, w: 2, l: 4 }];
  assert.deepEqual(nearestSlot(0, 2, slots, null, 2.5), { id: 'a', d: 1 });
  assert.equal(nearestSlot(0, 2, slots, 'a', 2.5), null);
  assert.equal(nearestSlot(5, 5, slots, null, 2.5), null);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/depot.test.mjs` → "Cannot find module '../depot.js'".
- [ ] **Step 3: Implement `depot.js`** (pure module header comment like `carselect.js`: no DOM, no three.js). Order inside each row: for each type in `VEHICLE_TYPES`, `galleryOrder(ids, defs, type)`, then ids whose type is not in `VEHICLE_TYPES`, in table order. Throw `depotLayout: vehicle <id> is longer than the strip is deep` when `l + inset > depth`, and `depotLayout: the rows meet` when the high row's east end passes the low row's west end. `nearestSlot` uses `carReach(x, z, parkedBox({ x, z, y: 0, th }, { l, w, h: 0 }))`.
- [ ] **Step 4: Run, expect PASS** — `node --test tests/depot.test.mjs`.
- [ ] **Step 5: Commit** — `git add depot.js tests/depot.test.mjs && git commit -m "feat(depot): lay out a home slot per vehicle on the DSM car park"`

### Task 2: controls.js — the board context action

**Files:**
- Modify: `controls.js:82-86` (`contextKeyAction`), `controls.js:58` (`CONTEXT_LABELS`)
- Test: `tests/controls.test.mjs`

**Interfaces:**
- Produces: `contextKeyAction({ liftPrompt, indoors, doorPrompt, boardPrompt })` → `'lift' | 'leave' | 'enter' | 'board' | null`; `contextLabel('board') === 'barBoard'`.

- [ ] **Step 1: Write the failing test**

```js
test('contextKeyAction_BoardOnlyWhenNothingElseIsUp', () => {
  assert.equal(contextKeyAction({ boardPrompt: true }), 'board');
  assert.equal(contextKeyAction({ doorPrompt: true, boardPrompt: true }), 'enter');   // a door beats a parked car
  assert.equal(contextKeyAction({ indoors: true, boardPrompt: true }), 'leave');
  assert.equal(contextKeyAction({}), null);
  assert.equal(contextLabel('board'), 'barBoard');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/controls.test.mjs`.
- [ ] **Step 3: Implement** — `boardPrompt` is checked after `doorPrompt`; add `board: 'barBoard'` to `CONTEXT_LABELS`. Add `barBoard: 'get in'` / `'einsteigen'` to `strings.js` (en / de, next to `barEnter`).
- [ ] **Step 4: Run, expect PASS** — `node --test tests/controls.test.mjs tests/strings.test.mjs`.
- [ ] **Step 5: Commit** — `git commit -am "feat(controls): E boards a parked vehicle when no door is in reach"`

### Task 3: parked vehicles in the world

**Files:**
- Modify: `index.html` (import `depot.js`; the gallery block near `photoVehicle`, `index.html:5319`; the main loop where `stepGallery()` is called)
- Test: `tests/test_depot.py` (new)

**Interfaces:**
- Consumes: `DEPOT`, `depotLayout`, `nearestSlot` (Task 1); `setVehicle`, `applyPaint`, `paintOnSelect`, `gltfState`, `loadVehicleModel`, `addSolid`.
- Produces:
  - `withStageVehicle(id, paint, fn)` — the save / `setVehicle` + `applyPaint` / restore part of `photoVehicle`, extracted; `photoVehicle` calls it. `fn(car)` runs with the stage car built as `id`.
  - `DEPOT_S = { on, slots, built: Map<id, { mesh, model: 'gltf' | 'fallback' }>, solids: Map<id, obb> }`
  - `stepDepot()` — called once per frame next to `stepGallery()`; builds at most one parked mesh per frame.
  - `window.__mm.depot()` → `{ on, slots: [{ id, x, z, th, w, l, shown, solid, model, paint }], near }` (`paint`: the parked body's colour as `#rrggbb`, or `null` for a fixed livery).

- [ ] **Step 1: Write the failing test** (`tests/test_depot.py`, helpers from `test_carselect`)

```python
"""#553: every vehicle stands on the DSM car park. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import T, open_page, wait_frames

DEPOT_JS = "() => window.__mm.depot()"
AT_DEPOT = "() => window.__mm.sim(832.3, -107.5, 0, 0, 0.1, [])"
ALL_BUILT = "() => { const d = window.__mm.depot(); return d.slots.every(s => s.model === 'gltf' || s.id === window.__mm.carsel().id); }"


def test_depot_builds_every_vehicle_and_leaves_the_driven_car_alone(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.carStats()")
        page_count = len(page.evaluate("() => window.__mm.carGallery().ids"))
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_BUILT, timeout=240000)
        d = page.evaluate(DEPOT_JS)
        after = page.evaluate("() => window.__mm.carStats()")
        b.close()
    me = [s for s in d["slots"] if s["id"] == "compact"][0]
    assert d["on"] and len(d["slots"]) == page_count, d
    assert not me["shown"] and not me["solid"], me                       # the driven car's slot is empty
    assert all(s["shown"] and s["solid"] for s in d["slots"] if s["id"] != "compact"), d
    assert after == before, (before, after)
    assert not errors, errors
```

Add a second test in the same file, `test_parked_cars_are_solid_and_far_ones_hidden`: at the depot, `sim` the car at 15 m/s from the strip centre straight at the first high-row slot for 2 s and assert it stops short of that slot's centre (`carReach` > 0 from the hook's pose); then `sim` to 350 m away and assert every slot reports `shown: false`. And `test_parked_paint_ignores_later_repaints`: after `ALL_BUILT`, open Choose car, pick `swiss` paint, close it, and assert a paintable parked vehicle's body colour (read through a hook field `paint` per slot) is still its factory paint.

- [ ] **Step 2: Run, expect FAIL** — `pytest -q tests/test_depot.py` → `window.__mm.depot is not a function`.
- [ ] **Step 3: Implement** — extract `withStageVehicle` from `photoVehicle` (keep `photoVehicle`'s behaviour; `test_car_gallery.py` must stay green). A parked mesh is `car.clone(true)` taken inside `withStageVehicle`, with every material deep-cloned (`o.material = o.material.clone()`, arrays element-wise) so later `applyPaint` calls cannot reach it, the flames and blinker groups removed, placed at the slot pose (rotation the same as the driven car's for that `th`) and added to `scene`. Build order: `depotLayout(Object.keys(VEHICLES), VEHICLES)` once when the player first comes within `DEPOT.build`; then one slot per frame, every slot once (`model: 'fallback'` while its glTF is not ready — start `loadVehicleModel` for it), and rebuild a slot when its glTF turns ready (`model: 'gltf'`). Each slot gets one `addSolid({ x, z, hw: l / 2, hd: w / 2, c: cos th, s: sin th, h: 3, depot: id })`; the solid's `off` is `id === CHOICE.id`, the mesh's `visible` is `id !== CHOICE.id && dist < DEPOT.show`. Skip all of it during a wreck, like `stepGallery`.
- [ ] **Step 4: Run, expect PASS** — `pytest -q tests/test_depot.py tests/test_car_gallery.py`.
- [ ] **Step 5: Commit** — `git commit -am "feat(depot): every vehicle parked on the DSM car park, solid, in factory paint"`

### Task 4: boarding with E

**Files:**
- Modify: `index.html` (`contextAction`, `runContextKey` near `index.html:4262`; the car branch of the keydown handler, `index.html:3866`; `stepEnter`, `index.html:4278`), `strings.js`
- Test: `tests/test_depot.py`

**Interfaces:**
- Consumes: `nearestSlot` (Task 1), `contextKeyAction` / `'board'` (Task 2), `DEPOT_S` (Task 3), `selectVehicle`, `endFoot`, `R`.
- Produces: `boardDepot(id)`; `window.__mm.depot().near`; strings `depotPrompt: (name) => …`, `depotIn: (name) => …`.

- [ ] **Step 1: Write the failing tests**

```python
def board_from_car(page, target):
    """Stand still 2 m in front of the target's nose, wait for the prompt, press E."""
    s = [s for s in page.evaluate(DEPOT_JS)["slots"] if s["id"] == target][0]
    page.evaluate("(s) => window.__mm.sim(s.x + Math.cos(s.th) * (s.l / 2 + 2), s.z + Math.sin(s.th) * (s.l / 2 + 2), s.th + Math.PI, 0, 0.2, [])", s)
    page.wait_for_function(f"() => window.__mm.depot().near === '{target}'", timeout=T)
    page.keyboard.press("KeyE")
    page.wait_for_function(f"() => window.__mm.carsel().id === '{target}'", timeout=T)


def test_e_in_the_car_boards_the_parked_vehicle(server):
    """Boards the hypercar before its model is loaded; the compact goes home, the hypercar's slot empties."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        page.evaluate(AT_DEPOT)
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.id === 'hyper' && s.model)", timeout=T)
        board_from_car(page, "hyper")
        d = page.evaluate(DEPOT_JS)
        b.close()
    slot = {s["id"]: s for s in d["slots"]}
    assert slot["compact"]["shown"] and slot["compact"]["solid"], slot["compact"]
    assert not slot["hyper"]["shown"] and not slot["hyper"]["solid"], slot["hyper"]
    assert not errors, errors
```

Add:
- `test_boarding_on_foot`: get out with Z next to the strip, walk (hook `foot`) to within 2 m of a parked vehicle, assert the key bar shows the E entry labelled "get in" (`window.__mm.keybar()`), press E, assert `foot().on` is false, the new vehicle is driven and the old one is in its home slot.
- `test_boarding_during_a_run_marks_it_swapped`: start a time trial (`#startbtn` in trial mode), board, assert `window.__mm.raceFlags().swapped`.
- `test_e_elsewhere_in_the_car_does_nothing`: away from the depot, E leaves the vehicle id unchanged and no error appears.
- `test_too_fast_shows_no_prompt`: passing a slot at 10 m/s within 3 m, `near` stays `null`.

- [ ] **Step 2: Run, expect FAIL** — `pytest -q tests/test_depot.py -k "board or swapped or elsewhere or fast"`.
- [ ] **Step 3: Implement**
  - `depotNear()` → `nearestSlot(P.x, P.z, DEPOT_S.slots, CHOICE.id, FOOT.on ? WALKER.enterReach : DEPOT.reachCar)?.id ?? null`, and in the car only when `Math.hypot(P.vx, P.vz) < DEPOT.reachSpeed` and not `TRAIN.on` / `FLY.on`.
  - `contextAction()`: on foot pass `boardPrompt: !!depotNear()`; in the car return `depotNear() ? 'board' : null`. `runContextKey()` handles `'board'` → `boardDepot(depotNear())`. In the keydown handler's car branch, `KeyE` with `contextAction() === 'board'` calls `runContextKey()` and `preventDefault()`s; otherwise E keeps doing nothing.
  - `stepEnter()`: when `depotNear()` and no door / ride / lift prompt is up, write `tr('depotPrompt', name)` into `#prompt` (same `HUD.enterShown` bookkeeping as the door prompt). Fix the stale "the car keeps E as the right blinker" comment.
  - `boardDepot(id)`: if on foot, `endFoot()`; `const slot = …; selectVehicle(id)`; `P.x/P.z/P.th` = slot pose, `P.y = groundH(...)`, all velocities 0; update the two slots' `off` / `visible`; `if (R.state === 'racing' || R.state === 'armed') R.swapped = true`; `toast(tr('depotIn', vehicleText(tr, id, 'name')))`.
  - Strings: `depotPrompt: (n) => \`E: get in — ${n}\``, `depotIn: (n) => \`Now driving: ${n}\``; de `E: Einsteigen — ${n}`, `Jetzt am Steuer: ${n}`.
- [ ] **Step 4: Run, expect PASS** — `pytest -q tests/test_depot.py tests/test_on_foot.py tests/test_keybar.py tests/test_controls.py`.
- [ ] **Step 5: Commit** — `git commit -am "feat(depot): E next to a parked vehicle swaps into it"`

### Task 5: J list row and changelog

**Files:**
- Modify: `landmarks.js:6-35` (`LANDMARK_INFO`), `CHANGELOG.md`
- Test: `tests/landmarks.test.mjs`, `tests/test_depot.py`

- [ ] **Step 1: Write the failing tests**

```js
test('LANDMARK_INFO has the vehicle depot at the DSM car park, in Eiken', () => {
  const d = LANDMARK_INFO.find(l => l.name === 'Fahrzeug-Depot');
  assert.deepEqual([d.gemeinde, d.at], ['Eiken', [832.3, -107.5]]);
  assert.ok(Array.isArray(d.jump) && d.jump.length === 2);
});
```

and in `tests/test_depot.py`, `test_j_list_jumps_to_the_depot`: open J, type "depot", pick the row, assert the car is within 80 m of `(832.3, -107.5)` and `depot().on`; and with `?region=ehrendingen` (or the region query the other tests use) assert no "Fahrzeug-Depot" row.

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/landmarks.test.mjs`.
- [ ] **Step 3: Implement** — `{ name: 'Fahrzeug-Depot', gemeinde: 'Eiken', at: [832.3, -107.5], jump: [<west end of the strip, mid-depth: 770, -107.5>] }` with a `// #553` comment; the J landing faces east (follow how `Bergsee`'s `jump` sets the heading, `landmarks.js:16`). Changelog entry: "`<timestamp>` At the **DSM car park** in Sisseln every vehicle now stands in a **vehicle depot**: drive or walk up to one and press <kbd>E</kbd> to drive on in it. Find it with <kbd>J</kbd> → *Fahrzeug-Depot*."
- [ ] **Step 4: Run, expect PASS** — `node --test tests/*.test.mjs` (full node suite) and `pytest -q tests/test_depot.py tests/test_jump.py`.
- [ ] **Step 5: Commit** — `git commit -am "feat(depot): find the vehicle depot in the J list"`
