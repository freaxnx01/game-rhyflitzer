# Residential houses in generated worlds (#352) Implementation Plan

**Goal:** generated worlds keep houses within 30 m of residential, living_street, unclassified and service
streets, in addition to the main roads. Hand-made regions stay byte-identical.

**Spec:** `docs/superpowers/specs/2026-10-17-residential-houses-design.md`.

**Global constraints:** python3; pipeline tests run from `pipeline/` (`pytest.ini` has `testpaths = tests`);
memory-heavy commands under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; no new
dependencies; no `package.json`; do not touch `PIPELINE_VERSION`; do not deploy or rebuild live worlds (the
rebuild in Task 5 is a written step for the maintainer, not performed). TDD: failing test first, never edit a
test to turn it green. Do not print tokens; keep homelab IPs out of public files.

## File structure

- Modify `pipeline/world_buildings.py`: `NEAR_GENERATED`, `near_classes` parameter of `build()`.
- Modify `pipeline/osm.py`: `near_classes` keyword on `build_world()`, passed to `world_buildings.build`.
- Modify `pipeline/region.py`: `_world()` passes `near_classes=world_buildings.NEAR_GENERATED`.
- Modify `pipeline/tests/test_buildings.py`, `pipeline/tests/test_region.py`.
- Modify `docs/11-pipeline-osm.md` (Buildings rule, line ~90), `CHANGELOG.md` (`[Unreleased]`),
  `service/README.md` (operator step).

## Task 1: the rule in world_buildings (tests first)

**Files:** `pipeline/tests/test_buildings.py`, `pipeline/world_buildings.py`.

**Interfaces:** `NEAR_GENERATED: set[str]`; `build(areas, roads, clip, house_dist=30.0, big_area=1000.0,
exclude_ids=frozenset(), industrial=(), keep_all=(), addr_nodes=(), keep_ids=frozenset(), near_classes=MAIN)`.
`near_classes` is last, so existing callers are untouched.

- [ ] **Step 1: Write the failing tests.** Append to `pipeline/tests/test_buildings.py` (uses the file's
  existing `house`, `CLIP`, `Area`):

```python
def street(cls, z):
    return {"cls": cls, "pts": [[-500, z], [500, z]]}


def test_default_ignores_residential_streets():
    bl, _ = B.build([house(1, 0, 520)], [street("residential", 500)], CLIP)
    assert bl == []


@pytest.mark.parametrize("cls", ["residential", "living_street", "unclassified", "service"])
def test_generated_rule_keeps_houses_along_a_counted_street(cls):
    bl, stats = B.build([house(1, 0, 520)], [street(cls, 500)], CLIP, near_classes=B.NEAR_GENERATED)
    assert [b["id"] for b in bl] == [1]
    assert stats["kept_near"] == 1


@pytest.mark.parametrize("cls", ["motorway", "motorway_link", "pedestrian", "footway", "path", "steps", "cycleway"])
def test_generated_rule_ignores_uncounted_classes(cls):
    bl, _ = B.build([house(1, 0, 520)], [street(cls, 500)], CLIP, near_classes=B.NEAR_GENERATED)
    assert bl == []


def test_generated_rule_keeps_main_roads_and_still_drops_far_sheds():
    roads = [street("tertiary", 0), street("residential", 500)]
    areas = [house(1, 0, 20), house(2, 0, 540), house(3, 0, 800)]      # 3 is 300 m from every street
    bl, _ = B.build(areas, roads, CLIP, near_classes=B.NEAR_GENERATED)
    assert sorted(b["id"] for b in bl) == [1, 2]


def test_house_set_back_from_the_street_but_on_a_service_lane_is_kept():
    """#352: Hofwiesenstrasse 13 is 38.9 m from the residential street and 3.4 m from a service lane."""
    street_only = [street("residential", 500)]
    with_lane = street_only + [street("service", 535)]
    setback = house(1, 0, 545, d=6)                                    # edge at z 542: 42 m from the street, 7 m from the lane
    assert B.build([setback], with_lane, CLIP, near_classes=B.NEAR_GENERATED)[0][0]["id"] == 1
    assert B.build([setback], street_only, CLIP, near_classes=B.NEAR_GENERATED)[0] == []
```

- [ ] **Step 2: Run, expect failure** (`AttributeError: ... NEAR_GENERATED` and an unexpected keyword):
  `cd pipeline && python3 -m pytest tests/test_buildings.py -q`.

- [ ] **Step 3: Implement.** In `world_buildings.py` after `MAIN`:

```python
# #352: generated worlds have no anchors (no keep-all areas), so a house must be near any street the game draws
NEAR_GENERATED = MAIN | {"residential", "living_street", "unclassified", "service"}
```

  Add `near_classes=MAIN` as the last parameter of `build()` and change the road filter at
  `world_buildings.py:103` to `r["cls"] in near_classes`. Nothing else in `build()` changes.

- [ ] **Step 4: Run `tests/test_buildings.py`, expect pass.**

## Task 2: wiring (tests first)

**Files:** `pipeline/tests/test_region.py`, `pipeline/osm.py`, `pipeline/region.py`.

- [ ] **Step 1: Write the failing tests** in `test_region.py`. Build the synthetic frame the same way the
  `built` fixture at the top of the file does (`synth_osm.write`), with `monkeypatch` wrapping
  `osm.world_buildings.build` so its keyword arguments are recorded. Test A: `region.build_world(...)` records
  `near_classes == world_buildings.NEAR_GENERATED`. Test B: `osm.build_world(...)` called directly with
  `anchors_path=None` and no `near_classes` records `world_buildings.MAIN` (the default must stay main-only;
  the hand-made regions rely on it).

- [ ] **Step 2: Run, expect failure** (`KeyError: 'near_classes'`).

- [ ] **Step 3: Implement.** `osm.build_world(..., clip_box=None, data=None, boundary_items=None,
  near_classes=world_buildings.MAIN)`; pass `near_classes=near_classes` in the `world_buildings.build` call at
  `osm.py:117`; one clause in its docstring. In `region.py` add `import world_buildings` next to
  `import world_boundaries` and pass `near_classes=world_buildings.NEAR_GENERATED` in the `osm.build_world(...)`
  call in `_world()` (`region.py:130`).

- [ ] **Step 4: Run, expect pass.**

## Task 3: whole suite, hand-made regions unchanged

- [ ] **Step 1:** `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest -q`.
  Expect green, including `test_golden.py` and `test_golden_ehrendingen.py` (they skip when the extract is
  missing; the extracts are in `pipeline/cache/osm/` on the agent box). If a golden test changes, the default
  leaked: fix the wiring, never the golden numbers.
- [ ] **Step 2:** `cd service && python3 -m pytest -q` (the service imports `region`).

## Task 4: Dietlikon numbers and frame-rate check (measurements, reported in the PR)

- [ ] **Step 1: Before/after count.** Cut a regional extract from `pipeline/cache/osm/switzerland-latest.osm.pbf`
  under the cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 osmium extract -s simple
  -b 8.60,47.41,8.65,47.44 -o <scratchpad>/diet.osm.pbf <that file>` (8 s, 780 KB). Run `osm_read.read`,
  `world_roads.build` and `world_buildings.build` for both rule sets (the spec's probe used
  `geo.Frame(47.425, 8.625)` and a 2.6 km clip), assert w183644216 is in the new set and report both counts.
  For the real world `47436cbc7385`, build its exact frame (its LV95 rect is in the world's `meta.json`) and
  report 626 -> N.
- [ ] **Step 2: Street coverage.** For Hofwiesenstrasse, Altbachstrasse and Bahnhofstrasse list every building
  with that `addr:street` that is still missing, with its distance to each counted class (report, never
  silently miss).
- [ ] **Step 3: Frame rate on the GPU browser** (`PW_CDP_ENDPOINT` is set in the environment; local session
  only; foreground, never `run_in_background`; one Playwright file, not the full suite). Load the old world
  file and the rebuilt one with the same start and camera; count `requestAnimationFrame` frames over a fixed
  10 s drive; report both fps. If the rebuilt world is more than 20 % slower, apply the spec's fallback (drop
  `service` from `NEAR_GENERATED`, adjust the parametrized test, re-measure) and say so in the PR.
- [ ] Do not commit measurement scripts; delete scratch files and the scratch extract.

## Task 5: docs, changelog, operator step

- [ ] **Step 1:** `docs/11-pipeline-osm.md` Buildings rule (line ~90): hand-made regions keep "within 30 m of a
  main road"; generated worlds also count residential, living_street, unclassified and service streets
  (motorways, footways, paths excluded). Keep the 1,000 m2 rule and the dropped list.
- [ ] **Step 2:** `CHANGELOG.md`, under `## [Unreleased]` -> `### Changed`, player voice, German with real
  umlauts, with the date-time prefix the file uses: `` `2026-10-17 HH:MM` **Eigene Welten** zeigen jetzt auch
  die Häuser an Wohnstrassen, nicht nur an den Hauptstrassen. Die Welten sind dadurch dichter bebaut. ``
- [ ] **Step 3:** `service/README.md`: a short section "Rebuild gallery worlds after a pipeline fix" holding
  the manual step below. Write it, do not run it.

### Manual rebuild step (for the maintainer; the implementer writes it down, never runs it)

Ids, share links and gallery pins stay (`PIPELINE_VERSION` is not bumped). A `ready` world is never rebuilt by
a request (`store.submit` returns it, `store.py:96`), so the rows are re-queued. After the fix is merged and the
`rhyflitzer-api` / `rhyflitzer-worker` images are rebuilt and restarted on the server:

```bash
# 0. back up the SQLite file first (path: Settings.db_path, service/rhyflitzer_api/config.py:59)

# 1. which worlds are pinned (public, no token)
ssh ionos1 "docker exec rhyflitzer-admin python scripts/gallery.py list"

# 2. re-queue each pinned id. The worker rebuilds from the stored frame and publishes with one rename
#    (replaces worlds/<id>, runner.py:100-101); gallery flag and share link survive (REQUEUE logic).
#    The world leaves /api/gallery until its build is ready again (minutes): the list shows ready worlds only.
ssh ionos1 "docker exec -i rhyflitzer-worker python -" <<'PY'
import sqlite3, time
db = sqlite3.connect("<db path from step 0>")
for wid in ("<id1>", "<id2>"):
    db.execute("UPDATE worlds SET state='queued', step=NULL, error=NULL, message=NULL, attempts=0, "
               "not_before=0, created=?, started=NULL, finished=NULL WHERE id=? AND gallery=1", (time.time(), wid))
db.commit()
PY

# 3. watch: docker logs -f rhyflitzer-worker; then check /api/gallery lists them again and open one.
```

Non-gallery worlds are not touched: they keep the old buildings until they expire (30 days unplayed) and are
rebuilt by the next request. Alternative without SQL: open each frame in the region editor and build it again
(same id; needs the human check). Container and file names above follow `service/README.md`; verify them on
the server first.

## Task 6: commit

- [ ] One branch, one PR, Conventional Commits: `feat(pipeline): keep houses along residential streets in
  generated worlds (#352)`. PR body: before/after counts, the street coverage list, fps numbers, the operator
  step. Use `Refs #352` until the maintainer has run the rebuild; the issue closes after that.
