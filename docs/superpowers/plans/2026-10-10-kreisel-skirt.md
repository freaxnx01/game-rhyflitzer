# Smile-Kreisel skirt (#222) — implementation plan

**Goal:** the roundabout's apron and island reach down to the ground on every side, so nothing floats.
**Spec:** `docs/superpowers/specs/2026-10-10-kreisel-skirt-design.md`. **Files:** `prototype/index.html`, new `prototype/tests/test_kreisel.py`, `CHANGELOG.md`. Uses the committed `data/world_hochrhein.json` and `data/terrain_hochrhein.mmh` as they are: GLM-ready (no pipeline, no rebuild).

## Global constraints

- Branch `fix/222-kreisel-skirt`; PR title `fix(world): the Smile-Kreisel no longer floats (#222)`, body `Closes #222`.
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement. The functions below are long single lines: edit only the quoted fragments, leave the rest of each line untouched, add no comments inside them.
- Playwright in the foreground with `timeout` 600 s (first frame can take 30 s+), `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Run only the files named. Never loosen an assertion.
- pytest missing: `pip install --target /tmp/pt pytest`, run with `PYTHONPATH=/tmp/pt`.

### Task 1: Failing test and the hook

**Files:** modify `prototype/index.html`; create `prototype/tests/test_kreisel.py`.

- [ ] **Step 1: the helper.** In `prototype/index.html` find the line `function smileKreisel(px, py) { const [x, z] = W(px, py); smileKreiselAt(x, z); }` and insert directly **above** the comment line before it (`// Sisseln landmarks: the Smile-Kreisel and the Hallenbad`) a new line:

```js
function lowestTerrain(x, z, r) { let low = terrainH(x, z); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; low = Math.min(low, terrainH(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return low; }
```

- [ ] **Step 2: the hook and `bottom`.** In the line starting `const isl = new THREE.CylinderGeometry(isl_r - 1, isl_r, 1.1, 24);` find `KREISEL.push({ x, z, b, apron: inner + 1.1 });` and change it to `KREISEL.push({ x, z, b, apron: inner + 1.1, bottom: b + 0.025 });` (still the old, floating value: the fix in Task 2 changes it). Then, right after the line `window.__mm.carPose = ...` (any `window.__mm.* =` line works) add:

```js
window.__mm.kreisel = () => KREISEL.map(k => ({ x: k.x, z: k.z, b: k.b, apron: k.apron, bottom: k.bottom, low: lowestTerrain(k.x, k.z, k.apron) }));
```

- [ ] **Step 3: the test.** Create `prototype/tests/test_kreisel.py`:

```python
"""#222: the Smile-Kreisel's apron and island reach down to the ground on every side (no floating disc).
Real world and terrain. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.kreisel && document.querySelector('#worldstatus')?.textContent"


def test_kreisel_apron_reaches_below_the_lowest_ground_under_it(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 320, "height": 180})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function(READY, timeout=300000)
        got = page.evaluate("() => window.__mm.kreisel()")
        b.close()
    assert got, "the world has a roundabout"
    for k in got:
        assert k["bottom"] <= k["low"] - 0.2, k
    assert errors == []
```

- [ ] **Step 4: run, expect FAIL** (`bottom` is `b + 0.025`, above `low - 0.2`):

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_kreisel.py -q
```

### Task 2: The skirt

**Files:** modify `prototype/index.html` (two fragments in `smileKreiselAt`).

- [ ] **Step 1: apron.** In `smileKreiselAt` find the fragment

`const apron = new THREE.CylinderGeometry(inner + 0.7, inner + 1.1, 0.35, 28); apron.translate(x, b + 0.2, z);`

and replace it with

`const skirt = Math.max(0, b - lowestTerrain(x, z, inner + 1.1)) + 0.3, apron = new THREE.CylinderGeometry(inner + 0.7, inner + 1.1, 0.35 + skirt, 28); apron.translate(x, b + 0.375 - (0.35 + skirt) / 2, z);`

(top stays at `b + 0.375`).

- [ ] **Step 2: island and `bottom`.** In the next line find

`const isl = new THREE.CylinderGeometry(isl_r - 1, isl_r, 1.1, 24); isl.translate(x, b + 0.55, z);`

and replace it with

`const skirtI = Math.max(0, b - lowestTerrain(x, z, isl_r)) + 0.3, isl = new THREE.CylinderGeometry(isl_r - 1, isl_r, 1.1 + skirtI, 24); isl.translate(x, b + 0.55 - skirtI / 2, z);`

and in the same line change `bottom: b + 0.025 }` (from Task 1) to `bottom: b + 0.025 - skirt }`. The island's `pushOBB(...)` collision box in that line is unchanged.

- [ ] **Step 3: run, expect PASS**, then the suites that touch the roundabout or the car on it:

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_kreisel.py prototype/tests/test_crash.py -q
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_jump.py -q -k "kreisel or Kreisel"
```

Expected: pass. `test_crash.py` pins the island radius (9.5 hand path): unchanged because only heights moved.

### Task 3: One look, then changelog

- [ ] **Step 1 (manual, once):** serve with `python3 -m http.server 8000`, press **J**, type "smile", Enter, press **C** to get a lower camera and walk around the roundabout: no gap or dark rim under the apron or island. (Not a test.)
- [ ] **Step 2:** `CHANGELOG.md` `[Unreleased]` → `### Fixed`: `- The Smile-Kreisel in Sisseln no longer floats: its cobbled apron and the flower island now reach down to the slope on the downhill side instead of hanging in the air with a dark rim under them.`
- [ ] **Step 3:** `git diff --stat` lists `prototype/index.html`, `prototype/tests/test_kreisel.py`, `CHANGELOG.md` only. Commit, push, open the PR.
