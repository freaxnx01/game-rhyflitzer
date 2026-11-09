# Public buildings always in the world file (#761, #716): implementation plan

**Goal:** stations, churches, chapels, schools and other public buildings are kept in the world file wherever they stand, so the
Bahnhof Frick (w164951714) shows; buildings the game already draws by hand or as a landmark stay excluded.

**Spec:** [docs/superpowers/specs/2026-11-08-public-buildings-kept-design.md](../specs/2026-11-08-public-buildings-kept-design.md)

**Global constraints:**
- Python in `pipeline/`, TDD, tests via `cd pipeline && python -m pytest`. No game code change, no Playwright.
- Never hand-edit `data/world_*.json`; regenerate it with the pipeline.
- Memory-heavy pbf work (the rebuild in Task 3) runs under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Commit and push after each task.
- CHANGELOG under `[Unreleased]`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, blank line between entries.

### Task 1: keep PUBLIC-typed buildings in world_buildings.build

**Files:** `pipeline/world_buildings.py`, `pipeline/tests/test_buildings.py`

- [ ] **Write the failing tests** (append to `pipeline/tests/test_buildings.py`; `house`, `MAIN`, `CLIP`, `Area`, `shapely` exist
  at the top of the file):

```python
def test_public_buildings_are_kept_far_from_main_roads():
    """#761: the Bahnhof Frick (375 m from a main road, 281 m2) and #716 the Reformierte Kirche Stein were dropped."""
    far = [house(1, 0, 400, tags={"building": "train_station"}),
           house(2, 0, 450, tags={"building": "church"}),
           house(3, 0, 500, tags={"building": "school"}),
           house(4, 0, 550),                                                                     # ordinary house: dropped
           house(5, 0, 600, tags={"building": "chapel"}),                                        # public but excluded
           Area(6, True, {"building": "civic"}, shapely.box(0, 700, 3, 703)),                    # 9 m2 < 20
           house(7, 0, 1500, tags={"building": "public"})]                                       # outside the clip
    bl, stats = B.build(far, MAIN, CLIP, exclude_ids={5})
    assert [b["id"] for b in bl] == [1, 2, 3]
    assert stats["kept_public"] == 3
    assert stats["excluded_landmark"] == 1


@pytest.mark.parametrize("kind", sorted(B.PUBLIC))
def test_every_public_type_is_kept(kind):
    bl, _ = B.build([house(1, 0, 400, tags={"building": kind})], MAIN, CLIP)
    assert [b["id"] for b in bl] == [1]


def test_public_set_is_the_agreed_one():
    assert B.PUBLIC == {"train_station", "church", "chapel", "public", "civic", "government", "school", "kindergarten",
                        "transportation"}


def test_near_public_building_counts_as_near():
    bl, stats = B.build([house(1, 0, 20, tags={"building": "church"})], MAIN, CLIP)
    assert [b["id"] for b in bl] == [1]
    assert stats.get("kept_near") == 1 and "kept_public" not in stats
```

- [ ] `cd pipeline && python -m pytest tests/test_buildings.py -q`: the new tests fail (`B.PUBLIC` missing).
- [ ] **Implement** in `pipeline/world_buildings.py`:
  - after `SKIP`:

```python
PUBLIC = {"train_station", "church", "chapel", "public", "civic", "government", "school", "kindergarten", "transportation"}   # #761: kept wherever they stand
```

  - in `build()`, replace the `listed = …` line and the keep test with:

```python
        listed = not near and not in_quarter and a.id in keep_ids     # named landmark kept by id (#46)
        public = not near and not in_quarter and not listed and t["building"] in PUBLIC   # #761: stations, churches, schools …
        if not near and not in_quarter and not listed and not public and (big_area <= 0 or p.area < big_area):
            continue
```

  - and the stats line:

```python
        stats["kept_near" if near else "kept_area" if in_quarter else "kept_landmark" if listed else "kept_public" if public else "kept_big"] += 1
```

  - module docstring: `"""Buildings: OSM footprints along the main roads, all big ones and all public ones (#761), height, roof type, palette."""`
- [ ] `cd pipeline && python -m pytest -q`: all pass (golden tests skip without the extract). Commit
  `feat(pipeline): keep stations, churches and other public buildings wherever they stand (#761)`, push.

### Task 2: exclude the public footprints the game already draws

**Files:** `pipeline/anchors.json`, `pipeline/tests/test_golden.py`, `docs/11-pipeline-osm.md`

The ids were measured on 2026-11-08: every new public footprint within 25 m of a hand-drawn landmark anchor, plus the #715 church.

- [ ] **Write the failing golden test** (append to `pipeline/tests/test_golden.py`; uses the existing `world` fixture, skipped
  without the extract):

```python
def test_public_buildings_drawn_by_hand_stay_out(world):
    """#761: public footprints are kept now, except where the game draws its own model: the Münster's neighbours, the stations of
    Stein and Sisseln, and the Reformierte Kirche Stein (#715 swissBUILDINGS3D landmark with its own collider)."""
    ids = {b["id"] for b in world["buildings"]}
    assert not ids & {162862443, 162862441, 1280041307, 183386655, 88836292}
```

- [ ] If `pipeline/cache/osm/hochrhein.osm.pbf` exists: `cd pipeline && python -m pytest tests/test_golden.py -q` fails on the new
  test (run under the `systemd-run` cap). Without the extract it skips; say so in the PR body.
- [ ] **Implement:** in `pipeline/anchors.json`, append to `exclude_buildings`:
  `"w162862443", "w162862441", "w1280041307", "w183386655", "w88836292"`.
- [ ] `docs/11-pipeline-osm.md`, the **Buildings.** paragraph (around line 101):
  - after "…so Sisslerfeld does not go empty." add: "Public buildings (`building=` `train_station`, `church`, `chapel`, `public`,
    `civic`, `government`, `school`, `kindergarten`, `transportation`) are kept wherever they stand (#761)."
  - extend the `exclude_buildings` list sentence with: "the Münster's two civic neighbours, the station buildings of Stein and
    Sisseln (all drawn by hand) and the Reformierte Kirche Stein (a swissBUILDINGS3D landmark, #715)".
- [ ] `cd pipeline && python -m pytest -q`: all pass. Commit
  `fix(pipeline): keep the public buildings the game draws itself out of the world file (#761)`, push.

### Task 3: rebuild the Hochrhein world

**Files:** `data/world_hochrhein.json`, `tests/world.test.mjs`, `CHANGELOG.md`

- [ ] **Write the failing node test** (append to `tests/world.test.mjs`; `readFileSync` is already imported):

```js
test('world_hochrhein (#761): the Bahnhof Frick is in the world file, the hand-drawn public buildings are not', () => {
  const ids = new Set(JSON.parse(readFileSync(new URL('../data/world_hochrhein.json', import.meta.url), 'utf8')).buildings.map(b => b.id));
  assert.ok(ids.has(164951714), 'Bahnhof Frick w164951714');
  for (const id of [162862443, 162862441, 1280041307, 183386655, 88836292]) assert.equal(ids.has(id), false, `w${id} is drawn by the game`);
});
```

- [ ] `node --test tests/world.test.mjs`: fails (Bahnhof Frick missing).
- [ ] **Rebuild**, from `pipeline/`, with the documented command (`docs/11-pipeline-osm.md` "The build"), keeping `--dsm-heights`:

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf \
    --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json \
    --fields cache/lwb/hochrhein.geojson --dsm-heights cache
```

  (use `python` instead of `./.venv/bin/python` where no venv exists). If the extract, the fields file or the DSM cache is
  missing, **stop**: do not commit a world built without them; say in the PR body which input was missing.
- [ ] **Check the diff** with a short script comparing the old (`git show HEAD:data/world_hochrhein.json`) and the new file:
  - about 88 new buildings, w164951714 among them; every new id has a `PUBLIC` type (check against the pbf is not needed, the
    count is enough)
  - no building that was there before is removed or changed
  - other keys identical except `params.built` and, where it depends on buildings, `parking`
  If more changed, stop and report the difference in the PR body instead of committing.
- [ ] `node --test tests/*.test.mjs` and `cd pipeline && python -m pytest -q`: all pass.
- [ ] CHANGELOG under `[Unreleased]` → `### Fixed`, newest first:
  ``- `<timestamp>` The **Bahnhof Frick** stands again, and with it about 90 other **churches, chapels, stations, schools and town halls** that were missing because they are not on a main road.``
- [ ] Commit `fix(world): rebuild the Hochrhein world with its public buildings (#761)`, push. PR body: `Closes #761`,
  `Closes #716`.
