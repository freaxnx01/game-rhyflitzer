# Food truck to the Hauptstrasse in Eiken (#205) — implementation plan

**Goal:** the Güggeli truck stands at 47.5302471 N, 7.9924156 E on the Hauptstrasse in Eiken, in a rebuilt world.
**Spec:** `docs/superpowers/specs/2026-10-10-food-truck-hauptstrasse-design.md`.
**LOCAL ONLY, BLOCKED BY #47.** Needs the main checkout's `pipeline/cache/` (OSM + swisstopo tiles) and a world rebuild: it cannot be dispatched to the pipeline runner. Do **not** add `ai-implement`. Implement on agent-dev after #47 is merged.

## Global constraints

- Memory: every world build runs as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`. Exit 137: stop and report, do not raise the cap.
- Never hand-edit `data/world_hochrhein.json` or `data/terrain_hochrhein.mmh`; they are rebuilt by `pipeline/osm.py`.
- Never run `osm.py cut` / `osmium extract` here.
- In `prototype/index.html` never write a `//` comment in the middle of a one-line statement (this plan does not touch that file).
- Playwright in the foreground, `timeout` 600 s, only the suites named below.
- Worktree: symlink the caches: `ln -s /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/cache pipeline/cache` and the same for `pipeline/.venv`.
- Branch `fix/205-food-truck-hauptstrasse`; PR title `fix(world): move the Güggeli food truck to its real spot on the Hauptstrasse (#205)`, body `Closes #205`.

### Task 1: Precondition (#47 is in)

- [ ] **Step 1:** `git fetch origin && git log origin/main --oneline | grep -i "region south\|#47"` must show the #47 merge, and:

```bash
python3 -c "import json;b=json.load(open('data/world_hochrhein.json'))['bbox'];print(b);assert b[1] <= 47.5302, 'world does not reach the spot yet'"
```

If it asserts, STOP: report "blocked by #47". Do nothing else.

### Task 2: Failing tests for the new spot

**Files:** modify `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`.

- [ ] **Step 1:** in `test_anchors.py` find `def test_repo_anchors_place_the_food_truck_on_the_bahnhof_eiken_car_park():`. Rename it `test_repo_anchors_place_the_food_truck_on_the_hauptstrasse` and replace its second and third lines (starting `t = spec["landmarks"]["foodTruck"]` and `assert t["game"] == [1758.5, 1986.5] ...`) with:

```python
    t = spec["landmarks"]["foodTruck"]
    assert t["lonlat"] == [7.9924156, 47.5302471] and t["kind"] == "foodTruck" and "game" not in t
```

(If Task 3 moves the van to the verge, the exact-equality line becomes `abs(...) < 1e-4` per coordinate; see Task 3 Step 3.) Keep the earlier `test_game_landmark_passes_kind_and_heading_through` untouched: it uses its own spec.

- [ ] **Step 2:** in `test_golden.py` find `def test_issue103_food_truck_anchor_stands_on_the_bahnhof_eiken_car_park(world):`. Read what fixture #47 added for the **full** (south-extended) box: `grep -n "world_south\|DEFAULT_BBOX\|CORE_BBOX" pipeline/tests/test_golden.py`. The `world` fixture is the core-box one after #47, so the truck is not in it; switch this test to the south fixture, rename it `test_issue205_food_truck_stands_off_the_road_on_the_hauptstrasse`, and replace its body with:

```python
    t = world_south["anchors"]["landmarks"]["foodTruck"]
    assert t["kind"] == "foodTruck"
    assert abs(t["x"] - 1921.6) < 10 and abs(t["z"] - 2249.8) < 10, t     # the pin, at most the 8 m verge move
    c, s = math.cos(t["rot"]), math.sin(t["rot"])
    rect = shapely.Polygon([(t["x"] + ox * c - oz * s, t["z"] + ox * s + oz * c) for ox, oz in [(-3.55, -1.2), (3.55, -1.2), (3.55, 1.2), (-3.55, 1.2)]])
    assert not any(shapely.Polygon(b["ring"]).intersects(rect) for b in world_south["buildings"]), "the truck stands on no building"
    for r in world_south["roads"]:
        if r["bridge"]:
            continue
        assert shapely.LineString(r["pts"]).distance(rect) >= r["w"] / 2 - 0.2, ("the van blocks the road", r["n"])
```

Use the fixture's real name instead of `world_south` and add `import math` at the top of the file if missing. Remove nothing else.

- [ ] **Step 3:** run, expect FAIL (the anchor is still the car park): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_anchors.py tests/test_golden.py -q -k "food_truck"`.

### Task 3: Move the anchor and find its heading

**Files:** modify `pipeline/anchors.json`.

- [ ] **Step 1:** replace the whole `"foodTruck": {...},` line with (heading placeholder 0 for now):

```json
    "foodTruck":        { "lonlat": [7.9924156, 47.5302471], "kind": "foodTruck", "heading_deg": 0, "src": "Güggeli food truck (#103, moved #205): the real spot on the Hauptstrasse in Eiken, 47.5302471 N 7.9924156 E (playtest 2026-10-10, Google Maps pin); heading_deg parallel to the road, hatch towards it" },
```

- [ ] **Step 2: rebuild the world** with the exact `osm.py build` command (same arguments, the cut `hochrhein.osm.pbf` that #47 produced) from `docs/11-pipeline-osm.md` ("the build" block, around the `systemd-run ... osm.py build` line), capped as in Global constraints. Expect the new `data/world_hochrhein.json`; `git diff --stat` shows it changed only in `anchors.landmarks.foodTruck` (x, z) plus nothing else. Any other diff: stop and report.

- [ ] **Step 3: heading probe** (save outside the repo, `/tmp/truck_probe.py`, run from the repo root):

```python
import json, math
w = json.load(open('data/world_hochrhein.json')); t = w['anchors']['landmarks']['foodTruck']
best = None
for r in w['roads']:
    if r['bridge']: continue
    for (ax, az), (bx, bz) in zip(r['pts'], r['pts'][1:]):
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1
        u = max(0, min(1, ((t['x'] - ax) * dx + (t['z'] - az) * dz) / L2)); px, pz = ax + u * dx, az + u * dz
        d = math.hypot(t['x'] - px, t['z'] - pz)
        if best is None or d < best[0]: best = (d, r['n'], r['w'], math.degrees(math.atan2(dz, dx)) % 180, px, pz)
d, name, width, ang, px, pz = best
print('nearest road', name, 'width', width, 'distance', round(d, 1), 'tangent deg', round(ang, 1))
for h in (ang, ang + 180):                      # hatch side = (sin rot, -cos rot): pick the heading whose hatch faces the road
    hx, hz = math.sin(math.radians(h)), -math.cos(math.radians(h))
    print('heading', round(h % 360, 1), 'hatch faces road:', hx * (px - t['x']) + hz * (pz - t['z']) > 0)
print('half width + 1 =', width / 2 + 1, 'truck centre must be at least', width / 2 + 1 + 1.2, 'from the centre line')
```

Set `heading_deg` in `anchors.json` to the printed heading whose hatch faces the road (one decimal). If `distance` is below the printed minimum, move the pin along the perpendicular away from the road by just enough (at most 8 m), put the moved `lonlat` (computed with `frame.to_game` inverse, or edit `game: [x, z]` instead of `lonlat` and say so in `src`) and note it in `src`. More than 8 m needed: STOP and ask the maintainer.

- [ ] **Step 4:** rebuild once more (Step 2 command) and run the tests:

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests -q
```

Expected: all green including the two edited tests. Then, from the repo root, the browser suites that read the anchor:

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_food_truck.py prototype/tests/test_jump.py -q -k "truck or gugg or food"
```

Expected: pass (they read the anchor from the world file). `test_truck_stops_the_car` drives from 25 m west of the truck: if it fails because a building or road now stands in that run-up, report the numbers instead of loosening the test.

### Task 4: Copy and changelog

**Files:** modify `prototype/landmarks.js`, `CHANGELOG.md`, `test-todo.md` (only if it names the car park).

- [ ] **Step 1:** in `prototype/landmarks.js` find the line `{ name: 'Güggeli-Foodtruck', gemeinde: 'Eiken', anchor: 'foodTruck' },` and replace its trailing comment `// Bahnhof Eiken car park, a first guess (#103); the position lives in pipeline/anchors.json` with `// on the Hauptstrasse (#205); the position lives in pipeline/anchors.json`. The comment is already a trailing one: leave the code before it unchanged.
- [ ] **Step 2:** `CHANGELOG.md` `[Unreleased]` → `### Changed`: `- The Güggeli food truck has moved to its real spot on the Hauptstrasse in Eiken; the map now reaches that far south. **J** → "gugg" still takes you there.`
- [ ] **Step 3:** `grep -n -i "car park\|Bahnhof Eiken" test-todo.md` and fix any line about the truck's old position. `node --test prototype/tests/*.test.mjs` stays green (`landmarks.test.mjs` uses its own synthetic anchors). Commit, push, open the PR.
