# Car preview after a run (#210) — implementation plan

**Goal:** `resetCar()` puts the car mesh back with `P`, so **Choose car** (and the start screen) show the car after a run was abandoned.
**Spec:** `docs/superpowers/specs/2026-10-10-car-preview-after-menu-design.md`. **Local files only:** `prototype/index.html`, `prototype/tests/test_carselect.py`, `CHANGELOG.md`. GLM-ready (no data, no pipeline).

## Global constraints

- Branch `fix/210-car-preview-after-menu`; PR title `fix(vehicles): show the car on Choose car after a run (#210)`, body `Closes #210`.
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; this change adds none.
- Playwright runs in the foreground (never `run_in_background`), with `timeout` 600 s: the first frame can take 30 s+. Run only `test_carselect.py` (and the one test named below), not the full suite.
- pytest missing? `pip install --target /tmp/pt pytest` and run with `PYTHONPATH=/tmp/pt`; never into the repo or system.
- Never loosen an assertion; never edit another test.

### Task 1: Failing test and the `pos` hook

**Files:** modify `prototype/index.html` (one line), `prototype/tests/test_carselect.py` (append one test).

- [ ] **Step 1: add `pos` to the read-only hook.** In `prototype/index.html` find the line starting `window.__mm.carPose = () => ({ rot: [car.rotation.x, car.rotation.y, car.rotation.z], visible: car.visible });` and replace the object so it reads:

```js
window.__mm.carPose = () => ({ rot: [car.rotation.x, car.rotation.y, car.rotation.z], pos: [car.position.x, car.position.y, car.position.z], visible: car.visible });
```

Keep the trailing `// #124: ...` comment on that line as it is. (`test_debug.py` reads only `rot` and `visible`, so it is unaffected.)

- [ ] **Step 2: write the failing test.** Append to `prototype/tests/test_carselect.py` (it already has `open_page`, `open_carsel`, `wait_frames`, `T`):

```python
def test_car_mesh_follows_the_reset_after_a_run_is_abandoned(server):
    """#210: Main menu sends P back to the start; the mesh must go with it, or Choose car shows only the shadow."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("() => document.getElementById('startbtn').click()")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.step(2, ['KeyW', 'KeyA'])")        # drive off and turn: mesh and P leave the start
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.evaluate("() => document.getElementById('pausemenu').click()")  # state is still 'armed': straight to the menu, no confirm
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("""() => { const c = window.__mm.car(), p = window.__mm.carPose();
            return { dx: p.pos[0] - c.x, dy: p.pos[1] - c.y, dz: p.pos[2] - c.z, yaw: p.rot[1] + window.__mm.heading() }; }""")
        b.close()
    assert max(abs(got["dx"]), abs(got["dy"]), abs(got["dz"])) < 1e-6, got
    assert abs(got["yaw"]) < 1e-6, got
    assert errors == []
```

- [ ] **Step 3: run it, expect FAIL.**

```bash
cd /home/freax/repos/github/freaxnx01/public/game-rhyflitzer   # your worktree root
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_carselect.py -k car_mesh_follows -x -q
```

Expected: `AssertionError` with `dx` around 5 (metres) and a `yaw` far from 0. A `KeyError: 'pos'` means Step 1 was skipped.

### Task 2: Fix `resetCar`

**Files:** modify `prototype/index.html` (one function).

- [ ] **Step 1: edit.** Find the line starting `function resetCar() { stopAuto('reset'); FLY.on = false; P.x = P.safe[0];` . Its tail reads `... P.splash = 0; P.hinted = false; WHEEL_STATE.yaw = 0; restShadow(); }` followed by a trailing comment. Insert the mesh pose before `restShadow();`:

Before: `WHEEL_STATE.yaw = 0; restShadow(); }`
After: `WHEEL_STATE.yaw = 0; car.position.set(P.x, P.y, P.z); car.rotation.set(0, -P.th, 0); restShadow(); }`

Leave the trailing `// safe spots are never on a bridge ...` comment untouched.

- [ ] **Step 2: run the new test, expect PASS; then the whole file.**

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_carselect.py -q
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_pause.py -q -k main_menu
```

Expected: all pass (`test_carselect.py` has ~12 tests, a few minutes).

### Task 3: Changelog and wrap-up

**Files:** modify `CHANGELOG.md`.

- [ ] **Step 1:** under `## [Unreleased]` → `### Fixed` (the `### Fixed` list already exists) append, in the player's voice:

`- **Choose car** shows your car again after you gave up a run: it used to stay where the run ended and the stage showed only an empty road with the car's shadow.`

- [ ] **Step 2:** `git diff --stat` shows exactly three files (`prototype/index.html`, `prototype/tests/test_carselect.py`, `CHANGELOG.md`). Commit `fix(vehicles): show the car on Choose car after a run (#210)`, push, open the PR.
