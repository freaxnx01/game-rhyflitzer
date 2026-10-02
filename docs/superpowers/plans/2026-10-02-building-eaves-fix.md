# Building heights: keep unbuilt footprints, no eaves push-down (#17) — Implementation Plan

**Goal (revised: A only, B dropped):** Measured building heights (#17) ship again without breaking the Winkel / Bodenackerstrasse quarter. Playtest 2026-10-02 found two defects in `pipeline/building_heights.py`:

- **A — footprints missing from the 2020 surface:** OSM way `1326045746` (apartments, 17×15 m, ~51 m from the Hallenbad) shows bare ground in swissSURFACE3D (95th percentile ≈ 0.3 m above ground). Today it is "measured" and clamped to `MIN_H` = 2.5 m. It must keep its OSM/default height (12 m for `building=apartments`) and get no `hsrc`.
- **B — eaves push-down on pitched roofs:** for `roof == "gable"`, `apply` lowers the 10th percentile by `(hi - lo) * SHRINK / (half - SHRINK)`. In the quarter that drove 31 of 123 buildings onto the 2.5 m floor, for example `171822811`: raw 10th percentile 3.4 m and top 8.1 m become 2.5 m walls. Remove the push-down: eaves = 10th percentile of the shrunk footprint.

What must keep working: Bodenackerstrasse 6 = OSM way `171822634` really is 8 storeys (confirmed by the user). It measures ~22.8 m eaves today and must still measure ≥ 20 m.

**Architecture:** both changes are in `building_heights.apply`. A: after computing `hi`, skip the building (stat `not_built`, height untouched) when `hi - ground < NOT_BUILT` with `NOT_BUILT = 2.0` m. B: delete the push-down lines. Then rebuild `data/world_hochrhein.json` with `--dsm-heights` and update the CHANGELOG and docs.

**Tech:** Python 3, numpy, rasterio, shapely, pytest. The venv is the main checkout's: `../../pipeline/.venv/bin/python`.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Work only in `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/.worktrees/eaves`. `pipeline/cache` and `cache` are **symlinks** to the main checkout's tile and OSM caches. **Never** `git add` them: stage explicit paths only, never `git add -A`, `git add .` or `commit -a`.
- Run everything that reads tiles or builds the world under a memory cap and in the foreground:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. It exits with 137 on the cap, and then you report back rather than raise the cap.
- Never modify an existing test to make it green. If a test still fails after 3 attempts, stop and report.
- Commits: Conventional Commits, scope `pipeline` or `world`, reference `#17`. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01Cfh7jtRP4D26zn3MjviWmV`.
- Don't push or open a PR.

## Task 1 — A: footprints without a building in the surface keep their height

**Files:** `pipeline/building_heights.py`, `pipeline/tests/test_building_heights.py`.

1. **Failing test** `test_footprint_without_a_building_keeps_its_height`: use the existing `tiles` fixture and a footprint over bare ground (anywhere inside the tile away from the two roofs, e.g. `bld(5, 0, 60, 15, 12, "flat", h=12.0)`). Expect `h == 12.0`, `"hsrc" not in b`, `"rh" not in b`, and `stats["not_built"] == 1`. Run it and expect FAIL (today it is clamped to 2.5 and marked dsm).
2. **Implement:** `NOT_BUILT = 2.0` next to `MIN_H`, with a short comment (a footprint whose roof top is under 2 m was not built when the surface was flown, 2020). In `apply`, after `lo, hi`, add `if hi - ground < NOT_BUILT: stats["not_built"] += 1; continue`. Update the module docstring with one sentence about it.
3. Run `pipeline/tests/test_building_heights.py`: all green, the existing tests unchanged.
4. Commit: `fix(pipeline): footprints the 2020 surface doesn't show keep their height (#17)`.

## Task 2 — B: dropped

Removing the push-down breaks the correct ideal-gable test (`test_flat_and_gable_heights_from_the_surface`: h 6.9, rh 2.1 instead of 6.0 / 3.2): the push-down is right for a planar roof, and a 1.5-storey house can really have eaves near 2.5 m. The playtest complaint was about landmarks (Bodenackerstrasse 6 measures correctly; `1326045746` is fixed by A), so B is not changed.

## Task 3 — regression on the real quarter (golden)

**Files:** `pipeline/tests/test_golden.py`.

1. **Test** `test_bodenacker_quarter_heights(world_dsm)` (uses the existing `world_dsm` fixture, which skips without tiles):
   - `171822634` (Bodenackerstrasse 6, 8 storeys): `hsrc == "dsm"` and `h >= 20`.
   - `1326045746` (not in the 2020 surface): no `hsrc`, `h == 12.0`.
   Task 1 already landed, so this is a regression guard: run it on the current code (passes), then confirm it would have caught the bug by temporarily reverting only the `not_built` lines in the working tree, running it (FAIL expected on `1326045746`), and restoring them with `git checkout -- pipeline/building_heights.py`. Don't commit the temporary revert.
2. Run the full `pipeline` suite with the memory cap: `cd pipeline && systemd-run … ../../../pipeline/.venv/bin/python -m pytest -q` (adjust the relative venv path). Golden tests run here because the caches are symlinked. All green.
3. Commit: `test(pipeline): Bodenackerstrasse quarter keeps its landmarks (#17)`.

## Task 4 — rebuild the world with measured heights

1. From `pipeline/`, under the memory cap:
   `python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache`
2. **Guard:** with a short Python check, confirm the new `data/world_hochrhein.json` equals `git show HEAD:data/world_hochrhein.json` in everything except the buildings' `h`, `rh`, `hsrc` and `params.built`. Stop and report if anything else differs.
3. Report numbers: buildings measured, `not_built` count, median eaves overall, and for the 123 buildings around Bodenackerstrasse the median eaves and the count at the 2.5 m floor. Also report the heights of `171822634`, `1326045746`, `171822805` and `171822811`.
4. Run the browser smoke tests that load the OSM world: `python -m pytest -q ../prototype/tests/test_smoke.py -k "osm_layout or hand_traced"` (foreground, timeout 600000).
5. **CHANGELOG.md** under `[Unreleased]` → `### Added`, in player voice, one line, e.g. "Houses on the Swiss side now have their real height, measured from swisstopo's surface model — Bodenackerstrasse 6 stands its eight storeys tall, bungalows stay low."
6. **docs/11-pipeline-osm.md** (the "Building heights (#17)" paragraph): keep the eaves rule, add the `not_built` rule, and update the real-extract numbers.
7. Commit the explicit paths `data/world_hochrhein.json CHANGELOG.md docs/11-pipeline-osm.md` plus this plan file `docs/superpowers/plans/2026-10-02-building-eaves-fix.md`: `feat(world): measured building heights again, Bodenacker quarter intact (#17)`.
