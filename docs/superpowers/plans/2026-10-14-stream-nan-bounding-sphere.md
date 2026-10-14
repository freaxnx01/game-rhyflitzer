# Stream with a repeated point: NaN water vertices — implementation plan (#319)

**Goal:** no generated world logs `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN`. The pipeline stops writing a stream with two equal consecutive points, and the prototype's `ribbonGeo` tolerates one in worlds that already have it.

**Measured cause (see the spec):** `pipeline/world_water.py:97-98` rounds stream points to 0.1 m after cutting; a cut within 5 cm of a vertex leaves two equal points (Ehrendingen `Moosbach` `[439.0, -831.4]` ×2, Lenzburg stream 9 `[-437.8, 751.0]` ×2). `ribbonGeo` (`prototype/index.html:883-886`) divides by the zero segment length → NaN edge points → NaN vertices 2436–2451 in the merged `water` mesh.

**Architecture:** a dedupe step in the pipeline at the source, plus a pure `dropRepeats` helper in `prototype/world.js` used by `ribbonGeo` as the client guard.

**Global constraints**

- Touch only `pipeline/world_water.py`, `pipeline/tests/test_water.py`, `prototype/world.js`, `prototype/tests/world.test.mjs`, `prototype/index.html` (the one `ribbonGeo` line and the `./world.js` import list), `prototype/tests/test_world.py`, `CHANGELOG.md`.
- TDD: each test is written and seen failing before the code.
- Targeted tests only: `pytest pipeline/tests/test_water.py`, `node --test prototype/tests/world.test.mjs`, and the one new Playwright test. Do **not** run the full Playwright suite (~2 h).
- Run Playwright in the foreground, under a memory cap where available: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 …`. Commit and push before verifying.
- No new dependencies. No change to the world format or to `version.js`.

---

## Task 1 — pipeline: no repeated points in a stream

**Files:** `pipeline/world_water.py`, `pipeline/tests/test_water.py`.

**Interfaces:** `streams(areas, ways, clip, roads=())` unchanged in signature; its `pts` never contain two equal consecutive points, and a part with fewer than two points left is skipped.

### Step 1 — Write the failing test

Append to `pipeline/tests/test_water.py`:

```python
def test_stream_has_no_repeated_points_after_rounding():
    """#319: a cut within 5 cm of a vertex rounded to the same 0.1 m point; the prototype's ribbon then divided by a
    zero segment length and the water mesh got NaN vertices (Ehrendingen's Moosbach, a Lenzburg stream)."""
    brook = Way(11, {"waterway": "stream", "name": "Moosbach"}, shapely.LineString([(-10, 50), (0.04, 50), (200, 50)]))
    st = Wt.streams([], [brook], CLIP)
    assert len(st) == 1
    pts = st[0]["pts"]
    assert pts[0] == [0.0, 50.0] and pts[-1] == [200.0, 50.0]
    assert all(a != b for a, b in zip(pts, pts[1:]))
```

### Step 2 — Run it, see it fail

```bash
cd pipeline && python3 -m pytest -q tests/test_water.py -k repeated_points
```

Expected: FAIL — `pts` is `[[0.0, 50.0], [0.0, 50.0], [200.0, 50.0]]`.

### Step 3 — Implement

In `pipeline/world_water.py`, add above `streams()`:

```python
def _rounded(coords):
    """Points rounded to 0.1 m, without consecutive repeats: a cut close to a vertex rounds onto it (#319)."""
    out = []
    for x, z in coords:
        p = [round(x, 1), round(z, 1)]
        if not out or p != out[-1]:
            out.append(p)
    return out
```

and replace the append in `streams()`:

```python
        for part in parts:
            if part.is_empty or part.length < 5:
                continue
            pts = _rounded(part.coords)
            if len(pts) < 2:
                continue
            out.append({"name": w.tags.get("name", ""), "w": _width(w.tags, kind), "pts": pts})
```

### Step 4 — Run the water tests

```bash
cd pipeline && python3 -m pytest -q tests/test_water.py
```

Expected: all pass. Then commit: `fix(world): drop repeated stream points after rounding (#319)`.

---

## Task 2 — client: `dropRepeats` and `ribbonGeo`

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`, `prototype/index.html`.

**Interfaces:** `export function dropRepeats(pts)` — a new array with every point that equals its predecessor (both coordinates) removed; the first point is always kept; the input is not modified.

### Step 1 — Write the failing test

In `prototype/tests/world.test.mjs`, add `dropRepeats` to an import from `'../world.js'` (e.g. a new line `import { dropRepeats } from '../world.js';`) and append:

```js
test('dropRepeats: consecutive repeated points go, the rest stays (#319)', () => {
  const pts = [[439, -831.4], [439, -831.4], [423.8, -841.7], [423.8, -841.7], [414.9, -847.2]];
  assert.deepEqual(dropRepeats(pts), [[439, -831.4], [423.8, -841.7], [414.9, -847.2]]);
  assert.equal(pts.length, 5);                                            // input untouched
  assert.deepEqual(dropRepeats([[0, 0], [5, 0], [0, 0]]), [[0, 0], [5, 0], [0, 0]]);   // only consecutive repeats
  assert.deepEqual(dropRepeats([[1, 2]]), [[1, 2]]);
  assert.deepEqual(dropRepeats([]), []);
});
```

### Step 2 — Run it, see it fail

```bash
node --test prototype/tests/world.test.mjs
```

Expected: FAIL — `dropRepeats` is not exported.

### Step 3 — Implement

In `prototype/world.js`, next to `polylineLength` (line ~90):

```js
// #319: a polyline without consecutive repeated points; a zero-length step has no direction, and a ribbon built on one gets NaN vertices
export function dropRepeats(pts) { return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]); }
```

In `prototype/index.html`:

- add `dropRepeats` to the `import { … } from './world.js';` list (line ~363);
- in `ribbonGeo` (line ~884), replace

  ```js
  const pts = onTerrain || hFn ? resample(src, 4) : src;
  ```

  with

  ```js
  const clean = dropRepeats(src), pts = onTerrain || hFn ? resample(clean, 4) : clean;
  ```

`resample` never creates a repeat from a polyline without one (`n >= 1`, steps `k / n` distinct), so cleaning before it is enough.

### Step 4 — Run the node tests

```bash
node --test prototype/tests/world.test.mjs
```

Expected: all pass. Commit: `fix(world): ribbons skip repeated points instead of making NaN vertices (#319)`.

---

## Task 3 — Playwright: a world with a repeated stream point loads clean

**Files:** `prototype/tests/test_world.py`.

### Step 1 — Write the test

Append to `prototype/tests/test_world.py` (reuses `make_world`, `boot`, `needs_ehr`; add a new id constant `NAN_ID = "777788889999"` next to the others):

```python
@needs_ehr
def test_stream_with_a_repeated_point_has_no_nan_water(server, world_host):
    """#319: a stream whose first point repeats (as the build service wrote it for Ehrendingen and Lenzburg) made NaN
    vertices in the water mesh and three.js logged 'Computed radius is NaN'."""
    url, root = world_host
    d = make_world(root, NAN_ID)
    w = json.loads((d / "world.json").read_text("utf-8"))
    w["streams"][0]["pts"] = [w["streams"][0]["pts"][0]] + w["streams"][0]["pts"]
    (d / "world.json").write_text(json.dumps(w), "utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 480, "height": 270})
        logs = []
        page.on("console", lambda m: logs.append(m.text))
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html?worldhost={url}&world={NAN_ID}")
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
        page.wait_for_timeout(3000)                     # a few rendered frames: the bounding sphere is computed on the first frustum test
        assert page.evaluate("() => window.__mm.world.id") == NAN_ID
        assert not [t for t in logs if "Computed radius is NaN" in t]
        b.close()
```

(`boot()` cannot be reused as-is because the console listener must be attached before `goto`.)

### Step 2 — Verify red, then green

Write this test before Task 2's `ribbonGeo` change if you want to see it red; otherwise run it once after. Commit and push first. Then, in the foreground:

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest -q prototype/tests/test_world.py -k repeated_point
```

Expected with Task 2 in place: PASS. (Without the `ribbonGeo` change it fails with the NaN message in `logs` — measured on the live site for the same input shape.) Commit: `test(world): a repeated stream point loads without NaN water (#319)`.

---

## Task 4 — CHANGELOG

**Files:** `CHANGELOG.md`.

Under `## [Unreleased]` → `### Fixed`, newest first, with the timestamp from `TZ=Europe/Zurich date '+%F %H:%M'` at the time of the commit:

```markdown
- `YYYY-MM-DD HH:MM` In some **generated worlds** a **stream** lost its first metres of water and the browser console showed an error; streams now draw in full.
```

Commit: `docs(changelog): stream water fix (#319)`.

---

## Notes

- **Service rebuild:** the pipeline change (Task 1) reaches new worlds only after the build-service image on `ionos1` is rebuilt and redeployed (`service/Dockerfile` copies `pipeline/`). Not part of this issue's implementation; the client guard (Task 2) covers worlds already built, saved, or exported as zips.
- The same 0.1 m rounding exists in `world_boundaries.py:64`, `world_rail.py:17`, `world_forests.py:33`, `world_parking.py:166`; none showed a repeat in the four measured worlds. Out of scope.
