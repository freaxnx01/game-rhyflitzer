# Dark Car Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The car's windows are near-black, opaque, shiny glass, and the helicopter shares the same glass.

**Architecture:** `carMats.glass` in `prototype/index.html` becomes an opaque near-black `MeshPhongMaterial`. The helicopter's window mesh uses `carMats.glass` instead of its own material. Each glass mesh is tagged `userData.glass = true`, and a read-only `window.__mm.glass()` hook reports the material on the car and the helicopter for a Playwright test.

**Tech Stack:** Vanilla JS, three.js (`MeshPhongMaterial`), pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-08-car-windows-design.md` (issue #123).

## Global Constraints

- Glass: `new THREE.MeshPhongMaterial({ color: 0x0b0f14, shininess: 140, specular: 0xffffff })`. No `transparent`, no `opacity`.
- The car and the helicopter share **one** material, `carMats.glass`. It is never disposed (`SHARED_CAR_MATS`, `prototype/index.html:1115`).
- The cockpit view is unchanged; do not change any camera or eye values.
- Buildless static game: no new packages, no framework (CLAUDE.md).
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest …`. Commit and push before long verification.

## Review Focus

1. **Switching the vehicle rebuilds the car.** Expected: the rebuilt car still has the dark glass, tagged and found by the hook. Pinned in Task 1 (the test calls `use_vehicle` and checks again).
2. **The helicopter is built once at load, the car on every rebuild.** Expected: `freeCar()` never disposes the shared glass, so the helicopter keeps it after a car rebuild. Pinned in Task 1 (the helicopter is checked after the rebuild too).
3. **Cockpit and bumper views.** Expected: they look out through or past the glass exactly as before. Pinned by the existing `test_look_back.py` and `test_vehicles.py::test_table_cockpit_eye_is_used`, run in Task 1 Step 6.
4. **The style switch (`applyStyle`).** Expected: it leaves the glass alone; it only changes `carMats.body` (`index.html:1136`). No code changes here, so no new test.
5. **A future vehicle model without a glass mesh.** Expected: the hook reports `null` rather than throwing. Pinned by the hook's `m && …` guard in Task 1 Step 3; nothing to test until such a model exists.

---

### Task 1: Dark, opaque, shared glass

**Files:**
- Modify: `prototype/index.html:1095` (`carMats.glass`), `:1102` (car glass mesh), `:1126` (helicopter glass), next to `window.__mm.carSize` (~`:1271`) (new hook)
- Test: `prototype/tests/test_vehicles.py` (append)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Changed`), `test-todo.md` (append a section)

**Interfaces:**
- Produces: `window.__mm.glass(): { car: {color: number, transparent: boolean, opacity: number} | null, heli: {…} | null }`.
- Consumes: `open_hand(p, server)` and `use_vehicle(page, patch_js)` from `prototype/tests/test_vehicles.py`; `car`, `heli`, `carMats` in `index.html`.

- [ ] **Step 1: Write the failing test.** Append to `prototype/tests/test_vehicles.py`:

```python
GLASS_JS = "() => window.__mm.glass()"


def assert_dark_opaque(g):
    for k in ("car", "heli"):
        m = g[k]
        assert m is not None, (k, g)
        assert m["transparent"] is False and m["opacity"] == 1, (k, m)
        assert all((m["color"] >> s) & 0xFF <= 0x20 for s in (16, 8, 0)), (k, hex(m["color"]))
    assert g["car"]["color"] == g["heli"]["color"], g


def test_windows_are_dark_and_opaque(server):
    """#123: car and helicopter share one dark, opaque glass, not a murky half see-through blue, also after a car rebuild."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        before = page.evaluate(GLASS_JS)
        use_vehicle(page, "c.drive.top = 30")                  # rebuilds the car (freeCar + buildCar)
        after = page.evaluate(GLASS_JS)
        b.close()
    assert_dark_opaque(before)
    assert_dark_opaque(after)
```

- [ ] **Step 2: Run it to verify it fails.**

Run (repo root): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_vehicles.py::test_windows_are_dark_and_opaque -q -p no:cacheprovider`
Expected: FAIL with `TypeError: window.__mm.glass is not a function`.

- [ ] **Step 3: Implement in `prototype/index.html`.**

3a. In `const carMats = { … }` (line 1095), replace
`glass: new THREE.MeshPhongMaterial({ color: 0x1a2430, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.92 })`
with
`glass: new THREE.MeshPhongMaterial({ color: 0x0b0f14, shininess: 140, specular: 0xffffff })`.
Add `// #123: dark, opaque glass, shared with the helicopter` at the end of that line, if it has no trailing comment already.

3b. Line 1102: replace `g.add(new THREE.Mesh(glassG, carMats.glass));` with
`const glassM = new THREE.Mesh(glassG, carMats.glass); glassM.userData.glass = true; g.add(glassM);`.

3c. Line 1126, in the helicopter block: replace `glass = new THREE.MeshPhongMaterial({ color: 0x1a2430, shininess: 140, specular: 0xffffff })` with `glass = carMats.glass`. In the same block, change `const win = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), glass);` to `const win = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), glass); win.userData.glass = true;`.

3d. Directly after the `window.__mm.carSize = …` line, add:

```js
// #123: the glass actually on the car and the helicopter (read-only, for the test)
window.__mm.glass = () => { const find = (root) => { let m = null; root.traverse((o) => { if (!m && o.userData.glass) m = o.material; }); return m && { color: m.color.getHex(), transparent: m.transparent, opacity: m.opacity }; }; return { car: find(car), heli: find(heli) }; };
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: the Step 2 command.
Expected: `1 passed`.

- [ ] **Step 5: Docs.** In `CHANGELOG.md`, under `## [Unreleased]` → `### Changed`, add at the top:

```markdown
- The car's windows are dark, tinted glass now — the same on the helicopter — instead of a murky, half see-through blue.
```

Append to `test-todo.md`:

```markdown

## Dark car windows (#123)

- [ ] All four camera views (C): the windows read as dark, tinted glass with a highlight, not as a blue block.
- [ ] Where the glass meets the body there is no flicker, also while driving and turning.
- [ ] Cockpit and bumper view: the view out is unchanged.
- [ ] Helicopter (F): its round window is the same dark glass.
```

- [ ] **Step 6: Commit and push, then run the regression.**

```bash
git add prototype/index.html prototype/tests/test_vehicles.py CHANGELOG.md test-todo.md
git commit -m "fix(vehicles): dark, opaque car windows shared with the helicopter (#123)"
git push
```

Run: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_vehicles.py prototype/tests/test_look_back.py -q -p no:cacheprovider`
Then: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_heli.py -q -p no:cacheprovider`
Expected: all pass (test_vehicles 14, test_look_back 6, test_heli 11). A failure: fix the implementation, never the test.
