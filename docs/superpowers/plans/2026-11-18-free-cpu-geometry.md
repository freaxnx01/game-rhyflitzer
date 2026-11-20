# Free the CPU copy of the merged world geometry (#323) Implementation Plan

**Goal:** after the world is built, the tab keeps no CPU copy of the merge sources (`parts`) and no `normal`/`uv`/
`color` arrays of the merged `MESH` roles; `position` stays so every raycast still works. Measured on the full world:
~1,050 → ~365 MB ArrayBuffer-inclusive JS heap. Nothing changes on screen.

**Spec:** `docs/superpowers/specs/2026-11-18-free-cpu-geometry-design.md` (measurements, reader list).

**Architecture:** all in `index.html`, at the merge loop (`for (const role in parts) { … MESH[role] = m; }`, about
line 3210). Two small top-level helpers next to it, one read-only test hook next to `window.__mm.gpu`.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependency, `const`/`let` only. three.js stays r170.
- Do not touch the forest, `treeBill`, the colliders, `applyStyle` or any other `mergeGeometries` call.
- TDD: write the failing test, run it red, implement, run green. Never edit a test to make it pass.
- Browser tests: run **only** the files named below, in the **foreground**, never `run_in_background`, with a
  generous `timeout`. Never the full Playwright suite. Commit and push the branch **before** each Playwright run.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Fixed`. Never `git cliff -o`.
- Commits: Conventional Commits, scope `world`, footer `Refs #323`, last commit `Closes #323`. Branch
  `fix/323-free-cpu-geometry`. Open a draft PR after Task 1.

Files: changed `index.html`, `CHANGELOG.md`; new `tests/test_cpu_geometry.py`.

---

### Task 1: failing browser test (`tests/test_cpu_geometry.py`)

- [ ] Create the file (hand-traced layout, same setup as `tests/test_beam.py`):

```python
"""#323: after the world is built, the merged roles keep only `position` on the CPU and the merge sources are released;
every CPU reader (beam pick, the role raycasts, the style switch) still works. Hand-traced layout. Slow: foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
READY = "() => window.__mm && window.__mm.sim && window.__mm.cpuGeometry && document.querySelector('#worldstatus')?.textContent"
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex
GROUND = (1000, 420)    # screen point on terrain below the settled chase camera (tests/test_beam.py)


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def wait_frames(page, n=3):
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def test_merged_roles_keep_only_positions_on_the_cpu(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page, 5)
        g = page.evaluate("() => window.__mm.cpuGeometry()")
        b.close()
    assert g["partsLeft"] == 0, g
    assert g["builtOther"] > 0, g
    assert g["retainedOther"] <= 0.1 * g["builtOther"], g          # roles never drawn yet may still hold theirs
    for role in ("grass", "roadOsm", "roadPlain"):
        if role in g["roles"]:
            assert g["roles"][role]["other"] == 0, (role, g["roles"][role])
            assert g["roles"][role]["position"] > 0, (role, g["roles"][role])
    assert errors == [], errors


def test_cpu_readers_still_work_after_the_arrays_are_freed(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page, 5)
        assert page.evaluate("() => window.__mm.cpuGeometry().roles.grass.other") == 0
        top = page.evaluate(f"() => window.__mm.topAt({SISSELN[0]}, {SISSELN[1]})")
        hits = page.evaluate(f"() => window.__mm.rayHits({SISSELN[0]}, {SISSELN[1]})")
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        for k in ("smooth", "original"):
            page.evaluate(f"() => window.__mm.setStyle('{k}')")
            wait_frames(page, 3)
        b.close()
    assert top is not None and top["role"], top
    assert any(v is not None for v in hits.values()), hits
    assert pick is not None and "x" in pick and "z" in pick, pick
    assert errors == [], errors
```

- [ ] Commit, push, run `pytest tests/test_cpu_geometry.py -x` (foreground, timeout ≥ 900 s). Expected: RED
  (`cpuGeometry` missing → `READY` times out). To keep the red run short you may run with `--timeout`; red is the
  point, not the wait.

### Task 2: release the merge sources and drop the arrays after upload (`index.html`)

- [ ] Directly above the merge loop add the helpers:

```js
// #323: the merged roles exist twice, on the GPU and as typed arrays in the tab (~365 MB on the full world, plus
// ~365 MB more in `parts`). After the first upload only `position` stays on the CPU: the raycasts (beamPick, the
// test hooks) need it. three.js r170's Mesh.raycast also reads uv/normal when present, so rays go through a
// position-only pick geometry that shares the same attribute and bounds.
const CPU_GEO = { builtOther: 0 };
function dropArray() { this.array = null; }
function pickGeometry(g) {
  const pick = new THREE.BufferGeometry(); pick.setAttribute('position', g.attributes.position);
  g.computeBoundingSphere(); g.computeBoundingBox(); pick.boundingSphere = g.boundingSphere; pick.boundingBox = g.boundingBox;
  return pick;
}
function raycastPositions(raycaster, hits) { const full = this.geometry; this.geometry = this.userData.pick; try { THREE.Mesh.prototype.raycast.call(this, raycaster, hits); } finally { this.geometry = full; } }
function freeCpuCopy(m) {
  const g = m.geometry; m.userData.pick = pickGeometry(g); m.raycast = raycastPositions;
  for (const [name, a] of Object.entries(g.attributes)) if (name !== 'position') { CPU_GEO.builtOther += a.array.byteLength; a.onUpload(dropArray); }
}
```

- [ ] In the merge loop, after `MESH[role] = m;`, add `freeCpuCopy(m); delete parts[role];`. All writes to `parts`
  happen before this loop (verified: last write `index.html:2608`, `hideoutBuild` runs at `:2935`).
- [ ] Next to `window.__mm.gpu` add the read-only hook:

```js
window.__mm.cpuGeometry = () => { const roles = {}; let retainedOther = 0; for (const [role, m] of Object.entries(MESH)) { const r = roles[role] = { position: 0, other: 0 }; for (const [name, a] of Object.entries(m.geometry.attributes)) { const n = a.array ? a.array.byteLength : 0; if (name === 'position') r.position += n; else { r.other += n; retainedOther += n; } } } return { partsLeft: Object.keys(parts).length, builtOther: CPU_GEO.builtOther, retainedOther, roles }; };   // #323: CPU bytes the merged roles still hold, for the test
```

- [ ] Run `pytest tests/test_cpu_geometry.py` (foreground). Expected: both GREEN.
- [ ] Then, foreground, the files that exercise the role raycasts and the style switch:
  `pytest tests/test_beam.py tests/test_field_depth.py tests/test_fields.py -x`. Expected: GREEN. If one fails on
  a reader not listed in the spec, do not widen the freeing: keep that role's arrays (skip `freeCpuCopy` for it)
  and say so in the PR.
- [ ] Commit `fix(world): free the CPU copy of the merged world geometry after upload`, push.

### Task 3: changelog and PR

- [ ] `CHANGELOG.md` → `[Unreleased]` → `### Fixed`, player-facing, e.g.: "The game needs about 700 MB less memory
  once the world is loaded, so phones (an iPhone reloaded the page over and over) can keep it open."
- [ ] Commit `docs(changelog): note the lower memory use`, footer `Closes #323`, push, mark the PR ready. In the PR
  body note: the real-phone measurement (#323 to-do 3) is a manual follow-up after deploy.
