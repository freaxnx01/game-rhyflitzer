# Eaves from roof samples only (#34): implementation plan

**Goal:** Bodenackerstrasse 6 (`w171822634`) gets its measured main-roof height, about 25.3 m instead of 22.8 m. The
fix: the eaves percentile ignores ground samples inside a building's outline, so a few courtyard or edge pixels can
no longer pull a roof down. No other measured building is lowered, and none becomes a tower.

**Architecture:** One new pure function, `eaves(vals, ground, min_samples)`, in `pipeline/building_heights.py`. It
returns the 10th percentile of the samples at least `NOT_BUILT` (2 m) over the ground. When those are fewer than half
the samples, or fewer than `min_samples`, it falls back to today's 10th percentile over all samples. `apply()` takes
`lo` from it and keeps `hi` (95th percentile) over all samples. Everything downstream is unchanged: the push-down,
`roof_shape()` (#43), `MIN_H`, `max_h`. Then a guarded local world rebuild.
Spec: `docs/superpowers/specs/2026-10-03-eaves-from-roof-samples-design.md`.

**Root cause (measured, see spec):** w171822634 has 3,060 samples after the shrink. 7.5 % are ground (under 2 m) and
1.6 % are facade edge, so the 10th percentile over all samples is 22.8 m, while the main roof is at 25.4–25.6 m.
Region-wide the fix raises `h` on 180 of 1,693 measured buildings (73 by more than 0.5 m, at most +8.5 m), lowers none,
and the tallest stays 32.5 m.

**Tech:** Python 3.12, numpy, rasterio, pytest (pipeline); the prototype is untouched.

## Global Constraints

- TDD: write the failing test first, watch it fail, implement minimally, watch it pass. Never modify an existing test to
  make it green. The one existing assertion that changes is the golden `h >= 20` in Task 2, which is tightened (made
  stricter) on purpose, as the issue asks. Stop and report after 3 failed attempts.
- Surgical: touch only `pipeline/building_heights.py`, `pipeline/tests/test_building_heights.py`,
  `pipeline/tests/test_golden.py`, `data/world_hochrhein.json` (Task 3, generated, guarded) and `CHANGELOG.md`.
  No prototype change.
- Do not change `SHRINK`, `MIN_H`, `NOT_BUILT`, the 95th percentile, the push-down formula or `roof_shape()`.
- Run anything heavy (golden tests, world build, Playwright) under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never
  `run_in_background`. Exit 137 means the memory cap was hit: stop and report, and do not raise the cap. If
  `systemd-run --user` is unavailable (CI runner), run the same command without the prefix.
- Never hand-edit `data/world_hochrhein.json`. Never commit a world built without `--dsm-heights`.
- Commands:
  - pipeline tests: `cd pipeline && ./.venv/bin/python -m pytest -q`
  - node tests: `node --test prototype/tests/*.test.mjs` (from the repo root)
  - Playwright: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/<file> -q -rs` (slow, foreground)
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Reference #34.
  Branch: `fix/34-eaves-from-roof-samples`. Push the branch **before** long verification runs.

## Review Focus

- `hi` must stay the 95th percentile over **all** samples. Filtering it too would change `rh` on about 1,065
  buildings by rounding noise.
- The `NOT_BUILT` check stays on `hi` and runs **before** `eaves()`, exactly as today.
- The fallback must return the same value as today's `np.percentile(vals, [10, 95])[0]`, so the 1,513 unaffected
  buildings stay byte-identical. Task 3's guard checks this.

---

### Task 0: Preconditions

- [ ] Confirm #43 is on `main`: `grep -n "def roof_shape" pipeline/building_heights.py` prints a line. If it doesn't,
  stop. This plan builds on #43's `apply()`.
- [ ] `git switch -c fix/34-eaves-from-roof-samples origin/main`

---

### Task 1: `eaves()`, and `apply()` reads the eaves from roof samples (TDD)

**Files:**
- Modify: `pipeline/building_heights.py`
- Modify: `pipeline/tests/test_building_heights.py` (append only)

**Interfaces:**

```python
ROOF_MAJORITY = 0.5
def eaves(vals: np.ndarray, ground: float, min_samples: int = 8) -> float
```

- [ ] **Step 1: Write the failing tests.** Append to `pipeline/tests/test_building_heights.py`:

```python
@pytest.fixture
def notched(tmp_path):
    """#34: outlines that take in open ground next to the roof (Bodenackerstrasse 6: 7.5 % of its samples are ground).
    North (z = 30): a 25 m flat roof whose outline has a 3.5 m strip of ground at its east end (15 % of the samples).
    South (z = -30): mostly ground, roof over the west 5 m only."""
    E0, N0 = round(FRAME.e0) - 100, round(FRAME.n0) + 100
    dtm = np.full((100, 100), 300.0)
    dsm = np.full((400, 400), 300.0)
    for r in range(400):
        for c in range(400):
            x, z = E0 + (c + 0.5) * 0.5 - FRAME.e0, FRAME.n0 - (N0 - (r + 0.5) * 0.5)
            if abs(x) <= 10 and abs(z - 30) <= 5 and x <= 6.5:
                dsm[r, c] = 325.0
            if abs(x) <= 10 and abs(z + 30) <= 5 and x <= -5.0:
                dsm[r, c] = 325.0
    return [tif(tmp_path / "dsm.tif", E0, N0, dsm, 0.5)], [tif(tmp_path / "dtm.tif", E0, N0, dtm, 2.0)]


def test_eaves_ignores_ground_inside_the_footprint():
    """#34: the eaves are the 10th percentile of the roof samples (>= NOT_BUILT over the ground); a lower wing still
    counts; a footprint that is mostly not roof keeps the old statistic over all samples."""
    assert BH.eaves(np.array([300.0] * 15 + [325.0] * 85), 300.0) == 325.0          # 15 % ground: ignored
    assert BH.eaves(np.array([302.0] * 15 + [325.0] * 85), 300.0) == 302.0          # a 2 m annex is roof
    assert BH.eaves(np.array([300.0] * 60 + [325.0] * 40), 300.0) == 300.0          # mostly ground: old statistic
    few = [300.0] * 3 + [325.0] * 5                                                  # under min_samples roof samples
    assert BH.eaves(np.array(few), 300.0) == pytest.approx(float(np.percentile(few, 10)))


def test_ground_inside_the_outline_does_not_lower_the_eaves(notched):
    """#34, Bodenackerstrasse 6 (22.8 m shipped, main roof 25.5 m): ground inside the outline pulled the 10th
    percentile down. Today the north block comes out h 2.5 and 'gable' (the ground strip reads as a 25 m ridge)."""
    b = [bld(10, 0, 30, 20, 10, "flat"), bld(11, 0, -30, 20, 10, "flat")]
    BH.apply(b, FRAME, *notched)
    assert b[0]["hsrc"] == "dsm" and b[0]["roof"] == "flat", b[0]
    assert b[0]["h"] == pytest.approx(25.0, abs=0.3) and b[0]["rh"] == pytest.approx(0.0, abs=0.3), b[0]
    assert b[1]["hsrc"] == "dsm" and b[1]["h"] == 2.5, b[1]                          # mostly ground: unchanged
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_building_heights.py -q
```

Expected: 2 failed. `test_eaves_ignores_ground_inside_the_footprint` fails with
`AttributeError: module 'building_heights' has no attribute 'eaves'`.
`test_ground_inside_the_outline_does_not_lower_the_eaves` fails with
`AssertionError: {'id': 10, 'h': 2.5, 'roof': 'gable', ...}`. The six existing tests pass.

- [ ] **Step 3: Implement.** In `pipeline/building_heights.py`, below `GABLE_MAX_AREA`:

```python
ROOF_MAJORITY = 0.5       # share of the footprint samples that must be roof for the eaves to come from roof samples only (#34)
```

Below `roof_shape()`:

```python
def eaves(vals, ground, min_samples=8):
    """Eaves level: the 10th percentile of the roof samples, those at least NOT_BUILT over the ground (#34). Ground inside
    the outline (a courtyard, a ramp, an outline that misses the roof) pulled the percentile over all samples down:
    Bodenackerstrasse 6 has 7.5 % ground samples and came out 22.8 m instead of 25.3 m. A lower wing at least NOT_BUILT
    high still counts. When the roof samples are not the majority, the outline is mostly not roof and the old statistic
    over all samples stays."""
    roof = vals[vals - ground >= NOT_BUILT]
    if len(roof) < min_samples or len(roof) < ROOF_MAJORITY * len(vals):
        return float(np.percentile(vals, 10))
    return float(np.percentile(roof, 10))
```

In `apply()`, replace

```python
            lo, hi = (float(v) for v in np.percentile(vals, [10, 95]))
            if hi - ground < NOT_BUILT:
                stats["not_built"] += 1
                continue
```

with

```python
            hi = float(np.percentile(vals, 95))
            if hi - ground < NOT_BUILT:
                stats["not_built"] += 1
                continue
            lo = eaves(vals, ground, min_samples)
```

In the module docstring, change "the eaves height `h` is the low edge of the roof (10th percentile)" to "the eaves
height `h` is the low edge of the roof (10th percentile of the samples at least 2 m over the ground, #34)".

- [ ] **Step 4: Run and watch them pass**

```bash
cd pipeline && ./.venv/bin/python -m pytest tests/test_building_heights.py -q
cd pipeline && ./.venv/bin/python -m pytest -q
```

Expected: 8 passed in the file; the whole pipeline suite green (golden tests skip without the caches).

- [ ] **Step 5: Commit**

```bash
git add pipeline/building_heights.py pipeline/tests/test_building_heights.py
git commit -m "fix(pipeline): eaves from roof samples only, ground inside the outline ignored (#34)"
git push -u origin fix/34-eaves-from-roof-samples
```

---

### Task 2: Golden test pins Bodenackerstrasse 6 (real data)

**Files:**
- Modify: `pipeline/tests/test_golden.py`

The golden file needs `pipeline/cache/osm/hochrhein.osm.pbf` and the swisstopo tiles. On a CI runner without them it
skips. That is expected; say so in the PR.

- [ ] **Step 1: Tighten the test.** In `test_bodenacker_quarter_heights`, replace

```python
    assert tall.get("hsrc") == "dsm" and tall["h"] >= 20, tall["h"]
```

with

```python
    # #34: the main roof is at 25.4-25.6 m over the ground (rooftop plant to 27.8 m); ground inside the outline pulled the
    # old 10th percentile down to 22.8 m
    assert tall.get("hsrc") == "dsm" and tall["roof"] == "flat" and 24.5 <= tall["h"] <= 26.5, (tall["h"], tall["roof"])
```

and update its docstring's first sentence to: "Playtest 2026-10-02 / #34: Bodenackerstrasse 6 (w171822634) has
8 storeys, main roof about 25.5 m over the ground, and is the tallest building in Sisseln;".

Append a new test below it:

```python
def test_bodenacker_6_is_the_tallest_in_sisseln(world_dsm):
    """#34: no building inside Sisseln's boundary is taller than Bodenackerstrasse 6, and the eaves fix pushes nothing
    region-wide above the tallest measured building (32.5 m, w155170807)."""
    from shapely.ops import polygonize, unary_union
    lines = [shapely.LineString(b["pts"]) for b in world_dsm["boundaries"] if "Sisseln" in b["names"]]
    sisseln = max(polygonize(unary_union(lines)), key=lambda p: p.area)
    by_id = {b["id"]: b for b in world_dsm["buildings"]}
    tall = by_id[171822634]
    inside = [b for b in world_dsm["buildings"] if sisseln.contains(shapely.Point(b["rect"][0], b["rect"][1]))]
    assert len(inside) > 100 and tall in inside
    taller = [(b["id"], b["h"]) for b in inside if b is not tall and b["h"] >= tall["h"]]
    assert not taller, taller
    assert max(b["h"] for b in world_dsm["buildings"] if b.get("hsrc") == "dsm") <= 32.5
```

- [ ] **Step 2: Watch the tightened test fail without Task 1** (only where the caches exist):

```bash
git show origin/main:pipeline/building_heights.py > pipeline/building_heights.py
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs -k bodenacker
```

Expected: `test_bodenacker_quarter_heights` FAILS with `(22.8, 'flat')`. Then restore Task 1's code (the uncommitted
test edit is untouched):

```bash
git checkout HEAD -- pipeline/building_heights.py
```

If the caches are missing, the run prints `SKIPPED`. Skip this red check and say so in the PR.

- [ ] **Step 3: Green with Task 1**

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs
```

Expected: all pass (`h` 25.3 for w171822634), including `test_bodenacker_row_houses_roof_from_the_ridge` (#43) and
`test_building_heights_from_the_surface`. Or everything SKIPPED without the caches.

- [ ] **Step 4: Commit**

```bash
git add pipeline/tests/test_golden.py
git commit -m "test(pipeline): golden test pins Bodenackerstrasse 6 at its measured roof (#34)"
git push
```

---

### Task 3: Rebuild the world file (with measured heights), guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

The branch is already pushed, so the work is safe if this task stops.

- [ ] **Step 1: Cache check, and STOP if it fails.**

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`, skip to Task 4. Do not run the build, do not touch or commit `data/world_hochrhein.json`, do not
let the build download tiles. State in the PR description: "World not rebuilt: pipeline caches missing on this
machine. Run Task 3 of docs/superpowers/plans/2026-10-03-eaves-from-roof-samples.md locally. Until then the game still
shows Bodenackerstrasse 6 at 22.8 m."

- [ ] **Step 2: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {...}` with `'dsm': 1693` (or the same count as before).

- [ ] **Step 3: Guard. The world may differ from `main` only in `h`/`rh`/`roof` of measured buildings, all upward:**

```bash
git fetch origin main
git show origin/main:data/world_hochrhein.json > /tmp/world_main_34.json
./pipeline/.venv/bin/python - <<'EOF'
import json
a = json.load(open("/tmp/world_main_34.json", encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
ob = {x["id"]: x for x in a.pop("buildings")}; nb = {x["id"]: x for x in b.pop("buildings")}
assert a == b, ["non-building keys differ:", [k for k in set(a) | set(b) if a.get(k) != b.get(k)]]
assert set(ob) == set(nb), ("added", set(nb) - set(ob), "dropped", set(ob) - set(nb))
bad, up, flips = [], [], []
for i, o in ob.items():
    n = nb[i]
    if o == n: continue
    keys = {k for k in set(o) | set(n) if o.get(k) != n.get(k)}
    if not keys <= {"h", "rh", "roof"} or o.get("hsrc") != "dsm" or n["h"] < o["h"]:
        bad.append((i, sorted(keys), o.get("h"), n.get("h")))
    if n["h"] > o["h"]: up.append(round(n["h"] - o["h"], 1))
    if n["roof"] != o["roof"]: flips.append((i, o["roof"], n["roof"]))
assert not bad, ("unexpected changes", bad[:10])
assert 150 <= len(up) <= 220 and max(up) <= 9.0, (len(up), max(up))
assert len(flips) <= 10, flips          # measured: 1 gable -> flat, plus up to 7 that now fall in the 0.6-1.5 m band
assert 24.5 <= nb[171822634]["h"] <= 26.5 and nb[171822634]["roof"] == "flat", nb[171822634]
assert max(x["h"] for x in nb.values() if x.get("hsrc") == "dsm") <= 32.5
print(f"guard ok: {len(up)} buildings raised (max +{max(up)} m), roof flips {flips}, Bodenackerstrasse 6 h {nb[171822634]['h']}")
EOF
```

Expected: `guard ok: 180 buildings raised (max +8.5 m), roof flips [...1 to 8 entries...], Bodenackerstrasse 6 h 25.3`.

If the guard fails: **STOP**, run `git checkout -- data/world_hochrhein.json`, and report the differing keys. They may
come from other issues that changed the pipeline without rebuilding `main`'s world file. If so, say so in the PR and
leave the rebuild to the maintainer.

- [ ] **Step 4: Commit**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with eaves from roof samples (#34)"
git push
```

---

### Task 4: Changelog, full verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Fixed`, create the subsection if it is missing, and add a player-facing
  line:

```markdown
- Bodenackerstrasse 6 in Sisseln stands at its real height again (about 25 m to the roof instead of 22.8 m), and about 70 other houses whose outline took in a bit of courtyard or pavement no longer come out too low.
```

- [ ] **Step 2: Full verification** (foreground):

```bash
cd pipeline && ./.venv/bin/python -m pytest -q
node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py ../prototype/tests/test_street_labels.py ../prototype/tests/test_row_houses.py ../prototype/tests/test_smoke.py -q -rs
```

Expected: all green. The Playwright files read Bodenackerstrasse 6's expected height text from the world file
(`test_debug.py:27`), so they follow the rebuild.

- [ ] **Step 3: Commit and open the PR**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): Bodenackerstrasse 6 at its measured height (#34)"
git push
```

PR title: `fix(pipeline): eaves from roof samples only (#34)`. In the body, give the guard output from Task 3 (or
"world not rebuilt: caches missing"). Also note that the row houses 4a–4f stay at 6.2 m: their shortfall is the ground
reference (terrain falls about 1.5 m under them), which is out of scope here (spec, *Out of scope*).
