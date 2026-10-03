# Car True to Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The compact car is drawn at real size (`VEHICLES.compact.scale` 1.0, about 4.7 × 1.9 m) so it fits the 2.5 × 5.0 m parking bays, and the chase/near cameras move in by 1/1.3 so the car keeps its on-screen size (#69).

**Architecture:** One table entry in `prototype/index.html` changes: `scale` 1.3 → 1.0, `camera.chase` 9/3.4 → 6.9/2.6, `camera.near` 6/2.4 → 4.6/1.85. Wheels, collision radius, eye views and the blob already multiply their model-metre values by `VEH.scale`, so they follow without edits. A new read-only debug hook `__mm.carSize()` measures the body so a test can prove the bay fit. Tests whose expected numbers depend on the size are updated on purpose (golden `nitro`/`kreisel`, eye offsets).

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, Playwright smoke tests with pytest, `node --test` for the pure modules.

**Spec:** `docs/superpowers/specs/2026-10-03-car-true-size-design.md`

## Global Constraints

- **Only the `compact` entry's `scale`, `camera.chase` and `camera.near` change.** `wheels`, `wheelR`, `drive`, `mass`, `collision`, `camera.cockpit`, `camera.bumper`, `sound` and the model geometry in `buildCompact` stay byte-identical. Do not touch `stepCar`, `collide`, `stepCamera` or `buildCar`.
- The golden trace changes in exactly two entries, `nitro` and `kreisel`. The other five (`gas`, `turn`, `handbrake`, `coast`, `brakeReverse`) must still match to 1e-6. If any of those five moves, STOP: something besides the circle radius changed.
- Updating expected values in existing tests is part of this issue (the spec decides the new numbers). Change only the values and docstrings named in the tasks; do not loosen tolerances or delete assertions.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG).
- Do not touch `data/` or `pipeline/`.
- **Animated camera:** the chase camera is smoothed, the loop clamps `dt` to 0.05 s, and a headless renderer draws under 1 fps. Browser checks of the camera **poll the end state** with `page.wait_for_function(…, timeout=120000)` (wait for *arrival* at the target, never for stillness, never a fixed `wait_for_timeout`).
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **Double scaling:** the eyes, `collision.r`, `wheels` and the blob are model metres already multiplied by `VEH.scale` (`buildCar`, `carRadius`, `vehEye`). Hand-dividing any of them by 1.3 would shrink them twice. Only `camera.chase` / `camera.near` are world metres.
- **Golden trace:** exactly `nitro` and `kreisel` re-recorded, with the reason in the comment.
- **`__mm.carSize()` is read-only:** it must restore the car's rotation and world matrix after measuring.

---

## File map

- `prototype/index.html`:
  - the `VEHICLES.compact` entry (~L857-861) and the "arcade scale" comment (~L866)
  - a new `__mm.carSize` hook next to `__mm.vehicles` (~L985)
- `prototype/tests/test_vehicles.py`: new size and camera tests; golden `nitro`/`kreisel`; cockpit eye; `scale` in the own-copy test; one docstring.
- `prototype/tests/test_look_back.py`: the two eye-view parameter rows (~L49-52).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `13a4ef7`. Verify them with `grep -n` before editing, because other PRs may have shifted them.

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the entry is still the 1.3 car.** Run each on its own from the repo root:

```bash
grep -c "compact: { model: 'compact', gltf: null, scale: 1.3," prototype/index.html
grep -c "camera: { chase: { dist: 9, h: 3.4 }, near: { dist: 6, h: 2.4 }," prototype/index.html
grep -c "window.__mm.carSize" prototype/index.html
```

Expected: `1`, `1`, `0`. If the first two are `0`, look at the current `compact` entry. If #6 (tractor and bus) has landed, the entry also has `collision: { shape: 'circle', r: 1.3, bounce: 1.25 }`: that is fine, keep `bounce`, and apply the test edits below onto #6's rewritten tests. If the scale or cameras already differ from 1.3 / 9 / 3.4 / 6 / 2.4 for another reason, STOP and report.

- [ ] **Step 2: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: Failing tests

**Files:**
- Modify: `prototype/tests/test_vehicles.py`
- Modify: `prototype/tests/test_look_back.py`

**Interfaces:**
- Consumes (to be produced in Task 2): `window.__mm.carSize()` → `{ l, w, h }`, the car body's bounding box in world metres (length along the car, width over the mirrors, height from the tyre bottoms to the roof), measured with the car's rotation zeroed and the nitro flames left out.
- Consumes (existing): `window.__mm.vehicle()`, `window.__mm.cam()` → `{ view, d, back, look }`.

- [ ] **Step 1: Write the new failing tests.** Append to `prototype/tests/test_vehicles.py`:

```python
def test_compact_car_is_true_to_size(server):
    """#69: the compact is drawn at real size -- 4.66 m long (body outline +-2.26 m plus the 0.07 m bevel), 2.18 m over
    the mirrors, 1.55 m high -- and fits a 2.5 x 5.0 m parking bay (pipeline/world_parking.py BAY_W, BAY_D)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        scale = page.evaluate("() => window.__mm.vehicle().scale")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert scale == 1.0
    assert size["l"] == pytest.approx(4.66, abs=0.02), size
    assert size["w"] == pytest.approx(2.18, abs=0.02), size
    assert size["h"] == pytest.approx(1.55, abs=0.02), size
    assert size["l"] < 5.0 and size["w"] < 2.5, size


@pytest.mark.parametrize("presses,dist,h", [(0, 6.9, 2.6), (1, 4.6, 1.85)])
def test_chase_cameras_sit_closer_to_the_true_size_car(server, presses, dist, h):
    """#69: chase/near distances are world metres. With the car at real size they move in by 1/1.3, so the car keeps
    its on-screen size (6.9 / 4.66 m ~ 9 / 6.06 m). The camera is smoothed: wait for arrival, never a fixed sleep."""
    arrived = (f"() => {{ const c = window.__mm.cam(); return c.view === {presses} && Math.abs(Math.hypot(c.d[0], c.d[2]) - {dist}) < 0.1"
               f" && Math.abs(c.d[1] - {h}) < 0.1; }}")
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        table = page.evaluate("() => window.__mm.vehicle().camera")
        assert table["chase"] == {"dist": 6.9, "h": 2.6} and table["near"] == {"dist": 4.6, "h": 1.85}, table
        page.click("#startbtn", timeout=180000)
        for _ in range(presses):
            page.keyboard.press("KeyC")
        page.wait_for_function(arrived, timeout=120000)
        b.close()
```

- [ ] **Step 2: Update the size-dependent expectations in `test_vehicles.py`.**

Replace the golden comment and the `nitro` and `kreisel` rows of `GOLDEN` (the other five rows stay exactly as they are):

```python
# [x, z, speed] recorded on main @ 6d29cb8 (unchanged code) -- the refactor must reproduce them to 1e-6.
# nitro and kreisel re-recorded for #69 (compact.scale 1.3 -> 1.0, collision radius 1.69 -> 1.3 m): the smaller car
# passes the first obstacle on the nitro straight and bounces off the Kreisel island 0.39 m later. The other five never touch anything.
```

```python
    "nitro": [1739.232868382405, -290.63114851912127, 46.21729428938969],
```

```python
    "kreisel": [1218.7183244804414, -127, 1.0311994537196747],
```

In `test_table_collision_radius_scales`, change only the docstring's radius: `compact (radius 1.69) is free` → `compact (radius 1.3) is free`. The numbers 11.8 and 12.1 stay.

In `test_table_cockpit_eye_is_used`, replace the docstring's `* 1.3` twice with `* 1.0` and the two expected offsets with:

```python
    assert before["d"] == pytest.approx([0.25, 1.22, 0.38], abs=1e-3), before
    assert after["d"] == pytest.approx([-0.5, 1.5, 0.38], abs=1e-3), after
```

In `test_set_vehicle_keeps_its_own_copy`, change `got["scale"] == 1.3` to `got["scale"] == 1.0`.

- [ ] **Step 3: Update the eye rows in `prototype/tests/test_look_back.py`.** Replace the two `parametrize` rows:

```python
    (2, [-0.25, 1.22, 0.38], [0.25, 1.22, 0.38]),          # cockpit: eye (-0.25, 1.22, -0.38) * 1.0, forward offset mirrored, driver stays left
    (3, [2.35, 0.55, 0.0], [-2.35, 0.55, 0.0]),            # bumper (2.35, 0.55, 0) * 1.0 -> rear bumper
```

- [ ] **Step 4: Run and watch them fail.** Commit and push first (Global Constraints), then:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py ../prototype/tests/test_look_back.py -q
```

Expected FAIL: `test_compact_car_is_true_to_size` (scale 1.3), both `test_chase_cameras_sit_closer_to_the_true_size_car` cases (table assert), `test_golden_trace_of_the_compact_car` and `test_set_vehicle_validates_and_round_trips` (`nitro`), `test_table_cockpit_eye_is_used`, `test_set_vehicle_keeps_its_own_copy`, both `test_hold_b_looks_back_from_the_eye_views` cases. Everything else passes.

- [ ] **Step 5: Commit.**

```bash
git add prototype/tests/test_vehicles.py prototype/tests/test_look_back.py
git commit -m "test(vehicles): expect the compact car at real size (#69)"
```

---

### Task 2: `__mm.carSize()` hook

**Files:**
- Modify: `prototype/index.html` (next to `window.__mm.vehicles`, ~L985)

**Interfaces:**
- Produces: `window.__mm.carSize()` → `{ l, w, h }` in world metres. Read-only: it restores the car's rotation and matrices.

- [ ] **Step 1: Add the hook** on its own line directly after `window.__mm.vehicle = () => structuredClone(VEH);`:

```js
window.__mm.carSize = () => { const rot = car.rotation.clone(); car.rotation.set(0, 0, 0); car.updateMatrixWorld(true); const box = new THREE.Box3(); for (const o of car.children) if (o !== flames) box.expandByObject(o, true); car.rotation.copy(rot); car.updateMatrixWorld(true); const s = box.getSize(new THREE.Vector3()); return { l: s.x, w: s.z, h: s.y }; };   // #69: body box in world metres (mirrors in, nitro flames out); precise, so spinning wheels don't inflate it
```

- [ ] **Step 2: Check the hook at today's scale.** Run only the size test:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py -q -k true_to_size
```

Expected: FAIL on `assert scale == 1.0` (still 1.3). To see the measured box, temporarily print it or read the assertion message after moving the scale assert. At 1.3 the box is about 6.06 × 2.83 × 2.01 m. If it is far off (for example the height includes something above the roof), STOP and report: the hook measures the wrong objects.

- [ ] **Step 3: Commit.**

```bash
git add prototype/index.html
git commit -m "test(prototype): __mm.carSize hook measures the car body (#69)"
```

---

### Task 3: Real-size car, closer chase cameras

**Files:**
- Modify: `prototype/index.html` (the `compact` entry ~L857-860 and the comment ~L866)

- [ ] **Step 1: Change the scale.** In the `compact` line, `scale: 1.3,` → `scale: 1.0,`. Nothing else on that line changes.

- [ ] **Step 2: Change the two chase cameras.** In the `camera:` line of `compact`, `chase: { dist: 9, h: 3.4 }, near: { dist: 6, h: 2.4 }` → `chase: { dist: 6.9, h: 2.6 }, near: { dist: 4.6, h: 1.85 }`. `cockpit` and `bumper` stay as they are (model metres, scaled by `VEH.scale`).

- [ ] **Step 3: Rewrite the stale comment** above `const car = new THREE.Group();`:

```js
// the model is drawn true to size (4.66 m, like a Mazda 3; compact.scale 1.0, #69): it fits the 2.5 x 5 m car-park bays. 1.3x made it read less like a toy car; the closer chase cams (6.9 m / 4.6 m) do that now
```

- [ ] **Step 4: Run the vehicle and look-back tests.** Push first, then:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_vehicles.py ../prototype/tests/test_look_back.py -q
```

Expected: all pass. If a golden entry other than `nitro`/`kreisel` fails, STOP (Global Constraints). If `nitro` or `kreisel` differ from the spec's values by more than 1e-6, re-check that only `scale` and the two cameras changed before suspecting the values; report rather than re-recording blind.

- [ ] **Step 5: Commit.**

```bash
git add prototype/index.html
git commit -m "fix(vehicles): draw the compact car at real size with closer chase cams (#69)"
```

---

### Task 4: CHANGELOG and playtest

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `test-todo.md`

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Changed`, delete the line

```markdown
- The car is 30 % bigger. It was true to size, but next to real-size houses and with the wide chase camera it felt like a toy car.
```

and add in its place:

```markdown
- The car is back to its real size, so it fits the parking bays and the narrow village streets. The chase cameras sit closer instead, so it still fills the picture and no longer looks like a toy car.
```

- [ ] **Step 2: test-todo.md.** Append a section at the end:

```markdown
## Car true to size (#69)

- [ ] J → Sisseln, drive to the Hallenbad-Parkplatz: the car fits inside one white bay, with room on both sides.
- [ ] On a residential road (e.g. Bodenackerstrasse) the car looks like a normal compact next to the houses and the road width.
- [ ] All four camera views (C) frame the car well: chase and near show it as big as before, cockpit and bumper sit in the right place. Hold B in each: still right.
- [ ] Collisions match the body: lamps, hydrants and walls hit where the car visibly touches them; the Holzbrücke rails scrape where the car meets them.
- [ ] Grip and steering feel: corners, handbrake slides and nitro feel as before (or note what feels off for a follow-up).
- [ ] The shadow under the car matches the smaller body.
```

- [ ] **Step 3: Commit.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): the car is back to real size (#69)"
```

---

### Task 5: Full suite and visual check

**Files:** none (unless a test regression needs a fix).

- [ ] **Step 1: Node tests.** `node --test prototype/tests/*.test.mjs` → all pass, same count as the Task 0 baseline.

- [ ] **Step 2: Full Playwright suite.** Push first, then:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q
```

Expected: all pass. A failure outside `test_vehicles.py` / `test_look_back.py` that involves the car hitting something (smoke tests on the OSM world) is a consequence of the smaller collision circle: investigate with superpowers:systematic-debugging and report it with the old and new numbers. Do not re-record unrelated expectations without explaining why the smaller car changes them. If the same test fails 3 times, STOP and report.

- [ ] **Step 3: Visual check (foreground Playwright, hand layout).** Take a screenshot in each of the four camera views at START and confirm the car is framed (chase/near: the whole car visible, about as large as on `main`; cockpit/bumper: no car body in the way). Console must be clean. Attach the screenshots' observations to the PR description; do not commit the images.
