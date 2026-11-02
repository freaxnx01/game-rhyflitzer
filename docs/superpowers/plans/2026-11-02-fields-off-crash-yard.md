# Keep Farm Fields off the Crash-Platz Implementation Plan (#629)

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox syntax.

**Goal:** No farm field overlaps the Crash-Platz in `data/world_hochrhein.json`; the pipeline cuts the yard rectangle (plus 3 m) out of all fields.

**Spec:** `docs/superpowers/specs/2026-11-02-fields-off-crash-yard-design.md`

**Tech Stack:** Python 3 pipeline (shapely 2, pytest). No game code changes.

## Global Constraints

- Memory: every Python command under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ...`. Exit 137 means shrink the job, not raise the cap.
- The rebuild MUST keep `--fields cache/lwb/hochrhein.geojson --dsm-heights cache`; without `--dsm-heights` about 2,800 buildings change (`docs/11-pipeline-osm.md`).
- Only `fields` may change in the world file. If anything else differs, stop, do not commit the world file, and report.
- Commits: Conventional Commits, English, with the session's `Co-Authored-By` line. CHANGELOG entry hand-written, player voice, `## [Unreleased]` -> `### Fixed`, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`.
- No browser test needed (data-only change); do not run the full Playwright suite.

## Review Focus

1. The cut sits in `_cuts` (same path as roads/rail/parking), not as a post-filter.
2. Diff of the world file: only the two overlapping parcels changed.
3. The yard constant matches `crashyard.js` (drift test).

---

### Task 1: yard keep-out in `world_fields.py` (tests first)

**Files:** Modify `pipeline/world_fields.py`, `pipeline/tests/test_fields.py`

- [ ] **Step 1: Failing tests** in `pipeline/tests/test_fields.py` (reuse its `rect`, `lwb`, `CLIP`, `FRAME`, `poly` helpers):
  - `test_build_cuts_keep_out_rectangle`: one LWB cereal parcel `rect(0, 0, 300, 200)`, `keep_out=((100.0, 50.0, 200.0, 100.0),)`; assert every returned field polygon does not intersect `shapely.box(100-2.95, 50-2.95, 200+2.95, 100+2.95)` and total area is less than without keep_out, and that without `keep_out` the result equals the old behaviour (same list as `build(...)` with no argument).
  - `test_yard_constant_matches_crashyard_js`: read `crashyard.js` from the repo root (`Path(__file__).resolve().parents[2] / "crashyard.js"`), regex `x0: *(\d+), z0: *(\d+)` and `length: *(\d+), width: *(\d+)` inside the `CRASH_YARD` object, assert `WFI.CRASH_YARD == (x0, z0, x0 + length, z0 + width)`.
- [ ] **Step 2:** Run `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest tests/test_fields.py -q` (use `./.venv/bin/python` if the venv exists, it lives in the main checkout's `pipeline/.venv`). Expect the two new tests to fail.
- [ ] **Step 3: Implement.** In `world_fields.py` next to the other gaps add:

```python
YARD_GAP = 3.0       # m around the Crash-Platz (#629)
# The Crash-Platz of the Hochrhein world, game metres (x0, z0, x1, z1). Duplicate of CRASH_YARD in crashyard.js
# (x0, z0, x0 + length, z0 + width); tests/test_fields.py fails when the two drift apart.
CRASH_YARD = (590.0, 740.0, 700.0, 784.0)
```

  Change `_cuts(areas, roads, rail)` to `_cuts(areas, roads, rail, keep_out=())` adding `cuts += [shapely.box(*r).buffer(YARD_GAP, join_style="mitre") for r in keep_out]`, and `build(features, areas, roads, rail, clip, frame, keep_out=())` passing it through (`cut = _cuts(areas, roads, rail, keep_out)`). Nothing else in `build` changes.
- [ ] **Step 4:** Re-run the tests, all green. Commit `fix(fields): cut the Crash-Platz out of farm fields (#629)`.

### Task 2: wire it into `osm.py build_world`

**Files:** Modify `pipeline/osm.py`, `pipeline/tests/test_fields.py`

- [ ] **Step 1: Failing test:** extend the existing `test_osm_build_world_wires_fields_geojson_and_sources` pattern (or add a sibling) so that a `build_world` call with `origin == geo.DEFAULT_ORIGIN` and a cereal parcel covering `CRASH_YARD` returns no field intersecting the yard, while the same call with a different origin leaves the parcel uncut. Follow how the existing test builds its synthetic input.
- [ ] **Step 2:** Run it, expect failure.
- [ ] **Step 3:** In `build_world` pass `keep_out=(world_fields.CRASH_YARD,) if tuple(origin) == tuple(geo.DEFAULT_ORIGIN) else ()` to `world_fields.build(...)` (line ~138).
- [ ] **Step 4:** Run `tests/test_fields.py` and the whole `pipeline/tests` suite (`python -m pytest -q`), all green. Commit.

### Task 3: rebuild `data/world_hochrhein.json` and verify

**Files:** Modify `data/world_hochrhein.json`, `CHANGELOG.md`, `docs/11-pipeline-osm.md` (one sentence), `pipeline/tests/test_fields.py`

- [ ] **Step 1: Inputs.** Work in `pipeline/`. Inputs live in the main checkout's gitignored `pipeline/cache/` (`/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache`: `swisssurface3d`, `swissalti3d`, `osm`); symlink or copy what a fresh worktree lacks. The current extract is `cache/osm/hochrhein-south.osm.pbf` (4.8 MB, the #47 south cut; the doc calls it `hochrhein.osm.pbf`, so symlink it under that name or pass it to `--pbf`). The cantonal parcels are not in the cache: run `python fields_ch.py fetch --out cache/lwb/hochrhein.geojson` (about 7 MB, anonymous WFS, not committed). The terrain is the committed `../data/terrain_hochrhein.mmh`.
- [ ] **Step 2: Keep the old file** for the diff: `cp ../data/world_hochrhein.json "$(mktemp -d)/old.json"` (own mktemp dir).
- [ ] **Step 3: Rebuild** (exact command from `docs/11-pipeline-osm.md`):

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python osm.py build \
    --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json \
    --fields cache/lwb/hochrhein.geojson --dsm-heights cache
```

- [ ] **Step 4: Diff check** with a short Python script (not committed): load old and new JSON; assert every top-level key other than `fields` compares equal (`buildings`, `roads`, `props`, `parking`, `forests`, `sources`, counts); list fields present in only one of the two lists (by `json.dumps` of the entry). Expect only the two overlapping cereal parcels (`src` lwb and osm) to be replaced by cut or split parts. If any other key or field differs (for instance because the WFS data changed), STOP, restore the old file with `git checkout data/world_hochrhein.json`, and report what differed.
- [ ] **Step 5: Real-file test.** Add to `tests/test_fields.py` (marked `needs_fields_world`): `test_real_world_fields_keep_off_the_crash_yard` building `shapely.box(*WFI.CRASH_YARD).buffer(WFI.YARD_GAP - 0.05, join_style="mitre")` and asserting no `poly(f)` intersects it. Run the whole `pipeline/tests` suite, green.
- [ ] **Step 6:** CHANGELOG `### Fixed`: player voice, e.g. "No more **field colour** on the **Crash-Platz**: the farm fields now stop a few metres short of the yard." with the Zurich timestamp. One sentence in `docs/11-pipeline-osm.md` farm-fields paragraph: fields also keep 3 m off the Crash-Platz (`world_fields.CRASH_YARD`, mirrored from `crashyard.js`).
- [ ] **Step 7:** Commit `fix(fields): rebuild world without fields on the Crash-Platz (#629)`, push the branch, open a PR with `Closes #629`, PR body states the diff-check result (two parcels changed, nothing else) and the world file size delta.
