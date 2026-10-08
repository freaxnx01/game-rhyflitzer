# Stations Beside the Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bahnhof Sisseln and Bahnhof Stein-Säckingen stand beside the tracks at their real OSM place, and their checkpoints follow.

**Architecture:** Data-only fix. `pipeline/anchors.json` gets the new station anchors and checkpoints; the `anchors` block of the committed `data/world_hochrhein.json` is re-baked from it with `anchors.resolve` (no pipeline build, no `.pbf`). A pure-Python test in `pipeline/tests/test_anchors.py` pins the geometry against the committed world. No game code changes: `stationAt()`, `snapRoad` and the J list already read the anchors.

**Tech Stack:** Python 3 (pytest, shapely, pyproj via `pipeline/requirements.txt`), JSON; Playwright for the regression run.

**Spec:** `docs/superpowers/specs/2026-10-08-stations-beside-tracks-design.md` (issue #130).

## Global Constraints

- No pipeline build, no osmium, no `.pbf` in CI: the runner has no pipeline caches. Re-bake the `anchors` block only (Task 3).
- `data/world_hochrhein.json` is written exactly as `osm.py:146` does: `json.dumps(world, ensure_ascii=False, separators=(",", ":"))`, no trailing newline. Everything outside `anchors` must stay byte-identical (checked in Task 3).
- Do not touch `prototype/index.html`: the hand-traced fallback (`CPS` at `:561`, stations at `:982`) and the tests that pin (1780, 560) stay as they are.
- Station model size (26 x 8 m) is unchanged.
- Heading convention (`pipeline/anchors.py`): `heading_deg` 0 = +x (east), 90 = +z (south); it becomes `rot = radians(heading_deg)`. The station's platform strip is at local +z `(-sin rot, cos rot)` and must face the track.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the **foreground**, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest …`. Commit and push the branch before long verification.

## Review Focus

1. **Platform side.** Expected: the platform strip lies between the station and the nearest track, not behind the building. Pinned in Task 1 (`side` dot product).
2. **Only the `anchors` block of the world changed.** Expected: `git diff --stat` shows one file, and the Task 3 check proves the rest is identical to `HEAD`.
3. **Fallback layout untouched.** Expected: `prototype/index.html` is not in the diff.
4. **CPs on a road.** Expected: both station CPs within 2.5 m of a drivable road, so `snapRoad` does not move them again. Pinned in Task 1.

---

### Task 1: Failing geometry tests

**Files:**
- Modify: `pipeline/tests/test_anchors.py` (append; add `json` to the imports)

**Interfaces:**
- Consumes: `data/world_hochrhein.json` (`rail`, `roads`, `anchors`), `pipeline/anchors.json`.
- Produces: tests `test_station_stands_beside_the_track_facing_it[stationSisseln|stationStein]`, `test_world_anchors_are_baked_from_the_spec`, `test_station_checkpoints_are_at_the_station_on_a_road`.

- [ ] **Step 1: Write the failing tests.** Add `import json` at the top of `pipeline/tests/test_anchors.py` (next to `import math`), then append:

```python
ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
SPEC = ROOT / "pipeline" / "anchors.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="data/world_hochrhein.json not present")
STATIONS = ("stationSisseln", "stationStein")
STATION_CPS = {"Bahnhof Sisseln": "stationSisseln", "Bahnhof Stein-Säckingen": "stationStein"}


def _world():
    return json.loads(WORLD.read_text(encoding="utf-8"))


def _nearest_on_polylines(lines, x, z):
    """(distance, qx, qz, segment angle) of the closest point on any of the polylines."""
    best = None
    for line in lines:
        for (ax, az), (bx, bz) in zip(line, line[1:]):
            dx, dz = bx - ax, bz - az
            length2 = dx * dx + dz * dz
            if not length2:
                continue
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / length2))
            qx, qz = ax + t * dx, az + t * dz
            d = math.hypot(x - qx, z - qz)
            if best is None or d < best[0]:
                best = (d, qx, qz, math.atan2(dz, dx))
    return best


@needs_world
@pytest.mark.parametrize("key", STATIONS)
def test_station_stands_beside_the_track_facing_it(key):
    world = _world()
    lm = world["anchors"]["landmarks"][key]
    d, qx, qz, angle = _nearest_on_polylines(world["rail"], lm["x"], lm["z"])
    assert 10.5 <= d <= 14.0, f"{key} is {d:.1f} m from the nearest rail"
    off = (lm["rot"] - angle + math.pi / 2) % math.pi - math.pi / 2          # modulo 180 deg
    assert abs(off) < math.radians(3), f"{key} is {math.degrees(off):.1f} deg off the track direction"
    side = (-math.sin(lm["rot"]), math.cos(lm["rot"]))                        # local +z: the platform strip
    assert (qx - lm["x"]) * side[0] + (qz - lm["z"]) * side[1] > 0, f"{key}: the platform faces away from the track"


@needs_world
def test_world_anchors_are_baked_from_the_spec():
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    baked = _world()["anchors"]
    for key in STATIONS:
        entry, lm = spec["landmarks"][key], baked["landmarks"][key]
        assert (lm["x"], lm["z"]) == tuple(entry["game"]), key
        assert lm["rot"] == pytest.approx(math.radians(entry["heading_deg"])), key
    assert [(c["n"], c["x"], c["z"]) for c in baked["cps"]] == [(c["n"], *c["game"]) for c in spec["cps"]]


@needs_world
def test_station_checkpoints_are_at_the_station_on_a_road():
    world = _world()
    drivable = [r["pts"] for r in world["roads"] if not r["bridge"] and r["cls"] != "motorway"]
    for name, key in STATION_CPS.items():
        cp = next(c for c in world["anchors"]["cps"] if c["n"] == name)
        lm = world["anchors"]["landmarks"][key]
        assert math.hypot(cp["x"] - lm["x"], cp["z"] - lm["z"]) <= 15, name
        assert _nearest_on_polylines(drivable, cp["x"], cp["z"])[0] <= 2.5, name
```

- [ ] **Step 2: Run them, expect FAIL.** `cd pipeline && python -m pytest tests/test_anchors.py -q`. Expected: the two parametrized station tests fail (90.9 m and 35.7 m from the rail), `test_world_anchors_are_baked_from_the_spec` passes (spec and world agree today), the CP test fails (Sisseln CP is 78 m from any road, Stein CP 94 m from its station).

- [ ] **Step 3: Commit.** `git commit -am "test(world): stations stand beside the tracks (#130)"`.

### Task 2: New anchors in `anchors.json`

**Files:**
- Modify: `pipeline/anchors.json` (lines 13, 14, 19, 23)

**Interfaces:**
- Produces: `landmarks.stationStein`, `landmarks.stationSisseln`, and two `cps` entries with the new `game` values; read by Task 3.

- [ ] **Step 1: Replace the two station entries** (keep the key order and alignment):

```json
    "stationStein":     { "game": [-1369.1, 999.7], "kind": "station", "heading_deg": 25.0, "src": "OSM w1280041307 (building=train_station, 34 x 15 m, long side along the track at 25 deg): footprint centre (-1370.2, 1002.0) moved 2.5 m off rail polyline 76 so the nearest track centreline is 11.5 m away (#130)" },
    "stationSisseln":   { "game": [1940.5, 539.0], "kind": "station", "heading_deg": -9.8, "src": "OSM w183386655 (disused building=train_station, Sisslerstrasse 20.1, next to the LANDI at 19.1): footprint centre (1940.7, 540.0) moved 1.0 m off rail polyline 123 so the nearest track centreline is 11.6 m away; heading = track direction, platform side toward the track (#130)" },
```

- [ ] **Step 2: Replace the two station checkpoints:**

```json
    { "n": "Bahnhof Sisseln", "game": [1938.5, 530.4] },
```

```json
    { "n": "Bahnhof Stein-Säckingen", "game": [-1368.2, 988.3] }
```

(The first sits on the service road `w194550666` along the station front, 8.8 m from the anchor; the second on the Bahnhofstrasse vertex shared with `w90686742`, 11.4 m from the anchor. Leave the other three CPs and all other entries alone.)

- [ ] **Step 3: Validate the JSON and run the baked-from-spec test, expect FAIL.** `python3 -c "import json;json.load(open('pipeline/anchors.json',encoding='utf-8'))"` prints nothing; `cd pipeline && python -m pytest tests/test_anchors.py -q` now fails `test_world_anchors_are_baked_from_the_spec` (the world still has the old values). That is the cue for Task 3.

- [ ] **Step 4: Commit.** `git commit -am "fix(world): station anchors and checkpoints at the real stations (#130)"`.

### Task 3: Re-bake the world's `anchors` block

**Files:**
- Modify: `data/world_hochrhein.json` (the `anchors` block only)

**Interfaces:**
- Consumes: `pipeline/anchors.json` via `anchors.resolve`.
- Produces: `world.anchors.landmarks.stationStein/stationSisseln` (`x`, `z`, `rot`) and `world.anchors.cps`.

- [ ] **Step 1: Re-bake.** From the repo root (the `anchors: w… not found in the extract` lines on stderr are expected: the `osm:` landmarks are skipped and not copied):

```bash
python3 - <<'EOF'
import json, sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, "pipeline")
import anchors, geo

spec = anchors.load(Path("pipeline/anchors.json"))
empty = SimpleNamespace(areas=[], ways=[], named_nodes=[])
resolved = anchors.resolve(spec, empty, geo.Frame(*geo.DEFAULT_ORIGIN))
path = Path("data/world_hochrhein.json")
world = json.loads(path.read_text(encoding="utf-8"))
for key in ("stationSisseln", "stationStein"):
    world["anchors"]["landmarks"][key] = resolved["landmarks"][key]
world["anchors"]["cps"] = resolved["cps"]
path.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
EOF
```

- [ ] **Step 2: Prove only `anchors` changed.**

```bash
git diff --stat
git show HEAD:data/world_hochrhein.json > /tmp/world_head.json
python3 - <<'EOF'
import json
old = json.load(open("/tmp/world_head.json", encoding="utf-8")); new = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
a_old, a_new = old.pop("anchors"), new.pop("anchors")
assert old == new, "something outside anchors changed"
assert {k for k in a_old["landmarks"] if a_old["landmarks"][k] != a_new["landmarks"][k]} == {"stationSisseln", "stationStein"}
assert [c["n"] for c in a_old["cps"] if c not in a_new["cps"]] == ["Bahnhof Sisseln", "Bahnhof Stein-Säckingen"]
print("ok")
EOF
```

Expected: one file in the stat, `ok`. If the assertion about `old == new` fails, the writer's formatting differs from `osm.py:146`; stop and fix the dump arguments, do not commit a whole-file diff.

- [ ] **Step 3: Run the tests, expect PASS.** `cd pipeline && python -m pytest tests/test_anchors.py -q` (all green, including the three new tests; the station distances come out at 11.6 m and 11.5 m).

- [ ] **Step 4: Commit and push the branch.** `git commit -am "fix(world): re-bake station anchors and checkpoints (#130)"` then `git push -u origin HEAD`.

### Task 4: Regression run and docs

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` -> `### Fixed`; create the subsection above `### Added` if `[Unreleased]` has none), `test-todo.md` (append a section)

- [ ] **Step 1: Pipeline tests.** `cd pipeline && python -m pytest -q`. Expected: all pass (`test_golden.py` skips without the `.pbf`).

- [ ] **Step 2: Browser regression, foreground and capped.** From the repo root:

```bash
systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_street_labels.py prototype/tests/test_jump.py prototype/tests/test_smoke.py prototype/tests/test_autopilot.py -q
```

Expected: all pass. `test_station_boards_on_the_osm_stations` compares the boards to the new anchors; `test_jump.py` and `test_smoke.py` read the stations from the world. If a test pins a station or CP position from the old value, update that value to the new one; if anything else fails, stop and report.

- [ ] **Step 3: CHANGELOG.** Under `## [Unreleased]` -> `### Fixed` (it exists; add the bullet at the top of that list, create the subsection only if missing):

```markdown
- Bahnhof Sisseln and Bahnhof Stein-Säckingen now stand beside the tracks, where the real stations are, instead of up to 90 m away in a field. The two station checkpoints and the **J** entries moved with them: the Sisseln checkpoint is on the road in front of the station, the Stein one on the Bahnhofstrasse.
```

- [ ] **Step 4: test-todo.md.** Append:

```markdown

## Stations beside the tracks (#130)

- [ ] J -> "Bahnhof Sisseln": the car stands on the road in front of a station building that runs parallel to the tracks, with the platform between building and tracks. The blue "Bahnhof Sisseln" board faces the tracks and the road.
- [ ] J -> "Bahnhof Stein-Säckingen": same check by the Bahnhofstrasse, the station parallel to the tracks.
- [ ] Race: checkpoint 1 (Bahnhof Sisseln) and checkpoint 5 (Bahnhof Stein-Säckingen) sit at the stations and are reachable by road; the autopilot (O) finds them.
- [ ] Driving along the tracks at Sisseln and Stein: the station box does not sit on a rail, and no tree or car park overlaps it.
```

- [ ] **Step 5: Commit, push, open the PR.** `git commit -am "docs: changelog and playtest list for the station fix (#130)"`, `git push`, then `gh pr create --base main --title "fix(world): Bahnhof Sisseln and Stein stand beside the tracks" --body "Closes #130 …"` (Summary, Changes, Testing from Steps 1-2, Checklist).
