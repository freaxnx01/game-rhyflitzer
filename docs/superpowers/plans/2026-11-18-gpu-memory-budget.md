# Cut the GPU memory of the merged world (#1065) Implementation Plan

**Goal:** the merged roles are drawn indexed where that is smaller and with byte-sized `normal`/`color`; identical
sign textures are shared. Full world: merged-role GPU bytes 348 → ~130 MB, duplicate sign textures 39 → <1 MB.
Nothing visible changes.

**Spec:** `docs/superpowers/specs/2026-11-18-gpu-memory-budget-design.md` (measurements, #323 fit).

**Prerequisite:** #323 (PR#1066) is merged. Start from `main` with its `pickGeometry`/`freeCpuCopy` above the merge loop
(`for (const role in parts) { const g = mergeGeometries(parts[role], false); … freeCpuCopy(m); delete parts[role]; }`).

**Global constraints:**

- Buildless: no `package.json`, no new dependency, `const`/`let` only, three.js stays r170.
- Do not touch the forest, `treeBill`, `ribbonGeo`, `disc()`'s geometry, `applyStyle`, `freeCpuCopy`/`dropArray`.
- TDD: failing test first, run it red, implement, run green. Never edit a test to make it pass.
- Browser tests: only the files named below, **foreground**, never `run_in_background`, generous `timeout`. Never the
  full suite. Commit and push the branch **before** each Playwright run.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Fixed`. Never `git cliff -o`.
- Commits: Conventional Commits, scope `world`, footer `Refs #1065`, last commit `Closes #1065`. Branch
  `fix/1065-gpu-memory`. Draft PR after Task 1.

Files: changed `index.html`, `CHANGELOG.md`; new `tests/test_gpu_geometry.py`.

---

### Task 1: failing browser test (`tests/test_gpu_geometry.py`)

- [ ] Create (full Hochrhein world, as `tests/test_smoke.py`'s OSM tests load it):

```python
"""#1065: on the full world the merged roles are indexed where that pays, with byte-sized normal/colour, and identical
sign textures are shared. Slow: foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.gpuGeometry && document.querySelector('#worldstatus')?.textContent"
MB = 1048576


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=300000)
    return b, page, errors


def test_merged_roles_use_the_compact_gpu_layout(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        g = page.evaluate("() => window.__mm.gpuGeometry()")
        dup = page.evaluate("() => window.__mm.duplicateTextures()")
        b.close()
    for role, limit in (("grass", 0.30), ("roadPlain", 0.40)):   # measured 0.20 / 0.30; today 1.0
        r = g[role]
        assert r["index"] >= 2 * r["verts"], (role, r)
        assert r["bytes"] <= limit * r["flatBytes"], (role, r)
    for role, r in g.items():
        assert r["formats"]["position"] == "Float32Array/3", (role, r)
        assert r["formats"].get("normal", "Int8Array/4") == "Int8Array/4", (role, r)
        assert r["formats"].get("color", "Uint8Array/4") == "Uint8Array/4", (role, r)
    assert sum(r["bytes"] for r in g.values()) <= 170 * MB, {k: r["bytes"] // MB for k, r in g.items()}   # today 348
    assert dup["mb"] <= 2, dup                                                                         # today ~29
    assert errors == [], errors
```

- [ ] Commit, push, run `pytest tests/test_gpu_geometry.py -x` (foreground, timeout ≥ 900 s). Expected RED
  (`gpuGeometry` missing → `READY` times out).

### Task 2: keep indices, compact formats (`index.html`)

- [ ] `push` (about line 1729) keeps indexed sources indexed, still as a private copy:

```js
function push(role, geo) { (parts[role] ||= []).push(geo.index ? geo.clone() : geo); }   // #1065: mergeRole decides indexed or not
```

- [ ] Terrain (build-the-world block, about lines 2571 and 2584): `parts.grass = [ground.toNonIndexed()];` →
  `parts.grass = [ground];` and `parts.grass.push(p.toNonIndexed());` → `parts.grass.push(p);`.
- [ ] Directly above the merge loop (below #323's helpers) add:

```js
// #1065: a role is drawn indexed when that is smaller (terrain and junction discs share ~5 corners per vertex), with
// normal/colour as normalized bytes in 4 components (Metal wants 4-byte strides). uv and position stay Float32.
const GPU_VERTEX_BYTES = 28;   // position 12 + normal 4 + uv 8 + color 4
function withIndex(g) { if (!g.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i), 1)); return g; }
function compactAttribute(g, name, Type, scale, w) {
  const a = g.attributes[name]; if (!a || a.itemSize !== 3) return;
  const lo = Type === Int8Array ? -1 : 0, out = new Type(a.count * 4);
  for (let i = 0; i < a.count; i++) { for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(clamp(a.array[i * 3 + c], lo, 1) * scale); out[i * 4 + 3] = w; }
  g.setAttribute(name, new THREE.BufferAttribute(out, 4, true));
}
function gpuStats(g, corners) {
  const formats = {}; let bytes = g.index ? g.index.array.byteLength : 0;
  for (const [n, a] of Object.entries(g.attributes)) { formats[n] = a.array.constructor.name + '/' + a.itemSize; bytes += a.array.byteLength; }
  return { verts: g.attributes.position.count, index: g.index ? g.index.count : 0, formats, bytes, flatBytes: corners * 44 };
}
function mergeRole(list) {
  const corners = list.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count), 0), stored = list.reduce((s, g) => s + g.attributes.position.count, 0);
  const indexed = list.some((g) => g.index) && stored * GPU_VERTEX_BYTES + corners * 4 < corners * GPU_VERTEX_BYTES;
  const g = mergeGeometries(list.map((p) => indexed ? withIndex(p) : p.index ? p.toNonIndexed() : p), false);
  compactAttribute(g, 'normal', Int8Array, 127, 0); compactAttribute(g, 'color', Uint8Array, 255, 255);
  g.userData.gpu = gpuStats(g, corners);   // the arrays are dropped after upload (#323), so the byte count is kept here
  return g;
}
```

- [ ] In the merge loop: `mergeGeometries(parts[role], false)` → `mergeRole(parts[role])`. Nothing else in the loop.
- [ ] In #323's `pickGeometry`, after `pick.setAttribute('position', …)`, add
  `if (g.index) pick.setIndex(g.index);   // #1065: an indexed role is raycast through its index`.
- [ ] Next to `window.__mm.cpuGeometry` add:

```js
window.__mm.gpuGeometry = () => Object.fromEntries(Object.entries(MESH).map(([r, m]) => [r, m.geometry.userData.gpu]));   // #1065: GPU layout per role, for the test
```

- [ ] Commit `perf(world): draw the merged roles indexed with byte-sized normals and colours`, push.

### Task 3: share identical sign textures (`index.html`)

- [ ] Below `const textTex = …` (about line 1256):

```js
const SHARED_TEX = new Map();   // #1065: identical sign canvases (a stop in both directions, every "P" board) share one texture; signs are never disposed
function sharedTex(key, make) { if (!SHARED_TEX.has(key)) SHARED_TEX.set(key, make()); return SHARED_TEX.get(key); }
```

- [ ] Use it at the four call sites (wrap the existing call unchanged in `() => …`):
  - `busStop`: `map: stopSignTex(name, rows)` → `map: sharedTex('stop|' + name + '|' + JSON.stringify(rows), () => stopSignTex(name, rows))`
  - `busStop`: `map: timetableTex(sheetLines(rows))` → `map: sharedTex('sheet|' + JSON.stringify(sheetLines(rows)), () => timetableTex(sheetLines(rows)))`
  - `parkingSign`: the `textTex('P', 256, 256, …)` board → `sharedTex('P', () => textTex('P', 256, 256, …))`
  - `parkingSign`: the `textTex(name, 512, 96, …)` plate → `sharedTex('plate|' + name, () => textTex(name, 512, 96, …))`
- [ ] Next to `gpuGeometry` add the test hook:

```js
window.__mm.duplicateTextures = () => { const seen = new Set(); let mb = 0; scene.traverse((o) => { for (const m of [].concat(o.material || [])) { const t = m.map; if (!t || !t.image?.toDataURL || seen.has(t)) continue; seen.add(t); const k = t.image.width + 'x' + t.image.height + t.image.toDataURL(); if (seen.has(k)) mb += t.image.width * t.image.height * 4 / 1048576; else seen.add(k); } }); return { mb }; };   // #1065: MB of canvas textures that copy another pixel for pixel
```

- [ ] Run `pytest tests/test_gpu_geometry.py` (foreground). Expected GREEN.
- [ ] Then, foreground, the readers and the look: `pytest tests/test_cpu_geometry.py tests/test_beam.py tests/test_bus_stops.py -x`
  and `pytest tests/test_smoke.py -x -k "grass_and_fields_stay_below_the_road or wheels_do_not_sink_into_the_road or parking_loaded"`.
  Expected GREEN (`sinkCheck`/`grassOverRoad` raycast `roadPlain` and the terrain through the index). If a role misdraws
  or a ray misses, do not loosen a test: exclude that role from compaction/indexing and say so in the PR.
- [ ] Commit `perf(world): share identical sign textures`, push.

### Task 4: changelog and PR

- [ ] `CHANGELOG.md` → `[Unreleased]` → `### Fixed`, player-facing, e.g.: "The world needs about 250 MB less graphics
  memory (roads, ground and signs are stored more compactly), so phones keep the game open." Commit
  `docs(changelog): note the lower graphics memory`, footer `Closes #1065`, push, mark the PR ready. PR body: the
  measured `gpuGeometry` totals before/after, and that the iPhone check is a manual follow-up after deploy.
